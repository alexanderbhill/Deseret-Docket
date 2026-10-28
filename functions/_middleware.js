// Deseret Docket login for Cloudflare Pages.
// Every request (the page AND its data files) must carry a valid signed session cookie,
// otherwise the visitor is sent to /login.
//
// Settings (Cloudflare Pages > your project > Settings > Variables and Secrets, type "Secret"):
//   DOCKET_USERS    one line per user, made with make_password.py, separated by commas or new lines:
//                   username:pbkdf2:100000:<saltHex>:<hashHex>
//   SESSION_SECRET  any long random string (make_password.py prints one)
//   SESSION_DAYS    optional, how long a sign-in lasts (default 14)

const COOKIE = "docket_session";
const USER_COOKIE = "docket_user";
const enc = new TextEncoder();

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function parseUsers(env) {
  // Forgiving: ignores quotes, spaces and line breaks (a long line that wrapped when it was copied
  // from Terminal still works), and any extra text pasted around the login lines.
  const users = new Map();
  const flat = String(env.DOCKET_USERS || "").replace(/["'\s]+/g, "");
  const re = /([a-z0-9._-]{2,40}):pbkdf2:(\d+):([0-9a-f]{32}):([0-9a-f]{64})/gi;
  let m;
  while ((m = re.exec(flat))) users.set(m[1].toLowerCase(), { iter: +m[2], salt: m[3].toLowerCase(), hash: m[4].toLowerCase() });
  return users;
}

async function pbkdf2(password, saltHex, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: iter }, key, 256);
  return hex(bits);
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

function cookies(req) {
  const out = {};
  for (const c of (req.headers.get("Cookie") || "").split(/;\s*/)) {
    const i = c.indexOf("=");
    if (i > 0) out[c.slice(0, i)] = c.slice(i + 1);
  }
  return out;
}

async function sessionUser(req, env) {
  const raw = cookies(req)[COOKIE];
  if (!raw) return null;
  const [userEnc, exp, sig] = decodeURIComponent(raw).split("|");
  if (!userEnc || !exp || !sig || Date.now() > +exp) return null;
  const user = decodeURIComponent(userEnc);
  if (!parseUsers(env).has(user)) return null; // removed users are signed out
  const good = await hmac(env.SESSION_SECRET, `${userEnc}|${exp}`);
  return safeEqual(good, sig) ? user : null;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function loginPage(message, status = 200, next = "/") {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · Deseret Docket</title><meta name="robots" content="noindex">
<style>
:root{--bg:#f3f5f8;--surface:#fff;--ink:#1b2738;--muted:#5b6676;--line:#dfe3ea;--field:#b9c0cb;--accent:#1f3a5f;--on-accent:#fff;--red:#b42318;--red-bg:#fff5f4;--honey:#e3a52a;--honey-line:#8a5a00}
@media (prefers-color-scheme:dark){:root{--bg:#11161e;--surface:#19202b;--ink:#e4e9f0;--muted:#9aa5b4;--line:#2c3644;--field:#475365;--accent:#7fa6d6;--on-accent:#0f1620;--red:#f08a80;--red-bg:#341a18;--honey:#e8b04a;--honey-line:#f3d08a;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;padding:0 16px}
.box{max-width:380px;margin:12vh auto 40px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:28px}
.brand{display:flex;align-items:center;gap:10px;font:600 24px Georgia,"Times New Roman",serif;margin-bottom:6px}
.brand svg{width:32px;height:32px}.band{fill:var(--honey);stroke:var(--honey-line);stroke-width:.8}.door{fill:var(--ink)}
label{display:block;font-weight:600;margin:14px 0 6px}input{width:100%;padding:10px 12px;border:1px solid var(--field);border-radius:5px;background:var(--surface);color:var(--ink);font:inherit}
button{margin-top:18px;width:100%;padding:10px;border:0;border-radius:5px;background:var(--accent);color:var(--on-accent);font:600 16px inherit;cursor:pointer}
.msg{background:var(--red-bg);color:var(--red);border-radius:5px;padding:8px 12px;font-size:14px;margin-top:12px}.muted{color:var(--muted);font-size:14px;margin:0}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style></head><body><form class="box" method="post" action="/login">
<div class="brand"><svg viewBox="0 0 24 24" aria-hidden="true"><rect class="band" x="10.2" y="2.6" width="3.6" height="2.4" rx="1.2"/><rect class="band" x="8.4" y="5" width="7.2" height="3.1" rx="1.55"/><rect class="band" x="6.6" y="8.1" width="10.8" height="3.3" rx="1.65"/><rect class="band" x="5.1" y="11.4" width="13.8" height="3.4" rx="1.7"/><rect class="band" x="4" y="14.8" width="16" height="3.6" rx="1.8"/><rect class="band" x="3" y="18.4" width="18" height="2.4" rx=".6"/><path class="door" d="M10.3 18.4v-1.2a1.7 1.7 0 0 1 3.4 0v1.2z"/></svg>Deseret Docket</div>
<p class="muted">Sign in to see your bills.</p>
${message ? `<div class="msg" role="alert">${esc(message)}</div>` : ""}
<input type="hidden" name="next" value="${esc(next)}">
<label for="u">Username</label><input id="u" name="username" autocomplete="username" required autofocus>
<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in</button></form></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" } });
}

function safeNext(n) {
  return typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/login") ? n : "/";
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  const problems = [];
  if (!env.DOCKET_USERS) problems.push("DOCKET_USERS is missing");
  else if (parseUsers(env).size === 0) problems.push("DOCKET_USERS has no valid login lines (each should look like name:pbkdf2:100000:… from make_password.py)");
  if (!env.SESSION_SECRET) problems.push("SESSION_SECRET is missing");
  if (problems.length) {
    return new Response(`Deseret Docket is locked: ${problems.join("; ")}. Fix it in the Cloudflare Pages settings (Variables and secrets), then redeploy.`, { status: 503, headers: { "Content-Type": "text/plain" } });
  }

  if (url.pathname === "/logout") {
    const h = new Headers({ Location: "/login" });
    h.append("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    h.append("Set-Cookie", `${USER_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Lax`);
    return new Response(null, { status: 302, headers: h });
  }

  if (url.pathname === "/login") {
    if (request.method === "POST") {
      const form = await request.formData();
      const username = String(form.get("username") || "").trim().toLowerCase();
      const password = String(form.get("password") || "");
      const dest = safeNext(String(form.get("next") || "/"));
      const u = parseUsers(env).get(username);
      // Always run the hash so a wrong username takes as long as a wrong password.
      const got = await pbkdf2(password, u ? u.salt : "00", u ? u.iter : 100000);
      if (!u || !safeEqual(got, u.hash)) {
        await new Promise((r) => setTimeout(r, 600));
        return loginPage("That username and password don't match. Check both and try again.", 401, dest);
      }
      const days = +(env.SESSION_DAYS || 14);
      const exp = Date.now() + days * 864e5;
      const userEnc = encodeURIComponent(username);
      const sig = await hmac(env.SESSION_SECRET, `${userEnc}|${exp}`);
      const h = new Headers({ Location: dest });
      h.append("Set-Cookie", `${COOKIE}=${encodeURIComponent(`${userEnc}|${exp}|${sig}`)}; Path=/; Max-Age=${days * 86400}; HttpOnly; Secure; SameSite=Lax`);
      h.append("Set-Cookie", `${USER_COOKIE}=${userEnc}; Path=/; Max-Age=${days * 86400}; Secure; SameSite=Lax`);
      return new Response(null, { status: 303, headers: h });
    }
    if (await sessionUser(request, env)) return Response.redirect(new URL("/", url), 302);
    return loginPage("", 200, safeNext(url.searchParams.get("next") || "/"));
  }

  const user = await sessionUser(request, env);
  if (!user) {
    if (url.pathname.startsWith("/data/") || url.pathname.startsWith("/api/")) return new Response("Sign in required", { status: 401 });
    return Response.redirect(new URL(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, url), 302);
  }
  context.data.user = user; // read by functions/api for the team list
  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set("Cache-Control", "private, no-cache");
  out.headers.set("X-Robots-Tag", "noindex");
  return out;
}
