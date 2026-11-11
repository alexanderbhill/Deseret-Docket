// Deseret Docket email sign-up (Cloudflare Pages Functions + D1 + Resend).
// These routes are public (no sign-in). Each subscriber gets a private random link (token) that
// confirms, changes or cancels their emails; the sender in GitHub Actions uses CRON_SECRET.
//
// Settings (Cloudflare Pages > Settings > Variables and Secrets):
//   RESEND_API_KEY  from resend.com > API Keys
//   EMAIL_FROM      e.g. "Deseret Docket <docket@yourdomain.com>" (the domain must be verified in Resend)
//   CRON_SECRET     any long random string; the same value goes in the GitHub repository secrets
// Uses the same D1 database (bound as DB) as the team list.
//
//   POST /api/email/subscribe          { email, settings }  sends a confirmation email
//   GET  /api/email/confirm?t=…        confirms, then opens the settings page
//   GET  /api/email/sub?t=…            current settings
//   POST /api/email/sub?t=…            { settings } save changes
//   GET  /api/email/unsubscribe?t=…    page with an Unsubscribe button
//   POST /api/email/unsubscribe?t=…    unsubscribe (also used by Gmail/Outlook one-click)
//   GET  /api/email/cron/subs          (Authorization: Bearer CRON_SECRET) confirmed subscribers
//   POST /api/email/cron/sent          (Authorization: Bearer CRON_SECRET) { updates: [{id, last_main?, last_recap?, files_seen?}] }

let ready = false;
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const bad = (msg, status = 400) => json({ error: msg }, status);
const TOKEN_RE = /^[0-9a-f]{40}$/;
const EMAIL_RE = /^[^\s@<>",;]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const BILL_RE = /^(HB|SB|HJR|SJR|HCR|SCR|HR|SR)\d{1,4}$/;

async function ensureSchema(db) {
  if (ready) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS subs (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, token TEXT UNIQUE,
    confirmed INTEGER DEFAULT 0, settings TEXT, pending TEXT, created TEXT, confirm_sent TEXT,
    last_main TEXT, last_recap TEXT, files_seen TEXT)`).run();
  ready = true;
}

function newToken() {
  const b = new Uint8Array(20);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function cleanSettings(s) {
  if (!s || typeof s !== "object") throw new Error("Missing settings");
  const days = [...new Set((Array.isArray(s.days) ? s.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const hour = Number(s.hour);
  if (!Number.isInteger(hour) || hour < 5 || hour > 22) throw new Error("Pick a time between 5 am and 10 pm");
  const bills = [...new Set((Array.isArray(s.bills) ? s.bills : []).map((b) => String(b).toUpperCase().replace(/[\s.]/g, "")).filter((b) => BILL_RE.test(b)))].slice(0, 150);
  const out = { days, hour, calendar: !!s.calendar, daybefore: !!s.daybefore, recap: !!s.recap, billfiles: !!s.billfiles, bills };
  if (!out.calendar && !out.daybefore && !out.recap && !out.billfiles) throw new Error("Pick at least one thing to send");
  if (out.calendar && !days.length) throw new Error("Pick at least one day");
  return out;
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendConfirm(env, origin, email, token) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error("Email isn't set up yet (RESEND_API_KEY or EMAIL_FROM is missing)");
  const link = `${origin}/api/email/confirm?t=${token}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1b2738;max-width:560px">
  <p style="font:600 22px Georgia,serif;margin:0 0 12px">Deseret Docket</p>
  <p>Someone (hopefully you) asked to get Deseret Docket emails at this address: Utah bills on the legislative calendar and when they're meeting.</p>
  <p><a href="${link}" style="display:inline-block;background:#1f3a5f;color:#fff;padding:10px 18px;border-radius:5px;text-decoration:none;font-weight:600">Confirm my emails</a></p>
  <p style="font-size:14px;color:#5b6676">If you didn't ask for this, ignore this email and nothing will be sent.</p></div>`;
  const text = `Deseret Docket\n\nSomeone (hopefully you) asked to get Deseret Docket emails at this address.\n\nConfirm: ${link}\n\nIf you didn't ask for this, ignore this email and nothing will be sent.`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [email], subject: "Confirm your Deseret Docket emails", html, text }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.log("Resend error", r.status, t);
    throw new Error(r.status === 403 || r.status === 422 ? "The email service refused this address. The site owner may still need to verify the sending domain in Resend." : "The email service didn't accept the message. Try again in a minute.");
  }
}

