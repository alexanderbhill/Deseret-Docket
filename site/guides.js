/* Learn → How a bill becomes law: where ideas come from, the staff who draft and price bills, every step
   of the journey (House and Senate lanes), fiscal notes, and how the budget gets built in committees. */
'use strict';
const IDEAS=[
 ['🙋','A constituent','Someone in the district calls, emails or stops the legislator at the grocery store about a problem. Many bills start this way.'],
 ['🔎','A legislative audit','The Office of the Legislative Auditor General (OLAG) studies how a program is working. When an audit finds a gap, its recommendations often turn into next session’s bills.'],
 ['🏛️','An interim committee','Between sessions, committees study issues and can vote to sponsor a “committee bill” that arrives ready for the session.'],
 ['🏢','A state agency or elected office','Agencies, the governor and the Attorney General’s office ask legislators to fix laws they enforce: a loophole, an outdated penalty, a missing tool.'],
 ['🤝','An association or advocate','Business groups, cities and counties, nonprofits and lobbyists bring proposals, sometimes with draft language.'],
 ['📘','A model bill','National groups publish ready-made bills: the Uniform Law Commission (uniform acts states adopt word for word), ALEC, and others across the spectrum.'],
 ['🗺️','Another state','A law that worked (or backfired) somewhere else. Staff can pull how other states handled the same question.'],
 ['⚖️','A court decision','A court strikes down or reinterprets a law, and the Legislature responds with a new version.'],
 ['📰','The news','A story, a tragedy or a scandal puts an issue on everyone’s list at once.'],
 ['🔁','Last year’s bill','A bill that ran out of time or failed comes back, often rewritten to answer the objections.']];
const STAFF=[
 ['📝','Legislative Research and General Counsel','OLRGC','Nonpartisan policy analysts and attorneys. They research the idea, draft every bill in proper legal form, flag constitutional problems, write the summary, catch conflicts with other bills (coordination clauses), and staff the standing and interim committees. Drafts stay confidential until the sponsor makes them public.',['Bill drafts','Legal reviews','Committee staff']],
 ['💵','Legislative Fiscal Analyst','LFA','The Legislature’s budget office. Analysts write a fiscal note for every bill: what it would cost or save the state, local governments, and people and businesses. They staff the appropriations subcommittees and help build the budget and the revenue estimates.',['Fiscal notes','Budget recommendations','Revenue estimates']],
 ['🔎','Legislative Auditor General','OLAG','Performance auditors who check whether state programs work and spend money well. Their reports go to the Legislative Audit Subcommittee and often start bills.',['Audits','Recommendations']]];
// [step, what happens, who's in the room, lane: H, S, both, gov]
const JOURNEY=[
 ['Bill file opened','A legislator asks OLRGC to draft a bill. Only the short title and sponsor are public at first.','Sponsor · OLRGC attorney','both'],
 ['Drafted and priced','The attorney drafts it; the sponsor approves it. The fiscal analyst asks the agencies it affects for estimates and writes the fiscal note.','OLRGC · LFA · agencies','both'],
 ['Numbered and introduced','It gets a number (H.B. 12, S.B. 3) and a first reading on the floor of the house where it started.','Reading clerk','H'],
 ['Rules Committee','Rules decides which standing committee hears it. Some bills sit in Rules a long time, or never leave.','Rules Committee','H'],
 ['Standing committee','The sponsor presents, the public testifies and the committee votes: favorable, held, amended or substituted. A bill can also go to the consent calendar.','Committee · public · lobbyists','H'],
 ['Second reading','Back on the floor. In the Senate, bills are debated and voted on at second reading too.','Full chamber','H'],
 ['Third reading and final vote','The final debate and vote. A bill can be circled (put on hold) and uncircled later.','Full chamber','H'],
 ['The other house','The whole path repeats: Rules, committee, second and third readings.','Other chamber','S'],
 ['Concurrence','If the second house changed it, the first house votes to accept (concur). If they can’t agree, a conference committee works it out.','Both chambers','both'],
 ['Enrolled','OLRGC prepares the final text; the Speaker and Senate President sign it.','OLRGC · presiding officers','both'],
 ['Governor','The governor has 20 days after the session ends to sign or veto. Bills not acted on become law without a signature. Appropriations can be vetoed line by line.','Governor','gov'],
 ['In effect','Most bills take effect 60 days after the session ends, in early May. Some take effect on signing or on a date the bill sets.','Everyone','gov']];
