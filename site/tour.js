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
  {hash:'bills',sel:'td.c-position, td.c-departments',need:'me',title:'The office’s columns',text:'Set the office position, department, division, association positions and assignments right in the table. Everyone signed in sees the same information.'},
  {hash:'updates',sel:'#hearingsCard',title:'Hearings',text:'Upcoming committee agendas with your bills, soonest first. When two important bills are heard at the same time in different rooms, you’ll see a warning.'},
  {hash:'learn-members',sel:'#legRank',title:'Members and their bills',text:'On the Learn tab: every legislator, ranked by how many bills they’re sponsoring. Open a profile for a photo, committees and how each member’s votes line up with the positions you track.'},
  {hash:'budget',sel:'#budCom',title:'Budget',text:'Pick any appropriations committee to see its agencies’ budgets and the fiscal notes on bills in its area, plus what the office requested compared with what’s being funded.'},
  {hash:'bills',sel:'#watchToggle',need:'me',title:'Watch list',text:'Open the watch list from the Bills page: words and Utah Code chapters the office cares about. Every bill’s full text is checked against them, and substitutes that touch them raise an alert.'},
  {hash:'fiscal',sel:'main .card',need:'fiscal',title:'Fiscal Hive',text:'Route new bills and substitutes to the right division in a few clicks. Divisions answer by email, and their estimates come back here.'},
  {hash:'postsession',sel:'main .card',need:'wrap',title:'Session wrap-up',text:'The end-of-session scorecard, governor watch, implementation tracker and your personal season recap.'},
  {hash:'learn',sel:'main .card',title:'Learn the Legislature',text:'Games and visual guides for new staff and interns: match faces to names, guess who said it, and walk through how a bill becomes law.'},
  {hash:'admin',sel:'main .card',need:'admin',title:'Admin',text:'Approve account requests, choose what each person can see and change, and upload association positions and budget documents.'},
  {hash:'updates',sel:'#sineDie',title:'Sine die countdown',text:'Always at the bottom of the page: the time left until the session ends at sine die.'},
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
  m.innerHTML=`<button type="button" role="menuitem" data-h="tour">${ic('spark')}Tutorial</button><a role="menuitem" href="#features">${ic('list')}Features</a>${ME?`<a role="menuitem" href="#account">${ic('user')}Account</a>`:`<a role="menuitem" href="/login">${ic('user')}Sign in</a>`}<a role="menuitem" href="#about">${ic('impact')}About</a>`;
  document.body.appendChild(m);const r=b.getBoundingClientRect();m.style.top=(r.bottom+6)+'px';m.style.left=Math.max(8,Math.min(r.left,innerWidth-m.offsetWidth-8))+'px';b.setAttribute('aria-expanded','true');
  m.onclick=ev=>{const h=ev.target.dataset.h;m.remove();if(h==='tour')startTour();};
  m.querySelector('button,a').focus();
});

// ---------- Help → What Deseret Docket does: every feature, with a link to where it lives
function pageFeatures(){
  const F=[
    ['Track','list',[
      ['list','Every bill, one table','Numbered bills and bill files, refreshed four times each weekday. Filter, sort, rearrange columns and download to Excel.','#bills'],
      ['flag','Positions and assignments','Set the office position, priority, departments, divisions and who owns each bill, right in the table or on the bill page.','#bills',1],
      ['users','Association positions','Upload where outside associations stand, or set them by hand on any bill.','#bills',1],
      ['eye','Watch list','Words and code sections you care about, highlighted in every bill that uses them.','#bills',1]]],
    ['Stay ahead','bell',[
      ['bell','Today’s updates','Every change to a bill today, newest first, plus new bill files.','#updates'],
      ['calendar','Hearings','Upcoming committee agendas with your bills, soonest first.','#updates'],
      ['mail','Email alerts','Morning calendar, day-before heads-up and end-of-day recap, on the days and times you pick.','#updates'],
      ['clock','Sine die countdown','Always at the bottom of the page.','#updates']]],
    ['Understand a bill','file',[
      ['spark','Progress and at a glance','Where the bill is, its stance, priority, fiscal impact and next hearing, at the top of every bill.','#bills'],
      ['diff','What changed','Struck and added text for every substitute, summarized, with watch-list matches first.','#bills'],
      ['mic','Hearings and debate','Agendas, recordings and transcripts, with every mention of the Attorney General flagged.','#bills'],
      ['repeat','Has this bill run before?','Earlier versions, how far they got, and every roll-call vote.','#bills'],
      ['news','News','Newspaper coverage of the bill and which way it leans.','#bills'],
      ['scale','What the AG office will have to do','The office’s notes plus every place the bill text gives the Attorney General a role.','#bills',1]]],
    ['Money','dollar',[
      ['chart','Budget','The state budget by appropriations committee, with each committee’s fiscal notes and requests.','#budget'],
      ['hive','Fiscal Hive','Send new bills to the right divisions for cost estimates; answers come back by email.','#fiscal','fiscal']]],
    ['People and learning','users',[
      ['users','Members and their bills','Every legislator ranked by how many bills they’re sponsoring; open anyone for a full profile.','#learn-members'],
      ['book','Learn the Legislature','Face match, Red or blue?, Who said it?, Capitol quirks, vocabulary and how a bill becomes law.','#learn'],
      ['trophy','Leaderboard','See who in the office has the longest streak in each game.','#learn-board',1]]],
    ['End of session','wrap',[
      ['wrap','Session wrap-up','A scorecard for every position the office took, governor watch and an implementation tracker.','#postsession',1],
      ['file','Prep packets','A one-page brief for any bill, ready to print.','#bills',1]]],
  ];
  const ok=x=>x[4]==='fiscal'?canFiscal():x[4]?!!ME:true;
  return shell('',`<div class="card"><h2>What Deseret Docket does</h2><p class="desc">Everything the site can do, and where to find it. ${ME?'':'Some tools need you to sign in.'} <button type="button" class="linkbtn" id="featTour">Take the tour</button> for a quick walk-through.</p></div>
   ${F.map(([g,gi,list])=>`<div class="card"><h2>${ic(gi,'h')}${esc(g)}</h2><div class="feats">${list.map(x=>`<a class="feat ${ok(x)?'':'locked'}" href="${ok(x)?x[3]:'/login'}"><span class="fi">${ic(x[0])}</span><span><b>${esc(x[1])}</b><span>${esc(x[2])}</span>${ok(x)?'':'<span class="tiny muted">Sign in to use this</span>'}</span></a>`).join('')}</div></div>`).join('')}`);
}
document.addEventListener('click',e=>{if(e.target&&e.target.id==='featTour'&&typeof startTour==='function')startTour()});

