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
    hat = fields.Boolean(string="Gets Hat", help="Hat is issued automatically at check-in.")
    hat_label = fields.Char(string="Hat Type")
    seat_block_id = fields.Many2one(
        'otm.wm.seat.block', string="Seat Block", ondelete='set null',
        domain="[('event_id', '=', event_id)]")
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


    @api.constrains('seat_block_id', 'event_id')
    def _check_block_event(self):
        for rec in self:
            if rec.seat_block_id and rec.seat_block_id.event_id != rec.event_id:
                raise ValidationError(_("Seat block must belong to the same event."))
