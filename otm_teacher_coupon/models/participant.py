from odoo import api, fields, models


class WmParticipant(models.Model):
    _inherit = 'otm.wm.participant'

    coupon_usage_ids = fields.One2many('otm.coupon.usage', 'participant_id', string="Coupon Uses")
    coupon_pending = fields.Integer(compute='_compute_coupon_stats', string="Pending")
    coupon_approved = fields.Integer(compute='_compute_coupon_stats', string="Approved Uses")
    coupon_discount_total = fields.Float(compute='_compute_coupon_stats', string="Total Discount ₹", digits=(10, 2))
    coupon_slots_left = fields.Integer(compute='_compute_coupon_stats', string="Discount Slots Left")
    wallet_line_ids = fields.One2many('otm.coupon.wallet.line', 'participant_id', string="Wallet")
    wallet_balance = fields.Float(compute='_compute_coupon_stats', string="Wallet Balance ₹", digits=(10, 2))

    @api.depends('coupon_usage_ids.state', 'coupon_usage_ids.discount_amount', 'wallet_line_ids.signed_amount')
    def _compute_coupon_stats(self):
        cfg = self.env['otm.coupon.config']._get()
        slots = cfg.discount_slots if cfg.discount_enabled else 0
        for rec in self:
            uses = rec.sudo().coupon_usage_ids
            ok = uses.filtered(lambda u: u.state == 'approved')
            rec.coupon_pending = len(uses.filtered(lambda u: u.state == 'pending'))
            rec.coupon_approved = len(ok)
            rec.coupon_discount_total = sum(ok.mapped('discount_amount'))
            rec.coupon_slots_left = max(0, slots - len(ok)) if rec.kind == 'teacher' else 0
            rec.wallet_balance = sum(rec.sudo().wallet_line_ids.mapped('signed_amount'))

    def action_pay_wallet(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_window', 'name': 'Pay wallet', 'res_model': 'otm.coupon.payout.wizard',
                'view_mode': 'form', 'target': 'new', 'context': {'default_participant_id': self.id}}