const DIE=[['🗂️','Stuck in Rules','Every numbered bill goes to the House or Senate Rules Committee first. Rules decides which standing committee hears it, or whether it goes anywhere at all. A bill Rules never assigns never gets a hearing and dies there when the session ends.'],
 ['✋','Held in committee','A standing committee can hold a bill (often at the sponsor’s request, to fix it), vote it down, or simply never put it on an agenda. A held bill only moves again if the committee brings it back.'],
 ['⭕','Circled and never uncircled','On the floor, a bill on the 2nd or 3rd reading calendar can be “circled”: set aside so the sponsor can count votes, line up an amendment or wait for money. If nobody uncircles it before sine die, it dies on the calendar.'],
 ['💸','Fiscal note never funded','A bill that costs money usually needs the Executive Appropriations Committee to set money aside for it near the end of the session. If the money never comes, the bill typically sits on the calendar until time runs out.'],
 ['⏰','Out of time at sine die','The session ends at midnight on the 45th day. Anything that hasn’t passed both chambers in the same form by then is dead. Nothing carries over to next year; it has to be filed again.'],
 ['🚫','Vetoed','After the session the governor has 20 days to sign or veto. A vetoed bill is dead unless two-thirds of both the House and the Senate vote to override it, usually in a veto override session.']];

