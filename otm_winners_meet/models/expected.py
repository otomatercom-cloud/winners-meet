from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from .utils import normalize_phone


class WmExpected(models.Model):
    _name = 'otm.wm.expected'
    _description = 'Expected Winner (pre-uploaded)'
    _order = 'sequence, id'

    event_id = fields.Many2one('otm.wm.event', required=True, ondelete='cascade', index=True)
    name = fields.Char(required=True)
    phone = fields.Char(index=True, help="Optional. Without it the student is matched by name + course + category.")
    category_id = fields.Many2one(
        'otm.wm.category', required=True, ondelete='restrict',
        domain="[('event_id', '=', event_id), ('kind', '=', 'student')]")

    is_demo = fields.Boolean(default=False, copy=False)
    sequence = fields.Integer(default=100, help="Announcement order inside the category (lower = called first).")
    missed = fields.Boolean(default=False, copy=False, help="Was not on stage when the category was announced; collects at the very end.")
    missed_on = fields.Datetime(copy=False)

    reserved_seat_id = fields.Many2one(
        'otm.wm.seat', string="Reserved Seat", ondelete='set null', copy=False,
        domain="[('event_id', '=', event_id)]",
        help="Pre-set seat. The student gets exactly this seat at check-in.")

    _phone_uniq = models.Constraint('unique(event_id, phone)', 'This phone is already in the expected list.')
    _seat_uniq = models.Constraint('unique(reserved_seat_id)', 'This seat is already reserved for another winner.')

    @api.model
    def _link_map(self, event):
        """Returns f(expected) -> registered participant (or empty): linked entry first, then same phone."""
        parts = self.env['otm.wm.participant'].sudo().search([('event_id', '=', event.id)])
        by_exp = {p.expected_id.id: p for p in parts if p.expected_id}
        by_phone = {p.phone: p for p in parts}
        empty = self.env['otm.wm.participant']
        return lambda e: by_exp.get(e.id) or (by_phone.get(e.phone) if e.phone else None) or empty

    @api.model
    def _status(self, participant):
        """gray = not registered, red = registered but not here, green = checked in."""
        if not participant:
            return 'gray'
        return 'green' if participant.state == 'checked_in' else 'red'

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            vals['phone'] = self._norm(vals.get('phone')) if (vals.get('phone') or '').strip() else False
        return super().create(vals_list)

    def write(self, vals):
        if 'phone' in vals:
            vals['phone'] = self._norm(vals['phone']) if (vals['phone'] or '').strip() else False
        return super().write(vals)

    @api.model
    def _norm(self, raw):
        phone = normalize_phone(raw)
        if not phone:
            raise ValidationError(_("Invalid phone number: %s", raw or ''))
        return phone
