import json
import re

from odoo.exceptions import UserError
from odoo import _, api, fields, models

# Registration form fields an admin can switch: off / optional / required.
FORM_FIELDS = ('place', 'institution', 'email', 'photo', 'food_pref', 'accompany', 'instagram')
FORM_DEFAULTS = {
    'student': {'place': 'optional', 'institution': 'off', 'email': 'off', 'photo': 'off',
                'food_pref': 'off', 'accompany': 'optional', 'instagram': 'required'},
    'teacher': {'place': 'off', 'institution': 'optional', 'email': 'off', 'photo': 'required',
                'food_pref': 'required', 'accompany': 'off', 'instagram': 'off'},
}

DEFAULT_STAGE_DONE_MSG = (
    "Stage update: the {category} announcement at {event} is complete. "
    "Trophies collected: {collected}. Moved to the Missed list: {missed}.")
DEFAULT_STAGE_LATE_MSG = (
    "Stage update: {name} ({category}) arrived after the {category} announcement at {event}. "
    "Added to the Missed list for collection at the end.")
DEFAULT_CONFIRM_MSG = (
    "Hi {name}, your registration for {event} on {date} at {venue} is confirmed. "
    "Your entry pass: {link}")
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
    wa_tpl_stage_done = fields.Char(string="Staff: Category Complete Template", help="Variables: 1 category, 2 collected, 3 missed, 4 event.")
    wa_tpl_stage_late = fields.Char(string="Staff: Late Arrival Template", help="Variables: 1 name, 2 category, 3 event.")
    staff_ids = fields.One2many('otm.wm.staff', 'event_id', string="Stage Staff WhatsApp")
    wa_seat_hat_param = fields.Boolean(
        string="Seat Template Has Hat Note",
        help="On: seat template has 5 variables (name, seat, event, hat note, link). "
             "Off: 4 variables (name, seat, event, link).")
    slug = fields.Char(string="Public URL Name", index=True, copy=False,
                       help="Used in the registration link: /e/<slug>/register. Letters, numbers and dashes.")
    form_student = fields.Text(string="Student Form Fields (JSON)")
    form_teacher = fields.Text(string="Teacher Form Fields (JSON)")
    item_ids = fields.One2many('otm.wm.item', 'event_id', string="Kit Items")
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

    def form_config(self, kind):
        """Per-field mode (off/optional/required) for the public form, defaults filled in."""
        self.ensure_one()
        cfg = dict(FORM_DEFAULTS[kind])
        try:
            saved = json.loads((self.form_teacher if kind == 'teacher' else self.form_student) or '{}')
        except ValueError:
            saved = {}
        for k in FORM_FIELDS:
            if saved.get(k) in ('off', 'optional', 'required'):
                cfg[k] = saved[k]
        return cfg

    _slug_uniq = models.Constraint('unique(slug)', 'This public URL name is already used by another event.')

    @api.model
    def _slugify(self, text):
        return re.sub(r'[^a-z0-9]+', '-', (text or '').lower()).strip('-')[:60]

    def ensure_slug(self):
        """Give every event a unique, URL-safe name (events made before this feature get one lazily)."""
        for rec in self.sudo():
            if rec.slug:
                continue
            base = self._slugify(rec.name) or 'event'
            slug, n = base, 2
            while self.sudo().search_count([('slug', '=', slug), ('id', '!=', rec.id)]):
                slug, n = '%s-%s' % (base, n), n + 1
            rec.slug = slug

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('slug'):
                vals['slug'] = self._slugify(vals['slug'])
        recs = super().create(vals_list)
        recs.ensure_slug()
        return recs

    def write(self, vals):
        if 'slug' in vals:
            vals['slug'] = self._slugify(vals['slug']) or False
        res = super().write(vals)
        if 'slug' in vals:
            self.ensure_slug()
        return res


    # ------------------------------------------------------------ demo data
    def demo_counts(self):
        self.ensure_one()
        return {
            'people': self.env['otm.wm.participant'].sudo().search_count([('event_id', '=', self.id), ('is_demo', '=', True)]),
            'winners': self.env['otm.wm.expected'].sudo().search_count([('event_id', '=', self.id), ('is_demo', '=', True)]),
        }

    def action_demo_load(self):
        """Fake courses, categories, winners list and attendees to try the stage screens. Never sends WhatsApp."""
        self.ensure_one()
        if self.demo_counts()['winners']:
            raise UserError(_("Demo data is already loaded. Delete it first to load it again."))
        env = self.env
        Block, Course, Cat = env['otm.wm.seat.block'].sudo(), env['otm.wm.course'].sudo(), env['otm.wm.category'].sudo()
        Exp, Part = env['otm.wm.expected'].sudo(), env['otm.wm.participant'].sudo()
        if Block.search_count([('event_id', '=', self.id), ('prefix', '=', 'DM')]):
            raise UserError(_("Seat prefix 'DM' is already used in this event."))
        block = Block.create({'event_id': self.id, 'name': 'DEMO seats', 'prefix': 'DM', 'start_no': 1, 'end_no': 40,
                              'row_layout': '5,5', 'row_names': 'A,B,C,D', 'sequence': 900, 'is_demo': True})
        plan = [
            ('DEMO · CMA USA', 1, [('Fully Qualified (Demo)', 10, '#4f46e5', [
                ('Anita Menon', 'in', '9000000001'), ('Rahul Nair', 'in', '9000000002'), ('Sneha Pillai', 'reg', '9000000003'),
                ('Arjun Das', 'none', None), ('Meera Joseph', 'in', ''), ('Fahad Ali', 'done', '9000000006')]),
                ('Partly Qualified (Demo)', 20, '#059669', [
                    ('Kiran Raj', 'in', '9000000011'), ('Divya Suresh', 'in', ''), ('Faisal K', 'reg', '9000000013'),
                    ('Lakshmi Prakash', 'none', None)])]),
            ('DEMO · ACCA', 2, [('Gold (Demo)', 10, '#d97706', [
                ('Thomas George', 'in', '9000000021'), ('Neha Varma', 'in', '9000000022'), ('Vishnu Mohan', 'none', None)])]),
        ]
        n = 0
        for cname, cseq, cats in plan:
            course = Course.create({'event_id': self.id, 'name': cname, 'sequence': 900 + cseq, 'is_demo': True})
            for catname, seq, color, people in cats:
                cat = Cat.create({'event_id': self.id, 'name': catname, 'course_id': course.id, 'sequence': seq, 'color': color,
                                  'seat_block_id': block.id, 'self_select': False, 'is_demo': True})
                for i, (name, mode, phone) in enumerate(people):
                    n += 1
                    entry = Exp.create({'event_id': self.id, 'name': name, 'category_id': cat.id, 'sequence': 10 * (i + 1),
                                        'phone': phone or False, 'is_demo': True})
                    if mode == 'none':
                        continue
                    p = Part.create({'event_id': self.id, 'kind': 'student', 'name': name,
                                     'phone': phone or '90000001%02d' % n, 'category_id': cat.id,
                                     'claimed_category_id': cat.id, 'approval_state': 'approved',
                                     'expected_id': entry.id, 'is_demo': True, 'registered_via': 'admin'})
                    if mode in ('in', 'done'):
                        p.action_check_in()
                    if mode == 'done':
                        p.action_trophy(True)
        # a teacher category: same queue, same colours
        tcat = Cat.create({'event_id': self.id, 'name': 'Teachers (Demo)', 'kind': 'teacher', 'sequence': 10, 'color': '#be185d',
                           'seat_block_id': block.id, 'self_select': False, 'is_demo': True})
        for i, (name, mode, phone) in enumerate([('Teacher Asha', 'in', '9000000031'), ('Teacher Biju', 'reg', ''),
                                                 ('Teacher Celine', 'none', None)]):
            entry = Exp.create({'event_id': self.id, 'name': name, 'category_id': tcat.id, 'sequence': 10 * (i + 1),
                                'phone': phone or False, 'is_demo': True})
            if mode == 'none':
                continue
            p = Part.create({'event_id': self.id, 'kind': 'teacher', 'name': name, 'phone': phone or '9000000039',
                             'category_id': tcat.id, 'claimed_category_id': tcat.id, 'approval_state': 'approved',
                             'expected_id': entry.id, 'is_demo': True, 'registered_via': 'admin'})
            if mode == 'in':
                p.action_check_in()
        return self.demo_counts()

    def action_demo_delete(self):
        self.ensure_one()
        env = self.env
        dom = [('event_id', '=', self.id), ('is_demo', '=', True)]
        env['otm.wm.participant'].sudo().search(dom).unlink()
        env['otm.wm.expected'].sudo().search(dom).unlink()
        env['otm.wm.category'].sudo().search(dom).unlink()
        env['otm.wm.course'].sudo().search(dom).unlink()
        env['otm.wm.seat.block'].sudo().search(dom).unlink()
        return self.demo_counts()
