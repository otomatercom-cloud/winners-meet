import re

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError


class WmSeatBlock(models.Model):
    _name = 'otm.wm.seat.block'
    _description = 'Seat Block'
    _order = 'event_id, sequence, name'

    event_id = fields.Many2one('otm.wm.event', required=True, ondelete='cascade', index=True)
    sequence = fields.Integer(default=10, help="Display order on the seat map (stage side first).")
    is_demo = fields.Boolean(default=False, copy=False)
    name = fields.Char(required=True)
    prefix = fields.Char(required=True, default='S', help="Seat label = prefix + number, e.g. S45")
    start_no = fields.Integer(string="Start Seat", required=True, default=1)
    end_no = fields.Integer(string="End Seat", required=True, default=100)
    row_size = fields.Integer(string="Seats per Row", help="0 = no rows. E.g. 14: seats 1-14 are row 1, 15-28 row 2...")
    row_layout = fields.Char(string="Row Layout", help="Theatre sections per row, left to right, e.g. '13,13' or '7,13,7'. "
                             "A gap (aisle) is drawn between sections. Overrides Seats per Row.")
    row_names = fields.Char(string="Row Names", help="Optional names for the rows, in order, comma separated. "
                            "E.g. 'A,B,C,D' makes Row 1 = A, Row 2 = B... Rows without a name keep their number.")
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

    @api.constrains('prefix', 'start_no', 'end_no', 'event_id')
    def _check_overlap(self):
        for rec in self:
            for o in self.search([('event_id', '=', rec.event_id.id), ('id', '!=', rec.id), ('prefix', '=', rec.prefix)]):
                if rec.start_no <= o.end_no and o.start_no <= rec.end_no:
                    raise ValidationError(_(
                        "Seats %(a)s%(b)s-%(a)s%(c)s already exist in block '%(n)s'. Use a different prefix or "
                        "seat range, or edit that block instead.", a=rec.prefix, b=rec.start_no, c=rec.end_no, n=o.name))

    def action_delete_checked(self):
        for rec in self:
            if rec.seat_ids.participant_ids:
                raise UserError(_("Block '%s' has seated people. Move or undo their check-in first.", rec.name))
        self.unlink()

    @staticmethod
    def _parse_layout(text):
        parts = [p.strip() for p in re.split(r'[,\s+|/-]+', text or '') if p.strip()]
        if not parts or not all(p.isdigit() and 0 < int(p) <= 200 for p in parts) or len(parts) > 8:
            return []
        return [int(p) for p in parts]

    @api.constrains('row_layout')
    def _check_layout(self):
        for rec in self:
            if (rec.row_layout or '').strip() and not self._parse_layout(rec.row_layout):
                raise ValidationError(_("Row layout must be numbers separated by commas, e.g. 7,13,7."))

    def row_name_list(self):
        self.ensure_one()
        return [n.strip() for n in (self.row_names or '').split(',')]

    def layout_sections(self):
        self.ensure_one()
        return self._parse_layout(self.row_layout)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            sec = self._parse_layout(vals.get('row_layout'))
            if sec:
                vals['row_layout'] = ','.join(map(str, sec))
                vals['row_size'] = sum(sec)
        blocks = super().create(vals_list)
        blocks._sync_seats()
        return blocks

    def write(self, vals):
        if 'row_layout' in vals:
            sec = self._parse_layout(vals['row_layout'])
            if sec:
                vals['row_layout'] = ','.join(map(str, sec))
                vals['row_size'] = sum(sec)
            elif not (vals['row_layout'] or '').strip():
                vals['row_layout'] = False
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

    def check_for_category(self, category):
        """Raise unless this seat belongs to the category's block and seat range (no limits set = any seat)."""
        self.ensure_one()
        if not category or not category.seat_block_id:
            return True
        blk, lo, hi = category.seat_block_id, category.seat_from, category.seat_to
        if self.block_id != blk:
            raise ValidationError(_("Seat %(s)s is not in block '%(b)s' of category '%(c)s'.", s=self.label, b=blk.name, c=category.name))
        if (lo and self.number < lo) or (hi and self.number > hi):
            raise ValidationError(_("Seat %(s)s is outside the seats of category '%(c)s' (%(a)s-%(z)s).",
                                    s=self.label, c=category.name, a=lo or blk.start_no, z=hi or blk.end_no))
        return True

    def row_name(self):
        """Name of this seat's row: the custom name if the block has one, else the row number."""
        if not self or not self.row_no:
            return ''
        names = self.block_id.row_name_list()
        return (names[self.row_no - 1] if self.row_no <= len(names) and names[self.row_no - 1] else str(self.row_no))

    def display_label(self):
        """'G12 (Row 1)' when the block has rows, else just the label."""
        self.ensure_one()
        return '%s (Row %s)' % (self.label, self.row_name()) if self.row_no else (self.label or '')
