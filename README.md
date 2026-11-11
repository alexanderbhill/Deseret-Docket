# Deseret Docket

A Utah legislative bill tracker for the office: every numbered bill and unnumbered bill file, hearings,
sponsors, fiscal notes, the state budget, meeting transcripts, and the office's own departments,
divisions, designations, priorities, assignments and notes.

Live site: https://deseret-docket.pages.dev (Cloudflare Pages, connected to this repository)

## Who sees what

- **Guests** (not signed in) see everything public: bills, bill files, hearings, legislators, the budget
  tab and transcripts. Nothing a guest changes is saved. Email links open in guest view.
- **Admins** are the logins in the `DOCKET_USERS` secret. They see and change everything and manage the
  other accounts on the **Admin** tab.
- **Members** are accounts an admin makes on the Admin tab. For each one the admin picks what they can
  change, whether they see the office priority and notes, and which bills they see (all, certain
  departments, only bills assigned to them, or a list). New accounts can't see priorities.

## What's in this repository

- `site/index.html`, `site/app.js`, `site/style.css` – the website
- `site/config.json` – departments, divisions (with the keywords used to suggest a division),
  designations and priorities. Edit and commit to change the lists.
- `site/data/` – bill, budget and legislator data; rewritten by the weekday update, don't edit by hand
- `functions/_middleware.js` – sign-in; lets guests through and tells the API who is signed in
- `functions/api/[[route]].js` – office information, accounts, the watch list and email sign-ups,
  stored in the Cloudflare D1 database bound to the Pages project as `DB`
- `lib/` – shared sign-in code and the honeybee logo
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

## Making changes

Every commit to `main` republishes the site in about a minute. To undo a bad change: Cloudflare →
Deployments → pick an earlier deployment → **Rollback to this deployment**.

## Schedules

- Data: weekdays at about 6:40 am, 12:40 pm, 5:25 pm and 7:40 pm Mountain (an hour later during
  daylight saving time). Run it by hand from the Actions tab any time.
- Email: every 15 minutes; each person's emails go out at the times and on the days they chose.
  GitHub's timer can run a few minutes late.

## Try it on your own computer (guest view only)

    cd site
    python3 -m http.server 8000
    # open http://localhost:8000
