from odoo import fields, models


class LeadAdmissionWizard(models.TransientModel):
    _inherit = 'lead.admission.wizard'

    coupon_code = fields.Char(string="Coupon Code",
                              help="Optional. The discount is applied only after a Coupon Approver approves it.")

    def action_confirm_admission(self):
        code = (self.coupon_code or '').strip()
        res = super().action_confirm_admission()
        if code and self.batch_required:
            student = self.lead_id.student_id
            enrollment = student.enrollment_ids.filtered(lambda e: e.batch_id == self.batch_id)[:1]
            if enrollment:
                self.env['otm.coupon.usage']._request(code, enrollment, source='Admission')
        return res


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
