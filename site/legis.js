/* Legislator profiles ("Who's Who"): photo, district, committees, their bills grouped by the committee
   hearing them, and how their bills line up with the positions the office and outside committees took. */
'use strict';
let COMS=null, LEGSORT='committee', LEGVIEW='all';
function loadComs(){if(COMS===null){COMS=undefined;getJSON('data/committees.json').then(j=>{COMS=j||[];if(location.hash.startsWith('#legislators-'))route(true)}).catch(()=>{COMS=[]})}return COMS||[]}
// Standing committee names without the chamber, so House and Senate versions group together.
const comKey=c=>String(c||'').replace(/^(House|Senate)\s+/,'').replace(/\s+(Standing\s+)?Committee$/,'').replace(/\s+Confirmation$/,'').trim()||'Not assigned to a committee yet';
function legBills(l){const S=UI.session;return allRows(S).filter(b=>b.spId===l.id||b.flId===l.id||(!b.spId&&legMatchName(l,b.sponsor))||(!b.flId&&legMatchName(l,b.floor)))}
function alignRows(bills){
  // For each position-taker (the office, then each outside committee): of this legislator's bills it took
  // a position on, how many it supports.
  const rows=[];const sup=p=>/support/.test(p), opp=p=>/oppose/.test(p);
  if(ME){const w=bills.filter(b=>posOf(b)&&posOf(b)!=='neutral');if(w.length)rows.push({who:'The office',full:'Your office’s positions',n:w.length,yes:w.filter(b=>sup(posOf(b))).length})}
  for(const d of CONFIG.designations||[]){const w=bills.filter(b=>{const x=cposOf(b)[d.id];return x&&x.pos!=='tagged'&&x.pos!=='neutral'});if(w.length)rows.push({who:d.name,full:d.full,n:w.length,yes:w.filter(b=>sup(cposOf(b)[d.id].pos)).length})}
  return rows.map(r=>({...r,pct:Math.round(r.yes/r.n*100)})).sort((a,b)=>b.pct-a.pct||b.n-a.n);
}
function legProfile(id){
  const l=legById(id);if(!l)return '';
  const bills=legBills(l), chief=bills.filter(b=>b.spId===l.id||(!b.spId&&legMatchName(l,b.sponsor))), floor=bills.filter(b=>!chief.includes(b));
  const passed=chief.filter(b=>(outcome(b)||{}).k==='pass').length, decided=chief.filter(b=>outcome(b)).length;
  const coms=loadComs().filter(c=>(c.members||[]).some(m=>m.id===l.id)).map(c=>({name:c.name,pos:(c.members.find(m=>m.id===l.id)||{}).pos}));
  const show=LEGVIEW==='chief'?chief:LEGVIEW==='floor'?floor:bills;
  const groups={};for(const b of show){const k=LEGSORT==='committee'?comKey(committeeOf(b)):LEGSORT==='status'?((outcome(b)||{}).l||'Still moving'):'All bills';(groups[k]=groups[k]||[]).push(b)}
  const al=alignRows(bills);
  const ini=(l.name||'').split(/\s+/).filter(w=>/^[A-Z]/.test(w)).map(w=>w[0]).filter((c,i,a)=>i===0||i===a.length-1).join('');
  return `<div class="lp-back" id="lpBack"><div class="lp" role="dialog" aria-modal="true" aria-labelledby="lpName">
   <a class="lp-x" href="#legislators" aria-label="Close">×</a>
   <div class="lp-hd"><img src="${esc(legPhoto(l))}" alt="" onerror="this.outerHTML='<span class=&quot;lp-ph&quot;>${esc(ini)}</span>'"><div><h2 id="lpName">${l.house==='H'?'Rep.':'Sen.'} ${esc(l.name)}</h2><div class="lp-sub">${l.house==='H'?'House':'Senate'} District ${esc(l.district)} · ${l.party==='R'?'Republican':l.party==='D'?'Democrat':esc(l.party||'')}</div>${l.counties?`<div class="small muted">${esc(l.counties)}</div>`:''}${l.profession?`<div class="small muted">${esc(l.profession)}</div>`:''}</div></div>
   <div class="lp-stats"><span><b>${chief.length}</b> chief sponsor</span><span><b>${floor.length}</b> floor sponsor</span><span><b>${decided?Math.round(passed/decided*100)+'%':'—'}</b> of their decided bills passed</span>${ME?`<span><b>${bills.filter(onOffice).length}</b> on the office list</span>`:''}</div>
   ${coms.length?`<div class="lp-coms"><span class="flabel">Committees</span>${coms.map(c=>`<span class="chip">${esc(c.name)}${c.pos&&!/member/i.test(c.pos)?` · ${esc(c.pos)}`:''}</span>`).join(' ')}</div>`:''}
   ${al.length?`<div class="lp-al"><h3>How their bills line up with positions taken</h3><p class="small muted">Of this legislator’s bills that each group took a support or oppose position on, the share it supports. Groups take positions on far fewer bills than legislators sponsor, so the number of bills is shown with each score.</p>
    <div class="grid2">${[['Most aligned',al.filter(r=>r.pct>=50).slice(0,5),'pos'],['Least aligned',al.filter(r=>r.pct<50).sort((a,b)=>a.pct-b.pct).slice(0,5),'neg']].map(([h,list,c])=>`<div><h4 class="${c}">${h}</h4>${list.length?list.map(r=>`<div class="lp-row"><span><b>${esc(r.who)}</b><span class="tiny muted"> ${esc(r.full)}</span><div class="tiny muted">${r.yes} of ${plural(r.n,'shared bill')}</div></span><span class="lp-pct ${c}">${r.pct}%</span></div>`).join(''):'<p class="small muted">None.</p>'}</div>`).join('')}</div></div>`:''}
   <div class="lp-bills"><div class="lp-bar"><h3>Their bills</h3><div class="seg" role="group" aria-label="Which bills">${[['all','All'],['chief','Chief'],['floor','Floor']].map(([k,t])=>`<button type="button" data-lpv="${k}" class="${LEGVIEW===k?'on':''}">${t}</button>`).join('')}</div>
     <label class="small">Group by <select id="lpSort"><option value="committee" ${LEGSORT==='committee'?'selected':''}>Committee</option><option value="status" ${LEGSORT==='status'?'selected':''}>Outcome</option><option value="none" ${LEGSORT==='none'?'selected':''}>Don’t group</option></select></label></div>
    ${Object.keys(groups).length?Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,list])=>`<h4 class="lp-g">${esc(k)} <span class="tiny muted">${list.length}</span></h4>${list.sort(SORTS.num).map(b=>`<div class="lp-b"><a class="billnum" href="${billHref(b)}">${esc(billLabel(b))}</a><span class="serif">${esc(b.title)}</span>${outcome(b)?`<span class="pill ${outcome(b).k}">${esc(outcome(b).l)}</span>`:''}${posOf(b)?`<span class="pos" style="--c:${posColor(posOf(b))}">${esc(posName(posOf(b)))}</span>`:''}${cposChips(b)}</div>`).join('')}`).join(''):'<p class="empty">No bills this session yet.</p>'}
   </div>
   <div class="lp-actions"><a class="btn primary" href="#bills" data-sponsor="${esc(l.id)}">Open their bills in the table</a><a class="btn" href="#learn-faces">Take the face quiz</a>${legEmail(l)?`<a class="btn" href="mailto:${esc(legEmail(l))}">Email</a>`:''}</div>
  </div></div>`;
}
function legisBind(){
  if(!location.hash.startsWith('#legislators-'))return;
  const back=$('lpBack');if(back){back.onclick=e=>{if(e.target===back)location.hash='#legislators'};document.body.style.overflow='hidden'}
  app.querySelectorAll('[data-lpv]').forEach(b=>b.onclick=()=>{LEGVIEW=b.dataset.lpv;route(true)});
  on('lpSort','onchange',e=>{LEGSORT=e.target.value;route(true)});
  app.querySelectorAll('.lp [data-sponsor]').forEach(a=>a.onclick=()=>{document.body.style.overflow='';FLT.sponsor=a.dataset.sponsor;FLT.show='all';PAGE=1;saveFLT()});
}
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#legislators-'))document.body.style.overflow=''});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&location.hash.startsWith('#legislators-'))location.hash='#legislators'});
