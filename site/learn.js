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
  if(LG.sub!==(sub||'')){LG.sub=sub||'';LG.q=null;LG.answered=null}
  if(!LEGS)return shell('learn','<div class="card"><p>Loading legislators…</p></div>');
  const head=`<div class="card learn-hero"><div><h2>Learn the Legislature</h2><p class="desc">Learn the members and how the process works, mostly by looking and playing. Built for interns and anyone new to the session.</p></div>
   <nav class="learn-nav">${[['','🏠 Start'],['faces','🧑‍⚖️ Face match'],['party','🗳️ Red or blue?'],['facts','✨ Fun facts'],['quotes','💬 Who said it?'],['redo','🔁 The do-over'],['process','🛤️ How a bill becomes law'],['order','🔀 Put it in order'],['terms','📖 Floor vocabulary'],['members','👥 Meet the members']].map(([k,l])=>`<a href="#learn${k?'-'+k:''}" class="${(sub||'')===k?'on':''}">${l}</a>`).join('')}</nav></div>`;
  let body='';
  if(sub==='faces')body=gameFaces();else if(sub==='party')body=gameParty();else if(sub==='redo')body=gameRedo();else if(sub==='facts')body=gameFacts();else if(sub==='quotes')body=gameQuotes();else if(sub==='process')body=guideProcess();else if(sub==='order')body=gameOrder();else if(sub==='terms')body=gameTerms();else if(sub==='members')body=memberGrid();
  else body=`<div class="learn-grid">${[['faces','🧑‍⚖️','Face match','See a photo, pick the legislator. Then flip it: see a name, pick the face.'],['party','🗳️','Red or blue?','Guess whether each legislator is a Republican or a Democrat from the photo.'],['facts','✨','Fun facts','A clue about someone’s job, hometown or years in office. Who is it?'],['quotes','💬','Who said it?','A real line from a committee hearing. Guess which legislator said it.'],['redo','🔁','The do-over','Laws passed in a rush often come back the next year to be fixed. Can you spot the do-overs?'],['process','🛤️','How a bill becomes law','An illustrated walk from bill file to effective date.'],['order','🔀','Put it in order','Tap the steps of the process in the right order, against the clock.'],['terms','📖','Floor vocabulary','Circled, sine die, concurrence… learn the words you’ll hear on day one.'],['members','👥','Meet the members','Every legislator’s photo, district and committees in one place.']].map(([k,i,t,d])=>`<a class="learn-tile" href="#learn-${k}"><span class="ico">${i}</span><b>${t}</b><span>${d}</span>${LG.best[k]?`<span class="best">Best: ${LG.best[k]}</span>`:''}</a>`).join('')}</div>
   <div class="card"><h2>Go deeper: Adam Brown’s Guide to the Utah Legislature</h2><p class="desc">Adam R. Brown is a political science professor at BYU who studies Utah politics, wrote the book <i>Utah Politics and Government</i>, and runs a Utah Legislature internship program. His guide collects data on every session: bill statistics, how legislators vote, ideology scores and rankings. It’s a great next step once you know the faces.</p><a class="btn primary" href="https://adambrown.info/p/research/utah_legislature" target="_blank" rel="noopener">Open Adam Brown’s guide</a></div>`;
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

