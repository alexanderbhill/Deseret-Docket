// Outreach: the office's relationship work during (and between) sessions.
//   meet       meetings with legislators and staff: when, who, which bills, what was said, a follow-up date
//   ask        what the office asked a legislator for, what they committed to, and when to follow up
//   testimony  committee testimony drafts (built from the bill's office information) and who's testifying
//   amend      amendment language requests tied to specific bill lines
//   interim    interim committee study items that touch the office
//   review     a draft out for the divisions' comments and back to the drafter (see review.js)
// Everything is one table (outreach) with a kind and a JSON body; fields are cleaned here.
import { sendEmail } from "./fiscal.js";
import { stripTokens, reviewTick } from "./review.js";

const KEY_RE = /^\d{4}[A-Z0-9]{2,4}\/[A-Z0-9-]{2,24}$/;
const LEG_RE = /^[A-Z0-9]{2,12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COM_RE = /^[A-Z0-9]{2,12}$/;
const DIV_RE = /^[a-z]{2}-[a-z0-9-]{2,40}$/;

const txt = (n) => (v) => String(v ?? "").trim().slice(0, n);
const date = (v) => (DATE_RE.test(String(v || "")) ? String(v) : "");
const list = (re, max) => (v) => [...new Set((Array.isArray(v) ? v : []).map(String).filter((x) => re.test(x)))].slice(0, max);
const one = (re) => (v) => (re.test(String(v || "")) ? String(v) : "");
const pick = (opts, dflt) => (v) => (opts.includes(v) ? v : dflt);
const names = (v) => [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim().slice(0, 60)).filter(Boolean))].slice(0, 12);

