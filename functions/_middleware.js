// Deseret Docket sign-in for Cloudflare Pages.
//
// The bill information on the site is public, so anyone can browse it as a guest. Signing in adds the
// office's own information (departments, divisions, designations, priority, notes, assignments), which
// only the API hands out, and only to accounts allowed to see it.
//
// Settings (Cloudflare Pages > your project > Settings > Variables and Secrets, type "Secret"):
//   DOCKET_USERS    admin login lines made with make_password.py (one per line)
//   SESSION_SECRET  any long random string (make_password.py prints one)
//   SESSION_DAYS    optional, how long a sign-in lasts (default 14)
//   RESEND_API_KEY, MAIL_FROM, CRON_KEY   for email alerts (see README)
import { COOKIE, USER_COOKIE, findUser, checkPassword, makeSession, sessionUser, ITER, pbkdf2 } from "../lib/auth.js";
import { BEE, BEE_CSS } from "../lib/logo.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function loginPage(message, status = 200, next = "/", disabled = false) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · Deseret Docket</title><meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap" rel="stylesheet">
<style>
:root{--bg:#f7f7f5;--surface:#fff;--ink:#1d1d1b;--muted:#6b6b66;--line:#e3e2dd;--field:#c9c7c0;--accent:#1d1d1b;--on-accent:#fff;--red:#9e3a34;--red-bg:#fbefed;--honey:#e3a52a;--bee-ink:#2a2418;--wing:#eef3f7;--wing-line:#9aa8b4;--link:#7a4a0a}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--surface:#1f1f1c;--ink:#ecebe6;--muted:#a3a29b;--line:#34332f;--field:#4a4943;--accent:#ecebe6;--on-accent:#161614;--red:#f0958c;--red-bg:#3a1d1a;--honey:#e8b04a;--bee-ink:#f3e3bf;--wing:#2b3238;--wing-line:#7d8a95;--link:#e0b36a;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;padding:0 16px}
.box{max-width:400px;margin:12vh auto 40px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:28px}
.brand{display:flex;align-items:center;gap:10px;font:500 26px "Source Serif 4",Georgia,serif;margin-bottom:6px}
.brand svg{width:36px;height:36px}${BEE_CSS}
label{display:block;font-weight:600;margin:14px 0 6px}input{width:100%;padding:10px 12px;border:1px solid var(--field);border-radius:6px;background:var(--surface);color:var(--ink);font:inherit}
button{margin-top:18px;width:100%;padding:10px;border:0;border-radius:6px;background:var(--accent);color:var(--on-accent);font:600 16px inherit;cursor:pointer}
.msg{background:var(--red-bg);color:var(--red);border-radius:6px;padding:8px 12px;font-size:14px;margin-top:12px}.muted{color:var(--muted);font-size:14px;margin:0}
a{color:var(--link)}:focus-visible{outline:2px solid var(--link);outline-offset:2px}
</style></head><body><form class="box" method="post" action="/login">
<div class="brand">${BEE}Deseret Docket</div>
<p class="muted">Sign in to see and edit the office's departments, designations, priorities and notes.</p>
${message ? `<div class="msg" role="alert">${esc(message)}</div>` : ""}
<input type="hidden" name="next" value="${esc(next)}">
<label for="u">Username</label><input id="u" name="username" autocomplete="username" required autofocus ${disabled ? "disabled" : ""}>
<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required ${disabled ? "disabled" : ""}>
<button type="submit" ${disabled ? "disabled" : ""}>Sign in</button>
<p class="muted" style="margin-top:16px"><a href="/">Continue as a guest</a>: browse every bill, hearing and the budget without signing in.</p></form></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" } });
}

function safeNext(n) {
  return typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/";
}

const clearCookies = (h) => {
  h.append("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  h.append("Set-Cookie", `${USER_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`);
};

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (url.pathname === "/logout") {
    const h = new Headers({ Location: "/" });
    clearCookies(h);
    return new Response(null, { status: 302, headers: h });
  }

  if (url.pathname === "/login") {
    if (!env.SESSION_SECRET) return loginPage("Sign-in is switched off until SESSION_SECRET is set in the Cloudflare Pages settings. You can still browse as a guest.", 503, "/", true);
    if (request.method === "POST") {
      const form = await request.formData();
      const username = String(form.get("username") || "").trim().toLowerCase();
      const password = String(form.get("password") || "");
      const dest = safeNext(String(form.get("next") || "/"));
      const u = await findUser(env, username);
      const ok = u ? await checkPassword(u, password) : (await pbkdf2(password, "00", ITER), false); // same work either way
      if (!ok) {
        await new Promise((r) => setTimeout(r, 600));
        return loginPage("That username and password don't match. Check both and try again.", 401, dest);
      }
      const days = +(env.SESSION_DAYS || 14);
      const s = await makeSession(env, u, days);
      const h = new Headers({ Location: dest });
      h.append("Set-Cookie", `${COOKIE}=${s.value}; Path=/; Max-Age=${s.maxAge}; HttpOnly; Secure; SameSite=Lax`);
      h.append("Set-Cookie", `${USER_COOKIE}=${encodeURIComponent(u.name)}; Path=/; Max-Age=${s.maxAge}; Secure; SameSite=Lax`);
      return new Response(null, { status: 303, headers: h });
    }
    if (await sessionUser(request, env)) return Response.redirect(new URL("/", url), 302);
    return loginPage("", 200, safeNext(url.searchParams.get("next") || "/"));
  }

  const user = await sessionUser(request, env);
  context.data.user = user; // null for guests; the API checks permissions
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", "noindex");
  if (url.pathname.startsWith("/api/")) out.headers.set("Cache-Control", "no-store");
  else if (!url.pathname.startsWith("/data/")) out.headers.set("Cache-Control", "no-cache");
  // A stale readable cookie (signed out elsewhere) would make the page think it's signed in.
  if (!user && /(?:^|;\s*)docket_user=/.test(request.headers.get("Cookie") || "") && !url.pathname.startsWith("/api/")) {
    out.headers.append("Set-Cookie", `${USER_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`);
  }
  return out;
}
