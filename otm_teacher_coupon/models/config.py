from odoo import api, fields, models


class CouponConfig(models.Model):
    _name = 'otm.coupon.config'
    _description = 'Coupon Settings'

    name = fields.Char(default='Coupon Settings', readonly=True)
    teacher_slots = fields.Integer(string="Teacher: students at the higher discount", default=3)
    teacher_pct = fields.Float(string="Teacher: higher discount %", default=20.0)
    teacher_after_pct = fields.Float(string="Teacher: discount % after the slots are used", default=10.0)
    student_pct = fields.Float(string="Student coupon discount %", default=10.0)
    base = fields.Selection(
        [('incl', 'Total fee including GST'), ('excl', 'Fee excluding GST')],
        string="Discount is calculated on", default='incl', required=True)

    @api.model
    def _get(self):
        return self.sudo().search([], limit=1) or self.sudo().new({})

    @api.model
    def action_open(self):
        rec = self._get()
        if not rec.id:
            rec = self.sudo().create({})
        return {'type': 'ir.actions.act_window', 'name': 'Coupon Settings', 'res_model': self._name,
                'view_mode': 'form', 'res_id': rec.id, 'target': 'current'}
