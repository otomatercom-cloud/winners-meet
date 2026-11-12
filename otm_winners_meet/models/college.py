from odoo import api, fields, models, _
from odoo.exceptions import ValidationError

PROOF_PARAM = 'otm_winners_meet.visit_proof'
PROOF_MODES = ('none', 'photo', 'gps', 'both')


class WmCollege(models.Model):
    """College list for Marketing Managers' visit tracking (global, not tied to one event)."""
    _name = 'otm.wm.college'
    _description = 'College (visit tracking)'
    _order = 'district, name'

    name = fields.Char(string="College", required=True, index=True)
    district = fields.Char(index=True)
    college_type = fields.Char(string="Type")
    address = fields.Char()
    phone = fields.Char()
    email = fields.Char()
    contact_person = fields.Char(string="Known Contact")
    active = fields.Boolean(default=True)

    visit_ids = fields.One2many('otm.wm.visit', 'college_id', string="Visits")
    visit_count = fields.Integer(compute='_compute_visits', store=True)
    visited = fields.Boolean(compute='_compute_visits', store=True)
    last_visit_date = fields.Date(compute='_compute_visits', store=True)
    last_user_id = fields.Many2one('res.users', string="Last Visited By", compute='_compute_visits', store=True)
    last_person_met = fields.Char(compute='_compute_visits', store=True)

    _name_district_uniq = models.Constraint('unique(name, district)', 'This college is already in the list.')

    @api.depends('visit_ids.visit_date', 'visit_ids.user_id', 'visit_ids.person_met')
    def _compute_visits(self):
        for rec in self:
            visits = rec.visit_ids.sorted(lambda v: (v.visit_date or fields.Date.today(), v.id))
            last = visits[-1:]
            rec.visit_count = len(visits)
            rec.visited = bool(visits)
            rec.last_visit_date = last.visit_date if last else False
            rec.last_user_id = last.user_id if last else False
            rec.last_person_met = last.person_met if last else False

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            for k in ('name', 'district'):
                if vals.get(k):
                    vals[k] = ' '.join(str(vals[k]).split())
        return super().create(vals_list)

    @api.model
    def get_proof_mode(self):
        mode = self.env['ir.config_parameter'].sudo().get_param(PROOF_PARAM, 'none')
        return mode if mode in PROOF_MODES else 'none'

    @api.model
    def import_rows(self, rows):
        """rows: list of dicts with keys name/district/college_type/address/phone/email/contact_person."""
        existing = {(c.name.lower(), (c.district or '').lower())
                    for c in self.with_context(active_test=False).search([])}
        created = skipped = 0
        for r in rows:
            name = ' '.join(str(r.get('name') or '').split())
            if not name:
                continue
            district = ' '.join(str(r.get('district') or '').split()).title()
            key = (name.lower(), district.lower())
            if key in existing:
                skipped += 1
                continue
            existing.add(key)
            self.create({'name': name, 'district': district, 'college_type': r.get('college_type') or False,
                         'address': r.get('address') or False, 'phone': r.get('phone') or False,
                         'email': r.get('email') or False, 'contact_person': r.get('contact_person') or False})
            created += 1
        return {'created': created, 'skipped': skipped}


class WmVisit(models.Model):
    _name = 'otm.wm.visit'
    _description = 'College Visit'
    _order = 'visit_date desc, id desc'

    college_id = fields.Many2one('otm.wm.college', string="College", required=True, ondelete='cascade', index=True)
    district = fields.Char(related='college_id.district', store=True)
    user_id = fields.Many2one('res.users', string="Visited By", required=True, readonly=True,
                              default=lambda s: s.env.user, index=True)
    visit_date = fields.Date(required=True, default=fields.Date.context_today)
    person_met = fields.Char(required=True)
    designation = fields.Char()
    person_phone = fields.Char()
    notes = fields.Text()
    proof_photo = fields.Image(max_width=1280, max_height=1280, attachment=True)
    latitude = fields.Float(digits=(10, 6))
    longitude = fields.Float(digits=(10, 6))
    person_ids = fields.One2many('otm.wm.visit.person', 'visit_id', string="People met")

    @api.constrains('college_id', 'proof_photo', 'latitude', 'longitude')
    def _check_proof(self):
        mode = self.env['otm.wm.college'].get_proof_mode()
        for rec in self:
            if mode in ('photo', 'both') and not rec.proof_photo:
                raise ValidationError(_("Please attach a photo as proof of the visit."))
            if mode in ('gps', 'both') and not (rec.latitude or rec.longitude):
                raise ValidationError(_("Please capture your location as proof of the visit."))

    @api.model_create_multi
    def create(self, vals_list):
        if not self.env.user.has_group('otm_winners_meet.group_wm_manager'):
            for vals in vals_list:
                vals['user_id'] = self.env.uid      # a marketing manager can only log visits as themselves
        return super().create(vals_list)


class WmVisitPerson(models.Model):
    """Every person met during one college visit."""
    _name = 'otm.wm.visit.person'
    _description = 'Person met in a college visit'
    _order = 'id'

    visit_id = fields.Many2one('otm.wm.visit', required=True, ondelete='cascade', index=True)
    name = fields.Char(required=True)
    designation = fields.Char()
    phone = fields.Char()
