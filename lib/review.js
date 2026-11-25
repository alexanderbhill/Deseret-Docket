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

export const SERVER_FIELDS = ["reqs", "log", "sent", "prev"];
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

async function userEmail(db, who) {
  const w = String(who || "").toLowerCase(); if (!w) return "";
  const u = await db.prepare("SELECT email FROM users WHERE disabled = 0 AND email <> '' AND (lower(username) = ? OR lower(name) = ?)").bind(w, w).first();
  return u ? u.email : "";
}

function btn(href, label, bg, fg) {
  return `<a href="${href}" style="display:inline-block;margin:4px 6px 4px 0;padding:9px 14px;border-radius:6px;background:${bg};color:${fg};text-decoration:none;font-weight:600;font-size:14px">${label}</a>`;
}
const wrap = (head, inner) => `<div style="font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#333;max-width:640px">
  <div style="background:#002147;color:#fff;padding:14px 18px;border-bottom:4px solid #e9d8a6;border-radius:8px 8px 0 0;font-weight:600">Draft review · Deseret Docket</div>
  <div style="padding:6px 18px 18px;background:#fffdf2;border:1px solid #dbe3ea;border-top:0;border-radius:0 0 8px 8px">
  <p style="font-size:17px;color:#002147;font-weight:600">${esc(head)}</p>${inner}
  <p style="color:#8a929b;font-size:11px;letter-spacing:.03em;text-align:center">Attorney Work Product / Attorney-Client Communication</p></div></div>`;

// The email a division gets: what the draft is, who it's from, when the office needs comments, and two buttons.
export function reviewEmail(origin, divName, d, token, poc, reminder) {
  const r = (a) => `${origin}/review/${token}${a ? "?a=" + a : ""}`;
  const name = reviewName(d);
  const head = reminder ? `Reminder: ${divName}'s comments on ${name} are still needed` : `${divName}: please review ${name}`;
  const from = d.from ? `${d.from}${ROLE[d.fromRole] ? ", " + ROLE[d.fromRole] : ""}` : ROLE[d.fromRole] || "the drafter";
  const inner = `<div style="background:#ebf4f8;border-radius:8px;padding:10px 14px;margin:8px 0">
     <div style="font-weight:700;color:#002147;font-size:16px">${esc(name)}${d.version ? ` <span style="font-weight:500;color:#5b6672">(${esc(d.version)})</span>` : ""}</div>
     <div style="font-size:14px;color:#5b6672">From ${esc(from)}${d.due ? ` · Comments due <b>${esc(fmtDay(d.due))}</b>` : ""}</div>
     ${d.link ? `<div style="font-size:14px;margin-top:4px"><a href="${esc(d.link)}" style="color:#2e4d6d">Open the draft</a></div>` : ""}</div>
    ${d.notes ? `<p style="font-size:14px"><b>What to look for:</b> ${esc(d.notes)}</p>` : ""}
    <p>Tell ${esc(poc || "the office's point of contact")} whether ${esc(divName)} has concerns. <b>No concerns</b> is recorded with one click. <b>Send comments</b> opens a short form for your comments and any suggested language. No sign-in needed.</p>
    ${btn(r("none"), "No concerns", "#3c5a78", "#fff")}${btn(r("comments"), "Send comments", "#002147", "#fff")}
    <p style="color:#5b6672;font-size:13px">Sent for ${esc(poc || "the office")}, who puts the office's feedback together and sends it back to the ${esc(d.fromRole === "drafter" ? "drafter" : d.fromRole || "drafter")}. Anyone in the To line can answer for the division.${reminder ? "" : " If nobody answers, one reminder goes out" + (d.due ? " when comments are due." : ` after ${REMIND_DAYS} days.`)} Please don't forward this email outside the office.</p>`;
  const text = `${head}\n\n${name}${d.version ? " (" + d.version + ")" : ""}\nFrom ${from}${d.due ? "\nComments due " + fmtDay(d.due) : ""}${d.link ? "\nDraft: " + d.link : ""}${d.notes ? "\nWhat to look for: " + d.notes : ""}\n\nNo concerns: ${r("none")}\nSend comments: ${r("comments")}\n\nAttorney Work Product / Attorney-Client Communication\n`;
  return { subject: reminder ? `Reminder: comments on ${name} for ${divName}` : `Draft review: ${name}${d.version ? " (" + d.version + ")" : ""} for ${divName}`, html: wrap(head, inner), text };
}

