import json

from odoo.tests import HttpCase, tagged


@tagged('post_install', '-at_install')
class TestChecklistHttp(HttpCase):

    def setUp(self):
        super().setUp()
        env = self.env
        self.ev = env['otm.wm.event'].create({'name': 'CK Event', 'state': 'open'})
        mk = lambda login, grp: env['res.users'].with_context(no_reset_password=True).create({
            'name': login, 'login': login, 'password': login + '-pw-1',
            'group_ids': [(6, 0, [env.ref('otm_winners_meet.' + grp).id])]})
        mk('ck_staff', 'group_wm_user'), mk('ck_mgr', 'group_wm_manager'), mk('ck_mkt', 'group_wm_marketing')

    def _call(self, login, path, body=None):
        if login:
            self.authenticate(login, login + '-pw-1')
        else:
            self.logout()
        if body is None:
            r = self.url_open('/api/wm' + path)
        else:
            r = self.url_open('/api/wm' + path, data=json.dumps(body), headers={'Content-Type': 'application/json'})
        return r.status_code, r.json()

    def test_flow(self):
        eid = self.ev.id
        code, r = self._call('ck_staff', '/checklist/bulk', {'event_id': eid, 'text': '# Stage\nBanner - 2\nMic\n\n# Desk\nPens - 50'})
        self.assertEqual(code, 403)                                  # staff cannot edit the list
        code, r = self._call('ck_mgr', '/checklist/bulk', {'event_id': eid, 'text': '# Stage\nBanner - 2\nMic\n\n# Desk\nPens - 50'})
        self.assertEqual(r['data']['created'], 3)
        code, r = self._call('ck_staff', '/checklist?event_id=%d' % eid)
        items = r['data']['items']
        self.assertEqual([i['section'] for i in items], ['Desk', 'Stage', 'Stage'])
        self.assertEqual(r['data']['progress']['total'], 3)
        token = r['data']['token']
        self.assertTrue(token)
        banner = next(i for i in items if i['name'] == 'Banner')
        self.assertEqual(banner['qty'], '2')
        code, r = self._call('ck_staff', '/checklist/%d/tick' % banner['id'], {'done': True})
        self.assertTrue(r['data']['done'])
        self.assertEqual(r['data']['done_by'], 'ck_staff')
        code, r = self._call('ck_mkt', '/checklist/%d/tick' % banner['id'], {'done': False})
        self.assertEqual(code, 403)
        # public: read only, reflects ticks, exposes no names of staff
        code, r = self._call(None, '/public/checklist/' + token)
        self.assertEqual((code, r['ok']), (200, True))
        self.assertEqual(r['data']['progress'], {'total': 3, 'done': 1, 'percent': 33})
        self.assertNotIn('done_by', r['data']['items'][0])
        code, r = self._call(None, '/checklist/%d/tick' % banner['id'], {'done': False})
        self.assertEqual(code, 401)                                  # guest cannot tick
        code, r = self._call(None, '/checklist/bulk', {'event_id': eid, 'text': 'x'})
        self.assertEqual(code, 401)
        code, r = self._call(None, '/public/checklist/%s' % (token + 'x'))
        self.assertEqual(code, 404)
        # switch off, regenerate
        code, r = self._call('ck_mgr', '/checklist/link', {'event_id': eid, 'public': False})
        code, r = self._call(None, '/public/checklist/' + token)
        self.assertEqual(code, 404)
        code, r = self._call('ck_mgr', '/checklist/link', {'event_id': eid, 'public': True, 'regenerate': True})
        self.assertNotEqual(r['data']['token'], token)
        code, r = self._call(None, '/public/checklist/' + token)
        self.assertEqual(code, 404)                                  # old link dead
        code, r = self._call('ck_mgr', '/checklist/reset', {'event_id': eid})
        self.assertEqual(self.ev.checklist_ids.filtered('done').ids, [])

    def test_logo_upload(self):
        import base64
        png = base64.b64encode(b'\x89PNG\r\n\x1a\n' + b'0' * 50).decode()
        uri = 'data:image/png;base64,' + png
        code, r = self._call('ck_staff', '/events/logo', {'event_id': self.ev.id, 'data': uri})
        self.assertEqual(code, 403)
        code, r = self._call('ck_mgr', '/events/logo', {'event_id': self.ev.id, 'data': 'data:image/svg+xml;base64,AAAA'})
        self.assertFalse(r['ok'])
        code, r = self._call('ck_mgr', '/events/logo', {'event_id': self.ev.id, 'data': 'data:image/png;base64,' + base64.b64encode(b'notapng').decode()})
        self.assertFalse(r['ok'])
        code, r = self._call('ck_mgr', '/events/logo', {'event_id': self.ev.id, 'data': uri})
        self.assertEqual(r['data']['logo'], uri)
        self.ev.write({'slug': 'logo-ev'})
        code, r = self._call(None, '/public/event?slug=logo-ev')
        self.assertEqual(r['data']['event']['logo'], uri)
        code, r = self._call('ck_mgr', '/events/logo', {'event_id': self.ev.id, 'data': ''})
        code, r = self._call(None, '/public/event?slug=logo-ev')
        self.assertEqual(r['data']['event']['logo'], '')

    def test_form_text(self):
        code, r = self._call('ck_mgr', '/events/save', {'id': self.ev.id, 'slug': 'txt-ev', 'form_text': {
            'phone': {'label': ' Mobile ', 'hint': ''}, 'bogus': {'label': 'x'}, 'photo': {'label': 'Pic', 'hint': 'Hi'}}})
        self.assertTrue(r['ok'], r)
        code, r = self._call(None, '/public/event?slug=txt-ev')
        self.assertEqual(r['data']['event']['form_text'], {'phone': {'label': 'Mobile', 'hint': ''}, 'photo': {'label': 'Pic', 'hint': 'Hi'}})
        code, r = self._call('ck_staff', '/events/save', {'id': self.ev.id, 'form_text': {}})
        self.assertEqual(code, 403)
