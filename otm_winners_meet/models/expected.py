from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from .utils import normalize_phone


class WmExpected(models.Model):
    _name = 'otm.wm.expected'
    _description = 'Expected Winner (pre-uploaded)'
    _order = 'name, id'

    event_id = fields.Many2one('otm.wm.event', required=True, ondelete='cascade', index=True)
    name = fields.Char(required=True)
    phone = fields.Char(required=True, index=True)
    category_id = fields.Many2one(
        'otm.wm.category', required=True, ondelete='restrict',
        domain="[('event_id', '=', event_id), ('kind', '=', 'student')]")

    reserved_seat_id = fields.Many2one(
        'otm.wm.seat', string="Reserved Seat", ondelete='set null', copy=False,
        domain="[('event_id', '=', event_id)]",
        help="Pre-set seat. The student gets exactly this seat at check-in.")

    _phone_uniq = models.Constraint('unique(event_id, phone)', 'This phone is already in the expected list.')
    _seat_uniq = models.Constraint('unique(reserved_seat_id)', 'This seat is already reserved for another winner.')

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            vals['phone'] = self._norm(vals.get('phone'))
        return super().create(vals_list)

    def write(self, vals):
        if 'phone' in vals:
            vals['phone'] = self._norm(vals['phone'])
        return super().write(vals)

    @api.model
    def _norm(self, raw):
        phone = normalize_phone(raw)
        if not phone:
            raise ValidationError(_("Invalid phone number: %s", raw or ''))
        return phone
