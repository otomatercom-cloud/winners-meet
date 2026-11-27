import re

from odoo import _, api, fields, models
from odoo.exceptions import UserError


def _digits10(raw):
    return re.sub(r'\D', '', raw or '')[-10:]


class CouponUsage(models.Model):
    _name = 'otm.coupon.usage'
    _description = 'Coupon Usage'
    _inherit = ['mail.thread']
    _rec_name = 'coupon_code'
    _order = 'id desc'

    coupon_code = fields.Char(required=True, index=True, tracking=True)
    participant_id = fields.Many2one('otm.wm.participant', ondelete='restrict', index=True)
    owner_name = fields.Char(string="Coupon Owner", readonly=True)
    owner_phone = fields.Char(string="Owner Phone", readonly=True)
    owner_kind = fields.Selection([('teacher', 'Teacher'), ('student', 'Student')], string="Owner Type", readonly=True)
    student_id = fields.Many2one('student.details', string="Student", required=True, index=True, ondelete='cascade')
    enrollment_id = fields.Many2one('student.enrollment', string="Enrollment", required=True, index=True, ondelete='cascade')
    requested_by = fields.Many2one('res.users', default=lambda s: s.env.user, readonly=True)
    state = fields.Selection(
        [('pending', 'Pending Approval'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('revoked', 'Revoked')],
        default='pending', required=True, index=True, tracking=True)
    approved_by = fields.Many2one('res.users', readonly=True)
    approved_on = fields.Datetime(readonly=True)
    reject_reason = fields.Char(readonly=True)
    slot_no = fields.Integer(string="Use No.", readonly=True, help="Nth approved use of this code.")
    discount_pct = fields.Float(string="Discount %", readonly=True)
    base_amount = fields.Float(string="Discount Base ₹", readonly=True, digits=(10, 2))
    discount_amount = fields.Float(string="Discount ₹", readonly=True, digits=(10, 2))
    source = fields.Char(readonly=True)
    lead_id = fields.Many2one('leads.logic', string="Lead", readonly=True, index=True, ondelete='set null')
    course_id = fields.Many2one('course.interested', string="Course",
                                help="Its tuition fee is the base for the discount and referral. Set before approving.")
    tuition_base = fields.Float(string="Tuition Fee Base ₹", readonly=True, digits=(10, 2))
    referral_pct = fields.Float(string="Referral %", readonly=True)
    referral_amount = fields.Float(string="Referral ₹", readonly=True, digits=(10, 2))

    # ------------------------------------------------------------ request
    @api.model
    def _request(self, code, enrollment, source='', lead=None):
        """Officer enters a code for an enrollment: validate and create a Pending usage."""
        code = (code or '').strip().upper()
        if not code:
            raise UserError(_("Enter a coupon code."))
        part = self.env['otm.wm.participant'].sudo().search([('coupon_code', '=', code)], limit=1)
        if not part:
            raise UserError(_("Invalid coupon code '%s'.", code))
        if part.approval_state == 'rejected':
            raise UserError(_("Coupon code '%s' is not valid.", code))
        student = enrollment.student_id
        if _digits10(student.phone) and _digits10(student.phone) == _digits10(part.phone):
            raise UserError(_("A coupon cannot be used by its own owner."))
        clash = self.sudo().search([('student_id', '=', student.id), ('state', 'in', ('pending', 'approved'))], limit=1)
        if clash:
            raise UserError(_("%(s)s already has a coupon (%(c)s, %(st)s).",
                              s=student.name, c=clash.coupon_code, st=dict(self._fields['state'].selection)[clash.state]))
        usage = self.sudo().create({
            'coupon_code': code, 'participant_id': part.id, 'owner_name': part.name, 'owner_phone': part.phone,
            'owner_kind': part.kind, 'student_id': student.id, 'enrollment_id': enrollment.id,
            'requested_by': self.env.uid, 'source': source,
            'lead_id': lead.id if lead else False,
            'course_id': lead.course_inter[:1].id if lead and lead.course_inter else False})
        usage.message_post(body=_("Coupon %(c)s entered by %(u)s, waiting for approval.", c=code, u=self.env.user.name))
        return usage

    def _tuition_base(self):
        """Course tuition fee when set, else the enrollment fee (excl. GST unless the setting says otherwise)."""
        self.ensure_one()
        if self.course_id and self.course_id.tuition_fee > 0:
            return self.course_id.tuition_fee
        cfg = self.env['otm.coupon.config']._get()
        enr = self.enrollment_id
        base = enr.total_fee
        if cfg.base == 'excl':
            try:
                rate = float(enr.gst_rate or 0)
            except ValueError:
                rate = 0.0
            base = round(base / (1 + rate / 100.0), 2) if rate else base
        return base

    # ------------------------------------------------------------ approval
    def _need_approver(self):
        if not self.env.user.has_group('otm_teacher_coupon.group_coupon_approver'):
            raise UserError(_("Only a Coupon Approver can do this."))

    def _lock_owner(self):
        self.env.cr.execute("SELECT id FROM otm_wm_participant WHERE id = %s FOR UPDATE", [self.participant_id.id])

    def action_approve(self):
        self._need_approver()
        for rec in self.sudo():
            if rec.state != 'pending':
                raise UserError(_("Only pending coupons can be approved."))
            rec._lock_owner()                     # two approvers at once must not both take slot 3
            cfg = self.env['otm.coupon.config']._get()
            enr = rec.enrollment_id
            used = self.sudo().search_count([('participant_id', '=', rec.participant_id.id), ('state', '=', 'approved')])
            slot = used + 1
            base = rec._tuition_base()
            if rec.owner_kind == 'teacher':
                pct = cfg.discount_pct if (cfg.discount_enabled and slot <= cfg.discount_slots) else 0.0
                ref_pct = cfg.referral_pct if (cfg.referral_enabled and (not cfg.referral_max or slot <= cfg.referral_max)) else 0.0
            else:
                pct, ref_pct = cfg.student_pct, 0.0
            amount = round(base * pct / 100.0, 2)
            ref_amount = round(base * ref_pct / 100.0, 2)
            if amount:
                enr.write({'total_fee': round(enr.total_fee - amount, 2)})
            rec.write({'state': 'approved', 'approved_by': self.env.uid, 'approved_on': fields.Datetime.now(),
                       'slot_no': slot, 'discount_pct': pct, 'base_amount': base, 'tuition_base': base,
                       'discount_amount': amount, 'referral_pct': ref_pct, 'referral_amount': ref_amount})
            if ref_amount:
                self.env['otm.coupon.wallet.line'].sudo().create({
                    'participant_id': rec.participant_id.id, 'kind': 'referral', 'amount': ref_amount,
                    'usage_id': rec.id, 'note': rec.student_id.name})
            rec.message_post(body=_("Approved by %(u)s: use #%(n)s, student discount %(p)s%% = ₹%(a)s, teacher referral ₹%(r)s.",
                                    u=self.env.user.name, n=slot, p=pct, a=amount, r=ref_amount))
        return True

    def action_revoke(self):
        """Take an approved discount back (admission cancelled, wrong approval). The slot is freed."""
        self._need_approver()
        for rec in self.sudo():
            if rec.state != 'approved':
                raise UserError(_("Only approved coupons can be revoked."))
            rec._lock_owner()
            enr = rec.enrollment_id
            enr.write({'total_fee': round(enr.total_fee + rec.discount_amount, 2)})
            rec.write({'state': 'revoked'})
            self.env['otm.coupon.wallet.line'].sudo().search([('usage_id', '=', rec.id), ('state', '=', 'active')]).write({'state': 'cancelled'})
            rec.message_post(body=_("Revoked by %s. Discount added back to the fee.", self.env.user.name))
        return True

    def action_reject_wizard(self):
        self._need_approver()
        return {'type': 'ir.actions.act_window', 'name': _('Reject Coupon'), 'res_model': 'otm.coupon.reject.wizard',
                'view_mode': 'form', 'target': 'new', 'context': {'default_usage_id': self.id}}
