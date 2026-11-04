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
        cls.gold = Cat.create({'event_id': cls.event.id, 'name': 'Gold', 'hat': True,
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
