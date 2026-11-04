# winners-meet-web (Next.js 16)

Professional front end for the Odoo module `otm_winners_meet`. The browser never talks to Odoo:
`browser -> Next.js (/api/wm proxy, httpOnly session cookie) -> Odoo /api/wm/*`.

## Run
```bash
cp .env.example .env.local     # set ODOO_URL and ODOO_DB
npm install
npm run dev                    # development
npm run build && npm start     # production
```
**Use HTTPS in production** - phone browsers only allow the camera (QR scanner) on HTTPS.
Behind HTTPS nothing else to change. For plain http testing set `INSECURE_COOKIES=1`.

## Pages
- `/register`, `/register/teacher` - public registration (QR pass is shown and sent on WhatsApp)
- `/pass/<token>` - guest entry pass with QR, seat and hat note (live)
- `/login` - staff sign in with the Odoo account
- `/admin` live dashboard | `/admin/checkin` scanner + search (phone-first) | `/admin/participants`
- `/admin/review` red review queue | `/admin/seats` seat map | `/admin/hats` | `/admin/winners` Excel upload
- `/admin/setup` categories and seat blocks | `/admin/event` event, WhatsApp templates, share links | `/admin/whatsapp`
