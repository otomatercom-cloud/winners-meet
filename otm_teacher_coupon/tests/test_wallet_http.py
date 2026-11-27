import json

from odoo.tests import HttpCase, tagged


@tagged('post_install', '-at_install')
class TestWalletHttp(HttpCase):

    def setUp(self):
        super().setUp()
        env = self.env
        ev = env['otm.wm.event'].create({'name': 'WW', 'state': 'open', 'coupon_enabled': True})
        cat = env['otm.wm.category'].create({'event_id': ev.id, 'name': 'T', 'kind': 'teacher'})
        self.t = env['otm.wm.participant'].create({'event_id': ev.id, 'kind': 'teacher', 'name': 'Wallet Teacher',
                                                   'phone': '9447711111', 'claimed_category_id': cat.id})
        self.t.action_generate_coupon()
        self.crs = env['course.interested'].create({'name': 'ACCA W', 'tuition_fee': 20000.0})
        env['otm.coupon.config'].create({})

    def _post(self, path, body):
        r = self.url_open('/api/wm' + path, data=json.dumps(body), headers={'Content-Type': 'application/json'})
        return r.status_code, r.json()

    def test_wallet(self):
        good = {'phone': '94477 11111', 'code': self.t.coupon_code.lower()}
        code, r = self._post('/public/wallet', {'phone': '9447711111', 'code': 'WMT-WRONG1'})
        self.assertEqual(code, 400)
        code, r = self._post('/public/wallet', {'phone': '9447700000', 'code': self.t.coupon_code})
        self.assertFalse(r['ok'])                                   # right code, wrong mobile
        code, r = self._post('/public/wallet', good)
        self.assertTrue(r['ok'], r)
        d = r['data']
        self.assertEqual((d['name'], d['balance'], d['rows'], d['discount_slots'], d['referral_pct']), ('Wallet Teacher', 0.0, [], 3, 10.0))
        self.assertIn('ACCA W', [c['name'] for c in d['courses']])
        code, r = self._post('/public/wallet/add', dict(good, student_name='Anu Stu', student_phone='9447722222',
                                                        course_id=self.crs.id, school='St Marys'))
        self.assertTrue(r['ok'], r)
        lead = self.env['leads.logic'].search([('wm_participant_id', '=', self.t.id)])
        self.assertEqual((lead.name, lead.phone_number, lead.college_name, lead.course_inter), ('Anu Stu', '9447722222', 'St Marys', self.crs))
        code, r = self._post('/public/wallet/add', dict(good, student_name='Me', student_phone='9447711111', course_id=self.crs.id))
        self.assertFalse(r['ok'])                                   # cannot add self
        code, r = self._post('/public/wallet/add', {'phone': '9447711111', 'code': 'WMT-NOPE00', 'student_name': 'X Y',
                                                    'student_phone': '9447733333', 'course_id': self.crs.id})
        self.assertFalse(r['ok'])
        code, r = self._post('/public/wallet', good)
        row = r['data']['rows'][0]
        self.assertEqual((row['name'], row['state'], row['course']), ('Anu Stu', 'progress', 'ACCA W'))
        self.assertEqual(r['data']['expected'], 2000.0)
