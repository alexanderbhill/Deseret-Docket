/* Session wrap-up: end-of-session scorecard, governor watch, implementation tracker and personal
   season stats. Also the one-page hearing prep packet. */
'use strict';
let WRAPVIEW='score', IMPL=null, MYSTATS=null;
const posSide=p=>/support/.test(p||'')?'support':/oppose/.test(p||'')?'oppose':'';
function scoreRows(S){
  return allRows(S).filter(b=>!b.file&&posSide(posOf(b))).map(b=>{const o=outcome(b);const side=posSide(posOf(b));
    const matched=o?((side==='support'&&o.k==='pass')||(side==='oppose'&&o.k==='dead')):null;return {b,o,side,matched}});
}
function govStatus(b){
  const acts=[b.act,...b.hist.map(h=>h[1])].join(' | ');
  if(/vetoed/i.test(acts)&&/override/i.test(acts))return ['Veto overridden','pass'];
  if(/vetoed/i.test(acts))return ['Vetoed','dead'];
  if(/law without (the )?governor/i.test(acts))return ['Law without signature','pass'];
  if(/governor signed|signed by (the )?governor/i.test(acts))return ['Signed','pass'];
  if(/to governor|enrolled bill to printing|received enrolled/i.test(acts))return ['Awaiting the governor','ink'];
  return null;
}
function vetoDeadline(S){const c=(CONFIG.sessions||{})[S];const d=c&&(c.deadlines||[]).find(x=>/governor may sign or veto/i.test(x[2]));return d?pd(d[0]):null}

