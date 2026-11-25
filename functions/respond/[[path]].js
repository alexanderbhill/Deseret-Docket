// Pages division staff open from a Fiscal Hive email. No sign-in: the link's token identifies the
// request, and it only works for that request.
//   /respond/<token>?a=none     records "no impact" (confirms with one tap if the browser blocks scripts)
//   /respond/<token>?a=impact   form: amount, what it would pay for, one-time or ongoing, notes
//   /respond/<token>?a=wrong    form: which division should get it instead
import { ensureFiscal, unitConfig, logFn, settleCard } from "../../lib/fiscal.js";
import { BEE, BEE_CSS } from "../../lib/logo.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const obj = (v) => { try { const o = JSON.parse(v || "{}"); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
const shortNum = (n) => { const m = String(n || "").match(/^([A-Z]+)0*(\d+)$/); return m ? `${m[1]} ${m[2]}` : n; };
const TOKEN_DAYS = 45;

function page(title, body, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · Fiscal Hive</title><style>
:root{--navy:#002147;--steel:#3c5a78;--gold:#e9d8a6;--cream:#fffdf2;--ink:#333;--muted:#5b6672;--line:#dbe3ea;--field:#a8b7c6;--row:#ebf4f8;--honey:#e3a52a;--bee-ink:#2a2418;--wing:#eef3f7;--wing-line:#9aa8b4}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
header{background:var(--navy);color:#fff;border-bottom:4px solid var(--gold);padding:14px 20px;display:flex;align-items:center;gap:10px;font-weight:600}
header svg{width:30px;height:30px;background:var(--gold);border-radius:50%;padding:3px}${BEE_CSS}
main{max-width:640px;margin:28px auto;padding:0 18px}.card{background:#fff;border:1px solid var(--line);border-top:3px solid var(--gold);border-radius:10px;padding:22px}
h1{font-size:22px;color:var(--navy);margin:0 0 6px}.bill{background:var(--row);border-radius:8px;padding:10px 14px;margin:12px 0}
label{display:block;font-weight:600;font-size:14px;margin:14px 0 5px}input,select,textarea{width:100%;padding:10px 12px;border:1px solid var(--field);border-radius:7px;font:inherit;background:#fff}
textarea{min-height:90px}.row{display:flex;gap:14px;flex-wrap:wrap}.row label.r{display:flex;gap:8px;align-items:center;font-weight:500;margin:6px 0}.row label.r input{width:auto}
button{margin-top:18px;padding:11px 18px;border:0;border-radius:7px;background:var(--navy);color:#fff;font:600 16px inherit;cursor:pointer}
.ok{color:#2f6f3a;font-weight:600}.muted{color:var(--muted);font-size:14px}footer{text-align:center;color:#8a929b;font-size:11.5px;letter-spacing:.03em;padding:24px}
a{color:var(--steel)}:focus-visible{outline:2px solid var(--steel);outline-offset:2px}
</style></head><body><header>${BEE}Fiscal Hive · Deseret Docket</header><main><div class="card">${body}</div></main>
<footer>Attorney Work Product / Attorney-Client Communication</footer></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY" } });
}

export async function onRequest({ request, env, params }) {
  if (!env.DB) return page("Not set up", "<h1>Not set up yet</h1>", 503);
  const db = env.DB; await ensureFiscal(db);
  const url = new URL(request.url);
  const token = String((params.path || [])[0] || "");
  const req = /^[0-9a-f]{40}$/.test(token) ? await db.prepare("SELECT * FROM fn_requests WHERE token = ?").bind(token).first() : null;
  if (!req) return page("Link not found", "<h1>That link didn’t work</h1><p>It may be mistyped, or the request was withdrawn. Contact the person who sent it.</p>", 404);
  if (req.sent_at && Date.now() - new Date(req.sent_at) > TOKEN_DAYS * 864e5) return page("Link expired", "<h1>This link has expired</h1><p>Contact the person who sent the request for a new one.</p>", 410);
  if (req.status === "rerouted") return page("Sent elsewhere", "<h1>This request went to another section</h1><p>Thanks for pointing it the right way. Nothing more is needed from you.</p>");
  const card = await db.prepare("SELECT * FROM fn_cards WHERE id = ?").bind(req.card_id).first();
  const cfg = await unitConfig(env, db, url.origin);
  const divName = (id) => ((cfg.divisions || []).find((d) => d.id === id) || {}).name || id;
  const billBox = `<div class="bill"><b>${esc(shortNum(card.num))}${card.version ? ` (${esc(card.version)})` : ""}</b>: ${esc(card.title)}<div class="muted">Asked of ${esc(divName(req.division))} · <a href="https://le.utah.gov/~${esc(String(card.session).slice(0, 4))}/bills/static/${esc(card.num)}.html" target="_blank" rel="noopener">Read the bill</a></div></div>`;
  const prior = obj(req.answer);
  const already = req.answered_at ? `<p class="muted">Already answered ${req.status === "no_impact" ? "“no impact”" : req.status === "impact" ? "“probable fiscal impact”" : "“wrong section”"} on ${new Date(req.answered_at).toLocaleDateString("en-US", { timeZone: "America/Denver" })}. Submitting again replaces that answer.</p>` : "";

  if (request.method === "POST") {
    const f = await request.formData();
    const a = String(f.get("a") || "");
    const t = new Date().toISOString();
    let status, answer, msg;
    if (a === "none") { status = "no_impact"; answer = { by: String(f.get("by") || "").slice(0, 80) }; msg = "Recorded: <b>no fiscal impact</b>. Thank you!"; }
    else if (a === "impact") {
      const amount = Math.round(Math.abs(+String(f.get("amount") || "").replace(/[$,\s]/g, "")) || 0);
      const covers = String(f.get("covers") || "").trim().slice(0, 2000);
      if (!amount || !covers) return page("Missing details", `<h1>A couple of details are missing</h1>${billBox}<p>Please go back and enter both an estimated dollar amount and what the money would pay for.</p>`, 400);
      status = "impact"; answer = { amount, covers, kind: f.get("kind") === "ongoing" ? "ongoing" : f.get("kind") === "both" ? "both" : "one-time", notes: String(f.get("notes") || "").trim().slice(0, 2000), by: String(f.get("by") || "").slice(0, 80) };
      msg = `Recorded: <b>about $${amount.toLocaleString("en-US")}</b> (${esc(answer.kind)}). Thank you! The office will follow up if they have questions.`;
    } else if (a === "wrong") {
      const sugg = String(f.get("suggest") || "");
      if (!(cfg.divisions || []).some((d) => d.id === sugg) && sugg !== "unknown") return page("Pick a section", `<h1>Pick who should get it</h1>${billBox}<p>Please go back and choose a section from the list.</p>`, 400);
      status = "wrong"; answer = { suggest: sugg, note: String(f.get("note") || "").trim().slice(0, 1000), by: String(f.get("by") || "").slice(0, 80) };
      msg = `Thanks. We’ve told the office this should go to <b>${esc(sugg === "unknown" ? "another section" : divName(sugg))}</b>. They’ll send it on.`;
    } else return page("Unknown answer", "<h1>Something went wrong</h1>", 400);
    await db.batch([
      db.prepare("UPDATE fn_requests SET status = ?, answer = ?, answered_at = ? WHERE id = ?").bind(status, JSON.stringify(answer), t, req.id),
      logFn(db, req.card_id, `${divName(req.division)}${answer.by ? " (" + answer.by + ")" : ""}`, `answered ${status}${answer.amount ? " $" + answer.amount : ""}${answer.suggest ? " → " + answer.suggest : ""}`),
    ]);
    await settleCard(db, req.card_id);
    return page("Thank you", `<h1 class="ok">Thank you</h1>${billBox}<p>${msg}</p><p class="muted">You can close this tab.</p>`);
  }

  const a = url.searchParams.get("a");
  const byField = `<label for="by">Your name (optional)</label><input id="by" name="by" maxlength="80" autocomplete="name">`;
  if (a === "none") {
    // Some email security tools open links automatically; a script-free scanner won't submit this form.
    return page("No impact", `<h1>No fiscal impact</h1>${billBox}${already}<form method="post" id="f"><input type="hidden" name="a" value="none"><p>Recording your answer…</p><noscript><p>Tap the button to confirm.</p></noscript><button>Confirm: no impact</button></form>
      <script>setTimeout(()=>document.getElementById('f').submit(),400)</script>`);
  }
  if (a === "impact") {
    return page("Probable fiscal impact", `<h1>Probable fiscal impact</h1>${billBox}${already}<form method="post"><input type="hidden" name="a" value="impact">
      <label for="amount">Estimated cost (dollars)</label><input id="amount" name="amount" inputmode="numeric" required placeholder="e.g. 85000" value="${esc(prior.amount || "")}">
      <span class="muted">Round numbers are fine.</span>
      <label>Kind of cost</label><div class="row"><label class="r"><input type="radio" name="kind" value="one-time" ${prior.kind !== "ongoing" && prior.kind !== "both" ? "checked" : ""}>One-time</label><label class="r"><input type="radio" name="kind" value="ongoing" ${prior.kind === "ongoing" ? "checked" : ""}>Ongoing (each year)</label><label class="r"><input type="radio" name="kind" value="both" ${prior.kind === "both" ? "checked" : ""}>Both</label></div>
      <label for="covers">What the money would pay for</label><textarea id="covers" name="covers" required placeholder="e.g. one investigator position and case software">${esc(prior.covers || "")}</textarea>
      <label for="notes">Anything else (optional)</label><textarea id="notes" name="notes">${esc(prior.notes || "")}</textarea>
      ${byField}<button>Send estimate</button></form>`);
  }
  if (a === "wrong") {
    const groups = {};
    const dept = Object.fromEntries((cfg.departments || []).map((d) => [d.id, d.name]));
    for (const d of cfg.divisions || []) if (d.id !== req.division) (groups[dept[d.dept] || "Other"] = groups[dept[d.dept] || "Other"] || []).push(d);
    return page("Wrong section", `<h1>Wrong section?</h1>${billBox}${already}<p>Tell us who should get this instead. The office will check and send it on.</p><form method="post"><input type="hidden" name="a" value="wrong">
      <label for="suggest">Who should receive it</label><select id="suggest" name="suggest" required><option value="">Choose a section…</option>${Object.entries(groups).map(([g, l]) => `<optgroup label="${esc(g)}">${l.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join("")}</optgroup>`).join("")}<option value="unknown">Not sure, but not us</option></select>
      <label for="note">Note for the office (optional)</label><textarea id="note" name="note"></textarea>${byField}<button>Send back to the office</button></form>`);
  }
  return page("Fiscal impact check", `<h1>Fiscal impact check</h1>${billBox}${already}<p>Choose an answer:</p><p><a href="?a=none">No impact</a> · <a href="?a=impact">Probable fiscal impact</a> · <a href="?a=wrong">Wrong section</a></p>`);
}
