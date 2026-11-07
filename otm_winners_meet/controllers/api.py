"""JSON API for the Winners Meet Next.js (BFF) frontend.

Staff routes use the normal Odoo session (the Next.js server holds session_id, the browser never talks
to Odoo). Public routes (registration form, entry pass) are limited to what a guest may see.
"""
import functools
import json
import re
import logging

from odoo import _, fields, http
from odoo.exceptions import AccessError, MissingError, UserError, ValidationError
from odoo.http import request

from ..models.utils import normalize_phone

_logger = logging.getLogger(__name__)
P = '/api/wm'


def _resp(data, status=200):
    return request.make_json_response(data, status=status)


def _err(message, status=400, code=None):
    return _resp({'ok': False, 'error': message, 'code': code}, status)


def api(route, methods=('GET',), auth='user'):
    def deco(fn):
        # Registered as 'public' so an expired/missing session gets a JSON 401 (not a login redirect);
        # staff routes then enforce the real user themselves.
        @http.route(P + route, type='http', auth='public', methods=list(methods), csrf=False, readonly=False)
        @functools.wraps(fn)
        def wrapper(self, *args, **kw):
            if auth == 'user' and request.env.user._is_public():
                return _err(_("Session expired. Please sign in again."), 401, 'session')
            try:
                body = {}
                if request.httprequest.method in ('POST', 'PUT'):
                    body = request.httprequest.get_json(silent=True, force=True) or {}
                    if not isinstance(body, dict):
                        raise ValueError('body')
                return _resp({'ok': True, 'data': fn(self, *args, body=body, **kw)})
            except AccessError:
                request.env.cr.rollback()
                return _err(_("You do not have permission for this action."), 403)
            except MissingError:
                request.env.cr.rollback()
                return _err(_("Record not found."), 404)
            except (UserError, ValidationError) as e:
                request.env.cr.rollback()
                return _err(str(e.args[0]) if e.args else str(e), 400)
            except (ValueError, TypeError, KeyError) as e:
                request.env.cr.rollback()
                _logger.info("Winners Meet API bad request on %s: %r", route, e)
                return _err(_("Invalid request data."), 400)
            except Exception:  # noqa: BLE001
                _logger.exception("Winners Meet API error on %s", route)
                request.env.cr.rollback()
                return _err(_("Server error."), 500)
        return wrapper
    return deco


