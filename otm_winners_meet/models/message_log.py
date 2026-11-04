import json
import logging
import re
import time

import requests

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.modules import module

_logger = logging.getLogger(__name__)
PARAM = 'otm_winners_meet.'
ATT_PARAM = 'student_details.att_wa.'   # WhatsApp setup already used for student attendance
MAX_RETRIES = 3


def render_message(text, values):
    return re.sub(r'\{(\w+)\}', lambda m: str(values.get(m.group(1), m.group(0))), text or '')


class WmMessageLog(models.Model):
    _name = 'otm.wm.message.log'
    _description = 'Winners Meet WhatsApp Message'
    _order = 'id desc'

    event_id = fields.Many2one('otm.wm.event', required=True, ondelete='cascade', index=True)
    participant_id = fields.Many2one('otm.wm.participant', required=True, ondelete='cascade', index=True)
    message_type = fields.Selection([('confirm', 'Registration Confirmation'), ('seat', 'Seat Details')],
                                    required=True)
    number = fields.Char(string="WhatsApp Number")
    message = fields.Text()
    template_name = fields.Char()
    template_params = fields.Text()
    state = fields.Selection(
        [('queued', 'Queued'), ('sent', 'Sent'), ('failed', 'Failed'), ('skipped', 'Skipped')],
        default='queued', required=True, index=True)
    retries = fields.Integer()
    error = fields.Char()
    sent_on = fields.Datetime()
    dedup_key = fields.Char(index=True, copy=False)

    _dedup_uniq = models.Constraint('unique(dedup_key)', 'Duplicate WhatsApp message.')

    # ------------------------------------------------------------- config
    @api.model
    def _get_config(self):
        """Own settings first; blank values fall back to the student-attendance WhatsApp setup."""
        icp = self.env['ir.config_parameter'].sudo()

        def pick(key, default=''):
            own = (icp.get_param(PARAM + key) or '').strip()
            if own:
                return own
            return (icp.get_param(ATT_PARAM + key) or '').strip() or default

        mode = icp.get_param(PARAM + 'enabled') or 'inherit'
        if mode == 'on':
            enabled = True
        elif mode == 'off':
            enabled = False
        else:
            enabled = (icp.get_param(ATT_PARAM + 'enabled') or '') == 'True'
        return {
            'enabled': enabled,
            'provider': pick('provider', 'meta'),
            'gateway_url': pick('gateway_url'),
            'gateway_token': pick('gateway_token'),
            'meta_phone_id': pick('meta_phone_id'),
            'meta_token': pick('meta_token'),
            'meta_api_version': pick('meta_api_version', 'v21.0'),
            'template_lang': pick('template_lang', 'en'),
            'country_code': pick('country_code', '91'),
        }

    # ------------------------------------------------------------- queueing
    @api.model
    def _queue_for(self, participant, mtype, force=False):
        participant = participant.sudo()
        event = participant.event_id
        cfg = self._get_config()
        link = event.pass_url(participant.qr_token)
        cat = participant.category_id
        if cat.hat:
            hat = _("Your winner hat has been issued; please return it after the programme.")
        else:
            hat = _("Enjoy the programme.")
        seat = participant.seat_id.label or '-'
        values = {'name': participant.name, 'event': event.name, 'date': event.date_text(),
                  'venue': event.venue or '-', 'link': link, 'seat': seat, 'hat': hat}
        if mtype == 'confirm':
            params = [participant.name, event.name, event.date_text(), event.venue or '-', link]
            text, tpl = event.wa_msg_confirm, event.wa_tpl_confirm
            key = 'confirm:%s' % participant.id
        else:
            params = [participant.name, seat, event.name, hat, link]
            text, tpl = event.wa_msg_seat, event.wa_tpl_seat
            key = 'seat:%s:%s' % (participant.id, participant.seat_id.id)
        if force:
            key = '%s:r%s' % (key, int(time.time()))
        existing = self.sudo().search([('dedup_key', '=', key)], limit=1)
        if existing:
            return existing
        number = participant.phone
        log = self.sudo().create({
            'event_id': event.id, 'participant_id': participant.id, 'message_type': mtype,
            'number': number, 'message': render_message(text, values),
            'template_name': (tpl or '') if cfg['provider'] == 'meta' else '',
            'template_params': json.dumps([str(p) for p in params]),
            'state': 'queued' if number else 'skipped',
            'error': False if number else _("No valid WhatsApp number."),
            'dedup_key': key,
        })
        if log.state == 'queued':
            self._trigger_queue_cron()
        return log

    @api.model
    def _trigger_queue_cron(self):
        cron = self.env.ref('otm_winners_meet.ir_cron_wm_whatsapp_queue', raise_if_not_found=False)
        if cron:
            cron.sudo()._trigger()

    @api.model_create_multi
    def create(self, vals_list):
        logs = super().create(vals_list)
        logs._refresh_participant()
        return logs

    def write(self, vals):
        res = super().write(vals)
        if 'state' in vals:
            self._refresh_participant()
        return res

    def _refresh_participant(self):
        for participant in self.participant_id:
            last = self.sudo().search([('participant_id', '=', participant.id)], order='id desc', limit=1)
            participant.sudo().write({'wa_state': last.state if last else 'none'})

    # ------------------------------------------------------------- sending
    def _dispatch(self, cfg):
        self.ensure_one()
        if not self.number:
            raise UserError(_("No valid WhatsApp number."))
        if cfg['provider'] == 'meta':
            return self._dispatch_meta(cfg)
        return self._dispatch_gateway(cfg)

    def _dispatch_gateway(self, cfg):
        url = (cfg['gateway_url'] or '').strip()
        if not url.lower().startswith(('http://', 'https://')):
            raise UserError(_("Gateway URL must start with http:// or https://"))
        headers = {'Content-Type': 'application/json'}
        if cfg['gateway_token']:
            headers['Authorization'] = 'Bearer %s' % cfg['gateway_token']
        resp = requests.post(url, json={'number': self.number, 'phone': self.number, 'message': self.message},
                             headers=headers, timeout=20, allow_redirects=False)
        if not resp.ok:
            raise UserError(_("Gateway HTTP %(code)s: %(body)s", code=resp.status_code, body=resp.text[:300]))
        try:
            data = resp.json()
        except ValueError:
            return resp.text[:100]
        if isinstance(data, dict) and (data.get('success') is False or data.get('error')):
            raise UserError(_("Gateway error: %s", str(data.get('error') or data)[:300]))
        return str((data.get('id') or data.get('message_id') or 'ok') if isinstance(data, dict) else 'ok')[:100]

    def _dispatch_meta(self, cfg):
        if not (cfg['meta_phone_id'] and cfg['meta_token']):
            raise UserError(_("Meta Phone Number ID and access token are required."))
        url = 'https://graph.facebook.com/%s/%s/messages' % (cfg['meta_api_version'] or 'v21.0', cfg['meta_phone_id'])
        body = {'messaging_product': 'whatsapp', 'to': self.number}
        if self.template_name:
            params = json.loads(self.template_params or '[]')
            body['type'] = 'template'
            body['template'] = {
                'name': self.template_name,
                'language': {'code': cfg['template_lang'] or 'en'},
                'components': [{'type': 'body',
                                'parameters': [{'type': 'text', 'text': str(p)} for p in params]}],
            }
        else:
            body['type'] = 'text'
            body['text'] = {'preview_url': True, 'body': self.message}
        resp = requests.post(url, json=body, timeout=20, allow_redirects=False,
                             headers={'Authorization': 'Bearer %s' % cfg['meta_token']})
        data = {}
        try:
            data = resp.json()
        except ValueError:
            pass
        if not resp.ok:
            err = (data.get('error') or {}).get('message') if isinstance(data, dict) else ''
            raise UserError(_("Meta API %(code)s: %(msg)s [template '%(t)s']",
                              code=resp.status_code, msg=(err or resp.text)[:250], t=self.template_name or '-'))
        return (data.get('messages') or [{}])[0].get('id', 'ok')

    def _process_queue(self, cfg=None):
        cfg = cfg or self._get_config()
        todo = self.sudo().filtered(lambda l: l.state == 'queued')
        if not todo or not cfg['enabled']:
            return 0
        self.env['otm.wm.message.log'].flush_model()
        self.env.cr.execute(
            "SELECT id FROM otm_wm_message_log WHERE id IN %s AND state = 'queued' FOR UPDATE SKIP LOCKED",
            [tuple(todo.ids)])
        locked = {r[0] for r in self.env.cr.fetchall()}
        sent = 0
        for log in todo.filtered(lambda l: l.id in locked):
            try:
                ref = log._dispatch(cfg)
                log.write({'state': 'sent', 'sent_on': fields.Datetime.now(), 'error': ref,
                           'retries': log.retries + 1})
                sent += 1
            except Exception as exc:  # noqa: BLE001 - provider / network errors
                retries = log.retries + 1
                _logger.warning("Winners Meet WhatsApp %s failed: %s", log.id, exc)
                log.write({'retries': retries, 'error': str(exc)[:500],
                           'state': 'failed' if retries >= MAX_RETRIES else 'queued'})
            if not module.current_test:
                self.env['ir.cron']._commit_progress(1)
        return sent

    @api.model
    def _cron_process_queue(self):
        cfg = self._get_config()
        if not cfg['enabled']:
            return
        self.search([('state', '=', 'queued')], limit=100, order='id')._process_queue(cfg)

    def action_retry(self, *args, **kwargs):
        logs = self.sudo().filtered(lambda l: l.state in ('failed', 'skipped') and l.number)
        logs.write({'state': 'queued', 'retries': 0, 'error': False})
        if logs:
            self._trigger_queue_cron()
        return True
