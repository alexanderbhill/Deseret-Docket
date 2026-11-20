// The first page people see: what the site does (with small product previews), and sign in or ask for an account.
// Written to describe the product in general terms (nothing specific to one office).
import { BEE, BEE_CSS } from "./logo.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Small line illustrations for the feature tiles (drawn here so the page has no outside images).
const ICON = {
  track: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="9" width="34" height="30" rx="4"/><path d="M13 18h22M13 25h22M13 32h14"/><circle cx="36" cy="32" r="3" class="f"/></svg>`,
  bell: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 33V22a10 10 0 0 1 20 0v11l3 4H11z"/><path d="M20 40a4 4 0 0 0 8 0"/><circle cx="34" cy="13" r="4" class="f"/></svg>`,
  hive: `<svg viewBox="0 0 24 24" aria-hidden="true" style="stroke-width:1.5"><path d="M9.5 3.5h5a3.5 3.5 0 0 1 3.5 3.5H6a3.5 3.5 0 0 1 3.5-3.5zM5.5 7h13a1.75 1.75 0 0 1 0 3.5h-13a1.75 1.75 0 0 1 0-3.5zM4.5 10.5h15a1.75 1.75 0 0 1 0 3.5h-15a1.75 1.75 0 0 1 0-3.5zM5.5 14h13a1.75 1.75 0 0 1 0 3.5h-13a1.75 1.75 0 0 1 0-3.5zM7 17.5h10V21H7zM10.5 21v-1.5a1.5 1.5 0 0 1 3 0V21"/></svg>`,
  money: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="13" width="36" height="22" rx="3"/><circle cx="24" cy="24" r="5"/><path d="M11 18v12M37 18v12"/></svg>`,
  diff: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="8" width="15" height="32" rx="2"/><rect x="26" y="8" width="15" height="32" rx="2"/><path d="M11 15h7M11 21h7M30 15h7M30 21h7"/><path d="M30 27h7" class="g"/><path d="M11 27h7" class="r"/></svg>`,
  history: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="15"/><path d="M24 15v9l6 4"/><path d="M6 24h4M38 24h4"/></svg>`,
  people: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="17" cy="18" r="6"/><circle cx="33" cy="20" r="5"/><path d="M6 38c1-7 6-11 11-11s10 4 11 11M27 38c1-5 3-8 6-8s6 3 7 8"/></svg>`,
  pulse: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M5 26h9l4-10 6 20 5-14 3 4h11"/></svg>`,
  learn: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 18l18-8 18 8-18 8z"/><path d="M14 22v9c4 4 16 4 20 0v-9"/><path d="M42 18v10"/></svg>`,
  report: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="6" width="28" height="36" rx="3"/><path d="M16 32V24M22 32V18M28 32v-6M34 32V20"/></svg>`,
};


const sv = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const SV = {
  bell: sv("M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"), flag: sv("M5 21V4M5 4h11l-2 4 2 4H5"), prio: sv("M6 13l6-6 6 6M6 19l6-6 6 6"),
  impact: sv("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8v5M12 16.5v.01"), user: sv("M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6"),
  refresh: sv("M4 12a8 8 0 0 1 14-5l2 2M20 4v5h-5M20 12a8 8 0 0 1-14 5l-2-2M4 20v-5h5"), file: sv("M7 3h7l5 5v13H7zM14 3v5h5"),
  mic: sv("M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3"), clock: sv("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2"),
  list: sv("M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"), cal: sv("M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"),
  diff: sv("M5 4h6v6H5zM13 14h6v6h-6zM8 10v4a3 3 0 0 0 3 3h2M16 14v-4a3 3 0 0 0-3-3h-2"), hive: sv("M9.5 3.5h5a3.5 3.5 0 0 1 3.5 3.5H6a3.5 3.5 0 0 1 3.5-3.5zM5.5 7h13a1.75 1.75 0 0 1 0 3.5h-13a1.75 1.75 0 0 1 0-3.5zM4.5 10.5h15a1.75 1.75 0 0 1 0 3.5h-15a1.75 1.75 0 0 1 0-3.5zM5.5 14h13a1.75 1.75 0 0 1 0 3.5h-13a1.75 1.75 0 0 1 0-3.5zM7 17.5h10V21H7zM10.5 21v-1.5a1.5 1.5 0 0 1 3 0V21"),
  book: sv("M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM19 19v2H6"),
};

export function landingPage({ message = "", status = 200, next = "/", disabled = false, sections = [], mode = "signin", signup = {}, notice = "", invite = "" } = {}) {
  const sel = (v) => (signup.section === v ? "selected" : "");
  const groups = {};
  for (const s of sections) (groups[s.group] = groups[s.group] || []).push(s);
  const sectionOpts = Object.entries(groups).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((s) => `<option value="${esc(s.id)}" ${sel(s.id)}>${esc(s.name)}</option>`).join("")}</optgroup>`).join("");
  const feats = [
    ["track", "Every bill, one table", "Numbered bills and bill files, refreshed from the Legislature four times each weekday. Filter, sort, assign and export."],
    ["bell", "Alerts that matter", "New hearings, substitutes and floor moves in a morning email or on the Updates page, so nothing slips by."],
    ["hive", "Fiscal Hive", "Route each bill to the right division in a keystroke, collect cost estimates by email, flag anything over threshold."],
    ["diff", "What changed", "Struck and added text for every substitute, with a short summary and a flag when it touches code you watch."],
    ["history", "Has this bill run before?", "Earlier versions, who carried them, how far they got, where they stopped, and every roll-call vote."],
    ["people", "Know the players", "Every legislator with a photo, committees, the bills they're carrying and how their votes line up with yours."],
    ["pulse", "Hearings and recordings", "Committee agendas, transcripts of what was said, and a heads-up whenever the Attorney General comes up."],
    ["learn", "Learn the Legislature", "Games and visual guides that teach new staff and interns the members and the process in an afternoon."],
    ["report", "Budget and wrap-up", "The state budget by committee, fiscal notes in context, and an end-of-session scorecard."],
  ];
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Deseret Docket · Legislative tracking for teams</title><meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap" rel="stylesheet">
<style>
:root{--cream:#fffdf2;--navy:#002147;--navy2:#0b3366;--steel:#3c5a78;--ink:#26323d;--muted:#5b6672;--gold:#e9d8a6;--honey:#e3a52a;--blue:#c0deea;--row:#ebf4f8;--line:#dbe3ea;--field:#a8b7c6;--maroon:#78081c;--green:#2f6f3a;--bee-ink:#2a2418;--wing:#eef3f7;--wing-line:#9aa8b4}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:16px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
a{color:var(--steel)}:focus-visible{outline:2px solid var(--honey);outline-offset:2px}
.wrap{max-width:1180px;margin:0 auto;padding:0 22px}
.top{background:radial-gradient(1200px 500px at 85% -10%,#12427a 0,transparent 60%),var(--navy);color:#fff;border-bottom:4px solid var(--gold);position:relative;overflow:hidden}
.top:after{content:"";position:absolute;right:-120px;bottom:-160px;width:520px;height:520px;background:repeating-conic-gradient(from 30deg,rgba(233,216,166,.05) 0 60deg,transparent 60deg 120deg);clip-path:polygon(25% 6%,75% 6%,100% 50%,75% 94%,25% 94%,0 50%);pointer-events:none}
.hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,420px);gap:52px;align-items:start;padding:34px 0 60px;position:relative;z-index:1}
.brand{display:flex;align-items:center;gap:12px;font:500 28px "Source Serif 4",Georgia,serif}
.brand svg{width:44px;height:44px;background:var(--gold);border-radius:50%;padding:4px}${BEE_CSS}
.eyebrow{display:inline-flex;align-items:center;gap:8px;margin:30px 0 0;color:var(--gold);font-size:14px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.eyebrow i{width:8px;height:8px;border-radius:50%;background:#7bd389;box-shadow:0 0 0 4px rgba(123,211,137,.2)}
.hero h1{font:500 46px/1.1 "Source Serif 4",Georgia,serif;margin:12px 0 14px;letter-spacing:-.01em}
.hero h1 em{font-style:normal;color:var(--gold)}
.hero p.lead{font-size:19px;color:#d9e2ea;max-width:580px;margin:0 0 26px}
/* product preview */
.pv{background:#fff;color:var(--ink);border-radius:14px;box-shadow:0 22px 60px rgba(0,0,0,.35);padding:18px 18px 16px;max-width:640px;position:relative}
.pv .bar{display:flex;gap:6px;margin:-4px 0 12px}.pv .bar i{width:9px;height:9px;border-radius:50%;background:var(--line)}
.pv .no{font-size:12.5px;font-weight:700;color:var(--steel)}.pv h3{font:500 21px/1.25 "Source Serif 4",Georgia,serif;color:var(--navy);margin:2px 0 10px}
.prog{display:flex;margin:0 0 12px;overflow:hidden}.prog span{flex:1;height:30px;display:grid;place-items:center;font-size:11.5px;font-weight:600;color:var(--muted);background:#eef2f5;clip-path:polygon(0 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,0 100%,10px 50%);margin-left:-4px;white-space:nowrap;padding:0 8px 0 14px}
.prog span:first-child{clip-path:polygon(0 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,0 100%);margin:0;border-radius:6px 0 0 6px;padding-left:8px}
.prog .d{background:#dcecf3;color:var(--navy)}.prog .h{background:var(--gold);color:var(--navy)}
.gl{display:flex;gap:8px;flex-wrap:wrap}.gl>span{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);border-left:3px solid var(--c);border-radius:8px;padding:5px 10px;font-size:13px;font-weight:600}
.gl small{display:block;font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.gl svg,.ico{width:17px;height:17px;fill:none;stroke:var(--c,var(--navy));stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex:none}
.toast{position:absolute;right:-26px;top:-22px;background:var(--navy2);color:#fff;border:1px solid rgba(233,216,166,.5);border-radius:12px;padding:10px 14px;font-size:13px;box-shadow:0 12px 30px rgba(0,0,0,.35);display:flex;gap:10px;align-items:center;max-width:270px;animation:pop .6s .4s both}
.toast b{color:var(--gold)}.toast svg{width:22px;height:22px;fill:none;stroke:var(--gold);stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex:none}
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}
/* sign-in box */
.box{background:#fff;color:var(--ink);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.28);padding:24px 24px 20px;margin-top:22px}
.tabs{display:flex;border:1px solid var(--field);border-radius:8px;overflow:hidden;margin-bottom:6px}
.tabs button{flex:1;border:0;background:#fff;padding:9px;font:600 15px inherit;color:var(--muted);cursor:pointer}
.tabs button.on{background:var(--navy);color:#fff}
label{display:block;font-weight:600;font-size:14px;margin:12px 0 5px}
input,select{width:100%;padding:10px 12px;border:1px solid var(--field);border-radius:7px;background:#fff;color:var(--ink);font:inherit;min-height:42px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
button.go{margin-top:18px;width:100%;padding:11px;border:0;border-radius:7px;background:var(--navy);color:#fff;font:600 16px inherit;cursor:pointer}
button.go:hover{background:var(--navy2)}
.msg{background:#f9ecee;color:var(--maroon);border-radius:7px;padding:9px 12px;font-size:14px;margin-top:12px}
.ok{background:#ecf4ec;color:var(--green);border-radius:7px;padding:9px 12px;font-size:14px;margin-top:12px}
.muted{color:var(--muted);font-size:14px;margin:0}.guest{display:block;text-align:center;margin-top:14px;font-size:15px;font-weight:600}
.hp{position:absolute;left:-9999px}
/* stats strip */
.stats{display:grid;grid-template-columns:repeat(4,1fr);background:#fff;border:1px solid var(--line);border-radius:14px;margin:-34px auto 0;position:relative;z-index:2;box-shadow:0 10px 30px rgba(0,33,71,.08)}
.stats div{padding:18px 20px;border-right:1px solid var(--line);display:flex;gap:12px;align-items:center}.stats div:last-child{border:0}
.stats svg{width:30px;height:30px;fill:none;stroke:var(--steel);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.stats b{display:block;font:600 22px "Source Serif 4",Georgia,serif;color:var(--navy);line-height:1.1}.stats span{font-size:13.5px;color:var(--muted)}
/* showcase rows */
section{padding:64px 0 10px}
section h2{font:500 34px/1.15 "Source Serif 4",Georgia,serif;color:var(--navy);margin:0 0 8px}
.sub{color:var(--muted);max-width:700px;margin:0 0 30px;font-size:17.5px}
.row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center;margin:0 0 56px}
.row.flip .txt{order:2}
.txt .k{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--steel)}
.txt .k svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.txt h3{font:500 27px/1.2 "Source Serif 4",Georgia,serif;color:var(--navy);margin:6px 0 10px}
.txt p{margin:0 0 12px;font-size:16.5px}
.txt ul{list-style:none;padding:0;margin:0}.txt li{display:flex;gap:9px;margin:6px 0;font-size:15.5px}
.txt li:before{content:"";flex:none;width:18px;height:18px;margin-top:2px;border-radius:50%;background:var(--gold) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23002147' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 12l4 4 8-8'/%3E%3C/svg%3E") center/12px no-repeat}
.mock{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 14px 40px rgba(0,33,71,.10);padding:16px;font-size:13.5px}
.tbl{width:100%;border-collapse:collapse}.tbl th{background:var(--navy);color:#fff;text-align:left;font-size:12px;padding:8px 10px}.tbl th:first-child{border-radius:7px 0 0 0}.tbl th:last-child{border-radius:0 7px 0 0}
.tbl td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}.tbl tr:nth-child(even) td{background:var(--row)}
.tbl .n{font-weight:700;color:var(--steel)}.mini{display:flex;gap:2px;width:84px;margin-bottom:3px}.mini i{flex:1;height:5px;border-radius:2px;background:var(--line)}.mini i.o{background:var(--steel)}.mini i.x{background:var(--maroon)}
.pill{display:inline-block;border:1px solid var(--c);color:var(--c);border-radius:999px;padding:0 8px;font-size:11.5px;font-weight:600}
.mail{border:1px solid var(--line);border-radius:10px;overflow:hidden}.mail .mh{background:var(--row);padding:10px 12px;font-size:12.5px;color:var(--muted)}.mail .mh b{color:var(--ink)}
.mail .it{display:flex;gap:10px;padding:10px 12px;border-top:1px solid var(--line);align-items:flex-start}.mail .it svg{width:20px;height:20px;fill:none;stroke:var(--c);stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex:none;margin-top:1px}
.hive{border-top:4px solid var(--navy);border-radius:10px;border:1px solid var(--line);padding:14px}.hive .ai{background:var(--row);border-left:4px solid var(--maroon);border-radius:8px;padding:8px 10px;margin:10px 0}
.chipx{display:inline-flex;gap:6px;align-items:center;background:#f3f6f8;border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:12.5px;margin:0 6px 6px 0}.chipx i{width:7px;height:7px;border-radius:50%;background:var(--steel)}
.btns{display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--line);padding-top:10px;margin-top:8px}.btns span{border:1px solid var(--field);border-radius:7px;padding:6px 11px;font-size:12.5px;font-weight:600}.btns .p{background:var(--navy);color:#fff;border-color:var(--navy)}
.faces{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:10px}.faces span{aspect-ratio:1;border-radius:50%;display:grid;place-items:center;font:600 20px "Source Serif 4",Georgia,serif;color:var(--navy);background:linear-gradient(160deg,#dfe8ef,#c6d4df);border:3px solid #fff;box-shadow:0 0 0 2px var(--line)}
.faces span.r{box-shadow:0 0 0 3px var(--green)}
.q{background:var(--row);border-left:4px solid var(--gold);border-radius:8px;padding:10px 12px;font:500 15.5px/1.4 "Source Serif 4",Georgia,serif;color:var(--navy)}
/* all features */
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.tile{display:flex;gap:14px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px}
.tile svg{width:40px;height:40px;flex:none;fill:none;stroke:var(--navy);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;background:#f6efd9;border-radius:10px;padding:6px}
.tile svg .f{fill:var(--gold);stroke:var(--navy)}.tile svg .g{stroke:var(--green)}.tile svg .r{stroke:var(--maroon)}
.tile h3{margin:0 0 3px;color:var(--navy);font-size:16.5px}.tile p{margin:0;color:var(--ink);font-size:14.5px}
.cta{margin:56px 0 0;background:var(--navy);color:#fff;border-radius:16px;padding:30px 34px;display:flex;gap:20px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.cta h3{font:500 26px "Source Serif 4",Georgia,serif;margin:0}.cta p{margin:4px 0 0;color:#d9e2ea}
.cta a{background:var(--gold);color:var(--navy);text-decoration:none;font-weight:700;border-radius:8px;padding:11px 18px}
footer{text-align:center;color:#8a929b;font-size:11.5px;letter-spacing:.03em;padding:40px 20px 30px}
@media (max-width:960px){.hero{grid-template-columns:minmax(0,1fr);gap:10px}.hero>*{min-width:0}.pv{max-width:100%}.prog span:nth-child(n+5){display:none}.hero h1{font-size:35px}.toast{display:none}.row{grid-template-columns:minmax(0,1fr);gap:20px}.row.flip .txt{order:0}.grid{grid-template-columns:1fr}.stats{grid-template-columns:1fr 1fr}.stats div:nth-child(2){border-right:0}.stats div{border-bottom:1px solid var(--line)}}
</style></head><body>
<div class="top"><div class="wrap hero">
 <div><div class="brand">${BEE}Deseret Docket</div>
  <div class="eyebrow"><i></i>Live from the Utah Legislature</div>
  <h1>Every Utah bill, and <em>what your team is doing about it</em>, in one place.</h1>
  <p class="lead">Deseret Docket watches the Legislature for you. See where each bill stands, get alerted when it moves, send cost questions to the right people, and walk into every hearing prepared.</p>
  <div class="pv" aria-hidden="true">
   <div class="toast">${SV.bell}<div><b>New hearing</b><br>H.B. 104 added to House Judiciary, Tue 8:00 a.m.</div></div>
   <div class="bar"><i></i><i></i><i></i></div>
   <div class="no">H.B. 104 · Substitute 2</div><h3>Victim Notification Amendments</h3>
   <div class="prog"><span class="d">Introduced</span><span class="d">Committee</span><span class="h">Passed House</span><span>Senate</span><span>Governor</span><span>Law</span></div>
   <div class="gl"><span style="--c:#2f6f3a">${SV.flag}<span><small>Stance</small>Support</span></span><span style="--c:#9a6b00">${SV.prio}<span><small>Priority</small>High</span></span><span style="--c:#78081c">${SV.impact}<span><small>Fiscal impact</small>$48K</span></span><span style="--c:#3c5a78">${SV.user}<span><small>Assigned</small>2 people</span></span></div>
  </div></div>
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
   ${invite ? `<input type="hidden" name="invite" value="${esc(invite)}">` : `<p class="muted" style="margin-top:10px">An admin reviews every request and sets what you can see and change. You'll be able to sign in once it's approved.</p>`}
   <div class="two"><div><label for="sf">First name</label><input id="sf" name="first" required maxlength="40" value="${esc(signup.first)}" autocomplete="given-name"></div>
   <div><label for="sl">Last name</label><input id="sl" name="last" required maxlength="40" value="${esc(signup.last)}" autocomplete="family-name"></div></div>
   <label for="se">Work email</label><input id="se" name="email" type="email" required maxlength="120" value="${esc(signup.email)}" autocomplete="email" ${invite ? "readonly" : ""}>
   ${invite ? `<input type="hidden" name="section" value="${esc(signup.section || "other")}">` : `<label for="ss">Section you work in</label><select id="ss" name="section" required><option value="">Choose your section…</option>${sectionOpts}<option value="other" ${sel("other")}>Other / not listed</option></select>`}
   <label for="su">Choose a username</label><input id="su" name="username" required pattern="[a-zA-Z0-9._\\-]{2,40}" maxlength="40" value="${esc(signup.username)}" autocomplete="username">
   <label for="sp">Choose a password (at least 10 characters)</label><input id="sp" name="password" type="password" required minlength="10" autocomplete="new-password">
   <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
   <button class="go" type="submit" ${disabled ? "disabled" : ""}>${invite ? "Create my account" : "Request an account"}</button>
  </form>
  <a class="guest" href="/guest">Browse as a guest →</a>
  <p class="muted" style="text-align:center;font-size:13px">Guests see public bill information only. Nothing a guest changes is saved.</p>
 </div>
</div></div>
<div class="wrap"><div class="stats">
 <div>${SV.refresh}<p style="margin:0"><b>4× a day</b><span>Fresh data every weekday</span></p></div>
 <div>${SV.file}<p style="margin:0"><b>Every bill</b><span>Numbered bills and bill files</span></p></div>
 <div>${SV.mic}<p style="margin:0"><b>Every hearing</b><span>Agendas, recordings, transcripts</span></p></div>
 <div>${SV.clock}<p style="margin:0"><b>45 days</b><span>Countdown to sine die</span></p></div>
</div></div>
<section><div class="wrap">
 <h2>Built for the 45-day sprint</h2>
 <p class="sub">The Legislature moves fast. Deseret Docket pulls in the public record and adds your team's layer on top: who owns each bill, the position you've taken, and what's been said.</p>
 <div class="row"><div class="txt"><span class="k">${SV.list}Track</span><h3>See every bill and how far it's gotten</h3><p>One table with every bill and bill file. A progress bar shows where each one stands at a glance.</p>
   <ul><li>Assign bills to people, divisions and departments</li><li>Take positions and keep shared notes</li><li>Filter, rearrange columns and download to Excel</li></ul></div>
  <div class="mock" aria-hidden="true"><table class="tbl"><tr><th>Bill</th><th>Title</th><th>Progress</th><th>Stance</th></tr>
   <tr><td class="n">HB 12</td><td>Data Privacy Amendments</td><td><div class="mini"><i class="o"></i><i class="o"></i><i class="o"></i><i class="o"></i><i></i><i></i><i></i></div><span style="font-size:11.5px;color:#5b6672">Passed Senate</span></td><td><span class="pill" style="--c:#2f6f3a">Support</span></td></tr>
   <tr><td class="n">SB 40</td><td>Court Fee Modifications</td><td><div class="mini"><i class="o"></i><i class="o"></i><i></i><i></i><i></i><i></i><i></i></div><span style="font-size:11.5px;color:#5b6672">In committee</span></td><td><span class="pill" style="--c:#78081c">Oppose</span></td></tr>
   <tr><td class="n">HB 77</td><td>Consumer Protection Changes</td><td><div class="mini"><i class="o"></i><i class="o"></i><i class="x"></i><i></i><i></i><i></i><i></i></div><span style="font-size:11.5px;color:#5b6672">Stopped</span></td><td><span class="pill" style="--c:#5b6672">Neutral</span></td></tr></table></div></div>
 <div class="row flip"><div class="txt"><span class="k">${SV.bell}Stay ahead</span><h3>Know the moment a bill moves</h3><p>A morning calendar, a day-before heads-up and an end-of-day recap, sent when you want them.</p>
   <ul><li>New hearings and agenda changes</li><li>New substitutes, with what changed in plain English</li><li>Bills circled, uncircled or sent back to Rules</li></ul></div>
  <div class="mock" aria-hidden="true"><div class="mail"><div class="mh"><b>Deseret Docket</b> · Morning calendar · 7:00 a.m.</div>
   <div class="it" style="--c:#3c5a78">${SV.cal}<div><b>3 hearings today</b><br><span style="color:#5b6672">HB 12 at 8:00 in House Judiciary, Room 20</span></div></div>
   <div class="it" style="--c:#9a6b00">${SV.diff}<div><b>New substitute: SB 40 2nd Sub.</b><br><span style="color:#5b6672">Lowers the fee increase from $25 to $10</span></div></div>
   <div class="it" style="--c:#78081c">${SV.list}<div><b>HB 77 was circled</b><br><span style="color:#5b6672">Senate 3rd reading calendar</span></div></div></div></div></div>
 <div class="row"><div class="txt"><span class="k">${SV.hive}Fiscal Hive</span><h3>Get cost estimates without the email chain</h3><p>Every new bill and substitute lands in an inbox. Confirm the divisions and press Enter. Divisions answer from a one-click email.</p>
   <ul><li>Suggested divisions from the bill text</li><li>Automatic reminders after 24 hours</li><li>Anything over your threshold flagged for Appropriations</li></ul></div>
  <div class="mock" aria-hidden="true"><div class="hive"><div class="no" style="font-size:12px;font-weight:700;color:#3c5a78">SB 40 · 2nd Substitute</div><b style="font:500 18px 'Source Serif 4',Georgia,serif;color:#002147">Court Fee Modifications</b>
   <div class="ai"><b style="color:#78081c">Likely impact</b> · The fiscal note shows a cost of $120,000 to state funds.</div>
   <span class="chipx"><i></i>Courts</span><span class="chipx"><i></i>Criminal Appeals</span>
   <div class="btns"><span>Skip →</span><span>No request needed</span><span class="p">Queue for 2 divisions</span></div></div></div></div>
 <div class="row flip"><div class="txt"><span class="k">${SV.book}Learn</span><h3>Get new staff up to speed in an afternoon</h3><p>Games that teach the faces, the process and the vocabulary, with a leaderboard for the office.</p>
   <ul><li>Face match, Red or blue? and Who said it?</li><li>An illustrated walk through how a bill becomes law</li><li>Capitol quirks: Jell-O, the state dinosaur and more</li></ul></div>
  <div class="mock" aria-hidden="true"><div class="q">“This bill updates the Utah Navajo Trust Fund statute to align with statewide investment rules.”</div><div style="font-size:12px;color:#5b6672;margin-top:6px">Who said it?</div>
   <div class="faces"><span>A</span><span class="r">B</span><span>C</span><span>D</span></div></div></div>
 <h2 style="margin-top:20px">Everything else inside</h2><p class="sub">A few more of the tools your team gets.</p>
 <div class="grid">${feats.map(([i, h, p]) => `<div class="tile">${ICON[i]}<div><h3>${esc(h)}</h3><p>${esc(p)}</p></div></div>`).join("")}</div>
 <div class="cta"><div><h3>Ready for session?</h3><p>Sign in, ask for an account, or look around as a guest.</p></div><a href="#top" onclick="window.scrollTo({top:0,behavior:'smooth'});document.getElementById('u').focus();return false">Sign in or create an account</a></div>
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
