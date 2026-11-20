// Fiscal Hive: the fiscal note request workflow (shared by the API, the sign-out handler and the
// response pages that division staff open from their email).
//
//   fn_cards     one row per bill version the point of contact (POC) has routed or cleared
//   fn_requests  one row per division asked about a card; holds the email token and the answer
//   fn_contacts  who receives requests for each division
//   fn_activity  when each POC last used the dashboard (their queue is emailed after 10 idle minutes)
//   fn_log       audit trail of every action
//   outbox       every email the site has written; until Resend is set up, emails wait here
const now = () => new Date().toISOString();
export const rand = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const arr = (v) => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return []; } };
const obj = (v) => { try { const o = JSON.parse(v || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
export const IDLE_MINUTES = 10;
export const REMIND_HOURS = 24;
export const DEFAULT_THRESHOLD = 20000;

let ready = false;
export async function ensureFiscal(db) {
  if (ready) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS fn_cards (id TEXT PRIMARY KEY, session TEXT, num TEXT, version TEXT, title TEXT, status TEXT,
      ai TEXT, divisions TEXT, kept_ai INTEGER, poc TEXT, routed_at TEXT, sent_at TEXT, prev TEXT, note TEXT, created_at TEXT, updated_at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS fn_requests (id TEXT PRIMARY KEY, card_id TEXT, division TEXT, emails TEXT, token TEXT UNIQUE, status TEXT,
      queued_at TEXT, sent_at TEXT, reminders INTEGER DEFAULT 0, last_reminded_at TEXT, answered_at TEXT, answer TEXT, poc TEXT, reroute_of TEXT)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS fn_req_card ON fn_requests (card_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS fn_contacts (division TEXT PRIMARY KEY, emails TEXT, by TEXT, at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS fn_activity (username TEXT PRIMARY KEY, at TEXT)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS fn_log (id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT, at TEXT, by TEXT, what TEXT)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS fn_log_card ON fn_log (card_id, id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, to_addr TEXT, subject TEXT, html TEXT, text TEXT,
      kind TEXT, sent INTEGER DEFAULT 0, error TEXT)`),
  ]);
  ready = true;
}

export const logFn = (db, card, by, what) => db.prepare("INSERT INTO fn_log (card_id, at, by, what) VALUES (?, ?, ?, ?)").bind(card, now(), by, String(what).slice(0, 400));

// ------------------------------------------------------------------ email
export const mailReady = (env) => !!(env.RESEND_API_KEY && (env.MAIL_FROM || env.EMAIL_FROM));
// Every email goes through here: it is written to the outbox and, once Resend is set up, sent.
export async function sendEmail(env, db, msgs, kind) {
  const results = [];
  for (const m of msgs) {
    let sent = 0, error = null;
    if (mailReady(env)) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: env.MAIL_FROM || env.EMAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers || {} }),
        });
        if (r.ok) sent = 1; else error = `Resend ${r.status}: ${(await r.text()).slice(0, 200)}`;
      } catch (e) { error = String(e.message || e).slice(0, 200); }
    }
    await db.prepare("INSERT INTO outbox (at, to_addr, subject, html, text, kind, sent, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(now(), m.to, m.subject.slice(0, 300), m.html, m.text || "", kind || "", sent, error).run();
    results.push({ to: m.to, sent, error });
  }
  return results;
}

// ------------------------------------------------------------------ config and contacts
export async function siteConfig(env, origin) {
  try { return await (await env.ASSETS.fetch(new Request(origin + "/config.json"))).json(); } catch { return { divisions: [], departments: [] }; }
}
export async function contactsFor(db, divisions) {
  const out = {};
  const rows = (await db.prepare("SELECT division, emails FROM fn_contacts").all()).results || [];
  for (const r of rows) out[r.division] = arr(r.emails);
  // Nobody named yet? Fall back to approved accounts in that section.
  const users = (await db.prepare("SELECT email, section FROM users WHERE disabled = 0 AND email <> '' AND section <> ''").all()).results || [];
  for (const d of divisions) if (!out[d] || !out[d].length) out[d] = users.filter((u) => u.section === d).map((u) => u.email);
  return out;
}
export async function threshold(db) {
  const s = await db.prepare("SELECT v FROM settings WHERE k = 'fn_threshold'").first();
  const v = s ? +s.v : DEFAULT_THRESHOLD;
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_THRESHOLD;
}

// ------------------------------------------------------------------ the request email
const billUrl = (c) => {
  const yr = String(c.session).slice(0, 4);
  return `https://le.utah.gov/~${yr}/bills/static/${c.num}.html`;
};
const shortNum = (n) => { const m = String(n || "").match(/^([A-Z]+)0*(\d+)$/); return m ? `${m[1]} ${m[2]}` : n; };
const needWords = { likely: "Likely has a fiscal impact", unlikely: "Probably no fiscal impact", unsure: "Not sure: worth a look" };
function btn(href, label, bg, fg) {
  return `<a href="${href}" style="display:inline-block;margin:4px 6px 4px 0;padding:9px 14px;border-radius:6px;background:${bg};color:${fg};text-decoration:none;font-weight:600;font-size:14px">${label}</a>`;
}
export function requestEmail(origin, divName, items, poc, reminder) {
  const head = reminder ? `Reminder: ${items.length === 1 ? "a fiscal note question is" : items.length + " fiscal note questions are"} waiting for ${divName}`
    : `${items.length === 1 ? "1 bill needs" : items.length + " bills need"} a fiscal impact check from ${divName}`;
  const rows = items.map(({ card, req }) => {
    const ai = obj(card.ai);
    const r = (a) => `${origin}/respond/${req.token}?a=${a}`;
    return `<tr><td style="padding:16px 0;border-top:1px solid #dbe3ea">
      <div style="font-weight:700;color:#002147;font-size:16px">${esc(shortNum(card.num))}${card.version ? ` <span style="font-weight:500;color:#5b6672">(${esc(card.version)})</span>` : ""}: ${esc(card.title)}</div>
      ${ai.sum ? `<p style="margin:6px 0;color:#333">${esc(ai.sum)}</p>` : ""}
      <div style="background:#ebf4f8;border-left:3px solid #3c5a78;padding:8px 12px;margin:8px 0;font-size:14px"><b>${ai.src === "ai" ? "AI assessment" : "Automatic assessment"}:</b> ${esc(needWords[ai.need] || needWords.unsure)}${ai.why ? `. ${esc(ai.why)}` : ""}</div>
      <div style="font-size:14px;margin-bottom:6px"><a href="${billUrl(card)}" style="color:#2e4d6d">Read the bill on le.utah.gov</a></div>
      ${btn(r("none"), "No impact", "#3c5a78", "#fff")}${btn(r("impact"), "Probable fiscal impact", "#002147", "#fff")}${btn(r("wrong"), "Wrong section", "#e9d8a6", "#002147")}
    </td></tr>`;
  }).join("");
  const html = `<div style="font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#333;max-width:640px">
    <div style="background:#002147;color:#fff;padding:14px 18px;border-bottom:4px solid #e9d8a6;border-radius:8px 8px 0 0;font-weight:600">Fiscal Hive · Deseret Docket</div>
    <div style="padding:6px 18px 18px;background:#fffdf2;border:1px solid #dbe3ea;border-top:0;border-radius:0 0 8px 8px">
    <p style="font-size:17px;color:#002147;font-weight:600">${esc(head)}</p>
    <p>Please answer each bill with one click. <b>No impact</b> is recorded right away. <b>Probable fiscal impact</b> opens a short form for the amount and what it would pay for. <b>Wrong section</b> lets you tell us who should get it instead. No sign-in needed.</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="color:#5b6672;font-size:13px">Sent for ${esc(poc || "the office")}. Unanswered requests get one reminder after ${REMIND_HOURS} hours. These links only work for you; please don't forward this email.</p>
    <p style="color:#8a929b;font-size:11px;letter-spacing:.03em;text-align:center">Attorney Work Product / Attorney-Client Communication</p></div></div>`;
  const text = `${head}\n\n` + items.map(({ card, req }) => {
    const ai = obj(card.ai);
    return `${shortNum(card.num)} ${card.version ? "(" + card.version + ") " : ""}${card.title}\n${ai.sum || ""}\nAssessment: ${needWords[ai.need] || needWords.unsure}${ai.why ? ". " + ai.why : ""}\nBill: ${billUrl(card)}\nNo impact: ${origin}/respond/${req.token}?a=none\nProbable fiscal impact: ${origin}/respond/${req.token}?a=impact\nWrong section: ${origin}/respond/${req.token}?a=wrong\n`;
  }).join("\n") + "\nAttorney Work Product / Attorney-Client Communication\n";
  return { subject: reminder ? `Reminder: fiscal impact check for ${divName}` : `Fiscal impact check: ${items.length} bill${items.length === 1 ? "" : "s"} for ${divName}`, html, text };
}

// ------------------------------------------------------------------ sending a POC's queue
// Everything one person routed in a sitting goes out together: one email per division.
export async function flushQueue(env, db, origin, poc) {
  await ensureFiscal(db);
  const q = (await db.prepare("SELECT * FROM fn_requests WHERE status = 'queued'" + (poc ? " AND poc = ?" : "")).bind(...(poc ? [poc] : [])).all()).results || [];
  if (!q.length) return { sent: 0, divisions: 0 };
  const cfg = await siteConfig(env, origin);
  const divName = (id) => ((cfg.divisions || []).find((d) => d.id === id) || {}).name || id;
  const byDiv = {};
  for (const r of q) (byDiv[r.division] = byDiv[r.division] || []).push(r);
  const contacts = await contactsFor(db, Object.keys(byDiv));
  const cardIds = [...new Set(q.map((r) => r.card_id))];
  const cards = {};
  for (const id of cardIds) cards[id] = await db.prepare("SELECT * FROM fn_cards WHERE id = ?").bind(id).first();
  const t = now(); let sent = 0; const stmts = [];
  for (const [div, reqs] of Object.entries(byDiv)) {
    const to = contacts[div] || [];
    if (!to.length) { // nobody to send to: flag it for the POC
      for (const r of reqs) { stmts.push(db.prepare("UPDATE fn_requests SET status = 'nocontact' WHERE id = ?").bind(r.id)); stmts.push(logFn(db, r.card_id, "system", `no contact for ${div}`)); }
      continue;
    }
    const items = reqs.filter((r) => cards[r.card_id]).map((r) => ({ card: cards[r.card_id], req: r }));
    const mail = requestEmail(origin, divName(div), items, reqs[0].poc, false);
    await sendEmail(env, db, to.map((addr) => ({ to: addr, ...mail })), "fiscal");
    sent += to.length;
    for (const r of reqs) {
      stmts.push(db.prepare("UPDATE fn_requests SET status = 'pending', sent_at = ?, emails = ? WHERE id = ?").bind(t, JSON.stringify(to), r.id));
      stmts.push(logFn(db, r.card_id, r.poc, `emailed ${div} (${to.length})`));
    }
  }
  for (const id of cardIds) stmts.push(db.prepare("UPDATE fn_cards SET status = 'sent', sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ? AND status IN ('queued','sent','attention')").bind(t, t, id));
  if (stmts.length) await db.batch(stmts);
  return { sent, divisions: Object.keys(byDiv).length };
}

// Reminder emails: automatic after 24 hours (weekends count), or right away from the bell button.
export async function sendReminders(env, db, origin, { cardId = null, by = "system" } = {}) {
  await ensureFiscal(db);
  const cutoff = new Date(Date.now() - REMIND_HOURS * 3600e3).toISOString();
  let rows;
  if (cardId) rows = (await db.prepare("SELECT * FROM fn_requests WHERE card_id = ? AND status = 'pending'").bind(cardId).all()).results || [];
  else rows = (await db.prepare("SELECT * FROM fn_requests WHERE status = 'pending' AND sent_at < ? AND reminders = 0").bind(cutoff).all()).results || [];
  if (!rows.length) return { reminded: 0 };
  const cfg = await siteConfig(env, origin);
  const divName = (id) => ((cfg.divisions || []).find((d) => d.id === id) || {}).name || id;
  const byDiv = {};
  for (const r of rows) (byDiv[r.division] = byDiv[r.division] || []).push(r);
  const t = now(); const stmts = []; let n = 0;
  for (const [div, reqs] of Object.entries(byDiv)) {
    const to = [...new Set(reqs.flatMap((r) => arr(r.emails)))];
    if (!to.length) continue;
    const items = [];
    for (const r of reqs) { const c = await db.prepare("SELECT * FROM fn_cards WHERE id = ?").bind(r.card_id).first(); if (c) items.push({ card: c, req: r }); }
    const mail = requestEmail(origin, divName(div), items, reqs[0].poc, true);
    await sendEmail(env, db, to.map((addr) => ({ to: addr, ...mail })), "fiscal-reminder");
    n += to.length;
    for (const r of reqs) {
      stmts.push(db.prepare("UPDATE fn_requests SET reminders = reminders + 1, last_reminded_at = ? WHERE id = ?").bind(t, r.id));
      stmts.push(logFn(db, r.card_id, by, `reminded ${div}`));
    }
  }
  if (stmts.length) await db.batch(stmts);
  return { reminded: n };
}

// Run by the email job every 15 minutes: send queues left idle and due reminders.
export async function fiscalTick(env, db, origin) {
  await ensureFiscal(db);
  const idle = new Date(Date.now() - IDLE_MINUTES * 60e3).toISOString();
  const pocs = (await db.prepare("SELECT DISTINCT poc FROM fn_requests WHERE status = 'queued'").all()).results || [];
  let flushed = 0;
  for (const { poc } of pocs) {
    const a = await db.prepare("SELECT at FROM fn_activity WHERE username = ?").bind(poc).first();
    if (!a || a.at < idle) { const r = await flushQueue(env, db, origin, poc); flushed += r.sent; }
  }
  const rem = await sendReminders(env, db, origin);
  return { flushed, reminded: rem.reminded };
}

// When every division asked about a card has answered, the card is done.
export async function settleCard(db, cardId) {
  const reqs = (await db.prepare("SELECT status FROM fn_requests WHERE card_id = ?").bind(cardId).all()).results || [];
  const open = reqs.some((r) => ["queued", "pending", "nocontact"].includes(r.status));
  const wrong = reqs.some((r) => r.status === "wrong");
  const status = wrong ? "attention" : open ? "sent" : "answered";
  await db.prepare("UPDATE fn_cards SET status = ?, updated_at = ? WHERE id = ? AND status <> 'cleared'").bind(status, now(), cardId).run();
  return status;
}
