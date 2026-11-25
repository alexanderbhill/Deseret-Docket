// The office's activity log: one short line for each thing that happened in Outreach and Interim, written
// automatically. Nobody types these: saving a meeting, moving a wish list idea, sending a draft to the
// divisions, a division answering from its email, all add a line here.
//
// Each line: who, when, what (one sentence, no detail), the legislators and bills it touched, and where it
// came from (src). Today everything comes from the site or from division emails. When Outlook is connected,
// a sync job posts calendar meetings and emails to /api/cron/activity with src "outlook-cal" or "outlook-mail"
// and the message or event id in ext, so the same email is never logged twice.
const KEY_RE = /^\d{4}[A-Z0-9]{2,4}\/[A-Z0-9-]{2,24}$/;
const LEG_RE = /^[A-Z0-9]{2,12}$/;
export const SOURCES = ["site", "email", "auto", "outlook-mail", "outlook-cal"];
let ready = false;

export async function ensureActivity(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, by TEXT, src TEXT, kind TEXT, item TEXT,
      title TEXT, what TEXT, legs TEXT, bills TEXT, ext TEXT)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS activity_at ON activity (at)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS activity_item ON activity (item)`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS activity_ext ON activity (ext) WHERE ext IS NOT NULL`),
  ]);
  ready = true;
}

const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const legsOf = (a) => [...new Set((Array.isArray(a) ? a : []).map(String).filter((x) => LEG_RE.test(x)))].slice(0, 20);
const billsOf = (a) => [...new Set((Array.isArray(a) ? a : []).map(String).filter((x) => KEY_RE.test(x)))].slice(0, 20);

