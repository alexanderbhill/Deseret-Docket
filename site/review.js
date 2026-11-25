/* Draft review (Outreach → Draft review): tracking a draft from the drafter, out to the office's divisions for
   comments, and back from whoever is handling it to the drafter and legislators.
   Each review shows whose turn it is:
     Waiting on us       just received (send it to the divisions), or every division answered (send the feedback back)
     Waiting on divisions  a division hasn't answered yet
     Waiting on the drafter  the feedback went back; "New version came in" starts the next round
   Divisions answer from a private link in their email (functions/review/[[path]].js). Until email is connected,
   those emails wait in Fiscal Hive → Settings → Outbox. Stored as Outreach items of kind "review" (lib/review.js). */
'use strict';
const REV_TURN={us:'Waiting on us',team:'Waiting on divisions',drafter:'Waiting on the drafter',closed:'Closed'};
const REV_ROLE={drafter:'Drafter (LRGC)',sponsor:'Sponsor',stakeholder:'Stakeholder',office:'Our own language'};
function revTurn(it){if(it.closed)return 'closed';if(it.sent&&it.sent.at)return 'drafter';if(Object.values(it.reqs||{}).some(r=>r.status==='waiting'))return 'team';return 'us'}
function revParseBill(v){const t=String(v||'').trim();if(!t)return '';const k=typeof normBill==='function'?normBill(t,UI.session):'';if(k&&BYKEY[k])return k;
  const f=allRows(UI.session).find(b=>b.file&&b.title.toLowerCase()===t.toLowerCase());return f?f.key:''}
const revName=it=>{const b=BYKEY[it.bill];return b?(b.file?b.title:`${billLabel(b)} ${b.title}`):[it.label,it.title].filter(Boolean).join(' ')||'Draft'};
const revReqs=it=>Object.entries(it.reqs||{});
const revAsked=it=>revReqs(it).length, revIn=it=>revReqs(it).filter(([,r])=>r.status!=='waiting').length;
function revSince(it){const t=revTurn(it),R=revReqs(it).map(([,r])=>r);
  if(t==='drafter')return it.sent.at;if(t==='team')return R.filter(r=>r.status==='waiting').map(r=>r.sent).sort().pop()||it.updated_at;
  if(t==='us'&&R.length)return R.map(r=>r.at||r.sent).sort().pop();return t==='closed'?it.updated_at:(it.received?it.received+'T08:00:00':it.created_at)}
function revAge(iso){if(!iso)return '';const d=Math.floor((Date.now()-new Date(iso))/864e5);return d<=0?'today':d===1?'1 day':`${d} days`}
const revWhen=iso=>{if(!iso)return '';const d=new Date(iso);return `${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}, ${d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`};
function revDiv(it,v){const r=(it.reqs||{})[v];const st=!r?'todo':r.status;
  return `<span class="rev-div ${st}" title="${esc(divName(v))}: ${st==='todo'?'not asked yet':st==='waiting'?'waiting':st==='none'?'no concerns':'comments'}">${st==='none'?ic('check'):st==='comments'?ic('pencil'):st==='waiting'?ic('clock'):''}${esc(divName(v))}</span>`}
function revFlag(it){const t=revTurn(it);
  if(t==='team'&&it.due&&it.due<todayStr)return `<span class="pill warn">Comments were due ${esc(outDate(it.due))}</span>`;
  if(t==='team'&&it.due)return `<span class="pill muted">Due ${esc(outDate(it.due))}</span>`;
  if(t==='us'&&it.backBy)return `<span class="pill ${it.backBy<=todayStr?'warn':'muted'}">Back by ${esc(outDate(it.backBy))}</span>`;return ''}
function revNext(it){const t=revTurn(it),asked=revAsked(it),n=(it.divisions||[]).length;
  if(t==='us'&&!asked)return n?`<button class="btn sm primary" data-rev="send" data-id="${esc(it.id)}">${ic('mail')}Send to ${plural(n,'division')}</button>`:`<button class="btn sm primary" data-outedit="${esc(it.id)}">Pick divisions</button>`;
  if(t==='us')return `<button class="btn sm primary" data-rev="compose" data-id="${esc(it.id)}">${ic('mail')}Send feedback back</button>`;
  if(t==='team')return `<button class="btn sm" data-rev="remind" data-id="${esc(it.id)}">${ic('bell')}Remind</button>`;
  if(t==='drafter')return `<button class="btn sm" data-rev="open" data-id="${esc(it.id)}" data-focus="next">New version came in</button>`;return ''}
