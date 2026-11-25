// Draft review: tracking a draft from the drafter (or a sponsor's or stakeholder's request for feedback), out to
// the office's divisions for comments, and back from the point of contact (Dan or Katie) to the drafter.
//
// A review is an Outreach item (kind "review"). Its body has the fields people edit (see KINDS.review in
// outreach.js) plus fields only the server writes:
//   reqs  { [division]: { status: "waiting"|"none"|"comments", sent, reminded, comments, lang, by, at } }
//   log   [{ at, by, what }]                       the status trail, oldest first
//   sent  { at, by, to, summary, via }             when the POC sent the office's feedback back
//   prev  id of the review for the version before this one
// Whose turn it is comes from those fields (reviewTurn): "us" (the POC needs to send it out or send it back),
// "team" (a division hasn't answered), "drafter" (feedback went back; waiting on a new version), "closed".
//
// Divisions answer from a private link in their email (/review/<token>, functions/review/[[path]].js), no sign-in.
// Tokens live in review_tokens so the link only ever reaches one division's part of one review.
import { sendEmail, rand, contactsFor, unitNamer, mailReady, ensureFiscal } from "./fiscal.js";
import { personFor } from "./auth.js";
import { filesFor, attachmentsFor } from "./files.js";

export const SERVER_FIELDS = ["reqs", "log", "sent", "prev", "sender"];
export const TOKEN_DAYS = 60;
export const REMIND_DAYS = 2; // with no due date, waiting divisions get one reminder this many days after the request

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const now = () => new Date().toISOString();
const mtDay = () => new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10);
const fmtDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) : "");
const ROLE = { drafter: "drafting attorney (LRGC)", sponsor: "sponsor", stakeholder: "stakeholder" };

export function reviewTurn(d) {
  if (d.closed) return "closed";
  if (d.sent && d.sent.at) return "drafter";
  if (Object.values(d.reqs || {}).some((r) => r.status === "waiting")) return "team";
  return "us";
}
export const reviewName = (d) => [d.label, d.title].filter(Boolean).join(" ") || "a draft";

export async function ensureReview(db) {
  await ensureFiscal(db); // the outbox and the division contacts live with Fiscal Hive
  await db.prepare("CREATE TABLE IF NOT EXISTS review_tokens (token TEXT PRIMARY KEY, item_id TEXT, division TEXT, sent_at TEXT)").run();
}
export const addLog = (d, by, what) => { d.log = [...(Array.isArray(d.log) ? d.log : []), { at: now(), by: String(by || "").slice(0, 80), what: String(what).slice(0, 600) }].slice(-200); };

// Server-written fields survive an edit of the item.
export function keepServer(next, cur) { for (const f of SERVER_FIELDS) if (cur && cur[f] !== undefined) next[f] = cur[f]; return next; }
// The list sent to the browser never carries the division links.
export function stripTokens(d) {
  if (!d.reqs) return d;
  const reqs = {};
  for (const [k, r] of Object.entries(d.reqs)) { const { token, ...rest } = r || {}; reqs[k] = rest; }
  return { ...d, reqs };
}

async function userEmail(env, db, who) { return (await personFor(env, db, who)).email; }

function btn(href, label, bg, fg) {
  return `<a href="${href}" style="display:inline-block;margin:4px 6px 4px 0;padding:9px 14px;border-radius:6px;background:${bg};color:${fg};text-decoration:none;font-weight:600;font-size:14px">${label}</a>`;
}
const wrap = (head, inner) => `<div style="font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#333;max-width:640px">
  <div style="background:#002147;color:#fff;padding:14px 18px;border-bottom:4px solid #e9d8a6;border-radius:8px 8px 0 0;font-weight:600">Draft review · Deseret Docket</div>
  <div style="padding:6px 18px 18px;background:#fffdf2;border:1px solid #dbe3ea;border-top:0;border-radius:0 0 8px 8px">
  <p style="font-size:17px;color:#002147;font-weight:600">${esc(head)}</p>${inner}
  <p style="color:#8a929b;font-size:11px;letter-spacing:.03em;text-align:center">Attorney Work Product / Attorney-Client Communication</p></div></div>`;