// ---------- red or blue? (party from the photo)
function gameParty(){
  if(!LG.q){const pool=LEGS.filter(l=>l.party==='R'||l.party==='D');const ds=pool.filter(l=>l.party==='D'),rs=pool.filter(l=>l.party==='R');const src=Math.random()<.4?ds:rs;LG.q={l:src[Math.floor(Math.random()*src.length)]};LG.answered=null}
  const {l}=LG.q,a=LG.answered;
  return `<div class="card lg"><div class="lg-top"><h2>Republican or Democrat?</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.party||0}</b></div></div>
   <div class="lg-photo"><img src="${esc(legPhoto(l))}" alt="Photo of a legislator"></div>
   <div class="lg-opts"><button class="btn lg-opt party-btn r ${a?(l.party==='R'?'right':a==='R'?'wrong':''):''}" data-lgparty="R" ${a?'disabled':''}>Republican</button><button class="btn lg-opt party-btn d ${a?(l.party==='D'?'right':a==='D'?'wrong':''):''}" data-lgparty="D" ${a?'disabled':''}>Democrat</button></div>
   ${a?`<div class="lg-fb ${a===l.party?'ok':'no'}">${a===l.party?'Right!':'Not this time.'} ${esc(legTitle(l))} is a ${l.party==='R'?'Republican':'Democrat'} representing ${l.house==='H'?'House':'Senate'} District ${esc(l.district)} (${esc(l.counties||'')}).</div><p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:''}</div>`;
}
// ---------- fun facts (job, hometown counties, years in office, committees, and facts an admin added)
let LEGFACTS=null;
function loadLegFacts(){if(LEGFACTS===null){LEGFACTS={};if(ME)api('legfacts').then(j=>{LEGFACTS=j.facts||{};route(true)}).catch(()=>{})}return LEGFACTS}
function factsFor(l){
  // [clue shown in the question, the same fact with a pronoun for the answer]
  const f=[];const p=pron(l);
  if(l.profession){const job=l.profession.replace(/\s*\/\s*/g,' / ');f.push([`Outside the Legislature, this legislator works as: ${job}.`,`Outside the Legislature, ${p.s} works as: ${job}.`])}
  if(l.since){const y=(l.since.match(/\d{4}/)||[])[0];if(y)f.push([`This legislator has served since ${y}.`,`${p.S} has served since ${y}.`])}
  if(l.counties){const c=`${l.counties.includes(',')?'parts of ':''}${l.counties} ${l.counties.includes(',')?'counties':'County'}`;f.push([`This legislator’s district covers ${c}.`,`${p.P} district covers ${c}.`])}
  const ch=(typeof loadComs==='function'?loadComs():[]).filter(c=>(c.members||[]).some(m=>m.id===l.id&&/chair/i.test(m.pos||'')));
  if(ch.length)f.push([`This legislator chairs the ${ch[0].name}.`,`${p.S} chairs the ${ch[0].name}.`]);
  for(const x of (loadLegFacts()[l.id]||[]))f.push([x.replace(/\b(She|He)\b/g,'This legislator').replace(/\b(she|he)\b/g,'this legislator').replace(/\b(Her|His)\b/g,'This legislator’s').replace(/\b(her|his)\b/g,'this legislator’s'),x]);
  return f;
}
function gameFacts(){
  if(!LG.q){const pool=shuffle(LEGS.filter(l=>factsFor(l).length));if(!pool.length)return '<div class="card"><p>Loading…</p></div>';const l=pool[0];const fs=factsFor(l);const fact=fs[Math.floor(Math.random()*fs.length)];
    const others=shuffle(LEGS.filter(o=>o.id!==l.id&&o.house===l.house)).slice(0,3);LG.q={l,fact,opts:shuffle([l,...others])};LG.answered=null}
  const {l,fact,opts}=LG.q,a=LG.answered;
  return `<div class="card lg"><div class="lg-top"><h2>Who is it?</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.facts||0}</b></div></div>
   <blockquote class="lg-quote">✨ ${esc(fact[0])}</blockquote>
   <div class="lg-faces">${opts.map(o=>`<button class="lg-face ${a?(o.id===l.id?'right':o.id===a?'wrong':''):''}" data-lgfact="${esc(o.id)}" ${a?'disabled':''}><img src="${esc(legPhoto(o))}" alt="" loading="lazy"><span>${esc(legTitle(o))}</span></button>`).join('')}</div>
   ${a?`<div class="lg-fb ${a===l.id?'ok':'no'}">${a===l.id?'Right!':'Not quite.'} It’s ${esc(legTitle(l))}. ${esc(fact[1])}</div><p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:''}
   ${isAdmin()?`<details class="small" style="margin-top:12px"><summary>Add a fun fact about a legislator</summary><form id="factForm" class="filters" style="margin-top:8px"><div class="field"><label for="factLeg">Legislator</label><select id="factLeg">${LEGS.slice().sort((x,y)=>x.full.localeCompare(y.full)).map(o=>`<option value="${o.id}">${esc(o.full)}</option>`).join('')}</select></div><div class="field grow"><label for="factTxt">Fact (write it about them, e.g. “She ran the Boston Marathon.”)</label><input id="factTxt" maxlength="200"></div><button class="btn">Add</button></form></details>`:''}</div>`;
}

