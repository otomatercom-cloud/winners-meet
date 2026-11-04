"""JSON API for the Winners Meet Next.js (BFF) frontend.

Staff routes use the normal Odoo session (the Next.js server holds session_id, the browser never talks
to Odoo). Public routes (registration form, entry pass) are limited to what a guest may see.
"""
import functools
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
    return {'id': c.id, 'name': c.name, 'kind': c.kind, 'color': c.color or '#2563eb', 'hat': c.hat,
            'hat_label': c.hat_label or '', 'seat_mode': c.seat_mode, 'self_select': c.self_select,
            'seat_block_id': c.seat_block_id.id or False, 'seat_block': c.seat_block_id.name or ''}


def _event_dict(e):
    return {'id': e.id, 'name': e.name, 'date': fields.Date.to_string(e.date), 'time': e.time_text or '',
            'venue': e.venue or '', 'state': e.state, 'reg_student_open': e.reg_student_open,
            'reg_teacher_open': e.reg_teacher_open, 'teacher_needs_approval': e.teacher_needs_approval,
            'frontend_url': e.frontend_url or '', 'frontend_url_teacher': e.frontend_url_teacher or '',
            'wa_tpl_confirm': e.wa_tpl_confirm or '', 'wa_tpl_seat': e.wa_tpl_seat or '',
            'wa_msg_confirm': e.wa_msg_confirm or '', 'wa_msg_seat': e.wa_msg_seat or '',
            'wa_tpl_confirm_teacher': e.wa_tpl_confirm_teacher or '', 'wa_tpl_seat_teacher': e.wa_tpl_seat_teacher or '',
            'wa_msg_confirm_teacher': e.wa_msg_confirm_teacher or '', 'wa_msg_seat_teacher': e.wa_msg_seat_teacher or ''}


def _p(p, detail=False):
    d = {
        'id': p.id, 'name': p.name, 'phone': p.phone, 'kind': p.kind, 'place': p.place or '',
        'institution': p.institution or '', 'state': p.state, 'approval_state': p.approval_state,
        'match_status': p.match_status, 'match_note': p.match_note or '',
        'category': _cat(p.category_id) if p.category_id else None,
        'claimed_category': _cat(p.claimed_category_id) if p.claimed_category_id else None,
        'seat': p.seat_id.label or '', 'seat_id': p.seat_id.id or False,
        'checkin_on': fields.Datetime.to_string(p.checkin_on) if p.checkin_on else '',
        'hat_state': p.hat_state, 'wa_state': p.wa_state, 'registered_via': p.registered_via,
        'create_date': fields.Datetime.to_string(p.create_date),
    }
    if detail:
        d.update({
            'email': p.email or '', 'note': p.note or '', 'token': p.qr_token,
            'hat_issued_on': fields.Datetime.to_string(p.hat_issued_on) if p.hat_issued_on else '',
            'hat_returned_on': fields.Datetime.to_string(p.hat_returned_on) if p.hat_returned_on else '',
            'checkin_by': p.checkin_by.name or '', 'approved_by': p.approved_by.name or '',
            'expected': ({'name': p.expected_id.name, 'category': p.expected_id.category_id.name}
                         if p.expected_id else None),
            'messages': [{'id': l.id, 'type': l.message_type, 'state': l.state, 'error': l.error or '',
                          'created': fields.Datetime.to_string(l.create_date), 'retries': l.retries}
                         for l in p.log_ids.sorted('id', reverse=True)[:10]],
        })
    return d


def _participant(pid):
    p = request.env['otm.wm.participant'].browse(_int(pid, 0)).exists()
    if not p:
        raise MissingError(_("Participant not found."))
    return p