function pageWrap(sub){
  if(!ME)return shell('',`<div class="card"><h2>Session wrap-up</h2><p class="desc"><a href="/login">Sign in</a> to see the office’s scorecard.</p></div>`);
  if(sub)WRAPVIEW=sub;
  const S=UI.session;if(!BILLS[S]){loadSession(S).then(()=>route(true));return shell('postsession','<div class="card"><p>Loading…</p></div>')}
  const views=[['score','Scorecard'],['gov','Governor watch'],['impl','Implementation tracker'],['me','My season']];
  let body=WRAPVIEW==='gov'?wrapGov(S):WRAPVIEW==='impl'?wrapImpl(S):WRAPVIEW==='me'?wrapMe(S):wrapScore(S);
  return shell('postsession',`<div class="card"><h2>Session wrap-up · ${esc(sessName(S))}</h2><p class="desc">How the session went for the office: every position and how it turned out, what the governor does next, what has to be implemented, and your own season in numbers.</p>
   <nav class="fh-tabs">${views.map(([k,l])=>`<button type="button" data-wrapv="${k}" class="${WRAPVIEW===k?'on':''}" aria-pressed="${WRAPVIEW===k}">${l}</button>`).join('')}</nav></div>${body}`);
}
function wrapScore(S){
  const rows=scoreRows(S), dec=rows.filter(r=>r.o), won=dec.filter(r=>r.matched);
  const byDept={};for(const r of dec)for(const d of (deptsOf(r.b).length?deptsOf(r.b):['none'])){const x=byDept[d]=byDept[d]||{n:0,w:0};x.n++;if(r.matched)x.w++}
  const pct=dec.length?Math.round(won.length/dec.length*100):0;
  return `<div class="card"><div class="score-hd"><div class="score-big"><b>${dec.length?pct+'%':'—'}</b><span>of decided positions went the office’s way</span></div>
    <div class="stat3"><div><span>Positions taken</span><b>${rows.length}</b></div><div><span>Decided</span><b>${dec.length}</b></div><div><span>Went our way</span><b>${won.length}</b></div><div><span>Still pending</span><b>${rows.length-dec.length}</b></div></div>
    <button class="btn" id="scoreCsv">Download .csv</button></div>
   ${Object.keys(byDept).length?`<h3 style="font-family:var(--sans);font-size:17px">By department</h3>${Object.entries(byDept).map(([d,x])=>`<div class="fh-dep"><span><b>${esc(d==='none'?'No department':deptName(d))}</b></span><div class="bar" style="--c:${d==='none'?'var(--muted)':deptColor(d)}"><i style="width:${Math.round(x.w/x.n*100)}%"></i></div><span class="small">${x.w} of ${x.n} (${Math.round(x.w/x.n*100)}%)</span></div>`).join('')}`:''}
   <div class="tablewrap" style="margin-top:16px"><table class="compact"><thead><tr><th>Bill</th><th>Title</th><th>Office position</th><th>Outcome</th><th>Matched?</th></tr></thead><tbody>${rows.sort((a,b)=>SORTS.num(a.b,b.b)).map(r=>`<tr><td><a class="billnum" href="${billHref(r.b)}">${esc(shortNum(r.b.num))}</a></td><td class="serif">${esc(r.b.title)}</td><td><span class="pos" style="--c:${posColor(posOf(r.b))}">${esc(posName(posOf(r.b)))}</span></td><td>${r.o?`<span class="pill ${r.o.k}">${esc(r.o.l)}</span>`:'<span class="muted">Pending</span>'}</td><td>${r.matched===null?'—':r.matched?'<b style="color:var(--green)">Yes</b>':'<b style="color:var(--maroon)">No</b>'}</td></tr>`).join('')||'<tr><td colspan="5">No positions taken this session.</td></tr>'}</tbody></table></div>
   <p class="small muted">“Went our way” means a supported bill passed or an opposed bill died. Neutral positions aren’t counted. Useful for the annual report and the budget request.</p></div>`;
}
function wrapGov(S){
  const dl=vetoDeadline(S);const rows=allRows(S).filter(b=>!b.file&&(posOf(b)||onOffice(b))).map(b=>({b,g:govStatus(b)})).filter(x=>x.g);
  const wait=rows.filter(x=>x.g[0]==='Awaiting the governor');
  const left=dl?Math.ceil((dl-TODAY)/864e5):null;
  return `<div class="card"><h2>Governor watch</h2><p class="desc">Bills the office tracked that passed the Legislature, and what the governor did with them. ${dl?`The last day to sign or veto is <b>${fmtLong(dl)}</b>${left>=0?` (<b>${plural(left,'day')}</b> left)`:''}.`:''}</p>
   ${wait.length?`<div class="alertbox warnbox"><b>${plural(wait.length,'bill')} waiting on the governor.</b> Signings and vetoes show up on the Updates page as they happen.</div>`:''}
   <div class="tablewrap"><table class="compact"><thead><tr><th>Bill</th><th>Title</th><th>Office position</th><th>Status</th><th>Last action</th></tr></thead><tbody>${rows.sort((a,b)=>(a.g[0]==='Awaiting the governor'?0:1)-(b.g[0]==='Awaiting the governor'?0:1)||SORTS.num(a.b,b.b)).map(({b,g})=>`<tr><td><a class="billnum" href="${billHref(b)}">${esc(shortNum(b.num))}</a></td><td class="serif">${esc(b.title)}</td><td>${posOf(b)?`<span class="pos" style="--c:${posColor(posOf(b))}">${esc(posName(posOf(b)))}</span>`:'—'}</td><td><span class="pill ${g[1]}">${esc(g[0])}</span></td><td class="small">${esc(b.act)}${b.date?' · '+fmtMD(b.date):''}</td></tr>`).join('')||'<tr><td colspan="5">None of the office’s bills have reached the governor yet.</td></tr>'}</tbody></table></div>
   <p class="small muted">A veto-override session can be called after the session; any override shows here as “Veto overridden.”</p></div>`;
}
function wrapImpl(S){
  if(IMPL===null||IMPL.session!==S){IMPL={session:S,items:null};api('impl?session='+S).then(j=>{IMPL={session:S,items:j.items||[]};route(true)}).catch(e=>{IMPL={session:S,items:[],error:e.message};route(true)});return '<div class="card"><p>Loading…</p></div>'}
  if(!IMPL.items)return '<div class="card"><p>Loading…</p></div>';
  const passed=allRows(S).filter(b=>!b.file&&(outcome(b)||{}).k==='pass'&&(onOffice(b)||b.agd.length));
  const by={};for(const it of IMPL.items)(by[it.key]=by[it.key]||[]).push(it);
  const eff=((CONFIG.sessions||{})[S]||{deadlines:[]}).deadlines.find(x=>/effective date/i.test(x[2]));
  const can=canEdit('agAction');
  const divOpts=cur=>`<option value="">Owner…</option>${CONFIG.departments.map(d=>`<optgroup label="${esc(d.name)}">${CONFIG.divisions.filter(x=>x.dept===d.id).map(x=>`<option value="${x.id}" ${cur===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}`;
  return `<div class="card"><h2>Implementation tracker</h2><p class="desc">What the office or a division has to do because a bill passed, and by when. Owners get an email 30 days and 7 days before each due date.${eff?` Most bills take effect <b>${fmtLong(pd(eff[0]))}</b>.`:''}</p>
   ${passed.length?passed.sort(SORTS.num).map(b=>{const its=by[b.key]||[];return `<div class="impl"><div class="impl-hd"><a class="billnum" href="${billHref(b)}">${esc(shortNum(b.num))}</a> <span class="serif">${esc(b.title)}</span>${can&&b.agd.length&&!its.length?`<button class="btn sm" data-implsug="${esc(b.key)}">Suggest items from the bill text</button>`:''}</div>
     ${its.map(it=>`<div class="impl-row ${it.status}"><select data-implf="${it.id}|status" ${can?'':'disabled'} aria-label="Status"><option value="todo" ${it.status==='todo'?'selected':''}>To do</option><option value="doing" ${it.status==='doing'?'selected':''}>In progress</option><option value="done" ${it.status==='done'?'selected':''}>Done</option></select>
       <input data-implf="${it.id}|item" value="${esc(it.item)}" ${can?'':'readonly'} aria-label="What has to be done"><select data-implf="${it.id}|division" ${can?'':'disabled'} aria-label="Owner">${divOpts(it.division)}</select><input type="date" data-implf="${it.id}|due" value="${esc(it.due||'')}" ${can?'':'readonly'} aria-label="Due date">${can?`<button class="btn sm" data-impldel="${it.id}" aria-label="Remove">×</button>`:''}</div>`).join('')}
     ${can?`<button class="linkbtn small" data-impladd="${esc(b.key)}">+ Add an item</button>`:''}</div>`}).join(''):'<p class="empty">Passed bills on the office list (or that give the office a role) show up here.</p>'}</div>`;
}
function wrapMe(S){
  if(MYSTATS===null){MYSTATS=undefined;api('mystats').then(j=>{MYSTATS=j;route(true)}).catch(()=>{MYSTATS={log:[],prefs:{}}});return '<div class="card"><p>Loading…</p></div>'}
  if(!MYSTATS)return '<div class="card"><p>Loading…</p></div>';
  const mine=allRows(S).filter(mineAssigned), keys=new Set(MYSTATS.log.filter(r=>r[0].startsWith(S+'/')).map(r=>r[0]));
  const touched=allRows(S).filter(b=>keys.has(b.key)||mineAssigned(b));
  const hearings=mine.reduce((n,b)=>n+b.ag.filter(a=>pd(a.date)&&pd(a.date)<new Date()).length,0);
  const notes=MYSTATS.log.filter(r=>r[0].startsWith(S+'/')&&(r[1]==='note'||r[1]==='agAction')).length;
  const pred=MYSTATS.prefs.pred||{};const pk=Object.entries(pred).filter(([k])=>k.startsWith(S+'/'));const pdec=pk.filter(([k])=>BYKEY[k]&&outcome(BYKEY[k]));
  const pright=pdec.filter(([k,v])=>(outcome(BYKEY[k]).k==='pass')===(v==='pass')).length;
  const counts={};for(const r of MYSTATS.log)if(r[0].startsWith(S+'/'))counts[r[0]]=(counts[r[0]]||0)+1;
  const favKey=MYSTATS.prefs.fav&&BYKEY[MYSTATS.prefs.fav]?MYSTATS.prefs.fav:(Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]||[])[0];
  const fav=favKey&&BYKEY[favKey];
  const st={tracked:touched.length,hearings,notes,pred:pdec.length?Math.round(pright/pdec.length*100):null,npred:pdec.length,fav};
  WRAPSTATS=st;
  return `<div class="card"><h2>My season</h2><p class="desc">Your ${esc(sessName(S))} in numbers. Share it, or keep it for your résumé.</p>
   <div class="season" id="seasonCard"><div class="season-hd">${BEE}<div><div class="season-k">Season recap</div><div class="season-n">${esc(ME.display||ME.user)}</div><div class="season-s">${esc(sessName(S))}</div></div></div>
    <div class="season-grid"><div><b>${st.tracked}</b><span>bills tracked</span></div><div><b>${st.hearings}</b><span>hearings covered</span></div><div><b>${st.notes}</b><span>notes written</span></div><div><b>${st.pred==null?'—':st.pred+'%'}</b><span>prediction accuracy${st.npred?` (${st.npred})`:''}</span></div></div>
    <div class="season-fav"><span>Favorite bill</span><b>${fav?`${esc(shortNum(fav.num))} · ${esc(fav.title)}`:'Pick one below'}</b></div></div>
   <div class="filters" style="margin-top:14px"><div class="field grow"><label for="favSel">Favorite bill</label><select id="favSel"><option value="">Choose…</option>${touched.sort(SORTS.num).map(b=>`<option value="${esc(b.key)}" ${favKey===b.key?'selected':''}>${esc(shortNum(b.num))} ${esc(b.title)}</option>`).join('')}</select></div><button class="btn primary" id="seasonPng">Download as image</button><button class="btn" id="seasonCopy">Copy as text</button></div>
   <p class="small muted">Predictions: on any bill page, choose “I think it will pass” or “won’t pass” in the office panel. Accuracy counts bills that have been decided.</p></div>`;
}
let WRAPSTATS=null;
function seasonPNG(){
  const st=WRAPSTATS;const c=document.createElement('canvas');c.width=1200;c.height=630;const x=c.getContext('2d');
  x.fillStyle='#002147';x.fillRect(0,0,1200,630);x.fillStyle='#e9d8a6';x.fillRect(0,600,1200,30);
  x.fillStyle='#e9d8a6';x.font='600 28px system-ui,sans-serif';x.fillText('DESERET DOCKET · SEASON RECAP',60,80);
  x.fillStyle='#fff';x.font='600 64px Georgia,serif';x.fillText(ME.display||ME.user,60,160);x.font='28px system-ui,sans-serif';x.fillStyle='#c9d5e1';x.fillText(sessName(UI.session),60,205);
  const items=[[st.tracked,'bills tracked'],[st.hearings,'hearings covered'],[st.notes,'notes written'],[st.pred==null?'—':st.pred+'%','prediction accuracy']];
  items.forEach(([v,l],i)=>{const X=60+i*275;x.fillStyle='rgba(255,255,255,.08)';x.fillRect(X,250,250,170);x.fillStyle='#fff';x.font='700 64px system-ui,sans-serif';x.fillText(String(v),X+24,340);x.fillStyle='#c9d5e1';x.font='24px system-ui,sans-serif';x.fillText(l,X+24,385)});
  x.fillStyle='#e9d8a6';x.font='24px system-ui,sans-serif';x.fillText('FAVORITE BILL',60,480);x.fillStyle='#fff';x.font='600 34px Georgia,serif';
  const fav=st.fav?`${shortNum(st.fav.num)} · ${st.fav.title}`:'—';x.fillText(fav.length>60?fav.slice(0,58)+'…':fav,60,525);
  const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download=`season-recap-${UI.session}.png`;document.body.appendChild(a);a.click();a.remove();
}

// ---------- hearing prep packet
function pagePacket(session,num){
  const b=BYKEY[`${session}/${num}`];
  if(!b){if(!BILLS[session]){loadSession(session).then(()=>route(true));return shell('bills','<div class="card"><p>Loading…</p></div>')}return shell('bills','<div class="card"><p>Bill not found.</p></div>')}
  if(!ME)return shell('bills',`<div class="card"><p><a href="/login">Sign in</a> to make a prep packet.</p></div>`);
  const h=nextHearing(b), ai=typeof aiOf==='function'?aiOf(b):null, ss=typeof subSummary==='function'?subSummary(b):null, rb=typeof runBefore==='function'?runBefore(b):null;
  const fnr=(typeof FH!=='undefined'&&FH&&FH.requests)?FH.requests.filter(r=>r.card_id.startsWith(`${session}/${num}/`)):[];
  const c=fnCost(b), col=typeof collisions==='function'?(collisions()[b.key]||[]).filter(x=>x.nd):[];
  const l=legFor(b.spId,b.sponsor);
  return shell('bills',`<div class="packet-tools noprint"><a href="${billHref(b)}">← Back to the bill</a><button class="btn primary" onclick="window.print()">Print or save as PDF</button></div>
   <article class="packet">
    <header><div class="pk-k">Hearing prep · ${esc(sessName(session))}</div><h1>${esc(shortNum(b.num))}: ${esc(b.title)}</h1>
     <div class="pk-meta"><span><b>Sponsor:</b> ${esc(b.sponsor)}${b.floor?` · <b>Floor:</b> ${esc(b.floor)}`:''}</span><span><b>Version:</b> ${esc(b.version||'')}</span><span><b>Status:</b> ${esc(b.act)} (${esc(b.own)})</span>${h?`<span><b>Next hearing:</b> ${esc(h.committee)}, ${WD[h.d.getDay()]} ${fmtLong(h.d)} ${fmtTime(h.d)}, ${esc(h.place)}</span>`:''}</div></header>
    <div class="pk-grid">
     <section><h2>Office</h2><p><b>Position:</b> ${posOf(b)?esc(posName(posOf(b))):'None yet'}${canSee('priority')&&priOf(b)?` · <b>Priority:</b> ${esc(priName(priOf(b)))}`:''}</p><p><b>Assigned:</b> ${esc(assignOf(b).join(', ')||'Nobody yet')}</p><p><b>Departments / divisions:</b> ${esc([...deptsOf(b).map(deptName),...divsOf(b).map(divName)].join(', ')||'—')}</p>${cposChips(b)?`<p><b>Committee positions:</b></p>${cposChips(b)}`:''}</section>
     <section><h2>Sponsor</h2>${l?`<p>${l.house==='H'?'Rep.':'Sen.'} ${esc(l.name)}, ${l.house==='H'?'House':'Senate'} District ${esc(l.district)} (${esc(l.party)})${l.counties?`, ${esc(l.counties)}`:''}</p>`:`<p>${esc(b.sponsor)}</p>`}${rb&&rb.length?`<p><b>History:</b> ${rb.slice(0,3).map(x=>`${esc(x.ses.slice(0,4))} ${esc(shortNum(x.r.n))} (${esc(x.r.sp.replace(/^(Rep|Sen)\.\s*/,''))}): ${esc(x.r.stage)}`).join('; ')}</p>`:''}</section>
    </div>
    <section><h2>What it does</h2><p>${esc((ai&&ai.sum)||b.description||'No summary yet.')}</p>${ss?`<p><b>Latest version:</b> ${ss.html?ss.txt:esc(ss.txt)}</p>`:''}</section>
    <section><h2>Money</h2><p><b>Fiscal note:</b> ${!b.fn?'Not posted yet':b.fn.none?'No direct cost to the state':c?`${money(Math.abs(c.on))} ongoing, ${money(Math.abs(c.one))} one-time`:'No General Fund impact'}</p>${fnr.length?`<p><b>Division estimates:</b> ${fnr.map(r=>`${esc(divName(r.division))}: ${r.status==='impact'?money(+r.answer.amount)+' '+esc(r.answer.kind||''):esc(r.status.replace('_',' '))}`).join('; ')}</p>`:''}</section>
    ${(b.agd||[]).length||agActOf(b)?`<section><h2>What the office would have to do</h2>${agActOf(b)?`<p>${esc(agActOf(b))}</p>`:''}${b.agd.length?`<ul>${b.agd.slice(0,5).map(x=>`<li>${esc(x[1])}</li>`).join('')}</ul>`:''}</section>`:''}
    ${ai&&ai.elsewhere&&ai.elsewhere.length?`<section><h2>Elsewhere (AI leads, verify)</h2><ul>${ai.elsewhere.map(e=>`<li>${esc(e.state)}: ${esc(e.law)}${e.note?' · '+esc(e.note):''}</li>`).join('')}</ul></section>`:''}
    ${col.length?`<section><h2>Collisions</h2><ul>${col.slice(0,4).map(x=>`<li>${esc(shortNum(x.other.num))} also amends ${esc(x.sec)} (different wording in ${esc(x.diff.join(', '))})</li>`).join('')}</ul></section>`:''}
    ${canSee('note')&&noteOf(b)?`<section><h2>Team notes</h2><p class="pre">${esc(noteOf(b))}</p></section>`:''}
    <footer>Attorney Work Product / Attorney-Client Communication · Prepared ${fmtLong(new Date())} from Deseret Docket</footer>
   </article>`,true);
}

function wrapBind(){
  app.querySelectorAll('[data-wrapv]').forEach(b=>b.onclick=()=>{WRAPVIEW=b.dataset.wrapv;history.replaceState(null,'','#postsession-'+WRAPVIEW);route(true)});
  on('scoreCsv','onclick',()=>{const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;const rows=scoreRows(UI.session);const lines=[['Bill','Title','Position','Outcome','Matched','Departments'].map(q).join(',')].concat(rows.map(r=>[shortNum(r.b.num),r.b.title,posName(posOf(r.b)),r.o?r.o.l:'Pending',r.matched===null?'':r.matched?'Yes':'No',deptsOf(r.b).map(deptName).join('; ')].map(q).join(',')));
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+lines.join('\r\n')],{type:'text/csv'}));a.download=`scorecard-${UI.session}.csv`;document.body.appendChild(a);a.click();a.remove()});
  const save=async items=>{try{await api('impl',{items});IMPL=null;route(true)}catch(e){toast(e.message)}};
  app.querySelectorAll('[data-impladd]').forEach(b=>b.onclick=()=>save([{key:b.dataset.impladd,item:'New item: describe what has to be done',status:'todo',due:(((CONFIG.sessions||{})[UI.session]||{deadlines:[]}).deadlines.find(x=>/effective date/i.test(x[2]))||[''])[0]}]));
  app.querySelectorAll('[data-implsug]').forEach(b=>b.onclick=()=>{const bill=BYKEY[b.dataset.implsug];const eff=(((CONFIG.sessions||{})[UI.session]||{deadlines:[]}).deadlines.find(x=>/effective date/i.test(x[2]))||[''])[0];
    save(bill.agd.slice(0,6).map(x=>({key:bill.key,item:x[1].slice(0,300),status:'todo',due:eff,division:divsOf(bill)[0]||(bill.sug||[])[0]||''})))});
  app.querySelectorAll('[data-implf]').forEach(el=>el.onchange=()=>{const [id,f]=el.dataset.implf.split('|');const it=IMPL.items.find(x=>x.id===id);if(!it)return;it[f]=el.value;save([it])});
  app.querySelectorAll('[data-impldel]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this item?'))return;try{await api('impl',{action:'delete',id:b.dataset.impldel});IMPL=null;route(true)}catch(e){toast(e.message)}});
  on('favSel','onchange',async e=>{try{await api('prefs',{fav:e.target.value});MYSTATS=null;route(true)}catch(err){toast(err.message)}});
  on('seasonPng','onclick',seasonPNG);
  on('seasonCopy','onclick',()=>{const s=WRAPSTATS;const t=`My ${sessName(UI.session)}: ${s.tracked} bills tracked, ${s.hearings} hearings covered, ${s.notes} notes written${s.pred!=null?`, ${s.pred}% prediction accuracy`:''}.${s.fav?` Favorite bill: ${shortNum(s.fav.num)}, ${s.fav.title}.`:''}`;navigator.clipboard.writeText(t).then(()=>toast('Copied'))});
  app.querySelectorAll('[data-pred]').forEach(b=>b.onclick=async()=>{const k=curKey();try{await api('prefs',{pred:{key:k,v:b.dataset.pred}});ME.prefs.pred={...(ME.prefs.pred||{}),[k]:b.dataset.pred};if(!b.dataset.pred)delete ME.prefs.pred[k];MYSTATS=null;toast(b.dataset.pred?'Prediction saved':'Prediction cleared');route(true)}catch(e){toast(e.message)}});
}
