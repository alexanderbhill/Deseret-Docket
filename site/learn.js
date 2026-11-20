/* Learn the Legislature: visual games and guides for interns and new staff.
   Face match · Who Said It? (real quotes from hearing recordings) · How a bill becomes law ·
   Put the steps in order · Floor and calendar vocabulary · Meet the members. */
'use strict';
let LG={score:0,streak:0,best:lsGet('docket-learn-best',{}),q:null,answered:null};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const legTitle=l=>`${l.house==='H'?'Rep.':'Sen.'} ${l.name}`;
function lgBest(k,v){if(v>(LG.best[k]||0)){LG.best[k]=v;lsSet('docket-learn-best',LG.best)}}

const STEPS=[
 ['Bill file opened','A legislator asks Legislative Research and General Counsel to draft a bill. Only the title is public at first.','📝'],
 ['Numbered and introduced','The bill gets a number (H.B. 12, S.B. 3) and a first reading on the floor of the house where it started.','🔢'],
 ['Rules Committee','Rules decides which standing committee hears it. Bills can sit in Rules a long time, or never leave.','🗂️'],
 ['Standing committee hearing','The sponsor presents, the public testifies, and the committee votes: favorable, held, amended or substituted.','🏛️'],
 ['Second reading calendar','Back on the floor. In the Senate, bills are debated and voted on second reading too.','📋'],
 ['Third reading and final vote','The final debate and vote in that house. A bill can be circled (put on hold) and uncircled later.','🗳️'],
 ['The other house','It all repeats in the second chamber: Rules, committee, second and third readings.','🔁'],
 ['Concurrence','If the second house changed the bill, the first house must agree (concur) to the changes.','🤝'],
 ['Enrolled','The final text is prepared and signed by the Speaker and the Senate President.','✒️'],
 ['Governor','The governor has 20 days after the session ends to sign or veto. Bills not acted on become law without a signature.','🏢'],
 ['Effective date','Most bills take effect in early May. Some take effect on signing or another date in the bill.','📅'],
];
const TERMS=[
 ['Circled','A bill is placed on hold on the floor until a member moves to uncircle it.',['Sent back to committee for good','Passed with no debate','Combined with another bill']],
 ['Sine die','The final adjournment of the session, at midnight on the 45th day.',['The first day of the session','A vote to override a veto','A tie vote']],
 ['Fiscal note','The Legislature’s estimate of what a bill would cost or save the state.',['A note from a lobbyist','The sponsor’s opening remarks','A list of cosponsors']],
 ['Substitute','A new version of the bill that replaces the old one (1st Sub., 2nd Sub.).',['An amendment from the governor','A bill from the other house','A backup sponsor']],
 ['Rules Committee','The committee that assigns bills to standing committees and manages the floor calendar.',['The committee that writes the budget','The ethics committee','A conference committee']],
 ['Concurrence','The first house’s vote to accept changes the second house made.',['A joint hearing','A veto override','A motion to adjourn']],
 ['Enrolled bill','The final, official version passed by both houses, sent to the governor.',['A bill that hasn’t been numbered','A bill held in committee','A bill with no sponsor']],
 ['Coordination clause','Language that reconciles two bills amending the same code section.',['A clause naming the sponsor','A sunset date','A funding formula']],
 ['Consent calendar','A list of uncontroversial bills passed together with little debate.',['Bills awaiting the governor','Bills that failed','Bills with fiscal notes']],
 ['Strike the enacting clause','A motion that kills the bill.',['A motion to pass the bill','A motion to amend the title','A motion to substitute']],
 ['Veto override session','A session the Legislature can call to override the governor’s vetoes.',['The first week of session','A budget hearing','A special election']],
 ['Interim','The months between sessions when committees study issues and draft bills.',['The last week of session','A recess during floor debate','A vote by mail']],
];

