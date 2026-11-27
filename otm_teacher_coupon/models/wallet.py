from odoo import api, fields, models


class CouponWalletLine(models.Model):
    """One row of a teacher's referral wallet: money earned (referral), paid out (payout) or adjusted."""
    _name = 'otm.coupon.wallet.line'
    _description = 'Referral Wallet Entry'
    _order = 'id desc'

    participant_id = fields.Many2one('otm.wm.participant', string="Teacher", required=True, index=True, ondelete='restrict')
    kind = fields.Selection([('referral', 'Referral earned'), ('payout', 'Paid out'), ('adjust', 'Adjustment (+/−)')],
                            required=True, default='referral')
    amount = fields.Float(string="Amount ₹", digits=(10, 2), required=True,
                          help="Enter a positive number. A payout is subtracted from the balance automatically.")
    signed_amount = fields.Float(compute='_compute_signed', store=True, digits=(10, 2), string="Balance effect ₹")
    state = fields.Selection([('active', 'Active'), ('cancelled', 'Cancelled')], default='active', required=True)
    usage_id = fields.Many2one('otm.coupon.usage', ondelete='set null', index=True)
    note = fields.Char()
    date = fields.Datetime(default=fields.Datetime.now)

    @api.depends('kind', 'amount', 'state')
    def _compute_signed(self):
        for r in self:
            if r.state == 'cancelled':
                r.signed_amount = 0.0
            else:
                r.signed_amount = -abs(r.amount) if r.kind == 'payout' else r.amount