// ---------- the do-over: bills that come back to fix last year's law
const REDO_QUOTES=[
 ['“In the legislature, promptitude of decision is oftener an evil than a benefit.”','Alexander Hamilton, Federalist No. 70 (1788)',''],
 ['“It appears that the act was conceived and passed in haste, on March 9, 1961, in the compulsory closing hours of an overtaxed legislature, producing an unconstitutional pregnancy, resulting in a birth in which its legislative pains could not be anaesthetized by any proper judicial ministration.”','Utah Supreme Court (1962)','https://law.justia.com/cases/utah/supreme-court/1962/9697-0.html'],
];
const REDO_TRIVIA=[
 ['A law passed last year cites the wrong code section. How does it usually get fixed?','A cleanup bill the next session',['The governor edits it','It fixes itself on the effective date','The court rewrites it']],
 ['Two bills passed the same year change the same code section in different ways. What is supposed to reconcile them?','A coordination clause',['A coin flip','Whichever was signed last wins','The Rules Committee']],
 ['A new program was created with a sunset date and nobody acted before it arrived. What happens?','The program ends unless a new bill extends it',['It continues forever','It moves to the next session automatically','The governor decides']],
 ['Why do so many mistakes slip into bills passed on the last night?','Hundreds of bills get final votes in a few hours before the 45-day deadline',['Legislators are on vacation','Bills skip committee entirely','The text isn’t public']],
 ['A court strikes down part of a law. What usually comes next?','The Legislature passes a revised version',['The law is gone for good','The court passes a new law','Nothing changes']],
 ['What is a bill that only fixes errors, outdated references and typos in existing law often called?','A technical corrections bill',['A sine die bill','A concurrent resolution','A veto override']],
];
function redoRounds(){
  // Current-session bills that change code a law from an earlier session just changed.
  const H=typeof loadHist==='function'?loadHist():null;if(!H)return null;const S=UI.session;
  const laws={};for(const [ses,bills] of Object.entries(H)){if(ses>=S)continue;for(const r of Object.values(bills)){if(r.stage!=='Became law')continue;for(const sec of r.secs)(laws[sec]=laws[sec]||[]).push({ses,r})}}
  const pool=(BILLS[S]||[]).filter(b=>!b.file&&b.secs.length);if(!pool.length||!Object.keys(laws).length)return [];
  return pool.map(b=>{const hit=b.secs.flatMap(sec=>(laws[sec]||[]).map(x=>({...x,sec})));return {b,hit}});
}
function gameRedo(){
  const quotes=`<div class="redo-q">${REDO_QUOTES.map(q=>`<figure><blockquote>${esc(q[0])}</blockquote><figcaption>${q[2]?`<a href="${q[2]}" target="_blank" rel="noopener">${esc(q[1])}</a>`:esc(q[1])}</figcaption></figure>`).join('')}</div>`;
  const rounds=redoRounds();
  if(rounds===null)return '<div class="card"><p>Loading…</p></div>';
  const yes=rounds.filter(x=>x.hit.length), no=rounds.filter(x=>!x.hit.length);
  const live=yes.length>=3&&no.length>=3;
  if(!LG.q){
    if(live&&Math.random()<.65){const pick=Math.random()<.5?yes:no;const x=pick[Math.floor(Math.random()*pick.length)];LG.q={kind:'bill',...x}}
    else{const t=REDO_TRIVIA[Math.floor(Math.random()*REDO_TRIVIA.length)];LG.q={kind:'trivia',t,opts:shuffle([t[1],...t[2]])}}
    LG.answered=null}
  const q=LG.q,a=LG.answered;let body;
  if(q.kind==='bill'){const is=q.hit.length>0;const ex=q.hit.slice(0,2);
    body=`<p class="lg-name" style="font-size:22px">${esc(shortNum(q.b.num))}: ${esc(q.b.title)}</p><p class="small muted" style="text-align:center">Does this bill go back and change a law passed in the last few years?</p>
     <div class="lg-opts"><button class="btn lg-opt ${a?(is?'right':a==='y'?'wrong':''):''}" data-lgredo="y" ${a?'disabled':''}>Yes, it’s a do-over</button><button class="btn lg-opt ${a?(!is?'right':a==='n'?'wrong':''):''}" data-lgredo="n" ${a?'disabled':''}>No, it’s new ground</button></div>
     ${a?`<div class="lg-fb ${(a==='y')===is?'ok':'no'}">${(a==='y')===is?'Right!':'Not quite.'} ${is?`It changes Section ${esc(ex[0].sec)}, which ${esc(shortNum(ex[0].r.n))} (${esc(ex[0].ses.slice(0,4))}) also changed${ex[1]&&ex[1].r.n!==ex[0].r.n?`, along with ${esc(shortNum(ex[1].r.n))} (${esc(ex[1].ses.slice(0,4))})`:''}.`:'None of the code it changes was changed by a law in the last few sessions.'} <a href="${billHref(q.b)}">Open the bill</a></div><p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:''}`}
  else{const {t,opts}=q;
    body=`<p class="lg-name" style="font-size:21px">${esc(t[0])}</p><div class="lg-opts col">${opts.map(o=>`<button class="btn lg-opt ${a?(o===t[1]?'right':o===a?'wrong':''):''}" data-lgredot="${esc(o)}" ${a?'disabled':''}>${esc(o)}</button>`).join('')}</div>
     ${a?`<div class="lg-fb ${a===t[1]?'ok':'no'}">${a===t[1]?'Right!':'Not quite.'} ${esc(t[1])}.</div><p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:''}`}
  const stat=yes.length?`<p class="small muted" style="text-align:center">${plural(yes.length,'bill')} this session revisit code that a law changed in the last few years.</p>`:'';
  return `<div class="card lg"><div class="lg-top"><h2>The do-over</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.redo||0}</b></div></div>
   <p class="desc">Laws passed in a hurry, especially in the final hours of a session, often come back the next year to be fixed: a wrong cross-reference, a missed coordination clause, a sunset nobody remembered. ${live?'Some rounds use real bills: guess whether each one goes back to change a recent law.':'Real-bill rounds unlock once earlier sessions finish loading.'}</p>
   ${quotes}${body}${stat}</div>`;
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
  return `<div class="card"><h2>Meet the members</h2><p class="desc">${LEGS.length} legislators. Tap anyone to see a profile.</p><div class="members">${list.map(l=>`<a class="mem party-${l.party==='R'||l.party==='D'?l.party:'O'}" href="#legislators-${esc(l.id)}"><img src="${esc(legPhoto(l))}" alt="" loading="lazy"><b>${esc(l.name)}</b><span>${l.house==='H'?'House':'Senate'} ${esc(l.district)} · ${esc(l.party)}</span></a>`).join('')}</div></div>`;
}