// The email a division gets. It reads like a note from the person who sent it (their name, title, and replies
// go to them), says what the draft is and when comments are due, and has two buttons.
export function reviewEmail(origin, divName, d, token, sender, reminder) {
  const r = (a) => `${origin}/review/${token}${a ? "?a=" + a : ""}`;
  const name = reviewName(d);
  const who = sender && sender.name ? sender.name : "";
  const first = who.split(" ")[0] || "";
  const ours = d.fromRole === "office"; // the office's own proposed language, on its way to a sponsor and drafter
  const from = ours ? "" : d.from ? `${d.from}${ROLE[d.fromRole] ? ", " + ROLE[d.fromRole] : ""}` : ROLE[d.fromRole] || "";
  const due = d.due ? fmtDay(d.due) : "";
  const head = reminder ? `Reminder: ${divName}'s comments on ${name}` : d.fromRole === "office" ? `Please review our proposed language: ${name}` : `Please review: ${name}`;
  const ask = reminder
    ? `Just a reminder that ${esc(first || "the office")} still needs to hear whether ${esc(divName)} has any concerns with this draft${due ? `. Comments were due <b>${esc(due)}</b>` : ""}.`
    : ours ? `${first ? esc(first) + " is" : "The office is"} getting language ready that the AG's Office plans to propose, and would like ${esc(divName)}'s input before it goes to a sponsor and the drafting attorney. Does ${esc(divName)} have any concerns?${due ? ` Please answer by <b>${esc(due)}</b>.` : ""}`
    : `${first ? esc(first) + " is" : "The office is"} gathering the AG's Office's comments on this draft${from ? ` for ${esc(from)}` : ""}. Does ${esc(divName)} have any concerns?${due ? ` Please answer by <b>${esc(due)}</b>.` : ""}`;
  const inner = `<p>${ask}</p>
    <div style="background:#ebf4f8;border-radius:8px;padding:10px 14px;margin:8px 0">
     <div style="font-weight:700;color:#002147;font-size:16px">${esc(name)}${d.version ? ` <span style="font-weight:500;color:#5b6672">(${esc(d.version)})</span>` : ""}</div>
     ${from ? `<div style="font-size:14px;color:#5b6672">From ${esc(from)}</div>` : ""}
     ${d.link ? `<div style="font-size:14px;margin-top:4px"><a href="${esc(d.link)}" style="color:#2e4d6d">Open the draft</a></div>` : ""}</div>
    ${d.notes ? `<p style="font-size:14px"><b>What to look for:</b> ${esc(d.notes)}</p>` : ""}
    ${btn(r("none"), "No concerns", "#3c5a78", "#fff")}${btn(r("comments"), "Send comments or a redline", "#002147", "#fff")}
    <p style="font-size:14px;color:#5b6672">You can type comments and suggested language, or attach your marked-up Word or PDF file.</p>
    ${who ? `<p>Thanks,<br>${esc(who)}${sender.title ? `<br><span style="color:#5b6672">${esc(sender.title)}, Utah Attorney General's Office</span>` : ""}</p>` : ""}`;
  const text = `${head}\n\n${(reminder ? `${first || "The office"} still needs ${divName}'s answer on this draft.` : `${first || "The office"} is gathering the AG's Office's comments on this draft. Does ${divName} have any concerns?`)}${due ? " Please answer by " + due + "." : ""}\n\n${name}${d.version ? " (" + d.version + ")" : ""}${from ? "\nFrom " + from : ""}${d.link ? "\nDraft: " + d.link : ""}${d.notes ? "\nWhat to look for: " + d.notes : ""}\n\nNo concerns: ${r("none")}\nSend comments or a redline: ${r("comments")}\n\n${who ? "Thanks,\n" + who + (sender.title ? "\n" + sender.title + ", Utah Attorney General's Office" : "") + "\n\n" : ""}Attorney Work Product / Attorney-Client Communication\n`;
  return { subject: reminder ? `Reminder: ${divName}'s comments on ${name}` : ours ? `Please review our proposed language: ${name} (${divName})` : `Please review: ${name}${d.version ? " (" + d.version + ")" : ""} (${divName})`, html: wrap(head, inner), text,
    fromName: who, replyTo: sender && sender.email ? sender.email : undefined };
}

// Send the request to every listed division that hasn't been asked yet (or the ones named). Returns how it went.
export async function sendRequests(env, db, origin, id, d, by, only) {
  await ensureReview(db);
  const { name } = await unitNamer(env, db, origin);
  const divs = (only && only.length ? only : d.divisions || []).filter((v) => (d.divisions || []).includes(v));
  const todo = divs.filter((v) => !d.reqs || !d.reqs[v] || (only && only.length));
  if (!todo.length) return { sent: 0, outbox: 0, none: [] };
  const contacts = await contactsFor(db, todo);
  d.sender = await personFor(env, db, by); // who these go out from; reminders come from the same person
  d.reqs = { ...(d.reqs || {}) };
  let sent = 0, outbox = 0; const none = [];
  for (const v of todo) {
    const token = rand(20), t = now();
    await db.prepare("INSERT INTO review_tokens (token, item_id, division, sent_at) VALUES (?, ?, ?, ?)").bind(token, id, v, t).run();
    d.reqs[v] = { status: "waiting", sent: t, token };
    const c = contacts[v] || { to: [], cc: [] };
    if (!c.to.length) { none.push(name(v)); continue; }
    const m = reviewEmail(origin, name(v), d, token, d.sender, false);
    const [res] = await sendEmail(env, db, [{ to: c.to, cc: c.cc, ...m }], "review");
    if (res && res.sent) sent++; else outbox++;
  }
  addLog(d, by, `Sent to ${todo.map(name).join(", ")} for comments${d.due ? ` (due ${fmtDay(d.due)})` : ""}`);
  return { sent, outbox, none, mail: mailReady(env) };
}

