/* Fiscal Hive: the fiscal note request dashboard.
   New bills and every new substitute show up as cards. The point of contact (POC) confirms which
   division should weigh in; everything routed in one sitting is emailed together, one email per
   division, when they leave the dashboard, sign out, press Send now, or after 10 idle minutes.
   Divisions answer from the email (No impact / Probable fiscal impact / Wrong section) and the answers
   come back here. */
'use strict';
let FH=null, FHVIEW='inbox', FHI=0, FHFILTER='all', FHSEL=null, AIDATA={};
const FH_IDLE_MS=10*60e3;
let fhLastAct=Date.now(), fhPingAt=0;

// ---------- the assessment shown on each card: the AI's when the data update has one, otherwise automatic
function loadAI(s){if(AIDATA[s]!==undefined)return;AIDATA[s]=null;getJSON(`data/${s}/ai.json`).then(j=>{AIDATA[s]=j||{};if(location.hash.startsWith('#fiscal'))route(true)}).catch(()=>{AIDATA[s]={}})}
// Words that point to money: what the bill costs or spends, not new duties for the office.
const NEED_RE=/\b(appropriat\w*|grant program|restricted account|special revenue fund|expendable (?:special revenue )?fund|general fund|income tax fund|ongoing (?:funding|appropriation)|one-time (?:funding|appropriation)|fee (?:increase|schedule)|new (?:position|fte)s?|full-time equivalent)\b/gi;
function autoAssess(b){
  const ai=(AIDATA[b.session]||{})[b.num];
  if(ai&&(!ai.ver||ai.ver===b.version)) return {divs:(ai.divs||b.sug||[]).filter(divById),need:ai.need||'unsure',why:ai.why||'',sum:ai.sum||b.description||'',conf:ai.conf||70,src:'ai'};
  const divs=(b.sug||[]).filter(divById).slice(0,3);
  const c=fnCost(b);
  if(b.fn&&c&&(c.on>0||c.one>0)) return {divs,need:'likely',why:`The Legislature’s fiscal note shows a cost of ${money(Math.max(0,c.on)+Math.max(0,c.one))} to state funds`,sum:b.description||'',conf:85,src:'auto'};
  const text=[b.title,b.description,...((TEXT[b.session]||{})[b.num]||[]).filter(p=>p[0]==='Highlighted provisions').map(p=>p[1].replace(/[\u0001\u0002]/g,''))].join(' ');
  const hits=[...new Set((text.match(NEED_RE)||[]).map(x=>x.toLowerCase().replace(/\s+/g,' ')))];
  if(b.fn&&b.fn.none) return {divs,need:'unlikely',why:'The Legislature’s fiscal note found no direct cost to the state',sum:b.description||'',conf:70,src:'auto'};
  if(hits.length>=2) return {divs,need:'likely',why:`The bill text mentions ${hits.slice(0,3).map(h=>`“${h}”`).join(', ')}`,sum:b.description||'',conf:Math.min(75,50+hits.length*8),src:'auto'};
  if(hits.length===1) return {divs,need:'unsure',why:`The bill text mentions “${hits[0]}”`,sum:b.description||'',conf:45,src:'auto'};
  return {divs,need:'unlikely',why:'Nothing in the title, summary or fiscal note points to a cost',sum:b.description||'',conf:40,src:'auto'};
}
const NEED_LABEL={likely:'Likely impact',unlikely:'Probably none',unsure:'Not sure'};
const NEED_CLS={likely:'warn',unlikely:'muted',unsure:'ink'};

// ---------- cards: one per bill version
const verOf=b=>(b.version||'Introduced').replace(/[^A-Za-z0-9 .\-]/g,'').slice(0,40)||'Introduced';
const cardId=b=>`${b.session}/${b.num}/${verOf(b)}`;
function candidates(){
  const S=UI.session; const have=new Set((FH.cards||[]).map(c=>c.id));
  return (BILLS[S]||[]).filter(b=>!b.file&&!have.has(cardId(b))).map(b=>{
    const prev=(FH.cards||[]).filter(c=>c.num===b.num&&c.session===b.session).sort((x,y)=>(y.routed_at||'').localeCompare(x.routed_at||''))[0];
    return {b,ai:autoAssess(b),prev};
  });
}
function inboxList(){
  let l=candidates();
  if(FHFILTER==='likely') l=l.filter(x=>x.ai.need==='likely');
  else if(FHFILTER==='office') l=l.filter(x=>onOffice(x.b));
  else if(FHFILTER==='subs') l=l.filter(x=>x.prev);
  const rank={likely:0,unsure:1,unlikely:2};
  return l.sort((a,c)=>(c.prev?1:0)-(a.prev?1:0)||rank[a.ai.need]-rank[c.ai.need]||SORTS.num(a.b,c.b));
}
const reqsOf=id=>(FH.requests||[]).filter(r=>r.card_id===id);
const cardTotal=id=>reqsOf(id).filter(r=>r.status==='impact').reduce((s,r)=>s+(+r.answer.amount||0),0);
const queued=()=>(FH.requests||[]).filter(r=>r.status==='queued'&&r.poc===ME.user);

async function fhLoad(force){
  const S=UI.session;
  if(FH&&FH.session===S&&!force) return;
  try{const j=await api('fn/state?session='+encodeURIComponent(S));FH={...j,session:S};FH_CUSTOM=(j.customDivs||[]).map(d=>({...d,dept:'custom'}));}catch(e){FH={error:e.message,session:S}}
  if(location.hash.startsWith('#fiscal'))route(true);
}
async function fhAct(path,body,msg){try{const r=await api(path,body);if(msg)toast(msg);await fhLoad(true);return r}catch(e){toast(e.message);return null}}

