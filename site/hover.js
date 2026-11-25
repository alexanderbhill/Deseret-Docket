/* Hover for more: pie slices name their category, and committee and division names open a small card
   with who leads them and a link to their page. Anything marked data-info="kind:id" gets a card. */
'use strict';

// ---------- committees: chairs with photos and a link to the committee's page on le.utah.gov
function comFind(q){
  const cs=typeof loadComs==='function'?loadComs():[];if(!cs.length)return null;
  const n=String(q||'').toLowerCase().replace(/ (appropriations )?(sub)?committee$/,'').trim();
  return cs.find(c=>c.id===q)||cs.find(c=>c.name.toLowerCase()===String(q).toLowerCase())
    ||cs.find(c=>/appropriations/i.test(c.name)&&c.name.toLowerCase().replace(/ appropriations (sub)?committee$/,'')===n)
    ||cs.find(c=>c.name.toLowerCase().startsWith(n+' '))||null;
}
// A committee name that opens its card on hover.
function comInfo(name,label){return `<span class="infox" tabindex="0" data-info="com:${esc(name)}">${esc(label||name)}</span>`}
function comCard(q){
  const c=comFind(q);
  if(!c)return Array.isArray(COMS)&&COMS.length?`<div class="nm">${esc(q)}</div><p class="small muted">No roster for this committee yet.</p>`:`<div class="nm">${esc(q)}</div><p class="small muted">Committee details are loading. Hover again in a moment.</p>`;
  const yr=new Date().getFullYear();
  const chairs=(c.members||[]).filter(m=>/chair/i.test(m.pos||'')).sort((a,b)=>(/vice/i.test(a.pos)?1:0)-(/vice/i.test(b.pos)?1:0));
  const one=m=>{const l=legById(m.id);if(!l)return '';return `<a class="ic-leg" href="#legislators-${esc(l.id)}"><img src="${esc(legPhoto(l))}" alt="" loading="lazy"><span><b>${esc(legTitle2(l))}</b><span class="tiny muted">${esc(m.pos.replace(/\b\w/g,x=>x.toUpperCase()))} · ${l.party==='R'?'R':l.party==='D'?'D':esc(l.party||'')}</span></span></a>`};
  return `<div class="nm">${esc(c.name)}</div><div class="tiny muted" style="margin-bottom:6px">${plural((c.members||[]).length,'member')}</div>
   ${chairs.map(one).join('')||'<p class="small muted">No chair listed yet.</p>'}
   <a class="btn sm" href="https://le.utah.gov/committee/committee.jsp?year=${yr}&com=${encodeURIComponent(c.id)}" target="_blank" rel="noopener" style="margin-top:8px">Committee page on le.utah.gov ${typeof ic==='function'?ic('external'):''}</a>`;
}
const legTitle2=l=>`${l.house==='H'?'Rep.':'Sen.'} ${l.name}`;

// ---------- AG divisions (used on Learn → the AG's Office)
function divCard(id){
  const d=divById(id);if(!d)return '';
  const lead=(typeof AG_LEADS!=='undefined'&&AG_LEADS[d.dept])||null;
  // This session's bills for the division (or the latest session with numbered bills, before bills are numbered)
  const sid=allRows(UI.session).some(b=>!b.file)?UI.session:((INDEX.sessions.find(x=>x.count>0&&BILLS[x.id])||{}).id||UI.session);
  const rows=allRows(sid).filter(b=>divWork(b,id));
  const mine=rows.filter(b=>divsOf(b).includes(id)), rest=rows.filter(b=>!divsOf(b).includes(id));
  const list=[...mine,...rest].sort((a,b)=>(divsOf(b).includes(id)-divsOf(a).includes(id))||(!!b.agm-!!a.agm)).slice(0,6);
  return `<div class="nm">${esc(d.name)}</div><div class="tiny muted">${esc(deptName(d.dept))} Department${lead?` · led by ${esc(lead[0])}, ${esc(lead[1])}`:''}</div>
   ${(d.keywords||[]).length?`<p class="small" style="margin:8px 0 4px">Handles bills about: ${esc(d.keywords.slice(0,8).join(', '))}${d.keywords.length>8?'…':''}.</p>`:''}
   ${(d.codes||[]).length?`<p class="tiny muted" style="margin:0 0 6px">Utah Code it watches: ${esc(d.codes.slice(0,6).join(', '))}</p>`:''}
   <div class="small" style="margin:8px 0 4px"><b>${rows.length}</b> ${esc(sessName(sid))} bill${rows.length===1?'':'s'}${mine.length?` (${mine.length} assigned by the office)`:''}</div>
   ${list.length?`<div class="dc-bills">${list.map(b=>`<a href="${billHref(b)}"><span class="billnum">${esc(b.file?'File':shortNum(b.num))}</span><span>${esc(b.title)}</span>${divsOf(b).includes(id)?'<span class="tiny dc-a">assigned</span>':''}</a>`).join('')}</div>`:''}
   ${rows.length?`<a class="btn sm" href="#bills" data-divbills="${esc(id)}" data-divsess="${esc(sid)}" style="margin-top:8px">See all ${rows.length} on the Bills tab</a>`:''}`;
}

