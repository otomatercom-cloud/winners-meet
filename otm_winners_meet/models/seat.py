from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError


class WmSeatBlock(models.Model):
    _name = 'otm.wm.seat.block'
    _description = 'Seat Block'
    _order = 'event_id, name'

    event_id = fields.Many2one('otm.wm.event', required=True, ondelete='cascade', index=True)
    name = fields.Char(required=True)
    prefix = fields.Char(required=True, default='S', help="Seat label = prefix + number, e.g. S45")
    start_no = fields.Integer(string="Start Seat", required=True, default=1)
    end_no = fields.Integer(string="End Seat", required=True, default=100)
    row_size = fields.Integer(string="Seats per Row", help="0 = no rows. E.g. 14: seats 1-14 are row 1, 15-28 row 2...")
    seat_ids = fields.One2many('otm.wm.seat', 'block_id', string="Seats")

    _name_uniq = models.Constraint('unique(event_id, name)', 'Block name must be unique per event.')

    @api.constrains('start_no', 'end_no', 'row_size')
    def _check_range(self):
        for rec in self:
            if rec.row_size < 0 or rec.row_size > 500:
                raise ValidationError(_("Seats per row must be between 0 and 500."))
            if rec.start_no < 0 or rec.end_no < rec.start_no:
                raise ValidationError(_("End seat must be greater than or equal to start seat."))
            if rec.end_no - rec.start_no >= 5000:
                raise ValidationError(_("A block can hold at most 5000 seats."))

    @api.model_create_multi
    def create(self, vals_list):
        blocks = super().create(vals_list)
        blocks._sync_seats()
        return blocks

    def write(self, vals):
        res = super().write(vals)
        if {'start_no', 'end_no', 'prefix'} & set(vals):
            self._sync_seats()
        elif 'row_size' in vals:
            self.seat_ids.invalidate_recordset(['row_no'])
        return res

    def _sync_seats(self):
        """Create the seats of the range; remove seats outside it (only if unoccupied)."""
        Seat = self.env['otm.wm.seat']
        for block in self:
            wanted = set(range(block.start_no, block.end_no + 1))
            existing = {s.number: s for s in block.seat_ids}
            todo = [{'block_id': block.id, 'number': n} for n in sorted(wanted - set(existing))]
            if todo:
                Seat.create(todo)
            outside = Seat.browse([s.id for n, s in existing.items() if n not in wanted])
            if outside:
                if outside.participant_ids:
                    raise UserError(_("Seats outside the new range are occupied; free them first."))
                outside.unlink()
            block.seat_ids.invalidate_recordset(['label', 'row_no'])


class WmSeat(models.Model):
    _name = 'otm.wm.seat'
    _description = 'Seat'
    _order = 'block_id, number'

    block_id = fields.Many2one('otm.wm.seat.block', required=True, ondelete='cascade', index=True)
    event_id = fields.Many2one(related='block_id.event_id', store=True, index=True)
    number = fields.Integer(required=True)
    label = fields.Char(compute='_compute_label', store=True, index=True)
    row_no = fields.Integer(compute='_compute_row', store=True, string="Row")
    blocked = fields.Boolean(default=False, help="Reserved / unusable seat, never assigned automatically.")
    participant_ids = fields.One2many('otm.wm.participant', 'seat_id', string="Occupants")

    _block_number_uniq = models.Constraint('unique(block_id, number)', 'Duplicate seat number in block.')
    _event_label_uniq = models.Constraint(
        'unique(event_id, label)', 'Seat label already used in this event (check block prefixes/ranges).')

    @api.depends('block_id.prefix', 'number')
    def _compute_label(self):
        for seat in self:
            seat.label = '%s%s' % (seat.block_id.prefix or '', seat.number)

    @api.depends('number', 'block_id.row_size', 'block_id.start_no')
    def _compute_row(self):
        for seat in self:
            size = seat.block_id.row_size
            seat.row_no = ((seat.number - seat.block_id.start_no) // size + 1) if size else 0

    def display_label(self):
        """'G12 (Row 1)' when the block has rows, else just the label."""
        self.ensure_one()
        return '%s (Row %s)' % (self.label, self.row_no) if self.row_no else (self.label or '')