# ------------------------------------------------------------------ helpers
def _int(value, default=None):
    """Browser-supplied ids arrive as strings; never trust their type."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _is_manager():
    u = request.env.user
    return bool(request.env.is_superuser() or u.has_group('base.group_system')
                or u.has_group('otm_winners_meet.group_wm_manager'))


def _is_staff():
    return bool(_is_manager() or request.env.user.has_group('otm_winners_meet.group_wm_user'))


def _need_staff():
    if not _is_staff():
        raise AccessError(_("Winners Meet staff only."))


def _need_manager():
    if not _is_manager():
        raise AccessError(_("Administrators only."))


def _event(event_id=None, env=None):
    env = env or request.env
    Event = env['otm.wm.event']
    eid = _int(event_id)
    if eid:
        ev = Event.browse(eid).exists()
    else:
        ev = Event.search([('state', '=', 'open')], limit=1) or Event.search([], limit=1)
    if not ev:
        raise MissingError(_("No event found."))
    return ev


def _mask(phone):
    return ('*' * max(len(phone) - 4, 0) + phone[-4:]) if phone else ''


def _cat(c):
    return {'id': c.id, 'name': c.full_name(), 'sub': c.name, 'course_id': c.course_id.id or False,
            'course': c.course_id.name or '', 'kind': c.kind, 'color': c.color or '#2563eb', 'hat': c.hat,
            'item_ids': c.item_ids.ids, 'items': [{'id': i.id, 'name': i.name} for i in c.item_ids],
            'hat_label': c.hat_label or '', 'seat_mode': c.seat_mode, 'self_select': c.self_select,
            'seat_block_id': c.seat_block_id.id or False, 'seat_block': c.seat_block_id.name or '',
            'seat_from': c.seat_from or 0, 'seat_to': c.seat_to or 0, 'sequence': c.sequence,
            'course_sequence': c.course_id.sequence if c.course_id else 0, 'stage_closed': bool(c.stage_closed)}


def _event_dict(e):
    e.ensure_slug()
    return {'slug': e.slug or '', 'id': e.id, 'name': e.name, 'date': fields.Date.to_string(e.date), 'time': e.time_text or '',
            'venue': e.venue or '', 'state': e.state, 'reg_student_open': e.reg_student_open,
            'reg_teacher_open': e.reg_teacher_open, 'teacher_needs_approval': e.teacher_needs_approval,
            'frontend_url': e.frontend_url or '', 'frontend_url_teacher': e.frontend_url_teacher or '',
            'wa_tpl_confirm': e.wa_tpl_confirm or '', 'wa_tpl_seat': e.wa_tpl_seat or '',
            'wa_msg_confirm': e.wa_msg_confirm or '', 'wa_msg_seat': e.wa_msg_seat or '',
            'wa_seat_hat_param': bool(e.wa_seat_hat_param),
            'wa_tpl_stage_done': e.wa_tpl_stage_done or '', 'wa_tpl_stage_late': e.wa_tpl_stage_late or '',
            'form_student': e.form_config('student'), 'form_teacher': e.form_config('teacher'),
            'wa_tpl_confirm_teacher': e.wa_tpl_confirm_teacher or '', 'wa_tpl_seat_teacher': e.wa_tpl_seat_teacher or '',
            'wa_msg_confirm_teacher': e.wa_msg_confirm_teacher or '', 'wa_msg_seat_teacher': e.wa_msg_seat_teacher or ''}


def _p(p, detail=False):
    d = {
        'id': p.id, 'name': p.name, 'phone': p.phone, 'kind': p.kind, 'place': p.place or '',
        'institution': p.institution or '', 'state': p.state, 'approval_state': p.approval_state,
        'match_status': p.match_status, 'match_note': p.match_note or '',
        'category': _cat(p.category_id) if p.category_id else None,
        'claimed_category': _cat(p.claimed_category_id) if p.claimed_category_id else None,
        'seat': p.seat_id.label or '', 'seat_id': p.seat_id.id or False, 'seat_row': p.seat_id.row_no or 0, 'seat_row_name': p.seat_id.row_name(),
        'reserved_seat': p._preset_seat().label if _is_manager() else '',
        'reserved_seat_id': p._preset_seat().id if _is_manager() else False,
        'has_preset': bool(p._preset_seat()),
        'checkin_on': fields.Datetime.to_string(p.checkin_on) if p.checkin_on else '',
        'hat_state': p.hat_state, 'wa_state': p.wa_state, 'registered_via': p.registered_via,
        'food_pref': p.food_pref or '', 'instagram': p.instagram or '', 'accompany_type': p.accompany_type, 'accompany_count': p.accompany_count,
        'has_photo': bool(p.photo),
        'trophy_state': p.trophy_state, 'trophy_on': fields.Datetime.to_string(p.trophy_on) if p.trophy_on else '',
        'items': [{'item_id': l.item_id.id, 'name': l.item_id.name, 'state': l.state} for l in p.sudo().issue_ids],
        'create_date': fields.Datetime.to_string(p.create_date),
    }
    if detail:
        d.update({
            'email': p.email or '', 'note': p.note or '', 'token': p.qr_token,
            'photo': ('data:image/jpeg;base64,' + p.photo.decode()) if p.photo else '',
            'hat_issued_on': fields.Datetime.to_string(p.hat_issued_on) if p.hat_issued_on else '',
            'hat_returned_on': fields.Datetime.to_string(p.hat_returned_on) if p.hat_returned_on else '',
            'checkin_by': p.checkin_by.name or '', 'approved_by': p.approved_by.name or '',
            'expected': ({'name': p.expected_id.name, 'category': p.expected_id.category_id.full_name()}
                         if p.expected_id else None),
            'messages': [{'id': l.id, 'type': l.message_type, 'state': l.state, 'error': (l.error or '') if l.state == 'failed' else '',
                          'created': fields.Datetime.to_string(l.create_date), 'retries': l.retries}
                         for l in p.log_ids.sorted('id', reverse=True)[:10]],
        })
    return d


def _photo_from_body(raw, required=False):
    """Accept a base64 / data-URL image (already shrunk by the browser). Returns base64 str or False."""
    import base64
    import io
    if not raw:
        if required:
            raise UserError(_("Please upload your photo."))
        return False
    raw = str(raw)
    if raw.startswith('data:'):
        raw = raw.split(',', 1)[-1]
    if len(raw) > 3_000_000:
        raise UserError(_("Photo is too large. Please choose a smaller photo."))
    try:
        from PIL import Image
        data = base64.b64decode(raw, validate=False)
        Image.open(io.BytesIO(data)).verify()
    except Exception:  # noqa: BLE001 - any decoding problem means "not a usable image"
        raise UserError(_("That file is not a valid image. Please upload a JPG or PNG photo."))
    return base64.b64encode(data).decode()


def _participant(pid):
    p = request.env['otm.wm.participant'].browse(_int(pid, 0)).exists()
    if not p:
        raise MissingError(_("Participant not found."))
    return p


class WinnersMeetApi(http.Controller):

    # ============================================================ PUBLIC
    @api('/public/event', auth='public')
    def public_event(self, body=None, slug=None, **kw):
        """The event a public page is about: by ?slug=..., else the only open event, else a chooser list."""
        env = request.env(su=True)
        Event = env['otm.wm.event']
        slug = (slug or '').strip().lower()
        if slug:
            ev = Event.search([('slug', '=', slug)], limit=1)
            if not ev:
                for cand in Event.search([('slug', '=', False)]):   # events created before slugs existed
                    cand.ensure_slug()
                ev = Event.search([('slug', '=', slug)], limit=1)
            if not ev or ev.state != 'open':
                return {'event': None, 'closed': bool(ev), 'events': []}
        else:
            opens = Event.search([('state', '=', 'open')], order='date, id')
            opens.ensure_slug()
            if len(opens) > 1:
                return {'event': None, 'events': [
                    {'name': e.name, 'slug': e.slug, 'date': fields.Date.to_string(e.date),
                     'time': e.time_text or '', 'venue': e.venue or '',
                     'reg_student_open': e.reg_student_open, 'reg_teacher_open': e.reg_teacher_open} for e in opens]}
            ev = opens[:1]
            if not ev:
                return {'event': None, 'events': []}
        cats = ev.category_ids.filtered(lambda c: c.self_select)
        return {
            'event': {'id': ev.id, 'slug': ev.slug, 'name': ev.name, 'date': fields.Date.to_string(ev.date),
                      'time': ev.time_text or '', 'venue': ev.venue or '',
                      'reg_student_open': ev.reg_student_open, 'reg_teacher_open': ev.reg_teacher_open},
            'student_categories': [{'id': c.id, 'name': c.name, 'course_id': c.course_id.id or False, 'color': c.color}
                                 for c in cats if c.kind == 'student'],
            'form': {'student': ev.form_config('student'), 'teacher': ev.form_config('teacher')},
            'courses': [{'id': c.id, 'name': c.name, 'code': c.code or ''}
                        for c in ev.course_ids if any(k.kind == 'student' and k.self_select for k in c.category_ids)],
            'teacher_categories': [{'id': c.id, 'name': c.name, 'color': c.color} for c in cats if c.kind == 'teacher'],
        }

    @api('/public/register', methods=('POST',), auth='public')
    def public_register(self, body=None, **kw):
        env = request.env(su=True)
        if (body.get('website') or '').strip():      # honeypot
            return {'registered': True, 'approval_state': 'pending', 'token': False}
        ev = env['otm.wm.event'].browse(_int(body.get('event_id'), 0)).exists()
        if not ev or ev.state != 'open':
            raise UserError(_("Registration is not open."))
        kind = body.get('kind')
        if kind not in ('student', 'teacher'):
            raise UserError(_("Invalid registration type."))
        if (kind == 'student' and not ev.reg_student_open) or (kind == 'teacher' and not ev.reg_teacher_open):
            raise UserError(_("Registration is closed."))
        name = ' '.join((body.get('name') or '').split())
        if not (2 <= len(name) <= 100):
            raise UserError(_("Please enter your full name."))
        cc = env['otm.wm.message.log']._get_config()['country_code']
        phone = normalize_phone(body.get('phone'), cc)
        if not phone:
            raise UserError(_("Please enter a valid 10-digit mobile number."))
        cats = ev.category_ids.filtered(lambda c: c.kind == kind and c.self_select)
        cat = cats.filtered(lambda c: c.id == _int(body.get('category_id'), 0))
        if not cat:
            if kind == 'teacher':
                cat = cats[:1] or ev.category_ids.filtered(lambda c: c.kind == 'teacher')[:1]
                if not cat:
                    raise UserError(_("Teacher registration is not set up yet. Please contact the organisers."))
            else:
                raise UserError(_("Please select a category."))
        cfg = ev.form_config(kind)
        extra = {}
        labels = {'place': _("place"), 'institution': _("school / institution"), 'email': _("email"),
                  'photo': _("photo"), 'food_pref': _("food preference"), 'instagram': _("Instagram ID")}

        def need(field, value):
            if cfg[field] == 'required' and not value:
                raise UserError(_("Please provide your %s.", labels[field]))
        for fld, size in (('place', 120), ('institution', 160), ('email', 120)):
            val = (body.get(fld) or '').strip()[:size] if cfg[fld] != 'off' else ''
            need(fld, val)
            extra[fld] = val
        if cfg['instagram'] != 'off':
            ig = (body.get('instagram') or '').strip()
            ig = re.sub(r'^(https?://)?(www\.)?instagram\.com/', '', ig, flags=re.I).strip('/@ ').split('?')[0]
            need('instagram', ig)
            if ig and not re.fullmatch(r'[A-Za-z0-9._]{1,30}', ig):
                raise UserError(_("Please enter a valid Instagram ID (letters, numbers, dots and underscores only)."))
            extra['instagram'] = ig or False
        if cfg['food_pref'] != 'off':
            fp = body.get('food_pref')
            if fp not in ('veg', 'nonveg', '', None):
                raise UserError(_("Invalid food preference."))
            need('food_pref', fp)
            extra['food_pref'] = fp or False
        if cfg['photo'] != 'off':
            extra['photo'] = _photo_from_body(body.get('photo'), required=cfg['photo'] == 'required')
        if cfg['accompany'] != 'off':
            acc = body.get('accompany_type') or 'none'
            if acc not in ('none', 'friend', 'guardian'):
                raise UserError(_("Invalid selection."))
            cnt = _int(body.get('accompany_count'), 0) if acc != 'none' else 0
            if acc != 'none' and not (1 <= cnt <= 10):
                raise UserError(_("Please enter how many people are coming with you (1 to 10)."))
            extra.update(accompany_type=acc, accompany_count=cnt)
        existing = env['otm.wm.participant'].search([('event_id', '=', ev.id), ('phone', '=', phone)], limit=1)
        if existing:
            return {'registered': True, 'already': True, 'approval_state': existing.approval_state,
                    'token': existing.qr_token if existing.approval_state == 'approved' else False,
                    'message': _("This number is already registered. Your entry pass was sent on WhatsApp.")}
        p = env['otm.wm.participant'].create({
            'event_id': ev.id, 'kind': kind, 'name': name, 'phone': phone,
            'claimed_category_id': cat.id,
            'category_id': cat.id if kind == 'teacher' else False, 'registered_via': 'public', **extra})
        return {'registered': True, 'already': False, 'approval_state': p.approval_state,
                'token': p.qr_token if p.approval_state == 'approved' else False}

    @api('/public/pass/<string:token>', auth='public')
    def public_pass(self, token, body=None, **kw):
        p = request.env['otm.wm.participant'].sudo().search([('qr_token', '=', token)], limit=1)
        if not p:
            raise MissingError(_("Pass not found."))
        ev = p.event_id
        return {
            'name': p.name, 'kind': p.kind, 'phone': _mask(p.phone), 'approval_state': p.approval_state,
            'state': p.state,
            'seat': p.seat_id.label or '', 'seat_row': p.seat_id.row_no or 0, 'seat_row_name': p.seat_id.row_name(), 'hat': bool(p.category_id.hat), 'hat_state': p.hat_state,
            'trophy_state': p.trophy_state,
            'stage_note': bool(p.expected_id and p.expected_id.category_id.stage_closed and p.trophy_state != 'given'),
            'items': [{'name': l.item_id.name, 'state': l.state} for l in p.issue_ids],
            'planned_items': [i.name for i in p.category_id.item_ids],
            'token': p.qr_token,
            'event': {'name': ev.name, 'date': fields.Date.to_string(ev.date), 'time': ev.time_text or '',
                      'venue': ev.venue or ''},
        }

    # ============================================================ STAFF: session
    @api('/me')
    def me(self, body=None, **kw):
        u = request.env.user
        return {'id': u.id, 'name': u.name, 'manager': _is_manager(), 'staff': _is_staff()}

    # ============================================================ events / config
    @api('/events')
    def events(self, body=None, **kw):
        _need_staff()
        return [_event_dict(e) for e in request.env['otm.wm.event'].search([])]

    @api('/events/save', methods=('POST',))
    def event_save(self, body=None, **kw):
        _need_manager()
        allowed = ('name', 'time_text', 'venue', 'state', 'reg_student_open', 'reg_teacher_open',
                   'teacher_needs_approval', 'frontend_url', 'frontend_url_teacher', 'wa_tpl_confirm', 'wa_tpl_seat',
                   'wa_msg_confirm', 'wa_msg_seat', 'wa_tpl_confirm_teacher', 'wa_tpl_seat_teacher',
                   'wa_msg_confirm_teacher', 'wa_msg_seat_teacher', 'wa_seat_hat_param', 'slug',
                   'wa_tpl_stage_done', 'wa_tpl_stage_late')
        vals = {k: body[k] for k in allowed if k in body}
        for key in ('form_student', 'form_teacher'):
            if isinstance(body.get(key), dict):
                vals[key] = json.dumps({k: v for k, v in body[key].items()
                                        if k in ('place', 'institution', 'email', 'photo', 'food_pref', 'accompany', 'instagram')
                                        and v in ('off', 'optional', 'required')})
        if vals.get('slug'):
            clash = request.env['otm.wm.event'].search(
                [('slug', '=', request.env['otm.wm.event']._slugify(vals['slug'])), ('id', '!=', _int(body.get('id'), 0))], limit=1)
            if clash:
                raise UserError(_("The public URL name '%s' is already used by another event.", vals['slug']))
        if 'time' in body:
            vals['time_text'] = body['time']
        if body.get('date'):
            vals['date'] = body['date']
        if body.get('id'):
            ev = request.env['otm.wm.event'].browse(_int(body['id'], 0)).exists()
            if not ev:
                raise MissingError(_("Event not found."))
            ev.write(vals)
        else:
            if not vals.get('name'):
                raise UserError(_("Event name is required."))
            ev = request.env['otm.wm.event'].create(vals)
        return _event_dict(ev)

    @api('/categories')
    def categories(self, body=None, event_id=None, **kw):
        _need_staff()
        ev = _event(event_id)
        return [_cat(c) for c in ev.category_ids]

    @api('/categories/save', methods=('POST',))
    def category_save(self, body=None, **kw):
        _need_manager()
        ev = _event(body.get('event_id'))
        vals = {'name': (body.get('name') or '').strip(), 'kind': body.get('kind') or 'student',
                'color': body.get('color') or '#2563eb',
                'item_ids': [(6, 0, [_int(i) for i in (body.get('item_ids') or []) if _int(i)])],
                'seat_mode': body.get('seat_mode') or 'auto',
                'self_select': bool(body.get('self_select', True)),
                'course_id': _int(body.get('course_id')) or False,
                'seat_block_id': _int(body.get('seat_block_id')) or False,
                'seat_from': max(0, _int(body.get('seat_from'), 0)), 'seat_to': max(0, _int(body.get('seat_to'), 0)),
                'sequence': _int(body.get('sequence'), 10)}
        if not vals['name']:
            raise UserError(_("Category name is required."))
        if body.get('id'):
            cat = request.env['otm.wm.category'].browse(_int(body['id'], 0)).exists()
            if not cat:
                raise MissingError(_("Category not found."))
            cat.write(vals)
        else:
            vals['event_id'] = ev.id
            cat = request.env['otm.wm.category'].create(vals)
        return _cat(cat)

    @api('/categories/delete', methods=('POST',))
    def category_delete(self, body=None, **kw):
        _need_manager()
        cat = request.env['otm.wm.category'].browse(_int(body.get('id'), 0)).exists()
        if not cat:
            raise MissingError(_("Category not found."))
        if request.env['otm.wm.participant'].search_count([('category_id', '=', cat.id)], limit=1):
            raise UserError(_("Category is in use by participants."))
        cat.unlink()
        return True

    @api('/courses')
    def courses(self, body=None, event_id=None, **kw):
        _need_staff()
        ev = _event(event_id)
        return [{'id': c.id, 'name': c.name, 'code': c.code or '', 'subs': len(c.category_ids), 'sequence': c.sequence}
                for c in ev.course_ids]

    @api('/courses/save', methods=('POST',))
    def course_save(self, body=None, **kw):
        _need_manager()
        ev = _event(body.get('event_id'))
        vals = {'name': (body.get('name') or '').strip(), 'code': (body.get('code') or '').strip() or False,
                'sequence': _int(body.get('sequence'), 10)}
        if not vals['name']:
            raise UserError(_("Course name is required."))
        if body.get('id'):
            c = request.env['otm.wm.course'].browse(_int(body['id'], 0)).exists()
            if not c:
                raise MissingError(_("Course not found."))
            c.write(vals)
        else:
            c = request.env['otm.wm.course'].create(dict(vals, event_id=ev.id))
        return {'id': c.id}

    @api('/courses/delete', methods=('POST',))
    def course_delete(self, body=None, **kw):
        _need_manager()
        c = request.env['otm.wm.course'].browse(_int(body.get('id'), 0)).exists()
        if c and c.category_ids:
            raise UserError(_("Delete or move this course's subcategories first."))
        c.unlink()
        return True

    @api('/items')
    def items(self, body=None, event_id=None, **kw):
        _need_staff()
        return [i.stats() for i in _event(event_id).item_ids]

    @api('/items/save', methods=('POST',))
    def item_save(self, body=None, **kw):
        _need_manager()
        ev = _event(body.get('event_id'))
        vals = {'name': (body.get('name') or '').strip(), 'quantity': max(0, _int(body.get('quantity'), 0))}
        if not vals['name']:
            raise UserError(_("Item name is required."))
        if body.get('id'):
            i = request.env['otm.wm.item'].browse(_int(body['id'], 0)).exists()
            if not i:
                raise MissingError(_("Item not found."))
            i.write(vals)
        else:
            i = request.env['otm.wm.item'].create(dict(vals, event_id=ev.id))
        return i.stats()

    @api('/items/delete', methods=('POST',))
    def item_delete(self, body=None, **kw):
        _need_manager()
        i = request.env['otm.wm.item'].browse(_int(body.get('id'), 0)).exists()
        if i and i.issue_ids:
            raise UserError(_("This item has already been issued; it cannot be deleted."))
        if i:
            i.unlink()
        return True

    @api('/blocks')
    def blocks(self, body=None, event_id=None, **kw):
        _need_staff()
        ev = _event(event_id)
        return [self._block_summary(b) for b in ev.block_ids]

    def _block_summary(self, b):
        seats = b.seat_ids
        taken = len(seats.filtered('participant_ids'))
        return {'id': b.id, 'name': b.name, 'prefix': b.prefix, 'start_no': b.start_no, 'end_no': b.end_no,
                'row_size': b.row_size, 'row_layout': b.row_layout or '', 'row_names': b.row_names or '', 'sequence': b.sequence, 'sections': b.layout_sections(), 'total': len(seats), 'occupied': taken, 'free': len(seats) - taken - len(seats.filtered(
                    lambda s: s.blocked and not s.participant_ids))}

    @api('/blocks/delete', methods=('POST',))
    def block_delete(self, body=None, **kw):
        _need_manager()
        b = request.env['otm.wm.seat.block'].browse(_int(body.get('id'), 0)).exists()
        if not b:
            raise MissingError(_("Block not found."))
        b.action_delete_checked()
        return {'deleted': True}

    @api('/blocks/save', methods=('POST',))
    def block_save(self, body=None, **kw):
        _need_manager()
        ev = _event(body.get('event_id'))
        vals = {'name': (body.get('name') or '').strip(), 'prefix': (body.get('prefix') or '').strip(),
                'start_no': _int(body.get('start_no'), 1), 'end_no': _int(body.get('end_no'), 1),
                'row_size': max(0, _int(body.get('row_size'), 0)), 'row_layout': (body.get('row_layout') or '').strip(), 'row_names': (body.get('row_names') or '').strip()[:2000],
                'sequence': _int(body.get('sequence'), 10)}
        if not vals['name'] or not vals['prefix']:
            raise UserError(_("Block name and seat prefix are required."))
        if body.get('id'):
            b = request.env['otm.wm.seat.block'].browse(_int(body['id'], 0)).exists()
            if not b:
                raise MissingError(_("Block not found."))
            b.write(vals)
        else:
            vals['event_id'] = ev.id
            b = request.env['otm.wm.seat.block'].create(vals)
        return self._block_summary(b)

    @api('/seats')
    def seats(self, body=None, event_id=None, block_id=None, **kw):
        _need_staff()
        ev = _event(event_id)
        domain = [('event_id', '=', ev.id)]
        if _int(block_id):
            domain.append(('block_id', '=', _int(block_id)))
        out = []
        for s in request.env['otm.wm.seat'].search(domain):
            occ = s.participant_ids[:1]
            res = request.env['otm.wm.participant'].search([('reserved_seat_id', '=', s.id)], limit=1).name or \
                request.env['otm.wm.expected'].search([('reserved_seat_id', '=', s.id)], limit=1).name or ''
            out.append({'reserved_for': res, 'id': s.id, 'label': s.label, 'number': s.number, 'block_id': s.block_id.id,
                        'blocked': s.blocked, 'row': s.row_no, 'row_name': s.row_name(),
                        'occupant': {'id': occ.id, 'name': occ.name, 'kind': occ.kind} if occ else None})
        return out

    @api('/seats/block', methods=('POST',))
    def seat_block(self, body=None, **kw):
        _need_manager()
        s = request.env['otm.wm.seat'].browse(_int(body.get('id'), 0)).exists()
        if not s:
            raise MissingError(_("Seat not found."))
        if s.participant_ids and body.get('blocked'):
            raise UserError(_("Seat is occupied."))
        s.blocked = bool(body.get('blocked'))
        return True

    # ============================================================ dashboard
    @api('/dashboard')
    def dashboard(self, body=None, event_id=None, **kw):
        _need_staff()
        ev = _event(event_id)
        rows = request.env['otm.wm.participant'].search_read(
            [('event_id', '=', ev.id)],
            ['kind', 'state', 'approval_state', 'hat_state', 'category_id', 'wa_state'])
        def count(kind):
            sel = [r for r in rows if r['kind'] == kind]
            appr = [r for r in sel if r['approval_state'] == 'approved']
            return {'registered': len(sel), 'approved': len(appr),
                    'pending': len([r for r in sel if r['approval_state'] == 'pending']),
                    'rejected': len([r for r in sel if r['approval_state'] == 'rejected']),
                    'checked_in': len([r for r in sel if r['state'] == 'checked_in']),
                    'not_arrived': len([r for r in appr if r['state'] != 'checked_in'])}
        cats = {}
        for c in ev.category_ids:
            mine = [r for r in rows if r['category_id'] and r['category_id'][0] == c.id]
            cats[c.id] = {'id': c.id, 'name': c.full_name(), 'kind': c.kind, 'color': c.color, 'hat': c.hat,
                          'registered': len(mine), 'checked_in': len([r for r in mine if r['state'] == 'checked_in'])}
        Part = request.env['otm.wm.participant']
        Expected = request.env['otm.wm.expected']
        exp_total = Expected.search_count([('event_id', '=', ev.id)])
        reg_phones = set(request.env['otm.wm.participant'].search([('event_id', '=', ev.id)]).mapped('phone'))
        exp_registered = len([p for p in Expected.search([('event_id', '=', ev.id)]).mapped('phone') if p in reg_phones])
        logs = request.env['otm.wm.message.log'].search_read([('event_id', '=', ev.id)], ['state'])
        recent = request.env['otm.wm.participant'].search(
            [('event_id', '=', ev.id), ('state', '=', 'checked_in')], order='checkin_on desc', limit=8)
        return {
            'event': _event_dict(ev), 'students': count('student'), 'teachers': count('teacher'),
            'blocks': [self._block_summary(b) for b in ev.block_ids],
            'categories': list(cats.values()),
            'hats': {'issued': len([r for r in rows if r['hat_state'] == 'issued']),
                     'returned': len([r for r in rows if r['hat_state'] == 'returned']),
                     'lost': len([r for r in rows if r['hat_state'] == 'lost'])},
            'items': [i.stats() for i in ev.item_ids],
            'whatsapp': {s: len([l for l in logs if l['state'] == s]) for s in ('queued', 'sent', 'failed', 'skipped')},
            'expected': {'total': exp_total, 'registered': exp_registered, 'missing': exp_total - exp_registered},
            'extras': {
                'veg': Part.search_count([('event_id', '=', ev.id), ('kind', '=', 'teacher'), ('food_pref', '=', 'veg')]),
                'nonveg': Part.search_count([('event_id', '=', ev.id), ('kind', '=', 'teacher'), ('food_pref', '=', 'nonveg')]),
                'guests': sum(Part.search([('event_id', '=', ev.id), ('kind', '=', 'student'),
                                           ('approval_state', '!=', 'rejected')]).mapped('accompany_count')),
            },
            'recent': [_p(p) for p in recent],
        }

    # ============================================================ participants
    @api('/participants')
    def participants(self, body=None, event_id=None, kind=None, q=None, state=None, approval=None,
                     category_id=None, hat=None, wa=None, trophy=None, order=None, offset=0, limit=50, **kw):
        _need_staff()
        ev = _event(event_id)
        domain = [('event_id', '=', ev.id)]
        if kind in ('student', 'teacher'):
            domain.append(('kind', '=', kind))
        if state in ('registered', 'checked_in'):
            domain.append(('state', '=', state))
        if approval in ('pending', 'approved', 'rejected'):
            domain.append(('approval_state', '=', approval))
        if _int(category_id):
            domain.append(('category_id', '=', _int(category_id)))
        if hat in ('issued', 'returned', 'lost', 'none'):
            if _int(kw.get('item_id')) and hat != 'none':
                domain.append(('issue_ids', 'any', [('item_id', '=', _int(kw.get('item_id'))), ('state', '=', hat)]))
            else:
                domain.append(('hat_state', '=', hat))
        if trophy in ('pending', 'given'):
            domain.append(('trophy_state', '=', trophy))
        if wa in ('queued', 'sent', 'failed', 'skipped'):
            domain.append(('wa_state', '=', wa))
        q = (q or '').strip()
        if q:
            digits = ''.join(ch for ch in q if ch.isdigit())
            if digits and len(digits) >= 3 and len(digits) >= len(q.replace(' ', '')) - 1:
                domain.append(('phone', 'like', digits))
            else:
                domain += ['|', ('name', 'ilike', q), ('seat_label', 'ilike', q)]
        P_ = request.env['otm.wm.participant']
        limit = min(max(_int(limit, 50), 1), 200)
        recs = P_.search(domain, offset=max(_int(offset, 0), 0), limit=limit,
                         order=('category_id, seat_id, name' if order == 'stage' else
                                'approval_state desc, name' if approval == 'pending' else 'name, id'))
        return {'total': P_.search_count(domain), 'rows': [_p(p) for p in recs]}

    @api('/participants/<int:pid>')
    def participant_detail(self, pid, body=None, **kw):
        _need_staff()
        return _p(_participant(pid), detail=True)

    @api('/lookup/token', methods=('POST',))
    def lookup_token(self, body=None, **kw):
        _need_staff()
        token = (body.get('token') or '').strip().rstrip('/').split('/')[-1]
        p = request.env['otm.wm.participant'].search([('qr_token', '=', token)], limit=1) if token else None
        if not p:
            raise MissingError(_("QR code not recognised."))
        return _p(p, detail=True)

    @api('/participants/create', methods=('POST',))
    def participant_create(self, body=None, **kw):
        _need_staff()
        ev = _event(body.get('event_id'))
        cat = request.env['otm.wm.category'].browse(_int(body.get('category_id'), 0)).exists()
        if not cat or cat.event_id != ev:
            raise UserError(_("Please select a category."))
        name = ' '.join((body.get('name') or '').split())
        if len(name) < 2:
            raise UserError(_("Please enter the name."))
        via = 'admin' if _is_manager() and body.get('via') != 'desk' else 'desk'
        p = request.env['otm.wm.participant'].with_context(wm_skip_eval=True).create({
            'event_id': ev.id, 'kind': cat.kind, 'name': name, 'phone': body.get('phone'),
            'place': body.get('place') or False, 'institution': body.get('institution') or False,
            'category_id': cat.id, 'claimed_category_id': cat.id, 'registered_via': via,
            'match_status': 'na'})
        p.action_approve()           # staff-created registrations are approved immediately
        return _p(p, detail=True)

    @api('/participants/<int:pid>/approve', methods=('POST',))
    def participant_approve(self, pid, body=None, **kw):
        _need_manager()
        p = _participant(pid)
        p.action_approve(category_id=body.get('category_id'))
        return _p(p, detail=True)

    @api('/participants/<int:pid>/reject', methods=('POST',))
    def participant_reject(self, pid, body=None, **kw):
        _need_manager()
        p = _participant(pid)
        p.action_reject()
        return _p(p, detail=True)

    @api('/participants/<int:pid>/checkin', methods=('POST',))
    def participant_checkin(self, pid, body=None, **kw):
        _need_staff()
        p = _participant(pid)
        res = p.action_check_in(seat_id=_int(body.get('seat_id')))
        out = _p(p, detail=True)
        out['already'] = res['already']
        return out

    @api('/participants/<int:pid>/seat', methods=('POST',))
    def participant_seat(self, pid, body=None, **kw):
        _need_staff()
        p = _participant(pid)
        sid = _int(body.get('seat_id'))
        if not sid:
            raise UserError(_("Select a seat."))
        p.action_change_seat(sid)
        return _p(p, detail=True)

    @api('/participants/<int:pid>/undo-checkin', methods=('POST',))
    def participant_undo(self, pid, body=None, **kw):
        _need_staff()
        p = _participant(pid)
        p.action_undo_check_in()
        return _p(p, detail=True)

    @api('/participants/<int:pid>/hat', methods=('POST',))
    def participant_hat(self, pid, body=None, **kw):
        _need_staff()
        p = _participant(pid)
        p.action_hat(body.get('action'), body.get('item_id'))
        return _p(p, detail=True)

    @api('/participants/<int:pid>/trophy', methods=('POST',))
    def participant_trophy(self, pid, body=None, **kw):
        _need_staff()
        p = _participant(pid)
        p.action_trophy(bool(body.get('done', True)))
        return _p(p, detail=True)

    @api('/stage')
    def stage(self, body=None, event_id=None, kind=None, **kw):
        """Per-category headcount for the stage team: present now, collected, not arrived."""
        _need_staff()
        ev = _event(event_id)
        P_ = request.env['otm.wm.participant']
        base = [('event_id', '=', ev.id), ('approval_state', '=', 'approved')]
        if kind in ('student', 'teacher'):
            base.append(('kind', '=', kind))
        out = []
        for c in ev.category_ids:
            if kind in ('student', 'teacher') and c.kind != kind:
                continue
            d = base + [('category_id', '=', c.id)]
            present = P_.search_count(d + [('state', '=', 'checked_in'), ('trophy_state', '=', 'pending')])
            collected = P_.search_count(d + [('trophy_state', '=', 'given')])
            absent = P_.search_count(d + [('state', '=', 'registered')])
            if present or collected or absent:
                out.append({'id': c.id, 'name': c.full_name(), 'color': c.color or '#2563eb',
                            'present': present, 'collected': collected, 'absent': absent})
        return {'categories': out, 'present': sum(c['present'] for c in out),
                'collected': sum(c['collected'] for c in out), 'absent': sum(c['absent'] for c in out)}

    @api('/participants/<int:pid>/delete', methods=('POST',))
    def participant_delete(self, pid, body=None, **kw):
        _need_manager()
        p = _participant(pid)
        p.unlink()  # frees the seat; WhatsApp log rows go with it
        return True

    @api('/participants/<int:pid>/resend', methods=('POST',))
    def participant_resend(self, pid, body=None, **kw):
        _need_staff()
        p = _participant(pid)
        mtype = body.get('type') if body.get('type') in ('confirm', 'seat') else 'seat'
        if p.approval_state != 'approved':
            raise UserError(_("Not approved yet."))
        if mtype == 'seat' and not p.seat_id:
            raise UserError(_("No seat assigned yet."))
        p._queue_message(mtype, force=True)
        return _p(p, detail=True)

    # ============================================================ winners list (expected)
    @api('/expected')
    def expected(self, body=None, event_id=None, **kw):
        _need_staff()
        ev = _event(event_id)
        Exp = request.env['otm.wm.expected']
        link = Exp._link_map(ev)
        rows = Exp.search([('event_id', '=', ev.id)])
        rows = rows.sorted(lambda e: (e.category_id.course_id.sequence if e.category_id.course_id else 0,
                                      e.category_id.course_id.id or 0, e.category_id.sequence, e.category_id.id, e.sequence, e.id))
        out = []
        for e in rows:
            p = link(e)
            out.append({'id': e.id, 'name': e.name, 'phone': e.phone, 'category': e.category_id.full_name(),
                        'seat': e.reserved_seat_id.label or '', 'sequence': e.sequence,
                        'registered': bool(p), 'participant_id': p.id or False,
                        'status': Exp._status(p), 'collected': bool(p and p.trophy_state == 'given'),
                        'missed': bool(e.missed)})
        return out

    @api('/expected/order', methods=('POST',))
    def expected_order(self, body=None, **kw):
        _need_manager()
        e = request.env['otm.wm.expected'].browse(_int(body.get('id'), 0)).exists()
        if not e:
            raise MissingError(_("Entry not found."))
        e.write({'sequence': _int(body.get('sequence'), 100)})
        return True

    # ============================================================ stage: announcement queue
    @api('/stage/board')
    def stage_board(self, body=None, event_id=None, **kw):
        """Trophy announcement queue: groups in the fixed order, two winners per row, Missed list last."""
        _need_staff()
        ev = _event(event_id)
        Exp = request.env['otm.wm.expected']
        link = Exp._link_map(ev)

        def item(e, p):
            return {'id': e.id, 'name': e.name, 'status': Exp._status(p), 'seat': p.seat_id.label or '',
                    'done': bool(p and p.trophy_state == 'given')}

        cats = ev.category_ids.filtered(lambda c: c.kind == 'student').sorted(
            lambda c: (c.course_id.sequence if c.course_id else 0, c.course_id.id or 0, c.sequence, c.id))
        by_cat = {}
        for e in Exp.search([('event_id', '=', ev.id)]):
            by_cat.setdefault(e.category_id.id, []).append(e)

        def rows_of(pairs):
            ready = [it for _e, it in pairs if it['status'] == 'green']
            waiting = [it for _e, it in pairs if it['status'] != 'green']
            return [ready[i:i + 2] for i in range(0, len(ready), 2)], waiting

        groups, missed_pairs = [], []
        for c in cats:
            entries = by_cat.get(c.id) or []
            if not entries:
                continue
            pairs = [(e, item(e, link(e))) for e in entries]
            pend = [(e, it) for e, it in pairs if not it['done']]
            missed_pairs += [(e, it) for e, it in pend if e.missed]
            rows, waiting = rows_of([(e, it) for e, it in pend if not e.missed])
            groups.append({'category_id': c.id, 'course': c.course_id.name or '', 'name': c.name, 'color': c.color or '#2563eb',
                           'closed': bool(c.stage_closed), 'total': len(pairs), 'done': len(pairs) - len(pend),
                           'rows': rows, 'waiting': waiting})
        missed_pairs.sort(key=lambda t: (t[0].missed_on or fields.Datetime.now(), t[0].id))
        rows, waiting = rows_of(missed_pairs)
        return {'groups': groups, 'missed': {'category_id': 0, 'course': '', 'name': 'Missed / Late collection',
                                             'color': '#f59e0b', 'closed': False, 'total': len(missed_pairs), 'done': 0,
                                             'rows': rows, 'waiting': waiting}}

    @api('/stage/row/complete', methods=('POST',))
    def stage_row_complete(self, body=None, **kw):
        _need_staff()
        Exp = request.env['otm.wm.expected']
        exps = Exp.browse([_int(i, 0) for i in (body.get('expected_ids') or [])][:4]).exists()
        if not exps:
            raise UserError(_("Nothing to complete."))
        link = Exp._link_map(exps[0].event_id)
        for e in exps:
            p = link(e)
            if not p:
                raise UserError(_("%s is not registered.", e.name))
            p.action_trophy(True)
        exps.category_id.sudo()._stage_autoclose()
        return {'completed': len(exps)}

    @api('/stage/category/close', methods=('POST',))
    def stage_category_close(self, body=None, **kw):
        _need_staff()
        c = request.env['otm.wm.category'].browse(_int(body.get('category_id'), 0)).exists()
        if not c:
            raise MissingError(_("Category not found."))
        return c.action_stage_close()

    @api('/stage/category/reopen', methods=('POST',))
    def stage_category_reopen(self, body=None, **kw):
        _need_staff()
        c = request.env['otm.wm.category'].browse(_int(body.get('category_id'), 0)).exists()
        if not c:
            raise MissingError(_("Category not found."))
        return c.action_stage_reopen()

    # ============================================================ stage staff WhatsApp numbers
    @api('/staff-contacts')
    def staff_contacts(self, body=None, event_id=None, **kw):
        _need_manager()
        ev = _event(event_id)
        return [{'id': s.id, 'name': s.name, 'phone': s.phone, 'active': s.active} for s in ev.staff_ids]

    @api('/staff-contacts/save', methods=('POST',))
    def staff_save(self, body=None, **kw):
        _need_manager()
        ev = _event(body.get('event_id'))
        vals = {'name': (body.get('name') or '').strip(), 'phone': body.get('phone') or ''}
        if not vals['name']:
            raise UserError(_("Name is required."))
        if body.get('id'):
            s = request.env['otm.wm.staff'].browse(_int(body['id'], 0)).exists()
            if not s:
                raise MissingError(_("Not found."))
            s.write(vals)
        else:
            request.env['otm.wm.staff'].create(dict(vals, event_id=ev.id))
        return True

    @api('/staff-contacts/delete', methods=('POST',))
    def staff_delete(self, body=None, **kw):
        _need_manager()
        request.env['otm.wm.staff'].browse(_int(body.get('id'), 0)).exists().unlink()
        return True

    @api('/expected/bulk', methods=('POST',))
    def expected_bulk(self, body=None, **kw):
        _need_manager()
        ev = _event(body.get('event_id'))
        scats = [c for c in ev.category_ids if c.kind == 'student']
        Expected = request.env['otm.wm.expected']
        seats_by_label = {x.label.lower(): x for x in request.env['otm.wm.seat'].search([('event_id', '=', ev.id)])}
        created = updated = 0
        errors = []
        for idx, row in enumerate(body.get('rows') or [], start=1):
            try:
                name = ' '.join(str(row.get('name') or '').split())
                ctxt = str(row.get('course') or '').strip().lower()
                stxt = str(row.get('category') or '').strip().lower()
                found = [c for c in scats if c.name.strip().lower() == stxt
                         and (not ctxt or c.course_id.name.strip().lower() == ctxt)]
                if len(found) > 1:
                    raise UserError(_("'%s' exists in several courses - add the Course column", row.get('category') or ''))
                cat = found[0] if found else request.env['otm.wm.category']
                raw_phone = str(row.get('phone') or '').strip()
                phone = normalize_phone(raw_phone) if raw_phone else False
                if not name:
                    raise UserError(_("Name missing"))
                if raw_phone and not phone:
                    raise UserError(_("Invalid phone"))
                if not cat:
                    raise UserError(_("Unknown category '%s'", row.get('category') or ''))
                seat_txt = str(row.get('seat') or '').strip()
                seat = request.env['otm.wm.seat']
                if seat_txt:
                    seat = seats_by_label.get(seat_txt.lower())
                    if not seat and seat_txt.isdigit() and cat.seat_block_id:
                        seat = seats_by_label.get((cat.seat_block_id.prefix or '').lower() + seat_txt)
                    if not seat:
                        raise UserError(_("Unknown seat '%s'", seat_txt))
                with request.env.cr.savepoint():
                    if phone:
                        ex = Expected.search([('event_id', '=', ev.id), ('phone', '=', phone)], limit=1)
                    else:
                        ex = Expected.search([('event_id', '=', ev.id), ('phone', '=', False), ('category_id', '=', cat.id)]
                                             ).filtered(lambda x: ' '.join(x.name.lower().split()) == name.lower())[:1]
                    vals = {'name': name, 'category_id': cat.id}
                    if seat_txt:
                        vals['reserved_seat_id'] = seat.id
                    if ex:
                        ex.write(vals)
                        updated += 1
                    else:
                        Expected.create(dict(vals, event_id=ev.id, phone=phone or False))
                        created += 1
            except (UserError, ValidationError) as e:
                errors.append({'row': idx, 'error': str(e.args[0]) if e.args else str(e)})
        request.env['otm.wm.participant'].search(
            [('event_id', '=', ev.id), ('approval_state', '=', 'pending'), ('kind', '=', 'student')]
        ).action_rematch_pending()
        return {'created': created, 'updated': updated, 'errors': errors}

    @api('/participants/reserve', methods=('POST',))
    def participant_reserve(self, body=None, **kw):
        _need_manager()
        p = _participant(body.get('id'))
        sid = _int(body.get('seat_id'), 0)
        if sid and p.reserved_seat_id.id != sid:
            seat = request.env['otm.wm.seat'].browse(sid).exists()
            if not seat or seat.event_id != p.event_id:
                raise UserError(_("Invalid seat."))
        p.write({'reserved_seat_id': sid or False})
        return _p(p, detail=True)

    @api('/expected/delete', methods=('POST',))
    def expected_delete(self, body=None, **kw):
        _need_manager()
        request.env['otm.wm.expected'].browse(_int(body.get('id'), 0)).exists().unlink()
        return True

    # ============================================================ whatsapp
    @api('/whatsapp/logs')
    def wa_logs(self, body=None, event_id=None, state=None, **kw):
        _need_staff()
        ev = _event(event_id)
        domain = [('event_id', '=', ev.id)]
        if state in ('queued', 'sent', 'failed', 'skipped'):
            domain.append(('state', '=', state))
        return [{'id': l.id, 'participant': l.participant_id.name or l.staff_name or '', 'participant_id': l.participant_id.id or False,
                 'type': l.message_type, 'number': l.number, 'state': l.state, 'error': (l.error or '') if l.state in ('failed', 'skipped') else '',
                 'retries': l.retries, 'created': fields.Datetime.to_string(l.create_date)}
                for l in request.env['otm.wm.message.log'].search(domain, limit=200)]

    @api('/whatsapp/retry', methods=('POST',))
    def wa_retry(self, body=None, **kw):
        _need_staff()
        Log = request.env['otm.wm.message.log']
        ids = [i for i in (_int(x) for x in (body.get('ids') or [])) if i]
        if ids:
            logs = Log.browse(ids).exists()
        else:
            ev = _event(body.get('event_id'))
            logs = Log.search([('event_id', '=', ev.id), ('state', 'in', ('failed', 'skipped'))])
        logs.action_retry()
        return {'requeued': len(logs)}
