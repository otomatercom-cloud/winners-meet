from odoo import _, api, fields, models

DEFAULT_CONFIRM_MSG = (
    "Hi {name}, your registration for {event} on {date} at {venue} is confirmed. "
    "Show this entry pass at the desk: {link}")
DEFAULT_SEAT_MSG = (
    "Hi {name}, welcome to {event}! Your seat: {seat}. {hat} Entry pass: {link}")


class WmEvent(models.Model):
    _name = 'otm.wm.event'
    _description = 'Winners Meet Event'
    _order = 'date desc, id desc'

    name = fields.Char(required=True)
    date = fields.Date(required=True, default=fields.Date.context_today)
    time_text = fields.Char(string="Time", help="Shown to guests, e.g. 9:30 AM")
    venue = fields.Char()
    state = fields.Selection(
        [('draft', 'Draft'), ('open', 'Open'), ('closed', 'Closed')],
        default='draft', required=True)
    active = fields.Boolean(default=True)
    reg_student_open = fields.Boolean(string="Student Registration Open", default=True)
    reg_teacher_open = fields.Boolean(string="Teacher Registration Open", default=True)
    teacher_needs_approval = fields.Boolean(
        string="Teachers Need Approval",
        help="Off = teacher registrations are approved automatically.")
    frontend_url = fields.Char(
        string="Frontend URL",
        help="Public URL of the Next.js app, used for the entry-pass link in WhatsApp. "
             "e.g. https://winners.otomater.com")
    frontend_url_teacher = fields.Char(
        string="Teacher Frontend URL",
        help="Optional separate public URL for teachers' entry-pass links. Blank = same as Frontend URL.")
    wa_tpl_confirm = fields.Char(string="Student Confirm Template")
    wa_tpl_seat = fields.Char(string="Student Seat Template")
    wa_msg_confirm = fields.Text(string="Student Confirm Message", default=DEFAULT_CONFIRM_MSG)
    wa_msg_seat = fields.Text(string="Student Seat Message", default=DEFAULT_SEAT_MSG)
    wa_tpl_confirm_teacher = fields.Char(string="Teacher Confirm Template", help="Blank = use the student template.")
    wa_tpl_seat_teacher = fields.Char(string="Teacher Seat Template", help="Blank = use the student template.")
    wa_msg_confirm_teacher = fields.Text(string="Teacher Confirm Message", default=DEFAULT_CONFIRM_MSG)
    wa_msg_seat_teacher = fields.Text(string="Teacher Seat Message", default=DEFAULT_SEAT_MSG)
    course_ids = fields.One2many('otm.wm.course', 'event_id', string="Courses")
    category_ids = fields.One2many('otm.wm.category', 'event_id', string="Winner Categories")
    block_ids = fields.One2many('otm.wm.seat.block', 'event_id', string="Seat Blocks")

    def pass_url(self, token, kind='student'):
        self.ensure_one()
        base = ((kind == 'teacher' and self.frontend_url_teacher) or self.frontend_url or '').strip().rstrip('/')
        return '%s/pass/%s' % (base, token) if base else '/pass/%s' % token

    def date_text(self):
        self.ensure_one()
        text = self.date and fields.Date.to_string(self.date) or ''
        if self.date:
            text = self.date.strftime('%d %b %Y')
        return ('%s, %s' % (text, self.time_text)) if self.time_text else text
