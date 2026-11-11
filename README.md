# Deseret Docket

A Utah legislative bill tracker for the team, with a guest mode, sign-in, a shared team list, email alerts, and live data
from the Utah Legislature (bills, bill text, and committee/floor meeting transcripts).

Live site: https://deseret-docket.pages.dev (Cloudflare Pages, connected to this repository)

## What's in this repository

- `site/index.html` – the whole website (one page)
- `site/data/` – bill data; rewritten automatically by the weekday update, don't edit by hand
- `functions/_middleware.js` – the sign-in. Guests can read everything; only the team list API needs a sign-in
- `functions/api/[[route]].js` – the shared team list (divisions, flags, notes, watch list, history),
  stored in a Cloudflare D1 database bound to the Pages project as `DB`
- `functions/api/email/[[path]].js` – email sign-up, confirmation, settings and unsubscribe (public)
- `send_emails.py` – builds and sends the emails through Resend
- `.github/workflows/email.yml` – runs `send_emails.py` every hour
- `update_docket.py` – downloads bills, bill text and meeting transcripts and flags Attorney General mentions
- `make_password.py` – makes a login line for a new person
- `.github/workflows/update.yml` – runs the update on weekdays and commits the new data

## Making changes to the website

Every commit to `main` republishes the site in about a minute.

- Small edits: open the file on GitHub, click the pencil icon, edit, then **Commit changes**.
- To check a change first: Cloudflare builds a preview for any other branch you commit to.
- If a change breaks something: in Cloudflare, Deployments → pick an earlier deployment →
  Manage deployment → **Rollback to this deployment**.

## Logins

1. Run `python3 make_password.py` for each person. It prints a line like `alex:pbkdf2:100000:…:…`.
2. In Cloudflare: Workers & Pages → deseret-docket (Pages) → Settings → Variables and secrets.
   `DOCKET_USERS` holds every person's line, one per line or separated by commas. Saved secrets
   can't be read back, so paste all the lines each time you change it.
3. Leave `SESSION_SECRET` alone; changing it signs everyone out.
4. Redeploy (Deployments → latest → Manage deployment → Retry deployment).

Removing someone's line signs them out right away.

## Team list

Divisions, flags, notes and the watch list are shared by everyone who signs in, and each bill page
shows who changed what. They live in the D1 database bound as `DB`, so they survive redeploys.

## Weekday updates

GitHub runs `update.yml` on weekdays (about 6:40 am, 12:40 pm, 4:40 pm and 7:40 pm Mountain).
It needs the repository secret `LEG_TOKEN` (your Utah Legislature API token). You can also run it
by hand from the Actions tab.

## Guest mode

Anyone can open the site without signing in. Guests see every bill, hearing and transcript, but
nothing they change is saved and the office's divisions, flags and notes stay hidden. The links in
the emails open the site in guest mode. Staff click **Sign in** (top right) for the team list.

## Emails

On **Today's updates**, anyone can sign up with an email address, pick days and a time, choose every
bill or only certain bill numbers, and choose what to get:

- **What's on the calendar** – committee meetings in the next week and bills waiting on the floor calendars
- **Day-before heads-up** – when and where a bill is heard tomorrow
- **End-of-day recap** (about 6 pm) – how each bill's discussion went, from the meeting timelines and transcripts
- **New bill files** – newly opened bill files with their working title and sponsor

Every sign-up gets a confirmation email first. Every email links to a settings page and has an
unsubscribe link. Subscribers are stored in the same D1 database (`DB`), table `subs`.

Setup (once):

1. **Resend** (resend.com): add and verify a domain you control under Domains (it gives you DNS
   records to add). Without a verified domain, Resend only delivers to your own address. Then create
   an API key under API Keys (Sending access).
2. **Cloudflare** (Workers & Pages → deseret-docket → Settings → Variables and secrets), add as Secrets:
   `RESEND_API_KEY`, `EMAIL_FROM` (like `Deseret Docket <docket@yourdomain.com>`) and `CRON_SECRET`
   (any long random string). Then redeploy.
3. **GitHub** (Settings → Secrets and variables → Actions → New repository secret): add the same
   `RESEND_API_KEY`, `EMAIL_FROM` and `CRON_SECRET`.

`email.yml` runs every hour. GitHub sometimes starts scheduled runs late, so emails arrive within
about half an hour of the chosen time. Resend's free plan allows 100 emails a day and 3,000 a month.

To preview emails without sending (writes HTML files into `preview/`):

    python3 -I send_emails.py --dry-run preview --subs test_subs.json --now 2026-02-18T07:10

## Try it on your own computer (no sign-in, no team list)

    cd site
    python3 -m http.server 8000
    # open http://localhost:8000
