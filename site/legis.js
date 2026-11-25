/* Legislator profiles ("Who's Who"): photo, district, committees, their bills grouped by the committee
   hearing them, and how their bills line up with the positions the office and outside committees took. */
'use strict';
let COMS=null, LEGSORT='committee', LEGVIEW='all', VOTES=null, LPMODE=null, LPQ=null;
function loadVotes(){if(VOTES===null){VOTES=undefined;getJSON('data/votes.json').then(j=>{VOTES=j||{};if(location.hash.startsWith('#legislators-'))route(true)}).catch(()=>{VOTES={}})}return VOTES||null}
const PASSAGE=/3rd reading|final passage|concur/i;
const contested=v=>v[5].length>=Math.max(3,0.1*(v[4].length+v[5].length));
// Every passage vote this legislator cast, with the bill it was on.
function legVotes(l){const V=loadVotes();if(!V)return null;const out=[];
  for(const [ses,bills] of Object.entries(V))for(const [num,rec] of Object.entries(bills))for(const v of rec.v){if(!PASSAGE.test(v[3]||''))continue;
    const how=v[4].includes(l.id)?'y':v[5].includes(l.id)?'n':null;if(how)out.push({ses,num,key:`${ses}/${num}`,v,how,c:contested(v)})}
  return out}
// Organizations: the office (signed in) and each outside committee, with the bills they took a side on.
function orgs(){const list=[];
  if(ME)list.push({id:'office',name:'The office',full:'Your office’s positions',pos:b=>posOf(b)});
  for(const d of CONFIG.designations||[])list.push({id:d.id,name:d.full||d.name,full:d.name,pos:b=>{const x=cposOf(b)[d.id];return x&&x.pos}});
  return list}
function alignment(l){
  const vs=legVotes(l);if(!vs)return null;
  const byBill={};for(const x of vs.filter(x=>x.c))byBill[x.key]=x; // last contested passage vote per bill
  return orgs().map(o=>{let n=0,yes=0;const rows=[];for(const x of Object.values(byBill)){const b=BYKEY[x.key];if(!b)continue;const p=posSide(o.pos(b));if(!p)continue;n++;const agree=(p==='support')===(x.how==='y');if(agree)yes++;rows.push({b,x,p,agree})}
    return {...o,n,yes,pct:n?Math.round(yes/n*100):null,rows}}).filter(o=>o.n)}
