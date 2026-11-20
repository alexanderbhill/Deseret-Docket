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
import { landingPage } from "../lib/landing.js";
import { flushQueue } from "../lib/fiscal.js";
import { ensureUsersTable, hashPassword, parseEnvAdmins } from "../lib/auth.js";


async function sectionList(env, origin) {
  // The same division list the rest of the site uses, grouped by department.
  try {
    const r = await env.ASSETS.fetch(new Request(origin + "/config.json"));
    const c = await r.json();
    const dept = Object.fromEntries((c.departments || []).map((d) => [d.id, d.name]));
    return (c.divisions || []).map((d) => ({ id: d.id, name: d.name, group: dept[d.dept] || "Other" }));
  } catch { return []; }
}
async function loginPage(env, url, message, status = 200, next = "/", disabled = false, extra = {}) {
  return landingPage({ message, status, next, disabled, sections: await sectionList(env, url.origin), ...extra });
}

async function findInvite(env, token) {
  if (!env.DB || !/^[a-f0-9]{48}$/.test(String(token || ""))) return null;
  await ensureUsersTable(env.DB);
  return await env.DB.prepare("SELECT * FROM invites WHERE token = ? AND used_at IS NULL AND expires_at > ?").bind(token, new Date().toISOString()).first();
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
    // Signing out sends anything this person queued in the Fiscal Hive.
    try { const u = await sessionUser(request, env); if (u && env.DB) await flushQueue(env, env.DB, url.origin, u.name); } catch { /* never block sign-out */ }
    const h = new Headers({ Location: "/" });
    clearCookies(h);
    return new Response(null, { status: 302, headers: h });
  }

  if (url.pathname === "/login") {
    if (!env.SESSION_SECRET) return loginPage(env, url, "Sign-in is switched off until SESSION_SECRET is set in the Cloudflare Pages settings. You can still browse as a guest.", 503, "/", true);
    if (request.method === "POST") {
      const form = await request.formData();
      const username = String(form.get("username") || "").trim().toLowerCase();
      const password = String(form.get("password") || "");
      const dest = safeNext(String(form.get("next") || "/"));
      const u = await findUser(env, username);
      const ok = u ? await checkPassword(u, password) : (await pbkdf2(password, "00", ITER), false); // same work either way
      if (!ok) {
        await new Promise((r) => setTimeout(r, 600));
        return loginPage(env, url, "That username and password don't match. Check both and try again. If you asked for an account, it may still be waiting for approval.", 401, dest);
      }
      const days = +(env.SESSION_DAYS || 14);
      const s = await makeSession(env, u, days);
      const h = new Headers({ Location: dest });
      h.append("Set-Cookie", `${COOKIE}=${s.value}; Path=/; Max-Age=${s.maxAge}; HttpOnly; Secure; SameSite=Lax`);
      h.append("Set-Cookie", `${USER_COOKIE}=${encodeURIComponent(u.name)}; Path=/; Max-Age=${s.maxAge}; Secure; SameSite=Lax`);
      return new Response(null, { status: 303, headers: h });
    }
    if (await sessionUser(request, env)) return Response.redirect(new URL("/", url), 302);
    // An invitation link: show the sign-up form with their details filled in.
    const inv = url.searchParams.get("invite");
    if (inv) {
      const row = await findInvite(env, inv);
      if (!row) return loginPage(env, url, "That invitation link has expired or was already used. Ask your admin for a new one.", 400);
      return loginPage(env, url, "", 200, "/", false, { mode: "signup", invite: inv, signup: { first: row.first, last: row.last, email: row.email, section: row.section }, notice: `Welcome! ${row.created_by} invited you and already set up your access. Pick a username and password to finish.` });
    }
    return loginPage(env, url, "", 200, safeNext(url.searchParams.get("next") || "/"), false, url.searchParams.get("requested") ? { notice: "Thanks! Your request is in. You can sign in as soon as an admin approves it." } : {});
  }

  // Ask for an account: stored as a pending request until an admin approves it on the Admin page.
  if (url.pathname === "/signup" && request.method === "POST") {
    const f = await request.formData();
    const v = (k, n) => String(f.get(k) || "").trim().slice(0, n);
    const signup = { first: v("first", 40), last: v("last", 40), email: v("email", 120).toLowerCase(), section: v("section", 60), username: v("username", 40).toLowerCase() };
    const pw = String(f.get("password") || "");
    const invite = v("invite", 80);
    const back = (msg) => loginPage(env, url, msg, 400, "/", false, { mode: "signup", signup, ...(invite ? { invite } : {}) });
    if (v("website", 10)) return Response.redirect(new URL("/login?requested=1", url), 303); // bots fill the hidden field
    if (!env.DB) return back("Accounts can't be requested until the database is set up.");
    if (!signup.first || !signup.last) return back("Enter your first and last name.");
    if (!/^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$/.test(signup.email)) return back("That email address doesn't look right.");
    const inv = invite ? await findInvite(env, invite) : null;
    if (invite && !inv) return back("That invitation link has expired or was already used. Ask your admin for a new one.");
    if (inv) { signup.email = inv.email; signup.section = inv.section || signup.section || "other"; }
    if (!signup.section) return back("Choose the section you work in.");
    if (!/^[a-z0-9._-]{2,40}$/.test(signup.username)) return back("Usernames are 2-40 letters, numbers, dots, dashes or underscores.");
    if (pw.length < 10) return back("Use a password with at least 10 characters.");
    await ensureUsersTable(env.DB);
    const taken = parseEnvAdmins(env).has(signup.username)
      || await env.DB.prepare("SELECT 1 FROM users WHERE username = ?").bind(signup.username).first()
      || await env.DB.prepare("SELECT 1 FROM account_requests WHERE username = ? AND status = 'pending'").bind(signup.username).first();
    if (taken) return back("That username is taken. Try another.");
    if (inv) {
      // Invited: the account is created right away with the permissions the admin chose, and they're signed in.
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users (username, pass, role, perms, name, email, ver, disabled, created_at, created_by, first, last, section) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?)")
          .bind(signup.username, await hashPassword(pw), inv.role === "admin" ? "admin" : "member", inv.perms, `${signup.first} ${signup.last}`.trim(), signup.email, now, inv.created_by, signup.first, signup.last, signup.section),
        env.DB.prepare("UPDATE invites SET used_at = ?, used_by = ? WHERE token = ?").bind(now, signup.username, inv.token),
      ]);
      const u = await findUser(env, signup.username);
      const s = await makeSession(env, u, +(env.SESSION_DAYS || 14));
      const h = new Headers({ Location: "/#updates" });
      h.append("Set-Cookie", `${COOKIE}=${s.value}; Path=/; Max-Age=${s.maxAge}; HttpOnly; Secure; SameSite=Lax`);
      h.append("Set-Cookie", `${USER_COOKIE}=${encodeURIComponent(u.name)}; Path=/; Max-Age=${s.maxAge}; Secure; SameSite=Lax`);
      return new Response(null, { status: 303, headers: h });
    }
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM account_requests WHERE status = 'pending'").first();
    if (recent && recent.n > 200) return back("Too many requests are waiting right now. Try again later.");
    const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT INTO account_requests (id, first, last, email, section, username, pass, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)")
      .bind(id, signup.first, signup.last, signup.email, signup.section, signup.username, await hashPassword(pw), new Date().toISOString()).run();
    return Response.redirect(new URL("/login?requested=1", url), 303);
  }

  // Guests choose to browse; remember it so the landing page doesn't come back on every visit.
  if (url.pathname === "/guest") {
    const h = new Headers({ Location: "/" });
    h.append("Set-Cookie", `docket_guest=1; Path=/; Max-Age=${60 * 60 * 24 * 30}; Secure; SameSite=Lax`);
    return new Response(null, { status: 302, headers: h });
  }

  const user = await sessionUser(request, env);
  context.data.user = user; // null for guests; the API checks permissions

  // First visit: show the landing page (sign in / create account) instead of the app.
  if (!user && (url.pathname === "/" || url.pathname === "/index.html") && request.method === "GET" && !/(?:^|;\s*)docket_guest=1/.test(request.headers.get("Cookie") || "")) {
    return Response.redirect(new URL("/login", url), 302);
  }
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
