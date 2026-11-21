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

// ---------- routing units and rules (from the Fiscal Note Routing workbook)
// Units are the sections that get requests (SAC, Tax, Justice…). Rules match a bill's Utah Code titles and
// chapters (a chapter rule beats its title rule), words in the bill, agencies it names, and combinations.
// An uploaded workbook (Settings) replaces the defaults in config.json.
const fuRouting=()=>(FH&&FH.routing)||{units:CONFIG.fiscalUnits||[],rules:CONFIG.fiscalRules||[]};
const fuList=()=>fuRouting().units||[];
const fuById=id=>fuList().find(u=>u.id===id);
const fuName=id=>(fuById(id)||{}).name||divName(id);
const fuColor=id=>{const u=fuById(id)||divById(id);return u?deptColor(u.dept):''};
const fuOpts=(skip=[])=>CONFIG.departments.map(d=>{const us=fuList().filter(x=>x.dept===d.id&&!skip.includes(x.id));return us.length?`<optgroup label="${esc(d.name)}">${us.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</optgroup>`:''}).join('');
const wordRx=t=>new RegExp(`\\b${String(t).replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+')}`,'i');
function fhRoute(b){
  const R=fuRouting().rules||[], hits={};
  const add=(rule,why,w)=>{for(const u of rule.units){const h=hits[u]=hits[u]||{id:u,score:0,why:[],confirm:false};h.score+=w;if(!h.why.includes(why))h.why.push(why);if(rule.confirm)h.confirm=true}};
  const titles={},chapters={};
  for(const sec of b.secs||[]){const p=String(sec).split('-');titles[p[0]]=(titles[p[0]]||0)+1;if(p[1])chapters[p[0]+'-'+p[1]]=(chapters[p[0]+'-'+p[1]]||0)+1}
  const chRules=R.filter(r=>r.type==='chapter');
  const coveredByChapter=new Set();
  for(const r of chRules)for(const m of r.match)if(chapters[m]){add(r,`Chapter ${m} (${plural(chapters[m],'section')})`,3+chapters[m]);coveredByChapter.add(m)}
  for(const r of R.filter(r=>r.type==='title'))for(const m of r.match)if(titles[m]){
    // sections already handled by a chapter rule don't also count for their title
    const left=titles[m]-Object.entries(chapters).filter(([c])=>c.startsWith(m+'-')&&coveredByChapter.has(c)).reduce((t,[,n])=>t+n,0);
    if(left>0)add(r,`Title ${m} (${plural(left,'section')})`,2+left)}
  const text=[b.title,b.description,(b.subj||[]).join('; ')].join(' \n ');
  for(const r of R.filter(r=>r.type==='keyword'||r.type==='agency')){const m=r.match.find(t=>wordRx(t).test(text));if(m)add(r,r.type==='agency'?`names the ${m}`:`mentions “${m}”`,r.type==='agency'?3:2)}
  for(const r of R.filter(r=>r.type==='combo')){const ok=r.match.every(group=>group.some(t=>wordRx(t).test(text)));if(ok)add(r,r.about||'combination rule',2)}
  let out=Object.values(hits).sort((a,b)=>b.score-a.score);
  if(!out.length){const f=R.find(r=>r.type==='fallback');if(f)out=f.units.map(u=>({id:u,score:0,why:['No rule matched: review it'],confirm:true}))}
  return out.filter(h=>fuById(h.id)||divById(h.id));
}


