from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class WmCategory(models.Model):
    _name = 'otm.wm.category'
    _description = 'Winner Category'
    _order = 'sequence, id'

    event_id = fields.Many2one('otm.wm.event', required=True, ondelete='cascade', index=True)
    name = fields.Char(string="Subcategory", required=True)
    course_id = fields.Many2one(
        'otm.wm.course', string="Course", ondelete='restrict', index=True,
        domain="[('event_id', '=', event_id)]")
    kind = fields.Selection(
        [('student', 'Student'), ('teacher', 'Teacher')], required=True, default='student')
    sequence = fields.Integer(default=10)
    color = fields.Char(default='#2563eb')
    item_ids = fields.Many2many(
        'otm.wm.item', 'otm_wm_category_item_rel', 'category_id', 'item_id', string="Kit Items",
        domain="[('event_id', '=', event_id)]", help="Issued automatically at check-in, collected back later.")
    hat = fields.Boolean(string="Gets Kit", compute='_compute_hat', store=True)
    hat_label = fields.Char(string="Kit", compute='_compute_hat', store=True)

    @api.depends('item_ids', 'item_ids.name')
    def _compute_hat(self):
        for rec in self:
            rec.hat = bool(rec.item_ids)
            rec.hat_label = ', '.join(rec.item_ids.mapped('name')) or False

    @api.constrains('item_ids', 'event_id')
    def _check_items_event(self):
        for rec in self:
            if any(i.event_id != rec.event_id for i in rec.item_ids):
                raise ValidationError(_("Kit items must belong to the same event."))
    seat_block_id = fields.Many2one(
        'otm.wm.seat.block', string="Seat Block", ondelete='set null',
        domain="[('event_id', '=', event_id)]")
    seat_from = fields.Integer(string="Seat From", help="Optional: first seat number this category may use inside the block (0 = start of block).")
    seat_to = fields.Integer(string="Seat To", help="Optional: last seat number this category may use inside the block (0 = end of block).")
    seat_mode = fields.Selection(
        [('auto', 'Automatic (next free seat)'), ('manual', 'Manual (desk picks seat)')],
        default='auto', required=True)
    self_select = fields.Boolean(
        string="Selectable at Registration", default=True,
        help="Students can pick this category on the public form.")

    @api.constrains('name', 'course_id', 'event_id')
    def _check_name_unique(self):
        for rec in self:
            if self.search_count([('event_id', '=', rec.event_id.id), ('course_id', '=', rec.course_id.id),
                                  ('name', '=ilike', rec.name), ('id', '!=', rec.id)]):
                raise ValidationError(_("'%s' already exists for this course.", rec.name))

    @api.constrains('course_id', 'event_id')
    def _check_course_event(self):
        for rec in self:
            if rec.course_id and rec.course_id.event_id != rec.event_id:
                raise ValidationError(_("Course must belong to the same event."))

    def full_name(self):
        self.ensure_one()
        return '%s · %s' % (self.course_id.name, self.name) if self.course_id else self.name


    @api.constrains('seat_from', 'seat_to')
    def _check_seat_range(self):
        for rec in self:
            if rec.seat_from < 0 or rec.seat_to < 0 or (rec.seat_from and rec.seat_to and rec.seat_to < rec.seat_from):
                raise ValidationError(_("Seat range is invalid: 'To' must not be smaller than 'From'."))

    @api.constrains('seat_block_id', 'event_id')
    def _check_block_event(self):
        for rec in self:
            if rec.seat_block_id and rec.seat_block_id.event_id != rec.event_id:
                raise ValidationError(_("Seat block must belong to the same event."))
