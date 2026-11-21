import secrets

from odoo import api, fields, models


class WmChecklistItem(models.Model):
    """One thing to take to the event ("Banner", "Trophies x 40"). Staff tick it once packed."""
    _name = 'otm.wm.checklist.item'
    _description = 'Winners Meet Checklist Item'
    _order = 'section, sequence, id'

    event_id = fields.Many2one('otm.wm.event', required=True, ondelete='cascade', index=True)
    name = fields.Char(required=True)
    qty = fields.Char(string="Quantity / note")
    section = fields.Char(help="Group heading, e.g. Stage, Registration desk")
    sequence = fields.Integer(default=10)
    done = fields.Boolean()
    done_by = fields.Many2one('res.users', readonly=True)
    done_on = fields.Datetime(readonly=True)

    def set_done(self, value):
        for r in self:
            r.write({'done': bool(value), 'done_by': self.env.uid if value else False,
                     'done_on': fields.Datetime.now() if value else False})


class WmEvent(models.Model):
    _inherit = 'otm.wm.event'

    checklist_ids = fields.One2many('otm.wm.checklist.item', 'event_id')
    checklist_token = fields.Char(copy=False, index=True, readonly=True)
    checklist_public = fields.Boolean(string="Public checklist link on", default=True)

    def ensure_checklist_token(self):
        for e in self.sudo():
            if not e.checklist_token:
                e.checklist_token = secrets.token_urlsafe(16)
        return self

    def regenerate_checklist_token(self):
        for e in self.sudo():
            e.checklist_token = secrets.token_urlsafe(16)
        return self