// ---------- Help → About: who built it, how the office's information is protected, and how to send feedback.
// The contact address comes from "contactEmail" in config.json.
const feedbackTo=()=>(CONFIG&&CONFIG.contactEmail)||'';
function pageAbout(){
  const to=feedbackTo();
  const sec=[
    ['users','Only people the office approves','Every account is approved or invited by an admin, who chooses what each person can see and change. Guests see public bill information only, and nothing a guest changes is saved.'],
    ['gear','Passwords are never stored','Passwords are scrambled with PBKDF2 (100,000 rounds) before they’re saved, so nobody, including admins, can read them. Sign-ins use signed, secure cookies that expire.'],
    ['building','Office information stays in the site’s database','Positions, notes, assignments and Fiscal Hive answers live in the site’s own Cloudflare database. They aren’t sold, shared or sent to outside services.'],
    ['spark','No AI reads the office’s data','The site doesn’t send office information to any AI service. The “Ask Claude” buttons only open claude.ai in your browser with a bill’s public title and summary, and only when you click them.'],
    ['file','Public information comes from public sources','Bill data comes from the Utah Legislature’s website and API, news from Utah newspapers’ public feeds, and the budget from the Legislature’s budget data.'],
    ['mail','Emails never include office positions','Alert emails link to the public bill pages and leave out the office’s positions and notes.'],
    ['clock','Every change is on the record','Each edit to a bill’s office information is logged with who made it and when. Open “Office history” on any bill to see it.'],
  ];
  return shell('',`<div class="card about-hero"><div class="ab-top">${BEE}<div><h2>About Deseret Docket</h2><p class="desc">A bill tracker for the Utah Legislature, built by <b>Alexander Hill</b>.</p></div></div>
    ${to?`<p>Questions or comments? Email <a href="mailto:${esc(to)}">${esc(to)}</a>.</p>`:''}
    <div class="fbbtns"><button type="button" class="dlbig" data-fb="bug">${ic('x')}<span><b>Report a bug</b><small>Something broken, wrong or confusing</small></span></button><button type="button" class="dlbig alt" data-fb="feature">${ic('spark')}<span><b>Request a feature</b><small>An idea that would make the site more useful</small></span></button></div></div>
   <div class="card"><h2>${ic('scale','h')}How the office’s information is protected</h2><div class="feats">${sec.map(x=>`<div class="feat"><span class="fi">${ic(x[0])}</span><span><b>${esc(x[1])}</b><span>${esc(x[2])}</span></span></div>`).join('')}</div></div>
   <dialog id="fbDlg"></dialog>`);
}
let FB_FROM='';
function feedbackDlg(kind){
  const dlg=$('fbDlg');const bug=kind==='bug';const to=feedbackTo();
  dlg.innerHTML=`<form method="dialog" class="fbform"><h2>${ic(bug?'x':'spark')}${bug?'Report a bug':'Request a feature'}</h2>
   <div class="field"><label for="fbWhat">${bug?'What went wrong?':'What would you like the site to do?'}</label><textarea id="fbWhat" rows="4" required placeholder="${bug?'I clicked… and expected… but instead…':'It would help if…'}"></textarea></div>
   ${bug?`<div class="field" style="margin-top:10px"><label for="fbWhere">Where did it happen? (page or bill)</label><input id="fbWhere" value="${esc(FB_FROM||'')}"></div>`:''}
   <p class="small muted">This opens an email${to?` to ${esc(to)}`:''} in your mail app${bug?', with your browser details added to help track it down':''}. Nothing is sent until you press send.</p>
   <div style="display:flex;gap:10px;justify-content:flex-end"><button type="button" class="btn" id="fbCancel">Cancel</button><button class="btn primary" id="fbGo">${ic('mail')}Open the email</button></div></form>`;
  dlg.showModal();$('fbCancel').onclick=()=>dlg.close();
  $('fbGo').onclick=e=>{e.preventDefault();const what=$('fbWhat').value.trim();if(!what){$('fbWhat').focus();return}
    const subject=`Deseret Docket ${bug?'bug':'feature request'}: ${what.slice(0,60)}${what.length>60?'…':''}`;
    const body=`${what}\n\n${bug?`Where: ${$('fbWhere').value.trim()||'—'}\nPage: ${location.origin}/${FB_FROM||''}\nBrowser: ${navigator.userAgent}\nScreen: ${innerWidth}×${innerHeight}\n`:''}From: ${ME?(ME.display||ME.user):'a guest'}`;
    location.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;dlg.close()};
}
addEventListener('hashchange',e=>{if(!location.hash.startsWith('#about'))FB_FROM=location.hash;else{try{const h=new URL(e.oldURL).hash;if(!h.startsWith('#about'))FB_FROM=h}catch{}}});
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('[data-fb]');if(t)feedbackDlg(t.dataset.fb)});
