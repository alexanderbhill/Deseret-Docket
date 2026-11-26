/* Help → About: what the most recent updates did, and how the site is being used.
   Add a new entry to the top of CHANGES with each release (newest first). The stats come from /api/stats: counts
   only, never names, and only for signed-in accounts. */
'use strict';
const CHANGES=[
 ['2026-11-26','Intern contacts, and Learn tweaks',[
   'Each legislator’s profile can show a <b>Contact their intern</b> button (email, phone, copy). An admin uploads the Legislature’s intern list on the Admin tab, checks how each row matched, and imports it; one-off fixes can be made from the profile. Guests never see intern contacts.',
   '<b>Meet the Legislature</b> now counts on the Learn leaderboard. The <b>Birthday hunt</b> sits with the games but stays off the leaderboard, and it records month and day only, never a birth year.',
   '<b>How a bill becomes law</b> opens with a link to a short video walk-through.']],
 ['2026-11-26','Interim tab, rumor bills and an activity log that writes itself',[
   'A new <b>Interim</b> tab holds the wish list, interim study items and a new <b>Rumor bills</b> board for bills people say are coming. When a bill file opens with the same sponsor or the same words, the site offers it as a match to link in one click. Rumors, like wish list ideas, can go to the divisions through Draft review.',
   'Outreach is rebuilt around a short <b>Needs you</b> list, <b>Quick log</b> (one line after a call, email or hallway conversation) and a <b>Legislators</b> view showing when the office last talked with each one.',
   'An <b>activity log</b> on both tabs records every meeting, status change, Draft review step and division answer by itself, with a spot ready for Outlook calendar and email once IT connects it.',
   'Learn has <b>Meet the Legislature</b> (tap each face once you’ve talked with them) and the <b>Birthday hunt</b>, where everyone helps find the birthdays the office doesn’t have yet, with a source for each.',
   'People are named by their full name everywhere, not their username. Draft review’s legislator and division lists are now type-to-find pickers with suggestions from the bill.',
   'Wide tables keep the bill number and title in place while you scroll sideways (choose others with <b>Freeze</b> or the pin on a heading), with a scroll bar on top too. Bills can be filtered and grouped by legislator, and Updates links to every unnumbered bill file on the Bills tab.',
   'A new <b>Intern</b> section under Executive starts interns with the right permissions: see priorities, add notes and association positions, nothing else unless an admin turns it on.']],
 ['2026-11-25','Outreach and Draft review',[
   'The Outreach tab: meetings with legislators, asks, a testimony builder with a rehearsal timer, amendment requests and interim study items.',
   'Draft review tracks a draft from the drafter, out to the divisions (who answer from their email, with redlines) and back.',
   'The wish list with its language, emails sent under your own name and title, and a walk-through of the whole loop.']],
 ['2026-11-25','Executive department and the shared tracker',[
   'An Executive department for accounts and Fiscal Hive routing, custom Fiscal Hive divisions, a Share button on hearings, AG Office Showdown and org chart bios.',
   'The shared Excel bill tracker fills itself in four times a day once Microsoft 365 is connected.']],
 ['2026-11-20','Legislator profiles, Learn and the landing page',[
   'Legislator profiles with bills by committee, vote alignment and the cities each district covers; prep packets; hover cards for committees, divisions and legislators.',
   'Learn the Legislature overhaul: district map, the AG’s Office explained, Who said it?, leaderboard.',
   'A new sign-in page with account requests and invitations, Add to calendar for hearings, and a phone layout pass.']],
 ['2026-11-19','Fiscal Hive and bill intelligence',[
   'Fiscal Hive: bill cards for new bills and substitutes, batched division emails, one-click answers, reminders and the Appropriations threshold.',
   'Floor calendar watch, substitute summaries, bill collisions, “this bill has run before,” news coverage and media availability summaries.']],
];
let STATS=null;
function loadStats(){if(STATS===null&&ME){STATS=undefined;api('stats').then(j=>{STATS=j;if(location.hash.startsWith('#about'))route(true)}).catch(()=>{STATS={error:true}})}return STATS||null}
let CHG_ALL=false;
function aboutExtrasHTML(){
  const S=loadStats(), show=CHG_ALL?CHANGES:CHANGES.slice(0,2);
  const news=`<div class="card"><h2>${ic('spark','h')}What’s new</h2><div class="chg">${show.map(([d,t,items],i)=>`<div class="chg-e ${i===0?'latest':''}"><div class="chg-d">${i===0?'<span class="pill gold">Latest</span>':''}<span class="small muted">${esc(fmtLong(pd(d+'T12:00')))}</span></div><div><h3>${esc(t)}</h3><ul>${items.map(x=>`<li>${x}</li>`).join('')}</ul></div></div>`).join('')}</div>
   ${CHANGES.length>2?`<button type="button" class="linkbtn small" id="chgAll">${CHG_ALL?'Show less':`Earlier updates (${CHANGES.length-2})`}</button>`:''}</div>`;
  if(!ME)return news;
  const o=S&&!S.error?S.outreach||{}:{};
  const n=v=>(+v||0).toLocaleString();
  const tile=(label,v,sub)=>`<div class="st-t"><b>${v}</b><span>${label}</span>${sub?`<small>${sub}</small>`:''}</div>`;
  const legsN=(LEGS||[]).filter(l=>l.id).length||104, S0=UI.session, bills=allRows(S0).filter(b=>!b.file).length, files=allRows(S0).filter(b=>b.file).length;
  const spark=S&&S.daily&&S.daily.length?(()=>{const max=Math.max(...S.daily.map(x=>x[1]),1),w=Math.max(4,Math.floor(300/S.daily.length));return `<svg viewBox="0 0 ${S.daily.length*w} 48" class="st-spark" role="img" aria-label="Edits to office information each day for the last 30 days">${S.daily.map((x,i)=>`<rect x="${i*w+1}" y="${48-Math.max(2,x[1]/max*46)}" width="${w-2}" height="${Math.max(2,x[1]/max*46)}" rx="1.5"><title>${esc(x[0])}: ${x[1]} edits by ${x[2]} ${x[2]===1?'person':'people'}</title></rect>`).join('')}</svg>`})():'';
  const stats=`<div class="card"><h2>${ic('chart','h')}How the office is using it</h2>
   ${!S?'<p class="small muted">Loading…</p>':S.error?'<p class="small muted">The numbers didn’t load. Try again in a minute.</p>':`
   <h4 class="out-sub">People</h4><div class="st-grid">${tile('accounts',n(S.accounts),S.pending?`${n(S.pending)} waiting for approval`:'')}${tile('used it today',n(S.activeToday))}${tile('used it this week',n(S.active7))}${tile('used it this month',n(S.active30))}${tile('email alert sign-ups',n(S.emailSubs))}</div>
   <h4 class="out-sub">Bills</h4><div class="st-grid">${tile(`bills in the ${esc(sessName(S0))}`,n(bills),`plus ${n(files)} bill files`)}${tile('on the office list',n(S.officeBills))}${tile('with an office position',n(S.positions))}${tile('with team notes',n(S.notes))}${tile('edits this week',n(S.edits7),`by ${plural(+S.editors7||0,'person','people')} · ${n(S.edits)} all time`)}</div>
   ${spark?`<div class="st-sparkwrap"><span class="tiny muted">Edits to office information, last 30 days</span>${spark}</div>`:''}
   <h4 class="out-sub">Fiscal Hive, Outreach and Interim</h4><div class="st-grid">${tile('fiscal note requests',n(S.fiscalAsked),S.fiscalAsked?`${Math.round((S.fiscalAnswered||0)/S.fiscalAsked*100)}% answered`:'')}${tile('drafts reviewed',n(o.review))}${tile('meetings and calls logged',n(o.meet))}${tile('wish list ideas',n(o.wish))}${tile('rumored bills',n(o.rumor))}${tile('things logged this week',n(S.activity7))}</div>
   <h4 class="out-sub">Learn</h4><div class="st-grid">${tile('people playing the games',n(S.gamers))}${tile('meeting legislators',n(S.metPeople),S.metTotal?`${n(S.metTotal)} introductions in all`:'')}${tile('birthdays found',`${n(S.bdays)}<small> of ${legsN}</small>`)}</div>
   <p class="tiny muted">Counts only. “Used it” counts the accounts that opened the site, once an hour at most.</p>`}</div>`;
  return news+stats;
}
function aboutBind(){on('chgAll','onclick',()=>{CHG_ALL=!CHG_ALL;route(true)})}
