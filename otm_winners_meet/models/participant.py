import logging
import secrets

import psycopg2

from odoo import _, api, fields, models
from odoo.exceptions import UserError, ValidationError
from .utils import name_score, normalize_phone

_logger = logging.getLogger(__name__)
NAME_MATCH_THRESHOLD = 0.8


def _new_token():
    return secrets.token_urlsafe(18)


class WmParticipant(models.Model):
    _name = 'otm.wm.participant'
    _description = 'Winners Meet Participant'
    _order = 'name, id'

    event_id = fields.Many2one('otm.wm.event', required=True, ondelete='cascade', index=True)
    kind = fields.Selection(
        [('student', 'Student'), ('teacher', 'Teacher')], required=True, default='student', index=True)
    name = fields.Char(required=True)
    phone = fields.Char(required=True, index=True)
    place = fields.Char()
    instagram = fields.Char(string="Instagram ID", help="Without the @. Used to tag the person in event photos.")
    institution = fields.Char()
    email = fields.Char()
    note = fields.Char()
    registered_via = fields.Selection(
        [('public', 'Public Form'), ('admin', 'Admin'), ('desk', 'Desk (on-spot)')], default='public')

    category_id = fields.Many2one(
        'otm.wm.category', string="Category", ondelete='restrict', index=True,
        domain="[('event_id', '=', event_id), ('kind', '=', kind)]")
    claimed_category_id = fields.Many2one(
        'otm.wm.category', string="Claimed Category", ondelete='set null')
    expected_id = fields.Many2one('otm.wm.expected', string="Expected Entry", ondelete='set null')
    match_status = fields.Selection(
        [('na', 'Not Checked'), ('matched', 'Matched'), ('name_mismatch', 'Name Mismatch'),
         ('category_mismatch', 'Category Mismatch'), ('not_listed', 'Not in Winners List')],
        default='na', index=True)
    match_note = fields.Char()
    approval_state = fields.Selection(
        [('pending', 'Needs Review'), ('approved', 'Approved'), ('rejected', 'Rejected')],
        default='pending', required=True, index=True)
    approved_by = fields.Many2one('res.users', ondelete='set null')
    approved_on = fields.Datetime()

    qr_token = fields.Char(string="QR Token", default=lambda self: _new_token(), copy=False,
                           readonly=True, index=True)
    state = fields.Selection(
        [('registered', 'Registered'), ('checked_in', 'Checked In')],
        default='registered', required=True, index=True)
    checkin_on = fields.Datetime()
    checkin_by = fields.Many2one('res.users', ondelete='set null')

    photo = fields.Image(string="Photo", max_width=600, max_height=600, copy=False)
    food_pref = fields.Selection([('veg', 'Vegetarian'), ('nonveg', 'Non-Vegetarian')], string="Food Preference")
    accompany_type = fields.Selection(
        [('none', 'Alone'), ('friend', 'With Friend'), ('guardian', 'With Guardian')],
        string="Accompanied By", default='none', required=True)
    accompany_count = fields.Integer(string="Accompanying Persons", default=0)

    @api.constrains('accompany_type', 'accompany_count')
    def _check_accompany(self):
        for rec in self:
            if rec.accompany_type == 'none' and rec.accompany_count:
                raise ValidationError(_("Accompanying count must be 0 when coming alone."))
            if rec.accompany_type != 'none' and not (1 <= rec.accompany_count <= 10):
                raise ValidationError(_("Accompanying persons must be between 1 and 10."))

    seat_id = fields.Many2one('otm.wm.seat', string="Seat", ondelete='restrict', copy=False, index=True)
    reserved_seat_id = fields.Many2one(
        'otm.wm.seat', string="Reserved Seat", ondelete='set null', copy=False, index=True,
        help="Pre-set seat (overrides the winners list). Given at check-in.")
    seat_label = fields.Char(related='seat_id.label', store=True, string="Seat No.")

    hat_required = fields.Boolean(related='category_id.hat', string="Hat Category")
    hat_state = fields.Selection(
        [('none', 'No Hat'), ('issued', 'Issued'), ('returned', 'Returned'), ('lost', 'Lost')],
        default='none', required=True, index=True)
    trophy_state = fields.Selection(
        [('pending', 'Not Collected'), ('given', 'Trophy Collected')], default='pending', required=True, index=True)
    trophy_on = fields.Datetime()
    trophy_by = fields.Many2one('res.users', ondelete='set null')
    issue_ids = fields.One2many('otm.wm.issue', 'participant_id', string="Kit Issued")
    hat_issued_on = fields.Datetime()
    hat_returned_on = fields.Datetime()

    wa_state = fields.Selection(
        [('none', 'None'), ('queued', 'Queued'), ('sent', 'Sent'), ('failed', 'Failed'), ('skipped', 'Skipped')],
        default='none', string="WhatsApp")
    log_ids = fields.One2many('otm.wm.message.log', 'participant_id', string="WhatsApp Messages")

    _event_phone_uniq = models.Constraint('unique(event_id, phone)', 'This phone number is already registered.')
    _token_uniq = models.Constraint('unique(qr_token)', 'QR token must be unique.')
    _reserved_uniq = models.Constraint('unique(reserved_seat_id)', 'This seat is already reserved for another participant.')
    _seat_uniq = models.Constraint('unique(seat_id)', 'This seat is already assigned to someone else.')

    # ------------------------------------------------------------ create / match
    @api.model_create_multi
    def create(self, vals_list):
        cc = self.env['otm.wm.message.log']._get_config()['country_code']
        for vals in vals_list:
            phone = normalize_phone(vals.get('phone'), cc)
            if not phone:
                raise ValidationError(_("Please enter a valid phone number."))
            vals['phone'] = phone
            if vals.get('name'):
                vals['name'] = ' '.join(vals['name'].split())
        recs = super().create(vals_list)
        if not self.env.context.get('wm_skip_eval'):
            recs._evaluate_approval()
        return recs

    def write(self, vals):
        if 'phone' in vals:
            cc = self.env['otm.wm.message.log']._get_config()['country_code']
            phone = normalize_phone(vals['phone'], cc)
            if not phone:
                raise ValidationError(_("Please enter a valid phone number."))
            vals['phone'] = phone
        return super().write(vals)

    def _evaluate_approval(self):
        """Auto-approve or flag for review. Never touches a decision a human already made."""
        Expected = self.env['otm.wm.expected'].sudo()
        for rec in self.filtered(lambda r: r.approval_state == 'pending'):
            event = rec.event_id
            status, note, exp = 'na', False, Expected
            auto = False
            if rec.kind == 'teacher':
                auto = not event.teacher_needs_approval
                if not rec.category_id:
                    rec.category_id = rec.claimed_category_id
            else:
                if not Expected.search_count([('event_id', '=', event.id)], limit=1):
                    auto = True  # no winners list uploaded: trust the self-selected category
                    rec.category_id = rec.claimed_category_id
                else:
                    exp = Expected.search([('event_id', '=', event.id), ('phone', '=', rec.phone)], limit=1)
                    if not exp:
                        exp = rec._match_unphoned_entry()
                    if not exp:
                        status = 'not_listed'
                        note = _("Not found in the uploaded winners list (phone or name + course + category).")
                    else:
                        score = name_score(rec.name, exp.name)
                        if score < NAME_MATCH_THRESHOLD:
                            status = 'name_mismatch'
                            note = _("Listed as '%(l)s' (%(c)s); registered as '%(r)s'.",
                                     l=exp.name, c=exp.category_id.name, r=rec.name)
                        elif rec.claimed_category_id and rec.claimed_category_id != exp.category_id:
                            status = 'category_mismatch'
                            note = _("Listed as %(c)s; student chose %(s)s.",
                                     c=exp.category_id.name, s=rec.claimed_category_id.name)
                        else:
                            status, auto = 'matched', True
                            if not exp.phone:
                                exp.write({'phone': rec.phone})     # remember the number once matched by name
                    rec.category_id = exp.category_id if (exp and status == 'matched') else rec.claimed_category_id
            rec.write({'match_status': status, 'match_note': note, 'expected_id': exp.id or False})
            if auto and rec.category_id:
                rec.write({'approval_state': 'approved', 'approved_on': fields.Datetime.now()})
                rec._queue_message('confirm')
        return True

    def _match_unphoned_entry(self):
        """Winners-list entry without a phone number whose name (and course/category) fits this student."""
        self.ensure_one()
        Expected = self.env['otm.wm.expected'].sudo()
        taken = self.sudo().search([('event_id', '=', self.event_id.id), ('expected_id', '!=', False)]).mapped('expected_id')
        best, best_score = Expected, 0.0
        for e in Expected.search([('event_id', '=', self.event_id.id), ('phone', '=', False)]) - taken:
            score = name_score(self.name, e.name)
            if self.claimed_category_id and e.category_id == self.claimed_category_id:
                score += 0.05            # same course + category wins ties
            if score >= NAME_MATCH_THRESHOLD and score > best_score:
                best, best_score = e, score
        return best

    def action_rematch_pending(self):
        """Re-run matching (e.g. after the winners list was uploaded) for pending rows."""
        self._evaluate_approval()

    # ------------------------------------------------------------ approval
    def action_approve(self, category_id=None):
        for rec in self:
            if rec.state == 'checked_in' and rec.approval_state == 'rejected':
                raise UserError(_("%s is checked in; cannot change.", rec.name))
            vals = {'approval_state': 'approved', 'approved_by': self.env.uid,
                    'approved_on': fields.Datetime.now()}
            if category_id:
                cat = self.env['otm.wm.category'].browse(int(category_id)).exists()
                if not cat or cat.event_id != rec.event_id or cat.kind != rec.kind:
                    raise UserError(_("Invalid category for this participant."))
                vals['category_id'] = cat.id
            if not (vals.get('category_id') or rec.category_id):
                raise UserError(_("Select a category before approving %s.", rec.name))
            was_approved = rec.approval_state == 'approved'
            rec.write(vals)
            if not was_approved:
                rec._queue_message('confirm')
        return True

    def action_reject(self):
        for rec in self:
            if rec.state == 'checked_in':
                raise UserError(_("%s is already checked in.", rec.name))
            rec.write({'approval_state': 'rejected', 'approved_by': self.env.uid,
                       'approved_on': fields.Datetime.now()})
        return True

    # ------------------------------------------------------------ seats
    def _lock_row(self):
        self.ensure_one()
        self.flush_recordset()
        self.env.cr.execute("SELECT id FROM otm_wm_participant WHERE id = %s FOR UPDATE", [self.id])
        self.invalidate_recordset()

    def _free_seat_ids(self, block, limit=60, lo=0, hi=0):
        self.env['otm.wm.participant'].flush_model(['seat_id', 'reserved_seat_id'])
        self.env['otm.wm.expected'].flush_model(['reserved_seat_id'])
        self.env['otm.wm.seat'].flush_model()
        self.env.cr.execute("""
            SELECT s.id FROM otm_wm_seat s
             WHERE s.block_id = %s AND NOT COALESCE(s.blocked, false)
               AND (%s = 0 OR s.number >= %s) AND (%s = 0 OR s.number <= %s)
               AND NOT EXISTS (SELECT 1 FROM otm_wm_participant p WHERE p.seat_id = s.id)
               AND NOT EXISTS (SELECT 1 FROM otm_wm_participant p WHERE p.reserved_seat_id = s.id)
               AND NOT EXISTS (SELECT 1 FROM otm_wm_expected x WHERE x.reserved_seat_id = s.id)
             ORDER BY s.number
             LIMIT %s""", [block.id, lo or 0, lo or 0, hi or 0, hi or 0, limit])
        return [r[0] for r in self.env.cr.fetchall()]

    def _preset_seat(self):
        """Seat fixed in advance: the participant's own, else the one on their winners-list entry."""
        self.ensure_one()
        return self.reserved_seat_id or self.expected_id.reserved_seat_id

    def _assign_auto_seat(self, block, lo=0, hi=0):
        """Next free seat of the block, safe when several desks check in at the same moment.

        Odoo transactions use REPEATABLE READ, so the free-seat list may be slightly stale (seats taken
        by a concurrent commit after our snapshot). The unique(seat_id) constraint is the real arbiter:
        try the candidates in order, each in a savepoint, until one is accepted.
        """
        self.ensure_one()
        candidates = self._free_seat_ids(block, lo=lo, hi=hi)
        if not candidates:
            if lo or hi:
                raise UserError(_("Seats %(a)s%(b)s-%(a)s%(c)s of block '%(n)s' are full. Pick another seat.",
                                  a=block.prefix or '', b=lo or block.start_no, c=hi or block.end_no, n=block.name))
            raise UserError(_("Seat block '%s' is full. Pick a seat from another block.", block.name))
        for seat_id in candidates:
            # lock only the seat we are about to try; skip seats another desk is taking right now
            self.env.cr.execute(
                "SELECT id FROM otm_wm_seat WHERE id = %s FOR UPDATE SKIP LOCKED", [seat_id])
            if not self.env.cr.fetchone():
                continue
            try:
                with self.env.cr.savepoint():
                    self.write({'seat_id': seat_id})
                    self.flush_recordset(['seat_id'])
                return self.seat_id
            except psycopg2.IntegrityError:
                self.invalidate_recordset(['seat_id'])
        raise UserError(_("Many people are checking in at once. Please tap Check-in again."))

    def _assign_manual_seat(self, seat_id):
        self.ensure_one()
        seat = self.env['otm.wm.seat'].browse(int(seat_id)).exists()
        if not seat or seat.event_id != self.event_id:
            raise UserError(_("Invalid seat."))
        self.env.cr.execute("SELECT id FROM otm_wm_seat WHERE id = %s FOR UPDATE", [seat.id])
        if seat.blocked:
            raise UserError(_("Seat %s is blocked.", seat.label))
        other = self.search([('seat_id', '=', seat.id), ('id', '!=', self.id)], limit=1)
        if other:
            raise UserError(_("Seat %(s)s is already taken by %(n)s.", s=seat.label, n=other.name))
        try:
            with self.env.cr.savepoint():
                self.write({'seat_id': seat.id})
                self.flush_recordset(['seat_id'])
        except psycopg2.IntegrityError:
            self.invalidate_recordset(['seat_id'])
            raise UserError(_("Seat %s was just taken by someone else. Pick another.", seat.label))
        return seat

    # ------------------------------------------------------------ check-in
    def action_check_in(self, seat_id=None):
        """Check in one participant. Idempotent. Returns {'already': bool}."""
        self.ensure_one()
        self._lock_row()
        if self.approval_state != 'approved':
            raise UserError(_("%s is not approved yet. Ask an admin to review the registration.", self.name))
        if self.state == 'checked_in':
            return {'already': True}
        cat = self.category_id
        preset = self._preset_seat()
        if seat_id:
            self._assign_manual_seat(seat_id)
        elif preset:
            self._assign_manual_seat(preset.id)
        elif cat.seat_block_id and cat.seat_mode == 'auto':
            self._assign_auto_seat(cat.seat_block_id, cat.seat_from, cat.seat_to)
        elif cat.seat_mode == 'manual':
            raise UserError(_("Select a seat for %s.", self.name))
        else:
            raise UserError(_("No seat block is configured for category '%s'.", cat.name))
        vals = {'state': 'checked_in', 'checkin_on': fields.Datetime.now(), 'checkin_by': self.env.uid}
        self.write(vals)
        self._issue_items()
        self._queue_message('seat')
        self._stage_on_checkin()
        return {'already': False}

    def _stage_on_checkin(self):
        """Arriving after the category's announcement: goes to the Missed list and the stage staff are told."""
        self.ensure_one()
        Exp = self.env['otm.wm.expected'].sudo()
        exp = self.expected_id or Exp.search([('event_id', '=', self.event_id.id), ('phone', '=', self.phone)], limit=1)
        if exp and exp.category_id.stage_closed and self.trophy_state != 'given':
            if not exp.missed:
                exp.write({'missed': True, 'missed_on': fields.Datetime.now()})
            self.env['otm.wm.message.log']._notify_stage_late(exp, self)

    def action_change_seat(self, seat_id):
        self.ensure_one()
        self._lock_row()
        if self.approval_state != 'approved':
            raise UserError(_("%s is not approved.", self.name))
        if self.seat_id and self.seat_id.id == int(seat_id):
            return True
        self._assign_manual_seat(seat_id)
        if self.state == 'checked_in':
            self._queue_message('seat')
        return True

    def action_undo_check_in(self):
        self.ensure_one()
        self._lock_row()
        if self.trophy_state == 'given':
            raise UserError(_("Trophy already collected; cannot undo check-in."))
        if self.sudo().issue_ids.filtered(lambda l: l.state in ('returned', 'lost')):
            raise UserError(_("Kit already returned or lost; cannot undo check-in."))
        self.sudo().issue_ids.unlink()
        self.write({'state': 'registered', 'checkin_on': False, 'checkin_by': False, 'seat_id': False})
        self._refresh_hat_state()
        return True

    # ------------------------------------------------------------ stage (trophy)
    def action_trophy(self, done=True):
        """Stage team marks that the winner has collected the trophy (only for people who are present)."""
        self.ensure_one()
        self._lock_row()
        if self.state != 'checked_in':
            raise UserError(_("%s has not checked in yet.", self.name))
        if done:
            if self.trophy_state != 'given':
                self.write({'trophy_state': 'given', 'trophy_on': fields.Datetime.now(), 'trophy_by': self.env.uid})
        else:
            self.write({'trophy_state': 'pending', 'trophy_on': False, 'trophy_by': False})
        return True

    # ------------------------------------------------------------ kit (hat, shawl ...)
    def _issue_items(self):
        """Create an 'issued' line for every kit item of the category that is not issued yet."""
        self.ensure_one()
        have = self.sudo().issue_ids.mapped('item_id')
        for item in self.category_id.item_ids - have:
            self.env['otm.wm.issue'].sudo().create({'participant_id': self.id, 'item_id': item.id})
        self._refresh_hat_state()

    def _refresh_hat_state(self):
        """hat_state summarises the kit: none / issued (something still out) / lost / returned."""
        for rec in self:
            lines = rec.sudo().issue_ids
            if not lines:
                vals = {'hat_state': 'none', 'hat_issued_on': False, 'hat_returned_on': False}
            else:
                states = lines.mapped('state')
                st = 'issued' if 'issued' in states else ('lost' if 'lost' in states else 'returned')
                vals = {'hat_state': st, 'hat_issued_on': min(lines.mapped('issued_on')),
                        'hat_returned_on': max([d for d in lines.mapped('returned_on') if d] or [False])
                        if st == 'returned' else False}
            rec.write(vals)

    def action_hat(self, action, item_id=None):
        """issue / return / lost for one kit item, or for all of them when item_id is empty."""
        self.ensure_one()
        self._lock_row()
        now = fields.Datetime.now()
        lines = self.sudo().issue_ids
        if item_id:
            lines = lines.filtered(lambda l: l.item_id.id == int(item_id))
        if action == 'issue':
            self._issue_items()
            if not self.sudo().issue_ids:
                raise UserError(_("No kit items are set for this category."))
            return True
        if not lines:
            raise UserError(_("Nothing was issued to %s.", self.name))
        if action == 'return':
            lines.filtered(lambda l: l.state != 'returned').write({'state': 'returned', 'returned_on': now})
        elif action == 'lost':
            lines.filtered(lambda l: l.state == 'issued').write({'state': 'lost'})
        else:
            raise UserError(_("Unknown kit action."))
        self._refresh_hat_state()
        return True

    # ------------------------------------------------------------ whatsapp
    def _queue_message(self, mtype, force=False):
        return self.env['otm.wm.message.log']._queue_for(self, mtype, force=force)
