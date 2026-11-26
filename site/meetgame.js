/* Learn → Meet the Legislature (a game) and Learn → Birthday hunt (a team project).
   Meet the Legislature: each person taps the face of every legislator they've talked with. Who's left, how far you
   are, a suggestion for who to meet next, and the office's standings. Stored per person in the `lgmet` setting.
   Birthday hunt: everyone works together to find the birthdays the office doesn't have yet, each with where it came
   from. No points. Stored in the `bdays` setting by chamber, district and last name, so a birthday found for an
   incoming legislator attaches to them once the Legislature's data lists them. An admin can load the birthdays the
   office already has from the Elected Officials Contacts workbook (only names, districts and birthdays are read). */
'use strict';
let MET=null, MEETF={house:'',show:'left',sort:'name',q:''}, MEETSUG=null;
function loadMet(){if(MET===null&&ME){MET=undefined;api('lgmet').then(j=>{MET=j.met||{};route(true)}).catch(()=>{MET={}})}return MET||null}
const myMet=()=>((loadMet()||{})[ME&&ME.user]||{m:{}}).m||{};
const lastNameOf=n=>String(n||'').replace(/,?\s+(jr|sr|ii|iii|iv)\.?$/i,'').trim().split(/\s+/).pop().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z'-]/g,'');
const legBK=l=>`${l.house}-${parseInt(l.district,10)}-${lastNameOf(l.name)}`;

