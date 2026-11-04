# otm_winners_meet (Odoo 19)

Backend for the Winners Meet event: registration, winners-list matching, approval, seat allocation,
check-in, hats and WhatsApp. **No Odoo UI is needed for daily work** - the Next.js app (`winners-meet-web`)
talks to the JSON API at `/api/wm/*`. A small backend UI (events, participants, review queue, WhatsApp log) is
included as a fallback.

## Install
1. Copy the `otm_winners_meet` folder into your addons path, Update Apps List, install **Winners Meet**.
2. Users: *Settings > Users* > give the **Winners Meet** privilege: **Administrator** (full) or **Desk Volunteer**
   (check-in, seat change, hats, on-spot registration).
3. *Settings > Winners Meet*: WhatsApp is **"Same as Student Attendance WhatsApp"** by default - it reuses the Meta
   credentials already saved for student attendance (`student_details.att_wa.*`). Choose *Enabled* and fill
   credentials only if you want a different number.
4. Open the Next.js app > *Event settings*, create the event, set status **Open**, set the public site URL.

## Rules built in
- Phone is normalised (+91) and unique per event. Duplicate registration never creates a second record.
- Winners list uploaded: student matches by phone + name (tolerates initials/typos, 80%) + category.
  Not matching = **Needs review** (red); no WhatsApp and no check-in until an admin approves.
  No list uploaded = auto-approved with the chosen category. Teachers auto-approved (switchable).
- Seat assigned at check-in: category -> seat block -> next free seat (or desk picks, per category).
  `unique(seat)` constraint + row locks: two desks can never give the same seat.
- Hat: categories with *Gets Hat* issue the hat automatically at check-in; return/lost tracked.
- WhatsApp: queued, sent by cron every minute, 3 automatic retries, de-duplicated. A WhatsApp failure never blocks check-in.

## WhatsApp templates (Meta, category Utility). Variables cannot be first/last in the text.
`wm_registration_confirmed` (params: 1 name, 2 event, 3 date, 4 venue, 5 pass link)
> Hi {{1}}, your registration for {{2}} on {{3}} at {{4}} is confirmed. Show your entry pass at the desk: {{5}} See you there!

`wm_seat_details` (params: 1 name, 2 seat, 3 event, 4 hat note, 5 pass link)
> Hi {{1}}, welcome to {{3}}! Your seat is {{2}}. {{4}} Your entry pass: {{5}} Enjoy the programme!

Enter the template names in *Event settings*. With no template name, plain text is sent (works only inside WhatsApp's 24-hour window).
