from odoo import _, api, fields, models
from odoo.exceptions import UserError


class CouponPayoutWizard(models.TransientModel):
    _name = 'otm.coupon.payout.wizard'
    _description = 'Pay Teacher Wallet'

    participant_id = fields.Many2one('otm.wm.participant', required=True, readonly=True)
    balance = fields.Float(string="Wallet balance ₹", readonly=True, digits=(10, 2))
    amount = fields.Float(string="Amount transferred ₹", required=True, digits=(10, 2))
    reference = fields.Char(string="Transfer reference (UTR / UPI ref)", required=True)
    date = fields.Datetime(default=fields.Datetime.now, required=True)
    note = fields.Char(string="Note", default="Wallet transferred to bank account")

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)
        part = self.env['otm.wm.participant'].sudo().browse(res.get('participant_id') or self.env.context.get('default_participant_id'))
        if part.exists():
            res.update(participant_id=part.id, balance=part.wallet_balance, amount=part.wallet_balance)
        return res

    def action_confirm(self):
        self.ensure_one()
        if not self.env.user.has_group('otm_teacher_coupon.group_coupon_approver'):
            raise UserError(_("Only a Coupon Approver can record a wallet payout."))
        part = self.participant_id.sudo()
        balance = round(part.wallet_balance, 2)
        amount = round(self.amount, 2)
        if amount <= 0 or amount > balance:
            raise UserError(_("Amount must be more than 0 and not more than the wallet balance (₹%s).") % balance)
        Line = self.env['otm.coupon.wallet.line'].sudo()
        payout = Line.create({'participant_id': part.id, 'kind': 'payout', 'amount': amount, 'date': self.date,
                              'reference': (self.reference or '').strip(), 'note': self.note or ''})
        if amount == balance:       # full payout: every open credit becomes "paid"
            Line.search([('participant_id', '=', part.id), ('state', '=', 'active'), ('kind', 'in', ('referral', 'adjust')),
                         ('settled_by_id', '=', False), ('amount', '>', 0)]).write({'settled_by_id': payout.id})
        return {'type': 'ir.actions.act_window_close'}