function lgAnswer(ok,key){if(ok){LG.score++;LG.streak++;lgBest(key,LG.streak)}else LG.streak=0}
function learnBind(){
  if(!location.hash.startsWith('#learn'))return;
  app.querySelectorAll('[data-lgface]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgface;lgAnswer(LG.answered===LG.q.l.id,'faces');route(true)});
  app.querySelectorAll('[data-lgquote]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgquote;lgAnswer(LG.answered===LG.q.l.id,'quotes');route(true)});
  app.querySelectorAll('[data-lgparty]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgparty;lgAnswer(LG.answered===LG.q.l.party,'party');route(true)});
  app.querySelectorAll('[data-lgfact]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgfact;lgAnswer(LG.answered===LG.q.l.id,'facts');route(true)});
  on('factForm','onsubmit',async e=>{e.preventDefault();const id=$('factLeg').value,t=$('factTxt').value.trim();if(!t)return;try{const j=await api('legfacts',{id,fact:t});LEGFACTS=j.facts;toast('Fun fact added');$('factTxt').value=''}catch(err){toast(err.message)}});
  app.querySelectorAll('[data-lgredo]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgredo;lgAnswer((LG.answered==='y')===(LG.q.hit.length>0),'redo');route(true)});
  app.querySelectorAll('[data-lgredot]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgredot;lgAnswer(LG.answered===LG.q.t[1],'redo');route(true)});
  app.querySelectorAll('[data-lgterm]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgterm;lgAnswer(LG.answered===LG.q.t[1],'terms');route(true)});
  app.querySelectorAll('[data-lgorder]').forEach(b=>b.onclick=()=>{const o=LG.q,i=+b.dataset.lgorder,need=o.want[o.got.length];if(i===need){o.got.push(i);o.flash=''}else{o.miss++;o.flash=`Not yet: “${STEPS[i][0]}” comes later.`}route(true)});
  on('lgNext','onclick',()=>{LG.q=null;route(true)});
}
