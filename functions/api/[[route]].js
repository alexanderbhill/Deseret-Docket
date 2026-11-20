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
import { ensureFiscal, flushQueue, sendReminders, fiscalTick, contactsFor, threshold, logFn, rand as frand, settleCard, mailReady } from "../../lib/fiscal.js";
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
  for (const col of ["departments", "divisions", "designations", "priority", "assignees", "meta", "position", "ag_action", "cpos"]) {
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
    assignees: arr(r.assignees), position: r.position || null, agAction: r.ag_action || "", cpos: obj(r.cpos), meta: {},
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
    const has = arr(r.departments).length || arr(r.divisions).length || arr(r.designations).length || r.priority || r.note || arr(r.assignees).length || r.position || r.ag_action || Object.keys(obj(r.cpos)).length;
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
  // Outside committees' positions on the bill: { ULELC: "oppose" | "tagged" | null, ... }
  if ("cpos" in body) {
    if (!canEdit(user, "designations")) throw new Error("not allowed: committee positions");
    const curC = obj(cur.cpos), nextC = { ...curC };
    for (const [c, v] of Object.entries(body.cpos && typeof body.cpos === "object" ? body.cpos : {})) {
      if (!DESIGNATIONS.has(c)) continue;
      if (v === null || v === "" || v === "none") { delete nextC[c]; continue; }
      const val = String(v);
      if (val !== "tagged" && !POSITIONS.has(val)) throw new Error("bad committee position");
      if (!curC[c] || curC[c].pos !== val) nextC[c] = { pos: val, by: user.name, at: now, src: "manual" };
    }
    if (JSON.stringify(nextC) !== JSON.stringify(curC)) {
      next.cpos = JSON.stringify(nextC);
      next.designations = JSON.stringify(Object.keys(nextC));
      meta.designations = { by: user.name, at: now };
      logs.push(`cpos:${Object.entries(nextC).map(([c, x]) => c + "=" + x.pos).join(",") || "none"}`);
    }
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
  const stmts = [db.prepare(`INSERT INTO bills (key, departments, divisions, designations, priority, note, assignees, meta, position, ag_action, cpos)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET departments=excluded.departments, divisions=excluded.divisions, designations=excluded.designations,
        priority=excluded.priority, note=excluded.note, assignees=excluded.assignees, meta=excluded.meta, position=excluded.position, ag_action=excluded.ag_action, cpos=excluded.cpos`)
    .bind(key, next.departments ?? null, next.divisions ?? null, next.designations ?? null, next.priority ?? null, next.note ?? null, next.assignees ?? null, next.meta,
      next.position ?? null, next.ag_action ?? null, next.cpos ?? null)];
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
    // navigator.sendBeacon can't add headers, so the "send my queue" call on leaving the page checks the Origin instead.
    const beacon = route === "fn/flush" && request.headers.get("Origin") === url.origin;
    if (!(request.headers.get("Content-Type") || "").includes("application/json") || (request.headers.get("X-Docket") !== "1" && !route.startsWith("cron/") && !beacon)) return bad("Bad request");
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
      // Media availability recordings waiting to be analyzed (an admin pasted the link)
      if (route === "cron/media-queue" && method === "GET") {
        const s = await db.prepare("SELECT v FROM settings WHERE k = 'media_queue'").first();
        return json({ queue: s ? arr(s.v) : [] });
      }
      if (route === "cron/media-done" && method === "POST") {
        const s = await db.prepare("SELECT v FROM settings WHERE k = 'media_queue'").first();
        const q = (s ? arr(s.v) : []).map((x) => (x.url === body.url ? { ...x, status: body.ok ? "done" : "failed", note: String(body.note || "").slice(0, 300) } : x));
        await db.prepare("INSERT INTO settings (k, v, by, at) VALUES ('media_queue', ?, 'job', ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, at=excluded.at").bind(JSON.stringify(q.slice(-40)), new Date().toISOString()).run();
        return json({ ok: true });
      }
      if (route === "cron/fn-tick" && method === "POST") {
        return json(await fiscalTick(env, db, url.origin));
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
      const pr = await db.prepare("SELECT v FROM prefs WHERE username = ?").bind(user.name).first();
      return json({ user: user.name, display: user.display || "", role: user.role, perms: user.perms, source: user.source, section: user.section || "", people: (await allPeople(env, db)).all, prefs: pr ? obj(pr.v) : {} });
    }
    if (!user) return bad("Sign in required", 401);

    if (route === "state" && method === "GET") {
      return json({ me: user.name, role: user.role, perms: user.perms, people: (await allPeople(env, db)).all, ...(await readState(db, user)) });
    }
    if (route === "bill" && method === "POST") {
      const r = await setBill(db, user, body, (await allPeople(env, db)).all);
      return json({ ok: true, ...r });
    }
    // ---------------- session wrap-up: implementation tracker and personal season stats
    if (route === "impl") {
      await db.prepare(`CREATE TABLE IF NOT EXISTS impl (id TEXT PRIMARY KEY, key TEXT, item TEXT, division TEXT, due TEXT, status TEXT, notes TEXT,
        by TEXT, at TEXT, r30 INTEGER DEFAULT 0, r7 INTEGER DEFAULT 0)`).run();
      if (method === "GET") {
        const ses = String(url.searchParams.get("session") || "");
        const rows = (await db.prepare("SELECT * FROM impl WHERE key LIKE ? ORDER BY due").bind(ses + "/%").all()).results || [];
        return json({ items: rows });
      }
      if (!canEdit(user, "agAction")) return bad("Your account can't change the implementation tracker.", 403);
      const t = new Date().toISOString();
      if (body.action === "delete") { await db.prepare("DELETE FROM impl WHERE id = ?").bind(String(body.id || "")).run(); return json({ ok: true }); }
      const items = (Array.isArray(body.items) ? body.items : [body]).slice(0, 50);
      const stmts = [];
      for (const it of items) {
        const key = String(it.key || "");
        if (!KEY_RE.test(key) || !String(it.item || "").trim()) continue;
        const id = /^[0-9a-f]{16}$/.test(String(it.id || "")) ? it.id : frand(8);
        const due = /^\d{4}-\d{2}-\d{2}$/.test(String(it.due || "")) ? it.due : null;
        const cur = await db.prepare("SELECT due FROM impl WHERE id = ?").bind(id).first();
        const reset = cur && cur.due !== due; // a new due date gets fresh reminders
        stmts.push(db.prepare(`INSERT INTO impl (id, key, item, division, due, status, notes, by, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET item=excluded.item, division=excluded.division, due=excluded.due, status=excluded.status, notes=excluded.notes, by=excluded.by, at=excluded.at${reset ? ", r30=0, r7=0" : ""}`)
          .bind(id, key, String(it.item).trim().slice(0, 500), DIV_RE.test(String(it.division || "")) ? it.division : null, due,
            ["todo", "doing", "done"].includes(it.status) ? it.status : "todo", String(it.notes || "").slice(0, 1000), user.name, t));
      }
      if (stmts.length) await db.batch(stmts);
      return json({ ok: true, saved: stmts.length });
    }
    if (route === "mystats" && method === "GET") {
      const rows = (await db.prepare("SELECT key, what, at FROM log WHERE by = ? AND key <> '*'").bind(user.name).all()).results || [];
      const pr = await db.prepare("SELECT v FROM prefs WHERE username = ?").bind(user.name).first();
      return json({ log: rows.map((r) => [r.key, r.what.split(":")[0], r.at.slice(0, 10)]), prefs: pr ? obj(pr.v) : {} });
    }
    if (route === "media/queue") {
      if (method === "GET") { const s = await db.prepare("SELECT v FROM settings WHERE k = 'media_queue'").first(); return json({ queue: s ? arr(s.v) : [] }); }
      if (user.role !== "admin") return bad("Only an admin can do that.", 403);
      const u = String(body.url || "").trim();
      if (!/^https:\/\/(www\.|m\.|web\.)?(facebook\.com|fb\.watch)\//.test(u)) return bad("Paste a Facebook video link (facebook.com/… or fb.watch/…).");
      const s = await db.prepare("SELECT v FROM settings WHERE k = 'media_queue'").first();
      const q = s ? arr(s.v) : [];
      if (!q.some((x) => x.url === u)) q.push({ url: u, label: String(body.label || "").slice(0, 80), by: user.name, at: new Date().toISOString(), status: "waiting" });
      await db.prepare("INSERT INTO settings (k, v, by, at) VALUES ('media_queue', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, by=excluded.by, at=excluded.at").bind(JSON.stringify(q.slice(-40)), user.name, new Date().toISOString()).run();
      return json({ ok: true, queue: q });
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
      const pr = await db.prepare("SELECT v FROM prefs WHERE username = ?").bind(user.name).first();
      const cur = pr ? obj(pr.v) : {};
      const next = { ...cur };
      if (Array.isArray(body.cols)) { next.cols = cols; next.hidden = hidden; next.v = Number.isInteger(body.v) ? body.v : 1; }
      if ("tourDone" in body) next.tourDone = !!body.tourDone;
      if ("fav" in body) next.fav = String(body.fav || "").slice(0, 40);
      if (body.pred && typeof body.pred === "object" && KEY_RE.test(String(body.pred.key || ""))) {
        next.pred = { ...(next.pred || {}) };
        if (["pass", "fail"].includes(body.pred.v)) next.pred[body.pred.key] = body.pred.v; else delete next.pred[body.pred.key];
      }
      await db.prepare("INSERT INTO prefs (username, v) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET v=excluded.v").bind(user.name, JSON.stringify(next)).run();
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

    // ---------------- Fiscal Hive (accounts the admin has given access)
    if (route.startsWith("fn/")) {
      if (user.role !== "admin" && !user.perms.fiscal) return bad("Your account can't open the Fiscal Hive. Ask an admin.", 403);
      await ensureFiscal(db);
      const t = new Date().toISOString();
      const touch = () => db.prepare("INSERT INTO fn_activity (username, at) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET at=excluded.at").bind(user.name, t);
      const ID_RE = /^\d{4}[A-Z0-9]{2,4}\/[A-Z]{2,4}\d{4}\/[A-Za-z0-9 .\-]{1,40}$/;
      const cleanAi = (a) => {
        a = a && typeof a === "object" ? a : {};
        return { divs: (Array.isArray(a.divs) ? a.divs : []).filter((d) => DIV_RE.test(d)).slice(0, 6), need: ["likely", "unlikely", "unsure"].includes(a.need) ? a.need : "unsure",
          why: String(a.why || "").slice(0, 600), sum: String(a.sum || "").slice(0, 1200), conf: Math.max(0, Math.min(100, Math.round(+a.conf || 0))), src: a.src === "ai" ? "ai" : "auto" };
      };
      if (route === "fn/state" && method === "GET") {
        const session = String(url.searchParams.get("session") || "");
        const cards = (await db.prepare("SELECT * FROM fn_cards WHERE session = ?").bind(session).all()).results || [];
        const reqs = cards.length ? ((await db.prepare("SELECT r.* FROM fn_requests r JOIN fn_cards c ON c.id = r.card_id WHERE c.session = ?").bind(session).all()).results || []) : [];
        const allReqs = (await db.prepare("SELECT division, status, sent_at, answered_at FROM fn_requests WHERE sent_at IS NOT NULL").all()).results || [];
        const crow = (await db.prepare("SELECT division, emails FROM fn_contacts").all()).results || [];
        const users = (await db.prepare("SELECT email, section FROM users WHERE disabled = 0 AND email <> '' AND section <> ''").all()).results || [];
        await touch().run();
        return json({
          cards: cards.map((c) => ({ ...c, ai: obj(c.ai), divisions: arr(c.divisions) })),
          requests: reqs.map((r) => ({ ...r, emails: arr(r.emails), answer: obj(r.answer), token: undefined })),
          stats: allReqs, contacts: Object.fromEntries(crow.map((r) => [r.division, arr(r.emails)])),
          sectionEmails: users.reduce((m, u) => { (m[u.section] = m[u.section] || []).push(u.email); return m; }, {}),
          threshold: await threshold(db), mailReady: mailReady(env), me: user.name,
        });
      }
      if (route === "fn/ping" && method === "POST") { await touch().run(); return json({ ok: true }); }
      if (route === "fn/route" && method === "POST") {
        const id = String(body.id || "");
        if (!ID_RE.test(id)) return bad("Bad card");
        const divs = [...new Set((Array.isArray(body.divisions) ? body.divisions : []).filter((d) => DIV_RE.test(d)))].slice(0, 8);
        if (!divs.length) return bad("Pick at least one division.");
        const ai = cleanAi(body.ai);
        const kept = ai.divs.length && ai.divs.length === divs.length && ai.divs.every((d) => divs.includes(d)) ? 1 : 0;
        const [session, num, version] = id.split("/");
        const cur = await db.prepare("SELECT * FROM fn_cards WHERE id = ?").bind(id).first();
        if (cur && !["new", "cleared", "queued"].includes(cur.status)) return bad("That bill was already sent. Use Reroute or the bell to follow up.");
        const stmts = [
          db.prepare(`INSERT INTO fn_cards (id, session, num, version, title, status, ai, divisions, kept_ai, poc, routed_at, prev, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET status='queued', ai=excluded.ai, divisions=excluded.divisions, kept_ai=excluded.kept_ai, poc=excluded.poc, routed_at=excluded.routed_at, updated_at=excluded.updated_at`)
            .bind(id, session, num, version, String(body.title || "").slice(0, 300), JSON.stringify(ai), JSON.stringify(divs), kept, user.name, t, String(body.prev || "").slice(0, 80) || null, t, t),
          db.prepare("DELETE FROM fn_requests WHERE card_id = ? AND status = 'queued'").bind(id),
        ];
        for (const d of divs) stmts.push(db.prepare("INSERT INTO fn_requests (id, card_id, division, token, status, queued_at, poc) VALUES (?, ?, ?, ?, 'queued', ?, ?)").bind(frand(8), id, d, frand(20), t, user.name));
        stmts.push(logFn(db, id, user.name, `routed to ${divs.join(", ")}${kept ? " (kept the suggestion)" : ai.divs.length ? " (changed the suggestion " + ai.divs.join(", ") + ")" : ""}`), touch());
        await db.batch(stmts);
        return json({ ok: true });
      }
      if (route === "fn/clear" && method === "POST") {
        const id = String(body.id || "");
        if (!ID_RE.test(id)) return bad("Bad card");
        const [session, num, version] = id.split("/");
        const undo = !!body.undo;
        const cur = await db.prepare("SELECT status FROM fn_cards WHERE id = ?").bind(id).first();
        if (cur && !["new", "cleared", "queued"].includes(cur.status)) return bad("That bill was already sent.");
        if (undo) await db.batch([db.prepare("DELETE FROM fn_requests WHERE card_id = ? AND status = 'queued'").bind(id), db.prepare("DELETE FROM fn_cards WHERE id = ?").bind(id), logFn(db, id, user.name, "put back in the inbox"), touch()]);
        else await db.batch([
          db.prepare(`INSERT INTO fn_cards (id, session, num, version, title, status, ai, divisions, poc, routed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'cleared', ?, '[]', ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET status='cleared', poc=excluded.poc, updated_at=excluded.updated_at`).bind(id, session, num, version, String(body.title || "").slice(0, 300), JSON.stringify(cleanAi(body.ai)), user.name, t, t, t),
          db.prepare("DELETE FROM fn_requests WHERE card_id = ? AND status = 'queued'").bind(id),
          logFn(db, id, user.name, "no fiscal note request needed"), touch()]);
        return json({ ok: true });
      }
      if (route === "fn/flush" && method === "POST") return json(await flushQueue(env, db, url.origin, user.name));
      if (route === "fn/reroute" && method === "POST") {
        const id = String(body.id || ""), div = String(body.division || "");
        if (!ID_RE.test(id) || !DIV_RE.test(div)) return bad("Pick a division.");
        const wrongs = (await db.prepare("SELECT id FROM fn_requests WHERE card_id = ? AND status IN ('wrong','nocontact')").bind(id).all()).results || [];
        const from = String(body.from || "");
        const stmts = [];
        for (const w of wrongs) if (!from || w.id === from) stmts.push(db.prepare("UPDATE fn_requests SET status = 'rerouted' WHERE id = ?").bind(w.id));
        stmts.push(db.prepare("INSERT INTO fn_requests (id, card_id, division, token, status, queued_at, poc, reroute_of) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)").bind(frand(8), id, div, frand(20), t, user.name, from || null));
        stmts.push(db.prepare("UPDATE fn_cards SET status = 'queued', updated_at = ? WHERE id = ?").bind(t, id));
        stmts.push(logFn(db, id, user.name, `rerouted to ${div}`), touch());
        await db.batch(stmts);
        return json({ ok: true });
      }
      if (route === "fn/remind" && method === "POST") {
        const id = String(body.id || "");
        if (!ID_RE.test(id)) return bad("Bad card");
        const r = await sendReminders(env, db, url.origin, { cardId: id, by: user.name });
        return json({ ok: true, ...r });
      }
      if (route === "fn/contacts" && method === "POST") {
        const EMAIL_ONE = /^[^\s@<>()",;:]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$/;
        const stmts = [];
        for (const [div, list] of Object.entries(body.contacts || {}).slice(0, 200)) {
          if (!DIV_RE.test(div)) continue;
          const emails = [...new Set((Array.isArray(list) ? list : String(list).split(/[,;\s]+/)).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_ONE.test(e)))].slice(0, 10);
          stmts.push(db.prepare("INSERT INTO fn_contacts (division, emails, by, at) VALUES (?, ?, ?, ?) ON CONFLICT(division) DO UPDATE SET emails=excluded.emails, by=excluded.by, at=excluded.at").bind(div, JSON.stringify(emails), user.name, t));
        }
        if (stmts.length) await db.batch(stmts);
        return json({ ok: true });
      }
      if (route === "fn/threshold" && method === "POST") {
        const v = Math.round(+body.amount);
        if (!Number.isFinite(v) || v < 0 || v > 1e10) return bad("Enter a dollar amount.");
        await db.prepare("INSERT INTO settings (k, v, by, at) VALUES ('fn_threshold', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, by=excluded.by, at=excluded.at").bind(String(v), user.name, t).run();
        return json({ ok: true, threshold: v });
      }
      if (route === "fn/log" && method === "GET") {
        const id = url.searchParams.get("id") || "";
        const rows = (await db.prepare("SELECT at, by, what FROM fn_log WHERE card_id = ? ORDER BY id DESC LIMIT 100").bind(id).all()).results || [];
        return json({ log: rows });
      }
      if (route === "fn/outbox" && method === "GET") {
        const rows = (await db.prepare("SELECT id, at, to_addr, subject, kind, sent, error FROM outbox ORDER BY id DESC LIMIT 100").all()).results || [];
        return json({ outbox: rows, mailReady: mailReady(env) });
      }
      if (route === "fn/outbox-one" && method === "GET") {
        const r = await db.prepare("SELECT * FROM outbox WHERE id = ?").bind(+url.searchParams.get("id") || 0).first();
        if (!r) return bad("Not found", 404);
        return json({ mail: r });
      }
      return bad("Not found", 404);
    }

    // ---------------- admins: outside committees' positions from a spreadsheet
    if (route === "cpos/import" && method === "POST") {
      if (user.role !== "admin") return bad("Only an admin can do that.", 403);
      const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 5000);
      const src = String(body.source || "upload").slice(0, 120);
      const t = new Date().toISOString();
      const byKey = {};
      for (const r of rows) {
        const key = String(r.key || ""), c = String(r.committee || ""), pos = String(r.pos || "");
        if (!KEY_RE.test(key) || !DESIGNATIONS.has(c) || !(POSITIONS.has(pos) || pos === "tagged")) continue;
        (byKey[key] = byKey[key] || {})[c] = { pos, by: user.name, at: t, src };
      }
      const keys = Object.keys(byKey);
      const stmts = [];
      for (const key of keys) {
        const cur = (await db.prepare("SELECT cpos, designations, meta FROM bills WHERE key = ?").bind(key).first()) || {};
        const merged = { ...obj(cur.cpos), ...byKey[key] };
        const desig = [...new Set([...arr(cur.designations), ...Object.keys(merged)])];
        const meta = obj(cur.meta); meta.designations = { by: user.name, at: t };
        stmts.push(db.prepare(`INSERT INTO bills (key, cpos, designations, meta) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET cpos=excluded.cpos, designations=excluded.designations, meta=excluded.meta`)
          .bind(key, JSON.stringify(merged), JSON.stringify(desig), JSON.stringify(meta)));
        stmts.push(db.prepare("INSERT INTO log (at, by, key, what) VALUES (?, ?, ?, ?)").bind(t, user.name, key, `cpos:imported from ${src}`.slice(0, 300)));
      }
      for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
      return json({ ok: true, bills: keys.length, positions: Object.values(byKey).reduce((n, o) => n + Object.keys(o).length, 0) });
    }
    if (route === "cpos/sheet" && method === "POST") {
      // A Google Sheet shared as "anyone with the link can view": read it as CSV.
      if (user.role !== "admin") return bad("Only an admin can do that.", 403);
      const m = String(body.url || "").match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
      if (!m) return bad("Paste the link to a Google Sheet (docs.google.com/spreadsheets/…).");
      const gid = (String(body.url).match(/[#&?]gid=(\d+)/) || [])[1];
      const r = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? "&gid=" + gid : ""}`, { redirect: "follow" });
      const text = await r.text();
      if (!r.ok || /^\s*<!doctype html|<html/i.test(text)) return bad("Couldn't read that sheet. In Google Sheets, choose Share → General access → Anyone with the link (Viewer), or download it as .csv or .xlsx and upload the file.");
      return json({ csv: text.slice(0, 3e6) });
    }
    if (route === "budgetreq") {
      if (method === "GET") {
        const s = await db.prepare("SELECT v, by, at FROM settings WHERE k = 'budget_request'").first();
        return json(s ? { ...obj(s.v), by: s.by, at: s.at } : { items: [] });
      }
      if (user.role !== "admin") return bad("Only an admin can do that.", 403);
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 200).map((x) => ({
        cat: String(x.cat || "").trim().slice(0, 120), req: Math.max(0, Math.round(+x.req || 0)), got: x.got === "" || x.got == null ? null : Math.max(0, Math.round(+x.got || 0)),
      })).filter((x) => x.cat);
      const v = { items, label: String(body.label || "").slice(0, 120), file: String(body.file || "").slice(0, 160) };
      await db.prepare("INSERT INTO settings (k, v, by, at) VALUES ('budget_request', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, by=excluded.by, at=excluded.at").bind(JSON.stringify(v), user.name, new Date().toISOString()).run();
      return json({ ok: true });
    }

    // ---------------- admins: account requests from the landing page
    if (route === "requests") {
      if (user.role !== "admin") return bad("Only an admin can do that.", 403);
      if (method === "GET") {
        const rows = (await db.prepare("SELECT id, first, last, email, section, username, created_at FROM account_requests WHERE status = 'pending' ORDER BY created_at").all()).results || [];
        return json({ requests: rows });
      }
      const r = await db.prepare("SELECT * FROM account_requests WHERE id = ? AND status = 'pending'").bind(String(body.id || "")).first();
      if (!r) return bad("That request was already handled.", 404);
      const now = new Date().toISOString();
      if (body.action === "deny") {
        await db.prepare("UPDATE account_requests SET status = 'denied', decided_by = ?, decided_at = ?, pass = NULL WHERE id = ?").bind(user.name, now, r.id).run();
        return json({ ok: true });
      }
      if (body.action === "approve") {
        if (parseEnvAdmins(env).has(r.username) || await db.prepare("SELECT 1 FROM users WHERE username = ?").bind(r.username).first()) return bad("Someone already has that username.");
        const role = body.role === "admin" ? "admin" : "member";
        const perms = JSON.stringify(cleanPerms(body.perms || DEFAULT_PERMS));
        await db.batch([
          db.prepare("INSERT INTO users (username, pass, role, perms, name, email, ver, disabled, created_at, created_by, first, last, section) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?)")
            .bind(r.username, r.pass, role, perms, `${r.first} ${r.last}`.trim(), r.email, now, user.name, r.first, r.last, r.section),
          db.prepare("UPDATE account_requests SET status = 'approved', decided_by = ?, decided_at = ?, pass = NULL WHERE id = ?").bind(user.name, now, r.id),
        ]);
        return json({ ok: true });
      }
      return bad("Unknown action");
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
        const rows = (await db.prepare("SELECT username, name, email, role, perms, disabled, created_at, created_by, section FROM users ORDER BY username").all()).results || [];
        const pending = (await db.prepare("SELECT COUNT(*) AS n FROM account_requests WHERE status = 'pending'").first() || {}).n || 0;
        return json({
          admins: [...parseEnvAdmins(env).keys()],
          users: rows.map((r) => ({ ...r, perms: cleanPerms(obj(r.perms)), disabled: !!r.disabled })),
          people: await allPeople(env, db),
          pending,
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
          const section = String(body.section || "").slice(0, 60);
          const pw = body.password ? String(body.password) : "";
          if (pw && pw.length < 10) return bad("Passwords need at least 10 characters.");
          if (!cur) {
            if (!pw) return bad("Give the new account a starting password.");
            await db.prepare("INSERT INTO users (username, pass, role, perms, name, email, ver, disabled, created_at, created_by, section) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)")
              .bind(username, await hashPassword(pw), role, perms, name, email, new Date().toISOString(), user.name, section).run();
          } else if (pw) {
            await db.prepare("UPDATE users SET pass = ?, role = ?, perms = ?, name = ?, email = ?, section = ?, ver = ver + 1 WHERE username = ?").bind(await hashPassword(pw), role, perms, name, email, section, username).run();
          } else {
            await db.prepare("UPDATE users SET role = ?, perms = ?, name = ?, email = ?, section = ? WHERE username = ?").bind(role, perms, name, email, section, username).run();
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