function revCard(it){const t=revTurn(it),asked=revAsked(it),b=BYKEY[it.bill];
  const status=t==='us'&&!asked?'Received; not sent to divisions yet':t==='us'?'Every division answered':t==='team'?`${revIn(it)} of ${asked} divisions answered`:t==='drafter'?`Sent back${it.sent.to?' to '+it.sent.to:''} by ${it.sent.by}`:'Closed';
  return `<div class="rev-card ${t}"><div class="rev-ctop"><div><a href="#" class="rev-title" data-rev="open" data-id="${esc(it.id)}">${b&&!b.file?`<b>${esc(billLabel(b))}</b> `:''}${esc(b?b.title:revName(it))}</a>
     <div class="tiny muted">${[it.version,it.from?`${it.from} · ${REV_ROLE[it.fromRole]||''}`:REV_ROLE[it.fromRole],it.owner?'POC '+it.owner:''].filter(Boolean).map(esc).join(' · ')}</div></div>
     <span class="rev-age" title="How long it’s been in this state">${esc(revAge(revSince(it)))}</span></div>
    <div class="small">${esc(status)} ${revFlag(it)}</div>
    ${(it.divisions||[]).length?`<div class="rev-divs">${it.divisions.map(v=>revDiv(it,v)).join('')}</div>`:''}
    <div class="rev-act">${revNext(it)}<button class="btn sm" data-rev="open" data-id="${esc(it.id)}">Open</button></div></div>`}

