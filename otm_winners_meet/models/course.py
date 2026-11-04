from odoo import _, api, fields, models


class WmCourse(models.Model):
    _name = 'otm.wm.course'
    _description = 'Winners Meet Course'
    _order = 'sequence, id'

    event_id = fields.Many2one('otm.wm.event', required=True, ondelete='cascade', index=True)
    name = fields.Char(string="Course Name", required=True)
    code = fields.Char()
    sequence = fields.Integer(default=10)
    category_ids = fields.One2many('otm.wm.category', 'course_id', string="Subcategories")

    _name_uniq = models.Constraint('unique(event_id, name)', 'Course name must be unique per event.')
