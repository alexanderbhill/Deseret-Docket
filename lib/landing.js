// The first page people see: sign in or ask for an account, with a short tour of what the site does below.
// Written to describe the product in general terms (nothing specific to one office).
import { BEE, BEE_CSS } from "./logo.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Small line illustrations for the feature tiles (drawn here so the page has no outside images).
const ICON = {
  track: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="9" width="34" height="30" rx="4"/><path d="M13 18h22M13 25h22M13 32h14"/><circle cx="36" cy="32" r="3" class="f"/></svg>`,
  bell: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 33V22a10 10 0 0 1 20 0v11l3 4H11z"/><path d="M20 40a4 4 0 0 0 8 0"/><circle cx="34" cy="13" r="4" class="f"/></svg>`,
  money: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="13" width="36" height="22" rx="3"/><circle cx="24" cy="24" r="5"/><path d="M11 18v12M37 18v12"/></svg>`,
  diff: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="8" width="15" height="32" rx="2"/><rect x="26" y="8" width="15" height="32" rx="2"/><path d="M11 15h7M11 21h7M30 15h7M30 21h7"/><path d="M30 27h7" class="g"/><path d="M11 27h7" class="r"/></svg>`,
  history: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15"/><path d="M24 15v9l6 4"/><path d="M6 24h4M38 24h4"/></svg>`,
  people: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="18" r="6"/><circle cx="33" cy="20" r="5"/><path d="M6 38c1-7 6-11 11-11s10 4 11 11M27 38c1-5 3-8 6-8s6 3 7 8"/></svg>`,
  pulse: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 26h9l4-10 6 20 5-14 3 4h11"/></svg>`,
  learn: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 18l18-8 18 8-18 8z"/><path d="M14 22v9c4 4 16 4 20 0v-9"/><path d="M42 18v10"/></svg>`,
  report: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="6" width="28" height="36" rx="3"/><path d="M16 32V24M22 32V18M28 32v-6M34 32V20"/></svg>`,
};

export function landingPage({ message = "", status = 200, next = "/", disabled = false, sections = [], mode = "signin", signup = {}, notice = "" } = {}) {
  const sel = (v) => (signup.section === v ? "selected" : "");
  const groups = {};
  for (const s of sections) (groups[s.group] = groups[s.group] || []).push(s);
  const sectionOpts = Object.entries(groups).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((s) => `<option value="${esc(s.id)}" ${sel(s.id)}>${esc(s.name)}</option>`).join("")}</optgroup>`).join("");
  const feats = [
    ["track", "Every bill, one table", "Numbered bills and unnumbered bill files, refreshed from the Legislature several times each weekday. Sort, filter, rearrange columns and export to a spreadsheet."],
    ["bell", "Alerts that matter", "Hearings added, substitutes released, and bills circled, uncircled or sent to Rules, in a morning email or on the Updates page."],
    ["money", "Fiscal note workflow", "Route each bill to the right team in seconds, collect impact estimates by email in one click, and flag anything over your appropriations threshold."],
    ["diff", "What changed, in plain English", "Side-by-side text changes for every substitute and amendment, with a short summary and a flag when a change touches code you watch."],
    ["history", "This bill has run before", "See earlier versions of a bill, who carried them, how far they got and where they stopped."],
    ["people", "Know the players", "Legislator profiles with photos, committees, sponsorships and the positions outside groups have taken on their bills."],
    ["pulse", "News and sentiment", "Newspaper coverage of each bill in one place, with a simple gauge of how the coverage leans."],
    ["learn", "Learn the Legislature", "Games and visual guides that teach new staff and interns the members and the process in an afternoon."],
    ["report", "Session scorecards", "An end-of-session scorecard for every position you took, plus personal season recaps for the team."],
  ];
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deseret Docket · Legislative tracking for teams</title><meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap" rel="stylesheet">
<style>
:root{--cream:#fffdf2;--navy:#002147;--steel:#3c5a78;--ink:#333;--muted:#5b6672;--gold:#e9d8a6;--blue:#c0deea;--row:#ebf4f8;--line:#dbe3ea;--field:#a8b7c6;--maroon:#78081c;--honey:#e3a52a;--bee-ink:#2a2418;--wing:#eef3f7;--wing-line:#9aa8b4}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
a{color:var(--steel)}:focus-visible{outline:2px solid var(--steel);outline-offset:2px}
.top{background:var(--navy);color:#fff;border-bottom:4px solid var(--gold)}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
.hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,430px);gap:48px;align-items:center;padding:46px 0 56px}
.brand{display:flex;align-items:center;gap:12px;font:500 30px "Source Serif 4",Georgia,serif}
.brand svg{width:46px;height:46px;background:var(--gold);border-radius:50%;padding:4px}${BEE_CSS}
.hero h1{font:500 44px/1.12 "Source Serif 4",Georgia,serif;margin:22px 0 14px;letter-spacing:-.01em}
.hero p.lead{font-size:19px;color:#d9e2ea;max-width:560px;margin:0 0 22px}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chips span{border:1px solid rgba(233,216,166,.6);color:var(--gold);border-radius:999px;padding:3px 12px;font-size:14px}
.box{background:#fff;color:var(--ink);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.25);padding:26px 26px 22px}
.tabs{display:flex;border:1px solid var(--field);border-radius:8px;overflow:hidden;margin-bottom:6px}
.tabs button{flex:1;border:0;background:#fff;padding:9px;font:600 15px inherit;color:var(--muted);cursor:pointer}
.tabs button.on{background:var(--navy);color:#fff}
label{display:block;font-weight:600;font-size:14px;margin:12px 0 5px}
input,select{width:100%;padding:10px 12px;border:1px solid var(--field);border-radius:7px;background:#fff;color:var(--ink);font:inherit;min-height:42px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
button.go{margin-top:18px;width:100%;padding:11px;border:0;border-radius:7px;background:var(--navy);color:#fff;font:600 16px inherit;cursor:pointer}
button.go:hover{background:#0b3366}
.msg{background:#f9ecee;color:var(--maroon);border-radius:7px;padding:9px 12px;font-size:14px;margin-top:12px}
.ok{background:#ecf4ec;color:#2f6f3a;border-radius:7px;padding:9px 12px;font-size:14px;margin-top:12px}
.muted{color:var(--muted);font-size:14px;margin:0}.guest{display:block;text-align:center;margin-top:14px;font-size:14.5px}
.hp{position:absolute;left:-9999px}
section.feat{padding:56px 0 20px}
section.feat h2{font:500 32px "Source Serif 4",Georgia,serif;color:var(--navy);margin:0 0 6px}
section.feat>.wrap>p{color:var(--muted);max-width:720px;margin:0 0 28px;font-size:17px}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}
.tile{background:#fff;border:1px solid var(--line);border-top:3px solid var(--gold);border-radius:10px;padding:20px}
.tile:nth-child(even){background:var(--row)}
.tile svg{width:44px;height:44px;fill:none;stroke:var(--navy);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.tile svg .f{fill:var(--gold);stroke:var(--navy)}.tile svg .g{stroke:#2f6f3a}.tile svg .r{stroke:var(--maroon)}
.tile h3{margin:10px 0 4px;color:var(--navy);font-size:18px}.tile p{margin:0;color:var(--ink);font-size:15px}
.how{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;margin:40px 0 10px;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}
.how div{padding:20px;border-right:1px solid var(--line)}.how div:last-child{border-right:0}.how div:nth-child(even){background:var(--row)}
.how b{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--navy);color:var(--gold);margin-bottom:8px}
.how h4{margin:0 0 4px;color:var(--navy)}.how p{margin:0;font-size:14.5px}
footer{text-align:center;color:#8a929b;font-size:11.5px;letter-spacing:.03em;padding:40px 20px 30px}
@media (max-width:900px){.hero{grid-template-columns:1fr;gap:28px}.hero h1{font-size:34px}.grid{grid-template-columns:1fr}.how{grid-template-columns:1fr 1fr}.how div:nth-child(2){border-right:0}}
</style></head><body>
<div class="top"><div class="wrap hero">
 <div><div class="brand">${BEE}Deseret Docket</div>
  <h1>Track every bill. Never miss the moment that matters.</h1>
  <p class="lead">A shared workspace for following a state legislature: live bill data, hearing alerts, fiscal impact workflows and plain-English summaries, built for teams who have to know what's moving and act fast.</p>
  <div class="chips"><span>Live legislative data</span><span>Team assignments</span><span>Fiscal note routing</span><span>Email alerts</span></div></div>
 <div class="box">
  <div class="tabs" role="tablist"><button type="button" role="tab" id="tIn" aria-selected="${mode !== "signup"}" class="${mode !== "signup" ? "on" : ""}">Sign in</button><button type="button" role="tab" id="tUp" aria-selected="${mode === "signup"}" class="${mode === "signup" ? "on" : ""}">Create account</button></div>
  ${notice ? `<div class="ok" role="status">${esc(notice)}</div>` : ""}
  <form method="post" action="/login" id="fIn" ${mode === "signup" ? "hidden" : ""}>
   ${message && mode !== "signup" ? `<div class="msg" role="alert">${esc(message)}</div>` : ""}
   <input type="hidden" name="next" value="${esc(next)}">
   <label for="u">Username</label><input id="u" name="username" autocomplete="username" required ${disabled ? "disabled" : ""}>
   <label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required ${disabled ? "disabled" : ""}>
   <button class="go" type="submit" ${disabled ? "disabled" : ""}>Sign in</button>
  </form>
  <form method="post" action="/signup" id="fUp" ${mode === "signup" ? "" : "hidden"}>
   ${message && mode === "signup" ? `<div class="msg" role="alert">${esc(message)}</div>` : ""}
   <p class="muted" style="margin-top:10px">An admin reviews every request and sets what you can see and change. You'll be able to sign in once it's approved.</p>
   <div class="two"><div><label for="sf">First name</label><input id="sf" name="first" required maxlength="40" value="${esc(signup.first)}" autocomplete="given-name"></div>
   <div><label for="sl">Last name</label><input id="sl" name="last" required maxlength="40" value="${esc(signup.last)}" autocomplete="family-name"></div></div>
   <label for="se">Work email</label><input id="se" name="email" type="email" required maxlength="120" value="${esc(signup.email)}" autocomplete="email">
   <label for="ss">Section you work in</label><select id="ss" name="section" required><option value="">Choose your section…</option>${sectionOpts}<option value="other" ${sel("other")}>Other / not listed</option></select>
   <label for="su">Choose a username</label><input id="su" name="username" required pattern="[a-zA-Z0-9._\\-]{2,40}" maxlength="40" value="${esc(signup.username)}" autocomplete="username">
   <label for="sp">Choose a password (at least 10 characters)</label><input id="sp" name="password" type="password" required minlength="10" autocomplete="new-password">
   <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
   <button class="go" type="submit" ${disabled ? "disabled" : ""}>Request an account</button>
  </form>
  <a class="guest" href="/guest">Browse as a guest</a>
  <p class="muted" style="text-align:center;font-size:13px">Guests see public bill information only. Nothing a guest changes is saved.</p>
 </div>
</div></div>
<section class="feat"><div class="wrap">
 <h2>Everything your team needs during session</h2>
 <p>Deseret Docket pulls bills, hearings, votes, fiscal notes, recordings and budget figures from public sources, then adds your team's own layer on top: who owns each bill, what position you've taken and what's been said about it.</p>
 <div class="grid">${feats.map(([i, h, p]) => `<div class="tile">${ICON[i]}<h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join("")}</div>
 <div class="how">
  <div><b>1</b><h4>It watches</h4><p>New bills, substitutes, agendas and floor calendars are checked throughout every weekday.</p></div>
  <div><b>2</b><h4>You sort</h4><p>Assign bills to people and teams, take positions, and keep notes everyone can see.</p></div>
  <div><b>3</b><h4>It routes</h4><p>Fiscal questions go to the right experts by email; answers come back to one dashboard.</p></div>
  <div><b>4</b><h4>You act</h4><p>Show up prepared with one-page briefs, timely alerts and a clear view of where every bill stands.</p></div>
 </div>
</div></section>
<footer>Attorney Work Product / Attorney-Client Communication</footer>
<script>
const tIn=document.getElementById('tIn'),tUp=document.getElementById('tUp'),fIn=document.getElementById('fIn'),fUp=document.getElementById('fUp');
function show(up){fIn.hidden=up;fUp.hidden=!up;tIn.classList.toggle('on',!up);tUp.classList.toggle('on',up);tIn.setAttribute('aria-selected',!up);tUp.setAttribute('aria-selected',up);(up?document.getElementById('sf'):document.getElementById('u')).focus()}
tIn.onclick=()=>show(false);tUp.onclick=()=>show(true);
// Arrived from a link to a bill (e.g. in an email)? Keep it for after sign-in or guest browsing.
if(location.hash==='#signup')show(true);
else if(location.hash.length>1){document.querySelector('a.guest').href='/guest'+location.hash;const n=fIn.querySelector('[name=next]');if(n&&n.value==='/')n.value='/'+location.hash}
</script></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" } });
}
