from odoo import _, api, fields, models
from odoo.exceptions import UserError


class LeadAdmissionWizard(models.TransientModel):
    _inherit = 'lead.admission.wizard'

    coupon_code = fields.Char(string="Coupon Code",
                              help="Optional. The discount is applied only after a Coupon Approver approves it.")

    @api.model
    def default_get(self, fields_list):
        # a lead that came through a teacher's coupon: fetch the code into the admission form automatically
        res = super().default_get(fields_list)
        lead_id = res.get('lead_id') or self.env.context.get('default_lead_id')
        if lead_id and 'coupon_code' in fields_list and not res.get('coupon_code'):
            lead = self.env['leads.logic'].browse(lead_id).exists()
            res['coupon_code'] = (lead.wm_participant_id.coupon_code or '') if lead else ''
        return res

    def action_confirm_admission(self):
        lead = self.lead_id
        referral = lead.wm_participant_id.coupon_code or ''
        code = (self.coupon_code or '').strip() or referral
        from_referral = bool(code) and code == referral      # auto-fetched code: never block the admission
        res = super().action_confirm_admission()
        if code:
            student = lead.student_id
            enrollment = student.enrollment_ids.filtered(lambda e: e.batch_id == self.batch_id)[:1] if self.batch_id \
                else student.enrollment_ids.sorted('id', reverse=True)[:1]
            if enrollment:
                if (self.coupon_code or '').strip() and not from_referral:
                    self.env['otm.coupon.usage']._request(code, enrollment, source='Admission', lead=lead)
                else:
                    try:                                   # code came from the referral: never block the admission
                        with self.env.cr.savepoint():
                            self.env['otm.coupon.usage']._request(code, enrollment, source='Admission (referral)', lead=lead)
                    except UserError as e:
                        lead.message_post(body=_("Referral coupon not applied: %s", e.args[0] if e.args else e))
        return res


class LeadsLogic(models.Model):
    _inherit = 'leads.logic'

    wm_participant_id = fields.Many2one('otm.wm.participant', string="Referred by (Winners Meet)", copy=False, index=True,
                                        ondelete='set null', help="The teacher whose coupon code brought this lead.")


class QuickPay(models.Model):
    _inherit = 'quick.pay'

    coupon_code = fields.Char(string="Coupon Code", copy=False,
                              help="Entered by staff before verifying. Discount needs Coupon Approver approval.")

    def _do_verify(self):
        res = super()._do_verify()
        for rec in self:
            code = (rec.coupon_code or '').strip()
            if code and rec.enrollment_id:
                self.env['otm.coupon.usage']._request(code, rec.enrollment_id, source=rec.name)
        return res