export const KINDS = {
  meet: { date, legs: list(LEG_RE, 20), others: txt(300), who: names, bills: list(KEY_RE, 20), topic: txt(200), notes: txt(4000), followup: date, done: (v) => !!v },
  ask: { leg: one(LEG_RE), bill: one(KEY_RE), type: pick(["amendment", "hold", "sponsor", "vote", "meeting", "other"], "other"), ask: txt(600),
    status: pick(["open", "committed", "done", "declined"], "open"), committed: txt(600), due: date, owner: txt(60), notes: txt(2000) },
  testimony: { bill: one(KEY_RE), hearing: txt(200), com: txt(160), when: txt(40), testifier: txt(80), text: txt(8000), status: pick(["draft", "final", "given"], "draft"), signup: (v) => !!v },
  amend: { bill: one(KEY_RE), lines: txt(200), change: txt(3000), why: txt(1500), from: txt(120),
    status: pick(["idea", "requested", "drafted", "adopted", "dropped"], "idea"), owner: txt(60), due: date },
  interim: { com: one(COM_RE), date, topic: txt(300), division: one(DIV_RE), owner: txt(60), notes: txt(3000), link: (v) => (/^https:\/\/[^\s"<>]{4,400}$/.test(String(v || "")) ? String(v) : ""),
    status: pick(["watch", "prepping", "presented", "done"], "watch") },
  review: { bill: one(KEY_RE), wish: one(/^[0-9a-f]{16}$/), label: txt(40), title: txt(240), version: txt(60), from: txt(120), fromRole: pick(["drafter", "sponsor", "stakeholder", "office"], "drafter"),
    fromEmail: (v) => (/^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}$/.test(String(v || "").trim()) ? String(v).trim() : ""), legs: list(LEG_RE, 6), received: date,
    link: (v) => (/^https:\/\/[^\s"<>]{4,600}$/.test(String(v || "")) ? String(v) : ""), owner: txt(60), divisions: list(DIV_RE, 30), due: date, backBy: date,
    notes: txt(3000), closed: (v) => !!v },
};

// The wish list: what the office (or a client agency, or an outside group) wants changed in a future session, and
// the language for it, from idea to a numbered bill.
KINDS.wish = { list: pick(["office", "client", "outside"], "office"), priority: (v) => !!v, todo: txt(120), team: txt(120), division: one(DIV_RE),
  summary: txt(300), details: txt(4000), next: txt(1000), poc: txt(200),
  status: pick(["idea", "drafting", "ready", "sent", "filed", "numbered", "passed", "parked"], "idea"),
  session: (v) => (/^\d{4}[A-Z0-9]{2,4}$/.test(String(v || "")) ? String(v) : ""), sponsor: one(LEG_RE), drafter: txt(120),
  drafterEmail: (v) => (/^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}$/.test(String(v || "").trim()) ? String(v).trim() : ""),
  bill: one(KEY_RE), language: txt(20000), sent: date, sentTo: txt(400) };

export async function ensureOutreach(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS outreach (id TEXT PRIMARY KEY, kind TEXT, data TEXT, by TEXT, created_at TEXT, updated_by TEXT, updated_at TEXT, reminded TEXT)`).run();
}
export function cleanItem(kind, d) {
  const spec = KINDS[kind];
  const out = {};
  for (const [f, fn] of Object.entries(spec)) out[f] = fn(d ? d[f] : undefined);
  return out;
}
export async function listOutreach(db) {
  await ensureOutreach(db);
  const rows = (await db.prepare("SELECT * FROM outreach ORDER BY updated_at DESC LIMIT 3000").all()).results || [];
  return rows.map((r) => { let d; try { d = JSON.parse(r.data || "{}"); } catch { d = {}; } if (r.kind === "review") d = stripTokens(d); return { id: r.id, kind: r.kind, ...d, by: r.by, created_at: r.created_at, updated_by: r.updated_by, updated_at: r.updated_at }; });
}

// Follow-up reminders: an open ask, an unfinished amendment, or a meeting follow-up whose date has come, emailed once
// (on or after that date) to the person it's assigned to when they have an account with an email address.
export async function outreachTick(env, db, origin) {
  await ensureOutreach(db);
  const today = new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10); // Mountain time, near enough
  const rows = (await db.prepare("SELECT * FROM outreach WHERE kind IN ('ask','amend','meet')").all()).results || [];
  const users = (await db.prepare("SELECT username, name, email FROM users WHERE disabled = 0 AND email <> ''").all()).results || [];
  const emailFor = (who) => { const w = String(who || "").toLowerCase(); const u = users.find((x) => x.username.toLowerCase() === w || (x.name || "").toLowerCase() === w); return u ? u.email : ""; };
  let n = 0;
  for (const r of rows) {
    let d; try { d = JSON.parse(r.data || "{}"); } catch { continue; }
    const due = r.kind === "meet" ? d.followup : d.due;
    const open = r.kind === "ask" ? ["open", "committed"].includes(d.status) : r.kind === "amend" ? !["adopted", "dropped"].includes(d.status) : !d.done;
    if (!due || due > today || !open || r.reminded === due) continue;
    const owner = r.kind === "meet" ? (d.who || [])[0] || r.by : d.owner || r.by;
    const to = emailFor(owner);
    if (to) {
      const what = r.kind === "ask" ? `Follow up on the ask: ${d.ask}` : r.kind === "amend" ? `Amendment ${d.lines ? "(" + d.lines + ") " : ""}is ${d.status}: ${d.change}` : `Follow up on the meeting: ${d.topic || "(no topic)"}`;
      const subj = `Deseret Docket follow-up due ${due}`;
      const link = `${origin}/#outreach-${r.kind === "meet" ? "meetings" : r.kind === "ask" ? "asks" : "amendments"}`;
      const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
      const html = `<div style="font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#333;max-width:600px"><div style="background:#002147;color:#fff;padding:12px 16px;border-bottom:4px solid #e9d8a6;border-radius:8px 8px 0 0;font-weight:600">Outreach follow-up</div><div style="border:1px solid #dbe3ea;border-top:0;padding:16px;border-radius:0 0 8px 8px"><p>${esc(what)}</p><p style="color:#5b6672;font-size:14px">Due ${esc(due)}</p><p><a href="${link}" style="color:#2e4d6d">Open it in Deseret Docket</a></p><p style="color:#8a929b;font-size:11.5px">Attorney Work Product / Attorney-Client Communication</p></div></div>`;
      try { await sendEmail(env, db, [{ to: [to], cc: [], subject: subj, html, text: `${what}\nDue ${due}\n${link}` }], "outreach"); n++; } catch { /* outbox keeps it */ }
    }
    await db.prepare("UPDATE outreach SET reminded = ? WHERE id = ?").bind(due, r.id).run();
  }
  try { n += await reviewTick(env, db, origin); } catch { /* reminders never block the rest */ }
  return n;
}
