/* Legislators' interns: each legislator's intern contact (name, email, phone), from the list the Legislature sends.
   Admin → Legislative interns: upload the list (.xlsx, .xls or .csv), check how each row matched a legislator, import.
   The column names don't have to be exact: it looks for the legislator (a name, or chamber and district) and the
   intern's name, email and phone. Admins can also add or fix one by hand from a legislator's profile.
   Legislator profile: a "Contact their intern" button for anyone signed in. Guests never see intern contacts.
   Stored in the `interns` setting by chamber, district and last name (legBK), so it survives photo or ID changes. */
'use strict';
let INTERNS=null, INTP=null;
function loadInterns(){if(INTERNS===null&&ME){INTERNS=undefined;api('interns').then(j=>{INTERNS=j||{list:{}};route(true)}).catch(()=>{INTERNS={list:{}}})}return INTERNS||null}
const internsOf=l=>{const I=loadInterns();return I&&l&&typeof legBK==='function'?(I.list||{})[legBK(l)]||[]:[]};
const telHref=p=>'tel:'+String(p||'').replace(/\s*(x|ext\.?)\s*\d+$/i,'').replace(/[^0-9+]/g,'');

// ---------- legislator profile
function internBtnHTML(l){
  if(!ME||!l)return '';
  const I=loadInterns();if(!I)return '';
  const list=internsOf(l);
  if(!list.length)return isAdmin()?`<button type="button" class="btn" data-intedit="${esc(l.id)}">${ic('user')}Add intern contact</button>`:'';
  const who=list.length>1?'interns':'intern';
  return `<details class="lp-intern"><summary class="btn primary">${ic('user')}Contact ${pron(l).p} ${who}</summary>
   <div class="lp-int-box">${list.map(x=>`<div class="lp-int"><div><b>${esc(x.name||'Intern')}</b><div class="tiny muted">Intern for ${esc(legTitle(l))}</div></div>
     <div class="lp-int-b">${x.email?`<a class="btn sm" href="mailto:${esc(x.email)}">${ic('mail')}${esc(x.email)}</a>`:''}${x.phone?`<a class="btn sm" href="${esc(telHref(x.phone))}">📞 ${esc(x.phone)}</a>`:''}${x.email?`<button type="button" class="btn sm" data-intcopy="${esc(x.email)}">Copy email</button>`:''}</div></div>`).join('')}
    ${isAdmin()?`<p class="tiny" style="margin:8px 0 0"><button type="button" class="linkbtn tiny" data-intedit="${esc(l.id)}">Edit intern contact</button></p>`:''}</div></details>`;
}
function internDialog(id){
  const l=legById(id);if(!l||!isAdmin())return;
  const rows=internsOf(l).slice();if(!rows.length)rows.push({});
  let dlg=$('intDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='intDlg';document.body.appendChild(dlg)}
  const row=(x,i)=>`<div class="int-row" data-i="${i}"><div class="field"><label>Name</label><input data-f="name" value="${esc(x.name||'')}" maxlength="80"></div><div class="field"><label>Email</label><input data-f="email" type="email" value="${esc(x.email||'')}" maxlength="120"></div><div class="field"><label>Phone</label><input data-f="phone" type="tel" value="${esc(x.phone||'')}" maxlength="30"></div></div>`;
  const draw=()=>{dlg.innerHTML=`<form method="dialog" id="intForm"><div style="display:flex;gap:14px;align-items:center"><img src="${esc(legPhoto(l))}" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover"><div><h2 style="margin:0">${esc(legTitle(l))}’s intern</h2><div class="small muted">${l.house==='H'?'House':'Senate'} District ${esc(l.district)}</div></div></div>
    <div id="intRows" style="margin-top:12px">${rows.map(row).join('')}</div>
    <p style="margin:6px 0 0"><button type="button" class="linkbtn small" id="intAdd">+ Add another intern</button></p>
    <p class="tiny muted">Leave every box empty and save to remove ${pron(l).p} intern contact. The next list you upload replaces what’s here for anyone on it.</p>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn" id="intCancel">Cancel</button><button class="btn primary">Save</button></div></form>`;
    $('intCancel').onclick=()=>dlg.close();
    $('intAdd').onclick=()=>{read();rows.push({});draw()};
    $('intForm').onsubmit=async e=>{e.preventDefault();read();
      try{INTERNS=await api('interns',{k:legBK(l),interns:rows});dlg.close();toast('Saved');route(true)}catch(err){toast(err.message)}}};
  const read=()=>dlg.querySelectorAll('.int-row').forEach(r=>{const x=rows[+r.dataset.i]||{};r.querySelectorAll('[data-f]').forEach(i=>x[i.dataset.f]=i.value.trim());rows[+r.dataset.i]=x});
  draw();dlg.showModal();
}

// ---------- Admin card
function adminInternsHTML(){
  const I=loadInterns();if(!I)return '<div class="card"><h2>Legislative interns</h2><p>Loading…</p></div>';
  const legs=(LEGS||[]).filter(l=>l.id), keys=new Set(legs.map(legBK)), list=I.list||{};
  const have=legs.filter(l=>(list[legBK(l)]||[]).length).length, orphan=Object.keys(list).filter(k=>!keys.has(k)).length;
  return `<div class="card" id="intCard"><h2>${ic('user','h')}Legislative interns</h2>
   <p class="desc">Upload the Legislature’s list of interns, and every legislator’s profile gets a <b>Contact their intern</b> button for anyone signed in (guests never see it). Excel or CSV. The columns don’t need exact names: it looks for the legislator (their name, or chamber and district) and the intern’s name, email and phone. You’ll see how each row matched before anything is saved.</p>
   <div class="bd-prog"><i><b style="width:${legs.length?have/legs.length*100:0}%"></b></i><span><b>${have}</b> of ${legs.length} legislators have an intern contact${I.at?` · last changed by ${esc(I.by||'')} on ${esc(fmtLong(new Date(I.at)))}${I.file?` (${esc(I.file)})`:''}`:''}</span></div>
   ${orphan?`<p class="tiny muted">${plural(orphan,'contact')} for legislators not in the Legislature’s current list (they’ll attach once they are).</p>`:''}
   <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><label class="btn primary">${ic('file')}Upload the intern list<input type="file" id="intImp" accept=".xlsx,.xls,.csv" hidden></label>
    <button type="button" class="btn" id="intTpl">Download a blank template</button>
    ${have||orphan?`<button type="button" class="btn danger" id="intClear">Clear all intern contacts</button>`:''}</div>
   <p class="tiny muted" style="margin-top:8px">To add or fix one legislator’s intern by hand, open their profile and choose <b>Add intern contact</b> or <b>Edit intern contact</b>.</p></div>`;
}

// ---------- reading the uploaded list
const nrm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9@. ]/g,' ').replace(/\s+/g,' ').trim();
function intCols(H){
  const h=H.map(nrm), find=f=>h.findIndex(f);
  const isInt=x=>/\bintern/.test(x), isLeg=x=>/\b(legislator|representative|senator|member|sponsor|rep|sen)\b/.test(x);
  const c={};
  c.email=find(x=>/e ?mail/.test(x)&&isInt(x));if(c.email<0)c.email=find(x=>/e ?mail/.test(x)&&!isLeg(x));
  c.phone=find(x=>/(phone|cell|mobile|tel)/.test(x)&&isInt(x));if(c.phone<0)c.phone=find(x=>/(phone|cell|mobile|tel)/.test(x)&&!isLeg(x));
  c.ifirst=find(x=>isInt(x)&&/first/.test(x));c.ilast=find(x=>isInt(x)&&/last/.test(x));
  c.iname=find(x=>isInt(x)&&!/(mail|phone|cell|mobile|first|last|tel)/.test(x));
  c.chamber=find(x=>/^(chamber|body|house senate|house or senate)$/.test(x));
  c.district=find(x=>/district/.test(x));
  c.lfirst=find(x=>!isInt(x)&&/first/.test(x));c.llast=find(x=>!isInt(x)&&/last/.test(x));
  c.leg=find(x=>isLeg(x)&&!/(mail|phone|district|first|last)/.test(x));
  const plain=find(x=>/^(name|full name)$/.test(x));
  if(c.leg>=0){
    // With a legislator column, plain "Name" or "First/Last Name" columns are the intern's.
    if(c.iname<0&&c.ifirst<0){if(plain>=0)c.iname=plain;else if(c.lfirst>=0||c.llast>=0){c.ifirst=c.lfirst;c.ilast=c.llast}}
    if(c.ifirst===c.lfirst&&c.ifirst>=0||c.ilast===c.llast&&c.ilast>=0){c.lfirst=-1;c.llast=-1}
  }else if(c.llast<0&&plain>=0&&plain!==c.iname)c.leg=plain;
  return c;
}
function intMatch(name,house,dist){
  const L=(LEGS||[]).filter(l=>l.id);
  const n=nrm(name), h=/^(h|house|rep|representative)/.test(nrm(house))?'H':/^(s|senate|sen|senator)/.test(nrm(house))?'S':/\b(rep|representative)\b/.test(n)?'H':/\b(sen|senator)\b/.test(n)?'S':'';
  const d=parseInt(dist,10);
  if(h&&d){const m=L.find(l=>l.house===h&&+l.district===d);if(m)return m}
  if(!n)return null;
  // "Smith, Jane", "Rep. Jane Smith" or "Jane Smith"
  let first='',last='';const clean=n.replace(/\b(rep|representative|sen|senator|hon|the)\b\.?/g,'').trim();
  if(String(name).includes(',')){const [a,b]=String(name).split(',');last=lastNameOf(a);first=nrm(b).split(' ')[0]||''}
  else{const w=clean.split(' ');last=lastNameOf(clean);first=w[0]||''}
  let c=L.filter(l=>lastNameOf(l.name)===last&&(!h||l.house===h));
  if(c.length>1&&first)c=c.filter(l=>nrm(l.name).split(' ')[0].startsWith(first.slice(0,3))||first.startsWith(nrm(l.name).split(' ')[0].slice(0,3)));
  if(c.length>1&&d)c=c.filter(l=>+l.district===d);
  return c.length===1?c[0]:null;
}
async function intImport(file){
  try{const X=await loadXLSX();const wb=X.read(await file.arrayBuffer());const items=[];
    for(const sn of wb.SheetNames){
      const sheetHouse=/^house/i.test(sn)?'H':/^senate/i.test(sn)?'S':'';
      const rows=X.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:false,defval:''});
      const hi=rows.slice(0,15).findIndex(r=>r.some(c=>/mail|phone|intern/i.test(String(c))));if(hi<0)continue;
      const c=intCols(rows[hi]);if(c.email<0&&c.phone<0)continue;
      const g=(r,i)=>i>=0?String(r[i]==null?'':r[i]).trim():'';
      for(const r of rows.slice(hi+1)){
        const legName=c.leg>=0?g(r,c.leg):[g(r,c.lfirst),g(r,c.llast)].filter(Boolean).join(' ');
        const house=g(r,c.chamber)||sheetHouse, dist=g(r,c.district);
        const name=c.iname>=0?g(r,c.iname):[g(r,c.ifirst),g(r,c.ilast)].filter(Boolean).join(' ');
        const email=g(r,c.email), phone=g(r,c.phone);
        if(!email&&!phone&&!name)continue;if(!legName&&!dist)continue;
        const m=intMatch(c.llast>=0&&c.leg<0?`${g(r,c.llast)}, ${g(r,c.lfirst)}`:legName,house,dist);
        items.push({raw:[legName,house&&dist?`${house==='H'||/^h/i.test(house)?'HD':'SD'} ${dist}`:dist].filter(Boolean).join(' · '),id:m?m.id:'',name,email,phone});
      }}
    if(!items.length){toast('No intern rows found. The list needs a column for the legislator and one for the intern’s email or phone.');return}
    INTP={file:file.name,items,replace:true};intPreview();
  }catch(e){toast(e.message)}
}
function intPreview(){
  let dlg=$('intPrev');if(!dlg){dlg=document.createElement('dialog');dlg.id='intPrev';dlg.className='wide';document.body.appendChild(dlg)}
  const P=INTP, L=(LEGS||[]).filter(l=>l.id).slice().sort((a,b)=>a.house.localeCompare(b.house)||lastNameOf(a.name).localeCompare(lastNameOf(b.name)));
  const ok=P.items.filter(x=>x.id).length, miss=P.items.length-ok;
  const opts=id=>`<option value="">— Skip this row —</option>${L.map(l=>`<option value="${esc(l.id)}" ${l.id===id?'selected':''}>${esc(legTitle(l))} (${l.house==='H'?'HD':'SD'} ${esc(l.district)})</option>`).join('')}`;
  dlg.innerHTML=`<form method="dialog" id="intPrevF"><h2>Check the intern list</h2>
   <p class="small">From <b>${esc(P.file)}</b>: <b>${ok}</b> matched to a legislator${miss?`, <b class="neg">${miss}</b> need you to pick (or skip)`:''}. Change any match below before importing.</p>
   <div class="tablewrap" style="max-height:52vh;overflow:auto"><table class="compact"><thead><tr><th>In the file</th><th>Legislator</th><th>Intern</th><th>Email</th><th>Phone</th></tr></thead><tbody>
   ${P.items.map((x,i)=>`<tr class="${x.id?'':'int-miss'}"><td class="small">${esc(x.raw)}</td><td><select data-intm="${i}" aria-label="Legislator for row ${i+1}">${opts(x.id)}</select></td><td>${esc(x.name)}</td><td class="small">${esc(x.email)}</td><td class="small" style="white-space:nowrap">${esc(x.phone)}</td></tr>`).join('')}</tbody></table></div>
   <label class="check" style="margin-top:10px"><input type="checkbox" id="intRepl" ${P.replace?'checked':''}><span>Replace the whole list (uncheck to only update the legislators in this file)</span></label>
   <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn" id="intPrevX">Cancel</button><button class="btn primary">Import</button></div></form>`;
  dlg.querySelectorAll('[data-intm]').forEach(s=>s.onchange=()=>{P.items[+s.dataset.intm].id=s.value;s.closest('tr').classList.toggle('int-miss',!s.value)});
  $('intPrevX').onclick=()=>{dlg.close();INTP=null};
  $('intPrevF').onsubmit=async e=>{e.preventDefault();
    const items=P.items.filter(x=>x.id).map(x=>{const l=legById(x.id);return {k:legBK(l),name:x.name,email:x.email,phone:x.phone}});
    if(!items.length){toast('Pick a legislator for at least one row.');return}
    try{const j=await api('interns',{action:'import',items,replace:$('intRepl').checked,file:P.file});INTERNS=j;dlg.close();INTP=null;toast(`Imported ${plural(j.added,'intern contact')}`);route(true)}catch(err){toast(err.message)}};
  if(!dlg.open)dlg.showModal();
}
function intTemplate(){
  const L=(LEGS||[]).filter(l=>l.id).slice().sort((a,b)=>a.house.localeCompare(b.house)||(+a.district)-(+b.district));
  const q=v=>`"${String(v).replace(/"/g,'""')}"`;
  const csv=['Chamber,District,Legislator,Intern Name,Intern Email,Intern Phone',...L.map(l=>[l.house==='H'?'House':'Senate',l.district,l.name,'','',''].map(q).join(','))].join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='legislative-interns-template.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}

// ---------- events
document.addEventListener('click',e=>{
  const t=e.target.closest&&e.target.closest('[data-intedit]');if(t){e.preventDefault();internDialog(t.dataset.intedit);return}
  const c=e.target.closest&&e.target.closest('[data-intcopy]');if(c){e.preventDefault();navigator.clipboard.writeText(c.dataset.intcopy).then(()=>toast('Email copied')).catch(()=>toast(c.dataset.intcopy))}
});
function internsBind(){
  const imp=$('intImp');if(imp)imp.onchange=()=>{const f=imp.files[0];imp.value='';if(f)intImport(f)};
  on('intTpl','onclick',intTemplate);
  on('intClear','onclick',async()=>{if(!confirm('Remove every intern contact? Profiles will stop showing “Contact their intern” until you upload a new list.'))return;
    try{INTERNS=await api('interns',{action:'clear'});toast('Cleared');route(true)}catch(e){toast(e.message)}});
}
