import json

from odoo.tests import HttpCase, tagged


@tagged('post_install', '-at_install')
class TestMarksHttp(HttpCase):
    """Trophy sticker / profile ticks through the real API, as viewer, staff and an outsider."""

    def setUp(self):
        super().setUp()
        env = self.env
        ev = env['otm.wm.event'].create({'name': 'Mark Event', 'state': 'open'})
        cat = env['otm.wm.category'].create({'event_id': ev.id, 'name': 'MT', 'kind': 'teacher'})
        P = env['otm.wm.participant'].with_context(wm_skip_eval=True)
        self.teacher = P.create({'event_id': ev.id, 'kind': 'teacher', 'name': 'HT', 'phone': '9447700021', 'category_id': cat.id})
        self.student = P.create({'event_id': ev.id, 'kind': 'student', 'name': 'HS', 'phone': '9447700022', 'category_id': cat.id})
        mk = lambda login, grp: env['res.users'].with_context(no_reset_password=True).create({
            'name': login, 'login': login, 'password': login + '-pw-1',
            'group_ids': [(6, 0, [env.ref('otm_winners_meet.' + grp).id])]})
        self.viewer, self.staff, self.mkt = mk('mk_viewer', 'group_wm_viewer'), mk('mk_staff', 'group_wm_user'), mk('mk_mkt', 'group_wm_marketing')

    def _post(self, login, path, body):
        self.authenticate(login, login + '-pw-1')
        r = self.url_open('/api/wm' + path, data=json.dumps(body), headers={'Content-Type': 'application/json'})
        return r.status_code, r.json()

    def test_viewer_ticks_teacher_only(self):
        code, r = self._post('mk_viewer', '/teachers/%d/mark' % self.teacher.id, {'field': 'trophy', 'value': True})
        self.assertEqual((code, r['ok'], r['data']), (200, True, {'trophy_done': True, 'profile_done': False}))
        code, r = self._post('mk_viewer', '/teachers/%d/mark' % self.teacher.id, {'field': 'profile', 'value': True})
        self.assertEqual(r['data'], {'trophy_done': True, 'profile_done': True})
        self.teacher.invalidate_recordset()
        self.assertTrue(self.teacher.trophy_done and self.teacher.profile_done)
        code, r = self._post('mk_viewer', '/teachers/%d/mark' % self.teacher.id, {'field': 'trophy', 'value': False})
        self.assertFalse(r['data']['trophy_done'])
        code, r = self._post('mk_viewer', '/teachers/%d/mark' % self.student.id, {'field': 'trophy', 'value': True})
        self.assertFalse(r['ok'])                               # a student is not visible to the viewer
        code, r = self._post('mk_viewer', '/teachers/%d/mark' % self.teacher.id, {'field': 'name', 'value': True})
        self.assertFalse(r['ok'])                               # only the two ticks can be changed
        code, r = self._post('mk_viewer', '/participants/%d/mark' % self.teacher.id, {'field': 'trophy', 'value': True})
        self.assertEqual(code, 403)                             # the staff endpoint stays closed to the viewer

    def test_staff_ticks_any_and_marketing_blocked(self):
        code, r = self._post('mk_staff', '/participants/%d/mark' % self.student.id, {'field': 'profile', 'value': True})
        self.assertEqual((r['ok'], r['data']['profile_done']), (True, True))
        code, r = self._post('mk_mkt', '/teachers/%d/mark' % self.teacher.id, {'field': 'trophy', 'value': True})
        self.assertEqual(code, 403)
        code, r = self._post('mk_mkt', '/participants/%d/mark' % self.student.id, {'field': 'trophy', 'value': True})
        self.assertEqual(code, 403)

    def test_filters_done_and_pending(self):
        self.teacher.write({'trophy_done': True})
        ev = self.teacher.event_id
        def ids(who, path, flag):
            self.authenticate(who, who + '-pw-1')
            r = self.url_open('/api/wm%s?event_id=%d&flag=%s&limit=200' % (path, ev.id, flag)).json()
            return {x['id'] for x in r['data']['rows']}
        for who, path in (('mk_viewer', '/teachers'), ('mk_staff', '/participants')):
            self.assertIn(self.teacher.id, ids(who, path, 'trophy_done'))
            self.assertNotIn(self.teacher.id, ids(who, path, 'trophy_pending'))
            self.assertIn(self.teacher.id, ids(who, path, 'profile_pending'))
            self.assertNotIn(self.teacher.id, ids(who, path, 'profile_done'))
