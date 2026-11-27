from odoo import fields, models


class CourseInterested(models.Model):
    _inherit = 'course.interested'

    tuition_fee = fields.Float(string="Tuition Fee ₹", digits=(10, 2),
                               help="Base for the coupon student discount and the teacher referral amount.")