class WinnersMeetApi(http.Controller):

    # ============================================================ PUBLIC
    @api('/public/event', auth='public')
    def public_event(self, body=None, **kw):
        env = request.env(su=True)
        ev = env['otm.wm.event'].search([('state', '=', 'open')], limit=1)
        if not ev:
            return {'event': None}
        cats = ev.category_ids.filtered(lambda c: c.self_select)
        return {
            'event': {'id': ev.id, 'name': ev.name, 'date': fields.Date.to_string(ev.date),
                      'time': ev.time_text or '', 'venue': ev.venue or '',
                      'reg_student_open': ev.reg_student_open, 'reg_teacher_open': ev.reg_teacher_open},
            'student_categories': [{'id': c.id, 'name': c.name, 'color': c.color} for c in cats if c.kind == 'student'],
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
            if kind == 'teacher' and len(cats) == 1:
                cat = cats
            else:
                raise UserError(_("Please select a category."))
        existing = env['otm.wm.participant'].search([('event_id', '=', ev.id), ('phone', '=', phone)], limit=1)
        if existing:
            return {'registered': True, 'already': True, 'approval_state': existing.approval_state,
                    'token': existing.qr_token if existing.approval_state == 'approved' else False,
                    'message': _("This number is already registered. Your entry pass was sent on WhatsApp.")}
        p = env['otm.wm.participant'].create({
            'event_id': ev.id, 'kind': kind, 'name': name, 'phone': phone,
            'place': (body.get('place') or '')[:120], 'institution': (body.get('institution') or '')[:160],
            'email': (body.get('email') or '')[:120], 'claimed_category_id': cat.id,
            'category_id': cat.id if kind == 'teacher' else False, 'registered_via': 'public'})
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
            'state': p.state, 'category': _cat(p.category_id) if p.category_id else None,
            'seat': p.seat_id.label or '', 'hat': bool(p.category_id.hat), 'hat_state': p.hat_state,
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
                   'wa_msg_confirm_teacher', 'wa_msg_seat_teacher')
        vals = {k: body[k] for k in allowed if k in body}
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
                'color': body.get('color') or '#2563eb', 'hat': bool(body.get('hat')),
                'hat_label': body.get('hat_label') or False, 'seat_mode': body.get('seat_mode') or 'auto',
                'self_select': bool(body.get('self_select', True)),
                'seat_block_id': _int(body.get('seat_block_id')) or False}
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

    @api('/blocks')
    def blocks(self, body=None, event_id=None, **kw):
        _need_staff()
        ev = _event(event_id)
        return [self._block_summary(b) for b in ev.block_ids]

    def _block_summary(self, b):
        seats = b.seat_ids
        taken = len(seats.filtered('participant_ids'))
        return {'id': b.id, 'name': b.name, 'prefix': b.prefix, 'start_no': b.start_no, 'end_no': b.end_no,
                'total': len(seats), 'occupied': taken, 'free': len(seats) - taken - len(seats.filtered(
                    lambda s: s.blocked and not s.participant_ids))}

    @api('/blocks/save', methods=('POST',))
    def block_save(self, body=None, **kw):
        _need_manager()
        ev = _event(body.get('event_id'))
        vals = {'name': (body.get('name') or '').strip(), 'prefix': (body.get('prefix') or '').strip(),
                'start_no': _int(body.get('start_no'), 1), 'end_no': _int(body.get('end_no'), 1)}
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
            out.append({'id': s.id, 'label': s.label, 'number': s.number, 'block_id': s.block_id.id,
                        'blocked': s.blocked,
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
            cats[c.id] = {'id': c.id, 'name': c.name, 'kind': c.kind, 'color': c.color, 'hat': c.hat,
                          'registered': len(mine), 'checked_in': len([r for r in mine if r['state'] == 'checked_in'])}
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
            'whatsapp': {s: len([l for l in logs if l['state'] == s]) for s in ('queued', 'sent', 'failed', 'skipped')},
            'expected': {'total': exp_total, 'registered': exp_registered, 'missing': exp_total - exp_registered},
            'recent': [_p(p) for p in recent],
        }

    # ============================================================ participants
    @api('/participants')
    def participants(self, body=None, event_id=None, kind=None, q=None, state=None, approval=None,
                     category_id=None, hat=None, wa=None, offset=0, limit=50, **kw):
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
            domain.append(('hat_state', '=', hat))
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
                         order='approval_state desc, name' if approval == 'pending' else 'name, id')
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
        p.action_hat(body.get('action'))
        return _p(p, detail=True)

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
        reg = {p.phone: p for p in request.env['otm.wm.participant'].search([('event_id', '=', ev.id)])}
        return [{'id': e.id, 'name': e.name, 'phone': e.phone, 'category': e.category_id.name,
                 'registered': e.phone in reg, 'participant_id': reg[e.phone].id if e.phone in reg else False}
                for e in request.env['otm.wm.expected'].search([('event_id', '=', ev.id)])]

    @api('/expected/bulk', methods=('POST',))
    def expected_bulk(self, body=None, **kw):
        _need_manager()
        ev = _event(body.get('event_id'))
        cats = {c.name.strip().lower(): c for c in ev.category_ids if c.kind == 'student'}
        Expected = request.env['otm.wm.expected']
        created = updated = 0
        errors = []
        for idx, row in enumerate(body.get('rows') or [], start=1):
            try:
                name = ' '.join(str(row.get('name') or '').split())
                cat = cats.get(str(row.get('category') or '').strip().lower())
                phone = normalize_phone(str(row.get('phone') or ''))
                if not name:
                    raise UserError(_("Name missing"))
                if not phone:
                    raise UserError(_("Invalid phone"))
                if not cat:
                    raise UserError(_("Unknown category '%s'", row.get('category') or ''))
                with request.env.cr.savepoint():
                    ex = Expected.search([('event_id', '=', ev.id), ('phone', '=', phone)], limit=1)
                    if ex:
                        ex.write({'name': name, 'category_id': cat.id})
                        updated += 1
                    else:
                        Expected.create({'event_id': ev.id, 'name': name, 'phone': phone, 'category_id': cat.id})
                        created += 1
            except (UserError, ValidationError) as e:
                errors.append({'row': idx, 'error': str(e.args[0]) if e.args else str(e)})
        request.env['otm.wm.participant'].search(
            [('event_id', '=', ev.id), ('approval_state', '=', 'pending'), ('kind', '=', 'student')]
        ).action_rematch_pending()
        return {'created': created, 'updated': updated, 'errors': errors}

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
        return [{'id': l.id, 'participant': l.participant_id.name, 'participant_id': l.participant_id.id,
                 'type': l.message_type, 'number': l.number, 'state': l.state, 'error': l.error or '',
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