function pageLearn(sub){
  if(!LEGS)return shell('learn','<div class="card"><p>Loading legislators…</p></div>');
  const head=`<div class="card learn-hero"><div><h2>Learn the Legislature</h2><p class="desc">Learn the members and how the process works, mostly by looking and playing. Built for interns and anyone new to the session.</p></div>
   <nav class="learn-nav">${[['','🏠 Start'],['faces','🧑‍⚖️ Face match'],['quotes','💬 Who said it?'],['process','🛤️ How a bill becomes law'],['order','🔀 Put it in order'],['terms','📖 Floor vocabulary'],['members','👥 Meet the members']].map(([k,l])=>`<a href="#learn${k?'-'+k:''}" class="${(sub||'')===k?'on':''}">${l}</a>`).join('')}</nav></div>`;
  let body='';
  if(sub==='faces')body=gameFaces();else if(sub==='quotes')body=gameQuotes();else if(sub==='process')body=guideProcess();else if(sub==='order')body=gameOrder();else if(sub==='terms')body=gameTerms();else if(sub==='members')body=memberGrid();
  else body=`<div class="learn-grid">${[['faces','🧑‍⚖️','Face match','See a photo, pick the legislator. Then flip it: see a name, pick the face.'],['quotes','💬','Who said it?','A real line from a committee hearing. Guess which legislator said it.'],['process','🛤️','How a bill becomes law','An illustrated walk from bill file to effective date.'],['order','🔀','Put it in order','Tap the steps of the process in the right order, against the clock.'],['terms','📖','Floor vocabulary','Circled, sine die, concurrence… learn the words you’ll hear on day one.'],['members','👥','Meet the members','Every legislator’s photo, district and committees in one place.']].map(([k,i,t,d])=>`<a class="learn-tile" href="#learn-${k}"><span class="ico">${i}</span><b>${t}</b><span>${d}</span>${LG.best[k]?`<span class="best">Best: ${LG.best[k]}</span>`:''}</a>`).join('')}</div>
   <div class="card"><h2>More to explore</h2><p class="desc">Research and data on how the Utah Legislature works.</p><ul><li><a href="https://adambrown.info/p/research/utah_legislature" target="_blank" rel="noopener">Adam Brown’s Utah Legislature research</a>: data on voting, ideology and how bills move.</li><li><a href="https://le.utah.gov/sessionSchedule/sessdates.jsp" target="_blank" rel="noopener">Significant session dates</a> from the Legislature.</li><li><a href="https://le.utah.gov/" target="_blank" rel="noopener">le.utah.gov</a>: bills, calendars, audio and video.</li></ul></div>`;
  return shell('learn',head+body);
}

// ---------- face match
function newFaceQ(rev){
  const pool=LEGS.filter(l=>l.id);const l=pool[Math.floor(Math.random()*pool.length)];
  const others=shuffle(pool.filter(x=>x.id!==l.id&&x.house===l.house)).slice(0,3);
  LG.q={l,opts:shuffle([l,...others]),rev};LG.answered=null;
}
function gameFaces(){
  if(!LG.q||!LG.q.opts||LG.q.kind!=='face'){newFaceQ(Math.random()<.3);LG.q.kind='face'}
  const {l,opts,rev}=LG.q, a=LG.answered;
  const fb=a?(a===l.id?`<div class="lg-fb ok">Yes! That’s ${esc(legTitle(l))}, ${l.house==='H'?'House':'Senate'} District ${esc(l.district)} (${esc(l.counties||'')}).</div>`:`<div class="lg-fb no">Not quite. That’s ${esc(legTitle(l))}, ${l.house==='H'?'House':'Senate'} District ${esc(l.district)}.</div>`):'';
  return `<div class="card lg"><div class="lg-top"><h2>${rev?'Which one is…':'Who is this?'}</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.faces||0}</b></div></div>
   ${rev?`<p class="lg-name">${esc(legTitle(l))}</p><div class="lg-faces">${opts.map(o=>`<button class="lg-face ${a?(o.id===l.id?'right':o.id===a?'wrong':''):''}" data-lgface="${esc(o.id)}" ${a?'disabled':''} aria-label="Option"><img src="${esc(legPhoto(o))}" alt="" loading="lazy">${a?`<span>${esc(o.name)}</span>`:''}</button>`).join('')}</div>`
   :`<div class="lg-photo"><img src="${esc(legPhoto(l))}" alt="Photo of a legislator"></div><div class="lg-opts">${opts.map(o=>`<button class="btn lg-opt ${a?(o.id===l.id?'right':o.id===a?'wrong':''):''}" data-lgface="${esc(o.id)}" ${a?'disabled':''}>${esc(legTitle(o))}</button>`).join('')}</div>`}
   ${fb}${a?'<p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>':''}</div>`;
}