export async function sendReviewReminders(env, db, origin, d, by, only) {
  const { name } = await unitNamer(env, db, origin);
  const waiting = Object.entries(d.reqs || {}).filter(([v, r]) => r.status === "waiting" && (!only || only.includes(v)));
  if (!waiting.length) return 0;
  const contacts = await contactsFor(db, waiting.map(([v]) => v));
  // A reminder someone presses goes out from them; the automatic one from whoever sent the request.
  const sender = by && by !== "Deseret Docket" ? await personFor(env, db, by) : d.sender || await personFor(env, db, d.owner);
  let n = 0;
  for (const [v, r] of waiting) {
    const c = contacts[v] || { to: [], cc: [] };
    if (c.to.length && r.token) { await sendEmail(env, db, [{ to: c.to, cc: c.cc, ...reviewEmail(origin, name(v), d, r.token, sender, true) }], "review"); n++; }
    d.reqs[v] = { ...r, reminded: now() };
  }
  addLog(d, by, `Reminder sent to ${waiting.map(([v]) => name(v)).join(", ")}`);
  return n;
}

// Once the last division answers, whoever sent the request gets one email: everything's in, here's what they
// said, with any redlined files attached (or linked, if they're too big to attach together).
export async function allInEmail(env, db, origin, d, id) {
  const to = (d.sender && d.sender.email) || await userEmail(env, db, d.owner);
  if (!to) return;
  const files = id ? (await filesFor(db, id)).filter((f) => f.division) : [];
  const { name } = await unitNamer(env, db, origin);
  const fileLine = (v) => files.filter((f) => f.division === v).map((f) => `<div style="font-size:14px;margin-top:4px">📎 <a href="${origin}/api/file/${f.id}" style="color:#2e4d6d">${esc(f.name)}</a></div>`).join("");
  const rows = Object.entries(d.reqs || {}).map(([v, r]) => `<div style="padding:10px 0;border-top:1px solid #dbe3ea"><b>${esc(name(v))}</b>: ${r.status === "none" ? "No concerns" : "Comments"}${r.by ? ` <span style="color:#5b6672">(${esc(r.by)})</span>` : ""}${r.comments ? `<div style="font-size:14px;white-space:pre-wrap">${esc(r.comments)}</div>` : ""}${r.lang ? `<div style="font-size:14px;background:#ebf4f8;padding:6px 10px;margin-top:4px;white-space:pre-wrap"><b>Suggested language:</b> ${esc(r.lang)}</div>` : ""}${fileLine(v)}</div>`).join("");
  const head = `Every division has answered on ${reviewName(d)}`;
  const inner = `<p>Everything's in. It's ready to put the office's feedback together and send it back${d.from ? " to " + esc(d.from) : ""}${d.backBy ? ` (they need it by <b>${esc(fmtDay(d.backBy))}</b>)` : ""}.</p>${rows}${files.length ? `<p style="font-size:14px;color:#5b6672">${files.length === 1 ? "The redlined file is" : "The redlined files are"} attached.</p>` : ""}<p>${btn(`${origin}/#outreach-drafts`, "Put the feedback together", "#002147", "#fff")}</p>`;
  const att = files.length ? await attachmentsFor(db, files) : null;
  await sendEmail(env, db, [{ to: [to], cc: [], subject: `Ready to send back: ${reviewName(d)}`, html: wrap(head, inner), text: `${head}\n${origin}/#outreach-drafts`, ...(att ? { attachments: att } : {}) }], "review");
}

// The 15-minute job: one reminder per waiting division, on the due date (or REMIND_DAYS after the request).
export async function reviewTick(env, db, origin) {
  const rows = (await db.prepare("SELECT id, data FROM outreach WHERE kind = 'review'").all()).results || [];
  const today = mtDay(); let n = 0;
  for (const row of rows) {
    let d; try { d = JSON.parse(row.data || "{}"); } catch { continue; }
    if (reviewTurn(d) !== "team") continue;
    const due = Object.entries(d.reqs || {}).filter(([, r]) => r.status === "waiting" && !r.reminded && (d.due ? d.due <= today : Date.now() - new Date(r.sent) > REMIND_DAYS * 864e5)).map(([v]) => v);
    if (!due.length) continue;
    n += await sendReviewReminders(env, db, origin, d, "Deseret Docket", due);
    await db.prepare("UPDATE outreach SET data = ? WHERE id = ?").bind(JSON.stringify(d), row.id).run();
  }
  return n;
}
