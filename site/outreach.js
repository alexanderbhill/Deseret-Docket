/* Outreach: the relationship side of the session, for External Relations and anyone the admin lets in
   (Admin → Edit → "Can use Outreach").
   Overview · Meetings (who we met, about what, follow-up) · Asks (what we asked each legislator for and what
   they committed to) · Testimony (a two-minute draft built from the bill's office information, with a
   rehearsal timer) · Amendments (language requests tied to bill lines) · Interim (study items by committee).
   Draft review (review.js): a draft out to the divisions for comments and back to the drafter.
   Follow-up dates show as a badge on the tab and are emailed to the owner by the 15-minute email job. */
'use strict';
let OUT=null, OUTMINE=false, OUTOPEN=true, TESTI=null;
function outLoad(force){
  if(!canOutreach())return null;
  if(OUT===null||force){OUT=undefined;api('outreach').then(j=>{OUT=j.items||[];if(location.hash.startsWith('#outreach')||location.hash.startsWith('#bill-')||location.hash.startsWith('#legislators-'))route(true);else route(true)}).catch(e=>{OUT={error:e.message}})}
  return Array.isArray(OUT)?OUT:null;
}
const outOf=k=>(outLoad()||[]).filter(x=>x.kind===k);
const outLegName=id=>{const l=legById(id);return l?`${l.house==='H'?'Rep.':'Sen.'} ${l.name}`:id};
const outLegChip=id=>{const l=legById(id);return `<a class="out-leg" href="#legislators-${esc(id)}" data-info="leg:${esc(id)}">${l&&legPhoto(l)?`<img src="${esc(legPhoto(l))}" alt="" loading="lazy">`:''}<span>${esc(outLegName(id))}</span></a>`};
function outBill(key){if(!key)return '';const b=BYKEY[key];const [ses,num]=key.split('/');
  return `<a class="billnum" href="${b?billHref(b):`#bill-${ses}-${num}`}" title="${esc(b?b.title:'')}">${esc(b?billLabel(b):shortNum(num))}</a>`}
const outMe=()=>[ME.user,ME.display].filter(Boolean).map(x=>x.toLowerCase());
function outMine(it){const me=outMe();const ow=String(it.kind==='meet'?(it.who||[])[0]||'':it.owner||'').toLowerCase();
  return me.includes(ow)||(it.kind==='meet'&&(it.who||[]).some(w=>me.includes(String(w).toLowerCase())))||(!ow&&it.by===ME.user)}
function outIsOpen(it){return it.kind==='review'?revTurn(it)!=='closed':it.kind==='ask'?['open','committed'].includes(it.status):it.kind==='amend'?!['adopted','dropped'].includes(it.status):it.kind==='meet'?!!it.followup&&!it.done:it.kind==='interim'?it.status!=='done':it.status!=='given'}
const outDue=it=>it.kind==='review'?it.due||'':it.kind==='meet'?it.followup:it.kind==='interim'?it.date:it.due||'';
function outDueCount(){const l=outLoad();if(!l)return 0;return l.filter(it=>['ask','amend','meet'].includes(it.kind)&&outIsOpen(it)&&outDue(it)&&outDue(it)<=todayStr&&outMine(it)).length+l.filter(it=>it.kind==='review'&&revTurn(it)==='us'&&outMine(it)).length}
const outDate=s=>s?fmtLong(pd(s+'T00:00')):'';
function outDueTag(it){const d=outDue(it);if(!d||!outIsOpen(it))return d?`<span class="small muted">${esc(outDate(d))}</span>`:'';
  return `<span class="pill ${d<todayStr?'warn':d===todayStr?'pass':'muted'}">${d<todayStr?'Overdue · ':d===todayStr?'Today · ':''}${esc(outDate(d))}</span>`}

// ---------- the form for each kind
const OUT_LABEL={review:'draft for review',meet:'meeting',ask:'ask',amend:'amendment request',interim:'interim study item',testimony:'testimony'};
const OUT_OPTS={
  askType:[['amendment','Amend the bill'],['hold','Hold or circle it'],['sponsor','Run or sponsor a bill'],['vote','Vote a certain way'],['meeting','Meet with us'],['other','Something else']],
  askStatus:[['open','Open'],['committed','They committed'],['done','Done'],['declined','Declined']],
  amendStatus:[['idea','Idea'],['requested','Requested'],['drafted','Drafted'],['adopted','Adopted'],['dropped','Dropped']],
  interimStatus:[['watch','Watching'],['prepping','Preparing'],['presented','Presented'],['done','Done']],
  role:[['drafter','Drafting attorney (LRGC)'],['sponsor','Sponsor'],['stakeholder','Stakeholder']]};
const OUT_FIELDS={
  review:[['bill','Bill or bill file','billfile'],['version','Version','text'],['title','Draft title (if it isn’t a bill or bill file yet)','text'],['received','Received','date'],['from','From (name)','text'],['fromRole','They are the','select','role'],['fromEmail','Their email (for sending the feedback back)','text'],['legs','Sponsor and legislators to copy on the feedback','legs'],['link','Link to the draft','text'],['owner','Point of contact','person'],['divisions','Divisions to review it','divisions'],['due','Comments due from divisions','date'],['backBy','Needs to go back by','date'],['notes','What the divisions should look for (goes in their email)','area']],
  meet:[['date','Date','date'],['legs','Legislators','legs'],['others','Others there (staff, stakeholders)','text'],['who','From the office','people'],['bills','Bills discussed','bills'],['topic','Topic','text'],['notes','What was said','area'],['followup','Follow up by','date'],['done','Follow-up is done','check']],
  ask:[['leg','Legislator','leg'],['bill','Bill (optional)','bill'],['type','Kind of ask','select','askType'],['ask','What we asked for','area'],['status','Status','select','askStatus'],['committed','What they said or committed to','area'],['due','Follow up by','date'],['owner','Owner','person'],['notes','Notes','area']],
  amend:[['bill','Bill','bill'],['lines','Where (page and lines)','text'],['change','Proposed change','area'],['why','Why the office wants it','area'],['from','Asked of (sponsor, drafting attorney…)','text'],['status','Status','select','amendStatus'],['owner','Owner','person'],['due','Needed by','date']],
  interim:[['com','Interim committee','com'],['date','Meeting date','date'],['topic','Study item or topic','text'],['division','Division most affected','division'],['owner','Owner','person'],['status','Status','select','interimStatus'],['link','Agenda or materials link','text'],['notes','Notes','area']]};
const outLegs=()=>(LEGS||[]).filter(l=>l.id).slice().sort((a,b)=>(a.house+a.name.split(' ').slice(-1)[0]).localeCompare(b.house+b.name.split(' ').slice(-1)[0]));
const outInterims=()=>(typeof loadComs==='function'?loadComs():[]).filter(c=>/interim/i.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name));
function outField([f,label,type,opt],v){
  const id='of-'+f;
  if(type==='check')return `<label class="check"><input type="checkbox" id="${id}" ${v?'checked':''}><span>${label}</span></label>`;
  let input;
  if(type==='area')input=`<textarea id="${id}" rows="3">${esc(v||'')}</textarea>`;
  else if(type==='date')input=`<input type="date" id="${id}" value="${esc(v||'')}">`;
  else if(type==='select')input=`<select id="${id}">${OUT_OPTS[opt].map(([k,l])=>`<option value="${k}" ${v===k?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  else if(type==='leg')input=`<select id="${id}"><option value="">Choose…</option>${['H','S'].map(h=>`<optgroup label="${h==='H'?'House':'Senate'}">${outLegs().filter(l=>l.house===h).map(l=>`<option value="${l.id}" ${v===l.id?'selected':''}>${esc(l.name)} (${esc(l.party||'')}, ${h==='H'?'HD':'SD'} ${esc(l.district)})</option>`).join('')}</optgroup>`).join('')}</select>`;
  else if(type==='legs')input=`<input type="search" class="out-legq" data-for="${id}" placeholder="Type a name to narrow the list"><div class="out-checks" id="${id}">${outLegs().map(l=>`<label data-n="${esc(l.name.toLowerCase())}"><input type="checkbox" value="${l.id}" ${(v||[]).includes(l.id)?'checked':''}>${esc(l.house==='H'?'Rep.':'Sen.')} ${esc(l.name)}</label>`).join('')}</div>`;
  else if(type==='people')input=`<div class="out-checks short" id="${id}">${PEOPLE.map(p=>`<label><input type="checkbox" value="${esc(p)}" ${(v||[]).includes(p)?'checked':''}>${esc(p)}</label>`).join('')||'<span class="small muted">Add people on the Admin tab.</span>'}</div>`;
  else if(type==='person')input=`<select id="${id}"><option value="">—</option>${[...new Set([...PEOPLE,...(v?[v]:[])])].map(p=>`<option ${v===p?'selected':''}>${esc(p)}</option>`).join('')}</select>`;
  else if(type==='bill')input=`<input id="${id}" list="outBillDL" placeholder="HB 101" value="${esc(v?outBillText(v):'')}">`;
  else if(type==='bills')input=`<input id="${id}" list="outBillDL" placeholder="HB 101, SB 20" value="${esc((v||[]).map(outBillText).join(', '))}">`;
  else if(type==='billfile')input=`<input id="${id}" list="revBillDL" placeholder="HB 101, or start typing a bill file’s title" value="${esc(v?outBillText(v)||'':'')}"><datalist id="revBillDL">${allRows(UI.session).sort((a,b)=>a.file-b.file||SORTS.num(a,b)).map(b=>`<option value="${esc(b.file?b.title:billLabel(b))}">${esc(b.file?`Bill file · ${b.sponsor||''}`:b.title)}</option>`).join('')}</datalist>`;
  else if(type==='divisions')input=`<div class="out-checks" id="${id}">${CONFIG.departments.map(d=>{const xs=CONFIG.divisions.filter(x=>x.dept===d.id);return xs.length?`<div class="rev-dgrp"><b class="tiny muted">${esc(d.name)}</b>${xs.map(x=>`<label><input type="checkbox" value="${x.id}" ${(v||[]).includes(x.id)?'checked':''}>${esc(x.name)}</label>`).join('')}</div>`:''}).join('')}</div><p class="tiny muted" style="margin:4px 0 0">Requests go to each division’s people under Fiscal Hive → Settings → Who gets requests.</p>`;
  else if(type==='com')input=`<select id="${id}"><option value="">Choose…</option>${outInterims().map(c=>`<option value="${esc(c.id)}" ${v===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`;
  else if(type==='division')input=`<select id="${id}"><option value="">—</option>${CONFIG.departments.map(d=>`<optgroup label="${esc(d.name)}">${CONFIG.divisions.filter(x=>x.dept===d.id).map(x=>`<option value="${x.id}" ${v===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  else input=`<input id="${id}" value="${esc(v||'')}">`;
  return `<div class="field ${['area','legs','people','divisions'].includes(type)?'wide':''}"><label for="${id}">${label}</label>${input}</div>`;
}
const outBillText=key=>{const b=BYKEY[key];return b?(b.file?b.title:`${billLabel(b)}`):shortNum(String(key).split('/')[1]||key)};
const outParseBills=t=>[...new Set(String(t||'').split(/[,;]+/).map(x=>typeof normBill==='function'?normBill(x.trim(),UI.session):'').filter(Boolean))];
function outDialog(kind,it,pre){
  const cur={...(pre||{}),...(it||{})};
  if(kind==='meet'&&!cur.date)cur.date=todayStr;
  if(kind==='meet'&&!cur.who)cur.who=PEOPLE.filter(p=>outMe().includes(p.toLowerCase())).slice(0,1);
  if(kind==='review'&&!cur.received)cur.received=todayStr;
  if(['ask','amend','interim','review'].includes(kind)&&!cur.owner)cur.owner=PEOPLE.find(p=>outMe().includes(p.toLowerCase()))||'';
  let dlg=$('outDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='outDlg';document.body.appendChild(dlg)}
  dlg.innerHTML=`<form method="dialog" id="outForm"><h2>${it?'Edit':'Add'} ${OUT_LABEL[kind]}</h2>
   <datalist id="outBillDL">${allRows(UI.session).filter(b=>!b.file).sort(SORTS.num).map(b=>`<option value="${esc(billLabel(b))}">${esc(b.title)}</option>`).join('')}</datalist>
   <div class="out-form">${OUT_FIELDS[kind].map(f=>outField(f,cur[f[0]])).join('')}</div>
   <div style="display:flex;gap:10px;justify-content:space-between;margin-top:14px;flex-wrap:wrap"><span>${it?`<button type="button" class="btn danger" id="outDel">Delete</button>`:''}</span><span style="display:flex;gap:10px"><button type="button" class="btn" id="outCancel">Cancel</button><button class="btn primary" id="outSave">Save</button></span></div></form>`;
  dlg.showModal();
  $('outCancel').onclick=()=>dlg.close();
  dlg.querySelectorAll('.out-legq').forEach(q=>q.oninput=()=>{const t=q.value.toLowerCase().trim();$(q.dataset.for).querySelectorAll('label').forEach(l=>l.style.display=!t||l.dataset.n.includes(t)||l.querySelector('input').checked?'':'none')});
  if($('outDel'))$('outDel').onclick=async()=>{if(!confirm(`Delete this ${OUT_LABEL[kind]}?`))return;try{const j=await api('outreach',{action:'delete',id:it.id});OUT=j.items;dlg.close();toast('Deleted');route(true)}catch(e){toast(e.message)}};
  $('outForm').onsubmit=async e=>{e.preventDefault();const item={};
    for(const [f,,type] of OUT_FIELDS[kind]){const el=$('of-'+f);
      item[f]=type==='check'?el.checked:type==='billfile'?revParseBill(el.value):type==='legs'||type==='people'||type==='divisions'?[...el.querySelectorAll('input:checked')].map(x=>x.value):type==='bills'?outParseBills(el.value):type==='bill'?(outParseBills(el.value)[0]||''):el.value}
    if(kind==='review'){const raw=$('of-bill').value.trim();if(raw&&!item.bill&&!item.title)item.title=raw;const b=BYKEY[item.bill];item.label=b&&!b.file?billLabel(b):'';if(b&&!item.title)item.title=b.title;if(b&&b.file&&!item.title)item.title=b.title;
      if(b&&!item.legs.length&&b.spId)item.legs=[b.spId];if(!item.bill&&!item.title){toast('Pick the bill or bill file, or name the draft.');return}}
    if(['bill','bills'].some(t=>OUT_FIELDS[kind].some(f=>f[2]===t))){const raw=(dlg.querySelector('[list=outBillDL]')||{}).value||'';if(raw.trim()&&!outParseBills(raw).length){toast('Write bills like “HB 101” or “SB 20”.');return}}
    try{const j=await api('outreach',{kind,id:it?it.id:'',item});OUT=j.items;dlg.close();const rd=$('revDlg');if(rd&&rd.open&&it&&typeof revOpen==='function')revOpen(it.id);toast(`${OUT_LABEL[kind][0].toUpperCase()+OUT_LABEL[kind].slice(1)} saved`);route(true)}catch(err){toast(err.message)}};
}

// ---------- page
const OUT_TABS=[['','Overview'],['drafts','Draft review'],['meetings','Meetings'],['asks','Asks'],['testimony','Testimony'],['amendments','Amendments'],['interim','Interim']];
function pageOutreach(sub){
  if(!canOutreach())return shell('',`<div class="card"><h2>Outreach</h2><p class="desc">Ask an admin to turn on Outreach for your account.</p></div>`);
  const L=outLoad();
  const view=(sub||'').split('-')[0], arg=(sub||'').slice(view.length+1);
  const head=`<div class="card out-head"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><h2>Outreach</h2><p class="desc">Drafts out for the divisions’ review, meetings with legislators, what the office asked for, testimony, amendment requests and interim work, in one place. Follow-up dates you own show as a badge on the tab and arrive by email.</p></div>
    <div class="out-add"><button class="btn primary" data-outnew="review">${ic('file')}Log a draft</button><button class="btn" data-outnew="meet">${ic('users')}Log a meeting</button><button class="btn" data-outnew="ask">Add an ask</button><button class="btn" data-outnew="amend">Request an amendment</button></div></div>
   <nav class="out-nav" aria-label="Outreach">${OUT_TABS.map(([k,l])=>`<a href="#outreach${k?'-'+k:''}" class="${view===k?'on':''}" ${view===k?'aria-current="page"':''}>${l}</a>`).join('')}</nav>
   ${['meetings','asks','amendments','interim'].includes(view)?`<div class="out-filt"><label class="check"><input type="checkbox" id="outMine" ${OUTMINE?'checked':''}><span>Only mine</span></label><label class="check"><input type="checkbox" id="outOpen" ${OUTOPEN?'checked':''}><span>Hide finished</span></label></div>`:''}</div>`;
  if(!L)return shell('outreach',head+`<div class="card"><p>${OUT&&OUT.error?esc(OUT.error):'Loading…'}</p></div>`);
  const body=view==='drafts'?revPage():view==='meetings'?outMeetings():view==='asks'?outAsks():view==='testimony'?outTestimony(arg):view==='amendments'?outAmends():view==='interim'?outInterim():outOverview();
  return shell('outreach',head+body);
}
const outFilt=l=>l.filter(it=>(!OUTMINE||outMine(it))&&(!OUTOPEN||outIsOpen(it)||(it.kind==='meet')));
const outEdit=it=>`<button class="btn sm" data-outedit="${esc(it.id)}">Edit</button>`;
function outOverview(){
  const all=outLoad(), soon=ymd(new Date(TODAY.getTime()+7*864e5));
  const due=all.filter(it=>['ask','amend','meet'].includes(it.kind)&&outIsOpen(it)&&outDue(it)&&outDue(it)<=soon).sort((a,b)=>outDue(a).localeCompare(outDue(b)));
  const meets=outOf('meet').slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,8);
  const S=UI.session, tests=outOf('testimony');
  const office=allRows(S).filter(b=>!b.file&&posOf(b));
  const upcoming=office.map(b=>({b,h:nextHearing(b)})).filter(x=>x.h&&x.h.d<=new Date(TODAY.getTime()+14*864e5)).sort((a,b)=>a.h.d-b.h.d);
  // sponsors of bills the office has a position on, and when anyone last met with them
  const lastMet={};for(const m of outOf('meet'))for(const id of m.legs||[])if(!lastMet[id]||m.date>lastMet[id])lastMet[id]=m.date;
  const spons={};for(const b of office)if(b.spId)(spons[b.spId]=spons[b.spId]||[]).push(b);
  const gaps=Object.entries(spons).filter(([id])=>!lastMet[id]).sort((a,b)=>b[1].length-a[1].length);
  const metN=Object.keys(lastMet).length, legN=(LEGS||[]).filter(l=>l.id).length;
  return revOverview()+`<div class="grid2" style="align-items:start">
   <div class="card"><h2>Due this week</h2>${due.length?`<div class="rows">${due.map(it=>`<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div class="what" style="font-size:14.5px">${esc(it.kind==='ask'?it.ask:it.kind==='amend'?`Amendment: ${it.change}`:`Follow up: ${it.topic||'meeting'}`)}<span class="sub">${it.kind==='meet'?(it.legs||[]).map(outLegName).map(esc).join(', '):it.leg?esc(outLegName(it.leg)):''}${it.bill?' · '+outBill(it.bill):''}${it.owner?' · '+esc(it.owner):''}</span></div><div class="r">${outDueTag(it)}${outEdit(it)}</div></div>`).join('')}</div>`:'<p class="empty">Nothing due in the next week.</p>'}</div>
   <div class="card"><h2>Hearings coming up</h2><p class="desc">Bills the office has a position on with a hearing in the next two weeks.</p>${upcoming.length?`<div class="rows">${upcoming.map(({b,h})=>{const t=tests.find(x=>x.bill===b.key);return `<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div class="what" style="font-size:14.5px">${outBill(b.key)} ${esc(b.title)}<span class="sub">${esc(posName(posOf(b)))} · ${esc(h.committee)} · ${fmtMD(h.d)} ${fmtTime(h.d)}</span></div><div class="r">${t?`<span class="pill ${t.status==='final'?'pass':'muted'}">${t.status==='final'?'Testimony ready':'Draft'}</span>`:''}<a class="btn sm ${t?'':'primary'}" href="#outreach-testimony-${esc(b.key)}">${t?'Open':'Build testimony'}</a></div></div>`}).join('')}</div>`:'<p class="empty">No hearings in the next two weeks for bills with an office position.</p>'}</div></div>
  <div class="grid2" style="align-items:start">
   <div class="card"><h2>Recent meetings</h2>${meets.length?`<div class="rows">${meets.map(m=>`<div class="row" style="grid-template-columns:96px minmax(0,1fr) auto"><span class="small">${esc(outDate(m.date))}</span><div class="what" style="font-size:14.5px">${esc(m.topic||'Meeting')}<span class="sub">${[(m.legs||[]).map(outLegName).join(', '),m.others].filter(Boolean).map(esc).join(' · ')}${(m.bills||[]).length?' · '+m.bills.map(outBill).join(', '):''}</span></div><div class="r">${outEdit(m)}</div></div>`).join('')}</div><p class="small"><a href="#outreach-meetings">All meetings →</a></p>`:'<p class="empty">No meetings logged yet. Press <b>Log a meeting</b> after you talk with a legislator.</p>'}</div>
   <div class="card"><h2>Who we haven’t met</h2><p class="desc">Sponsors of bills the office has a position on, with no meeting logged. The office has met with ${plural(metN,'legislator')} of ${legN}.</p>
    ${gaps.length?`<div class="rows">${gaps.slice(0,12).map(([id,bs])=>`<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div>${outLegChip(id)}<span class="sub" style="display:block">${bs.map(b=>`${outBill(b.key)} <span class="tiny muted">${esc(posName(posOf(b)))}</span>`).join(' · ')}</span></div><div class="r"><button class="btn sm" data-outnew="meet" data-outpre="${esc(JSON.stringify({legs:[id],bills:bs.map(b=>b.key)}))}">Log a meeting</button></div></div>`).join('')}</div>`:`<p class="empty">${Object.keys(spons).length?'Every sponsor has a meeting logged.':'Once the office takes positions on bills, their sponsors show up here.'}</p>`}</div></div>`;
}
function outTable(head,rows,empty){return rows.length?`<div class="tablewrap" style="border:0"><table class="compact out-t"><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`:`<p class="empty">${empty}</p>`}
function outMeetings(){
  const l=outFilt(outOf('meet')).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return `<div class="card"><h2>Meetings <span class="tiny muted">${l.length}</span></h2>${outTable(['Date','With','From the office','Bills','Topic and notes','Follow-up',''],l.map(m=>`<tr><td style="white-space:nowrap">${esc(outDate(m.date))}</td><td>${(m.legs||[]).map(outLegChip).join('')}${m.others?`<div class="small muted">${esc(m.others)}</div>`:''}</td><td class="small">${esc((m.who||[]).join(', '))}</td><td>${(m.bills||[]).map(outBill).join(', ')}</td><td><b>${esc(m.topic||'')}</b>${m.notes?`<div class="small out-clip">${esc(m.notes)}</div>`:''}</td><td>${m.followup?(m.done?`<span class="pill pass">Done</span>`:outDueTag(m)):''}</td><td>${outEdit(m)}</td></tr>`),'No meetings yet.')}</div>`;
}
function outAsks(){
  const l=outFilt(outOf('ask')).sort((a,b)=>(outDue(a)||'9').localeCompare(outDue(b)||'9'));
  const typ=k=>(OUT_OPTS.askType.find(x=>x[0]===k)||[,''])[1];
  return `<div class="card"><h2>Asks <span class="tiny muted">${l.length}</span></h2><p class="desc">What the office asked each legislator for, and what they said. Change the status right in the table.</p>
   ${outTable(['Legislator','Bill','The ask','They said','Status','Follow up','Owner',''],l.map(a=>`<tr><td>${outLegChip(a.leg)}</td><td>${outBill(a.bill)}</td><td><span class="tiny muted">${esc(typ(a.type))}</span><div>${esc(a.ask)}</div></td><td class="small">${esc(a.committed||'')}</td><td><select data-outstatus="${esc(a.id)}" aria-label="Status">${OUT_OPTS.askStatus.map(([k,t])=>`<option value="${k}" ${a.status===k?'selected':''}>${t}</option>`).join('')}</select></td><td>${outDueTag(a)}</td><td class="small">${esc(a.owner||'')}</td><td>${outEdit(a)}</td></tr>`),'No asks yet. Press Add an ask.')}</div>`;
}
function outAmends(){
  const l=outFilt(outOf('amend')).sort((a,b)=>(outDue(a)||'9').localeCompare(outDue(b)||'9'));
  return `<div class="card"><h2>Amendments <span class="tiny muted">${l.length}</span></h2><p class="desc">Language the office wants changed, tied to the bill’s page and lines.</p>
   ${outTable(['Bill','Where','Change','Why','Asked of','Status','Needed by','Owner',''],l.map(a=>`<tr><td>${outBill(a.bill)}</td><td class="small">${esc(a.lines||'')}</td><td class="small out-clip">${esc(a.change)}</td><td class="small out-clip">${esc(a.why||'')}</td><td class="small">${esc(a.from||'')}</td><td><select data-outstatus="${esc(a.id)}" aria-label="Status">${OUT_OPTS.amendStatus.map(([k,t])=>`<option value="${k}" ${a.status===k?'selected':''}>${t}</option>`).join('')}</select></td><td>${outDueTag(a)}</td><td class="small">${esc(a.owner||'')}</td><td>${outEdit(a)}</td></tr>`),'No amendment requests yet.')}</div>`;
}
function outInterim(){
  const coms=outInterims(), items=outFilt(outOf('interim'));
  if(!coms.length)return '<div class="card"><p>Loading committees…</p></div>';
  const st=k=>(OUT_OPTS.interimStatus.find(x=>x[0]===k)||[,''])[1];
  return `<div class="card"><h2>Interim</h2><p class="desc">Between sessions, interim committees study the issues that become next year’s bills. Track the study items that touch the office and who’s preparing. Find agendas on <a href="https://le.utah.gov/committee/interim" target="_blank" rel="noopener">le.utah.gov</a>.</p></div>
   <div class="out-coms">${coms.map(c=>{const its=items.filter(x=>x.com===c.id).sort((a,b)=>(a.date||'').localeCompare(b.date||''));const ch=(c.members||[]).filter(m=>/chair/i.test(m.pos||'')&&!/vice/i.test(m.pos||''));
     return `<div class="card out-com"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><h3>${esc(c.name.replace(/ Interim Committee$/,''))}</h3><div class="tiny muted">${ch.length?'Chairs: '+ch.map(m=>esc(outLegName(m.id))).join(', '):''}</div></div><button class="btn sm" data-outnew="interim" data-outpre="${esc(JSON.stringify({com:c.id}))}">+ Add</button></div>
      ${its.length?`<div class="rows">${its.map(i=>`<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div class="what" style="font-size:14.5px">${esc(i.topic)}<span class="sub">${[i.date?outDate(i.date):'',i.division?divName(i.division):'',i.owner,st(i.status)].filter(Boolean).map(esc).join(' · ')}${i.link?` · <a href="${esc(i.link)}" target="_blank" rel="noopener">Materials</a>`:''}</span></div><div class="r">${outEdit(i)}</div></div>`).join('')}</div>`:'<p class="small muted" style="margin:8px 0 0">Nothing tracked.</p>'}</div>`}).join('')}</div>`;
}

// ---------- testimony builder
const OUT_VERB={support:'supports','priority-support':'strongly supports',oppose:'opposes','priority-oppose':'strongly opposes',neutral:'is neutral on'};
const outList=a=>a.length<3?a.join(' and '):a.slice(0,-1).join(', ')+', and '+a[a.length-1];
function outDraft(b,who){
  const pos=posOf(b), h=nextHearing(b), com=h&&typeof comFind==='function'?comFind(h.committee):null;
  const chM=com&&(com.members||[]).find(m=>/chair/i.test(m.pos||'')&&!/vice/i.test(m.pos||''));const chL=chM&&legById(chM.id);
  const p=[];
  p.push(`${chL?'Chair '+chL.name.split(' ').slice(-1)[0]:'Chair'} and members of the committee, thank you for the time. My name is ${who||'[your name]'}, [your title] with the Utah Attorney General’s Office.`);
  p.push(`The office ${OUT_VERB[pos]||'has been following'} ${billLabel(b)}, ${b.title}.${b.description?' '+b.description.split(/(?<=\.)\s/)[0]:''}`);
  const divs=divsOf(b).map(divName).filter(Boolean);const why=[];
  if(divs.length)why.push(`It touches the work of our ${outList(divs)} ${divs.length>1?'divisions':'division'}.`);
  if(agActOf(b))why.push(`For our office, it would mean: ${agActOf(b).replace(/\.?$/,'.')}`);
  why.push('[One or two sentences on why it matters, with a real example.]');
  p.push(why.join(' '));
  const c=fnCost(b);let cost='';
  if(b.fn&&b.fn.none)cost='The Legislature’s fiscal note finds no direct cost to the state.';
  else if(c&&(c.on||c.one))cost=`The fiscal note estimates ${[c.on?money(Math.abs(c.on))+' ongoing':'',c.one?money(Math.abs(c.one))+' one-time':''].filter(Boolean).join(' and ')}.`;
  if(typeof FH!=='undefined'&&FH&&FH.requests){const est=FH.requests.filter(r=>r.card_id&&r.card_id.startsWith(`${b.session}/${b.num}/`)&&r.status==='impact').reduce((n,r)=>n+(+((r.answer||{}).amount)||0),0);if(est)cost+=` Our divisions estimate about ${money(est)} to carry it out.`}
  if(cost)p.push(cost.trim());
  const rb=typeof runBefore==='function'?runBefore(b):null;
  if(rb&&rb.length)p.push(`Similar legislation has come before you, most recently in the ${sessName(rb[0].ses)}.`);
  const cp=Object.entries(cposOf(b)).filter(([,x])=>x.pos&&!['tagged','hold'].includes(x.pos)&&OUT_VERB[x.pos]).map(([k,x])=>`${desigName(k)} ${OUT_VERB[x.pos]} it`);
  if(cp.length)p.push(`We’re not alone: ${outList(cp)}.`);
  p.push(/support/.test(pos||'')?'For these reasons, we ask for your support. I’m happy to answer any questions.':/oppose/.test(pos||'')?'For these reasons, we respectfully ask that you not advance the bill in its current form. I’m happy to answer any questions.':'We’re glad to be a resource as you consider it, and I’m happy to answer any questions.');
  return p.join('\n\n');
}
let OUTTIMER=null;
function outTestimony(arg){
  const tests=outOf('testimony');
  if(arg){const b=BYKEY[arg];
    if(!b)return `<div class="card"><p>That bill isn’t in the ${esc(sessName(UI.session))}. Switch sessions at the top, or pick a bill below.</p></div>`;
    const ex=tests.find(x=>x.bill===b.key);
    if(!TESTI||TESTI.key!==b.key){const who=ME.display||ME.user;const h=nextHearing(b);TESTI={key:b.key,id:ex?ex.id:'',text:ex?ex.text:outDraft(b,who),testifier:ex?ex.testifier:who,hearing:ex?ex.hearing:(h?`${h.committee} · ${fmtLong(h.d)} ${fmtTime(h.d)}`:''),status:ex?ex.status:'draft',signup:ex?!!ex.signup:false,target:2}}
    const T=TESTI, words=(T.text.match(/\S+/g)||[]).length, secs=Math.round(words/150*60);
    return `<div class="card"><a class="small" href="#outreach-testimony">← All testimony</a><h2 style="margin-top:6px">Testimony: ${esc(billLabel(b))} ${esc(b.title)}</h2>
     <div class="out-tbuild"><div><div class="filters"><div class="field"><label for="tWho">Who’s testifying</label><input id="tWho" value="${esc(T.testifier)}"></div><div class="field grow"><label for="tHear">Hearing</label><input id="tHear" value="${esc(T.hearing)}"></div>
       <div class="field"><label for="tStatus">Status</label><select id="tStatus">${[['draft','Draft'],['final','Final'],['given','Given']].map(([k,l])=>`<option value="${k}" ${T.status===k?'selected':''}>${l}</option>`).join('')}</select></div></div>
      <label class="check" style="margin:6px 0"><input type="checkbox" id="tSignup" ${T.signup?'checked':''}><span>Signed up to testify</span></label>
      <textarea id="tText" class="out-ttext" aria-label="Testimony">${esc(T.text)}</textarea>
      <p class="small"><span id="tStats">${plural(words,'word')} · about ${clock(secs)} at a speaking pace</span> · <span class="muted">Fill in anything in [brackets] before you go.</span></p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="tSave">Save</button><button class="btn" id="tCopy">Copy</button><button class="btn" id="tPrint">Print</button><button class="btn" id="tRebuild">Start over from the bill</button>${T.id?'<button class="btn danger" id="tDel">Delete</button>':''}</div></div>
      <div class="out-side"><div class="out-timer"><div class="tiny muted">Rehearse</div><div class="out-clock" id="tClock">0:00</div><div class="out-tbar"><i id="tBar"></i></div>
        <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:8px"><button class="btn sm primary" id="tGo">Start</button><button class="btn sm" id="tReset">Reset</button><select id="tTarget" aria-label="Time limit">${[1,2,3,5].map(m=>`<option value="${m}" ${T.target===m?'selected':''}>${m} min</option>`).join('')}</select></div>
        <p class="tiny muted" style="margin-top:6px">Committees usually give public testimony one to two minutes.</p></div>
       <div class="out-ref"><h4>For reference (not in the draft)</h4>
        <p class="small"><b>Office position:</b> ${esc(posName(posOf(b))||'none yet')}${priOf(b)?` · ${esc(priName(priOf(b)))}`:''}</p>
        ${noteOf(b)?`<p class="small"><b>Team notes:</b> ${esc(noteOf(b))}</p>`:''}
        ${Object.keys(cposOf(b)).length?`<p class="small"><b>Associations:</b> ${Object.entries(cposOf(b)).map(([k,x])=>`${esc(desigName(k))} ${esc(x.raw||cposLabel(x.pos))}`).join(' · ')}</p>`:''}
        <p class="small"><a href="${billHref(b)}">Open the bill</a> · <a href="#packet-${esc(b.session)}-${esc(b.num)}">Prep packet</a></p></div></div></div></div>`;
  }
  const S=UI.session, opts=allRows(S).filter(b=>!b.file&&posOf(b)).sort(SORTS.num);
  return `<div class="card"><h2>Testimony</h2><p class="desc">Pick a bill and the site drafts a two-minute statement from the office’s position, what the bill does, the divisions it touches, the fiscal note and any Fiscal Hive estimates, earlier versions, and where the associations stand. Edit it, rehearse it against the clock, and save it for whoever’s testifying.</p>
    <div class="filters"><div class="field grow"><label for="tPick">Bill</label><input id="tPick" list="tPickDL" placeholder="HB 101"><datalist id="tPickDL">${allRows(S).filter(b=>!b.file).sort(SORTS.num).map(b=>`<option value="${esc(billLabel(b))}">${esc(b.title)}</option>`).join('')}</datalist></div><button class="btn primary" id="tPickGo">Build testimony</button></div>
    ${opts.length?`<p class="small muted">Bills with an office position: ${opts.slice(0,30).map(b=>`<a href="#outreach-testimony-${esc(b.key)}">${esc(billLabel(b))}</a>`).join(', ')}${opts.length>30?'…':''}</p>`:''}</div>
   <div class="card"><h2>Saved <span class="tiny muted">${tests.length}</span></h2>${outTable(['Bill','Hearing','Testifying','Status',''],tests.slice().sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||'')).map(t=>`<tr><td>${outBill(t.bill)}</td><td class="small">${esc(t.hearing||'')}</td><td class="small">${esc(t.testifier||'')}${t.signup?' <span class="pill pass">Signed up</span>':''}</td><td><span class="pill ${t.status==='final'?'pass':'muted'}">${esc({draft:'Draft',final:'Final',given:'Given'}[t.status]||t.status)}</span></td><td><a class="btn sm" href="#outreach-testimony-${esc(t.bill)}">Open</a></td></tr>`),'No testimony saved yet.')}</div>`;
}

// ---------- on the bill page and legislator profiles
function outBillHTML(b){
  if(!canOutreach())return '';const L=outLoad();if(!L)return '';
  if(b.file)return revBillBox(b)?`<section><h2>Draft review</h2>${revBillBox(b)}</section>`:'';
  const mt=outOf('meet').filter(m=>(m.bills||[]).includes(b.key)).sort((x,y)=>(y.date||'').localeCompare(x.date||''));
  const as=outOf('ask').filter(a=>a.bill===b.key), am=outOf('amend').filter(a=>a.bill===b.key), t=outOf('testimony').find(x=>x.bill===b.key);
  const pre=esc(JSON.stringify({bills:[b.key],bill:b.key,legs:b.spId?[b.spId]:[],leg:b.spId||''}));
  return `<section><h2>Testimony and outreach</h2>
   <div class="out-billbox"><div><b>Testimony</b><div class="small">${t?`${esc({draft:'Draft',final:'Final',given:'Given'}[t.status])}${t.testifier?' · '+esc(t.testifier):''}`:'<span class="muted">None yet</span>'}</div><a class="btn sm ${t?'':'primary'}" href="#outreach-testimony-${esc(b.key)}">${t?'Open testimony':'Build testimony'}</a></div>
    <div><b>Meetings</b><div class="small">${mt.length?`${plural(mt.length,'meeting')}, last ${esc(outDate(mt[0].date))} with ${esc((mt[0].legs||[]).map(outLegName).join(', ')||mt[0].others||'—')}`:'<span class="muted">None logged</span>'}</div><button class="btn sm" data-outnew="meet" data-outpre="${pre}">Log a meeting</button></div>
    <div><b>Asks</b><div class="small">${as.length?as.slice(0,3).map(a=>`${esc(outLegName(a.leg))}: ${esc(a.ask.slice(0,70))} <span class="tiny muted">(${esc(a.status)})</span>`).join('<br>'):'<span class="muted">None</span>'}</div><button class="btn sm" data-outnew="ask" data-outpre="${pre}">Add an ask</button></div>
    ${revBillBox(b)}
    <div><b>Amendments</b><div class="small">${am.length?am.slice(0,3).map(a=>`${esc(a.lines||'')} ${esc(a.change.slice(0,60))} <span class="tiny muted">(${esc(a.status)})</span>`).join('<br>'):'<span class="muted">None</span>'}</div><button class="btn sm" data-outnew="amend" data-outpre="${pre}">Request an amendment</button></div></div></section>`;
}
function outLegHTML(id){
  if(!canOutreach())return '';const L=outLoad();if(!L)return '';
  const mt=outOf('meet').filter(m=>(m.legs||[]).includes(id)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const as=outOf('ask').filter(a=>a.leg===id);
  return `<div class="out-legbox"><h3>Office contact</h3><p class="small">${mt.length?`Last met ${esc(outDate(mt[0].date))}${mt[0].topic?` about “${esc(mt[0].topic)}”`:''} · ${plural(mt.length,'meeting')} logged`:'No meetings logged yet.'}${as.filter(outIsOpen).length?` · <b>${plural(as.filter(outIsOpen).length,'open ask')}</b>`:''}</p>
   ${as.filter(outIsOpen).slice(0,4).map(a=>`<div class="small">• ${esc(a.ask)}${a.bill?' ('+outBill(a.bill)+')':''} ${outDueTag(a)}</div>`).join('')}
   <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" data-outnew="meet" data-outpre="${esc(JSON.stringify({legs:[id]}))}">Log a meeting</button><button class="btn sm" data-outnew="ask" data-outpre="${esc(JSON.stringify({leg:id}))}">Add an ask</button><a class="btn sm" href="#outreach-meetings">All meetings</a></div></div>`;
}

// ---------- binding
document.addEventListener('click',e=>{
  const n=e.target.closest&&e.target.closest('[data-outnew]');if(n){e.preventDefault();let pre={};try{pre=JSON.parse(n.dataset.outpre||'{}')}catch(_){}outDialog(n.dataset.outnew,null,pre);return}
  const ed=e.target.closest&&e.target.closest('[data-outedit]');if(ed){e.preventDefault();const it=(outLoad()||[]).find(x=>x.id===ed.dataset.outedit);if(it)outDialog(it.kind,it)}
});
function outStopTimer(){if(OUTTIMER){clearInterval(OUTTIMER.iv);OUTTIMER=null}}
function outBind(){
  if(typeof revBind==='function')revBind();
  if(!location.hash.startsWith('#outreach')){outStopTimer();return}
  on('outMine','onchange',e=>{OUTMINE=e.target.checked;route(true)});
  on('outOpen','onchange',e=>{OUTOPEN=e.target.checked;route(true)});
  app.querySelectorAll('[data-outstatus]').forEach(sel=>sel.onchange=async()=>{const it=OUT.find(x=>x.id===sel.dataset.outstatus);if(!it)return;try{const j=await api('outreach',{kind:it.kind,id:it.id,item:{...it,status:sel.value}});OUT=j.items;toast('Status updated');route(true)}catch(err){toast(err.message)}});
  on('tPickGo','onclick',()=>{const k=typeof normBill==='function'?normBill($('tPick').value,UI.session):'';if(!k||!BYKEY[k]){toast('Pick a bill from this session, like “HB 101”.');return}location.hash='#outreach-testimony-'+k});
  const tx=$('tText');if(!tx||!TESTI)return;
  const sync=()=>{TESTI.text=tx.value;TESTI.testifier=$('tWho').value;TESTI.hearing=$('tHear').value;TESTI.status=$('tStatus').value;TESTI.signup=$('tSignup').checked};
  tx.oninput=()=>{sync();const w=(tx.value.match(/\S+/g)||[]).length;$('tStats').textContent=`${plural(w,'word')} · about ${clock(Math.round(w/150*60))} at a speaking pace`};
  ['tWho','tHear','tStatus','tSignup'].forEach(id=>on(id,'onchange',sync));
  on('tSave','onclick',async()=>{sync();try{const j=await api('outreach',{kind:'testimony',id:TESTI.id,item:{bill:TESTI.key,hearing:TESTI.hearing,testifier:TESTI.testifier,text:TESTI.text,status:TESTI.status,signup:TESTI.signup}});OUT=j.items;const x=OUT.find(t=>t.kind==='testimony'&&t.bill===TESTI.key);if(x)TESTI.id=x.id;toast('Testimony saved');route(true)}catch(err){toast(err.message)}});
  on('tCopy','onclick',async()=>{sync();const ok=typeof copyText==='function'?await copyText(TESTI.text):false;toast(ok?'Testimony copied':'Couldn’t copy. Select the text and copy it yourself.')});
  on('tPrint','onclick',()=>{sync();const b=BYKEY[TESTI.key];const w=open('','_blank');if(!w){toast('Allow pop-ups to print.');return}
    w.document.write(`<!doctype html><title>Testimony ${esc(billLabel(b))}</title><style>body{font:17px/1.6 Georgia,serif;max-width:680px;margin:40px auto;color:#222}h1{font:600 20px Arial,sans-serif;color:#002147}p.m{font:13px Arial,sans-serif;color:#555}footer{margin-top:40px;font:11px Arial,sans-serif;color:#888;text-align:center}</style><h1>${esc(billLabel(b))} ${esc(b.title)}</h1><p class="m">${esc(TESTI.hearing)}${TESTI.testifier?' · '+esc(TESTI.testifier):''}</p>${TESTI.text.split(/\n\s*\n/).map(x=>`<p>${esc(x)}</p>`).join('')}<footer>Attorney Work Product / Attorney-Client Communication</footer>`);w.document.close();w.focus();w.print()});
  on('tRebuild','onclick',()=>{if(!confirm('Replace the text with a fresh draft from the bill?'))return;const b=BYKEY[TESTI.key];TESTI.text=outDraft(b,$('tWho').value);route(true)});
  on('tDel','onclick',async()=>{if(!confirm('Delete this testimony?'))return;try{const j=await api('outreach',{action:'delete',id:TESTI.id});OUT=j.items;TESTI=null;location.hash='#outreach-testimony'}catch(err){toast(err.message)}});
  on('tTarget','onchange',e=>{TESTI.target=+e.target.value});
  const paint=()=>{const s=OUTTIMER?OUTTIMER.acc+(OUTTIMER.run?(Date.now()-OUTTIMER.t0)/1000:0):0,lim=TESTI.target*60;const c=$('tClock'),bar=$('tBar');if(!c)return outStopTimer();
    c.textContent=clock(s);c.classList.toggle('over',s>lim);bar.style.width=Math.min(100,s/lim*100)+'%';bar.classList.toggle('over',s>lim)};
  if(OUTTIMER){paint();$('tGo').textContent=OUTTIMER.run?'Pause':'Start'}
  on('tGo','onclick',()=>{if(!OUTTIMER)OUTTIMER={acc:0,run:false,t0:0,iv:setInterval(paint,250)};
    if(OUTTIMER.run){OUTTIMER.acc+=(Date.now()-OUTTIMER.t0)/1000;OUTTIMER.run=false}else{OUTTIMER.t0=Date.now();OUTTIMER.run=true}$('tGo').textContent=OUTTIMER.run?'Pause':'Start';paint()});
  on('tReset','onclick',()=>{outStopTimer();$('tClock').textContent='0:00';$('tClock').classList.remove('over');$('tBar').style.width='0';$('tGo').textContent='Start'});
}
