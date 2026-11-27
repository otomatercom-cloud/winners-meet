"""Public referral wallet for Winners Meet teachers: mobile number + coupon code, no login.

Everything is read through sudo but limited to the one teacher whose number and code were typed.
"""
import time
from collections import defaultdict

from odoo import _, fields, http
from odoo.exceptions import UserError
from odoo.http import request

from odoo.addons.otm_winners_meet.controllers.api import api
from odoo.addons.otm_winners_meet.models.utils import normalize_phone

_FAILS = defaultdict(list)          # ip -> timestamps of wrong attempts (per worker, best effort)
_MAX_FAILS, _WINDOW = 8, 600
MAX_LEADS_PER_TEACHER = 100


def _ip():
    return request.httprequest.remote_addr or '?'


def _teacher(body):
    env = request.env
    now = time.time()
    ip = _ip()
    _FAILS[ip] = [t for t in _FAILS[ip] if now - t < _WINDOW]
    if len(_FAILS[ip]) >= _MAX_FAILS:
        raise UserError(_("Too many wrong attempts. Please try again after some time."))
    cc = env['otm.wm.message.log'].sudo()._get_config()['country_code']
    phone = normalize_phone(body.get('phone'), cc)
    code = str(body.get('code') or '').strip().upper()
    part = env['otm.wm.participant'].sudo().search([('coupon_code', '=', code)], limit=1) if code else env['otm.wm.participant']
    if not (phone and part and part.kind == 'teacher' and part.approval_state != 'rejected'
            and normalize_phone(part.phone, cc) == phone):
        _FAILS[ip].append(now)
        raise UserError(_("Mobile number and coupon code do not match."))
    return part


class WalletController(http.Controller):

    @api('/public/wallet', methods=('POST',), auth='public')
    def wallet(self, body=None, **kw):
        env = request.env
        part = _teacher(body)
        cfg = env['otm.coupon.config']._get()
        Usage = env['otm.coupon.usage'].sudo()
        leads = env['leads.logic'].sudo().search([('wm_participant_id', '=', part.id)], order='id desc', limit=200)
        usages = Usage.search([('participant_id', '=', part.id)])
        by_lead = {}
        for u in usages.sorted('id'):
            if u.lead_id:
                by_lead[u.lead_id.id] = u
        rows, expected = [], 0.0

        def _date(dt):
            return fields.Datetime.to_string(dt) if dt else ''

        for ld in leads:
            u = by_lead.get(ld.id)
            course = ', '.join(ld.course_inter.mapped('name')) or ld.course_interested or ''
            if u and u.state == 'approved':
                state, amount = 'credited', u.referral_amount
            elif u and u.state in ('rejected', 'revoked'):
                state, amount = 'closed', 0.0
            else:
                state = 'approval' if (u and u.state == 'pending') else 'progress'
                amount = 0.0
                fee = ld.course_inter[:1].tuition_fee if ld.course_inter else 0.0
                if cfg.referral_enabled and fee:
                    expected += round(fee * cfg.referral_pct / 100.0, 2)
            rows.append({'kind': 'student', 'name': ld.name, 'course': course, 'state': state, 'amount': amount,
                         'discount_pct': u.discount_pct if u and u.state == 'approved' else 0.0,
                         'date': _date(u.approved_on if u and u.approved_on else ld.create_date)})
        for u in usages.filtered(lambda x: not x.lead_id and x.state == 'approved'):
            rows.append({'kind': 'student', 'name': u.student_id.name, 'course': u.course_id.name or '', 'state': 'credited',
                         'amount': u.referral_amount, 'discount_pct': u.discount_pct, 'date': _date(u.approved_on)})
        for ln in part.wallet_line_ids.sudo().filtered(lambda x: x.kind != 'referral' and x.state == 'active'):
            rows.append({'kind': ln.kind, 'name': dict(ln._fields['kind'].selection)[ln.kind], 'course': ln.note or '',
                         'state': 'paid' if ln.kind == 'payout' else 'adjust', 'amount': ln.signed_amount,
                         'discount_pct': 0.0, 'date': _date(ln.date)})
        rows.sort(key=lambda r: r['date'], reverse=True)
        approved = usages.filtered(lambda x: x.state == 'approved')
        return {
            'name': part.name, 'code': part.coupon_code,
            'balance': part.wallet_balance, 'expected': round(expected, 2),
            'confirmed': len(approved), 'added': len(leads),
            'discount_enabled': bool(cfg.discount_enabled), 'discount_slots': cfg.discount_slots,
            'discount_pct': cfg.discount_pct, 'discount_used': min(len(approved), cfg.discount_slots),
            'referral_enabled': bool(cfg.referral_enabled), 'referral_pct': cfg.referral_pct,
            'can_add': len(leads) < MAX_LEADS_PER_TEACHER,
            'courses': [{'id': c.id, 'name': c.name} for c in env['course.interested'].sudo().search([], order='name')],
            'rows': rows,
        }

    @api('/public/wallet/add', methods=('POST',), auth='public')
    def add_student(self, body=None, **kw):
        env = request.env
        part = _teacher(body)
        cc = env['otm.wm.message.log'].sudo()._get_config()['country_code']
        name = ' '.join(str(body.get('student_name') or '').split())
        if not 2 <= len(name) <= 100:
            raise UserError(_("Please enter the student's name."))
        phone = normalize_phone(body.get('student_phone'), cc)
        if not phone:
            raise UserError(_("Please enter a valid 10-digit mobile number for the student."))
        if phone == normalize_phone(part.phone, cc):
            raise UserError(_("You cannot add yourself as a student."))
        course = env['course.interested'].sudo().browse(int(body.get('course_id') or 0)).exists()
        if not course:
            raise UserError(_("Please select the course."))
        school = ' '.join(str(body.get('school') or '').split())[:150]
        Lead = env['leads.logic'].sudo()
        if Lead.search_count([('wm_participant_id', '=', part.id)]) >= MAX_LEADS_PER_TEACHER:
            raise UserError(_("Student limit reached. Please contact the office."))
        source = env.ref('otm_teacher_coupon.lead_source_wm_referral')
        lead = Lead.create({
            'name': name, 'phone_number': phone[-10:], 'leads_source': source.id, 'college_name': school,
            'course_inter': [(6, 0, [course.id])], 'course_interested': course.name, 'wm_participant_id': part.id})
        lead.message_post(body=_("Added by teacher %(t)s (%(c)s) from the Winners Meet wallet.", t=part.name, c=part.coupon_code))
        return {'added': True, 'name': name}