function legCard(id){const l=legById(id);if(!l)return '';
  return `<div class="hd"><img src="${esc(legPhoto(l))}" alt="" loading="lazy"><div><div class="nm">${esc(legTitle2(l))}</div><div class="small muted">${l.house==='H'?'House':'Senate'} District ${esc(l.district)} · ${l.party==='R'?'Republican':l.party==='D'?'Democrat':esc(l.party||'')}</div>${legWhere(l)?`<div class="tiny muted">${esc(legWhere(l))}</div>`:''}${l.since?`<div class="tiny muted">Serving since ${esc((l.since.match(/\d{4}/)||[''])[0])}</div>`:''}</div></div>
   <a class="btn sm" href="#legislators-${esc(l.id)}">See their bills and profile</a>`}
let infoEl=null, infoT=null;
function closeInfo(){clearTimeout(infoT);if(infoEl){infoEl.remove();infoEl=null}}
function openInfo(t){
  const [kind,...rest]=t.dataset.info.split(':');const id=rest.join(':');
  const html=kind==='leg'?legCard(id):kind==='com'?comCard(id):kind==='div'?divCard(id):kind==='agp'&&typeof agPersonCard==='function'?agPersonCard(id):kind==='html'?t.dataset.infohtml:'';
  if(!html)return;
  closeInfo();infoEl=document.createElement('div');infoEl.className='spcard infocard';infoEl.setAttribute('role','dialog');infoEl.innerHTML=html;infoEl.dataset.for=t.dataset.info;
  document.body.appendChild(infoEl);
  const r=t.getBoundingClientRect(),w=300;infoEl.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';
  let top=r.bottom+6;if(top+infoEl.offsetHeight>innerHeight-50)top=Math.max(8,r.top-infoEl.offsetHeight-6);infoEl.style.top=top+'px';
  infoEl.onmouseenter=()=>clearTimeout(infoT);infoEl.onmouseleave=()=>{infoT=setTimeout(closeInfo,250)};
}
document.addEventListener('mouseover',e=>{const t=e.target.closest&&e.target.closest('[data-info]');if(!t)return;clearTimeout(infoT);if(!infoEl||infoEl.dataset.for!==t.dataset.info)infoT=setTimeout(()=>openInfo(t),180)});
document.addEventListener('mouseout',e=>{const t=e.target.closest&&e.target.closest('[data-info]');if(t){clearTimeout(infoT);infoT=setTimeout(closeInfo,300)}});
document.addEventListener('focusin',e=>{const t=e.target.closest&&e.target.closest('[data-info]');if(t)openInfo(t)});
document.addEventListener('click',e=>{const t=e.target.closest&&e.target.closest('[data-info]');if(t&&!e.target.closest('a')){e.preventDefault();openInfo(t);return}if(infoEl&&!infoEl.contains(e.target))closeInfo()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeInfo()});
addEventListener('scroll',()=>{if(infoEl)closeInfo()},{passive:true});
addEventListener('hashchange',closeInfo);
// "See all" from a division card: the Bills tab, every bill, narrowed to that division
document.addEventListener('click',async e=>{const a=e.target.closest&&e.target.closest('[data-divbills]');if(!a)return;
  FLT.sug=a.dataset.divbills;FLT.show='all';FLT.find='';FLT.div=[];FLT.dept=[];PAGE=1;saveFLT();closeInfo();
  if(a.dataset.divsess&&a.dataset.divsess!==UI.session){e.preventDefault();UI.session=a.dataset.divsess;saveUI();await loadSession(UI.session);location.hash='#bills'}});

// ---------- pie slices: hover (or focus) a slice to see its category, amount and share
(()=>{let tip=null;
  const hide=()=>{if(tip){tip.remove();tip=null}document.querySelectorAll('.legend .li.hl').forEach(x=>x.classList.remove('hl'))};
  const show=(p,x,y)=>{hide();tip=document.createElement('div');tip.className='pietip';tip.innerHTML=`<b>${esc(p.dataset.tip)}</b><span>${esc(p.dataset.tipv||'')}</span>`;document.body.appendChild(tip);
    const w=tip.offsetWidth;tip.style.left=Math.max(8,Math.min(x+14,innerWidth-w-8))+'px';tip.style.top=Math.max(8,y-tip.offsetHeight-10)+'px';
    const wrap=p.closest('.pie-wrap');const li=wrap&&wrap.querySelector(`.li[data-i="${p.dataset.i}"]`);if(li)li.classList.add('hl')};
  document.addEventListener('mousemove',e=>{const p=e.target.closest&&e.target.closest('.pie path[data-tip]');if(p)show(p,e.clientX,e.clientY);else if(tip)hide()});
  document.addEventListener('focusin',e=>{const p=e.target.closest&&e.target.closest('.pie path[data-tip]');if(p){const r=p.getBoundingClientRect();show(p,r.left+r.width/2,r.top+r.height/2)}});
  document.addEventListener('focusout',e=>{if(e.target.closest&&e.target.closest('.pie path'))hide()});
  addEventListener('scroll',hide,{passive:true});addEventListener('hashchange',hide);
})();
setTimeout(()=>{if(typeof loadComs==='function')loadComs()},1200);
