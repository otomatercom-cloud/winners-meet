from odoo import api, fields, models


class CouponConfig(models.Model):
    _name = 'otm.coupon.config'
    _description = 'Coupon Settings'

    name = fields.Char(default='Coupon Settings', readonly=True)
    # Student discount for students who join through a TEACHER's code
    discount_enabled = fields.Boolean(string="Student discount on", default=True)
    discount_slots = fields.Integer(string="Students per teacher who get the discount", default=3)
    discount_pct = fields.Float(string="Student discount % (of tuition fee)", default=10.0)
    # Referral amount credited to the teacher's wallet
    referral_enabled = fields.Boolean(string="Teacher referral amount on", default=True)
    referral_pct = fields.Float(string="Teacher referral % (of tuition fee)", default=10.0)
    referral_max = fields.Integer(string="Max referrals paid per teacher", default=0, help="0 = no limit")
    # Codes owned by a STUDENT (WMS-...) keep a flat discount
    student_pct = fields.Float(string="Student-owned code discount %", default=10.0)
    base = fields.Selection(
        [('incl', 'Total fee including GST'), ('excl', 'Fee excluding GST')],
        string="Fallback base (when the course has no tuition fee set)", default='excl', required=True)

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
