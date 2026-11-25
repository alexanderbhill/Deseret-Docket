/* Outreach → Wish list: what the office wants changed in a future session, and getting the language for it
   written, checked and into a sponsor's and drafter's hands.
   Three lists, like the office's spreadsheet: the OAG wish list, the client wish list (requests from the
   agencies the office represents) and outside ideas. Each idea moves along:
     Idea → Writing the language → Language ready → Sent to sponsor or drafter → Bill file opened → Numbered bill → Passed (or Parked)
   On each idea: the proposed language (typed, or attached as a Word or PDF file), "Get the divisions' input"
   (starts a Draft review of our own language, so divisions answer from their email with comments or a redline),
   and "Send to the sponsor and drafter" (an email from you in Outlook, with the language in it).
   Stored as Outreach items of kind "wish" (lib/outreach.js). */
'use strict';
let WISHSES='';
const WISH_LISTS=[['office','OAG wish list','What the office itself wants changed.'],['client','Client wish list','Requests from the agencies the office represents.'],['outside','Outside ideas','Ideas from legislators, advocacy groups and others that the office is weighing in on.']];
const WISH_STEPS=[['idea','Idea'],['drafting','Writing the language'],['ready','Language ready'],['sent','Sent to sponsor or drafter'],['filed','Bill file opened'],['numbered','Numbered bill'],['passed','Passed']];
const wishStep=s=>Math.max(0,WISH_STEPS.findIndex(x=>x[0]===s));
const wishPill=it=>it.status==='parked'?'<span class="pill muted">Parked</span>':`<span class="wish-st s${wishStep(it.status)}">${esc((WISH_STEPS.find(x=>x[0]===it.status)||WISH_STEPS[0])[1])}</span>`;
function wishMine(it){const me=[ME.user,ME.display,(ME.display||'').split(' ')[0]].filter(Boolean).map(x=>x.toLowerCase());const poc=String(it.poc||'').toLowerCase();return it.by===ME.user||me.some(m=>m.length>2&&poc.includes(m))}
function wishPage(){
  const all=outOf('wish'), ses=[...new Set(all.map(x=>x.session).filter(Boolean))].sort().reverse();
  const L=all.filter(it=>(!WISHSES||it.session===WISHSES)&&(!OUTMINE||wishMine(it))&&(!OUTOPEN||outIsOpen(it)));
  const reviews=outOf('review');
  const row=it=>{const rv=reviews.filter(r=>r.wish===it.id);const b=it.bill&&BYKEY[it.bill];
    return `<tr class="wish-row" data-wish="${esc(it.id)}" tabindex="0"><td>${it.priority?'<span class="wish-pri" title="Priority">★</span>':''}</td><td><b>${esc(it.team||'')}</b>${it.division?`<div class="tiny muted">${esc(divName(it.division))}</div>`:''}</td>
     <td><b class="wish-sum">${esc(it.summary)}</b>${it.todo?` <span class="pill warn">${esc(it.todo)}</span>`:''}${it.details?`<div class="small muted out-clip">${esc(it.details)}</div>`:''}</td>
     <td>${wishPill(it)}${rv.length?`<div class="tiny muted">${plural(rv.length,'draft review')}</div>`:''}${b?`<div>${outBill(it.bill)}</div>`:''}</td>
     <td class="small"><div class="out-clip">${esc(it.next||'')}</div></td><td class="small">${esc(it.poc||'')}${it.sponsor?`<div>${outLegChip(it.sponsor)}</div>`:''}</td></tr>`};
  const counts=WISH_STEPS.map(([k,l])=>[k,l,all.filter(x=>x.status===k&&(!WISHSES||x.session===WISHSES)).length]);
  return `<div class="card"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><h2>Wish list</h2>
     <p class="desc">Changes the office wants in a future session, and the language for them. Click an idea to write or attach its language, get the divisions’ input, and send it to a sponsor and the drafting attorney.</p></div>
     <div class="out-add"><button class="btn primary" data-outnew="wish">+ Add an idea</button><label class="btn">${ic('file')}Import your spreadsheet<input type="file" id="wishImp" accept=".csv,.xlsx,.xls" hidden></label></div></div>
    <div class="wish-pipe">${counts.map(([k,l,n],i)=>`<div class="s${i}"><b>${n}</b><span>${esc(l)}</span></div>`).join('')}</div>
    <div class="filters" style="margin-top:10px"><div class="field"><label for="wishSes">Session</label><select id="wishSes"><option value="">All sessions</option>${ses.map(x=>`<option value="${x}" ${WISHSES===x?'selected':''}>${esc(sessName(x))}</option>`).join('')}</select></div></div></div>
   ${WISH_LISTS.map(([k,l,d])=>{const r=L.filter(x=>(x.list||'office')===k).sort((a,b)=>(b.priority-a.priority)||wishStep(b.status)-wishStep(a.status)||(a.team||'').localeCompare(b.team||''));
     return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap"><h2>${esc(l)} <span class="tiny muted">${r.length}</span></h2><button class="btn sm" data-outnew="wish" data-outpre="${esc(JSON.stringify({list:k}))}">+ Add</button></div><p class="desc">${esc(d)}</p>
      ${r.length?`<div class="tablewrap" style="border:0"><table class="compact out-t wish-t"><thead><tr><th style="width:26px" aria-label="Priority"></th><th>${k==='outside'?'Group':'OAG team'}</th><th>Summary</th><th>Where it stands</th><th>Next steps</th><th>OAG POC</th></tr></thead><tbody>${r.map(row).join('')}</tbody></table></div>`:'<p class="empty">Nothing here yet.</p>'}</div>`}).join('')}`;
}
// On the Outreach overview: where the wish list stands, and the priorities that need something.
function wishOverview(){
  const all=outOf('wish').filter(outIsOpen);if(!all.length)return '';
  const pri=all.filter(x=>x.priority).sort((a,b)=>wishStep(a.status)-wishStep(b.status)).slice(0,6);
  return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2>Wish list</h2><a class="btn sm" href="#outreach-wish">All ideas →</a></div>
   <div class="wish-pipe">${WISH_STEPS.map(([k,l],i)=>`<div class="s${i}"><b>${all.filter(x=>x.status===k).length}</b><span>${esc(l)}</span></div>`).join('')}</div>
   ${pri.length?`<h4 class="out-sub">Priorities</h4><div class="rows">${pri.map(it=>`<div class="row wish-row" data-wish="${esc(it.id)}" tabindex="0" style="grid-template-columns:minmax(0,1fr) auto;cursor:pointer"><div class="what" style="font-size:14.5px"><span class="wish-pri">★</span> ${esc(it.summary)}<span class="sub">${[it.team,it.todo,it.next].filter(Boolean).map(esc).join(' · ')}</span></div><div class="r">${wishPill(it)}</div></div>`).join('')}</div>`:''}</div>`;
}
// ---------- one idea, in full
function wishOpen(id){
  const it=(outLoad()||[]).find(x=>x.id===id);if(!it)return;
  const rv=outOf('review').filter(r=>r.wish===it.id).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));
  const step=wishStep(it.status), b=it.bill&&BYKEY[it.bill];
  let dlg=$('wishDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='wishDlg';dlg.className='rev-dlg';document.body.appendChild(dlg)}
  dlg.innerHTML=`<div class="demo-top"><div><span class="kicker">${esc((WISH_LISTS.find(x=>x[0]===(it.list||'office'))||WISH_LISTS[0])[1])}${it.priority?' · ★ Priority':''}${it.session?' · '+esc(sessName(it.session)):''}</span><h2>${esc(it.summary)}</h2>
     <div class="small muted">${[it.team,it.division?divName(it.division):'',it.poc?'POC '+it.poc:''].filter(Boolean).map(esc).join(' · ')}</div></div>
     <div style="display:flex;gap:6px"><button type="button" class="btn sm" data-outedit="${esc(it.id)}">Edit</button><button type="button" class="btn sm" id="wishX">Close</button></div></div>
   <ol class="wish-steps">${WISH_STEPS.map(([k,l],i)=>`<li class="${it.status==='parked'?'':i<step?'done':i===step?'on':''}"><button type="button" data-wstep="${k}" title="Set to “${esc(l)}”">${esc(l)}</button></li>`).join('')}</ol>
   ${it.status==='parked'?'<div class="rev-banner closed">Parked. Pick a step above to pick it back up.</div>':''}
   ${it.details?`<p>${esc(it.details)}</p>`:''}
   ${it.next||it.todo?`<p class="small"><b>Next:</b> ${esc([it.todo,it.next].filter(Boolean).join(' · '))}</p>`:''}
   <div class="grid2" style="align-items:start;gap:18px">
    <div><h3 class="rev-h">The language</h3><p class="tiny muted">Type or paste the proposed language, attach it as a Word or PDF file, or both.</p>
     <textarea id="wishLang" rows="10" class="rev-body" placeholder="Section 76-6-412 is amended to read: …">${esc(it.language||'')}</textarea>
     <button class="btn sm" id="wishLangSave">Save the language</button>
     <div style="margin-top:10px">${outFilesBox(it.id,{label:'Attach language or a redline',hint:'Word or PDF, up to 10 MB.'})}</div></div>
    <div><h3 class="rev-h">Next moves</h3>
     <div class="wish-act">
      <button class="btn" id="wishReview">${ic('users')}<span><b>Get the divisions’ input</b><span class="tiny">Each division gets an email from you and answers with comments or a redline.</span></span></button>
      <button class="btn primary" id="wishSend">${ic('mail')}<span><b>Send to the sponsor and drafter</b><span class="tiny">An email from you in Outlook, with the language in it.</span></span></button>
     </div>
     ${it.sent?`<p class="small" style="margin-top:8px"><span class="pill pass">Sent ${esc(outDate(it.sent))}</span>${it.sentTo?' to '+esc(it.sentTo):''}</p>`:''}
     <dl class="kv small" style="margin-top:10px"><dt>Sponsor</dt><dd>${it.sponsor?outLegChip(it.sponsor):'<span class="muted">Not yet</span>'}</dd><dt>Drafter</dt><dd>${esc(it.drafter||'')}${it.drafterEmail?` <span class="muted">${esc(it.drafterEmail)}</span>`:''}${!it.drafter&&!it.drafterEmail?'<span class="muted">Not yet</span>':''}</dd><dt>Bill</dt><dd>${b?`${outBill(it.bill)} ${esc(b.title)}`:'<span class="muted">Not filed yet</span>'}</dd></dl>
     ${rv.length?`<h3 class="rev-h" style="margin-top:12px">Draft reviews</h3>${rv.map(r=>`<div class="small"><a href="#" data-rev="open" data-id="${esc(r.id)}">${esc(revName(r))}${r.version?' ('+esc(r.version)+')':''}</a> · ${esc(REV_TURN[revTurn(r)])} · ${revIn(r)} of ${revAsked(r)} answered</div>`).join('')}`:''}
    </div></div>`;
  dlg.querySelector('#wishX').onclick=()=>dlg.close();
  if(!dlg.open)dlg.showModal();
  outFilesLoad(dlg);
  const save=async(patch,msg)=>{try{const j=await api('outreach',{kind:'wish',id:it.id,item:{...it,...patch}});OUT=j.items;if(msg)toast(msg);wishOpen(it.id);route(true)}catch(err){toast(err.message)}};
  dlg.querySelectorAll('[data-wstep]').forEach(b=>b.onclick=()=>save({status:b.dataset.wstep},'Updated'));
  $('wishLangSave').onclick=()=>save({language:$('wishLang').value,status:it.status==='idea'&&$('wishLang').value.trim()?'drafting':it.status},'Language saved');
  $('wishReview').onclick=async()=>{
    if($('wishLang').value!==(it.language||''))await save({language:$('wishLang').value});
    try{const j=await api('outreach',{kind:'review',item:{title:it.summary,wish:it.id,fromRole:'office',from:'',divisions:it.division?[it.division]:[],bill:it.bill||'',notes:it.details||'',owner:ME.display||ME.user,received:todayStr}});
      OUT=j.items;const r=OUT.filter(x=>x.kind==='review'&&x.wish===it.id).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''))[0];
      dlg.close();toast('Draft review started. Pick the divisions and send it.');location.hash='#outreach-drafts';if(r)setTimeout(()=>{if(typeof outDialog==='function')outDialog('review',r)},300)}catch(err){toast(err.message)}};
  $('wishSend').onclick=()=>wishCompose(it.id);
}
// ---------- the email to the sponsor and drafter, from the person sending it
function wishCompose(id){
  const it=(outLoad()||[]).find(x=>x.id===id);if(!it)return;
  const l=it.sponsor&&legById(it.sponsor), lang=($('wishLang')&&$('wishLang').value)||it.language||'';
  const to=[it.drafterEmail,legEmail(l)].filter(Boolean).join(', ');
  const hi=[l?`${l.house==='S'?'Senator':'Representative'} ${l.name.split(' ').slice(-1)[0]}`:'',it.drafter?it.drafter.split(' ')[0]:''].filter(Boolean).join(' and ')||'there';
  const body=[`Hi ${hi},`,'',`The Utah Attorney General’s Office would like to propose the following${it.session?` for the ${sessName(it.session)}`:''}: ${it.summary}.`,
    ...(it.details?['',it.details]:[]),...(lang?['','Proposed language:','',lang]:[]),'',lang?'Please let me know if you have any questions or would like to talk through it.':'I’ve attached the proposed language. Please let me know if you have any questions or would like to talk through it.',
    '','Thanks,',ME.display||ME.user,ME.title?`${ME.title}, Utah Attorney General’s Office`:'Utah Attorney General’s Office',...(ME.phone?[ME.phone]:[])].join('\n');
  let dlg=$('revDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='revDlg';dlg.className='rev-dlg';document.body.appendChild(dlg)}
  if($('wishDlg')&&$('wishDlg').open)$('wishDlg').close();
  dlg.innerHTML=`<div class="demo-top"><div><span class="kicker">Send the language</span><h2>${esc(it.summary)}</h2></div><button type="button" class="btn sm" id="wcX">Close</button></div>
   <div class="filters"><div class="field grow"><label for="wcTo">To</label><input id="wcTo" value="${esc(to)}" placeholder="drafter@le.utah.gov, sponsor"></div><div class="field grow"><label for="wcCc">CC</label><input id="wcCc" value=""></div></div>
   <div class="field"><label for="wcSubj">Subject</label><input id="wcSubj" value="${esc(`Proposed language: ${it.summary}`)}"></div>
   <div class="field"><label for="wcBody">Email (edit before sending)</label><textarea id="wcBody" rows="14" class="rev-body">${esc(body)}</textarea></div>
   <div class="field"><label>Attach in Outlook</label><div class="tiny muted" style="margin-bottom:4px">Download the files you want to send and attach them to the email.</div>${outFilesBox(it.id,{label:'Add a file',hint:'Word or PDF, up to 10 MB.'})}</div>
   <div class="rev-act" style="margin-top:10px"><a class="btn primary" id="wcOutlook" href="#">${ic('mail')}Open in Outlook</a><a class="btn" id="wcWeb" href="#" target="_blank" rel="noopener">${ic('external')}Outlook on the web</a><button class="btn" id="wcCopy">Copy</button></div>
   <div class="rev-mark" id="wcMark" hidden><b>Did it go out?</b> <button class="btn sm primary" id="wcSent">Yes, mark it sent</button> <span class="tiny muted">Records the date and moves it to “Sent to sponsor or drafter.”</span></div>`;
  const v=()=>({to:$('wcTo').value.trim(),cc:$('wcCc').value.trim(),subj:$('wcSubj').value,body:$('wcBody').value});
  const q=x=>`${x.cc?`cc=${encodeURIComponent(x.cc)}&`:''}subject=${encodeURIComponent(x.subj)}&body=${encodeURIComponent(x.body)}`;
  $('wcX').onclick=()=>dlg.close();
  $('wcOutlook').onclick=e=>{e.preventDefault();const x=v();location.href=`mailto:${encodeURIComponent(x.to).replace(/%2C/g,',').replace(/%40/g,'@')}?${q(x)}`;$('wcMark').hidden=false};
  $('wcWeb').onclick=()=>{const x=v();$('wcWeb').href=`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(x.to)}&${q(x)}`;$('wcMark').hidden=false};
  $('wcCopy').onclick=async()=>{const ok=typeof copyText==='function'?await copyText(v().body):false;toast(ok?'Copied':'Couldn’t copy. Select the text and copy it yourself.');$('wcMark').hidden=false};
  $('wcSent').onclick=async()=>{try{const x=v();const j=await api('outreach',{kind:'wish',id:it.id,item:{...it,language:lang,status:wishStep(it.status)<wishStep('sent')?'sent':it.status,sent:todayStr,sentTo:x.to}});OUT=j.items;dlg.close();toast('Marked sent');route(true);wishOpen(it.id)}catch(err){toast(err.message)}};
  if(!dlg.open)dlg.showModal();
  outFilesLoad(dlg);
}
// ---------- importing the office's spreadsheet
// Sections start with a row naming the list (OAG WISH LIST, CLIENT WISH LIST, OUTSIDE IDEAS); under each, a header
// row (Priority, To Do, OAG Team or Group, Summary, Next Steps, OAG POC) and then the ideas.
function wishParse(rows){
  const out=[];let list='office',col=null;
  for(const r of rows){const cells=r.map(c=>String(c??'').trim()),filled=cells.filter(Boolean),line=filled.join(' ').toUpperCase();
    // a section heading is a row with just its name (and maybe the Priority / To Do labels beside it)
    const head=filled.filter(c=>!/^(priority|to ?do)$/i.test(c)).length===1;
    if(head&&/OAG WISH LIST/.test(line)){list='office';continue}if(head&&/CLIENT WISH LIST/.test(line)){list='client';continue}if(head&&/OUTSIDE IDEAS?/.test(line)){list='outside';continue}
    const sumI=cells.findIndex(c=>/^summary$/i.test(c));
    if(sumI>=0){col={sum:sumI,team:cells.findIndex(c=>/^(oag team|team|group|agency|client)$/i.test(c)),next:cells.findIndex(c=>/^next steps?$/i.test(c)),poc:cells.findIndex(c=>/poc|point of contact/i.test(c)),pri:cells.findIndex(c=>/^priority$/i.test(c)),todo:cells.findIndex(c=>/^to ?do$/i.test(c))};
      if(col.pri<0)col.pri=0;if(col.todo<0)col.todo=1;continue}
    if(!col)continue;const g=i=>i>=0?(cells[i]||''):'';
    const summary=g(col.sum);if(!summary)continue;
    out.push({list,summary,team:g(col.team),next:g(col.next),poc:g(col.poc),priority:/priority|yes|^x$|^y$/i.test(g(col.pri)),todo:/^priority$/i.test(g(col.todo))?'':g(col.todo),status:'idea'});
  }
  return out;
}
async function wishImport(file){
  try{const rows=typeof readSheetFile==='function'?await readSheetFile(file):[];const items=wishParse(rows);
    if(!items.length){toast('Couldn’t find any ideas. The sheet needs a row with a “Summary” heading above the ideas.');return}
    const by={office:0,client:0,outside:0};items.forEach(x=>by[x.list]++);
    if(!confirm(`Add ${plural(items.length,'idea')} to the wish list?\n\nOAG wish list: ${by.office}\nClient wish list: ${by.client}\nOutside ideas: ${by.outside}\n\nNothing already on the list is changed.`))return;
    const j=await api('outreach',{action:'bulk',kind:'wish',items});OUT=j.items;toast(`Added ${plural(j.added,'idea')}`);route(true)}catch(err){toast(err.message)}
}
document.addEventListener('click',e=>{const r=e.target.closest&&e.target.closest('.wish-row');if(r&&!e.target.closest('a,button')){e.preventDefault();wishOpen(r.dataset.wish)}});
document.addEventListener('keydown',e=>{const r=e.target.closest&&e.target.closest('.wish-row');if(r&&e.key==='Enter'){e.preventDefault();wishOpen(r.dataset.wish)}});
function wishBind(){
  on('wishSes','onchange',e=>{WISHSES=e.target.value;route(true)});
  const imp=$('wishImp');if(imp)imp.onchange=()=>{const f=imp.files[0];imp.value='';if(f)wishImport(f)};
}
