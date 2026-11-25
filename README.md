# Deseret Docket

A Utah legislative bill tracker for the office: every numbered bill and unnumbered bill file, hearings,
sponsors, fiscal notes, the state budget, meeting transcripts, and the office's own departments,
divisions, designations, priorities, assignments and notes.

Live site: https://deseret-docket.pages.dev (Cloudflare Pages, connected to this repository)

## Who sees what

- **New visitors** land on the sign-in page, which also has **Create account** and a tour of the features.
  Account requests (name, email, section, chosen username and password) wait on the Admin tab until an
  admin approves them and picks their permissions.
- **Guests** ("Browse as a guest") see public information only: bills, bill files, hearings, legislators,
  the budget, transcripts, Daily Updates and Learn. No office positions, notes, assignments, committee
  positions, Fiscal Hive, watch list or email alerts. Nothing a guest changes is saved.
- **Admins** are the logins in the `DOCKET_USERS` secret. They see and change everything and manage the
  other accounts on the **Admin** tab.
- **Invitations:** on the Admin tab, **Invite someone** sets a person's permissions first and opens an email draft
  (Outlook or Outlook on the web) with a one-time sign-up link that works for 14 days. They choose their own username and
  password and are signed in right away, with no approval step.
- **Members** are accounts an admin makes on the Admin tab. For each one the admin picks what they can
  change, whether they see the office priority and notes, and which bills they see (all, certain
  departments, only bills assigned to them, or a list), and whether they can open the **Fiscal Hive**.
  New accounts can't see priorities.

## What's in this repository

- `site/index.html`, `site/app.js`, `site/style.css` – the website. Each newer feature has its own file:
  `fiscal.js` (Fiscal Hive), `office.js` (association-position and budget uploads), `intel.js` (floor watch,
  collisions, run-before, media, follow the money), `legis.js` (legislator profiles), `learn.js`
  (Learn the Legislature: games, Capitol quirks, the sponsor ranking under “Members and their bills”, a
  leaderboard stored in the `lgboard` setting, and “Who said it?” quotes people add, stored in `wsquotes`), `wrap.js` (session wrap-up and prep packets), `tour.js` (tour and Help menu), `map.js` (Learn → District map game and the reference map), `guides.js` (Learn → How a bill becomes law, including the budget), `agguide.js` (Learn → the AG's Office, explained, including the org chart's photo-and-bio cards, stored in the `agpeople` setting), `aggame.js` (Learn → AG Office Showdown, a timed quiz on the office), `tracker.js` (the shared Excel bill tracker card and its Admin settings), `hearshare.js` (the Share button on hearing tiles), `outreach.js` (the Outreach tab), `review.js` (Outreach → Draft review), `hover.js` (hover cards for committees, divisions and legislators, and pie-slice labels), `demo.js` (walk-through demos of Fiscal Hive, the email alerts and Draft review with Outlook connected)
- `site/config.json` – departments, divisions (with the keywords used to suggest a division),
  designations and priorities. Edit and commit to change the lists.
- `site/data/` – bill, budget and legislator data; rewritten by the weekday update, don't edit by hand
- `site/geo/` – district shapes (`districts.json`) and the cities or counties each district covers (`where.json`), from Utah's UGRC. Districts are fixed through 2032; rebuild with `python3 tools/build_districts.py` after redistricting
- `functions/_middleware.js` – sign-in; lets guests through and tells the API who is signed in
- `functions/api/[[route]].js` – office information, accounts, the watch list and email sign-ups,
  stored in the Cloudflare D1 database bound to the Pages project as `DB`
- `functions/respond/` – the no-sign-in pages division staff open from Fiscal Hive emails
- `functions/review/` – the no-sign-in pages divisions open from Draft review emails
- `lib/` – shared sign-in code, the landing page, Fiscal Hive email logic, Outreach storage and follow-up reminders (`outreach.js`), Draft review emails and reminders (`review.js`) and the honeybee logo
- `intel_update.py` – newspaper mentions and sentiment, plus `data/ag.json` (the AG's office in the news, its press releases and AG Brown's op-eds); runs after each data update
- `media_avail.py` – transcribes and summarizes House/Senate media availabilities (`.github/workflows/media.yml`)
- `update_docket.py` – downloads bills, bill files, fiscal notes, text changes, transcripts, COBI budget
  data and appropriations meetings
- `send_alerts.py` – writes the email alerts
- `.github/workflows/update.yml` – the weekday data update
- `.github/workflows/email.yml` – sends due emails every 15 minutes

