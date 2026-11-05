from odoo import _, api, fields, models


class WmItem(models.Model):
    """Kit item handed to winners and collected back later (convocation hat, shawl ...)."""
    _name = 'otm.wm.item'
    _description = 'Winners Meet Kit Item'
    _order = 'sequence, id'

    event_id = fields.Many2one('otm.wm.event', required=True, ondelete='cascade', index=True)
    name = fields.Char(required=True)
    sequence = fields.Integer(default=10)
    quantity = fields.Integer(string="Stock Quantity", help="How many pieces you have in total.")
    issue_ids = fields.One2many('otm.wm.issue', 'item_id', string="Issues")

    _name_uniq = models.Constraint('unique(event_id, name)', 'Item name must be unique per event.')

    def stats(self):
        """Inventory numbers per item. 'available' = stock - currently with people - lost."""
        self.ensure_one()
        Issue = self.env['otm.wm.issue'].sudo()
        Participant = self.env['otm.wm.participant'].sudo()
        by_state = {s: Issue.search_count([('item_id', '=', self.id), ('state', '=', s)])
                    for s in ('issued', 'returned', 'lost')}
        cats = self.env['otm.wm.category'].sudo().search([('item_ids', 'in', self.id)])
        needed = Participant.search_count([
            ('event_id', '=', self.event_id.id), ('category_id', 'in', cats.ids),
            ('approval_state', '=', 'approved')])
        given = sum(by_state.values())
        available = self.quantity - by_state['issued'] - by_state['lost']
        return {
            'id': self.id, 'name': self.name, 'quantity': self.quantity, 'needed': needed,
            'given': given, 'out': by_state['issued'], 'returned': by_state['returned'],
            'lost': by_state['lost'], 'available': available,
            'to_give': max(needed - given, 0), 'short': max(max(needed - given, 0) - available, 0),
        }


class WmIssue(models.Model):
    _name = 'otm.wm.issue'
    _description = 'Kit Item Issued To Participant'
    _order = 'id'

    participant_id = fields.Many2one('otm.wm.participant', required=True, ondelete='cascade', index=True)
    item_id = fields.Many2one('otm.wm.item', required=True, ondelete='restrict', index=True)
    event_id = fields.Many2one(related='participant_id.event_id', store=True, index=True)
    state = fields.Selection(
        [('issued', 'Issued'), ('returned', 'Returned'), ('lost', 'Lost')], default='issued', required=True, index=True)
    issued_on = fields.Datetime(default=fields.Datetime.now)
    returned_on = fields.Datetime()

    _uniq = models.Constraint('unique(participant_id, item_id)', 'This item is already issued to the participant.')