function gameMeet(){
  if(!ME)return `<div class="card"><h2>🤝 Meet the Legislature</h2><p class="desc">Sign in to keep track of the legislators you’ve met.</p></div>`;
  const M=loadMet();if(!M)return '<div class="card"><p>Loading…</p></div>';
  const mine=myMet(), all=LEGS.filter(l=>l.id), met=all.filter(l=>mine[l.id]), left=all.filter(l=>!mine[l.id]);
  const pct=all.length?Math.round(met.length/all.length*100):0;
  const byH=h=>[all.filter(l=>l.house===h&&mine[l.id]).length,all.filter(l=>l.house===h).length];
  const [hm,ht]=byH('H'),[sm,st]=byH('S');
  const wk=met.filter(l=>Date.now()-new Date(mine[l.id].at)<7*864e5).length;
  const board=Object.entries(M).map(([u,x])=>({u,n:x.n||pn(u),c:Object.keys(x.m||{}).filter(id=>all.some(l=>l.id===id)).length})).filter(x=>x.c).sort((a,b)=>b.c-a.c).slice(0,10);
  let L=all.filter(l=>(!MEETF.house||l.house===MEETF.house)&&(MEETF.show==='all'||(MEETF.show==='met'?mine[l.id]:!mine[l.id]))&&(!MEETF.q||(l.name+' '+(l.counties||'')).toLowerCase().includes(MEETF.q.toLowerCase())));
  L.sort(MEETF.sort==='district'?(a,b)=>a.house.localeCompare(b.house)||(+a.district)-(+b.district):MEETF.sort==='recent'?(a,b)=>((mine[b.id]||{}).at||'').localeCompare((mine[a.id]||{}).at||''):(a,b)=>lastNameOf(a.name).localeCompare(lastNameOf(b.name)));
  const ring=`<svg viewBox="0 0 120 120" class="meet-ring" aria-hidden="true"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" style="stroke-dasharray:${(326.7*pct/100).toFixed(1)} 326.7"/></svg>`;
  const S=MEETSUG&&!mine[MEETSUG]?legById(MEETSUG):null;
  return `<div class="card meet"><div class="meet-top"><div class="meet-ringwrap">${ring}<div class="meet-num"><b>${met.length}</b><span>of ${all.length}</span></div></div>
     <div class="meet-intro"><h2>🤝 Meet the Legislature</h2><p class="desc">Tap a legislator’s face once you’ve introduced yourself and talked with them. ${left.length?`<b>${left.length}</b> to go.`:'<b>You’ve met every legislator. Amazing.</b>'}</p>
      <div class="meet-bars"><div><span>House</span><i><b style="width:${ht?hm/ht*100:0}%"></b></i><span>${hm}/${ht}</span></div><div><span>Senate</span><i><b style="width:${st?sm/st*100:0}%"></b></i><span>${sm}/${st}</span></div></div>
      <p class="small muted">${wk?`${plural(wk,'new legislator')} this week. `:''}${pct>=100?'':pct>=75?'The home stretch!':pct>=50?'Over halfway there.':pct>=25?'A quarter of the way.':met.length?'Off to a good start.':'Start with your own representative and senator.'}</p></div>
     <div class="meet-side">${left.length?`<button type="button" class="btn primary" id="meetSug">${ic('spark')}Who should I meet next?</button>`:''}</div></div>
   ${S?`<div class="meet-sug"><img src="${esc(legPhoto(S))}" alt=""><div><span class="kicker">Try meeting</span><b>${esc(legTitle(S))}</b><div class="small">${esc(S.party==='R'?'Republican':S.party==='D'?'Democrat':S.party||'')} · ${S.house==='H'?'House':'Senate'} District ${esc(S.district)}${legWhere(S)?` · ${esc(legWhere(S))}`:''}</div>
      <div class="small muted">${[S.profession?`Works as: ${S.profession}`:'',S.since?`Serving since ${S.since.replace(/^\w+ \d+, /,'')}`:''].filter(Boolean).map(esc).join(' · ')}</div>
      <div class="small">${meetStarter(S)}</div></div><div class="meet-sug-b"><button type="button" class="btn sm primary" data-meet="${esc(S.id)}">I met them</button><button type="button" class="btn sm" id="meetSug2">Someone else</button><a class="btn sm" href="#legislators-${esc(S.id)}">Profile</a></div></div>`:''}
   <div class="filters" style="margin-top:12px"><div class="seg" role="group" aria-label="Show">${[['left',`Still to meet (${left.length})`],['met',`Met (${met.length})`],['all','Everyone']].map(([k,l])=>`<button type="button" data-meetshow="${k}" class="${MEETF.show===k?'on':''}" aria-pressed="${MEETF.show===k}">${l}</button>`).join('')}</div>
    <div class="field"><label for="meetH">Chamber</label><select id="meetH"><option value="">Both</option><option value="H" ${MEETF.house==='H'?'selected':''}>House</option><option value="S" ${MEETF.house==='S'?'selected':''}>Senate</option></select></div>
    <div class="field"><label for="meetSort">Sort</label><select id="meetSort">${[['name','Last name'],['district','District'],['recent','Most recently met']].map(([k,l])=>`<option value="${k}" ${MEETF.sort===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="field grow"><label for="meetQ">Find</label><input type="search" id="meetQ" value="${esc(MEETF.q)}" placeholder="Name, city or county"></div></div>
   <div class="meet-grid">${L.map(l=>{const m=mine[l.id];return `<button type="button" class="meet-face ${m?'met':''}" data-meet="${esc(l.id)}" aria-pressed="${!!m}" title="${m?'Met '+esc(fmtLong(new Date(m.at)))+'. Tap to undo.':'Tap once you’ve met them'}"><span class="mf-img"><img src="${esc(legPhoto(l))}" alt="" loading="lazy">${m?`<span class="mf-ok">${ic('check')}</span>`:''}</span><b>${esc(l.name)}</b><span class="tiny">${l.house==='H'?'Rep.':'Sen.'} · ${esc(l.party||'')} · ${l.house==='H'?'HD':'SD'} ${esc(l.district)}</span>${m?`<span class="tiny mf-when">Met ${esc(fmtMD(new Date(m.at)))}</span>`:''}</button>`}).join('')||`<p class="empty">${MEETF.show==='left'&&!left.length?'Nobody left. You’ve met them all!':'No one matches.'}</p>`}</div></div>
   <div class="card"><h2>${ic('trophy','h')}Who’s met the most</h2>${board.length?`<ol class="meet-board">${board.map((x,i)=>`<li class="${x.u===ME.user?'me':''}"><span class="r">${i+1}</span><span class="n">${esc(x.n)}${x.u===ME.user?' (you)':''}</span><i><b style="width:${x.c/all.length*100}%"></b></i><span class="c">${x.c}</span></li>`).join('')}</ol>`:'<p class="empty">No one has marked anyone yet. Be the first.</p>'}<p class="small" style="margin:10px 0 0"><a href="#learn-board" data-lgb-meet>See it on the office leaderboard</a></p></div>`;
}
// A conversation starter from what's public about them: their district, their bills this session, their committees.
function meetStarter(l){
  const S=UI.session, bs=allRows(S).filter(b=>!b.file&&(b.spId===l.id)).slice(0,2);
  const com=typeof loadComs==='function'?(loadComs()||[]).filter(c=>(c.members||[]).some(m=>m.id===l.id&&/chair/i.test(m.pos||''))).map(c=>c.name)[0]:'';
  if(bs.length)return `Ask about ${bs.map(b=>`<a href="${billHref(b)}">${esc(billLabel(b))}</a> (${esc(b.title)})`).join(' or ')}.`;
  if(com)return `They chair the ${esc(com)}.`;
  if(legWhere(l))return `Ask what people in ${esc(legWhere(l).split(/[,;]/)[0])} are talking about.`;
  return '';
}
async function meetToggle(id){
  const mine=myMet(), on=!mine[id], l=legById(id);
  if(!on&&!confirm(`Unmark ${l?legTitle(l):'this legislator'} as met?`))return;
  try{const j=await api('lgmet',{id,met:on});MET=j.met||{};
    const n=Object.keys(myMet()).length, total=LEGS.filter(x=>x.id).length;
    if(on){if(MEETSUG===id)MEETSUG=null;const ms=[10,25,50,75,100].find(m=>m===n)||(n===total?total:0);toast(n===total?`🎉 That’s everyone: all ${total}!`:ms?`🎉 ${n} legislators met!`:`Met ${l?l.name:''}. ${n} of ${total}.`);if(ms||n===total)meetBurst()}
    route(true)}catch(e){toast(e.message)}
}
function meetBurst(){const c=document.createElement('div');c.className='meet-burst';c.innerHTML=Array.from({length:40},(_,i)=>`<i style="--x:${Math.random()*100}vw;--d:${(Math.random()*.8+.6).toFixed(2)}s;--h:${['#e9d8a6','#3c5a78','#c0deea','#e3a52a','#002147'][i%5]}"></i>`).join('');document.body.appendChild(c);setTimeout(()=>c.remove(),2000)}
function meetPick(){const mine=myMet();const left=LEGS.filter(l=>l.id&&!mine[l.id]&&l.id!==MEETSUG);if(!left.length)return;
  const S=UI.session, office=new Set(allRows(S).filter(b=>!b.file&&posOf(b)).map(b=>b.spId).filter(Boolean));
  const pref=left.filter(l=>office.has(l.id));const pool=pref.length&&Math.random()<.6?pref:left;MEETSUG=pool[Math.floor(Math.random()*pool.length)].id;route(true)}

// ---------- Birthday hunt
let BD=null;
function loadBD(){if(BD===null&&ME){BD=undefined;api('bdays').then(j=>{BD=j.bdays||{};route(true)}).catch(()=>{BD={}})}return BD||null}
const BD_MON=['January','February','March','April','May','June','July','August','September','October','November','December'];
const bdText=x=>{const [m,d]=x.md.split('-').map(Number);return `${BD_MON[m-1]} ${d}`};
const bdOf=l=>(loadBD()||{})[legBK(l)]||null;
function gameBdays(){
  if(!ME)return `<div class="card"><h2>🎂 Birthday hunt</h2><p class="desc">Sign in to help find legislators’ birthdays.</p></div>`;
  const B=loadBD();if(!B)return '<div class="card"><p>Loading…</p></div>';
  const all=LEGS.filter(l=>l.id), have=all.filter(l=>bdOf(l)), miss=all.filter(l=>!bdOf(l)).sort((a,b)=>a.house.localeCompare(b.house)||lastNameOf(a.name).localeCompare(lastNameOf(b.name)));
  const keys=new Set(all.map(legBK)), waiting=Object.entries(B).filter(([k])=>!keys.has(k));
  const pct=all.length?Math.round(have.length/all.length*100):0;
  const soon=have.map(l=>{const x=bdOf(l);const [m,d]=x.md.split('-').map(Number);let t=new Date(TODAY.getFullYear(),m-1,d);if(t<TODAY&&ymd(t)!==todayStr)t=new Date(TODAY.getFullYear()+1,m-1,d);return {l,x,t}}).filter(o=>(o.t-TODAY)/864e5<=30).sort((a,b)=>a.t-b.t);
  const src=s=>/^https?:\/\//.test(s)?`<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s.replace(/^https?:\/\/(www\.)?/,'').slice(0,48))}${s.length>60?'…':''}</a>`:esc(s);
  return `<div class="card bd"><div class="bd-top"><div><h2>🎂 Birthday hunt</h2><p class="desc">A team effort, so there are no points and it’s not on the leaderboard: help find the birthdays of the legislators the office doesn’t have yet. Tap a face, add the month and day, and say where you found it (a link to a post or article, their office, or who told you) so anyone can check it.</p></div>
     ${isAdmin()?`<label class="btn sm">${ic('file')}Load the office’s list<input type="file" id="bdImp" accept=".xlsx,.xls" hidden></label>`:''}</div>
    <div class="bd-prog"><i><b style="width:${pct}%"></b></i><span><b>${have.length}</b> of ${all.length} found · <b>${miss.length}</b> to go</span></div>
    ${waiting.length?`<p class="tiny muted">Also ${plural(waiting.length,'birthday')} for incoming legislators, waiting for the Legislature’s list to include them.</p>`:''}</div>
   <div class="card"><h2>Still looking <span class="tiny muted">${miss.length}</span></h2>${miss.length?`<div class="meet-grid bd-grid">${miss.map(l=>`<button type="button" class="meet-face" data-bd="${esc(l.id)}" title="Add ${esc(legTitle(l))}’s birthday"><span class="mf-img"><img src="${esc(legPhoto(l))}" alt="" loading="lazy"><span class="mf-plus">+</span></span><b>${esc(l.name)}</b><span class="tiny">${l.house==='H'?'Rep.':'Sen.'} · ${l.house==='H'?'HD':'SD'} ${esc(l.district)}</span></button>`).join('')}</div>`:'<p class="empty">🎉 The team found every birthday.</p>'}</div>
   ${soon.length?`<div class="card"><h2>Coming up in the next 30 days</h2><div class="rows">${soon.map(o=>`<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div>${outLegChipSafe(o.l.id)}</div><div class="r"><span class="pill ${ymd(o.t)===todayStr?'pass':'muted'}">${ymd(o.t)===todayStr?'Today! ':''}${esc(BD_MON[o.t.getMonth()])} ${o.t.getDate()}</span></div></div>`).join('')}</div></div>`:''}
   <div class="card"><h2>Found <span class="tiny muted">${have.length}</span></h2>${have.length?`<div class="tablewrap" style="border:0"><table class="compact"><thead><tr><th>Legislator</th><th>Birthday</th><th>Where it came from</th><th>Added by</th><th></th></tr></thead><tbody>${have.slice().sort((a,b)=>bdOf(a).md.localeCompare(bdOf(b).md)).map(l=>{const x=bdOf(l);return `<tr><td>${outLegChipSafe(l.id)}</td><td style="white-space:nowrap">${esc(bdText(x))}</td><td class="small">${src(x.src||'')}${x.prev?`<div class="tiny muted">Was ${esc(bdText(x.prev))} (${esc(x.prev.src||'')})</div>`:''}</td><td class="small">${esc(x.by||'')}<div class="tiny muted">${x.at?esc(fmtMD(new Date(x.at))):''}</div></td><td><button type="button" class="btn sm" data-bd="${esc(l.id)}">Edit</button></td></tr>`}).join('')}</tbody></table></div>`:'<p class="empty">None yet.</p>'}</div>`;
}
const outLegChipSafe=id=>typeof outLegChip==='function'?outLegChip(id):esc((legById(id)||{}).name||id);
function bdDialog(id){
  const l=legById(id);if(!l)return;const x=bdOf(l)||{};const [m,d]=(x.md||'-').split('-');
  let dlg=$('bdDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='bdDlg';document.body.appendChild(dlg)}
  dlg.innerHTML=`<form method="dialog" id="bdForm"><div style="display:flex;gap:14px;align-items:center"><img src="${esc(legPhoto(l))}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover"><div><h2 style="margin:0">${esc(legTitle(l))}</h2><div class="small muted">${l.house==='H'?'House':'Senate'} District ${esc(l.district)}</div></div></div>
   <div class="grid2" style="gap:10px;margin-top:14px"><div class="field"><label for="bdM">Month</label><select id="bdM" required><option value="">—</option>${BD_MON.map((n,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${m===String(i+1).padStart(2,'0')?'selected':''}>${n}</option>`).join('')}</select></div>
    <div class="field"><label for="bdD">Day</label><select id="bdD" required><option value="">—</option>${Array.from({length:31},(_,i)=>String(i+1).padStart(2,'0')).map(v=>`<option ${d===v?'selected':''}>${v}</option>`).join('')}</select></div></div>
   <div class="field" style="margin-top:10px"><label for="bdS">Where you found it</label><textarea id="bdS" rows="2" required placeholder="A link to the post or article, “their office told me,” “said so in committee on Jan. 20”…">${esc(x.src||'')}</textarea></div>
   ${x.by?`<p class="tiny muted">Added by ${esc(x.by)}${x.at?' on '+esc(fmtLong(new Date(x.at))):''}.</p>`:''}
   <div style="display:flex;gap:10px;justify-content:space-between;margin-top:14px"><span>${x.md&&(isAdmin()||x.byUser===ME.user)?'<button type="button" class="btn danger" id="bdDel">Remove</button>':''}</span><span style="display:flex;gap:10px"><button type="button" class="btn" id="bdCancel">Cancel</button><button class="btn primary">Save</button></span></div></form>`;
  dlg.showModal();$('bdCancel').onclick=()=>dlg.close();
  if($('bdDel'))$('bdDel').onclick=async()=>{if(!confirm('Remove this birthday?'))return;try{const j=await api('bdays',{action:'delete',k:legBK(l)});BD=j.bdays;dlg.close();route(true)}catch(e){toast(e.message)}};
  $('bdForm').onsubmit=async e=>{e.preventDefault();const md=`${$('bdM').value}-${$('bdD').value}`;
    const [mm,dd]=md.split('-').map(Number);if(dd>new Date(2000,mm,0).getDate()){toast(`${BD_MON[mm-1]} doesn’t have ${dd} days.`);return}
    try{const j=await api('bdays',{k:legBK(l),name:l.name,md,src:$('bdS').value.trim()});BD=j.bdays;dlg.close();toast(`Saved. Thanks for finding ${l.name}’s birthday!`);route(true)}catch(err){toast(err.message)}};
}
// Admin: read the Elected Officials Contacts workbook. Only the House and Senate sheets' district, names and birthday are read.
async function bdImport(file){
  try{const X=await loadXLSX();const wb=X.read(await file.arrayBuffer());const items=[];
    for(const name of wb.SheetNames){const house=/^house/i.test(name)?'H':/^senate/i.test(name)?'S':'';if(!house)continue;
      const rows=X.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:''});const hi=rows.findIndex(r=>r.some(c=>/^district$/i.test(String(c).trim())));if(hi<0)continue;
      const H=rows[hi].map(c=>String(c).trim().toLowerCase()),ci=k=>H.findIndex(h=>h===k);const cD=ci('district'),cF=ci('first name'),cL=ci('last name'),cB=ci('birthday');if([cD,cL,cB].some(i=>i<0))continue;
      for(const r of rows.slice(hi+1)){const dist=parseInt(r[cD],10),last=String(r[cL]||'').trim(),b=r[cB];if(!dist||!last||b===''||b==null)continue;
        let mo,da;if(typeof b==='number'){const p=X.SSF.parse_date_code(b);mo=p.m;da=p.d}else{const t=new Date(String(b));if(isNaN(t))continue;mo=t.getMonth()+1;da=t.getDate()}
        items.push({k:`${house}-${dist}-${lastNameOf(last)}`,name:`${String(r[cF]||'').trim()} ${last}`.trim(),md:`${String(mo).padStart(2,'0')}-${String(da).padStart(2,'0')}`,src:'Office contacts workbook'})}}
    if(!items.length){toast('No birthdays found. The workbook needs House and Senate sheets with District, Last Name and Birthday columns.');return}
    if(!confirm(`Load ${plural(items.length,'birthday')} from “${file.name}”? Only names, districts and birthdays (month and day) are read. Birthdays someone already added aren’t changed.`))return;
    const j=await api('bdays',{action:'import',items});BD=j.bdays;toast(`Loaded ${plural(j.added,'new birthday')}`);route(true)}
  catch(e){toast(e.message)}
}
document.addEventListener('click',e=>{
  const m=e.target.closest&&e.target.closest('[data-meet]');if(m){e.preventDefault();meetToggle(m.dataset.meet);return}
  const s=e.target.closest&&e.target.closest('[data-meetshow]');if(s){MEETF.show=s.dataset.meetshow;route(true);return}
  const b=e.target.closest&&e.target.closest('[data-bd]');if(b){e.preventDefault();bdDialog(b.dataset.bd)}
});
function meetBind(){
  if(!location.hash.startsWith('#learn'))return;
  app.querySelectorAll('[data-lgb-meet]').forEach(a=>a.onclick=()=>{if(typeof LGBGAME!=='undefined')LGBGAME='meet'});
  on('meetSug','onclick',meetPick);on('meetSug2','onclick',meetPick);
  on('meetH','onchange',e=>{MEETF.house=e.target.value;route(true)});on('meetSort','onchange',e=>{MEETF.sort=e.target.value;route(true)});
  const q=$('meetQ');if(q)q.oninput=()=>{MEETF.q=q.value;clearTimeout(q._t);q._t=setTimeout(()=>{q.blur();route(true);const n=$('meetQ');if(n){n.focus();n.setSelectionRange(n.value.length,n.value.length)}},250)};
  const imp=$('bdImp');if(imp)imp.onchange=()=>{const f=imp.files[0];imp.value='';if(f)bdImport(f)};
}
