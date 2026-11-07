# Winners Meet (Otomater)

- `otm_winners_meet/` - Odoo 19 module (data, API, seats, WhatsApp). Add this folder (`winners-meet`) to the Odoo addons path, install **Winners Meet**.
- `frontend/` - Next.js app. `cp .env.example .env.local`, set `ODOO_URL` / `ODOO_DB`, then `npm install && npm run build && npm start` (HTTPS needed for phone camera).

Details: `otm_winners_meet/SETUP.md` and `frontend/README.md`.
Upgrading an installed copy: `odoo-bin -c <conf> -d <db> -u otm_winners_meet --stop-after-init`, then restart.

## Stage staff WhatsApp templates (Meta, category: Utility, language: English)
Create these two in Meta Business Manager, wait for approval, then type the names in Event > "Stage Staff WhatsApp" tab.

**Template 1, e.g. `wm_stage_done`** (field: Staff: Category Complete Template). Variables in this order: category, collected, missed, event.
```
Stage update: the {{1}} announcement is complete. Trophies collected: {{2}}. Moved to the Missed list: {{3}}. Event: {{4}}.
```
**Template 2, e.g. `wm_stage_late`** (field: Staff: Late Arrival Template). Variables in this order: name, category, event.
```
Stage update: {{1}} has arrived late for {{2}} at {{3}}. Added to the Missed list for collection at the end.
```
