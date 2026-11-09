from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from .utils import normalize_phone


class WmContact(models.Model):
    _name = 'otm.wm.contact'
    _description = 'Marketing Manager (point of contact)'
    _order = 'sequence, name, id'

    event_id = fields.Many2one('otm.wm.event', required=True, ondelete='cascade', index=True)
    name = fields.Char(required=True)
    phone = fields.Char(string="Phone", help="Optional, only for the organisers. Never shown on the public form.")
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)

    _name_uniq = models.Constraint('unique(event_id, name)', 'This name is already in the list.')

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            vals['name'] = ' '.join((vals.get('name') or '').split())
            if vals.get('phone'):
                vals['phone'] = self._norm(vals['phone'])
        return super().create(vals_list)

    def write(self, vals):
        if vals.get('name'):
            vals['name'] = ' '.join(vals['name'].split())
        if vals.get('phone'):
            vals['phone'] = self._norm(vals['phone'])
        return super().write(vals)

    @api.model
    def _norm(self, raw):
        phone = normalize_phone(raw)
        if not phone:
            raise ValidationError(_("Invalid phone number: %s", raw or ''))
        return phone
