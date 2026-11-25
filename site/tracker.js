/* The shared bill tracker workbook (Excel on SharePoint/OneDrive).
   An admin pastes the workbook's Share link on the Admin tab and chooses, account by account, who can
   see it (Admin → Edit → "Can see the shared bill tracker workbook"). Four times each weekday, right
   after the Legislature data update, sync_tracker.py writes Deseret Docket's office list into one
   worksheet of that workbook and reports back here; the Updates page shows a preview and the link. */
'use strict';
let TRK=null;
function trkLoad(force){
  if(TRK&&!force)return TRK;
  if(!ME||!(isAdmin()||ME.tracker))return null;
  if(!TRK||force){TRK={loading:true};api('tracker').then(j=>{TRK=j;route(true)}).catch(e=>{TRK={error:e.message}})}
  return TRK;
}
const TRK_TIMES='about 6:40 am, 12:40 pm, 5:25 pm and 7:40 pm on weekdays';
function trkSyncLine(sy){
  if(!sy)return `<p class="small muted">Not synced yet. It updates ${TRK_TIMES}, right after the Legislature data refresh.</p>`;
  const when=`${fmtLong(new Date(sy.at))} at ${fmtTime(new Date(sy.at))}`;
  if(sy.ok)return `<p class="small"><span class="pill pass">Synced</span> Updated from Deseret Docket ${esc(when)} · ${plural(sy.rows,'bill')}</p>`;
  if(!sy.connected)return `<p class="small"><span class="pill muted">Preview only</span> The workbook connection isn’t set up yet, so this is what the next sync would write (${plural(sy.rows,'bill')}, as of ${esc(when)}).</p>`;
  return `<p class="small"><span class="pill warn">Didn’t sync</span> Last try ${esc(when)}: ${esc(sy.error||'unknown error')}</p>`;
}
function trkPreview(sy){
  if(!sy||!sy.head||!sy.head.length)return '';
  const keep=sy.head.map((h,i)=>i).filter(i=>!/Summary|General Provisions|Notes|Link/i.test(sy.head[i])).slice(0,7);
  return `<div class="tablewrap trk-prev"><table class="compact"><thead><tr>${keep.map(i=>`<th>${esc(sy.head[i])}</th>`).join('')}</tr></thead><tbody>${(sy.preview||[]).map(r=>`<tr>${keep.map(i=>`<td>${esc(r[i]||'')}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${keep.length}" class="muted">No bills on the office list yet.</td></tr>`}</tbody></table></div>
   ${Object.keys(sy.counts||{}).length?`<div class="chips" style="margin-top:8px">${Object.entries(sy.counts).map(([k,n])=>`<span class="chip">${esc(k)}: <b>${n}</b></span>`).join('')}</div>`:''}`;
}
function trackerHTML(){
  if(!ME||!(isAdmin()||ME.tracker))return '';
  const T=trkLoad();
  if(!T||T.loading)return `<div class="card"><h2>${ic('file')}Bill tracker</h2><p>Loading…</p></div>`;
  if(T.error)return '';
  const c=T.cfg||{};
  if(!c.url)return isAdmin()?`<div class="card"><h2>${ic('file')}${esc(c.name||'2027 Bill Tracker (Draft)')}</h2><p class="desc">Paste the workbook’s Share link on the <a href="#admin">Admin tab</a> to show it here and keep it up to date from Deseret Docket.</p></div>`:'';
  return `<div class="card trk-card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><h2>${ic('file')}${esc(c.name)}</h2><p class="desc">The office’s shared Excel tracker. Deseret Docket fills in the <b>${esc(c.sheet||'Deseret Docket')}</b> sheet ${TRK_TIMES}.</p></div>
    <a class="btn primary" href="${esc(c.url)}" target="_blank" rel="noopener">Open in Excel ↗</a></div>
    ${trkSyncLine(T.sync)}${trkPreview(T.sync)}
    ${isAdmin()?`<p class="tiny muted" style="margin-top:8px">Only accounts you allow see this card (Admin → Edit → “Can see the shared bill tracker workbook”).</p>`:''}</div>`;
}
function adminTrackerHTML(){
  if(!isAdmin())return '';
  const T=trkLoad();
  if(!T||T.loading)return `<div class="card"><h2>Bill tracker workbook</h2><p>Loading…</p></div>`;
  if(T.error)return `<div class="card"><h2>Bill tracker workbook</h2><p class="desc">${esc(T.error)}</p></div>`;
  const c=T.cfg||{};
  const who=(ADMIN&&ADMIN.users||[]).filter(u=>!u.disabled&&(u.role==='admin'||u.perms.tracker));
  const sessions=(INDEX&&INDEX.sessions||[]).map(x=>x.id);
  return `<div class="card" id="trkAdmin"><h2>Bill tracker workbook</h2><p class="desc">The shared Excel workbook the office keeps on SharePoint. Deseret Docket writes its office list into one sheet of it four times each weekday, right after the Legislature data update, and the Updates page shows a preview with the link to the people you choose.</p>
   <form id="trkForm" class="grid2" style="gap:12px;align-items:end">
    <div class="field" style="grid-column:1/-1"><label for="trkUrl">Share link to the workbook</label><input id="trkUrl" value="${esc(c.url)}" placeholder="https://agutah-my.sharepoint.com/:x:/g/personal/…" style="width:100%"></div>
    <div class="field"><label for="trkName">Name people see</label><input id="trkName" value="${esc(c.name)}" maxlength="80" style="width:100%"></div>
    <div class="field"><label for="trkSheet">Sheet Deseret Docket fills in</label><input id="trkSheet" value="${esc(c.sheet)}" maxlength="31" style="width:100%"></div>
    <div class="field"><label for="trkScope">Which bills</label><select id="trkScope" style="width:100%"><option value="office" ${c.scope!=='all'?'selected':''}>The office list (bills with a position, department, designation or assignment)</option><option value="all" ${c.scope==='all'?'selected':''}>Every bill and bill file</option></select></div>
    <div class="field"><label for="trkSes">Session</label><select id="trkSes" style="width:100%"><option value="">Newest session</option>${sessions.map(x=>`<option value="${x}" ${c.session===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
    <div style="grid-column:1/-1"><button class="btn primary">Save</button>${c.by?` <span class="tiny muted">Last changed by ${esc(c.by)}, ${fmtLong(new Date(c.at))}</span>`:''}</div></form>
   <p class="small" style="margin-top:12px"><b>Who can see it:</b> ${who.length?esc(who.map(u=>u.name||u.username).join(', ')):'only admins so far'}. Turn it on for someone with <b>Edit</b> next to their account (“Can see the shared bill tracker workbook”).</p>
   ${trkSyncLine(T.sync)}
   <details class="small" style="margin-top:6px"><summary>How the sync connects to Microsoft 365</summary><p>Writing to a SharePoint workbook needs a Microsoft 365 app registration from the office’s IT team, with permission to edit that file. Add its details as GitHub secrets: <code>MS_TENANT_ID</code>, <code>MS_CLIENT_ID</code> and <code>MS_CLIENT_SECRET</code>. Until then each update still builds the rows and shows them as a preview. The sync only rewrites the “${esc(c.sheet||'Deseret Docket')}” sheet; every other sheet in the workbook is left alone.</p></details></div>`;
}
function trackerBind(){
  on('trkForm','onsubmit',async e=>{e.preventDefault();try{await api('tracker',{url:$('trkUrl').value.trim(),name:$('trkName').value,sheet:$('trkSheet').value,scope:$('trkScope').value,session:$('trkSes').value});toast('Bill tracker saved');ME.tracker=$('trkUrl').value.trim()?{url:$('trkUrl').value.trim(),name:$('trkName').value}:null;trkLoad(true)}catch(err){toast(err.message)}});
}