// ---------- page
function pageFiscal(){
  if(!canFiscal()) return shell('',`<div class="card" style="max-width:640px"><h2>Fiscal Hive</h2><p class="desc">${ME?'Your account doesn’t have access to the Fiscal Hive. Ask an admin to turn it on.':'Sign in to use the Fiscal Hive.'}</p></div>`);
  const S=UI.session;
  if(!BILLS[S]){loadSession(S).then(()=>route(true));return shell('fiscal','<div class="card"><p>Loading bills…</p></div>')}
  loadAI(S);
  if(!FH||FH.session!==S){fhLoad();return shell('fiscal','<div class="card"><p>Loading the Fiscal Hive…</p></div>')}
  if(FH.error) return shell('fiscal',`<div class="card"><h2>Fiscal Hive</h2><p class="desc">${esc(FH.error)}</p></div>`);
  const inbox=inboxList(), q=queued(), cards=FH.cards||[];
  const waiting=cards.filter(c=>c.status==='sent'), attention=cards.filter(c=>c.status==='attention'||reqsOf(c.id).some(r=>r.status==='nocontact')), answered=cards.filter(c=>c.status==='answered');
  const approp=cards.filter(c=>cardTotal(c.id)>FH.threshold);
  const qDivs=new Set(q.map(r=>r.division)).size, qBills=new Set(q.map(r=>r.card_id)).size;
  const views=[['inbox','Inbox',inbox.length],['waiting','Waiting',waiting.length],['attention','Needs attention',attention.length],['answered','Answered',answered.length],['approp','Appropriations',approp.length],['board','Leaderboard',''],['settings','Settings','']];
  let body='';
  if(FHVIEW==='inbox') body=fhInbox(inbox);
  else if(FHVIEW==='waiting') body=fhList(waiting,'Sent and waiting for answers. Tap the bell to send a reminder now; anyone who hasn’t answered after 24 hours gets one automatically.');
  else if(FHVIEW==='attention') body=fhAttention(attention);
  else if(FHVIEW==='answered') body=fhList(answered,'Every division asked has answered.');
  else if(FHVIEW==='approp') body=fhList(approp,`Bills whose estimated impact adds up to more than ${money(FH.threshold)}. These have to go through the Appropriations committee.`);
  else if(FHVIEW==='board') body=fhBoard();
  else body=fhSettings();
  return shell('fiscal',`
   <div class="card fh-head"><div class="fh-title"><div><h2>Fiscal Hive</h2><p class="desc">Route each new bill and substitute to the divisions that should estimate its cost. Divisions answer by email; their answers land here.</p><button type="button" class="btn sm demo-btn" data-demo="fiscal">▶ See how it works, start to finish</button></div>${fhAccuracy()}</div>
    ${q.length?`<div class="fh-queue" role="status"><b>${plural(qBills,'bill')} queued for ${plural(qDivs,'division')}.</b> <span>One email per division goes out when you leave the Fiscal Hive, sign out, or after 10 idle minutes.</span><button class="btn sm primary" id="fhSend">Send now</button></div>`:''}
    ${FH.mailReady?'':`<div class="fh-note">Email isn’t connected yet, so messages are saved to the <a href="#fiscal" data-fhview="settings">Outbox</a> instead of being sent. Everything else works, including the answer links.</div>`}
    <nav class="fh-tabs" aria-label="Fiscal Hive views">${views.map(([k,l,n])=>`<button type="button" data-fhview="${k}" class="${FHVIEW===k?'on':''}" aria-pressed="${FHVIEW===k}">${l}${n!==''?` <span class="n">${n}</span>`:''}</button>`).join('')}</nav></div>
   ${body}`);
}
function fhAccuracy(){
  const routed=(FH.cards||[]).filter(c=>c.status!=='cleared'&&c.status!=='new'&&c.ai&&(c.ai.divs||[]).length);
  if(!routed.length) return `<div class="acc"><div class="acc-l">Suggestion accuracy</div><div class="small muted">Shows up once bills have been routed.</div></div>`;
  const miss=c=>!c.kept_ai||reqsOf(c.id).some(r=>r.status==='wrong'||r.status==='rerouted');
  const hits=routed.filter(c=>!miss(c)).length, pct=Math.round(hits/routed.length*100);
  return `<div class="acc" title="A bill counts as a miss if the POC changed the suggested divisions before sending, or a division answered “wrong section.”"><div class="acc-l">Suggestion accuracy</div><div class="acc-n">${pct}%</div><div class="bar acc-bar" style="--c:${pct>=80?'var(--green)':pct>=60?'var(--steel)':'var(--maroon)'}"><i style="width:${pct}%"></i></div><div class="small muted">${hits} of ${routed.length} sent to the right place the first time · <button class="linkbtn small" data-fhmiss>see misses</button></div></div>`;
}
// Every unit the Fiscal Hive can send to: the office's divisions (Executive included) plus custom ones.
const fhDivs=()=>[...CONFIG.divisions,...FH_CUSTOM];
const fhGroups=()=>[...CONFIG.departments,...(FH_CUSTOM.length?[{id:'custom',name:'Custom'}]:[])];
function fhOpts(skip,cur){return fhGroups().map(d=>`<optgroup label="${esc(d.name)}">${fhDivs().filter(x=>x.dept===d.id&&!(skip||[]).includes(x.id)).map(x=>`<option value="${x.id}" ${cur===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}
function divChips(sel,ai){
  const opts=fhOpts(sel);
  return `<div class="fh-divs">${sel.map(d=>`<span class="chip fh-chip" data-full="${esc((c=>c.send.length?`To: ${c.send.map(x=>x.n||x.e).join(', ')}${c.cc.length?' · CC: '+c.cc.map(x=>x.n||x.e).join(', '):''}`:'No contacts yet: add them under Settings')(fhContact(d)))}"><span class="dot" style="--c:${msColor('divisions',d)}"></span>${esc(divName(d))}${(ai.divs||[]).includes(d)?' <span class="tiny muted">suggested</span>':''}<button type="button" data-fhrm="${esc(d)}" aria-label="Remove ${esc(divName(d))}">×</button></span>`).join('')||'<span class="small muted">No division chosen yet.</span>'}
   <select id="fhAdd" aria-label="Add a division"><option value="">+ Add a division</option>${opts}</select></div>`;
}
function fhInbox(list){
  const filt=`<div class="seg" role="group" aria-label="Show">${[['all','All new'],['likely','Likely impact'],['subs','New substitutes'],['office','Office list']].map(([k,l])=>`<button type="button" data-fhf="${k}" class="${FHFILTER===k?'on':''}" aria-pressed="${FHFILTER===k}">${l}</button>`).join('')}</div>`;
  if(!list.length) return `<div class="card"><div class="fh-bar">${filt}</div><p class="empty">Nothing new to route. New bills and substitutes appear here after each data update.</p></div>`;
  FHI=Math.max(0,Math.min(FHI,list.length-1));
  const {b,ai,prev}=list[FHI];
  if(!FHSEL||FHSEL.id!==cardId(b)) FHSEL={id:cardId(b),divs:ai.divs.slice()};
  const pr=prev?reqsOf(prev.id):[];
  return `<div class="card"><div class="fh-bar">${filt}<span class="small muted">${FHI+1} of ${list.length} · keys: <kbd>Enter</kbd> queue · <kbd>N</kbd> no request · <kbd>→</kbd> skip · <kbd>←</kbd> back</span></div>
   <div class="fh-stack"><div class="fh-ghost g2"></div><div class="fh-ghost g1"></div>
   <article class="fh-card" aria-labelledby="fhT">
    <div class="fh-top"><a class="billnum" href="${billHref(b)}">${esc(shortNum(b.num))}</a><span class="pill ink">${esc(verOf(b))}</span>${prev?`<span class="pill warn">New substitute: needs a fresh look</span>`:''}${onOffice(b)?'<span class="pill muted">Office list</span>':''}<span class="grow"></span><span class="small muted">${esc(b.sponsor.replace(/^(Rep|Sen)\.\s*/,''))}</span></div>
    <div class="fh-body"><h3 id="fhT">${esc(b.title)}</h3>
    <p class="serif">${esc(ai.sum||b.description||'No summary yet.')}</p>
    <div class="fh-ai ${ai.need}"><div><span class="pill ${NEED_CLS[ai.need]}">${NEED_LABEL[ai.need]}</span> <b>${ai.src==='ai'?'AI assessment':'Automatic assessment'}</b> <span class="tiny muted">${ai.conf}% confident</span></div><div class="small">${esc(ai.why)}.</div></div>
    ${prev?`<div class="fh-prev small"><b>Earlier version (${esc(prev.version)}):</b> ${pr.length?pr.map(r=>`${esc(divName(r.division))}: ${fhAnswerText(r)}`).join(' · '):esc(prev.status==='cleared'?'No request was needed.':'Not answered yet.')}</div>`:''}
    <span class="flabel" style="margin-top:14px">Send to</span>${divChips(FHSEL.divs,ai)}</div>
    <div class="fh-actions"><button class="btn" data-fhgo="-1" ${FHI?'':'disabled'}>← Back</button><span class="grow"></span><button class="btn" data-fhgo="1">Skip →</button><button class="btn" id="fhClear">No request needed</button><button class="btn primary" id="fhQueue" ${FHSEL.divs.length?'':'disabled'}>Queue for ${plural(FHSEL.divs.length,'division')}</button></div>
   </article></div></div>`;
}
function fhAnswerText(r){
  if(r.status==='impact') return `<b>${money(+r.answer.amount)}</b> ${esc(r.answer.kind||'')}${r.answer.covers?` · ${esc(r.answer.covers.slice(0,120))}`:''}`;
  return {queued:'queued',pending:`waiting since ${r.sent_at?fmtMD(new Date(r.sent_at)):'—'}`,no_impact:'no impact',wrong:`wrong section${r.answer.suggest?` → ${esc(r.answer.suggest==='unknown'?'not sure':divName(r.answer.suggest))}`:''}`,rerouted:'sent elsewhere',nocontact:'<span style="color:var(--maroon)">no contact</span>'}[r.status]||esc(r.status);
}
function fhList(cards,desc){
  const rows=cards.slice().sort((a,b)=>(b.sent_at||b.updated_at||'').localeCompare(a.sent_at||a.updated_at||''));
  return `<div class="card"><p class="desc">${desc}</p>${rows.length?`<div class="fh-rows">${rows.map(c=>{const rs=reqsOf(c.id).filter(r=>r.status!=='rerouted');const tot=cardTotal(c.id);const last=rs.map(r=>r.last_reminded_at).filter(Boolean).sort().pop();const b=BYKEY[`${c.session}/${c.num}`];
    return `<div class="fh-row"><div><a class="billnum" href="${b?billHref(b):'#'}">${esc(shortNum(c.num))}</a> <span class="pill ink">${esc(c.version)}</span><div class="serif">${esc(c.title)}</div><div class="tiny muted">Routed by ${esc(c.poc===ME.user?'you':c.poc)}${c.sent_at?' · sent '+fmtLong(new Date(c.sent_at)):''}</div></div>
     <div class="fh-reqs">${rs.map(r=>`<div><span class="dot" style="--c:${msColor('divisions',r.division)}"></span> ${esc(divName(r.division))}: ${fhAnswerText(r)}</div>`).join('')}${tot?`<div class="fh-total ${tot>FH.threshold?'over':''}">Total ${money(tot)}${tot>FH.threshold?' · needs Appropriations':''}</div>`:''}</div>
     <div class="fh-rbtns">${rs.some(r=>r.status==='pending')?`<button class="btn sm fh-bell" data-fhbell="${esc(c.id)}" title="Email a reminder now${last?`; last reminder ${fmtLong(new Date(last))}`:''}" aria-label="Send a reminder for ${esc(shortNum(c.num))}">🔔</button>${last?`<span class="tiny muted">reminded ${fmtMD(new Date(last))}</span>`:''}`:''}<button class="btn sm" data-fhlog="${esc(c.id)}">History</button></div></div>`}).join('')}</div>`:'<p class="empty">Nothing here.</p>'}</div>`;
}
function fhAttention(cards){
  if(!cards.length) return `<div class="card"><p class="empty">Nothing needs attention.</p></div>`;
  return `<div class="card"><p class="desc">A division said a bill was sent to the wrong place, or there’s nobody to email for a division. Confirm where it should go and send it on.</p><div class="fh-rows">${cards.map(c=>{const rs=reqsOf(c.id).filter(r=>r.status==='wrong'||r.status==='nocontact');
    return rs.map(r=>{const sug=r.answer&&r.answer.suggest&&r.answer.suggest!=='unknown'?r.answer.suggest:'';
     return `<div class="fh-row attn"><div><b>${esc(shortNum(c.num))}</b> <span class="pill ink">${esc(c.version)}</span><div class="serif">${esc(c.title)}</div></div>
      <div>${r.status==='wrong'?`<div><b>${esc(divName(r.division))}</b> says it was sent to the wrong place${sug?` and should go to <b>${esc(divName(sug))}</b>`:''}.</div>${r.answer.note?`<div class="small">“${esc(r.answer.note)}”${r.answer.by?` (${esc(r.answer.by)})`:''}</div>`:''}`:`<div><b>${esc(divName(r.division))}</b> has nobody to email. <button class="linkbtn" data-fhview="settings">Add a contact</button>, then resend.</div>`}</div>
      <div class="fh-rbtns"><select data-fhto="${esc(r.id)}" aria-label="Send to">${fhOpts([],sug||r.division)}</select><button class="btn sm primary" data-fhreroute="${esc(c.id)}|${esc(r.id)}">Send</button></div></div>`}).join('')}).join('')}</div></div>`;
}
function median(a){if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}
function fhBoard(){
  const by={};
  for(const r of FH.stats||[]){if(!r.sent_at)continue;const x=by[r.division]=by[r.division]||{h:[],n:0,ans:0,fast:0,wk:[]};x.n++;
    if(r.answered_at&&['no_impact','impact','wrong'].includes(r.status)){const h=(new Date(r.answered_at)-new Date(r.sent_at))/36e5;x.h.push(h);x.ans++;if(h<=24)x.fast++;if(Date.now()-new Date(r.answered_at)<7*864e5)x.wk.push(h)}}
  const rows=Object.entries(by).filter(([,x])=>x.ans).map(([d,x])=>({d,med:median(x.h),pct:Math.round(x.fast/x.n*100),ans:x.ans,n:x.n,wk:median(x.wk)})).sort((a,b)=>a.med-b.med);
  const hrs=h=>h<1?`${Math.max(1,Math.round(h*60))} min`:h<48?`${h.toFixed(h<10?1:0)} hrs`:`${(h/24).toFixed(1)} days`;
  const weekly=rows.filter(r=>r.wk!=null).sort((a,b)=>a.wk-b.wk)[0];
  const medals=['🥇','🥈','🥉'];
  // Department totals, so sections in the same department can cheer each other on.
  const dep={};for(const r of rows){const d=(divById(r.d)||{}).dept;if(!d)continue;(dep[d]=dep[d]||[]).push(r.med)}
  return `<div class="grid2" style="align-items:start"><div class="card"><h2>Fastest responders</h2><p class="desc">Ranked by typical (median) time from email to answer. Only the top of the board is shown.</p>
   ${weekly?`<div class="fh-weekly">🏆 <b>This week’s winner:</b> ${esc(divName(weekly.d))}, typically answering in ${hrs(weekly.wk)}</div>`:''}
   ${rows.length?`<ol class="fh-board">${rows.slice(0,8).map((r,i)=>`<li><span class="rk">${medals[i]||i+1}</span><span><b>${esc(divName(r.d))}</b><span class="tiny muted"> ${esc(deptName((divById(r.d)||{}).dept))}</span><div class="badges">${r.pct>=80?'<span class="bdg">Same-Day Swarm</span>':''}${r.ans>=10?'<span class="bdg">Busy Bee</span>':''}${r.med<2?'<span class="bdg">Lightning</span>':''}</div></span><span class="v">${hrs(r.med)}<span class="tiny muted">${r.pct}% within a day</span></span></li>`).join('')}</ol>`:'<p class="empty">The board fills in as divisions answer.</p>'}
   ${rows.length>8?`<p class="small muted">Everyone else: every answer moves you up. Keep it buzzing!</p>`:''}</div>
   <div class="card"><h2>By department</h2><p class="desc">Typical response time across each department’s divisions.</p>
   ${Object.keys(dep).length?Object.entries(dep).map(([d,l])=>({d,m:median(l)})).sort((a,b)=>a.m-b.m).map((x,i,a)=>`<div class="fh-dep"><span><b>${esc(deptName(x.d))}</b></span><div class="bar" style="--c:${deptColor(x.d)}"><i style="width:${Math.max(6,100-(x.m/Math.max(...a.map(y=>y.m))*85)).toFixed(0)}%"></i></div><span class="small">${hrs(x.m)}</span></div>`).join(''):'<p class="empty">No answers yet.</p>'}</div></div>`;
}
// ---------- staff list upload: a spreadsheet of staff emails and what each person covers
let FHSTAFF=null;
function fhMatchDivs(txt){
  const parts=String(txt||'').split(/\s*(?:[;,/|\n]|\band\b|&)\s*/i).map(x=>x.trim()).filter(Boolean);
  const norm=x=>x.toLowerCase().replace(/\(.*?\)/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const out=new Set();
  for(const p of parts){const n=norm(p);if(!n)continue;
    let d=CONFIG.divisions.find(x=>x.id===p||norm(x.name)===n)||CONFIG.divisions.find(x=>norm(x.name).includes(n)&&n.length>=4)||CONFIG.divisions.find(x=>n.includes(norm(x.name)))
      ||CONFIG.divisions.find(x=>(x.name.match(/\(([^)]+)\)/)||[])[1]&&norm(x.name.match(/\(([^)]+)\)/)[1])===n)
      ||CONFIG.divisions.find(x=>(x.keywords||[]).some(k=>norm(k)===n));
    if(d)out.add(d.id)}
  return [...out];
}
function fhStaffParse(rows){
  if(!rows.length)return {err:'That file is empty.'};
  const hdr=rows[0].map(x=>x.toLowerCase());const hasHdr=hdr.some(h=>/mail|name|cover|division|section|area|topic/.test(h));
  const body=hasHdr?rows.slice(1):rows;
  const col=re=>hdr.findIndex(h=>re.test(h));
  let ec=hasHdr?col(/mail/):-1;if(ec<0)ec=(body[0]||[]).findIndex(x=>/@/.test(x));
  if(ec<0)return {err:'No email column found. Include a column of email addresses.'};
  let nc=hasHdr?col(/name/):-1;let cc=hasHdr?col(/cover|division|section|area|topic|practice|responsib/):-1;const rc=hasHdr?col(/^role$|send|cc|copy/):-1;
  if(cc<0)cc=(body[0]||[]).findIndex((x,i)=>i!==ec&&i!==nc&&x);
  const people=body.map(r=>({email:(r[ec]||'').trim(),name:nc>=0?r[nc]||'':'',cover:cc>=0?r[cc]||'':'',role:rc>=0&&/cc|copy/i.test(r[rc])?'cc':'send'})).filter(p=>/@/.test(p.email)).map(p=>({...p,divs:fhMatchDivs(p.cover)}));
  return {people};
}
function fhStaffCard(){
  const P=FHSTAFF&&FHSTAFF.people;
  return `<div class="card"><h2>Staff list upload</h2><p class="desc">Upload a spreadsheet of staff with their email and what they cover (one row per person). Columns can be in any order; the site looks for an email column, a name column, a “covers” column (division names, separated by commas) and an optional Role column (Send or CC). You’ll see a preview before anything changes.</p>
   <div class="filters"><div class="field"><label for="fhStaffFile">Excel or CSV file</label><input type="file" id="fhStaffFile" accept=".xlsx,.xls,.csv,.txt"></div></div>
   ${FHSTAFF&&FHSTAFF.err?`<p class="small" style="color:var(--maroon)">${esc(FHSTAFF.err)}</p>`:''}
   ${P?`<p class="small"><b>${plural(P.length,'person')}</b> found · ${P.filter(p=>p.divs.length).length} matched to a division. Fix any row before adding.</p>
    <div class="tablewrap"><table class="compact"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Covers (from the sheet)</th><th>Gets requests for</th></tr></thead><tbody>${P.map((p,i)=>`<tr><td>${esc(p.name)}</td><td class="small">${esc(p.email)}</td><td><select data-fhsrole="${i}" aria-label="Role"><option value="send" ${p.role==='send'?'selected':''}>Send</option><option value="cc" ${p.role==='cc'?'selected':''}>CC</option></select></td><td class="small">${esc(p.cover)}</td><td>${p.divs.map(d=>`<span class="chip">${esc(divName(d))} <button type="button" class="linkbtn tiny" data-fhsrm="${i}|${esc(d)}" aria-label="Remove">✕</button></span>`).join(' ')}<select data-fhsadd="${i}" aria-label="Add a division"><option value="">${p.divs.length?'+ Add…':'Pick a division…'}</option>${fhOpts(p.divs)}</select></td></tr>`).join('')}</tbody></table></div>
    <p style="margin-top:10px"><button class="btn primary" id="fhStaffApply">Add these people to “Who gets requests” and save</button> <button class="btn" id="fhStaffCancel">Cancel</button></p>
    <p class="tiny muted">Adding keeps the addresses already listed for each division.</p>`:''}</div>`;
}
// Who gets a division's requests: Send people are on the To line and answer; CC people are copied.
function fhContact(id){const c=(FH.contacts||{})[id];if(!c)return {send:[],cc:[]};return Array.isArray(c)?{send:c.map(e=>({e,n:''})),cc:[]}:{send:c.send||[],cc:c.cc||[]}}
const fhPeopleStr=l=>(l||[]).map(x=>x.n?`${x.n} <${x.e}>`:x.e).join(', ');
const fhPeopleParse=t=>String(t||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean).map(x=>{const m=x.match(/^(.*?)\s*<([^>]+)>$/);return m?{n:m[1].replace(/^"|"$/g,''),e:m[2]}:{n:'',e:x}}).filter(x=>/@/.test(x.e));
let FHOUT=null;
function fhSettings(){
  if(!FHOUT){api('fn/outbox').then(j=>{FHOUT=j;route(true)}).catch(()=>{FHOUT={outbox:[]}})}
  const groups=fhGroups().map(d=>`<h4 style="margin:16px 0 4px">${esc(d.name)}</h4>${fhDivs().filter(x=>x.dept===d.id).map(x=>{const c=fhContact(x.id);const fb=(FH.sectionEmails||{})[x.id]||[];
    return `<div class="fh-contact2"><b>${esc(x.name)}</b><div class="field"><label for="ct-${x.id}" class="tiny">Send (To)</label><input id="ct-${x.id}" data-ct="${x.id}" value="${esc(fhPeopleStr(c.send))}" placeholder="${fb.length?esc('Using accounts in this section: '+fb.join(', ')):'Name <name@agutah.gov>, …'}"></div><div class="field"><label for="cc-${x.id}" class="tiny">CC</label><input id="cc-${x.id}" data-cc="${x.id}" value="${esc(fhPeopleStr(c.cc))}" placeholder="Copied on every request"></div></div>`}).join('')}`).join('');
  return `<div class="grid2" style="align-items:start"><div class="card"><h2>Appropriations threshold</h2><p class="desc">When a bill’s estimated impact (all divisions added together) is more than this, it’s flagged as needing the Appropriations committee.</p>
    <form id="fhThr" class="filters"><div class="field"><label for="fhThrIn">Threshold (dollars)</label><input id="fhThrIn" inputmode="numeric" value="${FH.threshold}"></div><button class="btn primary">Save</button></form><p class="small muted">Default is $20,000.</p></div>
   <div class="card"><h2>Outbox</h2><p class="desc">${FH.mailReady?'Every email the site has sent, newest first.':'Email isn’t connected yet (it needs RESEND_API_KEY and MAIL_FROM), so emails wait here. Open one to see exactly what a division would get, and use its links to test answering.'}</p>
    ${FHOUT&&FHOUT.outbox.length?`<div class="rows">${FHOUT.outbox.slice(0,30).map(m=>`<div class="row" style="grid-template-columns:110px minmax(0,1fr) auto"><span class="small">${fmtMD(new Date(m.at))} ${fmtTime(new Date(m.at))}</span><div class="what" style="font-size:14.5px">${esc(m.subject)}<span class="sub">to ${esc(m.to_addr)}</span></div><div class="r">${m.sent?'<span class="pill pass">Sent</span>':m.error?`<span class="pill warn" title="${esc(m.error)}">Failed</span>`:'<span class="pill muted">Waiting</span>'}<button class="btn sm" data-fhmail="${m.id}">Open</button></div></div>`).join('')}</div>`:'<p class="empty">No emails yet.</p>'}</div></div>
   ${fhStaffCard()}
   <div class="card"><h2>Custom divisions</h2><p class="desc">For a team that isn’t on the office’s list: a task force, a working group, one person who handles a topic. Give it a name and the emails that get its requests. It shows up in the <b>+ Add a division</b> menu on every card, and divisions answer from the email the same way.</p>
    ${FH_CUSTOM.length?`<div class="rows">${FH_CUSTOM.map(d=>{const c=fhContact(d.id);return `<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div class="what" style="font-size:14.5px">${esc(d.name)}<span class="sub">To: ${esc(fhPeopleStr(c.send)||'nobody yet')}${c.cc.length?' · CC: '+esc(fhPeopleStr(c.cc)):''}</span></div><div class="r"><button class="btn sm" data-fhcuedit="${esc(d.id)}">Edit</button><button class="btn sm" data-fhcudel="${esc(d.id)}">Remove</button></div></div>`}).join('')}</div>`:'<p class="empty">No custom divisions yet.</p>'}
    <form id="fhCuForm" class="fh-cuform"><input type="hidden" id="fhCuId" value=""><div class="field"><label for="fhCuName">Division name</label><input id="fhCuName" maxlength="80" placeholder="e.g. Opioid Settlement Team" required></div>
     <div class="field"><label for="fhCuSend">Send (To)</label><input id="fhCuSend" placeholder="Name &lt;name@agutah.gov&gt;, …" required></div>
     <div class="field"><label for="fhCuCc">CC <span class="tiny muted">(optional)</span></label><input id="fhCuCc" placeholder="Copied on every request"></div>
     <p><button class="btn primary" id="fhCuSave">Add custom division</button> <button type="button" class="btn" id="fhCuCancel" style="display:none">Cancel</button></p></form></div>
   <div class="card"><h2>Who gets requests</h2><p class="desc">For each division: <b>Send</b> people are on the To line and can answer; <b>CC</b> people are copied on the request and its reminder. Separate people with commas; “Name &lt;email&gt;” keeps their name. If Send is blank, requests go to approved accounts that work in that section.</p>${groups}<p><button class="btn primary" id="fhSaveCt">Save contacts</button></p></div>`;
}

// ---------- binding (called from app.js bind via the hook below)
function fhOpenDlg(html){let dlg=$('fhDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='fhDlg';document.body.appendChild(dlg)}dlg.innerHTML=html+'<div style="text-align:right;margin-top:12px"><button class="btn" id="fhDlgX">Close</button></div>';dlg.showModal();$('fhDlgX').onclick=()=>dlg.close()}
function fhBind(){
  if(!location.hash.startsWith('#fiscal')) return;
  app.querySelectorAll('[data-fhview]').forEach(b=>b.onclick=e=>{e.preventDefault();FHVIEW=b.dataset.fhview;FHOUT=null;route(true)});
  app.querySelectorAll('[data-fhf]').forEach(b=>b.onclick=()=>{FHFILTER=b.dataset.fhf;FHI=0;route(true)});
  app.querySelectorAll('[data-fhgo]').forEach(b=>b.onclick=()=>{FHI+=+b.dataset.fhgo;FHSEL=null;route(true)});
  app.querySelectorAll('[data-fhrm]').forEach(b=>b.onclick=()=>{FHSEL.divs=FHSEL.divs.filter(d=>d!==b.dataset.fhrm);route(true)});
  on('fhAdd','onchange',e=>{if(e.target.value){FHSEL.divs.push(e.target.value);route(true)}});
  const cur=()=>{const l=inboxList();return l[Math.max(0,Math.min(FHI,l.length-1))]};
  on('fhQueue','onclick',async()=>{const x=cur();if(!x||!FHSEL.divs.length)return;await fhAct('fn/route',{id:cardId(x.b),title:x.b.title,divisions:FHSEL.divs,ai:x.ai,prev:x.prev?x.prev.id:''},`${shortNum(x.b.num)} queued for ${FHSEL.divs.map(divName).join(', ')}`);FHSEL=null});
  on('fhClear','onclick',async()=>{const x=cur();if(!x)return;await fhAct('fn/clear',{id:cardId(x.b),title:x.b.title,ai:x.ai},`${shortNum(x.b.num)}: no request needed`);FHSEL=null});
  on('fhSend','onclick',async()=>{const r=await fhAct('fn/flush',{});if(r)toast(r.sent?`Sent ${plural(r.sent,'email')} to ${plural(r.divisions,'division')}`:'Nothing could be sent: check that each division has a contact')});
  app.querySelectorAll('[data-fhbell]').forEach(b=>b.onclick=async()=>{const r=await fhAct('fn/remind',{id:b.dataset.fhbell});if(r)toast(r.reminded?`Reminder sent (${plural(r.reminded,'email')})`:'Everyone has already answered')});
  app.querySelectorAll('[data-fhreroute]').forEach(b=>b.onclick=async()=>{const [id,from]=b.dataset.fhreroute.split('|');const sel=app.querySelector(`[data-fhto="${CSS.escape(from)}"]`);await fhAct('fn/reroute',{id,from,division:sel.value},`Queued for ${divName(sel.value)}`)});
  app.querySelectorAll('[data-fhlog]').forEach(b=>b.onclick=async()=>{try{const j=await api('fn/log?id='+encodeURIComponent(b.dataset.fhlog));fhOpenDlg(`<h2>History</h2><p class="small muted">${esc(b.dataset.fhlog.replace(/\//g,' · '))}</p><table class="compact"><tbody>${j.log.map(x=>`<tr><td style="white-space:nowrap">${fmtMDY(new Date(x.at))} ${fmtTime(new Date(x.at))}</td><td>${esc(pn(x.by))}</td><td>${esc(x.what)}</td></tr>`).join('')||'<tr><td>No history.</td></tr>'}</tbody></table>`)}catch(e){toast(e.message)}});
  app.querySelectorAll('[data-fhmiss]').forEach(b=>b.onclick=()=>{const miss=(FH.cards||[]).filter(c=>c.status!=='cleared'&&(c.ai.divs||[]).length&&(!c.kept_ai||reqsOf(c.id).some(r=>r.status==='wrong'||r.status==='rerouted')));
    fhOpenDlg(`<h2>Where the suggestion missed</h2>${miss.length?`<table class="compact"><thead><tr><th>Bill</th><th>Suggested</th><th>Sent to</th><th>Why</th></tr></thead><tbody>${miss.map(c=>`<tr><td>${esc(shortNum(c.num))}</td><td>${esc((c.ai.divs||[]).map(divName).join(', '))}</td><td>${esc((c.divisions||[]).map(divName).join(', '))}</td><td class="small">${!c.kept_ai?'POC changed it':'Division said wrong section'}</td></tr>`).join('')}</tbody></table>`:'<p>No misses yet.</p>'}`)});
  on('fhThr','onsubmit',async e=>{e.preventDefault();const v=+$('fhThrIn').value.replace(/[$,\s]/g,'');await fhAct('fn/threshold',{amount:v},`Threshold set to ${money(v)}`)});
  on('fhStaffFile','onchange',async e=>{const f=e.target.files[0];if(!f)return;try{FHSTAFF=fhStaffParse(await readSheetFile(f))}catch(err){FHSTAFF={err:err.message}}route(true)});
  app.querySelectorAll('[data-fhsrm]').forEach(b=>b.onclick=()=>{const [i,d]=b.dataset.fhsrm.split('|');const p=FHSTAFF.people[+i];p.divs=p.divs.filter(x=>x!==d);route(true)});
  app.querySelectorAll('[data-fhsadd]').forEach(sel=>sel.onchange=()=>{if(!sel.value)return;FHSTAFF.people[+sel.dataset.fhsadd].divs.push(sel.value);route(true)});
  on('fhStaffCancel','onclick',()=>{FHSTAFF=null;route(true)});
  app.querySelectorAll('[data-fhsrole]').forEach(sel=>sel.onchange=()=>{FHSTAFF.people[+sel.dataset.fhsrole].role=sel.value});
  on('fhStaffApply','onclick',async()=>{const c={};for(const d of fhDivs()){const x=fhContact(d.id);c[d.id]={send:x.send.slice(),cc:x.cc.slice()}}
    for(const p of FHSTAFF.people)for(const d of p.divs){const k=c[d]=c[d]||{send:[],cc:[]};const l=k[p.role||'send'];if(![...k.send,...k.cc].some(x=>x.e.toLowerCase()===p.email.toLowerCase()))l.push({n:p.name,e:p.email})}
    const n=FHSTAFF.people.filter(p=>p.divs.length).length;const r=await fhAct('fn/contacts',{contacts:c},`Added ${plural(n,'person','people')} to the contacts`);if(r)FHSTAFF=null;route(true)});
  on('fhCuForm','onsubmit',async e=>{e.preventDefault();const send=fhPeopleParse($('fhCuSend').value),cc=fhPeopleParse($('fhCuCc').value),id=$('fhCuId').value;
    if(!send.length){toast('Add at least one email address for Send');return}
    const r=await fhAct('fn/customdiv',{id,name:$('fhCuName').value,send,cc},id?'Custom division saved':`Added ${$('fhCuName').value.trim()}`);if(r)route(true)});
  app.querySelectorAll('[data-fhcuedit]').forEach(b=>b.onclick=()=>{const d=FH_CUSTOM.find(x=>x.id===b.dataset.fhcuedit);if(!d)return;const c=fhContact(d.id);
    $('fhCuId').value=d.id;$('fhCuName').value=d.name;$('fhCuSend').value=fhPeopleStr(c.send);$('fhCuCc').value=fhPeopleStr(c.cc);$('fhCuSave').textContent='Save changes';$('fhCuCancel').style.display='';$('fhCuName').focus()});
  on('fhCuCancel','onclick',()=>route(true));
  app.querySelectorAll('[data-fhcudel]').forEach(b=>b.onclick=async()=>{const d=FH_CUSTOM.find(x=>x.id===b.dataset.fhcudel);if(!d||!confirm(`Remove ${d.name}? Requests already sent keep their answers.`))return;await fhAct('fn/customdiv',{action:'delete',id:d.id},`Removed ${d.name}`)});
  on('fhSaveCt','onclick',async()=>{const c={};app.querySelectorAll('[data-ct]').forEach(i=>{c[i.dataset.ct]={send:fhPeopleParse(i.value),cc:fhPeopleParse((app.querySelector(`[data-cc="${CSS.escape(i.dataset.ct)}"]`)||{}).value)}});await fhAct('fn/contacts',{contacts:c},'Contacts saved')});
  app.querySelectorAll('[data-fhmail]').forEach(b=>b.onclick=async()=>{try{const j=await api('fn/outbox-one?id='+b.dataset.fhmail);const m=j.mail;fhOpenDlg(`<h2 style="font-size:17px">${esc(m.subject)}</h2><p class="small muted">To ${esc(m.to_addr)} · ${fmtLong(new Date(m.at))}${m.error?` · <span style="color:var(--maroon)">${esc(m.error)}</span>`:''}</p><iframe sandbox="allow-popups allow-popups-to-escape-sandbox" style="width:100%;height:60vh;border:1px solid var(--line);border-radius:8px" srcdoc="${esc(m.html.replace(/<a /g,'<a target="_blank" '))}"></iframe>`)}catch(e){toast(e.message)}});
}
// keyboard shortcuts on the inbox card
document.addEventListener('keydown',e=>{
  if(!location.hash.startsWith('#fiscal')||FHVIEW!=='inbox'||document.querySelector('dialog[open]')||(typeof TS!=='undefined'&&TS))return;
  if(['INPUT','TEXTAREA','SELECT'].includes((e.target.tagName||''))||e.metaKey||e.ctrlKey||e.altKey)return;
  const click=id=>{const el=$(id);if(el&&!el.disabled){e.preventDefault();el.click()}};
  if(e.key==='Enter')click('fhQueue');else if(e.key==='n'||e.key==='N')click('fhClear');
  else if(e.key==='ArrowRight'){e.preventDefault();FHI++;FHSEL=null;route(true)}else if(e.key==='ArrowLeft'&&FHI>0){e.preventDefault();FHI--;FHSEL=null;route(true)}
});
// ---------- sending the queue: leaving the dashboard, closing the page, or 10 idle minutes
['click','keydown','pointermove','scroll'].forEach(ev=>document.addEventListener(ev,()=>{if(!location.hash.startsWith('#fiscal'))return;fhLastAct=Date.now();if(canFiscal()&&Date.now()-fhPingAt>60e3){fhPingAt=Date.now();api('fn/ping',{}).catch(()=>{})}},{passive:true}));
setInterval(()=>{if(FH&&ME&&queued().length&&Date.now()-fhLastAct>FH_IDLE_MS){fhLastAct=Date.now();fhAct('fn/flush',{}).then(r=>{if(r&&r.sent)toast(`You were away for 10 minutes, so your queued requests were emailed (${plural(r.sent,'email')}).`)})}},30e3);
let fhWasOn=location.hash.startsWith('#fiscal');
window.addEventListener('hashchange',()=>{const onNow=location.hash.startsWith('#fiscal');if(fhWasOn&&!onNow&&FH&&ME&&queued().length){fhAct('fn/flush',{}).then(r=>{if(r&&r.sent)toast(`Fiscal Hive: emailed ${plural(r.divisions,'division')}`)})}fhWasOn=onNow});
window.addEventListener('pagehide',()=>{if(FH&&ME&&queued().length&&location.hash.startsWith('#fiscal'))navigator.sendBeacon('/api/fn/flush',new Blob(['{}'],{type:'application/json'}))});
