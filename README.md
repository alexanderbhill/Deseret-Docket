# Deseret Docket

A Utah legislative bill tracker for the team, with sign-in, a shared team list, and live data
from the Utah Legislature (bills, bill text, and committee/floor meeting transcripts).

Live site: https://deseret-docket.pages.dev (Cloudflare Pages, connected to this repository)

## What's in this repository

- `site/index.html` – the whole website (one page)
- `site/data/` – bill data; rewritten automatically by the weekday update, don't edit by hand
- `functions/_middleware.js` – the sign-in. Blocks the page, the data and the API until someone signs in
- `functions/api/[[route]].js` – the shared team list (divisions, flags, notes, watch list, history),
  stored in a Cloudflare D1 database bound to the Pages project as `DB`
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

## Try it on your own computer (no sign-in, no team list)

    cd site
    python3 -m http.server 8000
    # open http://localhost:8000
