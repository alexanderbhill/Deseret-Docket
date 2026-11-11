// Deseret Docket API (Cloudflare Pages Functions + D1 database bound as "DB").
//
// Signed in (permissions apply):
//   GET  /api/me                 who is signed in, their permissions, the people list
//   GET  /api/state              the office's information for the bills this account may see
//   POST /api/bill               { key, departments?, divisions?, designations?, priority?, note?, assignees? }
//   POST /api/watch              { terms, codes, opts }
//   GET  /api/log?key=…          recent office activity for one bill
//   POST /api/prefs              { cols, … }  this account's display settings (column order)
//   POST /api/password           { old, new }
// Admins only:
//   GET  /api/users              every account
//   POST /api/users              { action: save|disable|enable|delete, username, … }
//   POST /api/people             { names }  extra names for the "Assigned to" list
// Anyone (guests too):
//   POST /api/subscribe          { email, opts }  sends a confirmation email
//   GET  /api/confirm?t=…        confirms an email (link in that email)
//   GET  /api/sub?t=…            read email settings;  POST /api/sub { t, opts | action:"delete" }
//   GET  /api/unsubscribe?t=…    one-click unsubscribe
// The email job (GitHub Actions, header X-Cron-Key):
//   GET  /api/cron/subs          confirmed subscriptions and the bills each one covers
//   POST /api/cron/send          { emails: [...] } sends through Resend and records what went out
import { ensureUsersTable, findUser, checkPassword, hashPassword, cleanPerms, DEFAULT_PERMS, parseEnvAdmins, FIELDS } from "../../lib/auth.js";

