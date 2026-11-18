from odoo.exceptions import UserError
from odoo.tests import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestCoupon(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        env = cls.env
        cls.event = env['otm.wm.event'].create({'name': 'WM', 'state': 'open', 'coupon_enabled': True})
        blk = env['otm.wm.seat.block'].create({'event_id': cls.event.id, 'name': 'B', 'prefix': 'B', 'start_no': 1, 'end_no': 9})
        cat_t = env['otm.wm.category'].create({'event_id': cls.event.id, 'name': 'T', 'kind': 'teacher', 'seat_block_id': blk.id})
        cat_s = env['otm.wm.category'].create({'event_id': cls.event.id, 'name': 'S', 'seat_block_id': blk.id, 'seat_mode': 'auto'})
        P = env['otm.wm.participant']
        cls.teacher = P.create({'event_id': cls.event.id, 'kind': 'teacher', 'name': 'Teacher A', 'phone': '9000011111', 'claimed_category_id': cat_t.id})
        cls.winner = P.create({'event_id': cls.event.id, 'kind': 'student', 'name': 'Winner S', 'phone': '9000022222', 'claimed_category_id': cat_s.id})
        cls.teacher.action_check_in()
        cls.winner.action_check_in()
        cls.batch = env['student.batch'].create({'name': 'CB'})
        cls.approver = env['res.users'].create({
            'name': 'Approver', 'login': 'coupon_approver',
            'group_ids': [(6, 0, [env.ref('base.group_user').id, env.ref('otm_teacher_coupon.group_coupon_approver').id])]})
        cls.officer = env['res.users'].create({
            'name': 'Officer', 'login': 'coupon_officer', 'group_ids': [(6, 0, [env.ref('base.group_user').id])]})

    def _enr(self, n, phone, fee=10000.0, gst='18'):
        st = self.env['student.details'].create({'name': 'Stu %s' % n, 'phone': phone, 'branch': 'kochi'})
        return self.env['student.enrollment'].create(
            {'student_id': st.id, 'batch_id': self.batch.id, 'total_fee': fee, 'gst_rate': gst})

    def test_pending_then_approve_discount_incl_gst(self):
        enr = self._enr(1, '9100000001')
        u = self.env['otm.coupon.usage'].with_user(self.officer)._request(self.teacher.coupon_code.lower(), enr)
        self.assertEqual(u.state, 'pending')
        self.assertEqual(enr.total_fee, 10000.0)             # nothing until approved
        with self.assertRaises(UserError):
            u.with_user(self.officer).action_approve()       # officer cannot approve
        u.with_user(self.approver).action_approve()
        self.assertEqual((u.state, u.slot_no, u.discount_pct, u.discount_amount), ('approved', 1, 20.0, 2000.0))
        self.assertEqual(enr.total_fee, 8000.0)
        self.assertEqual(enr.due_amount, 8000.0)

    def test_first_three_20_then_10(self):
        pcts = []
        for i in range(4):
            enr = self._enr(10 + i, '91000001%02d' % i)
            u = self.env['otm.coupon.usage']._request(self.teacher.coupon_code, enr)
            u.with_user(self.approver).action_approve()
            pcts.append(u.discount_pct)
        self.assertEqual(pcts, [20.0, 20.0, 20.0, 10.0])
        self.teacher.invalidate_recordset()
        self.assertEqual((self.teacher.coupon_approved, self.teacher.coupon_slots_left), (4, 0))
        self.assertEqual(self.teacher.coupon_discount_total, 2000 * 3 + 1000)

    def test_slot_by_approval_order_and_revoke_frees_slot(self):
        e = [self._enr(20 + i, '91000002%02d' % i) for i in range(5)]
        us = [self.env['otm.coupon.usage']._request(self.teacher.coupon_code, x) for x in e]
        for u in us[:3]:
            u.with_user(self.approver).action_approve()
        us[3].with_user(self.approver).action_approve()      # 4th approved -> 10%
        self.assertEqual(us[3].discount_pct, 10.0)
        us[0].with_user(self.approver).action_revoke()       # slot freed, fee restored
        self.assertEqual(e[0].total_fee, 10000.0)
        us[4].with_user(self.approver).action_approve()      # approved count is 3 -> this is use #4 again
        self.assertEqual(us[4].slot_no, 4)

    def test_student_coupon_10_and_excl_gst(self):
        self.env['otm.coupon.config']._get().sudo().write({'base': 'excl'}) if self.env['otm.coupon.config'].search([]) else self.env['otm.coupon.config'].create({'base': 'excl'})
        enr = self._enr(30, '9100000030', fee=11800.0, gst='18')
        u = self.env['otm.coupon.usage']._request(self.winner.coupon_code, enr)
        u.with_user(self.approver).action_approve()
        self.assertEqual((u.base_amount, u.discount_pct, u.discount_amount), (10000.0, 10.0, 1000.0))
        self.assertEqual(enr.total_fee, 10800.0)

    def test_rules(self):
        enr = self._enr(40, '9100000040')
        with self.assertRaises(UserError):
            self.env['otm.coupon.usage']._request('WMT-NOPE00', enr)
        own = self._enr(41, self.teacher.phone[-10:])        # owner cannot use own coupon
        with self.assertRaises(UserError):
            self.env['otm.coupon.usage']._request(self.teacher.coupon_code, own)
        u = self.env['otm.coupon.usage']._request(self.teacher.coupon_code, enr)
        with self.assertRaises(UserError):                   # one coupon per student
            self.env['otm.coupon.usage']._request(self.winner.coupon_code, enr)
        self.env['otm.coupon.reject.wizard'].with_user(self.approver).create(
            {'usage_id': u.id, 'reason': 'Wrong student'}).action_reject()
        self.assertEqual((u.state, enr.total_fee), ('rejected', 10000.0))
        self.env['otm.coupon.usage']._request(self.winner.coupon_code, enr)   # allowed again after reject

    def test_lead_admission_wizard_hook(self):
        env = self.env
        env['ir.config_parameter'].sudo().set_param('custom_leads_19.admission_batch_required', '1')
        fs = env['fee.structure'].create({'name': 'LS', 'fee_type': 'lumpsum', 'gst_rate': '18', 'amount_inclusive': 11800.0,
                                          'batch_ids': [(6, 0, [self.batch.id])]})
        src = env['leads.sources'].create({'name': 'Test Source'})
        lead = env['leads.logic'].create({'name': 'Lead Stu', 'phone_number': '9100000077', 'leads_source': src.id})
        wiz = env['lead.admission.wizard'].create({
            'lead_id': lead.id, 'batch_id': self.batch.id, 'fee_structure_id': fs.id,
            'coupon_code': self.teacher.coupon_code})
        wiz.action_confirm_admission()
        enr = lead.student_id.enrollment_ids
        self.assertEqual(len(enr), 1)
        usage = enr.coupon_usage_ids
        self.assertEqual(usage.state, 'pending')
        self.assertEqual(enr.total_fee, 11800.0)
        usage.with_user(self.approver).action_approve()
        self.assertEqual(enr.total_fee, 11800.0 - 2360.0)