// ---------- the assessment shown on each card: the AI's when the data update has one, otherwise automatic
function loadAI(s){if(AIDATA[s]!==undefined)return;AIDATA[s]=null;getJSON(`data/${s}/ai.json`).then(j=>{AIDATA[s]=j||{};if(location.hash.startsWith('#fiscal'))route(true)}).catch(()=>{AIDATA[s]={}})}
// Words that point to money: what the bill costs or spends, not new duties for the office.
const NEED_RE=/\b(appropriat\w*|grant program|restricted account|special revenue fund|expendable (?:special revenue )?fund|general fund|income tax fund|ongoing (?:funding|appropriation)|one-time (?:funding|appropriation)|fee (?:increase|schedule)|new (?:position|fte)s?|full-time equivalent)\b/gi;
function autoAssess(b){
  const ai=(AIDATA[b.session]||{})[b.num];
  const rt=fhRoute(b), top=rt.length?rt[0].score:0, divs=rt.filter((h,i)=>i===0||h.score>=Math.max(3,top*0.5)).slice(0,3).map(h=>h.id);
  if(ai&&(!ai.ver||ai.ver===b.version)) return {divs,route:rt,need:ai.need||'unsure',why:ai.why||'',sum:ai.sum||b.description||'',conf:ai.conf||70,src:'ai'};
  const c=fnCost(b);
  if(b.fn&&c&&(c.on>0||c.one>0)) return {divs,route:rt,need:'likely',why:`The Legislature’s fiscal note shows a cost of ${money(Math.max(0,c.on)+Math.max(0,c.one))} to state funds`,sum:b.description||'',conf:85,src:'auto'};
  const text=[b.title,b.description,...((TEXT[b.session]||{})[b.num]||[]).filter(p=>p[0]==='Highlighted provisions').map(p=>p[1].replace(/[\u0001\u0002]/g,''))].join(' ');
  const hits=[...new Set((text.match(NEED_RE)||[]).map(x=>x.toLowerCase().replace(/\s+/g,' ')))];
  if(b.fn&&b.fn.none) return {divs,route:rt,need:'unlikely',why:'The Legislature’s fiscal note found no direct cost to the state',sum:b.description||'',conf:70,src:'auto'};
  if(hits.length>=2) return {divs,route:rt,need:'likely',why:`The bill text mentions ${hits.slice(0,3).map(h=>`“${h}”`).join(', ')}`,sum:b.description||'',conf:Math.min(75,50+hits.length*8),src:'auto'};
  if(hits.length===1) return {divs,route:rt,need:'unsure',why:`The bill text mentions “${hits[0]}”`,sum:b.description||'',conf:45,src:'auto'};
  return {divs,route:rt,need:'unlikely',why:'Nothing in the title, summary or fiscal note points to a cost',sum:b.description||'',conf:40,src:'auto'};
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
  try{const j=await api('fn/state?session='+encodeURIComponent(S));FH={...j,session:S};}catch(e){FH={error:e.message,session:S}}
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
function divChips(sel,ai){
  const why=id=>(ai.route||[]).find(h=>h.id===id);
  const who=id=>{const c=fhContact(id);return c.send.length?`To: ${c.send.map(x=>x.n||x.e).join(', ')}${c.cc.length?' · CC: '+c.cc.map(x=>x.n||x.e).join(', '):''}`:'No contacts yet: add them under Settings'};
  const others=(ai.route||[]).filter(h=>!sel.includes(h.id)).slice(0,4);
  return `<div class="fh-divs">${sel.map(d=>{const w=why(d);return `<span class="chip fh-chip" data-full="${esc(who(d))}"><span class="dot" style="--c:${fuColor(d)}"></span>${esc(fuName(d))}${w?` <span class="tiny muted">${esc(w.why.slice(0,2).join('; '))}</span>${w.confirm?' <span class="tiny fh-conf" title="This rule is marked CONFIRM in the routing workbook">rule to confirm</span>':''}`:''}<button type="button" data-fhrm="${esc(d)}" aria-label="Remove ${esc(fuName(d))}">×</button></span>`}).join('')||'<span class="small muted">No section chosen yet.</span>'}
   <select id="fhAdd" aria-label="Add a section"><option value="">+ Add a section</option>${fuOpts(sel)}</select></div>
   ${others.length?`<div class="tiny muted" style="margin-top:6px">Also matched: ${others.map(h=>`<button type="button" class="linkbtn tiny" data-fhaddu="${esc(h.id)}" title="${esc(h.why.join('; '))}">+ ${esc(fuName(h.id))}</button>`).join(' ')}</div>`:''}`;
}
function fhContact(id){const c=(FH.contacts||{})[id];if(!c)return {send:[],cc:[]};return Array.isArray(c)?{send:c.map(e=>({e,n:''})),cc:[]}:{send:c.send||[],cc:c.cc||[]}}
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
    ${prev?`<div class="fh-prev small"><b>Earlier version (${esc(prev.version)}):</b> ${pr.length?pr.map(r=>`${esc(fuName(r.division))}: ${fhAnswerText(r)}`).join(' · '):esc(prev.status==='cleared'?'No request was needed.':'Not answered yet.')}</div>`:''}
    <span class="flabel" style="margin-top:14px">Send to <span class="tiny muted" style="font-weight:400">· suggested from the Utah Code sections the bill amends; hover a section for its To and CC people</span></span>${divChips(FHSEL.divs,ai)}</div>
    <div class="fh-actions"><button class="btn" data-fhgo="-1" ${FHI?'':'disabled'}>← Back</button><span class="grow"></span><button class="btn" data-fhgo="1">Skip →</button><button class="btn" id="fhClear">No request needed</button><button class="btn primary" id="fhQueue" ${FHSEL.divs.length?'':'disabled'}>Queue for ${plural(FHSEL.divs.length,'section')}</button></div>
   </article></div></div>`;
}
function fhAnswerText(r){
  if(r.status==='impact') return `<b>${money(+r.answer.amount)}</b> ${esc(r.answer.kind||'')}${r.answer.covers?` · ${esc(r.answer.covers.slice(0,120))}`:''}`;
  return {queued:'queued',pending:`waiting since ${r.sent_at?fmtMD(new Date(r.sent_at)):'—'}`,no_impact:'no impact',wrong:`wrong section${r.answer.suggest?` → ${esc(r.answer.suggest==='unknown'?'not sure':fuName(r.answer.suggest))}`:''}`,rerouted:'sent elsewhere',nocontact:'<span style="color:var(--maroon)">no contact</span>'}[r.status]||esc(r.status);
}
function fhList(cards,desc){
  const rows=cards.slice().sort((a,b)=>(b.sent_at||b.updated_at||'').localeCompare(a.sent_at||a.updated_at||''));
  return `<div class="card"><p class="desc">${desc}</p>${rows.length?`<div class="fh-rows">${rows.map(c=>{const rs=reqsOf(c.id).filter(r=>r.status!=='rerouted');const tot=cardTotal(c.id);const last=rs.map(r=>r.last_reminded_at).filter(Boolean).sort().pop();const b=BYKEY[`${c.session}/${c.num}`];
    return `<div class="fh-row"><div><a class="billnum" href="${b?billHref(b):'#'}">${esc(shortNum(c.num))}</a> <span class="pill ink">${esc(c.version)}</span><div class="serif">${esc(c.title)}</div><div class="tiny muted">Routed by ${esc(c.poc===ME.user?'you':c.poc)}${c.sent_at?' · sent '+fmtLong(new Date(c.sent_at)):''}</div></div>
     <div class="fh-reqs">${rs.map(r=>`<div><span class="dot" style="--c:${fuColor(r.division)}"></span> ${esc(fuName(r.division))}: ${fhAnswerText(r)}</div>`).join('')}${tot?`<div class="fh-total ${tot>FH.threshold?'over':''}">Total ${money(tot)}${tot>FH.threshold?' · needs Appropriations':''}</div>`:''}</div>
     <div class="fh-rbtns">${rs.some(r=>r.status==='pending')?`<button class="btn sm fh-bell" data-fhbell="${esc(c.id)}" title="Email a reminder now${last?`; last reminder ${fmtLong(new Date(last))}`:''}" aria-label="Send a reminder for ${esc(shortNum(c.num))}">🔔</button>${last?`<span class="tiny muted">reminded ${fmtMD(new Date(last))}</span>`:''}`:''}<button class="btn sm" data-fhlog="${esc(c.id)}">History</button></div></div>`}).join('')}</div>`:'<p class="empty">Nothing here.</p>'}</div>`;
}
function fhAttention(cards){
  if(!cards.length) return `<div class="card"><p class="empty">Nothing needs attention.</p></div>`;
  return `<div class="card"><p class="desc">A division said a bill was sent to the wrong place, or there’s nobody to email for a division. Confirm where it should go and send it on.</p><div class="fh-rows">${cards.map(c=>{const rs=reqsOf(c.id).filter(r=>r.status==='wrong'||r.status==='nocontact');
    return rs.map(r=>{const sug=r.answer&&r.answer.suggest&&r.answer.suggest!=='unknown'?r.answer.suggest:'';
     return `<div class="fh-row attn"><div><b>${esc(shortNum(c.num))}</b> <span class="pill ink">${esc(c.version)}</span><div class="serif">${esc(c.title)}</div></div>
      <div>${r.status==='wrong'?`<div><b>${esc(fuName(r.division))}</b> says it was sent to the wrong place${sug?` and should go to <b>${esc(fuName(sug))}</b>`:''}.</div>${r.answer.note?`<div class="small">“${esc(r.answer.note)}”${r.answer.by?` (${esc(r.answer.by)})`:''}</div>`:''}`:`<div><b>${esc(fuName(r.division))}</b> has nobody to email. <button class="linkbtn" data-fhview="settings">Add a contact</button>, then resend.</div>`}</div>
      <div class="fh-rbtns"><select data-fhto="${esc(r.id)}" aria-label="Send to">${fuList().map(d=>`<option value="${d.id}" ${(sug||r.division)===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select><button class="btn sm primary" data-fhreroute="${esc(c.id)}|${esc(r.id)}">Send</button></div></div>`}).join('')}).join('')}</div></div>`;
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
  const dep={};for(const r of rows){const d=(fuById(r.d)||divById(r.d)||{}).dept;if(!d)continue;(dep[d]=dep[d]||[]).push(r.med)}
  return `<div class="grid2" style="align-items:start"><div class="card"><h2>Fastest responders</h2><p class="desc">Ranked by typical (median) time from email to answer. Only the top of the board is shown.</p>
   ${weekly?`<div class="fh-weekly">🏆 <b>This week’s winner:</b> ${esc(fuName(weekly.d))}, typically answering in ${hrs(weekly.wk)}</div>`:''}
   ${rows.length?`<ol class="fh-board">${rows.slice(0,8).map((r,i)=>`<li><span class="rk">${medals[i]||i+1}</span><span><b>${esc(fuName(r.d))}</b><span class="tiny muted"> ${esc(deptName((fuById(r.d)||divById(r.d)||{}).dept))}</span><div class="badges">${r.pct>=80?'<span class="bdg">Same-Day Swarm</span>':''}${r.ans>=10?'<span class="bdg">Busy Bee</span>':''}${r.med<2?'<span class="bdg">Lightning</span>':''}</div></span><span class="v">${hrs(r.med)}<span class="tiny muted">${r.pct}% within a day</span></span></li>`).join('')}</ol>`:'<p class="empty">The board fills in as divisions answer.</p>'}
   ${rows.length>8?`<p class="small muted">Everyone else: every answer moves you up. Keep it buzzing!</p>`:''}</div>
   <div class="card"><h2>By department</h2><p class="desc">Typical response time across each department’s divisions.</p>
   ${Object.keys(dep).length?Object.entries(dep).map(([d,l])=>({d,m:median(l)})).sort((a,b)=>a.m-b.m).map((x,i,a)=>`<div class="fh-dep"><span><b>${esc(deptName(x.d))}</b></span><div class="bar" style="--c:${deptColor(x.d)}"><i style="width:${Math.max(6,100-(x.m/Math.max(...a.map(y=>y.m))*85)).toFixed(0)}%"></i></div><span class="small">${hrs(x.m)}</span></div>`).join(''):'<p class="empty">No answers yet.</p>'}</div></div>`;
}
// ---------- routing workbook / staff list upload
// Reads the Fiscal Note Routing workbook (Contacts tab: Div Code, Division, Role, Name, Email; Code to
// Division tab: the rules), or any sheet with a name, an email, a section and a Send/CC role column.
let FHSTAFF=null;
async function readWorkbook(file){
  if(/\.csv$|\.txt$/i.test(file.name)) return {Sheet1:parseCSV(await file.text())};
  const X=await loadXLSX();const wb=X.read(await file.arrayBuffer());const out={};
  for(const n of wb.SheetNames)out[n]=X.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:false,defval:''}).map(r=>r.map(x=>String(x).trim())).filter(r=>r.some(Boolean));
  return out;
}
const fuNorm=x=>String(x||'').toLowerCase().replace(/\(.*?\)/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const DEPT_GUESS=n=>/appeal|constitutional|special lit/i.test(n)?'appellate':/investigat|justice|medicaid fraud|financial fraud|mortgage/i.test(n)?'criminal':/public protection|antitrust|consumer/i.test(n)?'pp':'civil';
function fhParseWorkbook(book){
  const names=Object.keys(book), find=re=>names.find(n=>re.test(n));
  const cSheet=book[find(/contact/i)||names[0]]||[], rSheet=book[find(/code.*division|rules?|routing/i)]||null;
  if(!cSheet.length)return {err:'That file is empty.'};
  const hdr=cSheet[0].map(x=>x.toLowerCase()), col=re=>hdr.findIndex(h=>re.test(h));
  const ec=col(/mail/), nc=col(/^name|full name/), rc=col(/role|send|type/), cc=col(/div.*code|^code$/), dc=col(/division|section|unit|covers|area/);
  if(ec<0)return {err:'No email column found. The sheet needs a column of email addresses.'};
  const units={}, people=[];
  const unitFor=(code,name)=>{
    const known=fuList().find(u=>(code&&u.code&&u.code.toLowerCase()===code.toLowerCase())||(name&&fuNorm(u.name)===fuNorm(name)));
    if(known)return known.id;
    if(!code&&!name)return '';
    const c=(code||name).replace(/[^A-Za-z0-9]+/g,'').slice(0,20)||'X', id='fu-'+c.toLowerCase();
    units[id]=units[id]||{id,code:code||c.toUpperCase(),name:name||code,dept:DEPT_GUESS(name||code)};return id};
  for(const r of cSheet.slice(1)){
    const email=(r[ec]||'').trim();if(!/@/.test(email))continue;
    const u=unitFor(cc>=0?r[cc]:'',dc>=0?r[dc]:'');
    people.push({unit:u,name:nc>=0?r[nc]:'',email,role:rc>=0&&/cc|copy/i.test(r[rc])?'cc':'send'});
  }
  let rules=null;
  if(rSheet&&rSheet.length>1){
    const h=rSheet[0].map(x=>x.toLowerCase()), k=re=>h.findIndex(x=>re.test(x));
    const iId=k(/rule id/),iT=k(/rule type/),iTr=k(/trigger|code \//),iAb=k(/what it covers/),iDc=k(/div code/),iDv=k(/^division/),iSt=k(/status/);
    const by={};
    for(const r of rSheet.slice(1)){
      const id=r[iId];if(!id)continue;const t=(r[iT]||'').toLowerCase(), trig=r[iTr]||'';
      const type=/^code title/.test(t)?'title':/^code chapter/.test(t)?'chapter':/keyword/.test(t)?'keyword':/agency/.test(t)?'agency':/combination/.test(t)?'combo':/fallback/.test(t)?'fallback':'';
      if(!type)continue;
      const u=unitFor(r[iDc]||'',r[iDv]||'');if(!u)continue;
      if(!by[id]){
        const match=type==='title'?[trig.replace(/title/i,'').trim()]:type==='chapter'?[trig.replace(/chapter/i,'').trim()]:type==='combo'?trig.split('+').map(g=>g.split('/').map(x=>x.trim()).filter(Boolean)):type==='fallback'?[]:trig.split('/').map(x=>x.trim()).filter(Boolean);
        if(type==='combo'&&match[1])match[1]=[...new Set([...match[1],'crime','criminal','offense','felony','misdemeanor'])];
        by[id]={id,type,match,units:[],about:(r[iAb]||'').replace(/\s*\((handwritten|tracker|ISF)[^)]*\)/gi,'').trim(),confirm:!/^ok$/i.test(r[iSt]||'')};
      }
      if(!by[id].units.includes(u))by[id].units.push(u);
    }
    rules=Object.values(by);
  }
  return {people,newUnits:Object.values(units),rules,file:''};
}
function fhStaffCard(){
  const P=FHSTAFF&&FHSTAFF.people, rt=FH.routing;
  const byU={};if(P)for(const p of P)(byU[p.unit]=byU[p.unit]||[]).push(p);
  const unitsAll=[...fuList(),...((FHSTAFF&&FHSTAFF.newUnits)||[])], nm=id=>(unitsAll.find(u=>u.id===id)||{}).name||id;
  return `<div class="card"><h2>Routing workbook</h2><p class="desc">Upload the <b>Fiscal Note Routing and Contacts</b> workbook (or any sheet with a name, email, section and a Send/CC role). The <b>Contacts</b> tab sets who gets each section’s requests: Send people are on the To line and answer; CC people are copied. The <b>Code to Division</b> tab sets which Utah Code titles, chapters, words and agencies point to which section. You’ll see a preview first.</p>
   <div class="filters"><div class="field"><label for="fhStaffFile">Excel or CSV file</label><input type="file" id="fhStaffFile" accept=".xlsx,.xls,.csv,.txt"></div></div>
   <p class="small muted">${rt?`Using rules uploaded ${rt.at?fmtLong(new Date(rt.at)):''}${rt.by?' by '+esc(rt.by):''}: ${plural(rt.units.length,'section')}, ${plural(rt.rules.length,'rule')}. <button type="button" class="linkbtn small" id="fhRtReset">Go back to the built-in rules</button>`:`Using the built-in rules from the 2027 draft workbook: ${plural(fuList().length,'section')}, ${plural((CONFIG.fiscalRules||[]).length,'rule')}.`}</p>
   ${FHSTAFF&&FHSTAFF.err?`<p class="small" style="color:var(--maroon)">${esc(FHSTAFF.err)}</p>`:''}
   ${P?`<div class="fh-prev"><b>${plural(P.length,'person','people')}</b> in ${plural(Object.keys(byU).length,'section')} (${P.filter(p=>p.role==='send').length} Send, ${P.filter(p=>p.role==='cc').length} CC)${FHSTAFF.rules?` · <b>${plural(FHSTAFF.rules.length,'routing rule')}</b>, ${FHSTAFF.rules.filter(r=>r.confirm).length} marked to confirm`:''}${FHSTAFF.newUnits.length?` · new sections: ${FHSTAFF.newUnits.map(u=>esc(u.name)).join(', ')}`:''}</div>
    <div class="tablewrap" style="margin-top:10px"><table class="compact"><thead><tr><th>Section</th><th>Send (To)</th><th>CC</th></tr></thead><tbody>${Object.entries(byU).sort((a,b)=>nm(a[0]).localeCompare(nm(b[0]))).map(([u,l])=>`<tr><td><b>${esc(nm(u))}</b></td><td class="small">${l.filter(p=>p.role==='send').map(p=>`${esc(p.name||'')} <span class="muted">${esc(p.email)}</span>`).join('<br>')||'<span class="muted">Nobody: requests would go unanswered</span>'}</td><td class="small">${l.filter(p=>p.role==='cc').map(p=>`${esc(p.name||'')} <span class="muted">${esc(p.email)}</span>`).join('<br>')}</td></tr>`).join('')}</tbody></table></div>
    <div class="filters" style="margin-top:10px"><label class="small"><input type="checkbox" id="fhStRepl" checked> Replace all current contacts with this list</label>${FHSTAFF.rules?`<label class="small"><input type="checkbox" id="fhStRules" checked> Use this file’s routing rules</label>`:''}</div>
    <p style="margin-top:10px"><button class="btn primary" id="fhStaffApply">Save</button> <button class="btn" id="fhStaffCancel">Cancel</button></p>`:''}</div>`;
}
function fhRulesCard(){
  const R=fuRouting().rules||[];const TY={title:'Code title',chapter:'Code chapter',keyword:'Words in the bill',agency:'Agency named',combo:'Combination',fallback:'If nothing matches'};
  const show=FHRULEF==='confirm'?R.filter(r=>r.confirm):R;
  return `<div class="card"><h2>Routing rules</h2><p class="desc">How each card’s suggested sections are picked. A chapter rule beats the rule for its whole title. Rules marked <span class="fh-conf tiny">to confirm</span> are first drafts in the workbook; fix them there and upload it again.</p>
   <div class="seg" role="group">${[['all',`All (${R.length})`],['confirm',`To confirm (${R.filter(r=>r.confirm).length})`]].map(([k,l])=>`<button type="button" data-fhrulef="${k}" class="${FHRULEF===k?'on':''}">${l}</button>`).join('')}</div>
   <div class="tablewrap" style="margin-top:10px;max-height:420px"><table class="compact"><thead><tr><th>Rule</th><th>Kind</th><th>Matches</th><th>Goes to</th></tr></thead><tbody>${show.map(r=>`<tr><td class="small">${esc(r.id)}${r.confirm?' <span class="fh-conf tiny">to confirm</span>':''}</td><td class="small">${TY[r.type]||r.type}</td><td class="small">${esc(r.type==='combo'?r.match.map(g=>g.join(' / ')).join(' + '):r.match.join(' / ')||'—')}<div class="sub">${esc(r.about||'')}</div></td><td class="small">${r.units.map(u=>`<span class="chip"><span class="dot" style="--c:${fuColor(u)}"></span>${esc(fuName(u))}</span>`).join(' ')}</td></tr>`).join('')}</tbody></table></div></div>`;
}
let FHRULEF='all';
// "Name <email>, email" ↔ [{n,e}]
const fhPeopleStr=l=>(l||[]).map(x=>x.n?`${x.n} <${x.e}>`:x.e).join(', ');
const fhPeopleParse=t=>String(t||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean).map(x=>{const m=x.match(/^(.*?)\s*<([^>]+)>$/);return m?{n:m[1].replace(/^"|"$/g,''),e:m[2]}:{n:'',e:x}}).filter(x=>/@/.test(x.e));
let FHOUT=null;
function fhSettings(){
  if(!FHOUT){api('fn/outbox').then(j=>{FHOUT=j;route(true)}).catch(()=>{FHOUT={outbox:[]}})}
  const groups=CONFIG.departments.map(d=>{const us=fuList().filter(x=>x.dept===d.id);if(!us.length)return '';return `<h4 style="margin:16px 0 4px">${esc(d.name)}</h4>${us.map(x=>{const c=fhContact(x.id);const fb=(FH.sectionEmails||{})[x.id]||[];
    return `<div class="fh-contact2"><b>${esc(x.name)}${x.code?` <span class="tiny muted">${esc(x.code)}</span>`:''}</b><div class="field"><label for="ct-${x.id}" class="tiny">Send (To)</label><input id="ct-${x.id}" data-ct="${x.id}" value="${esc(fhPeopleStr(c.send))}" placeholder="${fb.length?esc('Using accounts in this section: '+fb.join(', ')):'Name <name@agutah.gov>, …'}"></div><div class="field"><label for="cc-${x.id}" class="tiny">CC</label><input id="cc-${x.id}" data-cc="${x.id}" value="${esc(fhPeopleStr(c.cc))}" placeholder="Copied on every request"></div></div>`}).join('')}`}).join('');
  return `<div class="grid2" style="align-items:start"><div class="card"><h2>Appropriations threshold</h2><p class="desc">When a bill’s estimated impact (all sections added together) is more than this, it’s flagged as needing the Appropriations committee.</p>
    <form id="fhThr" class="filters"><div class="field"><label for="fhThrIn">Threshold (dollars)</label><input id="fhThrIn" inputmode="numeric" value="${FH.threshold}"></div><button class="btn primary">Save</button></form><p class="small muted">Default is $20,000.</p></div>
   <div class="card"><h2>Outbox</h2><p class="desc">${FH.mailReady?'Every email the site has sent, newest first.':'Email isn’t connected yet (it needs RESEND_API_KEY and MAIL_FROM), so emails wait here. Open one to see exactly what a section would get, and use its links to test answering.'}</p>
    ${FHOUT&&FHOUT.outbox.length?`<div class="rows">${FHOUT.outbox.slice(0,30).map(m=>`<div class="row" style="grid-template-columns:110px minmax(0,1fr) auto"><span class="small">${fmtMD(new Date(m.at))} ${fmtTime(new Date(m.at))}</span><div class="what" style="font-size:14.5px">${esc(m.subject)}<span class="sub">to ${esc(m.to_addr)}</span></div><div class="r">${m.sent?'<span class="pill pass">Sent</span>':m.error?`<span class="pill warn" title="${esc(m.error)}">Failed</span>`:'<span class="pill muted">Waiting</span>'}<button class="btn sm" data-fhmail="${m.id}">Open</button></div></div>`).join('')}</div>`:'<p class="empty">No emails yet.</p>'}</div></div>
   ${fhStaffCard()}
   <div class="card"><h2>Who gets requests</h2><p class="desc">For each section: <b>Send</b> people are on the To line and can answer; <b>CC</b> people are copied on the request and its reminder. Separate people with commas; “Name &lt;email&gt;” keeps their name. If Send is blank, requests go to approved accounts that work in that section.</p>${groups}<p><button class="btn primary" id="fhSaveCt">Save contacts</button></p></div>
   ${fhRulesCard()}`;
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
  app.querySelectorAll('[data-fhaddu]').forEach(b=>b.onclick=()=>{if(!FHSEL.divs.includes(b.dataset.fhaddu))FHSEL.divs.push(b.dataset.fhaddu);route(true)});
  const cur=()=>{const l=inboxList();return l[Math.max(0,Math.min(FHI,l.length-1))]};
  on('fhQueue','onclick',async()=>{const x=cur();if(!x||!FHSEL.divs.length)return;await fhAct('fn/route',{id:cardId(x.b),title:x.b.title,divisions:FHSEL.divs,ai:x.ai,prev:x.prev?x.prev.id:''},`${shortNum(x.b.num)} queued for ${FHSEL.divs.map(divName).join(', ')}`);FHSEL=null});
  on('fhClear','onclick',async()=>{const x=cur();if(!x)return;await fhAct('fn/clear',{id:cardId(x.b),title:x.b.title,ai:x.ai},`${shortNum(x.b.num)}: no request needed`);FHSEL=null});
  on('fhSend','onclick',async()=>{const r=await fhAct('fn/flush',{});if(r)toast(r.sent?`Sent ${plural(r.sent,'email')} to ${plural(r.divisions,'division')}`:'Nothing could be sent: check that each division has a contact')});
  app.querySelectorAll('[data-fhbell]').forEach(b=>b.onclick=async()=>{const r=await fhAct('fn/remind',{id:b.dataset.fhbell});if(r)toast(r.reminded?`Reminder sent (${plural(r.reminded,'email')})`:'Everyone has already answered')});
  app.querySelectorAll('[data-fhreroute]').forEach(b=>b.onclick=async()=>{const [id,from]=b.dataset.fhreroute.split('|');const sel=app.querySelector(`[data-fhto="${CSS.escape(from)}"]`);await fhAct('fn/reroute',{id,from,division:sel.value},`Queued for ${fuName(sel.value)}`)});
  app.querySelectorAll('[data-fhlog]').forEach(b=>b.onclick=async()=>{try{const j=await api('fn/log?id='+encodeURIComponent(b.dataset.fhlog));fhOpenDlg(`<h2>History</h2><p class="small muted">${esc(b.dataset.fhlog.replace(/\//g,' · '))}</p><table class="compact"><tbody>${j.log.map(x=>`<tr><td style="white-space:nowrap">${fmtMDY(new Date(x.at))} ${fmtTime(new Date(x.at))}</td><td>${esc(x.by)}</td><td>${esc(x.what)}</td></tr>`).join('')||'<tr><td>No history.</td></tr>'}</tbody></table>`)}catch(e){toast(e.message)}});
  app.querySelectorAll('[data-fhmiss]').forEach(b=>b.onclick=()=>{const miss=(FH.cards||[]).filter(c=>c.status!=='cleared'&&(c.ai.divs||[]).length&&(!c.kept_ai||reqsOf(c.id).some(r=>r.status==='wrong'||r.status==='rerouted')));
    fhOpenDlg(`<h2>Where the suggestion missed</h2>${miss.length?`<table class="compact"><thead><tr><th>Bill</th><th>Suggested</th><th>Sent to</th><th>Why</th></tr></thead><tbody>${miss.map(c=>`<tr><td>${esc(shortNum(c.num))}</td><td>${esc((c.ai.divs||[]).map(divName).join(', '))}</td><td>${esc((c.divisions||[]).map(divName).join(', '))}</td><td class="small">${!c.kept_ai?'POC changed it':'Division said wrong section'}</td></tr>`).join('')}</tbody></table>`:'<p>No misses yet.</p>'}`)});
  on('fhThr','onsubmit',async e=>{e.preventDefault();const v=+$('fhThrIn').value.replace(/[$,\s]/g,'');await fhAct('fn/threshold',{amount:v},`Threshold set to ${money(v)}`)});
  on('fhStaffFile','onchange',async e=>{const f=e.target.files[0];if(!f)return;try{FHSTAFF=fhParseWorkbook(await readWorkbook(f))}catch(err){FHSTAFF={err:err.message}}route(true)});
  on('fhStaffCancel','onclick',()=>{FHSTAFF=null;route(true)});
  on('fhRtReset','onclick',async()=>{if(!confirm('Go back to the built-in routing rules? Contacts stay as they are.'))return;if(await fhAct('fn/routing',{reset:true},'Back to the built-in rules'))route(true)});
  app.querySelectorAll('[data-fhrulef]').forEach(b=>b.onclick=()=>{FHRULEF=b.dataset.fhrulef;route(true)});
  on('fhStaffApply','onclick',async()=>{
    const X=FHSTAFF, useRules=$('fhStRules')&&$('fhStRules').checked, repl=$('fhStRepl').checked;
    if(useRules||X.newUnits.length){const units=[...fuList().filter(u=>!X.newUnits.some(n=>n.id===u.id)),...X.newUnits];
      if(!await fhAct('fn/routing',{units,rules:useRules?X.rules:fuRouting().rules},'Saved the routing rules'))return}
    const c={};if(!repl)for(const u of fuList())c[u.id]=fhContact(u.id);
    for(const p of X.people){if(!p.unit)continue;const k=c[p.unit]=c[p.unit]||{send:[],cc:[]};const l=k[p.role];if(!l.some(x=>x.e.toLowerCase()===p.email.toLowerCase()))l.push({n:p.name,e:p.email})}
    if(await fhAct('fn/contacts',{contacts:c,replace:repl},`Saved contacts for ${plural(Object.keys(c).length,'section')}`)){FHSTAFF=null}route(true)});
  on('fhSaveCt','onclick',async()=>{const c={};app.querySelectorAll('[data-ct]').forEach(i=>{c[i.dataset.ct]={send:fhPeopleParse(i.value),cc:fhPeopleParse((app.querySelector(`[data-cc="${CSS.escape(i.dataset.ct)}"]`)||{}).value)}});
    await fhAct('fn/contacts',{contacts:c},'Contacts saved');route(true)});
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