const DEPTS = new Set(["criminal", "civil", "pp", "appellate"]);
const PRIORITIES = new Set(["high", "priority", "watching", "notrelevant"]);
const POSITIONS = new Set(["priority-oppose", "oppose", "neutral", "support", "priority-support"]);
const DESIGNATIONS = new Set(["CCJJ", "SENTENCING", "ULELC", "SWAP", "USAAV", "VICTIMS"]);
const KEY_RE = /^\d{4}[A-Z0-9]{2,4}\/[A-Z0-9-]{2,24}$/;
const DIV_RE = /^[a-z]{2}-[a-z0-9-]{2,40}$/;
const NAME_RE = /^[\p{L}\p{N} .,'()_-]{1,60}$/u;
let ready = false;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const bad = (msg, status = 400) => json({ error: msg }, status);
const arr = (v) => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
const obj = (v) => { try { const o = JSON.parse(v || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } };

async function ensureSchema(db) {
  if (ready) return;
  await ensureUsersTable(db);
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS bills (key TEXT PRIMARY KEY, division TEXT, flag TEXT, note TEXT,
      div_by TEXT, div_at TEXT, flag_by TEXT, flag_at TEXT, note_by TEXT, note_at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT, by TEXT, at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, by TEXT, key TEXT, what TEXT)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS log_key ON log (key, id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS prefs (username TEXT PRIMARY KEY, v TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS email_subs (id TEXT PRIMARY KEY, email TEXT UNIQUE, token TEXT UNIQUE, confirmed INTEGER DEFAULT 0,
      username TEXT, opts TEXT, pending TEXT, created_at TEXT, confirm_sent_at TEXT, last TEXT)`),
  ]);
  // Columns added in this version of the site (older databases only have division/flag/note).
  for (const col of ["departments", "divisions", "designations", "priority", "assignees", "meta", "position", "ag_action"]) {
    try { await db.prepare(`ALTER TABLE bills ADD COLUMN ${col} TEXT`).run(); } catch { /* already there */ }
  }
  // Carry over the old single division (now a department) and flag (now the office priority).
  await db.batch([
    db.prepare(`UPDATE bills SET departments = json_array(division) WHERE departments IS NULL AND division IS NOT NULL AND division <> ''`),
    db.prepare(`UPDATE bills SET priority = flag WHERE priority IS NULL AND flag IS NOT NULL AND flag <> ''`),
  ]);
  ready = true;
}

// ---------------------------------------------------------------- permissions
function inScope(user, row, key) {
  const p = user.perms;
  if (user.role === "admin" || p.scope === "all") return true;
  if (p.scope === "bills") return p.bills.includes(key);
  if (p.scope === "departments") return arr(row && row.departments).some((d) => p.departments.includes(d));
  if (p.scope === "assigned") return arr(row && row.assignees).some((a) => [user.name, (user.display || "").toLowerCase()].includes(String(a).toLowerCase()));
  return false;
}
function canEdit(user, field) {
  if (user.role === "admin") return true;
  return user.perms.edit && user.perms.fields.includes(field) && (field !== "priority" || user.perms.seePriority) && (field !== "note" || user.perms.seeNotes);
}
function rowOut(user, r) {
  const meta = obj(r.meta);
  const o = {
    departments: arr(r.departments), divisions: arr(r.divisions), designations: arr(r.designations),
    assignees: arr(r.assignees), position: r.position || null, agAction: r.ag_action || "", meta: {},
  };
  const show = (f) => (f === "priority" ? user.perms.seePriority || user.role === "admin" : f === "note" ? user.perms.seeNotes || user.role === "admin" : true);
  if (show("priority")) o.priority = r.priority || null;
  if (show("note")) o.note = r.note || "";
  for (const [f, v] of Object.entries(meta)) if (show(f)) o.meta[f] = v;
  return o;
}
async function people(db) {
  const s = await db.prepare("SELECT v FROM settings WHERE k = 'people'").first();
  const extra = s ? arr(s.v) : [];
  const users = ((await db.prepare("SELECT username, name FROM users WHERE disabled = 0").all()).results || []).map((u) => u.username);
  return { extra, all: [...new Set([...users, ...extra])].sort((a, b) => a.localeCompare(b)) };
}
async function allPeople(env, db) {
  const p = await people(db);
  const admins = [...parseEnvAdmins(env).keys()];
  return { extra: p.extra, all: [...new Set([...admins, ...p.all])].sort((a, b) => a.localeCompare(b)) };
}

function cleanWatch(w) {
  const list = (a, max) => (Array.isArray(a) ? a : []).filter((x) => x && typeof x.t === "string" && x.t.trim()).slice(0, max)
    .map((x) => ({ t: x.t.trim().replace(/\s+/g, " ").slice(0, 120), on: x.on !== false }));
  const o = w && typeof w.opts === "object" ? w.opts : {};
  return {
    terms: list(w && w.terms, 200),
    codes: list(w && w.codes, 200).filter((x) => /^\d+[A-Za-z]?(-\d+[A-Za-z]?(-\d+(\.\d+)?)?)?$/.test(x.t)),
    opts: { struck: o.struck !== false, defsOnly: !!o.defsOnly, titlesOnly: !!o.titlesOnly },
  };
}

async function readState(db, user) {
  const rows = (await db.prepare("SELECT * FROM bills").all()).results || [];
  const bills = {};
  for (const r of rows) {
    const has = arr(r.departments).length || arr(r.divisions).length || arr(r.designations).length || r.priority || r.note || arr(r.assignees).length || r.position || r.ag_action;
    if (!has || !inScope(user, r, r.key)) continue;
    bills[r.key] = rowOut(user, r);
  }
  const w = await db.prepare("SELECT v, by, at FROM settings WHERE k = 'watch'").first();
  const watch = w ? { ...cleanWatch(JSON.parse(w.v)), by: w.by, at: w.at } : null;
  const pr = await db.prepare("SELECT v FROM prefs WHERE username = ?").bind(user.name).first();
  return { bills, watch, prefs: pr ? obj(pr.v) : {} };
}

async function setBill(db, user, body, peopleAll) {
  const key = String(body.key || "");
  if (!KEY_RE.test(key)) throw new Error("bad key");
  const now = new Date().toISOString();
  const cur = (await db.prepare("SELECT * FROM bills WHERE key = ?").bind(key).first()) || { key };
  const next = { ...cur };
  const meta = obj(cur.meta);
  const logs = [];
  const listField = (f, valid, max) => {
    if (!(f in body)) return;
    if (!canEdit(user, f)) throw new Error("not allowed: " + f);
    const v = [...new Set((Array.isArray(body[f]) ? body[f] : []).map(String))].filter(valid).slice(0, max);
    if (JSON.stringify(v) !== JSON.stringify(arr(cur[f]))) {
      next[f] = JSON.stringify(v); meta[f] = { by: user.name, at: now }; logs.push(`${f}:${v.join(",") || "none"}`);
    }
  };
  listField("departments", (d) => DEPTS.has(d), 4);
  listField("divisions", (d) => DIV_RE.test(d), 12);
  listField("designations", (d) => DESIGNATIONS.has(d), 6);
  listField("assignees", (a) => NAME_RE.test(a) && peopleAll.includes(a), 10);
  if ("priority" in body) {
    if (!canEdit(user, "priority")) throw new Error("not allowed: priority");
    const v = body.priority === null || body.priority === "" || body.priority === "none" ? null : String(body.priority);
    if (v !== null && !PRIORITIES.has(v)) throw new Error("bad priority");
    if (v !== (cur.priority || null)) { next.priority = v; meta.priority = { by: user.name, at: now }; logs.push(`priority:${v || "none"}`); }
  }
  if ("position" in body) {
    if (!canEdit(user, "position")) throw new Error("not allowed: position");
    const v = body.position === null || body.position === "" || body.position === "none" ? null : String(body.position);
    if (v !== null && !POSITIONS.has(v)) throw new Error("bad position");
    if (v !== (cur.position || null)) { next.position = v; meta.position = { by: user.name, at: now }; logs.push(`position:${v || "none"}`); }
  }
  if ("agAction" in body) {
    if (!canEdit(user, "agAction")) throw new Error("not allowed: the AG office action");
    const v = String(body.agAction || "").slice(0, 3000);
    if (v !== (cur.ag_action || "")) { next.ag_action = v; meta.agAction = { by: user.name, at: now }; logs.push(v ? "agAction:edited" : "agAction:cleared"); }
  }
  if ("note" in body) {
    if (!canEdit(user, "note")) throw new Error("not allowed: note");
    const v = String(body.note || "").slice(0, 5000);
    if (v !== (cur.note || "")) { next.note = v; meta.note = { by: user.name, at: now }; logs.push(v ? "note:edited" : "note:cleared"); }
  }
  // limited accounts may only change bills they can see, or add one of their departments to a bill
  if (!inScope(user, cur, key)) {
    const before = arr(cur.departments), after = arr(next.departments);
    const onlyAdding = logs.every((l) => l.startsWith("departments:")) && before.every((d) => after.includes(d)) && inScope(user, next, key);
    if (!onlyAdding) throw new Error("not allowed: this bill");
  }
  if (!logs.length) return { changed: false, row: rowOut(user, cur) };
  next.meta = JSON.stringify(meta);
  const stmts = [db.prepare(`INSERT INTO bills (key, departments, divisions, designations, priority, note, assignees, meta, position, ag_action)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET departments=excluded.departments, divisions=excluded.divisions, designations=excluded.designations,
        priority=excluded.priority, note=excluded.note, assignees=excluded.assignees, meta=excluded.meta, position=excluded.position, ag_action=excluded.ag_action`)
    .bind(key, next.departments ?? null, next.divisions ?? null, next.designations ?? null, next.priority ?? null, next.note ?? null, next.assignees ?? null, next.meta,
      next.position ?? null, next.ag_action ?? null)];
  for (const what of logs) stmts.push(db.prepare("INSERT INTO log (at, by, key, what) VALUES (?, ?, ?, ?)").bind(now, user.name, key, what.slice(0, 300)));
  await db.batch(stmts);
  return { changed: true, row: rowOut(user, next) };
}

// ---------------------------------------------------------------- email
const EMAIL_RE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$/;
const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
function cleanOpts(o, signedIn) {
  o = o && typeof o === "object" ? o : {};
  const time = (t, d) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : d);
  const days = (Array.isArray(o.days) ? o.days : [1, 2, 3, 4, 5]).map(Number).filter((d) => d >= 0 && d <= 6);
  const scopes = signedIn ? ["all", "list", "mine", "office"] : ["all", "list"];
  return {
    daily: o.daily !== false, time: time(o.time, "07:00"), days: [...new Set(days)].sort(),
    wrap: !!o.wrap, wrapTime: time(o.wrapTime, "18:00"),
    eve: !!o.eve, eveTime: time(o.eveTime, "16:00"),
    files: !!o.files, fiscal: o.fiscal !== false,
    scope: scopes.includes(o.scope) ? o.scope : "all",
    bills: (Array.isArray(o.bills) ? o.bills : []).map((b) => String(b).toUpperCase().replace(/[^A-Z0-9]/g, "")).filter((b) => /^[A-Z]{2,4}\d{1,4}$/.test(b)).slice(0, 200),
    words: (Array.isArray(o.words) ? o.words : []).map((w) => String(w).trim().slice(0, 60)).filter(Boolean).slice(0, 50),
  };
}
async function sendMail(env, msgs) {
  const from = env.MAIL_FROM || env.EMAIL_FROM;
  if (!env.RESEND_API_KEY || !from) throw new Error("Email isn't set up yet (RESEND_API_KEY and MAIL_FROM)");
  const batch = msgs.map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers || {} }));
  const r = await fetch(msgs.length === 1 ? "https://api.resend.com/emails" : "https://api.resend.com/emails/batch", {
    method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(msgs.length === 1 ? batch[0] : batch),
  });
  if (!r.ok) throw new Error("Resend " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.json();
}
function confirmEmail(origin, token, changing) {
  const link = `${origin}/api/confirm?t=${token}`;
  const what = changing ? "change your Deseret Docket email settings" : "get Deseret Docket emails about Utah bills and hearings";
  return {
    subject: changing ? "Confirm your Deseret Docket email settings" : "Confirm your Deseret Docket emails",
    text: `Someone (hopefully you) asked to ${what} at this address.\n\nConfirm: ${link}\n\nIf this wasn't you, ignore this email and nothing will be sent.`,
    html: `<div style="font:16px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#1d1d1b;max-width:560px"><p>Someone (hopefully you) asked to ${what} at this address.</p>
      <p><a href="${link}" style="display:inline-block;background:#1d1d1b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Confirm</a></p>
      <p style="color:#6b6b66;font-size:14px">If this wasn't you, ignore this email and nothing will be sent.</p></div>`,
  };
}

// ---------------------------------------------------------------- handler
export async function onRequest(context) {
  const { request, env, data } = context;
  const user = data && data.user;
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const method = request.method;

  if (!env.DB) return bad("The database isn't set up yet: bind a D1 database named DB to this Pages project.", 503);
  const db = env.DB;
  await ensureSchema(db);

  // Links clicked in emails
  if (method === "GET" && route === "confirm") {
    const t = url.searchParams.get("t") || "";
    const s = /^[0-9a-f]{40}$/.test(t) ? await db.prepare("SELECT * FROM email_subs WHERE token = ?").bind(t).first() : null;
    if (!s) return Response.redirect(new URL("/#email-invalid", url), 302);
    await db.prepare("UPDATE email_subs SET confirmed = 1, opts = COALESCE(pending, opts), pending = NULL WHERE id = ?").bind(s.id).run();
    return Response.redirect(new URL(`/#email-${t}`, url), 302);
  }
  if (route === "unsubscribe") {
    const t = url.searchParams.get("t") || "";
    if (/^[0-9a-f]{40}$/.test(t)) await db.prepare("DELETE FROM email_subs WHERE token = ?").bind(t).run();
    return method === "POST" ? new Response("Unsubscribed", { status: 200 }) : Response.redirect(new URL("/#email-unsubscribed", url), 302);
  }

  // Everything else that changes something must be a same-site JSON request.
  let body = {};
  if (method === "POST") {
    if (!(request.headers.get("Content-Type") || "").includes("application/json") || (request.headers.get("X-Docket") !== "1" && !route.startsWith("cron/"))) return bad("Bad request");
    try { body = await request.json(); } catch { return bad("Send JSON"); }
  }

  try {
    // ---------------- the email job
    if (route.startsWith("cron/")) {
      const key = request.headers.get("X-Cron-Key") || "";
      const want = env.CRON_KEY || env.CRON_SECRET || "";
      if (!want || key.length < 20 || key !== want) return bad("Not allowed", 403);
      if (route === "cron/subs" && method === "GET") {
        const subs = (await db.prepare("SELECT * FROM email_subs WHERE confirmed = 1").all()).results || [];
        const rows = (await db.prepare("SELECT key, departments, divisions, designations, priority, assignees FROM bills").all()).results || [];
        const out = [];
        for (const s of subs) {
          const o = cleanOpts(obj(s.opts), !!s.username);
          const rec = { id: s.id, email: s.email, token: s.token, opts: o, last: obj(s.last) };
          if (s.username && (o.scope === "mine" || o.scope === "office")) {
            const u = await findUser(env, s.username);
            if (u) {
              const names = [u.name, (u.display || "").toLowerCase()].filter(Boolean);
              rec.bills = rows.filter((r) => inScope(u, r, r.key) && (o.scope === "mine"
                ? arr(r.assignees).some((a) => names.includes(String(a).toLowerCase()))
                : arr(r.departments).length || arr(r.divisions).length || arr(r.designations).length || (r.priority && r.priority !== "notrelevant"))).map((r) => r.key);
            } else rec.bills = [];
          }
          out.push(rec);
        }
        return json({ subs: out });
      }
      if (route === "cron/send" && method === "POST") {
        const emails = (Array.isArray(body.emails) ? body.emails : []).slice(0, 100);
        const quiet = (Array.isArray(body.marks) ? body.marks : []).slice(0, 2000); // checked, nothing to send
        const subs = new Map(((await db.prepare("SELECT id, email, token, last FROM email_subs WHERE confirmed = 1").all()).results || []).map((s) => [s.id, s]));
        const msgs = [], marks = [];
        for (const e of emails) {
          const s = subs.get(e.id);
          if (!s || typeof e.subject !== "string" || typeof e.html !== "string") continue;
          const unsub = `${url.origin}/api/unsubscribe?t=${s.token}`;
          msgs.push({ to: s.email, subject: e.subject.slice(0, 200), html: e.html.replace(/\{\{UNSUB\}\}/g, unsub).replace(/\{\{MANAGE\}\}/g, `${url.origin}/#email-${s.token}`),
            text: String(e.text || "").replace(/\{\{UNSUB\}\}/g, unsub).replace(/\{\{MANAGE\}\}/g, `${url.origin}/#email-${s.token}`),
            headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
          marks.push([s, e.type, e.stamp]);
        }
        for (const q of quiet) { const s = subs.get(q.id); if (s && /^[a-z]{2,8}$/.test(q.type || "")) marks.push([s, q.type, q.stamp]); }
        if (msgs.length) await sendMail(env, msgs);
        const stmts = [];
        for (const [s, type, stamp] of marks) {
          const last = obj(s.last); last[type] = String(stamp || new Date().toISOString()); s.last = JSON.stringify(last);
          stmts.push(db.prepare("UPDATE email_subs SET last = ? WHERE id = ?").bind(s.last, s.id));
        }
        if (stmts.length) await db.batch(stmts);
        return json({ sent: msgs.length });
      }
      return bad("Not found", 404);
    }

    // ---------------- email sign-up (guests too)
    if (route === "subscribe" && method === "POST") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return bad("That doesn't look like an email address.");
      const opts = cleanOpts(body.opts, !!user);
      const now = new Date();
      const cur = await db.prepare("SELECT * FROM email_subs WHERE email = ?").bind(email).first();
      if (cur && cur.confirm_sent_at && now - new Date(cur.confirm_sent_at) < 5 * 60e3) return json({ ok: true, wait: true });
      const token = cur ? cur.token : rand(20);
      if (cur) {
        await db.prepare("UPDATE email_subs SET pending = ?, confirm_sent_at = ?, username = COALESCE(?, username) WHERE id = ?")
          .bind(JSON.stringify(opts), now.toISOString(), user ? user.name : null, cur.id).run();
      } else {
        await db.prepare("INSERT INTO email_subs (id, email, token, confirmed, username, opts, pending, created_at, confirm_sent_at, last) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, '{}')")
          .bind(rand(8), email, token, user ? user.name : null, JSON.stringify(opts), JSON.stringify(opts), now.toISOString(), now.toISOString()).run();
      }
      const m = confirmEmail(url.origin, token, !!(cur && cur.confirmed));
      await sendMail(env, [{ to: email, ...m }]);
      return json({ ok: true });
    }
    if (route === "sub") {
      const t = (method === "GET" ? url.searchParams.get("t") : body.t) || "";
      const s = /^[0-9a-f]{40}$/.test(t) ? await db.prepare("SELECT * FROM email_subs WHERE token = ?").bind(t).first() : null;
      if (!s) return bad("That email link has expired or was already used to unsubscribe.", 404);
      if (method === "GET") return json({ email: s.email, confirmed: !!s.confirmed, opts: cleanOpts(obj(s.opts), !!s.username), linked: !!s.username });
      if (body.action === "delete") { await db.prepare("DELETE FROM email_subs WHERE id = ?").bind(s.id).run(); return json({ ok: true, deleted: true }); }
      const opts = cleanOpts(body.opts, !!s.username);
      await db.prepare("UPDATE email_subs SET opts = ?, confirmed = 1, pending = NULL WHERE id = ?").bind(JSON.stringify(opts), s.id).run();
      return json({ ok: true, opts });
    }

    // ---------------- everything below needs a signed-in account
    if (route === "me" && method === "GET") {
      if (!user) return json({ user: null });
      return json({ user: user.name, display: user.display || "", role: user.role, perms: user.perms, source: user.source, people: (await allPeople(env, db)).all });
    }
    if (!user) return bad("Sign in required", 401);

    if (route === "state" && method === "GET") {
      return json({ me: user.name, role: user.role, perms: user.perms, people: (await allPeople(env, db)).all, ...(await readState(db, user)) });
    }
    if (route === "bill" && method === "POST") {
      const r = await setBill(db, user, body, (await allPeople(env, db)).all);
      return json({ ok: true, ...r });
    }
    if (route === "watch" && method === "POST") {
      if (user.role !== "admin" && !user.perms.watch) return bad("Your account can't change the watch list.", 403);
      const w = cleanWatch(body);
      const now = new Date().toISOString();
      await db.batch([
        db.prepare("INSERT INTO settings (k, v, by, at) VALUES ('watch', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, by=excluded.by, at=excluded.at").bind(JSON.stringify(w), user.name, now),
        db.prepare("INSERT INTO log (at, by, key, what) VALUES (?, ?, '*', 'watchlist:edited')").bind(now, user.name),
      ]);
      return json({ ok: true, watch: { ...w, by: user.name, at: now } });
    }
    if (route === "log" && method === "GET") {
      const key = url.searchParams.get("key") || "";
      if (!KEY_RE.test(key)) return bad("bad key");
      const row = await db.prepare("SELECT * FROM bills WHERE key = ?").bind(key).first();
      if (!inScope(user, row, key)) return json({ log: [] });
      let rows = (await db.prepare("SELECT at, by, what FROM log WHERE key = ? ORDER BY id DESC LIMIT 50").bind(key).all()).results || [];
      if (user.role !== "admin" && !user.perms.seePriority) rows = rows.filter((r) => !/^(priority|flag):/.test(r.what));
      if (user.role !== "admin" && !user.perms.seeNotes) rows = rows.filter((r) => !/^note:/.test(r.what));
      return json({ log: rows });
    }
    if (route === "prefs" && method === "POST") {
      const cols = (Array.isArray(body.cols) ? body.cols : []).filter((c) => typeof c === "string" && /^[a-zA-Z0-9]{1,20}$/.test(c)).slice(0, 40);
      const hidden = (Array.isArray(body.hidden) ? body.hidden : []).filter((c) => typeof c === "string" && /^[a-zA-Z0-9]{1,20}$/.test(c)).slice(0, 40);
      await db.prepare("INSERT INTO prefs (username, v) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET v=excluded.v").bind(user.name, JSON.stringify({ cols, hidden })).run();
      return json({ ok: true });
    }
    if (route === "password" && method === "POST") {
      if (user.source !== "db") return bad("Your password is set in Cloudflare (DOCKET_USERS). Make a new line with make_password.py to change it.");
      const u = await findUser(env, user.name);
      if (!(await checkPassword(u, String(body.old || "")))) return bad("Your current password isn't right.");
      const pw = String(body.new || "");
      if (pw.length < 10) return bad("Use at least 10 characters.");
      await db.prepare("UPDATE users SET pass = ?, ver = ver + 1 WHERE username = ?").bind(await hashPassword(pw), user.name).run();
      return json({ ok: true, signedOut: true });
    }

    // ---------------- admins
    if (route === "users" || route === "people") {
      if (user.role !== "admin") return bad("Only an admin can do that.", 403);
      if (route === "people" && method === "POST") {
        const names = [...new Set((Array.isArray(body.names) ? body.names : []).map((n) => String(n).trim()).filter((n) => NAME_RE.test(n)))].slice(0, 300);
        await db.prepare("INSERT INTO settings (k, v, by, at) VALUES ('people', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, by=excluded.by, at=excluded.at")
          .bind(JSON.stringify(names), user.name, new Date().toISOString()).run();
        return json({ ok: true, people: await allPeople(env, db) });
      }
      if (method === "GET") {
        const rows = (await db.prepare("SELECT username, name, email, role, perms, disabled, created_at, created_by FROM users ORDER BY username").all()).results || [];
        return json({
          admins: [...parseEnvAdmins(env).keys()],
          users: rows.map((r) => ({ ...r, perms: cleanPerms(obj(r.perms)), disabled: !!r.disabled })),
          people: await allPeople(env, db),
        });
      }
      if (method === "POST") {
        const username = String(body.username || "").trim().toLowerCase();
        if (!/^[a-z0-9._-]{2,40}$/.test(username)) return bad("Usernames are 2-40 letters, numbers, dots, dashes or underscores.");
        if (parseEnvAdmins(env).has(username)) return bad("That account is set in Cloudflare (DOCKET_USERS) and can't be changed here.");
        const cur = await db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
        if (body.action === "save") {
          const role = body.role === "admin" ? "admin" : "member";
          const perms = JSON.stringify(cleanPerms(body.perms || DEFAULT_PERMS));
          const name = String(body.name || "").slice(0, 80), email = String(body.email || "").slice(0, 120);
          const pw = body.password ? String(body.password) : "";
          if (pw && pw.length < 10) return bad("Passwords need at least 10 characters.");
          if (!cur) {
            if (!pw) return bad("Give the new account a starting password.");
            await db.prepare("INSERT INTO users (username, pass, role, perms, name, email, ver, disabled, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)")
              .bind(username, await hashPassword(pw), role, perms, name, email, new Date().toISOString(), user.name).run();
          } else if (pw) {
            await db.prepare("UPDATE users SET pass = ?, role = ?, perms = ?, name = ?, email = ?, ver = ver + 1 WHERE username = ?").bind(await hashPassword(pw), role, perms, name, email, username).run();
          } else {
            await db.prepare("UPDATE users SET role = ?, perms = ?, name = ?, email = ? WHERE username = ?").bind(role, perms, name, email, username).run();
          }
          return json({ ok: true });
        }
        if (!cur) return bad("No account with that username.", 404);
        if (body.action === "disable" || body.action === "enable") {
          await db.prepare("UPDATE users SET disabled = ?, ver = ver + 1 WHERE username = ?").bind(body.action === "disable" ? 1 : 0, username).run();
          return json({ ok: true });
        }
        if (body.action === "delete") {
          await db.prepare("DELETE FROM users WHERE username = ?").bind(username).run();
          return json({ ok: true });
        }
        return bad("Unknown action");
      }
    }
    return bad("Not found", 404);
  } catch (e) {
    const m = String(e.message || e);
    if (m.startsWith("bad ") || m.startsWith("not allowed")) return bad(m.replace("not allowed: ", "Your account can't change ").replace(/^bad /, "Bad "), m.startsWith("not allowed") ? 403 : 400);
    if (m.startsWith("Email isn't set up") || m.startsWith("Resend")) return bad(m, 503);
    return bad("Something went wrong saving that", 500);
  }
}
