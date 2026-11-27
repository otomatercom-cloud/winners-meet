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
        cls.teacher.action_generate_coupon()                 # teacher code comes from the admin button
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

    def _course(self, fee=20000.0):
        return self.env['course.interested'].create({'name': 'CMA USA T%s' % fee, 'tuition_fee': fee})

    def _use(self, n, phone, course=None, fee=10000.0):
        enr = self._enr(n, phone, fee=fee)
        u = self.env['otm.coupon.usage']._request(self.teacher.coupon_code, enr)
        if course:
            u.course_id = course
        return enr, u

    def test_pending_then_approve_on_course_tuition_fee(self):
        crs = self._course(20000.0)
        enr, u = self._use(1, '9100000001', course=crs)
        self.assertEqual((u.state, enr.total_fee), ('pending', 10000.0))     # nothing until approved
        with self.assertRaises(UserError):
            u.with_user(self.officer).action_approve()
        u.with_user(self.approver).action_approve()
        self.assertEqual((u.slot_no, u.discount_pct, u.tuition_base, u.discount_amount), (1, 10.0, 20000.0, 2000.0))
        self.assertEqual((u.referral_pct, u.referral_amount), (10.0, 2000.0))
        self.assertEqual(enr.total_fee, 8000.0)
        self.teacher.invalidate_recordset()
        self.assertEqual(self.teacher.wallet_balance, 2000.0)

    def test_first_three_get_discount_teacher_always_gets_referral(self):
        crs = self._course(10000.0)
        res = []
        for i in range(4):
            enr, u = self._use(10 + i, '91000001%02d' % i, course=crs)
            u.with_user(self.approver).action_approve()
            res.append((u.discount_pct, u.referral_amount, enr.total_fee))
        self.assertEqual(res, [(10.0, 1000.0, 9000.0)] * 3 + [(0.0, 1000.0, 10000.0)])
        self.teacher.invalidate_recordset()
        self.assertEqual((self.teacher.coupon_approved, self.teacher.coupon_slots_left, self.teacher.wallet_balance), (4, 0, 4000.0))

    def test_fallback_base_excl_gst_when_course_has_no_fee(self):
        enr = self._enr(20, '9100000020', fee=11800.0, gst='18')
        u = self.env['otm.coupon.usage']._request(self.teacher.coupon_code, enr)
        u.with_user(self.approver).action_approve()
        self.assertEqual((u.tuition_base, u.discount_amount, u.referral_amount), (10000.0, 1000.0, 1000.0))
        self.assertEqual(enr.total_fee, 10800.0)

    def test_settings_switch_off_and_limits(self):
        cfg = self.env['otm.coupon.config']._get()
        cfg = cfg if cfg.id else self.env['otm.coupon.config'].create({})
        crs = self._course(10000.0)
        cfg.write({'discount_enabled': False})
        enr, u = self._use(30, '9100000030', course=crs)
        u.with_user(self.approver).action_approve()
        self.assertEqual((u.discount_amount, u.referral_amount, enr.total_fee), (0.0, 1000.0, 10000.0))
        cfg.write({'discount_enabled': True, 'referral_enabled': False})
        enr, u = self._use(31, '9100000031', course=crs)
        u.with_user(self.approver).action_approve()
        self.assertEqual((u.discount_amount, u.referral_amount), (1000.0, 0.0))
        cfg.write({'referral_enabled': True, 'referral_max': 3})            # slot 3 pays, slot 4 does not
        enr, u3 = self._use(32, '9100000032', course=crs)
        u3.with_user(self.approver).action_approve()
        enr, u4 = self._use(33, '9100000033', course=crs)
        u4.with_user(self.approver).action_approve()
        self.assertEqual((u3.slot_no, u3.referral_amount, u4.slot_no, u4.referral_amount), (3, 1000.0, 4, 0.0))
        cfg.write({'referral_max': 0})

    def test_revoke_frees_slot_and_cancels_wallet_credit(self):
        crs = self._course(10000.0)
        pairs = [self._use(40 + i, '91000004%02d' % i, course=crs) for i in range(4)]
        for enr, u in pairs[:3]:
            u.with_user(self.approver).action_approve()
        pairs[0][1].with_user(self.approver).action_revoke()
        self.assertEqual(pairs[0][0].total_fee, 10000.0)
        self.teacher.invalidate_recordset()
        self.assertEqual(self.teacher.wallet_balance, 2000.0)               # credit of the revoked one cancelled
        pairs[3][1].with_user(self.approver).action_approve()               # approved count was 2 -> slot 3, discount again
        self.assertEqual((pairs[3][1].slot_no, pairs[3][1].discount_pct), (3, 10.0))

    def test_payout_reduces_balance(self):
        crs = self._course(10000.0)
        enr, u = self._use(50, '9100000050', course=crs)
        u.with_user(self.approver).action_approve()
        self.env['otm.coupon.wallet.line'].with_user(self.approver).create(
            {'participant_id': self.teacher.id, 'kind': 'payout', 'amount': 400.0, 'note': 'GPay'})
        self.teacher.invalidate_recordset()
        self.assertEqual(self.teacher.wallet_balance, 600.0)

    def test_full_payout_marks_credits_paid(self):
        crs = self._course(10000.0)
        enr, u = self._use(51, '9100000051', course=crs)
        u.with_user(self.approver).action_approve()
        wiz = self.env['otm.coupon.payout.wizard'].with_user(self.approver).with_context(
            default_participant_id=self.teacher.id).create({'reference': 'UTR123'})
        self.assertEqual(wiz.amount, 1000.0)
        with self.assertRaises(UserError):
            self.env['otm.coupon.payout.wizard'].with_user(self.officer).create(
                {'participant_id': self.teacher.id, 'amount': 1000.0, 'reference': 'X'}).action_confirm()
        wiz.action_confirm()
        self.teacher.invalidate_recordset()
        self.assertEqual(self.teacher.wallet_balance, 0.0)
        credit = self.env['otm.coupon.wallet.line'].search([('usage_id', '=', u.id), ('kind', '=', 'referral')])
        self.assertEqual(credit.settled_by_id.reference, 'UTR123')

    def test_student_owned_code_flat_discount_no_wallet(self):
        enr = self._enr(60, '9100000060', fee=11800.0, gst='18')
        u = self.env['otm.coupon.usage']._request(self.winner.coupon_code, enr)
        u.with_user(self.approver).action_approve()
        self.assertEqual((u.discount_pct, u.discount_amount, u.referral_amount), (10.0, 1000.0, 0.0))
        self.assertFalse(self.env['otm.coupon.wallet.line'].search([('participant_id', '=', self.winner.id)]))

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
        self.assertEqual(enr.total_fee, 11800.0 - 1000.0)       # 10% of the tuition base (11800 excl. 18% GST)

    def test_wallet_referral_lead_flow_via_admission(self):
        env = self.env
        env['ir.config_parameter'].sudo().set_param('custom_leads_19.admission_batch_required', '1')
        crs = self._course(20000.0)
        src = env.ref('otm_teacher_coupon.lead_source_wm_referral')
        lead = env['leads.logic'].create({'name': 'Referred Stu', 'phone_number': '9100000088', 'leads_source': src.id,
                                          'course_inter': [(6, 0, [crs.id])], 'wm_participant_id': self.teacher.id})
        fs = env['fee.structure'].create({'name': 'LS2', 'fee_type': 'lumpsum', 'gst_rate': '18', 'amount_inclusive': 23600.0,
                                          'batch_ids': [(6, 0, [self.batch.id])]})
        wiz = env['lead.admission.wizard'].create({'lead_id': lead.id, 'batch_id': self.batch.id, 'fee_structure_id': fs.id})
        wiz.action_confirm_admission()                      # no code typed: taken from the referral
        usage = lead.student_id.enrollment_ids.coupon_usage_ids
        self.assertEqual((usage.state, usage.lead_id, usage.course_id), ('pending', lead, crs))
        usage.with_user(self.approver).action_approve()
        self.assertEqual((usage.discount_amount, usage.referral_amount), (2000.0, 2000.0))
