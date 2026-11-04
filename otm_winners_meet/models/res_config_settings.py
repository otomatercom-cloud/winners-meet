from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    wm_wa_enabled = fields.Selection(
        [('inherit', 'Same as Student Attendance WhatsApp'), ('on', 'Enabled'), ('off', 'Disabled')],
        string="Winners Meet WhatsApp", default='inherit', config_parameter='otm_winners_meet.enabled')
    wm_wa_provider = fields.Selection(
        [('meta', 'Meta Cloud API'), ('gateway', 'HTTP Gateway')], string="Provider",
        config_parameter='otm_winners_meet.provider')
    wm_wa_meta_phone_id = fields.Char(string="Phone Number ID", config_parameter='otm_winners_meet.meta_phone_id')
    wm_wa_meta_token = fields.Char(string="Access Token", config_parameter='otm_winners_meet.meta_token')
    wm_wa_template_lang = fields.Char(string="Template Language", config_parameter='otm_winners_meet.template_lang')
    wm_wa_country_code = fields.Char(string="Country Code", config_parameter='otm_winners_meet.country_code')
