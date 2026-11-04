# Winners Meet (Otomater)

- `otm_winners_meet/` - Odoo 19 module (data, API, seats, WhatsApp). Add this folder (`winners-meet`) to the Odoo addons path, install **Winners Meet**.
- `frontend/` - Next.js app. `cp .env.example .env.local`, set `ODOO_URL` / `ODOO_DB`, then `npm install && npm run build && npm start` (HTTPS needed for phone camera).

Details: `otm_winners_meet/SETUP.md` and `frontend/README.md`.
Upgrading an installed copy: `odoo-bin -c <conf> -d <db> -u otm_winners_meet --stop-after-init`, then restart.
