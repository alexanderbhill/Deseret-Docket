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
- **Members** are accounts an admin makes on the Admin tab. For each one the admin picks what they can
  change, whether they see the office priority and notes, and which bills they see (all, certain
  departments, only bills assigned to them, or a list), and whether they can open the **Fiscal Hive**.
  New accounts can't see priorities.

## What's in this repository

- `site/index.html`, `site/app.js`, `site/style.css` – the website. Each newer feature has its own file:
  `fiscal.js` (Fiscal Hive), `office.js` (committee-position and budget uploads), `intel.js` (floor watch,
  collisions, run-before, media, follow the money), `legis.js` (legislator profiles), `learn.js`
  (Learn the Legislature: games, Capitol quirks, the sponsor ranking under “Members and their bills”, a
  leaderboard stored in the `lgboard` setting, and “Who said it?” quotes people add, stored in `wsquotes`), `wrap.js` (session wrap-up and prep packets), `tour.js` (tour and Help menu)
- `site/config.json` – departments, divisions (with the keywords used to suggest a division),
  designations and priorities. Edit and commit to change the lists.
- `site/data/` – bill, budget and legislator data; rewritten by the weekday update, don't edit by hand
- `functions/_middleware.js` – sign-in; lets guests through and tells the API who is signed in
- `functions/api/[[route]].js` – office information, accounts, the watch list and email sign-ups,
  stored in the Cloudflare D1 database bound to the Pages project as `DB`
- `functions/respond/` – the no-sign-in pages division staff open from Fiscal Hive emails
- `lib/` – shared sign-in code, the landing page, Fiscal Hive email logic and the honeybee logo
- `intel_update.py` – newspaper mentions and sentiment; runs after each data update
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