const orgBadge=o=>{const ini=o.full&&o.full.length<=8?o.full.replace(/[^A-Za-z]/g,'').slice(0,5):(o.full||o.name).replace(/[^A-Za-z ]/g,'').split(/\s+/).filter(Boolean).map(w=>w[0]).join('').slice(0,3).toUpperCase();const hue=[...o.id].reduce((h,c)=>h+c.charCodeAt(0),0)%5;return `<span class="orgb ob${hue}" aria-hidden="true">${o.id==='office'?BEE:esc(ini)}</span>`};
function loadComs(){if(COMS===null){COMS=undefined;getJSON('data/committees.json').then(j=>{COMS=j||[];if(location.hash.startsWith('#legislators-'))route(true)}).catch(()=>{COMS=[]})}return COMS||[]}
// Standing committee names without the chamber, so House and Senate versions group together.
const comKey=c=>String(c||'').replace(/^(House|Senate)\s+/,'').replace(/\s+(Standing\s+)?Committee$/,'').replace(/\s+Confirmation$/,'').trim()||'Not assigned to a committee yet';
function legBills(l){const S=UI.session;return allRows(S).filter(b=>b.spId===l.id||b.flId===l.id||(!b.spId&&legMatchName(l,b.sponsor))||(!b.flId&&legMatchName(l,b.floor)))}
function legProfile(id){
  const l=legById(id);if(!l)return '';
  const bills=legBills(l), chief=bills.filter(b=>b.spId===l.id||(!b.spId&&legMatchName(l,b.sponsor))), floor=bills.filter(b=>!chief.includes(b));
  const passed=chief.filter(b=>(outcome(b)||{}).k==='pass').length, decided=chief.filter(b=>outcome(b)).length;
  const coms=loadComs().filter(c=>(c.members||[]).some(m=>m.id===l.id)).map(c=>({name:c.name,pos:(c.members.find(m=>m.id===l.id)||{}).pos}));
  const show=LEGVIEW==='chief'?chief:LEGVIEW==='floor'?floor:bills;
  const groups={};for(const b of show){const k=LEGSORT==='committee'?comKey(committeeOf(b)):LEGSORT==='status'?((outcome(b)||{}).l||'Still moving'):'All bills';(groups[k]=groups[k]||[]).push(b)}
  const ini=(l.name||'').split(/\s+/).filter(w=>/^[A-Z]/.test(w)).map(w=>w[0]).filter((c,i,a)=>i===0||i===a.length-1).join('');
  return `<div class="lp-back" id="lpBack"><div class="lp" role="dialog" aria-modal="true" aria-labelledby="lpName">
   <a class="lp-x" href="#learn-members" id="lpX" aria-label="Close">×</a>
   <div class="lp-hd"><img src="${esc(legPhoto(l))}" alt="" onerror="this.outerHTML='<span class=&quot;lp-ph&quot;>${esc(ini)}</span>'"><div><h2 id="lpName">${l.house==='H'?'Rep.':'Sen.'} ${esc(l.name)}</h2><div class="lp-sub">${l.house==='H'?'House':'Senate'} District ${esc(l.district)} · ${l.party==='R'?'Republican':l.party==='D'?'Democrat':esc(l.party||'')}</div>${(()=>{const vs=legVotes(l);const ss=vs?[...new Set(vs.map(x=>x.ses.slice(0,4)))].sort():[];const y=(String(l.since||'').match(/\d{4}/)||[])[0];return y?`<div class="small muted">Serving since ${y}</div>`:ss.length?`<div class="small muted">Voting records from ${ss.join(' and ')}</div>`:''})()}${legWhere(l)?`<div class="small muted">${esc(legWhere(l))}</div>`:''}${l.profession?`<div class="small muted">${esc(l.profession)}</div>`:''}</div></div>
   <div class="lp-stats"><span><b>${chief.length}</b> chief sponsor</span><span><b>${floor.length}</b> floor sponsor</span><span><b>${decided?Math.round(passed/decided*100)+'%':'—'}</b> of ${pron(l).p} decided bills passed</span>${ME?`<span><b>${bills.filter(onOffice).length}</b> on the office list</span>`:''}</div>
   ${coms.length?`<div class="lp-coms"><span class="flabel">Committees</span>${coms.map(c=>`<span class="chip">${esc(c.name)}${c.pos&&!/member/i.test(c.pos)?` · ${esc(c.pos)}`:''}</span>`).join(' ')}</div>`:''}
   ${lpAlignHTML(l)}
   <div class="lp-bills"><div class="lp-bar"><h3>${pron(l).P} bills</h3><div class="seg" role="group" aria-label="Which bills">${[['all','All'],['chief','Chief'],['floor','Floor']].map(([k,t])=>`<button type="button" data-lpv="${k}" class="${LEGVIEW===k?'on':''}">${t}</button>`).join('')}</div>
     <label class="small">Group by <select id="lpSort"><option value="committee" ${LEGSORT==='committee'?'selected':''}>Committee</option><option value="status" ${LEGSORT==='status'?'selected':''}>Outcome</option><option value="none" ${LEGSORT==='none'?'selected':''}>Don’t group</option></select></label></div>
    ${Object.keys(groups).length?Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,list])=>`<h4 class="lp-g">${esc(k)} <span class="tiny muted">${list.length}</span></h4>${list.sort(SORTS.num).map(b=>`<div class="lp-b"><a class="billnum" href="${billHref(b)}">${esc(billLabel(b))}</a><span class="serif">${esc(b.title)}</span>${outcome(b)?`<span class="pill ${outcome(b).k}">${esc(outcome(b).l)}</span>`:''}${posOf(b)?`<span class="pos" style="--c:${posColor(posOf(b))}">${esc(posName(posOf(b)))}</span>`:''}${cposChips(b)}</div>`).join('')}`).join(''):'<p class="empty">No bills this session yet.</p>'}
   </div>
   ${typeof outLegHTML==='function'?outLegHTML(l.id):''}
   <div class="lp-actions"><a class="btn" href="#bills" data-sponsor="${esc(l.id)}">Open ${pron(l).p} bills in the table</a>${legEmail(l)?`<a class="btn" href="mailto:${esc(legEmail(l))}">Email</a>`:''}</div>
  </div></div>`;
}
function lpAlignHTML(l){
  const vs=legVotes(l);if(!vs)return '<p class="small muted">Loading votes…</p>';
  const pv=vs.length, cv=vs.filter(x=>x.c), yes=vs.filter(x=>x.how==='y').length;
  const ses=[...new Set(vs.map(x=>x.ses.slice(0,4)))].sort().join(' and ');
  const al=alignment(l)||[];
  const most=al.filter(o=>o.pct>=50).sort((a,b)=>b.pct-a.pct||b.n-a.n), least=al.filter(o=>o.pct<50).sort((a,b)=>a.pct-b.pct||b.n-a.n);
  const row=(o,c)=>`<div class="org">${orgBadge(o)}<div><div class="on">${esc(o.name)}</div><div class="os">${o.yes} of ${plural(o.n,'shared bill')}</div></div><span class="opct ${c}">${o.pct}%</span></div>`;
  let extra='';
  if(LPMODE==='all')extra=`<div class="lp-more"><h4>All organizations</h4>${al.sort((a,b)=>b.pct-a.pct).map(o=>row(o,o.pct>=50?'pos':'neg')).join('')||'<p class="small muted">No organization has taken positions on bills this legislator voted on yet.</p>'}</div>`;
  if(LPMODE==='office'){const o=al.find(x=>x.id==='office');extra=`<div class="lp-more"><h4>Compared with the office</h4>${o?`<p class="small muted">Contested bills the office took a side on, and how ${pron(l).s} voted.</p><table class="compact"><tbody>${o.rows.map(r=>`<tr><td><a class="billnum" href="${billHref(r.b)}">${esc(shortNum(r.b.num))}</a></td><td class="serif">${esc(r.b.title)}</td><td>Office: <b>${r.p==='support'?'Support':'Oppose'}</b></td><td>Voted <b>${r.x.how==='y'?'yes':'no'}</b></td><td>${r.agree?'<span class="opct pos">Same side</span>':'<span class="opct neg">Different</span>'}</td></tr>`).join('')}</tbody></table>`:'<p class="small muted">The office hasn’t taken a support or oppose position on any contested bill this legislator voted on yet.</p>'}</div>`}
  return `<div class="lp-votes"><div class="lp-vs"><span><b>${pv}</b> passage votes</span><span><b>${cv.length}</b> contested</span><span><b>${pv?Math.round(yes/pv*100):0}%</b> voted yes</span></div>${pv?`<div class="small muted">${ses}, contested bills only</div>`:'<div class="small muted">No recorded floor votes in this data yet.</div>'}</div>
   ${al.length?`<div class="lp-orgs"><div><h3 class="pos">Most aligned organizations</h3>${most.slice(0,5).map(o=>row(o,'pos')).join('')||'<p class="small muted">None yet.</p>'}</div><div><h3 class="neg">Least aligned organizations</h3>${least.slice(0,5).map(o=>row(o,'neg')).join('')||'<p class="small muted">None yet.</p>'}</div></div>
    <p class="lp-note">Organizations take positions on far fewer bills than legislators vote on, so organization scores rest on less data. The number of shared bills is shown with each score.</p>`
    :`<p class="lp-note">${ME?`Alignment scores appear once the office or the outside associations (Admin → Association positions) take support or oppose positions on contested bills ${pron(l).s} voted on.`:`Sign in to see how ${pron(l).p} votes line up with the positions the office tracks.`}</p>`}
   <div class="lp-btns"><button type="button" class="btn ${LPMODE==='all'?'':'primary'}" data-lpm="all">Compare with all organizations</button>${ME?`<button type="button" class="btn" data-lpm="office">Compare with the office</button>`:''}</div>
   ${extra}`;
}
function legisBind(){
  app.querySelectorAll('[data-lpm]').forEach(b=>b.onclick=()=>{LPMODE=LPMODE===b.dataset.lpm?null:b.dataset.lpm;LPQ=null;route(true)});
  if(!location.hash.startsWith('#legislators-'))return;
  const back=$('lpBack');if(back){back.onclick=e=>{if(e.target===back)lpClose()};document.body.style.overflow='hidden'}
  on('lpX','onclick',e=>{e.preventDefault();lpClose()});
  app.querySelectorAll('[data-lpv]').forEach(b=>b.onclick=()=>{LEGVIEW=b.dataset.lpv;route(true)});
  on('lpSort','onchange',e=>{LEGSORT=e.target.value;route(true)});
  app.querySelectorAll('.lp [data-sponsor]').forEach(a=>a.onclick=()=>{document.body.style.overflow='';FLT.sponsor=a.dataset.sponsor;FLT.show='all';PAGE=1;saveFLT()});
}
window.addEventListener('hashchange',()=>{LPMODE=null;LPQ=null;if(!location.hash.startsWith('#legislators-'))document.body.style.overflow=''});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&location.hash.startsWith('#legislators-'))lpClose()});
// Remember where someone was before opening a profile, so closing it puts them right back.
let LPRET=null;
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[href^="#legislators-"]');if(a&&!location.hash.startsWith('#legislators-'))LPRET={hash:location.hash||'#updates',y:scrollY}},true);
function lpClose(){
  const r=LPRET;LPRET=null;document.body.style.overflow='';
  const to=r&&r.hash&&!r.hash.startsWith('#legislators')?r.hash:'#learn-members';
  location.hash=to;
  if(r){const y=r.y;let n=0;const go=()=>{scrollTo(0,y);if(Math.abs(scrollY-y)>2&&n++<20)setTimeout(go,50)};setTimeout(go,30)}
}
