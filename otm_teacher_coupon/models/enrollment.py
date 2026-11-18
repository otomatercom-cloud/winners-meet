from odoo import fields, models


class StudentEnrollment(models.Model):
    _inherit = 'student.enrollment'

    coupon_usage_ids = fields.One2many('otm.coupon.usage', 'enrollment_id', string="Coupons")
    coupon_state = fields.Selection(
        [('none', 'No coupon'), ('pending', 'Coupon waiting approval'), ('approved', 'Coupon approved')],
        compute='_compute_coupon_state', string="Coupon")

    def _compute_coupon_state(self):
        for rec in self:
            states = rec.sudo().coupon_usage_ids.mapped('state')
            rec.coupon_state = 'approved' if 'approved' in states else ('pending' if 'pending' in states else 'none')

    def action_apply_coupon(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': 'Apply Coupon', 'res_model': 'otm.coupon.apply.wizard',
                'view_mode': 'form', 'target': 'new', 'context': {'default_enrollment_id': self.id}}
