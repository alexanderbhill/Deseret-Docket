/* Deseret Docket click-through tour and the Help menu.
   The tour visits each page, highlights a real feature and explains it. It starts on someone's first
   sign-in and can be run again any time from Help → Take the tour. Steps a person can't use are skipped. */
'use strict';
const TOUR=[
  {hash:'updates',sel:'nav.tabs',title:'Welcome to Deseret Docket',text:'This quick tour walks through each page. Use Next and Back, or press Esc to stop. You can take it again any time from Help.'},
  {hash:'updates',sel:'main .card',title:'Today’s updates',text:'Every change to a bill today, newest first: new hearings, substitutes, floor moves and fiscal notes. Switch between the office list, your bills and every bill.'},
  {hash:'updates',sel:'#emForm',need:'me',title:'Email alerts',text:'Turn on the emails you want (morning calendar, day-before heads-up, end-of-day recap) and choose when each one arrives.'},
  {hash:'bills',sel:'#billForm',title:'Find any bill',text:'Filter by what’s on the office list, assigned to you, heard this week, or matching the watch list. Search finds bill numbers, titles, sponsors and notes.'},
  {hash:'bills',sel:'table.bills thead',title:'Arrange the table your way',text:'Click a heading to sort. Drag a heading to move the column, or use Columns to hide and reorder. Your layout is saved to your account.'},
  {hash:'bills',sel:'td.c-sponsor .spn',title:'Sponsor cards',text:'Hover a sponsor’s name for their photo and district, plus a button that starts an email to them with the bill number and title already in the subject line.'},
  {hash:'bills',sel:'td.c-position, td.c-departments',need:'me',title:'The office’s columns',text:'Set the office position, department, division, committee positions and assignments right in the table. Everyone signed in sees the same information.'},
  {hash:'updates',sel:'#hearingsCard',title:'Hearings',text:'Upcoming committee agendas with your bills, soonest first. When two important bills are heard at the same time in different rooms, you’ll see a warning.'},
  {hash:'legislators',sel:'main .card',title:'Legislators',text:'Every legislator’s bills, grouped by committee. Open a profile for a photo, committees and how each member’s votes line up with the positions you track.'},
  {hash:'budget',sel:'#budCom',title:'Budget',text:'Pick any appropriations committee to see its agencies’ budgets and the fiscal notes on bills in its area, plus what the office requested compared with what’s being funded.'},
  {hash:'bills',sel:'#watchToggle',need:'me',title:'Watch list',text:'Open the watch list from the Bills page: words and Utah Code chapters the office cares about. Every bill’s full text is checked against them, and substitutes that touch them raise an alert.'},
  {hash:'fiscal',sel:'main .card',need:'fiscal',title:'Fiscal Hive',text:'Route new bills and substitutes to the right division in a few clicks. Divisions answer by email, and their estimates come back here.'},
  {hash:'postsession',sel:'main .card',need:'wrap',title:'Session wrap-up',text:'The end-of-session scorecard, governor watch, implementation tracker and your personal season recap.'},
  {hash:'learn',sel:'main .card',title:'Learn the Legislature',text:'Games and visual guides for new staff and interns: match faces to names, guess who said it, and walk through how a bill becomes law.'},
  {hash:'admin',sel:'main .card',need:'admin',title:'Admin',text:'Approve account requests, choose what each person can see and change, and upload committee positions and budget documents.'},
  {hash:'updates',sel:'#sineDie',title:'Sine die countdown',text:'Always at the bottom of the page. Click it for the session’s key deadlines, with the next one highlighted.'},
  {hash:'updates',sel:'#helpBtn',title:'That’s the tour',text:'Help is here whenever you need it, including this tour. Enjoy the session!'},
];
let TS=null;
function tourSteps(){return TOUR.filter(s=>!s.need||(s.need==='me'&&ME)||(s.need==='admin'&&isAdmin())||(s.need==='fiscal'&&canFiscal())||(s.need==='wrap'&&ME&&wrapVisible()))}
function startTour(){endTour(true);TS={i:0,steps:tourSteps()};const spot=document.createElement('div');spot.className='tour-spot';const pop=document.createElement('div');pop.className='tour-pop';pop.setAttribute('role','dialog');pop.setAttribute('aria-modal','true');pop.setAttribute('aria-labelledby','tourTitle');document.body.append(spot,pop);TS.spot=spot;TS.pop=pop;TS.timer=setInterval(placeTour,400);tourStep()}
function endTour(silent){if(!TS)return;clearInterval(TS.timer);TS.spot.remove();TS.pop.remove();TS=null;if(!silent){lsSet('docket-tour-done',1);if(ME)api('prefs',{tourDone:true}).catch(()=>{})}}
function tourTarget(){const s=TS.steps[TS.i];return s&&document.querySelector(s.sel)}
function placeTour(){
  if(!TS)return;const el=tourTarget(),spot=TS.spot,pop=TS.pop;
  if(!el){spot.style.cssText='left:50%;top:40%;width:0;height:0';pop.style.left=Math.max(12,(innerWidth-pop.offsetWidth)/2)+'px';pop.style.top=Math.max(12,innerHeight*0.3)+'px';return}
  const r=el.getBoundingClientRect(),pad=6;const h=Math.min(r.height,innerHeight*0.6);
  spot.style.left=(r.left-pad)+'px';spot.style.top=(r.top-pad)+'px';spot.style.width=(r.width+pad*2)+'px';spot.style.height=(h+pad*2)+'px';
  const pw=pop.offsetWidth,ph=pop.offsetHeight;let top=r.top+h+pad+12;if(top+ph>innerHeight-50)top=r.top-ph-pad-12;if(top<12)top=Math.min(innerHeight-ph-60,Math.max(12,r.top+20));
  pop.style.left=Math.max(12,Math.min(r.left,innerWidth-pw-12))+'px';pop.style.top=top+'px';
}
async function tourStep(){
  const s=TS.steps[TS.i];if(!s){endTour();return}
  if((location.hash.slice(1)||'updates').split('-')[0]!==s.hash){location.hash='#'+s.hash}
  for(let k=0;k<25&&TS&&!document.querySelector(s.sel);k++)await new Promise(r=>setTimeout(r,120));
  if(!TS)return;const el=tourTarget();if(el)el.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  const n=TS.steps.length;
  TS.pop.innerHTML=`<div class="tour-dots" aria-hidden="true">${TS.steps.map((x,i)=>`<i class="${i===TS.i?'on':''}"></i>`).join('')}</div><h3 id="tourTitle">${esc(s.title)}</h3><p>${esc(s.text)}</p>
   <div class="nav"><span class="grow">${TS.i+1} of ${n}</span>${TS.i?'<button type="button" class="btn sm" data-tb>Back</button>':''}<button type="button" class="btn sm" data-tx>${TS.i===n-1?'Close':'Skip tour'}</button>${TS.i<n-1?'<button type="button" class="btn sm primary" data-tn>Next</button>':''}</div>`;
  TS.pop.querySelector('[data-tn]')?.addEventListener('click',()=>{TS.i++;tourStep()});
  TS.pop.querySelector('[data-tb]')?.addEventListener('click',()=>{TS.i--;tourStep()});
  TS.pop.querySelector('[data-tx]').addEventListener('click',()=>endTour());
  setTimeout(placeTour,350);(TS.pop.querySelector('[data-tn]')||TS.pop.querySelector('[data-tx]')).focus();
}
document.addEventListener('keydown',e=>{if(!TS)return;if(e.key==='Escape')endTour();else if(e.key==='ArrowRight'&&TS.i<TS.steps.length-1){TS.i++;tourStep()}else if(e.key==='ArrowLeft'&&TS.i>0){TS.i--;tourStep()}});
window.addEventListener('resize',()=>TS&&placeTour());
// First sign-in: start the tour once.
function maybeStartTour(){if(ME&&!(ME.prefs&&ME.prefs.tourDone)&&!lsGet('docket-tour-done',0))setTimeout(startTour,900)}