function page(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)} · Deseret Docket</title><meta name="robots" content="noindex">
<style>:root{--bg:#f3f5f8;--surface:#fff;--ink:#1b2738;--muted:#5b6676;--line:#dfe3ea;--accent:#1f3a5f;--on:#fff}@media (prefers-color-scheme:dark){:root{--bg:#11161e;--surface:#19202b;--ink:#e4e9f0;--muted:#9aa5b4;--line:#2c3644;--accent:#7fa6d6;--on:#0f1620;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;padding:0 16px}.box{max-width:420px;margin:12vh auto;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:28px}
h1{font:600 24px Georgia,serif;margin:0 0 10px}button{padding:10px 16px;border:0;border-radius:5px;background:var(--accent);color:var(--on);font:600 16px inherit;cursor:pointer}a{color:var(--accent)}</style></head>
<body><div class="box"><h1>${escHtml(title)}</h1>${body}</div></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

async function cronAuth(request, env) {
  const got = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!env.CRON_SECRET || got.length !== env.CRON_SECRET.length) return false;
  let r = 0;
  for (let i = 0; i < got.length; i++) r |= got.charCodeAt(i) ^ env.CRON_SECRET.charCodeAt(i);
  return r === 0;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return bad("Email sign-up isn't set up yet: bind a D1 database named DB to this Pages project.", 503);
  const db = env.DB;
  await ensureSchema(db);
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/email\/?/, "").replace(/\/$/, "");
  const token = url.searchParams.get("t") || "";
  const now = new Date().toISOString();

  try {
    // ---- sender (GitHub Actions)
    if (route.startsWith("cron/")) {
      if (!(await cronAuth(request, env))) return bad("Not allowed", 403);
      if (route === "cron/subs" && request.method === "GET") {
        const rows = (await db.prepare("SELECT id, email, token, settings, last_main, last_recap, files_seen FROM subs WHERE confirmed = 1 AND settings IS NOT NULL").all()).results || [];
        return json({ subs: rows.map((r) => ({ ...r, settings: JSON.parse(r.settings) })) });
      }
      if (route === "cron/sent" && request.method === "POST") {
        const body = await request.json();
        const stmts = [];
        for (const u of (body.updates || []).slice(0, 5000)) {
          for (const f of ["last_main", "last_recap", "files_seen"]) {
            if (typeof u[f] === "string" && u[f].length <= 40) stmts.push(db.prepare(`UPDATE subs SET ${f} = ? WHERE id = ?`).bind(u[f], Number(u.id)));
          }
        }
        if (stmts.length) await db.batch(stmts);
        return json({ ok: true, updated: stmts.length });
      }
      return bad("Not found", 404);
    }

    // ---- confirm link from the email
    if (route === "confirm" && request.method === "GET") {
      if (!TOKEN_RE.test(token)) return page("That link didn't work", "<p>Open the newest confirmation email and click its button again.</p>", 400);
      const row = await db.prepare("SELECT id, pending, settings FROM subs WHERE token = ?").bind(token).first();
      if (!row) return page("That link has expired", `<p>This address isn't waiting to be confirmed. You can sign up again on <a href="/#updates">Today's updates</a>.</p>`, 404);
      await db.prepare("UPDATE subs SET confirmed = 1, settings = COALESCE(pending, settings), pending = NULL, files_seen = COALESCE(files_seen, ?) WHERE id = ?")
        .bind(new Date().toLocaleString("sv-SE", { timeZone: "America/Denver" }).replace(" ", "T").slice(0, 16), row.id).run();
      return Response.redirect(new URL(`/#email-${token}-ok`, url), 302);
    }

    // ---- unsubscribe (GET shows a button so link scanners can't unsubscribe people by accident)
    if (route === "unsubscribe") {
      if (!TOKEN_RE.test(token)) return page("That link didn't work", "<p>Open the newest Deseret Docket email and use its unsubscribe link.</p>", 400);
      if (request.method === "GET") {
        return page("Unsubscribe", `<p>Stop all Deseret Docket emails to this address?</p><form method="post"><button>Unsubscribe</button></form><p style="font-size:14px">Or <a href="/#email-${token}">change what you get</a> instead.</p>`);
      }
      if (request.method === "POST") {
        await db.prepare("DELETE FROM subs WHERE token = ?").bind(token).run();
        const accept = request.headers.get("Accept") || "";
        if ((request.headers.get("Content-Type") || "").includes("application/json")) return json({ ok: true });
        if (accept.includes("text/html")) return page("You're unsubscribed", `<p>You won't get any more Deseret Docket emails. You can sign up again any time on <a href="/#updates">Today's updates</a>.</p>`);
        return new Response("Unsubscribed", { status: 200 });
      }
    }

    // ---- everything below is called by the page itself
    if (request.method === "POST" && (!(request.headers.get("Content-Type") || "").includes("application/json") || request.headers.get("X-Docket") !== "1")) {
      return bad("Bad request");
    }

    if (route === "subscribe" && request.method === "POST") {
      const body = await request.json();
      if (body.website) return json({ ok: true }); // filled-in hidden field: a bot
      const email = String(body.email || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return bad("Enter a full email address, like name@example.com");
      const settings = cleanSettings(body.settings);
      const row = await db.prepare("SELECT id, token, confirm_sent FROM subs WHERE email = ?").bind(email).first();
      if (row && row.confirm_sent && Date.now() - Date.parse(row.confirm_sent) < 2 * 60 * 1000) {
        return bad("We just sent a confirmation to that address. Check your inbox (and spam) before trying again.", 429);
      }
      const tok = row ? row.token : newToken();
      if (row) await db.prepare("UPDATE subs SET pending = ?, confirm_sent = ? WHERE id = ?").bind(JSON.stringify(settings), now, row.id).run();
      else await db.prepare("INSERT INTO subs (email, token, confirmed, pending, created, confirm_sent) VALUES (?, ?, 0, ?, ?, ?)").bind(email, tok, JSON.stringify(settings), now, now).run();
      // New settings only take effect after the address owner clicks the link.
      await sendConfirm(env, url.origin, email, tok);
      return json({ ok: true });
    }

    if (route === "sub") {
      if (!TOKEN_RE.test(token)) return bad("bad link");
      const row = await db.prepare("SELECT id, email, confirmed, settings, pending FROM subs WHERE token = ?").bind(token).first();
      if (!row) return bad("gone", 404);
      if (request.method === "POST") {
        const body = await request.json();
        const settings = cleanSettings(body.settings);
        await db.prepare("UPDATE subs SET settings = ?, confirmed = 1, pending = NULL WHERE id = ?").bind(JSON.stringify(settings), row.id).run();
        return json({ email: row.email, confirmed: true, settings });
      }
      return json({ email: row.email, confirmed: !!row.confirmed, settings: JSON.parse(row.settings || row.pending || "null") });
    }

    return bad("Not found", 404);
  } catch (e) {
    return bad(e.message || "Something went wrong", 400);
  }
}
