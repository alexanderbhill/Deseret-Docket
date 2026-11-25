/* The activity log, the Legislators view and Quick log (Outreach), shared with the Interim tab.
   The log writes itself: every save in Outreach and Interim, every Draft review step, and every division that answers
   from its email adds one short line (lib/activity.js). Nothing here asks anyone to type a log entry.
   When Outlook is connected, a sync job adds calendar meetings and emails with legislators and drafters the same way
   (POST /api/cron/activity, src "outlook-cal" / "outlook-mail"), and they show here with an Outlook badge. */
'use strict';
const ACT={}; // tab → {rows, sig} | undefined while loading
const ACT_SRC={site:['','On the site'],email:['email','From a division’s email'],auto:['auto','Automatic'],'outlook-mail':['outlook','From Outlook email'],'outlook-cal':['outlook','From the Outlook calendar']};
const ACT_ICON={meet:'users',ask:'flag',amend:'pencil',testimony:'mic',review:'file',wish:'spark',rumor:'news',interim:'calendar'};
const actSig=()=>{const l=Array.isArray(OUT)?OUT:[];let m='';for(const x of l)if((x.updated_at||'')>m)m=x.updated_at;return l.length+'|'+m};
function actLoad(tab){
  const sig=actSig(), c=ACT[tab];
  if(c===undefined||(c&&c.sig!==sig&&!c.loading)){ACT[tab]={rows:c&&c.rows||null,sig,loading:true};
    api('activity?limit=300'+(tab?'&tab='+tab:'')).then(j=>{ACT[tab]={rows:j.activity||[],sig};route(true)}).catch(e=>{ACT[tab]={rows:[],sig,error:e.message}})}
  return ACT[tab]&&ACT[tab].rows;
}
const actDay=iso=>{const d=new Date(iso);const t=ymd(d);return t===todayStr?'Today':t===ymd(new Date(Date.now()-864e5))?'Yesterday':`${WD[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`};
const actTime=iso=>new Date(iso).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
function actOpen(r){const it=(OUT||[]).find(x=>x.id===r.item);return it?it:null}
function actRow(r,compact){
  const src=ACT_SRC[r.src]||ACT_SRC.site, it=actOpen(r);
  const legs=(r.legs||[]).slice(0,4).map(id=>outLegChip(id)).join(''), bills=(r.bills||[]).slice(0,3).map(outBill).join(' ');
  const title=r.title&&!r.what.includes(r.title)?`<span class="act-t">${esc(r.title.length>90?r.title.slice(0,88)+'…':r.title)}</span>`:'';
  return `<div class="act-row"><span class="act-ic">${ic(ACT_ICON[r.kind]||'clock')}</span><div class="act-main"><div><b>${esc(pn(r.by))}</b> ${esc(r.what.charAt(0).toLowerCase()+r.what.slice(1))}${src[0]?` <span class="act-src ${src[0]}" title="${esc(src[1])}">${src[0]==='outlook'?'Outlook':src[0]==='email'?'by email':'auto'}</span>`:''}</div>
    ${title||legs||bills?`<div class="act-sub">${title}${legs?`<span class="act-legs">${legs}</span>`:''}${bills?`<span>${bills}</span>`:''}</div>`:''}</div>
    <div class="act-r"><span class="tiny muted">${compact?actDay(r.at)+' · ':''}${actTime(r.at)}</span>${it?`<button type="button" class="linkbtn tiny" data-actopen="${esc(it.id)}">Open</button>`:''}</div></div>`;
}
function actFeed(rows,{limit=60,compact=false,empty='Nothing yet. Activity shows up here by itself as people use Outreach and Interim.'}={}){
  if(!rows)return '<p class="small muted">Loading the activity log…</p>';
  if(!rows.length)return `<p class="empty">${empty}</p>`;
  if(compact)return `<div class="act">${rows.slice(0,limit).map(r=>actRow(r,true)).join('')}</div>`;
  let out='',day='';for(const r of rows.slice(0,limit)){const d=actDay(r.at);if(d!==day){out+=`<div class="act-day">${esc(d)}</div>`;day=d}out+=actRow(r)}
  return `<div class="act">${out}</div>`;
}
let ACTF='';
function actPage(tab){
  const rows=actLoad(tab), kinds=tab==='interim'?[['','Everything'],['rumor','Rumor bills'],['wish','Wish list'],['interim','Study items'],['review','Draft review']]:[['','Everything'],['meet','Meetings'],['review','Draft review'],['ask','Asks'],['amend','Amendments'],['testimony','Testimony']];
  const f=rows?rows.filter(r=>!ACTF||r.kind===ACTF):null;
  const wk=rows?rows.filter(r=>Date.now()-new Date(r.at)<7*864e5):[];
  const who=[...new Set(wk.map(r=>r.by))];
  return `<div class="grid2 act-grid" style="align-items:start"><div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><h2>Activity log</h2>
     <div class="seg" role="group" aria-label="Show">${kinds.map(([k,l])=>`<button type="button" data-actf="${k}" class="${ACTF===k?'on':''}" aria-pressed="${ACTF===k}">${l}</button>`).join('')}</div></div>
    <p class="desc">What happened, one line each, written automatically as people log meetings, move ideas along and send drafts out, and when divisions answer from their email. No one has to keep it up.</p>
    ${actFeed(f,{limit:200})}</div>
   <div><div class="card"><h2>This week</h2>${rows?`<div class="stat3 act-stats"><div><span>Things logged</span><b>${wk.length}</b></div><div><span>People</span><b>${who.length}</b></div><div><span>Legislators touched</span><b>${new Set(wk.flatMap(r=>r.legs||[])).size}</b></div></div>`:'<p class="small muted">Loading…</p>'}</div>
    ${outlookCard(tab)}</div></div>`;
}
// What changes once Outlook is hooked up. Honest about what's live today and what would need IT.
function outlookCard(tab){
  const live=[['On the site','Meetings, asks, amendments, testimony, wish list ideas, rumored bills and every Draft review step, as people save them.'],['From division emails','When a division answers a Draft review from its email, with no sign-in.']];
  const next=tab==='interim'?[['Interim meetings on your calendar','Interim committee meetings you accept show up next to the study items you track, with the agenda link.'],['Rumors in your inbox','An email from a legislator or LRGC that mentions a rumored bill’s keywords is linked to it, so the trail builds itself.'],['Language going out','Sending a wish list idea’s language to a sponsor or drafter from Outlook moves it to “Sent” and logs who it went to.']]
    :[['Meetings from your calendar','An Outlook meeting with a legislator (matched by their le.utah.gov email) is logged as a meeting, with the date, who went and the bills in the subject line. You add notes if you want to.'],['Emails with legislators','A short line for each email to or from a legislator or their staff: who and when, never the body.'],['Drafts from LRGC','A draft from an LRGC attorney is offered as a new Draft review, and their replies land on the draft’s trail.'],['Follow-ups','A follow-up date you set becomes a reminder on your Outlook calendar.']];
  return `<div class="card act-outlook"><h2>${ic('mail','h')}Automatic, now and with Outlook</h2>
   <h4 class="out-sub">Logged automatically today</h4><ul class="act-list">${live.map(([a,b])=>`<li><b>${esc(a)}.</b> ${esc(b)}</li>`).join('')}</ul>
   <h4 class="out-sub">Once Outlook is connected</h4><ul class="act-list next">${next.map(([a,b])=>`<li><b>${esc(a)}.</b> ${esc(b)}</li>`).join('')}</ul>
   <p class="tiny muted">Connecting Outlook needs a Microsoft 365 app registration from IT with Calendars.Read and Mail.Read on the mailboxes of the people who use it (Mail.Send to send from their own mailbox). Only who, when and the subject line are logged, never an email’s body. The site already has the spot for it: a sync job posts to <code>/api/cron/activity</code> and repeats are ignored.</p></div>`;
}