function revPage(){
  const all=outOf('review'), mine=OUTMINE?all.filter(outMine):all;
  const lane=t=>mine.filter(it=>revTurn(it)===t).sort((a,b)=>(revSince(a)||'').localeCompare(revSince(b)||''));
  const closed=mine.filter(it=>revTurn(it)==='closed').sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''));
  const L=(t,desc)=>{const l=lane(t);return `<div class="rev-lane ${t}"><h3>${REV_TURN[t]} <span class="tiny muted">${l.length}</span></h3><p class="tiny muted">${desc}</p>${l.map(revCard).join('')||'<p class="empty small">Nothing here.</p>'}</div>`};
  return `<div class="card"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><h2>Draft review</h2>
     <p class="desc">Every draft the office is reviewing, sorted by whose turn it is. Log a draft when it comes in from the drafter, a sponsor or a stakeholder; send it to the divisions; they answer from their email; then the point of contact sends the office’s feedback back. Oldest first in each column.</p></div>
     <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-demo="review">${ic('spark')}See it with email connected</button></div></div>
    <label class="check" style="margin-top:6px"><input type="checkbox" id="outMine" ${OUTMINE?'checked':''}><span>Only where I’m the point of contact</span></label></div>
   <div class="rev-lanes">${L('us','Send it to the divisions, or send the feedback back.')}${L('team','Requests are out. One reminder goes out by itself on the due date.')}${L('drafter','Feedback went back. Log their reply, or start the next version.')}</div>
   ${closed.length?`<details class="card"><summary><b>Closed</b> <span class="tiny muted">${closed.length}</span></summary><div class="rows" style="margin-top:8px">${closed.map(it=>`<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div class="what" style="font-size:14.5px">${esc(revName(it))}<span class="sub">${[it.version,it.from,it.sent&&it.sent.at?'sent back '+outDate(it.sent.at.slice(0,10)):''].filter(Boolean).map(esc).join(' · ')}</span></div><div class="r"><button class="btn sm" data-rev="open" data-id="${esc(it.id)}">Open</button></div></div>`).join('')}</div></details>`:''}`;
}
function revOverview(){
  const all=outOf('review').filter(it=>revTurn(it)!=='closed');
  const n=t=>all.filter(it=>revTurn(it)===t).length;
  const us=all.filter(it=>revTurn(it)==='us').sort((a,b)=>(revSince(a)||'').localeCompare(revSince(b)||'')).slice(0,4);
  return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><h2 style="margin:0">Draft review</h2><a class="btn sm" href="#outreach-drafts">All drafts →</a></div>
   ${all.length?`<div class="rev-sum">${['us','team','drafter'].map(t=>`<a href="#outreach-drafts" class="rev-n ${t}"><b>${n(t)}</b><span>${REV_TURN[t]}</span></a>`).join('')}</div>
   ${us.length?`<div class="rows">${us.map(it=>`<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div class="what" style="font-size:14.5px">${esc(revName(it))}<span class="sub">${esc(revAsked(it)?'Every division answered':'Not sent to divisions yet')} · ${esc(revAge(revSince(it)))} ${revFlag(it)}</span></div><div class="r">${revNext(it)}</div></div>`).join('')}</div>`:''}`
   :`<p class="empty">No drafts out for review. Press <b>Log a draft</b> when one comes in.</p>`}</div>`;
}
function revBillBox(b){
  const l=outOf('review').filter(it=>it.bill===b.key).sort((x,y)=>(y.created_at||'').localeCompare(x.created_at||''));const it=l[0];
  return `<div><b>Draft review</b><div class="small">${it?`${esc(it.version||'Latest draft')}: ${esc(REV_TURN[revTurn(it)])}${l.length>1?` · ${plural(l.length,'round')}`:''}`:'<span class="muted">None</span>'}</div>${it?`<button class="btn sm" data-rev="open" data-id="${esc(it.id)}">Open</button>`:`<button class="btn sm" data-outnew="review" data-outpre="${esc(JSON.stringify({bill:b.key,legs:b.spId?[b.spId]:[]}))}">Log a draft</button>`}</div>`;
}

// ---------- actions
async function revStep(action,id,extra){
  try{const j=await api('outreach',{action:'review-'+action,id,...(extra||{})});OUT=j.items;const i=j.info||{};
    if(action==='send'){const parts=[];if(i.sent)parts.push(`Emailed ${plural(i.sent,'division')}`);if(i.outbox)parts.push(`${plural(i.outbox,'request')} saved to the Outbox (email isn’t connected yet)`);if(i.none&&i.none.length)parts.push(`No one to send to for ${i.none.join(', ')}: add people under Fiscal Hive → Settings`);toast(parts.join('. ')||'Sent')}
    else if(action==='remind')toast(i.reminded?`Reminder sent to ${plural(i.reminded,'division')}`:'Reminder recorded (no addresses to send to)');
    else toast({answer:'Answer recorded',sent:'Marked as sent back',unsend:'Marked not sent yet',log:'Added to the trail',close:'Saved',next:'Next version started'}[action]||'Saved');
    route(true);const dlg=$('revDlg');if(dlg&&dlg.open)revOpen(i.next||id);return j}catch(e){toast(e.message)}
}
function revOpen(id,focus){
  const it=(outLoad()||[]).find(x=>x.id===id);if(!it)return;const t=revTurn(it),b=BYKEY[it.bill];
  let dlg=$('revDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='revDlg';dlg.className='rev-dlg';document.body.appendChild(dlg)}
  const prev=it.prev&&(outLoad()||[]).find(x=>x.id===it.prev), next=(outLoad()||[]).find(x=>x.prev===it.id);
  const banner={us:!(it.divisions||[]).length?'Received. Press Edit to pick the divisions that should review it.':revAsked(it)?'Every division has answered. Put the office’s feedback together and send it back.':'Received. Send it to the divisions for their comments.',team:`${revIn(it)} of ${revAsked(it)} divisions have answered.${it.due?` Comments are due ${outDate(it.due)}.`:''}`,drafter:`The office’s feedback went back ${revWhen(it.sent&&it.sent.at)}. Waiting on the next version.`,closed:'This round is closed.'}[t];
  const divRow=v=>{const r=(it.reqs||{})[v];const st=!r?'todo':r.status;
    return `<tr><td><b>${esc(divName(v))}</b></td><td><span class="rev-st ${st}">${{todo:'Not asked',waiting:'Waiting',none:'No concerns',comments:'Comments'}[st]}</span></td><td class="small">${r&&r.at&&st!=='waiting'?`${esc(r.by||'')}<div class="tiny muted">${esc(revWhen(r.at))}</div>`:r&&r.sent?`<span class="tiny muted">Asked ${esc(revWhen(r.sent))}${r.reminded?` · reminded ${esc(revWhen(r.reminded))}`:''}</span>`:''}</td>
     <td class="small">${r&&r.comments?`<div style="white-space:pre-wrap">${esc(r.comments)}</div>`:''}${r&&r.lang?`<div class="rev-lang"><b>Suggested language:</b> ${esc(r.lang)}</div>`:''}${(r&&r.files||[]).map(f=>`<a class="out-file" href="/api/file/${esc(f.id)}">${ic('file')}${esc(f.name)}</a>`).join('')}</td>
     <td style="white-space:nowrap">${!r?`<button class="btn sm" data-rev="sendone" data-id="${esc(it.id)}" data-div="${esc(v)}">Ask</button>`:st==='waiting'?`<button class="btn sm" data-rev="remindone" data-id="${esc(it.id)}" data-div="${esc(v)}">Remind</button>`:''} <button class="btn sm" data-rev="record" data-id="${esc(it.id)}" data-div="${esc(v)}">Record answer</button></td></tr>
     <tr class="rev-rec" id="revrec-${esc(v)}" hidden><td colspan="5"><div class="filters"><div class="field"><label>Answer</label><select data-recst><option value="none">No concerns</option><option value="comments" ${st==='comments'?'selected':''}>Comments</option><option value="waiting">Still waiting</option></select></div><div class="field"><label>From</label><input data-recby placeholder="Who answered" value="${esc(r&&r.by||'')}"></div></div>
      <div class="field"><label>Comments</label><textarea data-reccom rows="3">${esc(r&&r.comments||'')}</textarea></div><div class="field"><label>Suggested language</label><textarea data-reclang rows="2">${esc(r&&r.lang||'')}</textarea></div>
      <button class="btn sm primary" data-rev="saverec" data-id="${esc(it.id)}" data-div="${esc(v)}">Save answer</button> <span class="tiny muted">For answers that came by phone, reply email or in person.</span></td></tr>`};
  dlg.innerHTML=`<div class="demo-top"><div><span class="kicker">Draft review · ${esc(REV_TURN[t])}</span><h2>${esc(revName(it))}</h2>
     <div class="small muted">${[it.version,it.from?`From ${it.from} (${REV_ROLE[it.fromRole]||''})`:REV_ROLE[it.fromRole],it.received?'received '+outDate(it.received):'',it.owner?'POC '+it.owner:''].filter(Boolean).map(esc).join(' · ')}</div>
     <div class="small" style="margin-top:4px">${[it.link?`<a href="${esc(it.link)}" target="_blank" rel="noopener">${ic('external')}Open the draft</a>`:'',b?`<a href="${billHref(b)}">Open the ${b.file?'bill file':'bill'}</a>`:'',(it.legs||[]).length?'Copying '+(it.legs||[]).map(outLegName).map(esc).join(', '):'',prev?`<a href="#" data-rev="open" data-id="${esc(prev.id)}">← Earlier version</a>`:'',next?`<a href="#" data-rev="open" data-id="${esc(next.id)}">Next version →</a>`:''].filter(Boolean).join(' · ')}</div></div>
     <button type="button" class="btn sm" id="revX">Close</button></div>
   <div class="rev-banner ${t}">${esc(banner)} ${revFlag(it)}</div>
   <div class="rev-act" style="margin:10px 0">${t==='us'&&(it.divisions||[]).some(v=>!(it.reqs||{})[v])?`<button class="btn primary" data-rev="send" data-id="${esc(it.id)}">${ic('mail')}Send to the divisions</button>`:''}
    ${t==='us'&&revAsked(it)?`<button class="btn primary" data-rev="compose" data-id="${esc(it.id)}">${ic('mail')}Put the feedback together</button>`:''}
    ${t==='team'?`<button class="btn" data-rev="remind" data-id="${esc(it.id)}">${ic('bell')}Remind everyone waiting</button><button class="btn" data-rev="compose" data-id="${esc(it.id)}">Send back without waiting</button>`:''}
    ${t==='drafter'?`<button class="btn" data-rev="unsend" data-id="${esc(it.id)}">Not sent after all</button>`:''}
    <button class="btn" data-outedit="${esc(it.id)}">${ic('pencil')}Edit</button>${t!=='closed'?`<button class="btn" data-rev="close" data-id="${esc(it.id)}" data-closed="1">${ic('check')}Mark done</button>`:`<button class="btn" data-rev="close" data-id="${esc(it.id)}" data-closed="0">Reopen</button>`}</div>
   ${(it.divisions||[]).length?`<div class="tablewrap" style="border:0"><table class="compact out-t rev-t"><thead><tr><th>Division</th><th>Status</th><th>Who, when</th><th>Comments</th><th></th></tr></thead><tbody>${it.divisions.map(divRow).join('')}</tbody></table></div>`:'<p class="small muted">No divisions picked yet. Press Edit to pick them.</p>'}
   ${it.sent&&it.sent.at?`<details class="rev-sentbox"><summary><b>What went back</b> <span class="tiny muted">${esc(revWhen(it.sent.at))} · ${esc(it.sent.by)}${it.sent.to?' → '+esc(it.sent.to):''}</span></summary><div style="white-space:pre-wrap" class="small">${esc(it.sent.summary||'')}</div></details>`:''}
   <h3 class="rev-h" style="margin-top:14px">Files</h3>${outFilesBox(it.id,{label:'Attach the office’s marked-up copy',hint:'Divisions’ redlines show up here too. Word or PDF, up to 10 MB.'})}
   <div class="grid2" style="align-items:start;margin-top:12px">
    <div><h3 class="rev-h">Trail</h3><ol class="rev-log">${(it.log||[]).slice().reverse().map(l=>`<li><span class="tiny muted">${esc(revWhen(l.at))} · ${esc(l.by)}</span><div class="small">${esc(l.what)}</div></li>`).join('')||'<li class="small muted">Nothing yet.</li>'}</ol></div>
    <div><h3 class="rev-h">Log a reply or call</h3><div class="field"><textarea id="revLogTx" rows="2" placeholder="e.g. Drafter replied: will take the changes on lines 40–52"></textarea></div><button class="btn sm" data-rev="log" data-id="${esc(it.id)}">Add to the trail</button>
     ${!next?`<details class="rev-more" id="revNextH" ${t==='drafter'||focus==='next'?'open':''}><summary>New version came in</summary><div class="filters"><div class="field"><label for="revNv">Version</label><input id="revNv" placeholder="e.g. 1st Sub, or Draft 3"></div><div class="field grow"><label for="revNl">Link</label><input id="revNl" placeholder="https://…"></div></div><button class="btn sm" data-rev="next" data-id="${esc(it.id)}">Start the next round</button><p class="tiny muted">Closes this round and starts a new one with the same people and divisions.</p></details>`:''}</div></div>`;
  dlg.querySelector('#revX').onclick=()=>dlg.close();
  if(!dlg.open)dlg.showModal();
  outFilesLoad(dlg);
  if(focus==='next'&&$('revNv')){$('revNv').focus();$('revNextH').scrollIntoView({block:'center'})}
}
function revFeedback(it,named){
  const R=(it.divisions||[]).map(v=>[v,(it.reqs||{})[v]]).filter(([,r])=>r);
  const withC=R.filter(([,r])=>r.status==='comments'), none=R.filter(([,r])=>r.status==='none');
  const first=(it.from||'').split(/\s+/)[0];
  const lines=[`Hi ${first||'there'},`,'',`Thank you for sending ${revName(it)}${it.version?` (${it.version})`:''}. ${withC.length?'Here is the Attorney General’s Office’s feedback:':'The Attorney General’s Office has reviewed it and has no concerns with this version.'}`];
  for(const [v,r] of withC){lines.push('');if(named)lines.push(`${divName(v)}:`);
    if(r.comments)lines.push(...r.comments.split(/\n+/).map(x=>`• ${x.trim()}`));if(r.lang)lines.push(`  Suggested language: ${r.lang}`)}
  if(withC.length&&none.length&&named)lines.push('',`No concerns from ${outList(none.map(([v])=>divName(v)))}.`);
  if(R.some(([,r])=>(r.files||[]).length))lines.push('','I’ve attached the marked-up copies.');
  // signed by whoever is sending it, from their profile (Your account → Your profile)
  lines.push('','Please let me know if you have any questions.','','Thanks,',ME.display||ME.user,ME.title?`${ME.title}, Utah Attorney General’s Office`:'Utah Attorney General’s Office');
  return lines.join('\n');
}
function revCompose(id){
  const it=(outLoad()||[]).find(x=>x.id===id);if(!it)return;
  const legMails=(it.legs||[]).map(legById).map(legEmail).filter(Boolean);
  const subj=`AG’s Office feedback: ${revName(it)}${it.version?` (${it.version})`:''}`;
  const waiting=revReqs(it).filter(([,r])=>r.status==='waiting').map(([v])=>divName(v));
  let dlg=$('revDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='revDlg';dlg.className='rev-dlg';document.body.appendChild(dlg)}
  dlg.innerHTML=`<div class="demo-top"><div><span class="kicker">Send the office’s feedback back</span><h2>${esc(revName(it))}</h2></div><button type="button" class="btn sm" id="revX">Close</button></div>
   ${waiting.length?`<div class="rev-banner team">Still waiting on ${esc(outList(waiting))}. You can send back now and follow up later.</div>`:''}
   <div class="filters"><div class="field grow"><label for="rcTo">To</label><input id="rcTo" value="${esc(it.fromEmail||'')}" placeholder="drafter@le.utah.gov"></div><div class="field grow"><label for="rcCc">CC (legislators and others)</label><input id="rcCc" value="${esc(legMails.join(', '))}"></div></div>
   <div class="field"><label for="rcSubj">Subject</label><input id="rcSubj" value="${esc(subj)}"></div>
   <label class="check" style="margin:8px 0"><input type="checkbox" id="rcNamed"><span>Name the divisions in the feedback</span></label>
   <div class="field"><label for="rcBody">Feedback (edit before sending)</label><textarea id="rcBody" rows="14" class="rev-body">${esc(revFeedback(it,false))}</textarea></div>
   <div class="field"><label>Attach in Outlook</label><div class="tiny muted" style="margin-bottom:4px">Outlook can’t pick up files from here, so download any you want to send and attach them to the email.</div>${outFilesBox(it.id,{label:'Add a file',hint:'e.g. the office’s combined redline'})}</div>
   <div class="rev-act" style="margin-top:10px"><a class="btn primary" id="rcOutlook" href="#">${ic('mail')}Open in Outlook</a><a class="btn" id="rcWeb" href="#" target="_blank" rel="noopener">${ic('external')}Outlook on the web</a><button class="btn" id="rcCopy">Copy</button>
    <button class="btn" data-demo="review" data-step="6" title="Once Outlook is connected">${ic('spark')}Send from Outlook <span class="tiny">(once connected)</span></button></div>
   <div class="rev-mark" id="rcMark" hidden><b>Did it go out?</b> <button class="btn sm primary" id="rcSent">Yes, mark it sent back</button> <span class="tiny muted">Records the date and what you sent, and moves it to “Waiting on the drafter.”</span></div>`;
  let via='outlook';
  const vals=()=>({to:$('rcTo').value.trim(),cc:$('rcCc').value.trim(),subj:$('rcSubj').value,body:$('rcBody').value});
  const q=v=>`${v.cc?`cc=${encodeURIComponent(v.cc)}&`:''}subject=${encodeURIComponent(v.subj)}&body=${encodeURIComponent(v.body)}`;
  const show=()=>{$('rcMark').hidden=false};
  dlg.querySelector('#revX').onclick=()=>dlg.close();
  $('rcNamed').onchange=e=>{$('rcBody').value=revFeedback(it,e.target.checked)};
  $('rcOutlook').onclick=e=>{e.preventDefault();const v=vals();via='outlook';location.href=`mailto:${encodeURIComponent(v.to)}?${q(v)}`;show()};
  $('rcWeb').onclick=()=>{const v=vals();via='web';$('rcWeb').href=`https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(v.to)}&${q(v)}`;show()};
  $('rcCopy').onclick=async()=>{const v=vals();via='copy';try{await navigator.clipboard.writeText(v.body);toast('Feedback copied')}catch(_){toast('Select the text and copy it yourself.')}show()};
  $('rcSent').onclick=()=>{const v=vals();revStep('sent',it.id,{to:[v.to,v.cc].filter(Boolean).join(', '),summary:v.body,via}).then(()=>{if(dlg.open)revOpen(it.id)})};
  if(!dlg.open)dlg.showModal();
  outFilesLoad(dlg);
}
document.addEventListener('click',e=>{
  const el=e.target.closest&&e.target.closest('[data-rev]');if(!el)return;e.preventDefault();
  const id=el.dataset.id,v=el.dataset.div,a=el.dataset.rev;
  if(a==='open')return revOpen(id,el.dataset.focus);
  if(a==='compose')return revCompose(id);
  if(a==='send')return revStep('send',id);
  if(a==='sendone')return revStep('send',id,{divisions:[v]});
  if(a==='remind')return revStep('remind',id);
  if(a==='remindone')return revStep('remind',id,{divisions:[v]});
  if(a==='unsend'){if(confirm('Mark this as not sent back yet?'))revStep('unsend',id);return}
  if(a==='close')return revStep('close',id,{closed:el.dataset.closed==='1'});
  if(a==='record'){const r=$('revrec-'+v);if(r)r.hidden=!r.hidden;return}
  if(a==='saverec'){const r=$('revrec-'+v);return revStep('answer',id,{divisions:[v],status:r.querySelector('[data-recst]').value,by:r.querySelector('[data-recby]').value,comments:r.querySelector('[data-reccom]').value,lang:r.querySelector('[data-reclang]').value})}
  if(a==='log'){const tx=$('revLogTx').value.trim();if(!tx){toast('Write what happened.');return}return revStep('log',id,{text:tx})}
  if(a==='next')return revStep('next',id,{version:$('revNv').value,link:$('revNl').value.trim()});
});
function revBind(){}

/* Files on an Outreach item: divisions' redlines, the office's own marked-up copy, proposed language.
   outFilesBox(id) draws a placeholder; outFilesLoad fills it (download links, attach, remove). */
const outFileSize=n=>n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';
function outFilesBox(id,{label='Attach a file',hint='A Word file with tracked changes or a marked-up PDF, up to 10 MB.',division=''}={}){
  return `<div class="out-files" data-files="${esc(id)}" data-fdiv="${esc(division)}"><div class="out-flist small muted">Loading files…</div>
   <label class="btn sm out-fup">${ic('file')}${esc(label)}<input type="file" accept=".pdf,.doc,.docx,.rtf,.odt,.txt" hidden></label> <span class="tiny muted">${esc(hint)}</span></div>`}
async function outFilesLoad(root){
  for(const box of (root||document).querySelectorAll('[data-files]')){
    const id=box.dataset.files,list=box.querySelector('.out-flist');
    const draw=files=>{list.innerHTML=files.length?files.map(f=>`<div class="out-frow"><a class="out-file" href="/api/file/${esc(f.id)}">${ic('file')}${esc(f.name)}</a><span class="tiny muted">${esc(f.division?divName(f.division):'Office')} · ${outFileSize(f.size)} · ${esc(f.by||'')}</span>${isAdmin()||f.by===(ME.display||ME.user)?`<button type="button" class="linkbtn tiny" data-fdel="${esc(f.id)}">Remove</button>`:''}</div>`).join(''):'<span class="small muted">No files yet.</span>';
      list.querySelectorAll('[data-fdel]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this file?'))return;const fd=new FormData();fd.append('action','delete');fd.append('id',b.dataset.fdel);draw((await outFilePost(fd)).files||[])})};
    try{draw((await (await fetch('/api/file?item='+encodeURIComponent(id),{credentials:'same-origin'})).json()).files||[])}catch(e){list.textContent='Couldn’t load the files.'}
    const inp=box.querySelector('input[type=file]');
    inp.onchange=async()=>{const f=inp.files[0];if(!f)return;const fd=new FormData();fd.append('item',id);fd.append('division',box.dataset.fdiv||'');fd.append('file',f);
      list.innerHTML='<span class="small muted">Uploading…</span>';try{draw((await outFilePost(fd)).files||[]);toast('File attached')}catch(err){toast(err.message);outFilesLoad(box.parentNode)}inp.value=''};
  }
}
async function outFilePost(fd){const r=await fetch('/api/file',{method:'POST',body:fd,credentials:'same-origin',headers:{'X-Docket':'1'}});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Upload failed');return j}
