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
    stage_closed = fields.Boolean(string="Announcement Complete", copy=False)
    stage_closed_on = fields.Datetime(copy=False)
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

    # ------------------------------------------------------------ stage announcement
    def action_stage_close(self):
        """The category's announcement is over: whoever has not collected moves to the Missed list."""
        self.ensure_one()
        if self.stage_closed:
            return {'collected': 0, 'missed': 0}
        Exp = self.env['otm.wm.expected'].sudo()
        link = Exp._link_map(self.event_id)
        collected, missed = 0, Exp
        for e in Exp.search([('event_id', '=', self.event_id.id), ('category_id', '=', self.id)]):
            p = link(e)
            if p and p.trophy_state == 'given':
                collected += 1
            else:
                missed |= e
        now = fields.Datetime.now()
        missed.write({'missed': True, 'missed_on': now})
        self.sudo().write({'stage_closed': True, 'stage_closed_on': now})
        self.env['otm.wm.message.log']._notify_stage_done(self, collected, len(missed))
        return {'collected': collected, 'missed': len(missed)}

    def action_stage_reopen(self):
        self.ensure_one()
        Exp = self.env['otm.wm.expected'].sudo()
        Exp.search([('category_id', '=', self.id), ('missed', '=', True)]).write({'missed': False, 'missed_on': False})
        self.sudo().write({'stage_closed': False, 'stage_closed_on': False})
        return True

    def _stage_autoclose(self):
        """Close the category by itself once every winner of it has collected."""
        Exp = self.env['otm.wm.expected'].sudo()
        for cat in self.filtered(lambda c: not c.stage_closed):
            entries = Exp.search([('event_id', '=', cat.event_id.id), ('category_id', '=', cat.id)])
            if not entries:
                continue
            link = Exp._link_map(cat.event_id)
            if all(link(e).trophy_state == 'given' for e in entries):
                cat.action_stage_close()
