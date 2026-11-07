from odoo.exceptions import UserError, ValidationError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestWinnersMeet(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.event = cls.env['otm.wm.event'].create({
            'name': 'Winners Meet 2026', 'state': 'open', 'venue': 'Hall A', 'frontend_url': 'https://w.example.com'})
        cls.sblock = cls.env['otm.wm.seat.block'].create(
            {'event_id': cls.event.id, 'name': 'Gold', 'prefix': 'G', 'start_no': 1, 'end_no': 3})
        cls.tblock = cls.env['otm.wm.seat.block'].create(
            {'event_id': cls.event.id, 'name': 'Teachers', 'prefix': 'T', 'start_no': 1, 'end_no': 2})
        Cat = cls.env['otm.wm.category']
        Item = cls.env['otm.wm.item']
        cls.hat_item = Item.create({'event_id': cls.event.id, 'name': 'Hat', 'quantity': 5})
        cls.shawl = Item.create({'event_id': cls.event.id, 'name': 'Shawl', 'quantity': 2})
        cls.gold = Cat.create({'event_id': cls.event.id, 'name': 'Gold', 'item_ids': [(6, 0, [cls.hat_item.id])],
                               'seat_block_id': cls.sblock.id, 'seat_mode': 'auto'})
        cls.silver = Cat.create({'event_id': cls.event.id, 'name': 'Silver', 'seat_mode': 'manual'})
        cls.teacher = Cat.create({'event_id': cls.event.id, 'name': 'Teacher', 'kind': 'teacher',
                                  'seat_block_id': cls.tblock.id})
        cls.P = cls.env['otm.wm.participant']

    def _reg(self, name, phone, cat, kind='student'):
        return self.P.create({'event_id': self.event.id, 'kind': kind, 'name': name, 'phone': phone,
                              'claimed_category_id': cat.id})

    def test_seats_generated(self):
        self.assertEqual(len(self.sblock.seat_ids), 3)
        self.assertEqual(sorted(self.sblock.seat_ids.mapped('label')), ['G1', 'G2', 'G3'])

    def test_no_winners_list_autoapproves(self):
        p = self._reg('Anu Krishnan', '9876543210', self.gold)
        self.assertEqual(p.approval_state, 'approved')
        self.assertEqual(p.phone, '919876543210')
        self.assertEqual(p.category_id, self.gold)
        self.assertEqual(p.log_ids.message_type, 'confirm')

    def test_matching_and_review(self):
        E = self.env['otm.wm.expected']
        E.create({'event_id': self.event.id, 'name': 'Anu Krishnan', 'phone': '9876500001', 'category_id': self.gold.id})
        E.create({'event_id': self.event.id, 'name': 'Binu Raj', 'phone': '9876500002', 'category_id': self.silver.id})
        ok = self._reg('Anu K', '9876500001', self.gold)                 # initial tolerated
        self.assertEqual((ok.match_status, ok.approval_state), ('matched', 'approved'))
        bad_cat = self._reg('Binu Raj', '9876500002', self.gold)         # claims gold, listed silver
        self.assertEqual((bad_cat.match_status, bad_cat.approval_state), ('category_mismatch', 'pending'))
        self.assertFalse(bad_cat.log_ids)                                 # no WhatsApp until approved
        unknown = self._reg('Random Person', '9876500003', self.gold)
        self.assertEqual((unknown.match_status, unknown.approval_state), ('not_listed', 'pending'))
        bad_cat.action_approve(category_id=self.silver.id)
        self.assertEqual(bad_cat.category_id, self.silver)
        self.assertEqual(bad_cat.log_ids.message_type, 'confirm')

    def test_duplicate_phone(self):
        self._reg('A One', '9000000001', self.gold)
        with self.assertRaises(Exception), self.env.cr.savepoint():
            self._reg('A Two', '+91 90000 00001', self.gold)

    def test_invalid_phone(self):
        with self.assertRaises(ValidationError):
            self._reg('Bad Phone', '12345', self.gold)

    def test_auto_seat_and_hat_and_idempotent(self):
        a = self._reg('Gold A', '9000000011', self.gold)
        b = self._reg('Gold B', '9000000012', self.gold)
        self.assertEqual(a.action_check_in(), {'already': False})
        b.action_check_in()
        self.assertEqual((a.seat_label, b.seat_label), ('G1', 'G2'))
        self.assertEqual(a.hat_state, 'issued')
        self.assertEqual(a.action_check_in(), {'already': True})
        self.assertEqual(a.seat_label, 'G1')
        self.assertEqual(len(a.log_ids.filtered(lambda l: l.message_type == 'seat')), 1)
        self.assertIn('G1', a.log_ids.filtered(lambda l: l.message_type == 'seat').message)

    def test_block_full(self):
        for i in range(3):
            self._reg('G%s' % i, '90000001%02d' % (20 + i), self.gold).action_check_in()
        extra = self._reg('Overflow', '9000000199', self.gold)
        with self.assertRaises(UserError):
            extra.action_check_in()
        self.assertEqual(extra.state, 'registered')

    def test_manual_seat_conflict_and_change(self):
        s1 = self._reg('Silver 1', '9000000031', self.silver)
        s2 = self._reg('Silver 2', '9000000032', self.silver)
        with self.assertRaises(UserError):
            s1.action_check_in()                      # manual mode needs a seat
        seat = self.sblock.seat_ids.filtered(lambda s: s.number == 3)
        s1.action_check_in(seat_id=seat.id)
        with self.assertRaises(UserError), self.env.cr.savepoint():
            s2.action_check_in(seat_id=seat.id)       # already taken
        free = self.sblock.seat_ids.filtered(lambda s: s.number == 2)
        s1.action_change_seat(free.id)
        self.assertEqual(s1.seat_label, 'G2')
        s2.action_check_in(seat_id=seat.id)           # freed seat is reusable
        self.assertEqual(s2.seat_label, 'G3')

    def test_unapproved_cannot_check_in(self):
        self.env['otm.wm.expected'].create(
            {'event_id': self.event.id, 'name': 'Listed Person', 'phone': '9000000041', 'category_id': self.gold.id})
        p = self._reg('Stranger', '9000000042', self.gold)
        self.assertEqual(p.approval_state, 'pending')
        with self.assertRaises(UserError):
            p.action_check_in()

    def test_teacher_auto(self):
        t1 = self._reg('Teacher 1', '9000000051', self.teacher, kind='teacher')
        t2 = self._reg('Teacher 2', '9000000052', self.teacher, kind='teacher')
        self.assertEqual(t1.approval_state, 'approved')
        t1.action_check_in(); t2.action_check_in()
        self.assertEqual((t1.seat_label, t2.seat_label), ('T1', 'T2'))

    def test_hat_flow_and_undo(self):
        p = self._reg('Hat Guy', '9000000061', self.gold)
        p.action_check_in()
        p.action_hat('return')
        self.assertEqual(p.hat_state, 'returned')
        with self.assertRaises(UserError):
            p.action_undo_check_in()
        q = self._reg('Undo Guy', '9000000062', self.gold)
        q.action_check_in()
        q.action_undo_check_in()
        self.assertEqual((q.state, q.seat_id.id, q.hat_state), ('registered', False, 'none'))

    def test_whatsapp_dedup_and_force(self):
        p = self._reg('WA Guy', '9000000071', self.gold)
        n = len(p.log_ids)
        p._queue_message('confirm')
        self.assertEqual(len(p.log_ids), n)
        p._queue_message('confirm', force=True)
        self.assertEqual(len(p.log_ids), n + 1)
        self.assertIn('https://w.example.com/pass/' + p.qr_token, p.log_ids[0].message + ' '.join(p.log_ids.mapped('template_params')))

    def test_seat_range_shrink_protects_occupied(self):
        p = self._reg('Occupant', '9000000081', self.gold)
        p.action_check_in()   # G1
        with self.assertRaises(UserError):
            self.sblock.write({'start_no': 2})

    def test_teacher_specific_template_and_link(self):
        self.event.write({'frontend_url_teacher': 'https://t.example.com', 'wa_tpl_confirm_teacher': 'teacher_confirm',
                          'wa_tpl_confirm': 'student_confirm', 'wa_tpl_confirm_teacher': 'teacher_confirm'})
        t = self._reg('Teach Link', '9000000091', self.teacher, kind='teacher')
        s = self._reg('Stud Link', '9000000092', self.gold)
        tl, sl = t.log_ids[0], s.log_ids[0]
        self.assertEqual((tl.template_name, sl.template_name), ('teacher_confirm', 'student_confirm'))
        self.assertIn('https://t.example.com/pass/' + t.qr_token, tl.template_params)
        self.assertIn('https://w.example.com/pass/' + s.qr_token, sl.template_params)
        self.event.wa_tpl_confirm_teacher = False   # blank teacher template falls back to student's
        t2 = self._reg('Teach Two', '9000000093', self.teacher, kind='teacher')
        self.assertEqual(t2.log_ids[0].template_name, 'student_confirm')

    def test_reserved_seat_from_winners_list(self):
        seat = self.sblock.seat_ids.filtered(lambda s: s.number == 3)
        self.env['otm.wm.expected'].create({
            'event_id': self.event.id, 'name': 'Anu Krishnan', 'phone': '9876500001',
            'category_id': self.gold.id, 'reserved_seat_id': seat.id})
        # another gold student checks in first: must NOT receive the reserved seat G3
        other = self.env['otm.wm.expected'].create(
            {'event_id': self.event.id, 'name': 'Zed Zero', 'phone': '9876500009', 'category_id': self.gold.id})
        a = self._reg('Anu K', '9876500001', self.gold)
        z = self._reg('Zed Zero', '9876500009', self.gold)
        self.assertEqual(a._preset_seat().label, 'G3')
        z.action_check_in()
        self.assertEqual(z.seat_id.label, 'G1')
        a.action_check_in()
        self.assertEqual(a.seat_id.label, 'G3')
        self.assertTrue(a.log_ids.filtered(lambda l: l.message_type == 'seat'))

    def test_participant_reserved_seat_override(self):
        p = self._reg('Chitra T', '9000000077', self.teacher, kind='teacher')
        p.reserved_seat_id = self.tblock.seat_ids.filtered(lambda s: s.number == 2)
        p.action_check_in()
        self.assertEqual(p.seat_id.label, 'T2')

    def test_course_subcategories(self):
        Course = self.env['otm.wm.course']
        cpa = Course.create({'event_id': self.event.id, 'name': 'CPA USA'})
        acca = Course.create({'event_id': self.event.id, 'name': 'ACCA'})
        Cat = self.env['otm.wm.category']
        a = Cat.create({'event_id': self.event.id, 'name': 'Partly Qualified', 'course_id': cpa.id,
                        'seat_block_id': self.sblock.id})
        b = Cat.create({'event_id': self.event.id, 'name': 'Partly Qualified', 'course_id': acca.id})
        self.assertEqual(a.full_name(), 'CPA USA · Partly Qualified')
        self.assertNotEqual(a, b)
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            Cat.create({'event_id': self.event.id, 'name': 'partly qualified', 'course_id': cpa.id})
        other = self.env['otm.wm.event'].create({'name': 'Other'})
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            Cat.create({'event_id': other.id, 'name': 'X', 'course_id': cpa.id})

    def test_delete_participant_frees_seat(self):
        p = self._reg('Del Me', '9000000055', self.gold)
        p.action_check_in()
        seat = p.seat_id
        p.unlink()
        self.assertFalse(seat.participant_ids)
        q = self._reg('Next One', '9000000056', self.gold)
        q.action_check_in()
        self.assertEqual(q.seat_id, seat)

    def test_blank_message_text_falls_back_to_default(self):
        self.event.write({'wa_msg_confirm': '', 'wa_msg_confirm_teacher': '', 'wa_tpl_confirm': ''})
        p = self._reg('Blank Text', '9000000066', self.gold)
        self.assertIn('Blank Text', p.log_ids.message)
        self.assertTrue(p.log_ids.message.strip())

    def test_seat_template_param_count(self):
        import json
        p = self._reg('Param Test', '9000000088', self.gold)
        p.action_check_in()
        seat_log = p.log_ids.filtered(lambda l: l.message_type == 'seat')
        self.assertEqual(len(json.loads(seat_log.template_params)), 4)
        self.event.wa_seat_hat_param = True
        log2 = self.env['otm.wm.message.log']._queue_for(p, 'seat', force=True)
        self.assertEqual(len(json.loads(log2.template_params)), 5)

    def test_extra_fields(self):
        p = self._reg('Guest Test', '9000000099', self.gold)
        p.write({'accompany_type': 'friend', 'accompany_count': 2})
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            p.write({'accompany_type': 'guardian', 'accompany_count': 0})
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            p.write({'accompany_type': 'none', 'accompany_count': 1})
        t = self._reg('Teach Food', '9000000098', self.teacher, kind='teacher')
        t.food_pref = 'veg'
        self.assertEqual(t.food_pref, 'veg')

    def test_form_config(self):
        cfg = self.event.form_config('teacher')
        self.assertEqual((cfg['photo'], cfg['food_pref'], cfg['accompany']), ('required', 'required', 'off'))
        self.event.form_teacher = '{"photo": "off", "bogus": "required", "email": "weird"}'
        cfg = self.event.form_config('teacher')
        self.assertEqual((cfg['photo'], cfg['email'], cfg.get('bogus')), ('off', 'off', None))
        self.assertEqual(self.event.form_config('student')['place'], 'optional')

    def test_seat_rows(self):
        blk = self.env['otm.wm.seat.block'].create(
            {'event_id': self.event.id, 'name': 'Rows', 'prefix': 'R', 'start_no': 1, 'end_no': 30, 'row_size': 14})
        rows = {s.number: s.row_no for s in blk.seat_ids}
        self.assertEqual((rows[1], rows[14], rows[15], rows[28], rows[29], rows[30]), (1, 1, 2, 2, 3, 3))
        self.assertEqual(blk.seat_ids.filtered(lambda s: s.number == 15).display_label(), 'R15 (Row 2)')
        blk.row_size = 10
        self.assertEqual({s.number: s.row_no for s in blk.seat_ids}[15], 2)
        self.assertEqual({s.number: s.row_no for s in blk.seat_ids}[30], 3)
        blk.row_size = 0
        self.assertEqual(blk.seat_ids.filtered(lambda s: s.number == 15).display_label(), 'R15')

    def test_kit_inventory(self):
        self.gold.item_ids = [(6, 0, [self.hat_item.id, self.shawl.id])]
        self.assertTrue(self.gold.hat)
        self.assertEqual(self.gold.hat_label, 'Hat, Shawl')
        a = self._reg('Kit A', '9000000071', self.gold)
        b = self._reg('Kit B', '9000000072', self.gold)
        a.action_check_in()
        b.action_check_in()
        self.assertEqual(len(a.issue_ids), 2)
        st = {s['name']: s for s in (self.hat_item.stats(), self.shawl.stats())}
        self.assertEqual((st['Shawl']['quantity'], st['Shawl']['out'], st['Shawl']['available']), (2, 2, 0))
        self.assertEqual((st['Hat']['available'], st['Hat']['needed']), (3, 2))
        a.action_hat('return', self.hat_item.id)            # one item back, shawl still out
        self.assertEqual(a.hat_state, 'issued')
        a.action_hat('return')                               # everything back
        self.assertEqual(a.hat_state, 'returned')
        b.action_hat('lost', self.shawl.id)
        self.assertEqual(self.shawl.stats()['lost'], 1)
        self.assertEqual(self.shawl.stats()['available'], 1)   # stock 2 - 1 lost, A's shawl is back
        with self.assertRaises(UserError):
            a.action_undo_check_in()
        with self.assertRaises(Exception), self.env.cr.savepoint():
            self.hat_item.unlink()                           # issued items cannot be deleted

    def test_trophy_stage(self):
        p = self._reg('Stage Guy', '9000000081', self.gold)
        with self.assertRaises(UserError):
            p.action_trophy()                     # not present yet
        p.action_check_in()
        p.action_trophy()
        self.assertEqual(p.trophy_state, 'given')
        with self.assertRaises(UserError):
            p.action_undo_check_in()
        p.action_trophy(False)
        self.assertEqual((p.trophy_state, bool(p.trophy_on)), ('pending', False))

    def test_event_slugs(self):
        Event = self.env['otm.wm.event']
        a = Event.create({'name': 'Zeta Gala 2031!'})
        b = Event.create({'name': 'Zeta Gala 2031!'})
        self.assertEqual(a.slug, 'zeta-gala-2031')
        self.assertEqual(b.slug, 'zeta-gala-2031-2')
        a.slug = 'My Event / Kochi'
        self.assertEqual(a.slug, 'my-event-kochi')
        with self.assertRaises(Exception), self.env.cr.savepoint():
            b.slug = 'my-event-kochi'
        legacy = Event.create({'name': 'Old One'})
        self.env.cr.execute("UPDATE otm_wm_event SET slug = NULL WHERE id = %s", [legacy.id])
        legacy.invalidate_recordset()
        legacy.ensure_slug()
        self.assertEqual(legacy.slug, 'old-one')

    def test_theatre_layout(self):
        ev = self.env['otm.wm.event'].create({'name': 'Layout Show'})
        b = self.env['otm.wm.seat.block'].create({
            'event_id': ev.id, 'name': 'Stalls', 'prefix': 'T', 'start_no': 1, 'end_no': 52, 'row_layout': '13 , 13'})
        self.assertEqual(b.row_layout, '13,13')
        self.assertEqual(b.row_size, 26)
        self.assertEqual(b.layout_sections(), [13, 13])
        self.assertEqual(b.seat_ids.filtered(lambda s: s.number == 27).row_no, 2)
        b.row_layout = '7,13,7'
        self.assertEqual(b.row_size, 27)
        b.row_layout = ''
        self.assertFalse(b.layout_sections())
        with self.assertRaises(Exception), self.env.cr.savepoint():
            b.row_layout = 'abc'

    def test_block_overlap_and_delete(self):
        ev = self.env['otm.wm.event'].create({'name': 'Overlap Show'})
        Block = self.env['otm.wm.seat.block']
        a = Block.create({'event_id': ev.id, 'name': 'A', 'prefix': 'S', 'start_no': 1, 'end_no': 10})
        with self.assertRaises(Exception), self.env.cr.savepoint():
            Block.create({'event_id': ev.id, 'name': 'B', 'prefix': 'S', 'start_no': 5, 'end_no': 20})
        b = Block.create({'event_id': ev.id, 'name': 'B', 'prefix': 'S', 'start_no': 11, 'end_no': 20})
        self.assertEqual(len(b.seat_ids), 10)
        b.action_delete_checked()
        self.assertFalse(b.exists())
        self.assertTrue(a.exists())

    def test_category_seat_range(self):
        ev = self.env['otm.wm.event'].create({'name': 'Range Show'})
        blk = self.env['otm.wm.seat.block'].create({'event_id': ev.id, 'name': 'Bal', 'prefix': 'Z', 'start_no': 469, 'end_no': 520})
        cat = self.env['otm.wm.category'].create({'event_id': ev.id, 'name': 'CMA USA', 'kind': 'student',
                                                  'seat_block_id': blk.id, 'seat_from': 469, 'seat_to': 471})
        got = []
        for i in range(3):
            p = self.env['otm.wm.participant'].create({'event_id': ev.id, 'name': 'R%s' % i, 'phone': '9199000%04d' % i,
                                                       'kind': 'student', 'category_id': cat.id, 'approval_state': 'approved'})
            p.action_check_in()
            got.append(p.seat_id.number)
        self.assertEqual(got, [469, 470, 471])
        p = self.env['otm.wm.participant'].create({'event_id': ev.id, 'name': 'R9', 'phone': '919900009999',
                                                   'kind': 'student', 'category_id': cat.id, 'approval_state': 'approved'})
        with self.assertRaises(Exception):
            p.action_check_in()
        with self.assertRaises(Exception), self.env.cr.savepoint():
            cat.seat_to = 100

    def test_seat_range_enforced_everywhere(self):
        ev = self.env['otm.wm.event'].create({'name': 'Strict Show'})
        blk = self.env['otm.wm.seat.block'].create({'event_id': ev.id, 'name': 'Bal', 'prefix': 'Y', 'start_no': 460, 'end_no': 520})
        other = self.env['otm.wm.seat.block'].create({'event_id': ev.id, 'name': 'Oth', 'prefix': 'O', 'start_no': 1, 'end_no': 10})
        cat = self.env['otm.wm.category'].create({'event_id': ev.id, 'name': 'CMA USA', 'kind': 'student', 'seat_mode': 'manual',
                                                  'seat_block_id': blk.id, 'seat_from': 469, 'seat_to': 476})
        seat = {x.number: x for x in blk.seat_ids}
        P = self.env['otm.wm.participant']
        p = P.create({'event_id': ev.id, 'name': 'S1', 'phone': '919900100001', 'kind': 'student',
                      'category_id': cat.id, 'approval_state': 'approved'})
        # manual pick outside range / other block is refused, inside works
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            p.action_check_in(seat_id=seat[460].id)
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            p.action_check_in(seat_id=other.seat_ids[0].id)
        p.action_check_in(seat_id=seat[470].id)
        self.assertEqual(p.seat_id.number, 470)
        # change seat: same rules; manager override allowed
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            p.action_change_seat(seat[500].id)
        p.action_change_seat(seat[500].id, override=True)
        self.assertEqual(p.seat_id.number, 500)
        # reserved seat on participant and on winners-list entry (covers Excel import too)
        p2 = P.create({'event_id': ev.id, 'name': 'S2', 'phone': '919900100002', 'kind': 'student',
                       'category_id': cat.id, 'approval_state': 'approved'})
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            p2.write({'reserved_seat_id': seat[512].id})
        p2.write({'reserved_seat_id': seat[472].id})
        Exp = self.env['otm.wm.expected']
        with self.assertRaises(ValidationError), self.env.cr.savepoint():
            Exp.create({'event_id': ev.id, 'name': 'W1', 'phone': '919900100003', 'category_id': cat.id,
                        'reserved_seat_id': seat[477].id})
        Exp.create({'event_id': ev.id, 'name': 'W2', 'phone': '919900100004', 'category_id': cat.id,
                    'reserved_seat_id': seat[476].id})

    def test_row_names_and_instagram(self):
        ev = self.env['otm.wm.event'].create({'name': 'Names Show'})
        b = self.env['otm.wm.seat.block'].create({'event_id': ev.id, 'name': 'N', 'prefix': 'N', 'start_no': 1, 'end_no': 30,
                                                  'row_size': 10, 'row_names': 'A, B'})
        s = {x.number: x for x in b.seat_ids}
        self.assertEqual(s[1].row_name(), 'A')
        self.assertEqual(s[11].row_name(), 'B')
        self.assertEqual(s[25].row_name(), '3')
        self.assertIn('Row A', s[1].display_label())
        self.assertEqual(self.env['otm.wm.seat'].browse().row_name(), '')
        self.assertEqual(ev.form_config('student')['instagram'], 'required')
        self.assertEqual(ev.form_config('teacher')['instagram'], 'off')

    def test_stage_announcement_flow(self):
        ev = self.env['otm.wm.event'].create({'name': 'Stage Show', 'state': 'open'})
        blk = self.env['otm.wm.seat.block'].create({'event_id': ev.id, 'name': 'B', 'prefix': 'Q', 'start_no': 1, 'end_no': 20})
        cat = self.env['otm.wm.category'].create({'event_id': ev.id, 'name': 'Fully Qualified', 'seat_block_id': blk.id})
        Exp, Log = self.env['otm.wm.expected'], self.env['otm.wm.message.log']
        self.env['otm.wm.staff'].create({'event_id': ev.id, 'name': 'Stage One', 'phone': '9876500111'})
        self.env['otm.wm.staff'].create({'event_id': ev.id, 'name': 'Stage Two', 'phone': '9876500222'})
        ex = [Exp.create({'event_id': ev.id, 'name': 'Winner %s' % i, 'phone': '98765001%02d' % i,
                          'category_id': cat.id, 'sequence': 10 * (4 - i)}) for i in range(4)]
        self.assertEqual(Exp.search([('event_id', '=', ev.id)]).mapped('name'),
                         ['Winner 3', 'Winner 2', 'Winner 1', 'Winner 0'])      # manual order wins
        parts = []
        for e in ex[:3]:
            parts.append(self.P.create({'event_id': ev.id, 'kind': 'student', 'name': e.name, 'phone': e.phone,
                                        'category_id': cat.id, 'approval_state': 'approved', 'expected_id': e.id}))
        link = Exp._link_map(ev)
        self.assertEqual([Exp._status(link(e)) for e in ex], ['red', 'red', 'red', 'gray'])
        parts[0].action_check_in()
        parts[1].action_check_in()
        self.assertEqual([Exp._status(link(e)) for e in ex], ['green', 'green', 'red', 'gray'])
        parts[0].action_trophy(True)
        res = cat.action_stage_close()
        self.assertEqual(res, {'collected': 1, 'missed': 3})
        self.assertTrue(cat.stage_closed)
        self.assertEqual(ex[1].missed and ex[2].missed and ex[3].missed, True)
        self.assertFalse(ex[0].missed)
        self.assertEqual(Log.search_count([('event_id', '=', ev.id), ('message_type', '=', 'stage_done')]), 2)
        parts[2].action_check_in()                                            # arrives after the announcement
        self.assertEqual(Log.search_count([('event_id', '=', ev.id), ('message_type', '=', 'stage_late')]), 2)
        cat.action_stage_reopen()
        self.assertFalse(any(Exp.browse(ex[i].id).missed for i in range(4)))
        # autoclose when everybody collected
        cat2 = self.env['otm.wm.category'].create({'event_id': ev.id, 'name': 'Merit', 'seat_block_id': blk.id})
        e2 = Exp.create({'event_id': ev.id, 'name': 'Solo', 'phone': '9876500199', 'category_id': cat2.id})
        p2 = self.P.create({'event_id': ev.id, 'kind': 'student', 'name': 'Solo', 'phone': e2.phone,
                            'category_id': cat2.id, 'approval_state': 'approved', 'expected_id': e2.id})
        p2.action_check_in()
        p2.action_trophy(True)
        cat2._stage_autoclose()
        self.assertTrue(cat2.stage_closed)
        self.assertFalse(e2.missed)

    def test_winners_list_without_phone(self):
        ev = self.env['otm.wm.event'].create({'name': 'NoPhone Show', 'state': 'open'})
        cat = self.env['otm.wm.category'].create({'event_id': ev.id, 'name': 'Fully Qualified'})
        other = self.env['otm.wm.category'].create({'event_id': ev.id, 'name': 'Partly Qualified'})
        Exp = self.env['otm.wm.expected']
        e1 = Exp.create({'event_id': ev.id, 'name': 'Vaiga P Ajesh', 'category_id': cat.id})
        e2 = Exp.create({'event_id': ev.id, 'name': 'Advaith', 'category_id': cat.id, 'phone': ''})
        self.assertFalse(e1.phone)
        p = self.P.create({'event_id': ev.id, 'kind': 'student', 'name': 'Vaiga P Ajesh', 'phone': '9876500777',
                           'claimed_category_id': cat.id})
        self.assertEqual((p.match_status, p.approval_state, p.expected_id), ('matched', 'approved', e1))
        self.assertEqual(e1.phone, '919876500777')
        wrong = self.P.create({'event_id': ev.id, 'kind': 'student', 'name': 'Advaith', 'phone': '9876500778',
                               'claimed_category_id': other.id})
        self.assertEqual((wrong.match_status, wrong.approval_state), ('category_mismatch', 'pending'))
        stranger = self.P.create({'event_id': ev.id, 'kind': 'student', 'name': 'Zed Unknown', 'phone': '9876500779',
                                  'claimed_category_id': cat.id})
        self.assertEqual(stranger.match_status, 'not_listed')
        self.assertEqual(Exp._status(Exp._link_map(ev)(e2)), 'red')     # registered (pending review), not arrived

    def test_teachers_in_stage_queue(self):
        ev = self.env['otm.wm.event'].create({'name': 'Teach Show', 'state': 'open'})
        blk = self.env['otm.wm.seat.block'].create({'event_id': ev.id, 'name': 'T', 'prefix': 'T', 'start_no': 1, 'end_no': 20})
        tcat = self.env['otm.wm.category'].create({'event_id': ev.id, 'name': 'Best Teacher', 'kind': 'teacher', 'seat_block_id': blk.id})
        scat = self.env['otm.wm.category'].create({'event_id': ev.id, 'name': 'Rank 1', 'kind': 'student', 'seat_block_id': blk.id})
        Exp, P = self.env['otm.wm.expected'], self.env['otm.wm.participant']
        e1 = Exp.create({'event_id': ev.id, 'name': 'Asha Teacher', 'phone': '919811100001', 'category_id': tcat.id})
        e2 = Exp.create({'event_id': ev.id, 'name': 'Biju Thomas', 'category_id': tcat.id})          # no phone
        es = Exp.create({'event_id': ev.id, 'name': 'Biju Thomas', 'category_id': scat.id})          # same name, student list
        t1 = P.create({'event_id': ev.id, 'kind': 'teacher', 'name': 'Asha Teacher', 'phone': '919811100001',
                       'category_id': tcat.id, 'claimed_category_id': tcat.id})
        t2 = P.create({'event_id': ev.id, 'kind': 'teacher', 'name': 'Biju Thomas', 'phone': '919811100002',
                       'category_id': tcat.id, 'claimed_category_id': tcat.id})
        self.assertEqual(t1.expected_id, e1)
        self.assertEqual(t2.expected_id, e2)                 # linked by name inside the teacher list, not the student one
        self.assertEqual(e2.phone, '919811100002')
        link = Exp._link_map(ev)
        self.assertEqual(Exp._status(link(es)), 'gray')
        t1.write({'approval_state': 'approved'})
        t1.action_check_in()
        self.assertEqual(Exp._status(link(e1)), 'green')
        t1.action_trophy(True)
        tcat._stage_autoclose()
        self.assertFalse(tcat.stage_closed)                  # Biju has not collected yet

    def test_demo_load_and_delete(self):
        ev = self.env['otm.wm.event'].create({'name': 'Demo Show', 'state': 'open'})
        self.env['otm.wm.staff'].create({'event_id': ev.id, 'name': 'S', 'phone': '9876500555'})
        res = ev.action_demo_load()
        self.assertEqual(res, {'people': 12, 'winners': 16})
        with self.assertRaises(UserError):
            ev.action_demo_load()
        Exp, Log = self.env['otm.wm.expected'], self.env['otm.wm.message.log']
        link = Exp._link_map(ev)
        status = [Exp._status(link(e)) for e in Exp.search([('event_id', '=', ev.id)])]
        self.assertEqual({s: status.count(s) for s in set(status)}, {'green': 9, 'red': 3, 'gray': 4})
        self.assertEqual(Log.search_count([('event_id', '=', ev.id)]), 0)       # demo never messages
        cat = self.env['otm.wm.category'].search([('event_id', '=', ev.id), ('name', 'like', 'Fully')])
        cat.action_stage_close()
        self.assertEqual(Log.search_count([('event_id', '=', ev.id)]), 0)
        self.assertEqual(ev.action_demo_delete(), {'people': 0, 'winners': 0})
        self.assertFalse(self.env['otm.wm.course'].search([('event_id', '=', ev.id)]))
        self.assertFalse(self.env['otm.wm.seat.block'].search([('event_id', '=', ev.id)]))
        self.assertTrue(ev.staff_ids)                                           # real data untouched

    def test_stage_row_skips_absent(self):
        ev = self.env['otm.wm.event'].create({'name': 'Row Show', 'state': 'open'})
        self.env['otm.wm.staff'].create({'event_id': ev.id, 'name': 'S', 'phone': '9876500556'})
        blk = self.env['otm.wm.seat.block'].create({'event_id': ev.id, 'name': 'B', 'prefix': 'R', 'start_no': 1, 'end_no': 10})
        cat = self.env['otm.wm.category'].create({'event_id': ev.id, 'name': 'Gold', 'seat_block_id': blk.id})
        Exp = self.env['otm.wm.expected']
        a = Exp.create({'event_id': ev.id, 'name': 'Here One', 'category_id': cat.id, 'phone': '9876500601', 'sequence': 1})
        b = Exp.create({'event_id': ev.id, 'name': 'Absent Two', 'category_id': cat.id, 'phone': '9876500602', 'sequence': 2})
        pa = self.P.create({'event_id': ev.id, 'kind': 'student', 'name': a.name, 'phone': a.phone, 'category_id': cat.id,
                            'approval_state': 'approved', 'expected_id': a.id})
        pb = self.P.create({'event_id': ev.id, 'kind': 'student', 'name': b.name, 'phone': b.phone, 'category_id': cat.id,
                            'approval_state': 'approved', 'expected_id': b.id})
        pa.action_check_in()
        pa.action_trophy(True)                        # what "Row complete" does for the person in the hall
        b.write({'missed': True, 'missed_on': '2026-11-07 10:00:00'})   # ... and for the one who is absent
        pb.action_check_in()                          # arrives later: goes to Missed + staff are told
        self.assertEqual(self.env['otm.wm.message.log'].search_count(
            [('event_id', '=', ev.id), ('message_type', '=', 'stage_late')]), 1)