// ---------- Outreach → Legislators: every legislator, and when the office last talked with them
let OPPL={house:'',filt:'',sort:'last',q:''};
function outTouches(){
  const t={};const add=(id,date,mode,what)=>{if(!id)return;const x=t[id]=t[id]||{n:0,last:'',mode:'',what:''};x.n++;if(date>x.last){x.last=date;x.mode=mode;x.what=what}};
  for(const m of outOf('meet'))for(const id of m.legs||[])add(id,m.date||'',m.mode||'person',m.topic||'');
  for(const r of (ACT['']&&ACT[''].rows)||[])if(r.src&&r.src.startsWith('outlook'))for(const id of r.legs||[])add(id,r.at.slice(0,10),r.src==='outlook-cal'?'person':'email',r.what);
  return t;
}
const OUT_MODE_L=Object.fromEntries(OUT_OPTS.meetMode);
function outPeoplePage(){
  actLoad('');
  const T=outTouches(), S=UI.session, office=allRows(S).filter(b=>!b.file&&posOf(b));
  const spons={};for(const b of office)for(const id of [b.spId,b.flId])if(id)(spons[id]=spons[id]||[]).push(b);
  const asks={};for(const a of outOf('ask').filter(outIsOpen))(asks[a.leg]=asks[a.leg]||[]).push(a);
  const age=d=>d?Math.floor((TODAY-pd(d+'T00:00'))/864e5):9999;
  let L=outLegs().filter(l=>(!OPPL.house||l.house===OPPL.house)&&(!OPPL.filt||(OPPL.filt==='spons'?spons[l.id]:OPPL.filt==='never'?!T[l.id]:OPPL.filt==='stale'?age((T[l.id]||{}).last)>60:OPPL.filt==='asks'?asks[l.id]:true))&&(!OPPL.q||l.name.toLowerCase().includes(OPPL.q.toLowerCase())));
  const last=l=>(T[l.id]||{}).last||'';
  L.sort(OPPL.sort==='name'?(a,b)=>a.name.split(' ').pop().localeCompare(b.name.split(' ').pop()):OPPL.sort==='bills'?(a,b)=>(spons[b.id]||[]).length-(spons[a.id]||[]).length:(a,b)=>last(b).localeCompare(last(a))||a.name.localeCompare(b.name));
  const all=outLegs(), met=all.filter(l=>T[l.id]).length, fresh=all.filter(l=>age(last(l))<=30).length;
  return `<div class="card"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><h2>Legislators</h2>
    <p class="desc">Every legislator and when the office last talked with them. The ring shows how recent: <span class="ring-k r1"></span> this month, <span class="ring-k r2"></span> in the last two months, <span class="ring-k r3"></span> longer ago, <span class="ring-k r0"></span> never. Press <b>Log</b> after any call, email or hallway conversation.</p></div>
    <div class="stat3"><div><span>Talked with</span><b>${met} <small>of ${all.length}</small></b></div><div><span>In the last 30 days</span><b>${fresh}</b></div><div><span>Sponsor office-position bills, never contacted</span><b>${Object.keys(spons).filter(id=>!T[id]).length}</b></div></div></div>
   <div class="filters"><div class="field"><label for="opH">Chamber</label><select id="opH"><option value="">Both</option><option value="H" ${OPPL.house==='H'?'selected':''}>House</option><option value="S" ${OPPL.house==='S'?'selected':''}>Senate</option></select></div>
    <div class="field"><label for="opF">Show</label><select id="opF">${[['','Everyone'],['spons','Sponsoring bills the office has a position on'],['asks','With an open ask'],['never','Never contacted'],['stale','Not in the last two months']].map(([k,l])=>`<option value="${k}" ${OPPL.filt===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label for="opS">Sort by</label><select id="opS">${[['last','Most recent contact'],['bills','Most office-position bills'],['name','Last name']].map(([k,l])=>`<option value="${k}" ${OPPL.sort===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field grow"><label for="opQ">Find</label><input type="search" id="opQ" value="${esc(OPPL.q)}" placeholder="Name"></div></div>
   <div class="opp-grid">${L.map(l=>{const t=T[l.id],a=age(t&&t.last),r=!t?0:a<=30?1:a<=60?2:3,bs=spons[l.id]||[],as=asks[l.id]||[];
     return `<div class="opp"><a class="opp-face r${r}" href="#legislators-${esc(l.id)}" data-info="leg:${esc(l.id)}">${legPhoto(l)?`<img src="${esc(legPhoto(l))}" alt="" loading="lazy">`:''}</a>
      <div class="opp-b"><a href="#legislators-${esc(l.id)}"><b>${esc(l.house==='H'?'Rep.':'Sen.')} ${esc(l.name)}</b></a><div class="tiny muted">${esc(l.party||'')} · ${l.house==='H'?'HD':'SD'} ${esc(l.district)}</div>
       <div class="small">${t?`${esc(OUT_MODE_L[t.mode]||'Met')} ${a===0?'today':a===1?'yesterday':a<9999?a+' days ago':''}<span class="tiny muted"> · ${plural(t.n,'contact')}</span>`:'<span class="muted">No contact logged</span>'}</div>
       ${bs.length||as.length?`<div class="tiny">${bs.length?`${plural(bs.length,'office bill')}`:''}${bs.length&&as.length?' · ':''}${as.length?`<b>${plural(as.length,'open ask')}</b>`:''}</div>`:''}</div>
      <button type="button" class="btn sm" data-qlog="${esc(l.id)}">Log</button></div>`}).join('')||'<p class="empty">No one matches.</p>'}</div></div>`;
}

// ---------- Quick log: one line after a call, email or hallway conversation
function quickLogDlg(pre){
  let dlg=$('qlDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='qlDlg';document.body.appendChild(dlg)}
  const p=pre||{};
  dlg.innerHTML=`<form method="dialog" id="qlForm" class="ql"><h2>Quick log</h2><p class="small muted">One line is plenty. It goes in Meetings and the activity log, and on the legislator’s profile.</p>
   <div class="field wide"><label for="ql-legs-q">Who</label>${chipPicker('ql-legs',outLegItems(),p.legs||[],'Type a legislator’s name…')}</div>
   <div class="seg ql-mode" role="radiogroup" aria-label="How">${OUT_OPTS.meetMode.map(([k,l],i)=>`<label><input type="radio" name="qlMode" value="${k}" ${(p.mode||'person')===k?'checked':''}><span>${esc(l.replace(' or committee room','').replace(' or reception',''))}</span></label>`).join('')}</div>
   <div class="out-form" style="margin-top:10px"><div class="field wide"><label for="qlWhat">What happened</label><input id="qlWhat" maxlength="200" placeholder="e.g. Said she’ll hold HB 12 until we send amendment language" value="${esc(p.topic||'')}"></div>
    <div class="field"><label for="qlBill">Bill (optional)</label><input id="qlBill" list="qlBillDL" placeholder="HB 101" value="${esc((p.bills||[]).map(outBillText).join(', '))}"><datalist id="qlBillDL">${allRows(UI.session).filter(b=>!b.file).sort(SORTS.num).map(b=>`<option value="${esc(billLabel(b))}">${esc(b.title)}</option>`).join('')}</datalist></div>
    <div class="field"><label for="qlDate">When</label><input type="date" id="qlDate" value="${esc(p.date||todayStr)}"></div>
    <div class="field"><label for="qlFu">Follow up by (optional)</label><input type="date" id="qlFu"></div></div>
   <div style="display:flex;gap:10px;justify-content:space-between;margin-top:14px;flex-wrap:wrap"><button type="button" class="linkbtn small" id="qlMore">Add notes and more details…</button><span style="display:flex;gap:10px"><button type="button" class="btn" id="qlCancel">Cancel</button><button class="btn primary">Log it</button></span></div></form>`;
  dlg.showModal();bindChipPickers(dlg);setTimeout(()=>$('ql-legs-q').focus(),30);
  const read=()=>({date:$('qlDate').value||todayStr,mode:(dlg.querySelector('input[name=qlMode]:checked')||{}).value||'person',legs:[...$('ql-legs').querySelectorAll('input:checked')].map(x=>x.value),
    bills:outParseBills($('qlBill').value),topic:$('qlWhat').value.trim(),followup:$('qlFu').value,who:PEOPLE.filter(x=>outMe().includes(x.toLowerCase())).slice(0,1)});
  $('qlCancel').onclick=()=>dlg.close();
  $('qlMore').onclick=()=>{const it=read();dlg.close();outDialog('meet',null,it)};
  $('qlForm').onsubmit=async e=>{e.preventDefault();const it=read();
    if(!it.legs.length){toast('Pick who you talked with.');$('ql-legs-q').focus();return}
    if($('qlBill').value.trim()&&!it.bills.length){toast('Write bills like “HB 101”.');return}
    try{const j=await api('outreach',{kind:'meet',item:it});OUT=j.items;dlg.close();toast('Logged');route(true)}catch(err){toast(err.message)}};
}

document.addEventListener('click',e=>{
  const q=e.target.closest&&e.target.closest('[data-qlog]');if(q){e.preventDefault();quickLogDlg(q.dataset.qlog&&q.dataset.qlog!=='1'?{legs:[q.dataset.qlog]}:{});return}
  const a=e.target.closest&&e.target.closest('[data-actopen]');if(a){e.preventDefault();const it=(OUT||[]).find(x=>x.id===a.dataset.actopen);if(!it)return;
    if(it.kind==='review'&&typeof revOpen==='function')revOpen(it.id);else if(it.kind==='wish'&&typeof wishOpen==='function')wishOpen(it.id);else if(it.kind==='testimony')location.hash='#outreach-testimony-'+it.bill;else outDialog(it.kind,it);return}
  const f=e.target.closest&&e.target.closest('[data-actf]');if(f){ACTF=f.dataset.actf;route(true)}
});
function actBind(){
  if(!/^#(outreach|interim)/.test(location.hash))return;
  on('opH','onchange',e=>{OPPL.house=e.target.value;route(true)});on('opF','onchange',e=>{OPPL.filt=e.target.value;route(true)});on('opS','onchange',e=>{OPPL.sort=e.target.value;route(true)});
  const q=$('opQ');if(q){q.oninput=()=>{OPPL.q=q.value;clearTimeout(q._t);q._t=setTimeout(()=>{q.blur();route(true);const n=$('opQ');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length)}},250)}}
}