// Send the request to every listed division that hasn't been asked yet (or the ones named). Returns how it went.
export async function sendRequests(env, db, origin, id, d, by, only) {
  await ensureReview(db);
  const { name } = await unitNamer(env, db, origin);
  const divs = (only && only.length ? only : d.divisions || []).filter((v) => (d.divisions || []).includes(v));
  const todo = divs.filter((v) => !d.reqs || !d.reqs[v] || (only && only.length));
  if (!todo.length) return { sent: 0, outbox: 0, none: [] };
  const contacts = await contactsFor(db, todo);
  d.reqs = { ...(d.reqs || {}) };
  let sent = 0, outbox = 0; const none = [];
  for (const v of todo) {
    const token = rand(20), t = now();
    await db.prepare("INSERT INTO review_tokens (token, item_id, division, sent_at) VALUES (?, ?, ?, ?)").bind(token, id, v, t).run();
    d.reqs[v] = { status: "waiting", sent: t, token };
    const c = contacts[v] || { to: [], cc: [] };
    if (!c.to.length) { none.push(name(v)); continue; }
    const m = reviewEmail(origin, name(v), d, token, d.owner || by, false);
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
  let n = 0;
  for (const [v, r] of waiting) {
    const c = contacts[v] || { to: [], cc: [] };
    if (c.to.length && r.token) { await sendEmail(env, db, [{ to: c.to, cc: c.cc, ...reviewEmail(origin, name(v), d, r.token, d.owner || by, true) }], "review"); n++; }
    d.reqs[v] = { ...r, reminded: now() };
  }
  addLog(d, by, `Reminder sent to ${waiting.map(([v]) => name(v)).join(", ")}`);
  return n;
}

// Once the last division answers, the POC gets one email: everything's in, here's what they said.
export async function allInEmail(env, db, origin, d) {
  const to = await userEmail(db, d.owner);
  if (!to) return;
  const { name } = await unitNamer(env, db, origin);
  const rows = Object.entries(d.reqs || {}).map(([v, r]) => `<div style="padding:10px 0;border-top:1px solid #dbe3ea"><b>${esc(name(v))}</b>: ${r.status === "none" ? "No concerns" : "Comments"}${r.by ? ` <span style="color:#5b6672">(${esc(r.by)})</span>` : ""}${r.comments ? `<div style="font-size:14px;white-space:pre-wrap">${esc(r.comments)}</div>` : ""}${r.lang ? `<div style="font-size:14px;background:#ebf4f8;padding:6px 10px;margin-top:4px;white-space:pre-wrap"><b>Suggested language:</b> ${esc(r.lang)}</div>` : ""}</div>`).join("");
  const head = `Every division has answered on ${reviewName(d)}`;
  const inner = `<p>It's ready for you to put the office's feedback together and send it back${d.from ? " to " + esc(d.from) : ""}${d.backBy ? ` (they need it by <b>${esc(fmtDay(d.backBy))}</b>)` : ""}.</p>${rows}<p>${btn(`${origin}/#outreach-drafts`, "Put the feedback together", "#002147", "#fff")}</p>`;
  await sendEmail(env, db, [{ to: [to], cc: [], subject: `Ready to send back: ${reviewName(d)}`, html: wrap(head, inner), text: `${head}\n${origin}/#outreach-drafts` }], "review");
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