// ---------- who said it (presenter quotes from hearing transcripts)
let QUOTES=null;
function loadQuotes(){
  if(QUOTES!==null)return;QUOTES=undefined;
  const S=INDEX.sessions.find(s=>s.txFiles>0);if(!S){QUOTES=[];return}
  const go=async()=>{if(!BILLS[S.id])await loadSession(S.id);const k=Math.floor(Math.random()*S.txFiles);const chunk=await loadTx(S.id,k);const out=[];
    for(const b of BILLS[S.id].filter(x=>x.txc===k))for(const t of b.tx){const n=(t.notes||[]).find(x=>/presented the bill/i.test(x[2]));if(!n)continue;
      const m=n[2].match(/^(Rep|Sen)\.\s+(.+?)\s+presented/);if(!m)continue;const last=m[2].split(/\s+/).pop().toLowerCase();
      const l=LEGS.find(x=>(x.house==='H')===(m[1]==='Rep')&&(x.full||'').toLowerCase().startsWith(last+','));if(!l)continue;
      const lines=((chunk[b.num]||{})[t.key]||[]).filter(x=>x[0]>=n[0]-2&&x[0]<=n[0]+75);
      let txt=lines.map(x=>x[1]).join(' ').replace(/\b(uh|um|uh,|um,)\b,?\s*/gi,'').replace(/\s+/g,' ');
      txt=txt.replace(/^(.*?(chair|committee|members)[^.]*\.\s*)/i,'');const sents=txt.match(/[^.?!]+[.?!]/g)||[];
      const q=sents.filter(x=>{const w=x.trim().split(/\s+/).length;return w>=8&&w<=40&&!/thank you|good to be here|mr\. chair|madam chair/i.test(x)}).slice(0,2).join(' ').trim();
      if(q.split(/\s+/).length>=10)out.push({q,l,b,t})}
    QUOTES=shuffle(out);route(true)};
  go().catch(()=>{QUOTES=[];route(true)});
}
function gameQuotes(){
  loadQuotes();if(QUOTES===undefined)return '<div class="card"><p>Finding quotes in the hearing recordings…</p></div>';
  if(!QUOTES.length)return '<div class="card"><p class="empty">No hearing transcripts are available yet.</p></div>';
  if(!LG.q||LG.q.kind!=='quote'){const x=QUOTES[Math.floor(Math.random()*QUOTES.length)];const others=shuffle(LEGS.filter(o=>o.id!==x.l.id&&o.house===x.l.house)).slice(0,3);LG.q={kind:'quote',...x,opts:shuffle([x.l,...others])};LG.answered=null}
  const {q,l,b,t,opts}=LG.q,a=LG.answered;
  return `<div class="card lg"><div class="lg-top"><h2>Who said it?</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.quotes||0}</b></div></div>
   <blockquote class="lg-quote">“${esc(q)}”</blockquote><p class="small muted" style="text-align:center">Presenting a bill in committee. Automatic captions, lightly cleaned up.</p>
   <div class="lg-faces">${opts.map(o=>`<button class="lg-face ${a?(o.id===l.id?'right':o.id===a?'wrong':''):''}" data-lgquote="${esc(o.id)}" ${a?'disabled':''}><img src="${esc(legPhoto(o))}" alt="" loading="lazy"><span>${esc(legTitle(o))}</span></button>`).join('')}</div>
   ${a?`<div class="lg-fb ${a===l.id?'ok':'no'}">${a===l.id?'Right!':'Not this time.'} ${esc(legTitle(l))} said it while presenting <a href="${billHref(b)}">${esc(shortNum(b.num))}, ${esc(b.title)}</a>${t.video?` · <a href="${esc(vAt(t,t.t0))}" target="_blank" rel="noopener">hear it</a>`:''}.</div><p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:''}</div>`;
}

// ---------- process guide and ordering game
function guideProcess(){
  return `<div class="card"><h2>How a bill becomes law in Utah</h2><p class="desc">Tap a step to read more. The general session runs 45 days, starting in late January and ending at midnight on sine die in early March.</p>
   <ol class="flow">${STEPS.map((s,i)=>`<li><details ${i===0?'open':''}><summary><span class="fi">${s[2]}</span><span class="fn">${i+1}</span><b>${esc(s[0])}</b></summary><p>${esc(s[1])}</p></details></li>`).join('')}</ol>
   <div class="alertbox warnbox"><b>Where bills quietly die:</b> sitting in Rules, being held in committee, being circled and never uncircled, or running out of time before sine die.</div></div>`;
}
function gameOrder(){
  if(!LG.q||LG.q.kind!=='order'){const pick=shuffle(STEPS.map((s,i)=>i)).slice(0,6).sort((a,b)=>a-b);LG.q={kind:'order',want:pick,opts:shuffle(pick),got:[],start:Date.now(),miss:0}}
  const o=LG.q,done=o.got.length===o.want.length;
  if(done&&!o.time){o.time=Math.round((Date.now()-o.start)/1000);const pts=Math.max(1,60-o.time-o.miss*5);lgBest('order',pts);o.pts=pts}
  return `<div class="card lg"><div class="lg-top"><h2>Put it in order</h2><div class="lg-score">Best <b>${LG.best.order||0}</b> points</div></div><p class="desc">Tap these steps in the order they happen, first to last.</p>
   <div class="order-got">${o.got.map((i,n)=>`<span class="chip">${n+1}. ${esc(STEPS[i][2]+' '+STEPS[i][0])}</span>`).join('')||'<span class="small muted">Your order shows up here.</span>'}</div>
   <div class="lg-opts">${o.opts.filter(i=>!o.got.includes(i)).map(i=>`<button class="btn lg-opt" data-lgorder="${i}">${STEPS[i][2]} ${esc(STEPS[i][0])}</button>`).join('')}</div>
   ${done?`<div class="lg-fb ok">Done in ${o.time} seconds with ${plural(o.miss,'miss','misses')}: <b>${o.pts} points</b>.</div><p style="text-align:center"><button class="btn primary" id="lgNext">Play again</button></p>`:o.flash?`<div class="lg-fb no">${esc(o.flash)}</div>`:''}</div>`;
}
function gameTerms(){
  if(!LG.q||LG.q.kind!=='term'){const t=TERMS[Math.floor(Math.random()*TERMS.length)];LG.q={kind:'term',t,opts:shuffle([t[1],...t[2]])};LG.answered=null}
  const {t,opts}=LG.q,a=LG.answered;
  return `<div class="card lg"><div class="lg-top"><h2>What does it mean?</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.terms||0}</b></div></div>
   <p class="lg-name">${esc(t[0])}</p><div class="lg-opts col">${opts.map(o=>`<button class="btn lg-opt ${a?(o===t[1]?'right':o===a?'wrong':''):''}" data-lgterm="${esc(o)}" ${a?'disabled':''}>${esc(o)}</button>`).join('')}</div>
   ${a?`<div class="lg-fb ${a===t[1]?'ok':'no'}">${a===t[1]?'Correct!':'Not quite.'} <b>${esc(t[0])}:</b> ${esc(t[1])}</div><p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:''}</div>`;
}
function memberGrid(){
  const list=LEGS.slice().sort((a,b)=>a.house.localeCompare(b.house)||(+a.district)-(+b.district));
  return `<div class="card"><h2>Meet the members</h2><p class="desc">${LEGS.length} legislators. Tap anyone for their profile.</p><div class="members">${list.map(l=>`<a class="mem party-${l.party==='R'||l.party==='D'?l.party:'O'}" href="#legislators-${esc(l.id)}"><img src="${esc(legPhoto(l))}" alt="" loading="lazy"><b>${esc(l.name)}</b><span>${l.house==='H'?'House':'Senate'} ${esc(l.district)} · ${esc(l.party)}</span></a>`).join('')}</div></div>`;
}

function lgAnswer(ok,key){if(ok){LG.score++;LG.streak++;lgBest(key,LG.streak)}else LG.streak=0}
function learnBind(){
  if(!location.hash.startsWith('#learn'))return;
  app.querySelectorAll('[data-lgface]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgface;lgAnswer(LG.answered===LG.q.l.id,'faces');route(true)});
  app.querySelectorAll('[data-lgquote]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgquote;lgAnswer(LG.answered===LG.q.l.id,'quotes');route(true)});
  app.querySelectorAll('[data-lgterm]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgterm;lgAnswer(LG.answered===LG.q.t[1],'terms');route(true)});
  app.querySelectorAll('[data-lgorder]').forEach(b=>b.onclick=()=>{const o=LG.q,i=+b.dataset.lgorder,need=o.want[o.got.length];if(i===need){o.got.push(i);o.flash=''}else{o.miss++;o.flash=`Not yet: “${STEPS[i][0]}” comes later.`}route(true)});
  on('lgNext','onclick',()=>{LG.q=null;route(true)});
}
window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#learn'))LG.q=null});
