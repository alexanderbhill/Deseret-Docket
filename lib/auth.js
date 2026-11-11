// Shared sign-in helpers for Deseret Docket (Cloudflare Pages Functions).
//
// Two kinds of accounts:
//   * Admins listed in the DOCKET_USERS secret (made with make_password.py). They can see and change
//     everything and manage the other accounts. Their passwords are changed in Cloudflare.
//   * Accounts an admin makes on the site's Admin page. Stored in the D1 database (table "users") with
//     the permissions the admin picks. Their passwords are changed on the site.
// Anyone who isn't signed in is a guest: they can read all public bill information, nothing else.

export const COOKIE = "docket_session";
export const USER_COOKIE = "docket_user";
const enc = new TextEncoder();
export const ITER = 100000; // Cloudflare's PBKDF2 limit

export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
export const unhex = (h) => new Uint8Array((h.match(/../g) || []).map((x) => parseInt(x, 16)));

export function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const FIELDS = ["position", "departments", "divisions", "designations", "priority", "note", "assignees", "agAction"];
export const ADMIN_PERMS = { edit: true, fields: FIELDS, seePriority: true, seeNotes: true, watch: true, scope: "all", departments: [], bills: [] };
export const DEFAULT_PERMS = { edit: true, fields: ["position", "departments", "divisions", "designations", "note", "assignees", "agAction"], seePriority: false, seeNotes: true, watch: true, scope: "all", departments: [], bills: [] };

export function cleanPerms(p) {
  p = p && typeof p === "object" ? p : {};
  const arr = (a, re, max) => (Array.isArray(a) ? a.filter((x) => typeof x === "string" && re.test(x)).slice(0, max) : []);
  return {
    edit: !!p.edit,
    fields: arr(p.fields, /^[a-zA-Z]+$/, 12).filter((f) => FIELDS.includes(f)),
    seePriority: !!p.seePriority,
    seeNotes: p.seeNotes !== false,
    watch: !!p.watch,
    scope: ["all", "departments", "bills", "assigned"].includes(p.scope) ? p.scope : "all",
    departments: arr(p.departments, /^[a-z0-9-]{1,30}$/, 20),
    bills: arr(p.bills, /^\d{4}[A-Z0-9]{2,4}\/[A-Z0-9-]{2,24}$/, 2000),
  };
}

export function parseEnvAdmins(env) {
  // Forgiving: ignores quotes, spaces and line breaks, and any extra text pasted around the login lines.
  const users = new Map();
  const flat = String(env.DOCKET_USERS || "").replace(/["'\s]+/g, "");
  const re = /([a-z0-9._-]{2,40}):pbkdf2:(\d+):([0-9a-f]{32}):([0-9a-f]{64})/gi;
  let m;
  while ((m = re.exec(flat))) users.set(m[1].toLowerCase(), { iter: +m[2], salt: m[3].toLowerCase(), hash: m[4].toLowerCase() });
  return users;
}

export async function pbkdf2(password, saltHex, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: iter }, key, 256);
  return hex(bits);
}

export async function hashPassword(password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `pbkdf2:${ITER}:${salt}:${await pbkdf2(password, salt, ITER)}`;
}

export async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

export function cookies(req) {
  const out = {};
  for (const c of (req.headers.get("Cookie") || "").split(/;\s*/)) {
    const i = c.indexOf("=");
    if (i > 0) out[c.slice(0, i)] = c.slice(i + 1);
  }
  return out;
}

let schemaReady = false;
export async function ensureUsersTable(db) {
  if (schemaReady || !db) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, pass TEXT, role TEXT, perms TEXT, name TEXT, email TEXT,
      ver INTEGER DEFAULT 1, disabled INTEGER DEFAULT 0, created_at TEXT, created_by TEXT)`),
  ]);
  schemaReady = true;
}

// Look up an account by name. Returns {name, role, perms, ver, source, pass} or null.
export async function findUser(env, username) {
  username = String(username || "").toLowerCase();
  const admins = parseEnvAdmins(env);
  if (admins.has(username)) {
    const a = admins.get(username);
    return { name: username, role: "admin", perms: ADMIN_PERMS, ver: 0, source: "env", check: a };
  }
  if (!env.DB) return null;
  await ensureUsersTable(env.DB);
  const r = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
  if (!r || r.disabled) return null;
  const [, iter, salt, hash] = String(r.pass || "").split(":");
  return {
    name: r.username, display: r.name || "", email: r.email || "", role: r.role === "admin" ? "admin" : "member",
    perms: r.role === "admin" ? ADMIN_PERMS : cleanPerms(JSON.parse(r.perms || "{}")),
    ver: r.ver || 1, source: "db", check: { iter: +iter, salt, hash },
  };
}

export async function checkPassword(user, password) {
  const c = user && user.check;
  const got = await pbkdf2(password, c && c.salt ? c.salt : "00", c && c.iter ? c.iter : ITER);
  return !!(c && c.hash && safeEqual(got, c.hash));
}

export async function makeSession(env, user, days) {
  const exp = Date.now() + days * 864e5;
  const userEnc = encodeURIComponent(user.name);
  const sig = await hmac(env.SESSION_SECRET, `${userEnc}|${exp}|${user.ver}`);
  return { value: encodeURIComponent(`${userEnc}|${exp}|${user.ver}|${sig}`), maxAge: days * 86400 };
}

export async function sessionUser(req, env) {
  if (!env.SESSION_SECRET) return null;
  const raw = cookies(req)[COOKIE];
  if (!raw) return null;
  const parts = decodeURIComponent(raw).split("|");
  let userEnc, exp, ver, sig;
  if (parts.length === 4) [userEnc, exp, ver, sig] = parts;
  else if (parts.length === 3) { [userEnc, exp, sig] = parts; ver = null; } // sessions from the old version of the site
  else return null;
  if (!userEnc || !exp || !sig || Date.now() > +exp) return null;
  const msg = ver === null ? `${userEnc}|${exp}` : `${userEnc}|${exp}|${ver}`;
  const good = await hmac(env.SESSION_SECRET, msg);
  if (!safeEqual(good, sig)) return null;
  const user = await findUser(env, decodeURIComponent(userEnc));
  if (!user) return null; // removed or disabled accounts are signed out
  if (ver === null ? user.source !== "env" : String(user.ver) !== String(ver)) return null; // password reset signs out
  return user;
}
