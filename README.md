# Deseret Docket (self-hosted, with sign-in)

What's in this folder:

- `site/` – the website (page + bill data)
- `functions/_middleware.js` – the sign-in system. It runs on Cloudflare Pages and blocks the
  page AND the data files until someone signs in with a username and password.
- `make_password.py` – makes a login line for each person
- `update_docket.py` – refreshes `site/data/` from the Utah Legislature: bills, bill text, and the
  committee and floor meeting transcripts (Vimeo captions linked from utleg.gov), flagging any
  mention of the Attorney General
- `.github/workflows/update.yml` – runs the update on weekdays and commits the new data; Cloudflare Pages
  is connected to this repository and republishes the site on every commit

## Set up the logins

1. Run `python3 make_password.py` for each person who should have access.
   It asks for a username and password and prints a line like
   `alex:pbkdf2:100000:…:…`. Passwords are never stored, only a salted hash.
2. In Cloudflare: Workers & Pages → your `deseret-docket` project → Settings →
   Variables and Secrets. Add, as type **Secret**, for Production:
   - `DOCKET_USERS` – the line(s) from step 1, one per line (or separated by commas)
   - `SESSION_SECRET` – the random string make_password.py printed (only set it once)
   - `SESSION_DAYS` – optional, how many days a sign-in lasts (default 14)
3. Redeploy (run the GitHub workflow by hand once). Visiting the site now shows a sign-in page.

To change a password or add/remove someone, edit `DOCKET_USERS` and redeploy. Removing a line
signs that person out right away.

If the secrets are missing, the site refuses to show anything (it fails closed).

## Publish and keep it updated

1. Put this folder in a **private** GitHub repository (include the hidden `.github` folder).
2. In GitHub → Settings → Secrets and variables → Actions, add `LEG_TOKEN` (your Legislature
   token), `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Create a Cloudflare Pages project named `deseret-docket` (Direct Upload is fine).
4. Run "Update Deseret Docket" from the Actions tab. After that it runs on weekdays by itself.

## Try it on your own computer (no sign-in)

    cd site
    python3 -m http.server 8000
    # open http://localhost:8000

The sign-in only works on Cloudflare Pages. To test it locally:
`npx wrangler pages dev site` from this folder, with the secrets in a `.dev.vars` file.