// rows: [{ by, what, kind?, item?, title?, legs?, bills?, src?, ext?, at? }]
export async function logActivity(db, rows) {
  rows = (rows || []).filter((r) => r && r.what);
  if (!rows.length) return 0;
  try {
    await ensureActivity(db);
    const t = new Date().toISOString();
    const res = await db.batch(rows.map((r) => db.prepare(`INSERT OR IGNORE INTO activity (at, by, src, kind, item, title, what, legs, bills, ext) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(/^\d{4}-\d{2}-\d{2}T/.test(String(r.at || "")) ? String(r.at) : t, clip(r.by, 80), SOURCES.includes(r.src) ? r.src : "site", clip(r.kind, 20),
        clip(r.item, 20), clip(r.title, 200), clip(r.what, 300), JSON.stringify(legsOf(r.legs)), JSON.stringify(billsOf(r.bills)), r.ext ? clip(r.ext, 200) : null)));
    return res.reduce((n, x) => n + ((x && x.meta && x.meta.changes) || 0), 0);
  } catch { return 0; } // the log never blocks the save it describes
}

export async function listActivity(db, { leg = "", bill = "", item = "", kinds = null, limit = 200, before = "" } = {}) {
  await ensureActivity(db);
  const where = [], args = [];
  if (LEG_RE.test(leg)) { where.push("legs LIKE ?"); args.push(`%"${leg}"%`); }
  if (KEY_RE.test(bill)) { where.push("bills LIKE ?"); args.push(`%"${bill}"%`); }
  if (/^[0-9a-f]{16}$/.test(item)) { where.push("item = ?"); args.push(item); }
  if (Array.isArray(kinds) && kinds.length) { where.push(`kind IN (${kinds.map(() => "?").join(",")})`); args.push(...kinds); }
  if (/^\d{4}-\d{2}-\d{2}T/.test(before)) { where.push("at < ?"); args.push(before); }
  const sql = `SELECT id, at, by, src, kind, item, title, what, legs, bills FROM activity ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY at DESC, id DESC LIMIT ?`;
  const rows = (await db.prepare(sql).bind(...args, Math.max(1, Math.min(500, limit | 0))).all()).results || [];
  const arr = (v) => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
  return rows.map((r) => ({ ...r, legs: arr(r.legs), bills: arr(r.bills) }));
}

// ---------------------------------------------------------------- describing a change in one line
const MEET_MODE = { person: "meeting", call: "call", email: "email", text: "text", event: "event", hallway: "hallway conversation" };
const STATUS = {
  ask: { open: "open", committed: "committed", done: "done", declined: "declined" },
  amend: { idea: "an idea", requested: "requested", drafted: "drafted", adopted: "adopted", dropped: "dropped" },
  interim: { watch: "watching", prepping: "preparing", presented: "presented", done: "done" },
  wish: { idea: "Idea", drafting: "Writing the language", ready: "Language ready", sent: "Sent to sponsor or drafter", filed: "Bill file opened", numbered: "Numbered bill", passed: "Passed", parked: "Parked" },
  rumor: { heard: "Heard", watching: "Watching", confirmed: "Confirmed", filed: "Bill file opened", numbered: "Numbered", dead: "Didn't happen" },
  testimony: { draft: "draft", final: "ready", given: "given" },
};
export const titleOf = (kind, d) => clip(kind === "meet" ? d.topic || "" : kind === "ask" ? d.ask : kind === "amend" ? d.change : kind === "interim" ? d.topic
  : kind === "wish" || kind === "rumor" ? d.summary : kind === "review" ? [d.label, d.title].filter(Boolean).join(" ") : kind === "testimony" ? d.hearing || "" : "", 200);
export const legsFor = (kind, d) => legsOf(kind === "meet" || kind === "review" ? d.legs : kind === "ask" ? [d.leg] : kind === "wish" || kind === "rumor" ? [d.sponsor, ...(d.legs || [])] : []);
export const billsFor = (kind, d) => billsOf(kind === "meet" ? d.bills : [d.bill]);

// What a save did, as activity lines (usually one).
export function itemActivity(kind, prev, next, by, id) {
  const base = { by, kind, item: id, title: titleOf(kind, next), legs: legsFor(kind, next), bills: billsFor(kind, next) };
  const out = [];
  const st = STATUS[kind] || {};
  if (!prev) {
    const what = kind === "meet" ? `Logged a ${MEET_MODE[next.mode] || "meeting"}${next.topic ? ": " + next.topic : ""}`
      : kind === "ask" ? `Asked for: ${next.ask}`
      : kind === "amend" ? `Requested an amendment${next.lines ? " (" + next.lines + ")" : ""}`
      : kind === "interim" ? `Started tracking an interim study item: ${next.topic}`
      : kind === "wish" ? `Added a wish list idea: ${next.summary}`
      : kind === "rumor" ? `Heard about a possible bill: ${next.summary}`
      : kind === "testimony" ? "Started testimony"
      : kind === "review" ? `Logged a draft for review${next.from ? " from " + next.from : ""}` : "";
    if (what) out.push({ ...base, what });
    return out;
  }
  if (next.status && prev.status !== next.status && st[next.status]) {
    out.push({ ...base, what: kind === "wish" || kind === "rumor" ? `Moved to “${st[next.status]}”` : kind === "testimony" ? `Testimony is ${st[next.status]}` : `Marked ${st[next.status]}` });
  }
  if (next.bill && prev.bill !== next.bill && ["wish", "rumor", "ask", "amend"].includes(kind)) out.push({ ...base, what: "Linked to a bill" });
  if (kind === "meet" && next.done && !prev.done) out.push({ ...base, what: "Finished the follow-up" });
  if (kind === "meet" && next.followup && next.followup !== prev.followup && !next.done) out.push({ ...base, what: `Set a follow-up for ${next.followup}` });
  if ((kind === "wish") && (next.language || "") !== (prev.language || "") && next.language) out.push({ ...base, what: "Updated the language" });
  if (["ask", "amend", "interim", "review", "rumor"].includes(kind) && next.owner !== undefined && (next.owner || "") !== (prev.owner || "") && next.owner) out.push({ ...base, what: "Changed the point of contact" });
  if (["wish", "rumor"].includes(kind) && (next.poc || "") !== (prev.poc || "") && next.poc) out.push({ ...base, what: "Changed the point of contact" });
  return out;
}