## Settings

Cloudflare Pages → deseret-docket → Settings → Variables and secrets (type **Secret**):

| Name | What it is |
| --- | --- |
| `DOCKET_USERS` | Admin login lines from `python3 make_password.py`, one per line |
| `SESSION_SECRET` | Long random string. Changing it signs everyone out |
| `RESEND_API_KEY` | From resend.com → API Keys (sending access) |
| `MAIL_FROM` | The sender, on a domain verified in Resend, e.g. `Deseret Docket <alerts@yourdomain.org>` |
| `CRON_KEY` | Any long random string (30+ characters). Must match the GitHub secret below |

GitHub → Settings → Secrets and variables → Actions:

| Name | Kind | What it is |
| --- | --- | --- |
| `LEG_TOKEN` | Secret | Your Utah Legislature API token |
| `CRON_KEY` | Secret | Same value as in Cloudflare |
| `SITE_URL` | Variable (optional) | Only if the site moves off https://deseret-docket.pages.dev |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | Secrets (optional) | A Microsoft 365 app registration (from IT) with Microsoft Graph permission to edit the shared bill tracker workbook. Without them the sync only builds the Updates-page preview |

After changing Cloudflare settings, redeploy (Deployments → latest → Manage deployment → Retry deployment).

## Other settings in `site/config.json`

- `sessions`: start and sine die (11:59 p.m. on the last night) for the countdown bar, plus key deadlines.
- `pronouns`: she/he for legislator cards, by legislator id. Anyone not listed is guessed from their first name.
- `newsFeeds`: the newspaper RSS feeds used for each bill's News tab.

The Session wrap-up tab turns on by itself in the last week of a session; an admin can switch it on early
on the Admin page.

## Fiscal Hive in short

1. An admin turns on **Can open the Fiscal Hive** for the point of contact (Admin → Edit).
2. Under Fiscal Hive → **Settings**, add who gets requests for each division (or let it fall back to
   approved accounts in that section) and set the Appropriations threshold (default $20,000).
3. New bills and every new substitute appear as cards in the **Inbox**. Confirm the division(s) and press
   Enter. Everything queued in one sitting goes out as one email per division when the POC leaves the
   dashboard, signs out, presses **Send now**, or after 10 idle minutes.
4. Divisions answer from the email: **No impact**, **Probable fiscal impact** (amount + what it covers) or
   **Wrong section** (who should get it). Unanswered requests get a reminder after 24 hours; the bell
   sends one right away.
5. Until `RESEND_API_KEY` and `MAIL_FROM` are set, emails are saved to the **Outbox** instead of sent.

## Making changes

Every commit to `main` republishes the site in about a minute. To undo a bad change: Cloudflare →
Deployments → pick an earlier deployment → **Rollback to this deployment**.

## The shared bill tracker workbook

- **Admin → Bill tracker workbook:** paste the workbook's Share link, the name people see, the sheet Deseret Docket fills in
  (default “Deseret Docket”; no other sheet is touched), which bills (the office list or every bill) and the session.
- **Who sees it:** admins always; anyone else only with Admin → Edit → **Can see the shared bill tracker workbook**. They get a
  card on the Updates page with the link, the last sync and a preview.
- **Sync:** `sync_tracker.py` runs as the last step of each weekday data update (four times a day, right after the
  Legislature data), using the `MS_*` secrets above.
- **Downloads:** only admins see the Download .csv buttons, and the file is always named `2027 Bill Tracker Draft.csv`.

## Departments that aren't bill designations

A department with `"designate": false` in `site/config.json` (today: **Executive**, with a single
Executive division) is used for accounts, Fiscal Hive routing, the implementation tracker and the org
chart, but is never offered as a bill's department or division. Fiscal Hive → Settings → **Custom divisions** adds routing-only
units (a name and Send/CC emails) stored in the `fn_customdivs` setting.

## Outreach

The relationship side of the session, for admins and anyone with Admin → Edit → **Can use Outreach**:

- **Draft review:** every draft out for the office's review, in three columns by whose turn it is: **Waiting on us**, **Waiting on
  divisions** and **Waiting on the drafter**, each with how long it's been there.
  1. **Log a draft** when one comes in from the drafter (LRGC), a sponsor or a stakeholder: the bill or bill file, version, who it's from
     and their email, the legislators to copy, a link to the draft, the point of contact (Dan or Katie), the divisions and the due dates.
  2. **Send to divisions** emails each division (its people under Fiscal Hive → Settings → Who gets requests) with **No concerns** and
     **Send comments** buttons. They answer without signing in; comments can include suggested language. A division that answered some
     other way can be recorded with **Record answer**.
  3. One reminder goes out by itself on the due date (or two days after the request with no due date); **Remind** sends one any time.
     When the last division answers, the point of contact gets an email with every answer.
  4. **Send feedback back** drafts the email to the drafter from the divisions' comments (with or without division names). Open it in
     Outlook or Outlook on the web, send it, then press **Yes, mark it sent back**.
  5. **Log a reply or call** adds to the draft's trail; **New version came in** closes the round and starts the next one with the same
     people and divisions. The bill page (or the bill file's page) shows its draft review too.
  Until email is connected, the division emails wait in Fiscal Hive → Settings → Outbox. **See it with email connected** walks through how
  it works once Outlook is hooked up (spotting drafts in the POC's inbox, sending from their own mailbox in the drafter's thread, and
  logging replies automatically), which would need Microsoft Graph Mail.Send and Mail.Read permissions on Dan's and Katie's mailboxes.
- **Meetings:** who the office met with (legislators, staff, stakeholders), who from the office went, bills discussed, notes and a follow-up date.
- **Asks:** what the office asked each legislator for, what they said or committed to, status, owner and follow-up date.
- **Testimony:** pick a bill and get a two-minute draft built from the office position, what the bill does, the divisions it touches,
  the fiscal note and Fiscal Hive estimates, earlier versions and association positions. Edit, rehearse against a timer, save, copy or print.
- **Amendments:** language requests tied to the bill's page and lines, with status and owner.
- **Interim:** study items for each interim committee, with the division affected and who's preparing.
- **Overview:** what's due this week, hearings in the next two weeks that need testimony, recent meetings, and sponsors of
  bills the office has a position on that nobody has met with yet.
- Every bill page (Hearings and debate tab) and legislator profile shows the office's outreach with them.
- Follow-up dates you own show as a badge on the tab; the 15-minute email job emails the owner once a follow-up comes due
  (owners need an account with an email address). Stored in the `outreach` table.

### Wish list and language

Outreach → **Wish list** keeps ideas for future sessions in three lists (OAG wish list, client wish list, outside ideas),
like the office's spreadsheet (**Import your spreadsheet** reads it: section rows, then Priority, To Do, OAG Team or Group,
Summary, Next Steps, OAG POC). Each idea moves from Idea to Writing the language, Language ready, Sent to sponsor or
drafter, Bill file opened, Numbered bill and Passed (or Parked). Open an idea to type or attach the language,
**Get the divisions' input** (starts a Draft review of the office's own language) and **Send to the sponsor and drafter**
(an email from you in Outlook).

- **Redlines:** divisions can answer a Draft review by attaching a marked-up Word or PDF file instead of (or as well as)
  typing comments. Files are kept in D1 (`files`, `file_parts`; `lib/files.js`), up to 10 MB each, attached to the
  "everything's in" email and downloadable from the review.
- **Emails come from the sender:** division emails are written as a note from whoever pressed Send, signed with the name
  and title in **Your account → Your profile**, sent under their name, and replies go to their email. Admins whose
  login is in `DOCKET_USERS` set their name, email and section there too (stored in `profiles`).
- **Testimony** suggests the committee meetings a bill is on the agenda for (or pick another), and greets that
  committee's chair by name.
- **Interim** lists the Legislature's study items under each interim committee, from `site/data/interim.json`.
  `build_interim.py` reads the year's approved list (the PDF link in `site/config.json` → `interimStudyItems`; add
  next year's when the Legislative Management Committee approves it, usually in April) at the end of the data update.
- The walk-through at the top of Outreach → Overview (`site/outdemo.js`) shows the whole loop.

## Schedules

- Data: weekdays at about 6:40 am, 12:40 pm, 5:25 pm and 7:40 pm Mountain (an hour later during
  daylight saving time). Run it by hand from the Actions tab any time.
- Email: every 15 minutes; each person's emails go out at the times and on the days they chose.
  The same job sends idle Fiscal Hive queues, 24-hour reminders and implementation-tracker reminders.
  GitHub's timer can run a few minutes late.
- Media availabilities: every 30 minutes, 10 am–6 pm on weekdays, January–March (or run it by hand with a link).
- Session dates and deadlines (the sine die bar) live in `site/config.json` under `sessions`; add each new
  session's dates from le.utah.gov when they're posted.

## Try it on your own computer (guest view only)

    cd site
    python3 -m http.server 8000
    # open http://localhost:8000