function guideProcess(){
  if(BUDGET===null){BUDGET=undefined;getJSON('data/budget.json').then(b=>{BUDGET=b;if(location.hash==='#learn-process')route(true)}).catch(()=>{BUDGET={error:true}})}
  const lane=k=>k==='H'?'First house':k==='S'?'Second house':k==='gov'?'Governor':'Both';
  return `<div class="card guide"><h2>How a bill becomes law in Utah</h2>
   <p class="desc">The general session runs 45 days, from late January to midnight on sine die in early March. Most of the work happens before it starts. Tap anything to read more.</p>
   <a class="guide-video" href="https://www.youtube.com/watch?v=MMEweniYYDY" target="_blank" rel="noopener"><span class="gv-thumb"><img src="https://img.youtube.com/vi/MMEweniYYDY/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()"><span class="gv-play" aria-hidden="true">▶</span></span><span class="gv-txt"><span class="kicker">Watch first</span><b>How a bill becomes law (video)</b><span class="small muted">Opens on YouTube</span></span></a>
   <nav class="guide-toc">${[['g-ideas','💡 Ideas'],['g-staff','🧑‍💼 Staff'],['g-path','🛤️ The path'],['g-fn','💵 Fiscal notes'],['g-budget','🏦 The budget'],['g-die','🪦 Where bills die']].map(([i,l])=>`<a href="#learn-process" data-gto="${i}">${l}</a>`).join('')}</nav></div>

  <div class="card guide" id="g-ideas"><h2>1. Where bill ideas come from</h2><p class="desc">Anyone can bring a legislator an idea, but only a legislator can open a bill file. <b>Click any card</b> to see how that kind of idea becomes a bill.</p>
   <div class="idea-grid">${IDEAS.map(([i,t,d])=>`<details class="idea"><summary title="Click to read more"><span class="ico">${i}</span><b>${esc(t)}</b><span class="idea-more" aria-hidden="true">▾</span></summary><p>${esc(d)}</p></details>`).join('')}</div>
   <p class="small muted" style="margin-top:12px">On every bill page, <b>Has this bill run before?</b> and the out-of-state lookalike check show when an idea came from an earlier session or another state.</p></div>

  <div class="card guide" id="g-staff"><h2>2. The staff behind every bill</h2><p class="desc">Three nonpartisan offices serve all 104 legislators, whatever their party.</p>
   <div class="staff-grid">${STAFF.map(([i,n,a,d,out])=>`<div class="staff"><div class="staff-hd"><span class="ico">${i}</span><div><b>${esc(n)}</b><span class="tiny muted">${a}</span></div></div><p class="small">${esc(d)}</p><div class="staff-out">${out.map(o=>`<span class="chip">${esc(o)}</span>`).join('')}</div></div>`).join('')}</div></div>

  <div class="card guide" id="g-path"><h2>3. The path, step by step</h2><p class="desc">Read down: the first house, the second house, then the governor. Tap a step for who’s involved.</p>
   <div class="lanes"><span class="lane-k h">First house</span><span class="lane-k s">Second house</span><span class="lane-k g">Governor</span></div>
   <ol class="journey">${JOURNEY.map(([t,d,who,k],i)=>`<li class="j-${k}"><details ${i===0?'open':''}><summary><span class="fnum">${i+1}</span><b>${esc(t)}</b><span class="tiny muted j-lane">${lane(k)}</span></summary><p>${esc(d)}</p><p class="tiny"><b>In the room:</b> ${esc(who)}</p></details></li>`).join('')}</ol>
   <div class="cal-strip">${[['May–Dec','Interim: studies, audits, bill requests',1.7],['Late Jan','Session opens',.5],['45 days','Committees and floor votes',2],['Early Mar','Sine die',.5],['+20 days','Governor acts',.7],['Early May','Most laws take effect',.7]].map(([w,t,f])=>`<div style="flex:${f}"><b>${w}</b><span>${t}</span></div>`).join('')}</div></div>

  <div class="card guide" id="g-fn"><h2>4. Fiscal notes: what a bill costs</h2>
   <div class="flowline">${[['📝','Bill drafted'],['💵','Fiscal analyst assigned'],['🏢','Agencies estimate the cost (the AG’s office answers through Fiscal Hive)'],['📄','Fiscal note posted with the bill'],['🏦','If it costs money, it needs funding in the budget']].map(([i,t])=>`<div><span class="ico">${i}</span><span>${esc(t)}</span></div>`).join('<span class="arr" aria-hidden="true">→</span>')}</div>
   <p class="small" style="margin-top:12px">A bill that costs money usually can’t pass until the Executive Appropriations Committee sets money aside for it near the end of the session. Unfunded bills often stall on the calendar and die at sine die, even after passing committee. A new substitute gets a new fiscal note, because changes can change the cost.</p></div>

  ${budgetGuide()}

  <div class="card guide" id="g-die"><h2>6. Where bills quietly die</h2><p class="desc">Hover over (or tap) each one to see how it happens.</p><div class="die-grid">${DIE.map(([i,t,d])=>`<div tabindex="0" data-full="${esc(d)}"><span class="ico">${i}</span><span class="die-t">${esc(t)}</span><span class="die-i" aria-hidden="true">ⓘ</span></div>`).join('')}</div>
   <p class="small muted" style="margin-top:10px">Most bills don’t pass. On the Bills tab, the progress bar on each bill shows how far it got.</p></div>`;
}
const guideBudget={};
function budgetGuide(){
  const B=BUDGET&&BUDGET.subs?BUDGET:null, col=B&&B.subs[0]?B.subs[0].v.length-1:6;
  const subs=B?B.subs.filter(r=>!/executive/i.test(r.t)).map(r=>({t:r.t,v:r.v[col]||0})).sort((a,b)=>b.v-a.v):[];
  const tot=subs.reduce((s,x)=>s+x.v,0);
  const base=Object.values(BILLS).flat().filter(b=>/\bBase Budget\b/.test(b.title||'')).sort((a,b)=>b.session.localeCompare(a.session)||a.num.localeCompare(b.num));
  const baseS=base.length?base[0].session:'';
  if(!base.length){const sid=INDEX.sessions.find(x=>x.count>0&&!BILLS[x.id]);if(sid&&!guideBudget.loading){guideBudget.loading=1;loadSession(sid.id).then(()=>{if(location.hash==='#learn-process')route(true)})}}
  return `<div class="card guide" id="g-budget"><h2>5. How the budget gets built</h2>
   <p class="desc">The budget is the one bill the Legislature has to pass. Utah’s fiscal year runs July 1 to June 30, the constitution requires a balanced budget, and income tax is set aside for education and for programs serving children and people with disabilities.</p>
   <div class="bud-flow">${[['📈','Revenue estimates','The fiscal analyst and the governor’s budget office agree on how much money there will be (December, updated in February).'],
     ['🏛️','Governor’s proposal','The governor releases a recommended budget in December. Legislators aren’t bound by it.'],
     ['🧱','Base budgets','In the first weeks of session the Legislature passes base budget bills, roughly last year’s budget, so government keeps running whatever happens later.'],
     ['🧩','Subcommittees','Eight appropriations subcommittees review their agencies, hear legislators’ requests for appropriation, and rank what they’d fund.'],
     ['🎯','Executive Appropriations','Legislative leadership sets how much each subcommittee gets, weighs the ranked lists, and decides which bills with fiscal notes get funded.'],
     ['📦','Final bills','In the last days, the big appropriations acts pass, including the “bill of bills” that funds individual bills.'],
     ['✒️','Governor','Signs the budget, and can veto individual line items.']].map(([i,t,d],n)=>`<details class="bstep"><summary><span class="fnum">${n+1}</span><span class="ico">${i}</span><b>${esc(t)}</b></summary><p class="small">${esc(d)}</p></details>`).join('')}</div>
   <h3 style="margin-top:22px">How it’s divided: the appropriations subcommittees</h3>
   <p class="small muted">${B?`Sized by each one’s share of the budget (COBI, ${esc(((B.header||[])[col]||'').replace(/^(\d{4}) Base Start$/,'FY$1 base'))}). Hover a name for its chairs; click a tile for its budget.`:'Loading the budget…'}</p>
   ${subs.length?`<div class="treemap">${subs.map((x,i)=>`<a href="#budget" data-budgo="${esc(x.t)}" style="flex-grow:${Math.max(1,Math.round(x.v/tot*100))};--c:${PAL[i%PAL.length]}"><span class="tm-n">${comInfo(x.t)}</span><b>${money(x.v,true)}</b><span class="tiny">${(x.v/tot*100).toFixed(0)}%</span></a>`).join('')}</div>`:''}
   <p class="small" style="margin-top:10px">Above them sits the <b>${comInfo('Executive Appropriations Committee')}</b>, the leaders of both chambers, who make the final calls.</p>
   ${base.length?`<p class="small"><b>${esc(sessName(baseS))} base budget bills:</b> ${base.filter(b=>b.session===baseS).map(b=>`<a class="billnum" href="${billHref(b)}" data-full="${esc(b.title)}">${esc(shortNum(b.num))}</a>`).join(' ')} <span class="muted">· each bill page shows a pie of where its money goes.</span></p>`:''}
   <p class="small muted">See <a href="#budget">the Budget tab</a> for this year’s numbers, legislators’ requests and what’s being said in appropriations meetings.</p></div>`;
}
function guideBind(){
  if(location.hash!=='#learn-process')return;
  app.querySelectorAll('[data-gto]').forEach(a=>a.onclick=e=>{e.preventDefault();const el=$(a.dataset.gto);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})});
  app.querySelectorAll('[data-budgo]').forEach(a=>a.onclick=()=>{if(BUDGET&&BUDGET.subs){const r=BUDGET.subs.find(x=>x.t===a.dataset.budgo);if(r){budView.com=String(r.id);BUDTAB='committee'}}});
}
