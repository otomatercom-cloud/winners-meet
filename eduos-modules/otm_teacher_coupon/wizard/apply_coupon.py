from odoo import fields, models


class CouponApplyWizard(models.TransientModel):
    _name = 'otm.coupon.apply.wizard'
    _description = 'Apply Coupon'

    enrollment_id = fields.Many2one('student.enrollment', required=True, readonly=True)
    coupon_code = fields.Char(required=True)

    def action_apply(self):
        self.ensure_one()
        self.env['otm.coupon.usage']._request(self.coupon_code, self.enrollment_id, source='Enrollment')
        return {'type': 'ir.actions.act_window_close'}


class CouponRejectWizard(models.TransientModel):
    _name = 'otm.coupon.reject.wizard'
    _description = 'Reject Coupon'

    usage_id = fields.Many2one('otm.coupon.usage', required=True)
    reason = fields.Char(required=True)

    def action_reject(self):
        self.ensure_one()
        usage = self.usage_id
        usage._need_approver()
        usage = usage.sudo()
        if usage.state != 'pending':
            from odoo.exceptions import UserError
            raise UserError("Only pending coupons can be rejected.")
        usage.write({'state': 'rejected', 'reject_reason': self.reason, 'approved_by': self.env.uid,
                     'approved_on': fields.Datetime.now()})
        usage.message_post(body="Rejected by %s: %s" % (self.env.user.name, self.reason))
        return {'type': 'ir.actions.act_window_close'}