// Help menu (in the masthead)
document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('#helpBtn');const open=document.querySelector('.helpmenu');
  if(open&&!open.contains(e.target)){open.remove();const hb=$('helpBtn');hb&&hb.setAttribute('aria-expanded','false')}
  if(!b||open)return;
  const m=document.createElement('div');m.className='helpmenu';m.setAttribute('role','menu');
  m.innerHTML=`<button type="button" role="menuitem" data-h="tour">Take the tour</button><a role="menuitem" href="#learn">Learn the Legislature</a><button type="button" role="menuitem" data-h="dates">Key session dates</button>${ME?'<a role="menuitem" href="#account">Your account</a>':'<a role="menuitem" href="/login">Sign in or create an account</a>'}`;
  document.body.appendChild(m);const r=b.getBoundingClientRect();m.style.top=(r.bottom+6)+'px';m.style.left=Math.max(8,Math.min(r.left,innerWidth-m.offsetWidth-8))+'px';b.setAttribute('aria-expanded','true');
  m.onclick=ev=>{const h=ev.target.dataset.h;m.remove();if(h==='tour')startTour();else if(h==='dates'){const w=$('sineDie');if(w){w.classList.add('open');$('sdBtn').setAttribute('aria-expanded','true')}}};
  m.querySelector('button,a').focus();
});
