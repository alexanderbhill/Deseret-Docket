// Deseret Docket team list API (Cloudflare Pages Functions + D1).
// Requires a D1 database bound to the Pages project as "DB".
// Every request has already passed the sign-in middleware, which puts the username in context.data.user.
//
//   GET  /api/state           everything the team has set: divisions, flags, notes, watch list
//   POST /api/bill            { key, division?, flag?, note? }   (null clears a value)
//   POST /api/watch           { terms, codes, opts }
//   GET  /api/log?key=…       recent team activity for one bill
//   POST /api/import          { bills: {key:{division,flag,note}}, watch? }  fills only what's empty

const DIVISIONS = new Set(["criminal", "civil", "pp", "appellate"]);
const FLAGS = new Set(["high", "priority", "watching", "notrelevant"]);
const KEY_RE = /^\d{4}[A-Z0-9]{2,4}\/[A-Z0-9-]{2,16}$/;
let ready = false;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const bad = (msg, status = 400) => json({ error: msg }, status);

async function ensureSchema(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS bills (key TEXT PRIMARY KEY, division TEXT, flag TEXT, note TEXT,
      div_by TEXT, div_at TEXT, flag_by TEXT, flag_at TEXT, note_by TEXT, note_at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT, by TEXT, at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, by TEXT, key TEXT, what TEXT)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS log_key ON log (key, id)`),
  ]);
  ready = true;
}

function cleanWatch(w) {
  const list = (a, max) =>
    (Array.isArray(a) ? a : [])
      .filter((x) => x && typeof x.t === "string" && x.t.trim())
      .slice(0, max)
      .map((x) => ({ t: x.t.trim().replace(/\s+/g, " ").slice(0, 120), on: x.on !== false }));
  const o = w && typeof w.opts === "object" ? w.opts : {};
  return {
    terms: list(w && w.terms, 200),
    codes: list(w && w.codes, 200).filter((x) => /^\d+[A-Za-z]?(-\d+[A-Za-z]?(-\d+(\.\d+)?)?)?$/.test(x.t)),
    opts: { struck: o.struck !== false, defsOnly: !!o.defsOnly, titlesOnly: !!o.titlesOnly },
  };
}

async function readState(db) {
  const rows = (await db.prepare("SELECT * FROM bills").all()).results || [];
  const bills = {};
  for (const r of rows) {
    if (!r.division && !r.flag && !r.note) continue;
    bills[r.key] = {
      division: r.division || null, flag: r.flag || null, note: r.note || "",
      divBy: r.div_by, divAt: r.div_at, flagBy: r.flag_by, flagAt: r.flag_at, noteBy: r.note_by, noteAt: r.note_at,
    };
  }
  const w = await db.prepare("SELECT v, by, at FROM settings WHERE k = 'watch'").first();
  const watch = w ? { ...cleanWatch(JSON.parse(w.v)), by: w.by, at: w.at } : null;
  return { bills, watch };
}

async function setBill(db, user, body, onlyIfEmpty = false) {
  const key = String(body.key || "");
  if (!KEY_RE.test(key)) throw new Error("bad key");
  const now = new Date().toISOString();
  const cur = (await db.prepare("SELECT * FROM bills WHERE key = ?").bind(key).first()) || { key };
  const stmts = [];
  const logs = [];
  const next = { ...cur };
  if ("division" in body) {
    const d = body.division === null || body.division === "" ? null : String(body.division);
    if (d !== null && !DIVISIONS.has(d)) throw new Error("bad division");
    if (!(onlyIfEmpty && cur.division) && d !== (cur.division || null)) {
      next.division = d; next.div_by = user; next.div_at = now;
      logs.push(d ? `division:${d}` : "division:none");
    }
  }
  if ("flag" in body) {
    const f = body.flag === null || body.flag === "" || body.flag === "none" ? null : String(body.flag);
    if (f !== null && !FLAGS.has(f)) throw new Error("bad flag");
    if (!(onlyIfEmpty && cur.flag) && f !== (cur.flag || null)) {
      next.flag = f; next.flag_by = user; next.flag_at = now;
      logs.push(f ? `flag:${f}` : "flag:none");
    }
  }
  if ("note" in body) {
    const n = String(body.note || "").slice(0, 5000);
    if (!(onlyIfEmpty && cur.note) && n !== (cur.note || "")) {
      next.note = n; next.note_by = user; next.note_at = now;
      logs.push(n ? "note:edited" : "note:cleared");
    }
  }
  if (!logs.length) return { changed: false };
  stmts.push(
    db.prepare(`INSERT INTO bills (key, division, flag, note, div_by, div_at, flag_by, flag_at, note_by, note_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET division=excluded.division, flag=excluded.flag, note=excluded.note,
        div_by=excluded.div_by, div_at=excluded.div_at, flag_by=excluded.flag_by, flag_at=excluded.flag_at,
        note_by=excluded.note_by, note_at=excluded.note_at`)
      .bind(key, next.division ?? null, next.flag ?? null, next.note ?? null, next.div_by ?? null, next.div_at ?? null,
            next.flag_by ?? null, next.flag_at ?? null, next.note_by ?? null, next.note_at ?? null)
  );
  for (const what of logs) stmts.push(db.prepare("INSERT INTO log (at, by, key, what) VALUES (?, ?, ?, ?)").bind(now, user, key, what));
  await db.batch(stmts);
  return { changed: true };
}

export async function onRequest(context) {
  const { request, env, data } = context;
  const user = data && data.user;
  if (!user) return bad("Sign in required", 401);
  if (!env.DB) return bad("The team list isn't set up yet: bind a D1 database named DB to this Pages project.", 503);
  const db = env.DB;
  await ensureSchema(db);
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");

  if (request.method === "POST") {
    // Only same-site JSON requests (blocks form posts from other sites)
    if (!(request.headers.get("Content-Type") || "").includes("application/json") || request.headers.get("X-Docket") !== "1") {
      return bad("Bad request", 400);
    }
  }
  let body = {};
  if (request.method === "POST") {
    try { body = await request.json(); } catch { return bad("Send JSON"); }
  }

  try {
    if (route === "state" && request.method === "GET") {
      return json({ me: user, ...(await readState(db)) });
    }
    if (route === "bill" && request.method === "POST") {
      const r = await setBill(db, user, body);
      return json({ ok: true, ...r });
    }
    if (route === "watch" && request.method === "POST") {
      const w = cleanWatch(body);
      const now = new Date().toISOString();
      await db.batch([
        db.prepare("INSERT INTO settings (k, v, by, at) VALUES ('watch', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, by=excluded.by, at=excluded.at")
          .bind(JSON.stringify(w), user, now),
        db.prepare("INSERT INTO log (at, by, key, what) VALUES (?, ?, '*', 'watchlist:edited')").bind(now, user),
      ]);
      return json({ ok: true, watch: { ...w, by: user, at: now } });
    }
    if (route === "log" && request.method === "GET") {
      const key = url.searchParams.get("key") || "";
      if (!KEY_RE.test(key)) return bad("bad key");
      const rows = (await db.prepare("SELECT at, by, what FROM log WHERE key = ? ORDER BY id DESC LIMIT 50").bind(key).all()).results || [];
      return json({ log: rows });
    }
    if (route === "import" && request.method === "POST") {
      let n = 0;
      const bills = body.bills && typeof body.bills === "object" ? body.bills : {};
      for (const [key, v] of Object.entries(bills).slice(0, 2000)) {
        if (!KEY_RE.test(key) || !v) continue;
        const r = await setBill(db, user, { key, ...(v.division ? { division: v.division } : {}), ...(v.flag ? { flag: v.flag } : {}), ...(v.note ? { note: v.note } : {}) }, true);
        if (r.changed) n++;
      }
      if (body.watch) {
        const cur = await db.prepare("SELECT v FROM settings WHERE k = 'watch'").first();
        const curW = cur ? cleanWatch(JSON.parse(cur.v)) : { terms: [], codes: [] };
        if (!curW.terms.length && !curW.codes.length) {
          const w = cleanWatch(body.watch);
          await db.prepare("INSERT INTO settings (k, v, by, at) VALUES ('watch', ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, by=excluded.by, at=excluded.at")
            .bind(JSON.stringify(w), user, new Date().toISOString()).run();
        }
      }
      return json({ ok: true, imported: n, ...(await readState(db)) });
    }
    return bad("Not found", 404);
  } catch (e) {
    return bad(e.message === "bad key" || e.message.startsWith("bad ") ? e.message : "Something went wrong saving that", e.message.startsWith("bad ") ? 400 : 500);
  }
}
