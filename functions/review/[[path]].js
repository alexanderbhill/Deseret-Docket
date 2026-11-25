// The page a division opens from a draft review email. No sign-in: the link's token identifies one division's
// part of one review, and it works only for that.
//   /review/<token>?a=none       "No concerns" (one button to confirm, so link scanners can't answer for anyone)
//   /review/<token>?a=comments   comments and suggested language
import { BEE, BEE_CSS } from "../../lib/logo.js";
import { ensureReview, addLog, reviewTurn, reviewName, allInEmail, TOKEN_DAYS } from "../../lib/review.js";
import { unitNamer } from "../../lib/fiscal.js";
import { saveFile, filesFor, deleteFile, MAX_FILE } from "../../lib/files.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDay = (d) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : "");
const ROLE = { drafter: "drafting attorney (LRGC)", sponsor: "sponsor", stakeholder: "stakeholder" };
// the office's own proposed language has no outside sender to name

function page(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · Draft review</title><style>
:root{--navy:#002147;--steel:#3c5a78;--gold:#e9d8a6;--cream:#fffdf2;--ink:#333;--muted:#5b6672;--line:#dbe3ea;--field:#a8b7c6;--row:#ebf4f8;--honey:#e3a52a;--bee-ink:#2a2418;--wing:#eef3f7;--wing-line:#9aa8b4}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
header{background:var(--navy);color:#fff;border-bottom:4px solid var(--gold);padding:14px 20px;display:flex;align-items:center;gap:10px;font-weight:600}
header svg{width:30px;height:30px;background:var(--gold);border-radius:50%;padding:3px}${BEE_CSS}
main{max-width:640px;margin:28px auto;padding:0 18px}.card{background:#fff;border:1px solid var(--line);border-top:3px solid var(--gold);border-radius:10px;padding:22px}
h1{font-size:22px;color:var(--navy);margin:0 0 6px}.bill{background:var(--row);border-radius:8px;padding:10px 14px;margin:12px 0}
label{display:block;font-weight:600;font-size:14px;margin:14px 0 5px}input,textarea{width:100%;padding:10px 12px;border:1px solid var(--field);border-radius:7px;font:inherit;background:#fff}
textarea{min-height:110px}button{margin-top:18px;padding:11px 18px;border:0;border-radius:7px;background:var(--navy);color:#fff;font:600 16px inherit;cursor:pointer}
button.alt{background:var(--steel)}.muted{color:var(--muted);font-size:14px}.ok{color:#2f6f3a;font-weight:600}footer{text-align:center;color:#8a929b;font-size:11.5px;letter-spacing:.03em;padding:24px}
a{color:var(--steel)}:focus-visible{outline:2px solid var(--steel);outline-offset:2px}
</style></head><body><header>${BEE}Draft review · Deseret Docket</header><main><div class="card">${body}</div></main>
<footer>Attorney Work Product / Attorney-Client Communication</footer></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" } });
}

export async function onRequest({ request, env, params }) {
  if (!env.DB) return page("Not set up", "<h1>Not set up yet</h1>", 503);
  const db = env.DB; await ensureReview(db);
  const url = new URL(request.url);
  const token = String((params.path || [])[0] || "");
  const tk = /^[0-9a-f]{40}$/.test(token) ? await db.prepare("SELECT * FROM review_tokens WHERE token = ?").bind(token).first() : null;
  const row = tk ? await db.prepare("SELECT id, data FROM outreach WHERE id = ? AND kind = 'review'").bind(tk.item_id).first() : null;
  if (!row) return page("Link not found", "<h1>That link didn’t work</h1><p>It may be mistyped, or the review was withdrawn. Contact the person who sent it.</p>", 404);
  if (Date.now() - new Date(tk.sent_at) > TOKEN_DAYS * 864e5) return page("Link expired", "<h1>This link has expired</h1><p>Contact the person who sent the request.</p>", 410);
  let d; try { d = JSON.parse(row.data || "{}"); } catch { d = {}; }
  const { name } = await unitNamer(env, db, url.origin);
  const div = tk.division, dn = name(div);
  const req = (d.reqs || {})[div] || {};
  if (req.token && req.token !== token) return page("Link replaced", "<h1>A newer request replaced this link</h1><p>Use the most recent email about this draft.</p>", 410);
  const from = d.fromRole === "office" ? "" : d.from ? `${d.from}${ROLE[d.fromRole] ? ", " + ROLE[d.fromRole] : ""}` : ROLE[d.fromRole] || "";
  const box = `<div class="bill"><b>${esc(reviewName(d))}</b>${d.version ? ` (${esc(d.version)})` : ""}<div class="muted">For ${esc(dn)}${from ? " · From " + esc(from) : ""}${d.due ? " · Comments due " + esc(fmtDay(d.due)) : ""}${d.link ? ` · <a href="${esc(d.link)}" target="_blank" rel="noopener">Open the draft</a>` : ""}</div></div>`;
  const closed = d.closed || (d.sent && d.sent.at);
  const poc = (d.sender && d.sender.name) || d.owner || "";
  const pocFirst = poc.split(" ")[0] || "the office";
  const mine = (await filesFor(db, row.id)).filter((f) => f.division === div);
  const already = req.at && req.status !== "waiting" ? `<p class="muted">${esc(dn)} already answered “${req.status === "none" ? "no concerns" : "comments"}”${req.by ? " (" + esc(req.by) + ")" : ""}. Sending again replaces that answer.</p>` : "";

  if (request.method === "POST") {
    if (closed) return page("Already sent back", `<h1>The office’s feedback already went back</h1>${box}<p>Contact ${esc(poc || "the person who sent it")} directly with anything else.</p>`);
    const f = await request.formData();
    const a = String(f.get("a") || "");
    const by = String(f.get("by") || "").trim().slice(0, 80);
    const comments = String(f.get("comments") || "").trim().slice(0, 6000), lang = String(f.get("lang") || "").trim().slice(0, 6000);
    const ups = f.getAll("redline").filter((x) => x && typeof x === "object" && x.size > 0).slice(0, 5);
    for (const id of f.getAll("drop").map(String)) if (mine.some((x) => x.id === id)) await deleteFile(db, id);
    const saved = [];
    for (const up of ups) {
      try { saved.push(await saveFile(db, up, row.id, div, by || dn)); }
      catch (e) { return page("File not attached", `<h1>That file couldn’t be attached</h1>${box}<p>${esc(e.message)}</p><p><a href="javascript:history.back()">Go back</a></p>`, 400); }
    }
    const kept = mine.filter((x) => !f.getAll("drop").map(String).includes(x.id)).concat(saved);
    if (a === "comments" && !comments && !lang && !kept.length) return page("Nothing written", `<h1>Add your comments</h1>${box}<p>Go back and write your comments or attach your redline, or choose “No concerns.”</p>`, 400);
    if (!["none", "comments"].includes(a)) return page("Choose an answer", "<h1>Choose an answer</h1>", 400);
    const wasTeam = reviewTurn(d) === "team";
    d.reqs = { ...(d.reqs || {}), [div]: { ...req, status: a, comments: a === "comments" ? comments : "", lang: a === "comments" ? lang : "", files: a === "comments" ? kept.map((x) => ({ id: x.id, name: x.name, size: x.size })) : [], by, at: new Date().toISOString() } };
    addLog(d, by || dn, `${dn}: ${a === "none" ? "no concerns" : saved.length ? `sent comments with ${saved.length === 1 ? "a redline" : saved.length + " files"}` : "sent comments"}`);
    await db.prepare("UPDATE outreach SET data = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify(d), new Date().toISOString(), row.id).run();
    if (wasTeam && reviewTurn(d) === "us") { try { await allInEmail(env, db, url.origin, d, row.id); } catch { /* the dashboard shows it either way */ } }
    return page("Thank you", `<h1 class="ok">Thank you!</h1>${box}<p>Recorded for ${esc(dn)}: <b>${a === "none" ? "no concerns" : "comments"}</b>${kept.length && a === "comments" ? ` and ${kept.length === 1 ? "your file" : kept.length + " files"}` : ""}. ${esc(pocFirst)} will include it in the office’s feedback. You can open this link again to change your answer until the feedback goes back.</p>`);
  }

  if (closed) return page("Already sent back", `<h1>The office’s feedback already went back</h1>${box}<p>Contact ${esc(poc || "the person who sent it")} directly with anything else.</p>`);
  const a = url.searchParams.get("a") === "none" ? "none" : "comments";
  const nameField = `<label for="by">Your name</label><input id="by" name="by" autocomplete="name" value="${esc(req.by || "")}">`;
  if (a === "none") return page("No concerns", `<h1>No concerns from ${esc(dn)}?</h1>${box}${already}<form method="post"><input type="hidden" name="a" value="none">${nameField}<button>Yes, no concerns</button></form><p class="muted" style="margin-top:16px">Have something to say after all? <a href="?a=comments">Send comments instead</a>.</p>`);
  return page("Send comments", `<h1>${esc(dn)}’s comments</h1>${box}${already}<form method="post" enctype="multipart/form-data"><input type="hidden" name="a" value="comments">
    <p class="muted">Type your comments, attach your marked-up copy, or both.</p>
    <label for="c">Comments</label><textarea id="c" name="comments" placeholder="What concerns ${esc(dn)} and why. Page and line numbers help.">${esc(req.comments || "")}</textarea>
    <label for="l">Suggested language (optional)</label><textarea id="l" name="lang" placeholder="Page 3, lines 12–14: replace “shall” with “may”…">${esc(req.lang || "")}</textarea>
    <label for="rf">Attach a redline (optional)</label><input type="file" id="rf" name="redline" accept=".pdf,.doc,.docx,.rtf,.odt,.txt" multiple>
    <p class="muted" style="margin:4px 0 0">A Word file with tracked changes or a marked-up PDF. Up to ${MAX_FILE / 1048576} MB each.</p>
    ${mine.length ? `<p class="muted" style="margin-top:10px">Already attached:</p>${mine.map((x) => `<label style="font-weight:400"><input type="checkbox" name="drop" value="${x.id}" style="width:auto"> Remove ${esc(x.name)}</label>`).join("")}` : ""}
    ${nameField}<button>Send comments</button></form><p class="muted" style="margin-top:16px">Nothing to add? <a href="?a=none">No concerns</a>.</p>`);
}
