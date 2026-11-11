/* Deseret Docket. One page, no build step. Bill data comes from data/*.json (rebuilt by the weekday
   update); the office's own information comes from /api, only for signed-in accounts allowed to see it. */
'use strict';

/* ===================== HELPERS ===================== */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_AP=['Jan.','Feb.','March','April','May','June','July','Aug.','Sept.','Oct.','Nov.','Dec.'];
const WD=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const pd=s=>{if(!s)return null;const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);return m?new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0)):null};
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fmtMD=d=>`${d.getMonth()+1}/${d.getDate()}`;
const fmtMDY=d=>`${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
const fmtLong=d=>`${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
function fmtTime(d){let h=d.getHours(),m=String(d.getMinutes()).padStart(2,'0');const ap=h>=12?'p.m.':'a.m.';h=h%12||12;return `${h}:${m} ${ap}`}
const fmtAP=d=>`${MONTHS_AP[d.getMonth()]} ${d.getDate()}, ${fmtTime(d)}`;
const TODAY=new Date();TODAY.setHours(0,0,0,0);
const todayStr=ymd(TODAY);
const money=(v,short)=>{if(v==null||isNaN(v))return '—';const a=Math.abs(v);let s;
  if(short&&a>=1e9)s='$'+(a/1e9).toFixed(a>=1e10?1:2)+'B';else if(short&&a>=1e6)s='$'+(a/1e6).toFixed(a>=1e8?0:1)+'M';else if(short&&a>=1e4)s='$'+Math.round(a/1e3)+'K';else s='$'+Math.round(a).toLocaleString();
  return (v<0?'−':'')+s};
const plural=(n,w,p)=>`${n.toLocaleString()} ${n===1?w:(p||w+'s')}`;
const shortNum=n=>{const m=String(n||'').match(/^([A-Z]+)0*(\d+)$/);return m?`${m[1]} ${m[2]}`:n};
const $=id=>document.getElementById(id);
const app=$('app');
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2800)}
const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const BEE=`<svg viewBox="0 0 32 32" aria-hidden="true" class="bee"><g class="wings"><ellipse cx="13.2" cy="9.6" rx="4.4" ry="7.2" transform="rotate(-28 13.2 9.6)"/><ellipse cx="19" cy="10.2" rx="3.6" ry="6.2" transform="rotate(22 19 10.2)"/></g><path class="feelers" d="M5.4 15.4C4.6 12.6 3.2 11.4 1.6 11.2M7.2 14.6C7.4 11.8 8.4 10.4 9.8 9.8" fill="none"/><ellipse class="body" cx="16.6" cy="19.6" rx="10.2" ry="6.6"/><clipPath id="beeclip"><ellipse cx="16.6" cy="19.6" rx="10.2" ry="6.6"/></clipPath><path class="stripe" d="M12.3 13.5h3.1v12.2h-3.1zM18.4 13.1h3.1v13h-3.1z" clip-path="url(#beeclip)"/><path class="stripe" d="M26.6 18.6l4 1-4 1.2z"/><circle class="head" cx="6.3" cy="18.6" r="3.9"/><circle class="eye" cx="5.2" cy="17.8" r="0.9"/></svg>`;

/* ===================== DATA ===================== */
let INDEX=null, CONFIG=null, LEGS=null, BUDGET=null;
const BILLS={}, FILES={}, BYKEY={}, TEXT={}, TEXTSTATE={}, TX={};
async function getJSON(p){const r=await fetch(p,{cache:'no-cache'});if(!r.ok)throw new Error(p+' '+r.status);return r.json()}
function toBill(session,r){return {key:`${session}/${r.n}`,session,num:r.n,file:false,title:r.t,sponsor:r.sp,floor:r.fl,spH:r.spH||(/^Rep\./.test(r.sp)?'H':/^Sen\./.test(r.sp)?'S':''),flH:r.flH||(/^Rep\./.test(r.fl||'')?'H':/^Sen\./.test(r.fl||'')?'S':''),spId:r.spId||'',flId:r.flId||'',version:r.ver,act:r.act,own:r.own,date:pd(r.date),description:r.gd,hist:r.hist||[],vers:r.vers||[],docs:r.docs||[],ag:r.ag||[],secs:r.secs||[],subj:r.subj||[],ch:r.ch||[],tx:r.tx||[],agm:r.agm||0,txc:r.txc,fn:r.fn||null,vd:r.vd||null,cmp:r.cmp||null,sug:r.sug||[],cj:!!r.cj,tid:r.tid||'',cosp:r.cosp||[],rc:r.rc||[],fa:r.fa||'',agd:r.agd||[]}}
function toFile(session,f){const seen=f.seen||'';return {key:`${session}/F-${f.tid}`,session,num:'',file:true,title:f.t,sponsor:f.sp,floor:'',spH:f.spH,flH:'',version:'',act:f.st||'In Process',own:'Bill drafting (not numbered yet)',date:pd(seen),description:'',hist:[],vers:[],docs:[],ag:[],secs:[],subj:[],ch:seen?[[seen,'New bill file',`Bill file opened: “${f.t}”.`]].concat(f.stCh?[[f.stCh,'Status',f.st]]:[]):[],tx:[],agm:0,fn:null,vd:null,cmp:null,sug:f.sug||[],cj:!!f.cj,tid:f.tid,cosp:[],rc:[],agd:[],seen}}
function loadTx(session,chunk){const k=session+'/'+chunk;if(!TX[k])TX[k]=getJSON(`data/${session}/tx-${chunk}.json`);return TX[k]}
async function loadSession(s){
  if(BILLS[s]) return;
  const meta=INDEX.sessions.find(x=>x.id===s)||{};
  const [rows,files]=await Promise.all([meta.count?getJSON(`data/${s}/bills.json`):[], getJSON(`data/${s}/files.json`).catch(()=>({files:[]}))]);
  BILLS[s]=rows.map(r=>toBill(s,r)); FILES[s]=(files.files||[]).map(f=>toFile(s,f));
  BILLS[s].forEach(b=>BYKEY[b.key]=b); FILES[s].forEach(b=>BYKEY[b.key]=b);
  TEXT[s]={}; TEXTSTATE[s]={loaded:0,total:meta.textFiles||0};
  for(let i=0;i<(meta.textFiles||0);i++){
    getJSON(`data/${s}/text-${i}.json`).then(chunk=>{Object.assign(TEXT[s],chunk);TEXTSTATE[s].loaded++;matchCache.clear();if(booted&&TEXTSTATE[s].loaded===TEXTSTATE[s].total)route(true)}).catch(()=>{TEXTSTATE[s].loaded++});
  }
}
const textReady=s=>{const t=TEXTSTATE[s];return !t||t.loaded>=t.total};
const allRows=s=>[...(BILLS[s]||[]),...(FILES[s]||[])];
const deptName=id=>(CONFIG.departments.find(d=>d.id===id)||{}).name||id;
const deptColor=id=>(CONFIG.departments.find(d=>d.id===id)||{}).color||'var(--muted)';
const divById=id=>CONFIG.divisions.find(d=>d.id===id);
const divName=id=>(divById(id)||{}).name||id;
const priName=id=>(CONFIG.priorities.find(p=>p.id===id)||{}).name||'';
const priColor=id=>(CONFIG.priorities.find(p=>p.id===id)||{}).color||'var(--muted)';
const posName=id=>((CONFIG.positions||[]).find(p=>p.id===id)||{}).name||'';
const posColor=id=>((CONFIG.positions||[]).find(p=>p.id===id)||{}).color||'var(--muted)';
const legById=id=>(LEGS||[]).find(l=>l.id===id);

/* ===================== ACCOUNT & OFFICE DATA ===================== */
// ME: null for guests. Guests see public bill information only, and nothing they change is saved.
let ME=null; const OFFICE={}; let WATCHMETA=null, PEOPLE=[], officeSig='';
const isAdmin=()=>ME&&ME.role==='admin';
const P=()=>ME?ME.perms:{edit:false,fields:[],seePriority:false,seeNotes:false,watch:false,scope:'all'};
const canSee=f=>!!ME&&(f==='priority'?isAdmin()||P().seePriority:f==='note'?isAdmin()||P().seeNotes:true);
const canEdit=f=>!!ME&&(isAdmin()||(P().edit&&P().fields.includes(f)&&canSee(f)));
async function api(path,body){
  const opt=body?{method:'POST',headers:{'Content-Type':'application/json','X-Docket':'1'},body:JSON.stringify(body),credentials:'same-origin'}:{credentials:'same-origin',cache:'no-store'};
  const r=await fetch('/api/'+path,opt); const j=await r.json().catch(()=>({}));
  if(r.status===401&&ME){ME=null;toast('You were signed out. Sign in again to keep editing.');route()}
  if(!r.ok) throw new Error(j.error||('error '+r.status)); return j;
}
// The office row for a bill. A bill file's information follows it once it gets a number.
function off(b){const o=OFFICE[b.key];if(o)return o;if(!b.file&&b.tid){const f=OFFICE[`${b.session}/F-${b.tid}`];if(f)return f}return null}
const deptsOf=b=>(off(b)||{}).departments||[];
const divsOf=b=>(off(b)||{}).divisions||[];
const desigOf=b=>(off(b)||{}).designations||[];
const priOf=b=>canSee('priority')?((off(b)||{}).priority||null):null;
const noteOf=b=>canSee('note')?((off(b)||{}).note||''):'';
const assignOf=b=>(off(b)||{}).assignees||[];
const posOf=b=>(off(b)||{}).position||null;
const agActOf=b=>(off(b)||{}).agAction||'';
const onOffice=b=>{const o=off(b);return !!o&&!!((o.departments||[]).length||(o.divisions||[]).length||(o.designations||[]).length||(o.priority&&o.priority!=='notrelevant')||(o.assignees||[]).length||o.note||o.position||o.agAction)};
const mineAssigned=b=>!!ME&&assignOf(b).some(a=>[ME.user,(ME.display||'').toLowerCase()].includes(String(a).toLowerCase()));
async function pullOffice(soft){
  if(!ME) return;
  try{const st=await api('state');ME.people=st.people;PEOPLE=st.people||[];
    const sig=JSON.stringify([st.bills,st.watch]);
    if(sig!==officeSig){officeSig=sig;for(const k of Object.keys(OFFICE))delete OFFICE[k];Object.assign(OFFICE,st.bills||{});
      if(st.watch){W.terms=st.watch.terms;W.codes=st.watch.codes;W.opts=st.watch.opts;WATCHMETA={by:st.watch.by,at:st.watch.at}}
      matchCache.clear();if(soft)route(true)}
    if(st.prefs&&st.prefs.cols&&!prefsLoaded){prefsLoaded=true;COLS.order=mergeCols(st.prefs.cols);COLS.hidden=st.prefs.hidden||[];lsSet(colKey(),COLS);if(soft)route(true)}
  }catch(e){if(soft)toast('Couldn’t refresh the office list: '+e.message)}
}
let prefsLoaded=false;
async function saveBill(b,patch){
  if(!ME){toast('Sign in to save office information. As a guest, nothing is saved.');return false}
  let key=b.key;
  // first change to a numbered bill whose information lives on its bill file: copy it over
  if(!OFFICE[b.key]&&off(b)){const o=off(b);patch={departments:o.departments,divisions:o.divisions,designations:o.designations,assignees:o.assignees,position:o.position,agAction:o.agAction,...(canEdit('priority')?{priority:o.priority}:{}),...(canEdit('note')?{note:o.note}:{}),...patch};
    for(const f of Object.keys(patch))if(!canEdit(f))delete patch[f]}
  try{const r=await api('bill',{key,...patch});OFFICE[key]=r.row;officeSig='';return true}
  catch(e){toast(`Couldn’t save that (${e.message}).`);return false}
}

/* ===================== WATCH LIST & MATCHING ===================== */
const W={terms:[],codes:[],opts:{struck:true,defsOnly:false,titlesOnly:false}};
function termRe(t){const parts=t.trim().split(/\s+/).map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));return new RegExp(`\\b${parts.join('\\s+')}\\b`,'i')}
const STRIP_ALL=/[\u0001\u0002]/g, CUT_STRUCK=/\u0001[^\u0002]*\u0002/g;
const matchCache=new Map(); let msig='';
function matchesFor(b){
  const sg=JSON.stringify([W.terms,W.codes,W.opts]); if(sg!==msig){matchCache.clear();msig=sg}
  if(matchCache.has(b.key)) return matchCache.get(b.key);
  const out=[]; const terms=W.terms.filter(x=>x.on).map(x=>[x.t,termRe(x.t)]);
  if(terms.length){
    const passages=TEXT[b.session]?.[b.num];
    let pool;
    if(!passages||W.opts.titlesOnly){pool=[['Title',b.title,''],['General description',b.description||'','']];if(passages)pool.push(...passages.filter(p=>p[0]==='Highlighted provisions'))}
    else pool=passages;
    for(const [t,re] of terms) for(const p of pool){
      if(W.opts.defsOnly&&!W.opts.titlesOnly&&!p[2].includes('d')) continue;
      const txt=W.opts.struck?p[1].replace(STRIP_ALL,''):p[1].replace(CUT_STRUCK,' ');
      if(re.test(txt)) out.push({term:t,where:p[0],raw:p[1],inDef:p[2].includes('d'),struck:!re.test(p[1].replace(CUT_STRUCK,' '))});
    }
  }
  for(const c of W.codes.filter(x=>x.on)) for(const code of b.secs) if(code===c.t||code.startsWith(c.t+'-')) out.push({term:'Code '+c.t,where:'Section '+code,raw:`Amends, enacts or repeals Section ${code}.`,code:true});
  matchCache.set(b.key,out); return out;
}
// Passed or killed, read from the bill's last action and history.
function outcome(b){
  if(b.file) return /abandon|withdrawn/i.test(b.act)?{k:'dead',l:'Abandoned'}:null;
  const acts=[b.act,...b.hist.map(h=>h[1])].join(' | ');
  if(/vetoed/i.test(acts)&&!/override/i.test(acts)) return {k:'dead',l:'Vetoed'};
  if(/governor signed|became law|law without (the )?governor|signed by (the )?governor/i.test(acts)) return {k:'pass',l:'Passed · signed into law'};
  if(/to governor|enrolled bill to printing|enrolled bill returned|received enrolled/i.test(acts)) return {k:'pass',l:'Passed'};
  if(/(house|senate)\/ filed|\bfailed\b|strike enacting clause|tabled|not considered/i.test(b.act||'')) return {k:'dead',l:'Killed'};
  return null;
}
const changedToday=b=>b.ch.some(c=>c[0].slice(0,10)===todayStr);
function nextHearing(b){return b.ag.map(a=>({...a,d:pd(a.date)})).filter(a=>a.d&&a.d>=TODAY).sort((x,y)=>x.d-y.d)[0]}
function lastHearing(b){return b.ag.map(a=>({...a,d:pd(a.date)})).filter(a=>a.d).sort((x,y)=>y.d-x.d)[0]}
const soon=h=>(h.d-TODAY)/864e5<=3;
function committeeOf(b){const h=nextHearing(b)||lastHearing(b);if(h)return h.committee;if(/committee/i.test(b.own||''))return b.own;return ''}
function meetings(session,filter){
  const map=new Map();
  for(const b of (BILLS[session]||[]).filter(filter||(()=>true))) for(const a of b.ag){
    const k=a.id||a.date+a.committee; if(!map.has(k)) map.set(k,{...a,d:pd(a.date),bills:[]}); map.get(k).bills.push(b);
  }
  return [...map.values()];
}
function nextUpdate(){
  const slots=[[6,40],[12,40],[17,25],[19,40]]; const d=new Date();
  for(let i=0;i<8;i++){const day=new Date(d.getFullYear(),d.getMonth(),d.getDate()+i);if(day.getDay()===0||day.getDay()===6)continue;for(const [h,m] of slots){const t=new Date(day);t.setHours(h,m,0,0);if(t>d)return t}}
}

/* ===================== STATE (per browser, not office data) ===================== */
const UI=lsGet('docket-ui-v5',{session:null});
const saveUI=()=>lsSet('docket-ui-v5',UI);
const sessName=id=>{const m=String(id||'').match(/^(\d{4})(GS|S(\d))$/);if(!m)return id;if(m[2]==='GS')return `${m[1]} General Session`;const n=['','First','Second','Third','Fourth','Fifth','Sixth'][+m[3]]||m[3];return `${m[1]} ${n} Special Session`};

/* ===================== COLUMNS ===================== */
const COLDEFS={
  position:{label:'Position',office:true}, num:{label:'Bill #'}, priority:{label:'Office priority',need:'priority'}, title:{label:'Bill / topic title'}, summary:{label:'Summary'},
  departments:{label:'Department',office:true}, committee:{label:'Committee'}, house:{label:'House'}, senate:{label:'Senate'},
  action:{label:'Last action and location'}, fiscal:{label:'Fiscal impact'}, hearing:{label:'Next hearing'},
  designations:{label:'Designations',office:true}, assignees:{label:'Assigned to',office:true}, notes:{label:'Notes',need:'note'},
  divisions:{label:'Division',office:true}, agAction:{label:'AG office action'},
};
const DEFAULT_ORDER=['position','num','priority','title','summary','departments','committee','house','senate','action','fiscal','hearing','designations','assignees','notes','divisions','agAction'];
const colKey=()=>'docket-cols-v1:'+(ME?ME.user:'guest');
const mergeCols=o=>{o=(o||[]).filter(c=>COLDEFS[c]);for(const c of DEFAULT_ORDER)if(!o.includes(c)){const i=DEFAULT_ORDER.indexOf(c);o.splice(Math.min(i,o.length),0,c)}return o};
let COLS={order:DEFAULT_ORDER.slice(),hidden:[]};
function loadCols(){const c=lsGet(colKey(),null);COLS=c?{order:mergeCols(c.order),hidden:c.hidden||[]}:{order:DEFAULT_ORDER.slice(),hidden:[]}}
function saveCols(){lsSet(colKey(),COLS);if(ME)api('prefs',{cols:COLS.order,hidden:COLS.hidden}).catch(()=>{})}
const colAllowed=c=>{const d=COLDEFS[c];if(d.office&&!ME)return false;if(d.need&&!canSee(d.need))return false;return true};
const visibleCols=()=>COLS.order.filter(c=>colAllowed(c)&&!COLS.hidden.includes(c));

/* ===================== MULTI-SELECT DROPDOWNS ===================== */
// One component for departments, divisions, designations and people, in the table, on the bill page and in filters.
function msOptions(field,b){
  if(field==='departments') return CONFIG.departments.map(d=>({v:d.id,l:d.name,c:d.color}));
  if(field==='designations') return CONFIG.designations.map(d=>({v:d.id,l:d.name,t:d.full}));
  if(field==='assignees') return PEOPLE.map(p=>({v:p,l:p}));
  if(field==='divisions'){
    const depts=b?deptsOf(b):FLT.dept;
    const list=depts&&depts.length?CONFIG.divisions.filter(d=>depts.includes(d.dept)):(b?[]:CONFIG.divisions);
    return list.map(d=>({v:d.id,l:d.name,g:deptName(d.dept),c:deptColor(d.dept)}));
  }
  if(field==='priority') return CONFIG.priorities.map(p=>({v:p.id,l:p.name,c:p.color}));
  return [];
}
function msLabel(field,v){if(field==='departments')return deptName(v);if(field==='divisions')return divName(v);if(field==='priority')return priName(v);return v}
function msColor(field,v){if(field==='departments')return deptColor(v);if(field==='divisions'){const d=divById(v);return d?deptColor(d.dept):''}if(field==='priority')return priColor(v);return ''}
function msHTML(field,key,selected,editable,ph){
  const chips=selected.length?selected.map(v=>{const c=msColor(field,v);return `<span class="chip">${c?`<span class="dot" style="--c:${c}"></span>`:''}${esc(msLabel(field,v))}</span>`}).join(''):`<span class="ph">${esc(editable?(ph||'Choose…'):'—')}</span>`;
  return `<div class="ms ${editable?'':'ro'}" data-ms="${field}" data-key="${esc(key)}"><button type="button" ${editable?'aria-haspopup="true" aria-expanded="false"':'tabindex="-1" aria-disabled="true"'} aria-label="${esc(COLDEFS[field]?COLDEFS[field].label:field)}">${chips}</button></div>`;
}
let openMS=null;
// Popovers sit above everything (fixed), so a dropdown inside the scrolling table isn't cut off.
function placePop(pop,btn,alignRight){
  const r=btn.getBoundingClientRect(); pop.style.position='fixed';
  const w=Math.min(pop.offsetWidth||300,innerWidth-16);
  let left=alignRight?r.right-w:r.left; left=Math.max(8,Math.min(left,innerWidth-w-8));
  const below=innerHeight-r.bottom-12, above=r.top-12, h=Math.min(pop.scrollHeight,340);
  if(below<Math.min(h,220)&&above>below){pop.style.top='auto';pop.style.bottom=(innerHeight-r.top+4)+'px';pop.style.maxHeight=Math.min(340,above)+'px'}
  else{pop.style.bottom='auto';pop.style.top=(r.bottom+4)+'px';pop.style.maxHeight=Math.min(340,Math.max(160,below))+'px'}
  pop.style.left=left+'px';pop.style.right='auto';
}
window.addEventListener('scroll',()=>{if(openMS&&!openMS.pop.contains(document.activeElement))closeMS()},{passive:true});
document.addEventListener('scroll',e=>{if(openMS&&e.target!==openMS.pop&&!openMS.pop.contains(e.target)&&e.target!==document)closeMS()},true);
function closeMS(){if(openMS){openMS.pop.remove();openMS.btn.setAttribute('aria-expanded','false');const done=openMS.onClose;openMS=null;done&&done()}}
document.addEventListener('click',e=>{if(openMS&&!openMS.wrap.contains(e.target)&&!openMS.pop.contains(e.target))closeMS()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&openMS){const b=openMS.btn;closeMS();b.focus()}});
function bindMS(root){
  root.querySelectorAll('.ms:not(.ro)>button').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();const wrap=btn.parentElement;if(openMS&&openMS.wrap===wrap){closeMS();return}closeMS();
    const field=wrap.dataset.ms,key=wrap.dataset.key;
    const isFilter=key.startsWith('flt:');
    const b=isFilter?null:BYKEY[key];
    let sel=isFilter?(FLT[key.slice(4)]||[]).slice():(field==='departments'?deptsOf(b):field==='divisions'?divsOf(b):field==='designations'?desigOf(b):assignOf(b)).slice();
    const opts=msOptions(field,b);
    const pop=document.createElement('div');pop.className='ms-pop';pop.setAttribute('role','group');
    let html='',lastG=null;
    if(field==='divisions'&&b&&!deptsOf(b).length) html+=`<div class="none">Choose a department first. The divisions in that department will show up here.</div>`;
    for(const o of opts){if(o.g&&o.g!==lastG){html+=`<div class="grp">${esc(o.g)}</div>`;lastG=o.g}
      html+=`<label title="${esc(o.t||'')}"><input type="checkbox" value="${esc(o.v)}" ${sel.includes(o.v)?'checked':''}>${o.c?`<span class="dot" style="--c:${o.c}"></span>`:''}${esc(o.l)}</label>`}
    if(!opts.length&&field==='assignees') html+=`<div class="none">No people yet. An admin can add names on the Admin page.</div>`;
    if(b&&field==='divisions'&&b.sug.length){const s=b.sug.filter(x=>!sel.includes(x));if(s.length)html+=`<div class="grp">Suggested from the bill text</div>`+s.map(x=>`<label><input type="checkbox" value="${esc(x)}" data-sugg="1"><span class="dot" style="--c:${msColor('divisions',x)}"></span>${esc(divName(x))} <span class="tiny muted">(${esc(deptName((divById(x)||{}).dept))})</span></label>`).join('')}
    html+=`<div class="foot"><button type="button" class="linkbtn small" data-clear>Clear</button><button type="button" class="btn sm" data-done>Done</button></div>`;
    pop.innerHTML=html;document.body.appendChild(pop);placePop(pop,btn);btn.setAttribute('aria-expanded','true');
    let dirty=false;
    pop.addEventListener('change',ev=>{const cb=ev.target;if(cb.type!=='checkbox')return;const v=cb.value;
      if(cb.checked){if(!sel.includes(v))sel.push(v)}else sel=sel.filter(x=>x!==v);
      pop.querySelectorAll(`input[value="${CSS.escape(v)}"]`).forEach(x=>x.checked=cb.checked);dirty=true;preview()});
    pop.querySelector('[data-clear]').onclick=()=>{sel=[];pop.querySelectorAll('input').forEach(x=>x.checked=false);dirty=true;preview()};
    pop.querySelector('[data-done]').onclick=()=>{const b2=btn;closeMS();b2.focus()};
    const preview=()=>{btn.innerHTML=sel.length?sel.map(v=>{const c=msColor(field,v);return `<span class="chip">${c?`<span class="dot" style="--c:${c}"></span>`:''}${esc(msLabel(field,v))}</span>`}).join(''):`<span class="ph">Choose…</span>`};
    openMS={wrap,btn,pop,onClose:async()=>{
      if(!dirty)return;
      if(isFilter){FLT[key.slice(4)]=sel;PAGE=1;route();return}
      const patch={[field]:sel};
      if(field==='divisions'){ // a suggested division from another department brings its department along
        const need=[...new Set(sel.map(x=>(divById(x)||{}).dept).filter(Boolean))].filter(d=>!deptsOf(b).includes(d));
        if(need.length&&canEdit('departments'))patch.departments=[...deptsOf(b),...need];
      }
      if(field==='departments'){const keep=divsOf(b).filter(x=>sel.includes((divById(x)||{}).dept));if(keep.length!==divsOf(b).length&&canEdit('divisions'))patch.divisions=keep}
      if(await saveBill(b,patch)){toast(`${b.num?shortNum(b.num):'Bill file'}: ${COLDEFS[field]?COLDEFS[field].label.toLowerCase():field} saved`)}
      route(true);
    }};
    const first=pop.querySelector('input');first&&first.focus();
  });
}

/* ===================== SHELL ===================== */
const billHref=b=>b.file?`#bill-${b.session}-F-${b.tid}`:`#bill-${b.session}-${b.num}`;
const billLabel=b=>b.file?'Bill file':shortNum(b.num);
function shell(active,inner,compact){
  const S=UI.session, bills=BILLS[S]||[], files=FILES[S]||[];
  const u=new Date(INDEX.updated), nu=nextUpdate();
  const wk=meetings(S).filter(m=>m.d&&m.d>=TODAY&&(m.d-TODAY)/864e5<7);
  const wkBills=new Set(wk.flatMap(m=>m.bills.map(b=>b.key))).size;
  const tracked=ME?allRows(S).filter(onOffice):[];
  const changed=(ME?tracked:bills).filter(changedToday).length;
  let sum=`<b>${bills.length.toLocaleString()}</b> numbered bill${bills.length===1?'':'s'} in the ${esc(sessName(S))}`;
  if(files.length) sum+=` and <b>${files.length.toLocaleString()}</b> bill file${files.length===1?'':'s'} still waiting for a number`;
  sum+='. ';
  sum+=wk.length?`<b>${wk.length}</b> committee meeting${wk.length===1?' is':'s are'} on the calendar this week, covering <b>${wkBills}</b> bill${wkBills===1?'':'s'}.`:`No committee meetings are on the calendar this week.`;
  if(ME) sum+=` The office is tracking <b>${tracked.length.toLocaleString()}</b>; <b>${changed}</b> changed today.`;
  else if(changed) sum+=` <b>${changed}</b> changed today.`;
  const fine=ME?`Live data from the Utah Legislature, rechecked weekdays at about 6:40 a.m., 12:40 p.m., 5:25 p.m. and 7:40 p.m.${nu?` Next check: ${ymd(nu)===todayStr?'today':WD[nu.getDay()]} at ${fmtTime(nu)}`:''}<br>Signed in as ${esc(ME.display||ME.user)}${isAdmin()?' (admin)':''}: departments, divisions, designations${canSee('priority')?', priorities':''}${canSee('note')?', notes':''} and assignments are shared with the office.`
    :`Live data from the Utah Legislature, rechecked weekdays at about 6:40 a.m., 12:40 p.m., 5:25 p.m. and 7:40 p.m. You’re browsing as a guest: every bill, hearing and budget figure here is public. <a href="/login?next=${encodeURIComponent('/'+location.hash)}">Sign in</a> to see the office’s departments, designations and notes. Nothing you change as a guest is saved.`;
  const tabs=[['updates','Updates'],['bills','Bills'],['hearings','Hearings'],['legislators','Legislators'],['budget','Budget'],['watchlist','Watch list']];
  if(isAdmin()) tabs.push(['admin','Admin']);
  return `<header class="mast gut"><div class="wrap">
   <div class="mast-top"><a class="brand" href="#updates">${BEE}<h1>Deseret Docket</h1></a>
    <div class="who"><select id="sessSel" aria-label="Session">${INDEX.sessions.map(s=>`<option value="${s.id}" ${s.id===S?'selected':''}>${esc(sessName(s.id))}</option>`).join('')}</select>
     ${ME?`<a class="user" href="#account">${esc(ME.display||ME.user)}</a><a href="/logout" class="small">Sign out</a>`:`<span class="guest">Guest view</span><a class="btn sm" href="/login?next=${encodeURIComponent('/'+location.hash)}">Sign in</a>`}</div></div>
   <div class="live">Updated <b>${fmtAP(u)}</b></div>
   ${compact?'':`<p class="summary">${sum}</p>
   <p class="fine">${fine}</p>`}
   <nav class="tabs" aria-label="Sections">${tabs.map(([h,l])=>`<a href="#${h}" class="${active===h?'on':''}" ${active===h?'aria-current="page"':''}>${l}</a>`).join('')}</nav>
  </div></header><main class="gut"><div class="wrap">${inner}</div></main>`;
}

/* ===================== CELLS ===================== */
function sponsorCell(b,house){
  let name='',chief=false;
  if(b.spH===house){name=b.sponsor;chief=true}else if(b.flH===house){name=b.floor}
  if(!name) return '<span class="muted">—</span>';
  const clean=name.replace(/^(Rep|Sen)\.\s*/,'');
  return chief?`<span class="chief" title="Chief sponsor">${esc(clean)}</span><span class="chief-tag">Chief sponsor</span>`:`<span title="Floor sponsor">${esc(clean)}</span><span class="chief-tag">Floor sponsor</span>`;
}
function fnCost(b){const f=b.fn;if(!f||!f.net)return null;return {on:-f.net[0],one:-f.net[1]}}
function fiscalCell(b){
  if(b.file) return '<span class="muted">—</span>';
  const f=b.fn; if(!f) return '<span class="sub">No fiscal note yet</span>';
  if(f.none) return '<span class="sub">No direct cost to the state</span>';
  const c=fnCost(b); const parts=[];
  if(c){if(c.on)parts.push(`${money(Math.abs(c.on))} ongoing`);if(c.one)parts.push(`${money(Math.abs(c.one))} one-time`)}
  const exp=(f.exp&&f.exp.tot)||[];
  if(!parts.length&&exp.some(x=>x)) parts.push(`${money(Math.max(...exp))} a year (all funds)`);
  if(!parts.length) return '<span class="sub">No General Fund impact</span>';
  const isRev=c&&(c.on<0||c.one<0)&&!(c.on>0||c.one>0);
  return `<div>${parts.map(esc).join('<br>')}</div><div class="sub">${isRev?'Revenue to':'Cost to'} the General/Education Funds${f.ag&&f.ag.length?' · '+esc(f.ag[0]):''}</div>`;
}
function hearingCell(b){const h=nextHearing(b);if(!h)return '<span class="muted">—</span>';return `<span ${soon(h)?'class="pill new"':''}>${WD[h.d.getDay()].slice(0,3)} ${fmtMD(h.d)}</span><div class="sub">${fmtTime(h.d)}</div>`}
function tagsFor(b){const t=[];
  if(changedToday(b)) t.push('<span class="pill new">Changed today</span>');
  if(b.agm) t.push(`<span class="pill solid" title="The Attorney General came up ${b.agm} time${b.agm>1?'s':''} in hearing or floor transcripts">AG mentioned</span>`);
  if(b.vd&&b.vd.at&&b.vd.at.slice(0,10)>=ymd(new Date(Date.now()-3*864e5))) t.push('<span class="pill ink">New version</span>');
  if(matchesFor(b).length) t.push('<span class="pill muted">Watch list</span>');
  return t.length?`<div class="tags">${t.join('')}</div>`:''}
function priCell(b){
  const p=priOf(b);
  if(canEdit('priority')) return `<select data-pri="${esc(b.key)}" aria-label="Office priority for ${esc(billLabel(b))}" style="min-height:32px;padding:3px 6px;font-size:13.5px"><option value="">—</option>${CONFIG.priorities.map(x=>`<option value="${x.id}" ${p===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`;
  return p?`<span class="pri" style="--c:${priColor(p)}">${esc(priName(p))}</span>`:'<span class="muted">—</span>';
}
function suggHTML(b){
  if(!canEdit('divisions')||divsOf(b).length||!b.sug.length) return '';
  return `<div class="sugg"><span class="tiny muted">Suggested:</span>${b.sug.map(x=>`<button type="button" data-sug="${esc(b.key)}|${esc(x)}" title="${esc(deptName((divById(x)||{}).dept))}">${esc(divName(x))}</button>`).join('')}</div>`;
}
const CELL={
  position:posCell,
  num:b=>b.file?`<a class="billnum" href="${billHref(b)}" style="font-size:14px">${esc(fileStatus(b))}</a><span class="filelabel">No number yet</span>`:`<a class="billnum" href="${billHref(b)}">${esc(billLabel(b))}</a>`,
  priority:priCell,
  title:b=>{const o=outcome(b);return `<div class="btitle">${esc(b.title)}${o?` <span class="pill ${o.k}">${esc(o.l)}</span>`:''}</div>${tagsFor(b)}`},
  summary:b=>b.file?'<span class="sub">The Legislature publishes only the title until a bill is numbered.</span>':`<div class="clamp">${esc(b.description||'—')}</div>`,
  departments:b=>msHTML('departments',b.key,deptsOf(b),canEdit('departments')),
  committee:b=>esc(committeeOf(b))||'<span class="muted">—</span>',
  house:b=>sponsorCell(b,'H'), senate:b=>sponsorCell(b,'S'),
  action:b=>`${esc(b.act||'—')}<div class="sub">${esc(b.own||'')}${b.date?', '+fmtMD(b.date):''}</div>`,
  fiscal:fiscalCell, hearing:hearingCell,
  designations:b=>msHTML('designations',b.key,desigOf(b),canEdit('designations')),
  assignees:b=>msHTML('assignees',b.key,assignOf(b),canEdit('assignees'),'Assign…'),
  notes:b=>{const n=noteOf(b);return `${n?`<div class="clamp small">${esc(n)}</div>`:''}${canEdit('note')?`<button type="button" class="linkbtn small" data-note="${esc(b.key)}">${n?'Edit':'Add a note'}</button>`:(n?'':'<span class="muted">—</span>')}`},
  agAction:agActCell,
  divisions:b=>msHTML('divisions',b.key,divsOf(b),canEdit('divisions'),deptsOf(b).length?'Choose…':'Department first')+suggHTML(b),
};
const fileStatus=b=>{const s=(b.act||'').trim();if(!s||/^in process$/i.test(s))return 'File open';if(/abandon/i.test(s))return 'Abandoned';return s.replace(/\b\w/,c=>c.toUpperCase())};
function posCell(b){
  const p=posOf(b);
  if(canEdit('position')) return `<select data-pos="${esc(b.key)}" aria-label="Position on ${esc(billLabel(b))}" class="possel" style="--c:${p?posColor(p):'var(--field)'}"><option value="">—</option>${(CONFIG.positions||[]).map(x=>`<option value="${x.id}" ${p===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select>`;
  return p?`<span class="pos" style="--c:${posColor(p)}">${esc(posName(p))}</span>`:'<span class="muted">—</span>';
}
function agActCell(b){
  const t=agActOf(b), auto=b.agd||[];
  let h=t?`<div class="clamp small">${esc(t)}</div>`:'';
  if(!t&&auto.length) h+=`<div class="small clamp">${esc(auto[0][1])}</div><div class="sub">From the bill text${auto.length>1?` · ${auto.length} places`:''}</div>`;
  if(!t&&!auto.length) h+=`<span class="muted">—</span>`;
  if(canEdit('agAction')) h+=`<div><button type="button" class="linkbtn small" data-agact="${esc(b.key)}">${t?'Edit':'Write it up'}</button></div>`;
  return h;
}
const POS_RANK={'priority-oppose':0,oppose:1,'priority-support':2,support:3,neutral:4};
const PRI_RANK={high:0,priority:1,watching:2,notrelevant:4};
const SORTS={
  position:(a,b)=>(POS_RANK[posOf(a)]??9)-(POS_RANK[posOf(b)]??9),
  agAction:(a,b)=>((agActOf(a)||(a.agd.length?'~':''))?0:1)-((agActOf(b)||(b.agd.length?'~':''))?0:1)||b.agd.length-a.agd.length,
  num:(a,b)=>(a.file-b.file)||(a.num||a.title).localeCompare(b.num||b.title,undefined,{numeric:true}),
  priority:(a,b)=>(PRI_RANK[priOf(a)]??3)-(PRI_RANK[priOf(b)]??3),
  title:(a,b)=>a.title.localeCompare(b.title),
  summary:(a,b)=>(a.description||'').localeCompare(b.description||''),
  departments:(a,b)=>deptsOf(a).map(deptName).join().localeCompare(deptsOf(b).map(deptName).join())||(deptsOf(b).length-deptsOf(a).length),
  committee:(a,b)=>(committeeOf(a)||'~').localeCompare(committeeOf(b)||'~'),
  house:(a,b)=>sponKey(a,'H').localeCompare(sponKey(b,'H')),
  senate:(a,b)=>sponKey(a,'S').localeCompare(sponKey(b,'S')),
  action:(a,b)=>(b.date||0)-(a.date||0),
  fiscal:(a,b)=>costKey(b)-costKey(a),
  hearing:(a,b)=>((nextHearing(a)||{}).d||9e15)-((nextHearing(b)||{}).d||9e15),
  designations:(a,b)=>desigOf(b).length-desigOf(a).length||desigOf(a).join().localeCompare(desigOf(b).join()),
  assignees:(a,b)=>(assignOf(a)[0]||'~').localeCompare(assignOf(b)[0]||'~'),
  notes:(a,b)=>(noteOf(a)?0:1)-(noteOf(b)?0:1),
  divisions:(a,b)=>(divsOf(a).map(divName)[0]||'~').localeCompare(divsOf(b).map(divName)[0]||'~'),
};
const sponKey=(b,h)=>((b.spH===h?b.sponsor:b.flH===h?b.floor:'')||'~').replace(/^(Rep|Sen)\.\s*/,'');
const costKey=b=>{const c=fnCost(b);return c?Math.abs(c.on)+Math.abs(c.one):-1};

/* ===================== BILLS ===================== */
const FLT=lsGet('docket-flt-v5',null)||{show:null,dept:[],desig:[],pri:[],div:[],sponsor:'',find:'',sort:{col:'num',dir:1}};
FLT.pos=FLT.pos||'';
let PAGE=1;
const saveFLT=()=>lsSet('docket-flt-v5',FLT);
function showOptions(){
  const o=[];
  if(ME) o.push(['office','Office list',onOffice]);
  if(ME) o.push(['mine','Assigned to me',mineAssigned]);
  o.push(['all','Every bill and bill file',()=>true],['numbered','Numbered bills',b=>!b.file],['files','Bill files (not numbered)',b=>b.file],
    ['changed','Changed today',changedToday],['week','Hearing in the next 7 days',b=>{const h=nextHearing(b);return h&&(h.d-TODAY)/864e5<7}],
    ['newver','New version in the last 7 days',b=>b.vd&&b.vd.at&&b.vd.at.slice(0,10)>=ymd(new Date(Date.now()-7*864e5))],
    ['fiscal','Has a cost in its fiscal note',b=>{const c=fnCost(b);return c&&(c.on>0||c.one>0)}],
    ['agm','AG mentioned in a hearing',b=>b.agm>0],['agduty','Gives the AG office something to do',b=>b.agd.length>0||!!agActOf(b)],['passed','Passed',b=>(outcome(b)||{}).k==='pass'],['killed','Killed',b=>(outcome(b)||{}).k==='dead'],['cj','Criminal justice related',b=>b.cj],['watch','Matches the watch list',b=>matchesFor(b).length>0]);
  return o;
}
function filteredBills(){
  const S=UI.session; const opts=showOptions();
  if(!FLT.show||!opts.find(o=>o[0]===FLT.show)) FLT.show=ME?'office':'all';
  const f=opts.find(o=>o[0]===FLT.show)[2];
  const q=FLT.find.toLowerCase().trim().replace(/^(hb|sb|hcr|scr|hjr|sjr|hr|sr)\.?\s*(\d+)$/,(m,a,n)=>a+n.padStart(4,'0'));
  let rows=allRows(S).filter(f);
  if(ME&&FLT.show!=='office'&&FLT.show!=='mine'&&!isAdmin()&&P().scope!=='all'){} // limited accounts still see public bills
  if(FLT.dept.length) rows=rows.filter(b=>deptsOf(b).some(d=>FLT.dept.includes(d)));
  if(FLT.div.length) rows=rows.filter(b=>divsOf(b).some(d=>FLT.div.includes(d)));
  if(FLT.desig.length) rows=rows.filter(b=>desigOf(b).some(d=>FLT.desig.includes(d)));
  if(FLT.pos&&ME) rows=rows.filter(b=>(posOf(b)||'none')===FLT.pos);
  if(FLT.pri.length&&canSee('priority')) rows=rows.filter(b=>FLT.pri.includes(priOf(b)||'none'));
  if(FLT.sponsor){const id=FLT.sponsor;rows=rows.filter(b=>b.spId===id||b.flId===id||(legById(id)&&legMatchName(legById(id),b.sponsor)))}
  if(q) rows=rows.filter(b=>[agActOf(b),posName(posOf(b)),b.num,b.title,b.sponsor,b.floor,b.own,b.act,b.description,noteOf(b),deptsOf(b).map(deptName).join(' '),divsOf(b).map(divName).join(' '),desigOf(b).join(' '),assignOf(b).join(' ')].join(' ').toLowerCase().includes(q));
  const s=SORTS[FLT.sort.col]||SORTS.num; rows.sort((a,b)=>FLT.sort.dir*s(a,b)||SORTS.num(a,b));
  return rows;
}
function legMatchName(l,sp){if(!sp)return false;const last=(l.full||'').split(',')[0].trim();const house=l.house==='H'?'Rep.':'Sen.';return sp.startsWith(house)&&sp.includes(last+',')}
function billTable(rows,cols){
  return `<div class="tablewrap"><table class="bills"><thead><tr>${cols.map(c=>`<th class="c-${c} ${FLT.sort.col===c?'sorted':''}" draggable="true" data-col="${c}" aria-sort="${FLT.sort.col===c?(FLT.sort.dir>0?'ascending':'descending'):'none'}"><span class="h"><button class="sort" data-sort="${c}" title="Sort. Drag the heading to move the column.">${esc(COLDEFS[c].label)}${FLT.sort.col===c?(FLT.sort.dir>0?' ▲':' ▼'):''}</button></span></th>`).join('')}</tr></thead>
   <tbody>${rows.map(b=>`<tr>${cols.map(c=>`<td class="c-${c}">${CELL[c](b)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function colMenu(){
  const all=COLS.order.filter(colAllowed);
  return `<div class="colmenu ms" id="colMenu"><button type="button" class="btn" id="colBtn" aria-haspopup="true" aria-expanded="false" style="min-width:0">Columns</button></div>`;
}
function pageBills(){
  const S=UI.session; const rows=filteredBills(); const cols=visibleCols();
  const per=100,pages=Math.max(1,Math.ceil(rows.length/per)); PAGE=Math.min(PAGE,pages);
  const slice=rows.slice((PAGE-1)*per,PAGE*per);
  const opts=showOptions();
  const sp=FLT.sponsor&&legById(FLT.sponsor);
  return shell('bills',`<div class="card">
   <h2>Bills</h2><p class="desc">${ME?`Set a bill’s department, division and designations right in the table${canEdit('priority')?', along with its office priority':''}. Drag a column heading to move it, or use <b>Columns</b> to hide and reorder; your layout is saved to your account.`:`Every numbered bill and bill file in the ${esc(sessName(S))}. Drag a column heading to move it, or use <b>Columns</b> to hide and reorder.`} Bold sponsors are the chief sponsor; the other house’s name is the floor sponsor.</p>
   <form class="filters" id="billForm" onsubmit="return false">
    <div class="field"><label for="fShow">Show</label><select id="fShow">${opts.map(([k,l,f])=>`<option value="${k}" ${k===FLT.show?'selected':''}>${esc(l)} (${allRows(S).filter(f).length.toLocaleString()})</option>`).join('')}</select></div>
    ${ME?`<div class="field"><label for="fPos">Position</label><select id="fPos"><option value="">Any</option>${(CONFIG.positions||[]).map(p=>`<option value="${p.id}" ${FLT.pos===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}<option value="none" ${FLT.pos==='none'?'selected':''}>No position</option></select></div>`:''}
    ${ME?`<div class="field"><span class="flabel">Department</span>${msHTML('departments','flt:dept',FLT.dept,true,'Any')}</div>
    <div class="field"><span class="flabel">Division</span>${msHTML('divisions','flt:div',FLT.div,true,'Any')}</div>
    <div class="field"><span class="flabel">Designation</span>${msHTML('designations','flt:desig',FLT.desig,true,'Any')}</div>`:''}
    ${canSee('priority')?`<div class="field"><label for="fPri">Priority</label><select id="fPri"><option value="">Any</option>${CONFIG.priorities.map(p=>`<option value="${p.id}" ${FLT.pri[0]===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}<option value="none" ${FLT.pri[0]==='none'?'selected':''}>No priority</option></select></div>`:''}
    <div class="field grow"><label for="fFind">Find</label><input type="search" id="fFind" value="${esc(FLT.find)}" placeholder="HB 101, title, sponsor, committee, note…"></div>
    ${colMenu()}
    <button type="button" class="btn" id="csvBtn" title="Download the bills shown as a spreadsheet">Download .csv</button>
   </form>
   ${sp?`<p class="small">Showing bills sponsored by <b>${esc(sp.name)}</b> (${sp.house==='H'?'House':'Senate'} District ${esc(sp.district)}). <button class="linkbtn" id="clearSp">Show all sponsors</button></p>`:''}
   <p class="small muted" style="margin:0 0 10px">${rows.length?`${((PAGE-1)*per+1).toLocaleString()}–${Math.min(PAGE*per,rows.length).toLocaleString()} of ${plural(rows.length,'bill')}`:''}${textReady(S)?'':` · Loading bill text (${TEXTSTATE[S].loaded} of ${TEXTSTATE[S].total})…`}</p>
   ${rows.length?billTable(slice,cols):`<p class="empty">${FLT.show==='office'?'Nothing on the office list yet. Switch <b>Show</b> to every bill and give a bill a department, division, designation or priority to add it.':'No bills match.'}</p>`}
   ${pages>1?`<div class="pager">${PAGE>1?'<button class="btn sm" data-page="-1">Previous</button>':''}<span class="small">Page ${PAGE} of ${pages}</span>${PAGE<pages?'<button class="btn sm" data-page="1">Next</button>':''}</div>`:''}
  </div>`);
}

/* ===================== CSV (matches the office spreadsheet) ===================== */
function csvFor(rows){
  const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
  const office=!!ME;
  const head=[...(office?['Position']:[]),'Bill #','Status','Bill/Topic Title','Summary',...(office?['Department','Division']:[]),'Committee','House','Senate','Last Action and Location','Fiscal Impact',...(office?CONFIG.designations.map(d=>d.name):[]),...(office&&canSee('priority')?['Office Priority']:[]),...(office?['Assigned To']:[]),...(office&&canSee('note')?['Notes']:[]),'AG Office Action','Next Hearing','Link'];
  const spon=(b,h)=>b.spH===h?`${b.sponsor.replace(/^(Rep|Sen)\.\s*/,'')} (chief sponsor)`:b.flH===h?`${b.floor.replace(/^(Rep|Sen)\.\s*/,'')} (floor sponsor)`:'';
  const fis=b=>{if(b.file)return '';const f=b.fn;if(!f)return 'No fiscal note yet';if(f.none)return 'No direct cost to the state';const c=fnCost(b);const p=[];if(c&&c.on)p.push(`${money(Math.abs(c.on))} ongoing`);if(c&&c.one)p.push(`${money(Math.abs(c.one))} one-time`);return p.join('; ')||'No General Fund impact'};
  const lines=[head.map(q).join(',')];
  for(const b of rows){const h=nextHearing(b);
    lines.push([...(office?[posName(posOf(b))]:[]),b.file?fileStatus(b):shortNum(b.num),(outcome(b)||{}).l||'',b.title,b.description||'',...(office?[deptsOf(b).map(deptName).join('; '),divsOf(b).map(divName).join('; ')]:[]),committeeOf(b),spon(b,'H'),spon(b,'S'),`${b.act||''}${b.own?' — '+b.own:''}${b.date?' ('+fmtMDY(b.date)+')':''}`,fis(b),
      ...(office?CONFIG.designations.map(d=>desigOf(b).includes(d.id)?'X':''):[]),...(office&&canSee('priority')?[priName(priOf(b))]:[]),...(office?[assignOf(b).join('; ')]:[]),...(office&&canSee('note')?[noteOf(b)]:[]),agActOf(b)||(b.agd.length?'From the bill text: '+b.agd.map(x=>x[1]).join(' | '):''),
      h?`${fmtMDY(h.d)} ${fmtTime(h.d)} ${h.committee}`:'',location.origin+'/'+billHref(b)].map(q).join(','))}
  return '﻿'+lines.join('\r\n');
}
function downloadCSV(rows,name){
  const blob=new Blob([csvFor(rows)],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
  toast(`Downloaded ${plural(rows.length,'bill')}`);
}

/* ===================== UPDATES ===================== */
let updScope=null;
const EM_DEFAULT=()=>({email:'',daily:true,time:'07:00',days:[1,2,3,4,5],scope:ME?'office':'all',words:'',bills:'',eve:true,eveTime:'16:00',wrap:true,wrapTime:'18:00',files:true,fiscal:true});
let EM=null, EMTOKEN=null, EMLOADED=null;
function emailForm(manage){
  const e=EM; const days=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const signed=!!ME||(manage&&EMLOADED&&EMLOADED.linked);
  return `<form id="emForm" class="${manage?'':''}">
   ${manage?`<p>Settings for <b>${esc(EMLOADED.email)}</b>${EMLOADED.confirmed?'':' (not confirmed yet)'}.</p>`:`<div class="filters"><div class="field grow"><label for="emEmail">Email address</label><input type="email" id="emEmail" required value="${esc(e.email)}" placeholder="you@agutah.gov" autocomplete="email"></div></div>`}
   <div class="opt-block"><span class="flabel">On these days</span><div class="daypick" role="group" aria-label="Days">${days.map((d,i)=>`<label><input type="checkbox" data-day="${i}" ${e.days.includes(i)?'checked':''}>${d}</label>`).join('')}</div></div>
   <div class="opt-block"><label class="check"><input type="checkbox" id="emDaily" ${e.daily?'checked':''}><span><b>Daily calendar.</b> Which bills are being heard and when, for the coming week, plus new substitutes${''} and hearings added since the last email.</span></label>
    <div class="row2"><label class="small" for="emTime">Send at</label><input type="time" id="emTime" value="${e.time}" step="900"></div></div>
   <div class="opt-block"><label class="check"><input type="checkbox" id="emEve" ${e.eve?'checked':''}><span><b>The day before.</b> When and where each bill is heard tomorrow, and bills waiting on a floor calendar.</span></label>
    <div class="row2"><label class="small" for="emEveTime">Send at</label><input type="time" id="emEveTime" value="${e.eveTime}" step="900"></div></div>
   <div class="opt-block"><label class="check"><input type="checkbox" id="emWrap" ${e.wrap?'checked':''}><span><b>End of the day.</b> How each bill’s committee or floor discussion went today, from the meeting recordings: motions, votes and any mention of the Attorney General.</span></label>
    <div class="row2"><label class="small" for="emWrapTime">Send at</label><input type="time" id="emWrapTime" value="${e.wrapTime}" step="900"></div></div>
   <div class="opt-block"><label class="check"><input type="checkbox" id="emFiles" ${e.files?'checked':''}><span><b>New bill files.</b> When legislators open new bill requests, and what their titles say is in them. Useful before bills are numbered.</span></label></div>
   <div class="opt-block"><label class="check"><input type="checkbox" id="emFiscal" ${e.fiscal?'checked':''}><span><b>Fiscal notes.</b> Mention new and updated fiscal notes, with the cost.</span></label></div>
   <div class="opt-block"><span class="flabel">Which bills</span>
    <label class="check"><input type="radio" name="emScope" value="all" ${e.scope==='all'?'checked':''}><span>Every bill on the calendar</span></label>
    <label class="check"><input type="radio" name="emScope" value="list" ${e.scope==='list'?'checked':''}><span>Only bills I list, or whose title or summary has these words</span></label>
    <div class="row2" style="display:${e.scope==='list'?'flex':'none'}" id="emListRow"><input id="emBills" value="${esc(e.bills)}" placeholder="Bills: HB 20, SB 101" style="flex:1;min-width:180px"><input id="emWords" value="${esc(e.words)}" placeholder="Words: victim, firearm" style="flex:1;min-width:180px"></div>
    ${signed?`<label class="check"><input type="radio" name="emScope" value="mine" ${e.scope==='mine'?'checked':''}><span>Bills assigned to me</span></label>
    <label class="check"><input type="radio" name="emScope" value="office" ${e.scope==='office'?'checked':''}><span>The office list</span></label>`:''}
   </div>
   <p class="small muted">Emails link to the public view of each bill, so they open without signing in, and never include the office’s departments, priorities or notes. ${manage?'':'We’ll send one email to confirm the address first.'}</p>
   <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary">${manage?'Save settings':'Sign up'}</button>${manage?'<button type="button" class="btn danger" id="emUnsub">Unsubscribe</button>':''}</div>
  </form>`;
}
function readEM(){
  const g=id=>$(id);
  return {email:g('emEmail')?g('emEmail').value.trim():EM.email,daily:g('emDaily').checked,time:g('emTime').value||'07:00',days:[...document.querySelectorAll('[data-day]')].filter(x=>x.checked).map(x=>+x.dataset.day),
    eve:g('emEve').checked,eveTime:g('emEveTime').value||'16:00',wrap:g('emWrap').checked,wrapTime:g('emWrapTime').value||'18:00',files:g('emFiles').checked,fiscal:g('emFiscal').checked,
    scope:(document.querySelector('input[name=emScope]:checked')||{}).value||'all',bills:g('emBills').value,words:g('emWords').value};
}
const emToApi=e=>({daily:e.daily,time:e.time,days:e.days,eve:e.eve,eveTime:e.eveTime,wrap:e.wrap,wrapTime:e.wrapTime,files:e.files,fiscal:e.fiscal,scope:e.scope,
  bills:e.bills.split(/[,;\s]+(?=[A-Za-z])/).map(s=>s.replace(/\s+/g,'')).filter(Boolean),words:e.words.split(/[,;]/).map(s=>s.trim()).filter(Boolean)});
const emFromApi=o=>({...EM_DEFAULT(),...o,bills:(o.bills||[]).map(shortNum).join(', '),words:(o.words||[]).join(', ')});
function updateRows(items){
  return `<div class="rows">${items.map(({b,c})=>`<div class="row"><a class="k" href="${billHref(b)}">${esc(billLabel(b))}</a>
   <div class="what">${esc(c[2])}<span class="sub">${esc(b.title)}${b.file?'':' · '+esc(b.sponsor)}</span></div>
   <div class="r">${priOf(b)?`<span class="pri" style="--c:${priColor(priOf(b))}">${esc(priName(priOf(b)))}</span>`:''}<span class="pill ${c[1]==='AG mentioned'?'solid':c[1]==='New bill file'?'muted':'new'}">${esc(c[1])}</span><span class="small muted">${fmtTime(pd(c[0]))}</span></div></div>`).join('')}</div>`;
}
function pageUpdates(){
  const S=UI.session; if(!updScope) updScope=ME?'office':'all';
  const pool=allRows(S).filter(b=>updScope==='office'?onOffice(b)&&priOf(b)!=='notrelevant':updScope==='mine'?mineAssigned(b):true);
  const items=pool.flatMap(b=>b.ch.filter(c=>c[0].slice(0,10)===todayStr&&c[1]!=='New bill file').map(c=>({b,c}))).sort((x,y)=>y.c[0].localeCompare(x.c[0]));
  const wkAgo=ymd(new Date(Date.now()-7*864e5));
  const newFiles=(FILES[S]||[]).filter(f=>(f.seen||'').slice(0,10)>=wkAgo).sort((a,b)=>b.seen.localeCompare(a.seen));
  if(!EM) EM=EM_DEFAULT();
  const seg=ME?`<div class="seg" role="group" aria-label="Whose bills">${[['office','Office list'],['mine','Assigned to me'],['all','All bills']].map(([k,l])=>`<button type="button" data-upd="${k}" class="${updScope===k?'on':''}" aria-pressed="${updScope===k}">${l}</button>`).join('')}</div>`:'';
  const csvRows=ME?allRows(S).filter(onOffice):allRows(S);
  return shell('updates',`
   <div class="card"><div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:240px"><h2>Today’s updates</h2>
    <p class="desc">${items.length?`${plural(items.length,'change')} today, newest first. This list starts fresh at midnight; every bill’s page keeps its full history.`:`Nothing ${updScope==='all'?'':'on this list '}has changed yet today. This list starts fresh at midnight; every bill’s page keeps its full history.`}</p></div>${seg}</div>
    ${items.length?updateRows(items.slice(0,300)):''}${items.length>300?`<p class="small muted">Showing the newest 300.</p>`:''}</div>
   ${newFiles.length?`<div class="card"><h2>New bill files</h2><p class="desc">Bill requests opened in the last 7 days. Until a bill is numbered, the Legislature publishes only its title and sponsor.</p>
    <div class="rows">${newFiles.slice(0,60).map(b=>`<div class="row"><a class="k" href="${billHref(b)}">Bill file</a><div class="what">${esc(b.title)}<span class="sub">${esc(b.sponsor)} · ${esc(b.act)}</span></div><div class="r">${b.sug.slice(0,1).map(x=>`<span class="pill muted">${esc(divName(x))}</span>`).join('')}<span class="small muted">${fmtMD(pd(b.seen))}</span></div></div>`).join('')}</div>
    ${newFiles.length>60?`<p class="small"><a href="#bills" data-goshow="files">See all ${newFiles.length}</a></p>`:''}</div>`:''}
   <div class="grid2" style="align-items:start">
    <div class="card"><h2>Get updates by email</h2><p class="desc">Pick what you want and when. Each email focuses on what’s on the calendar and when it meets.</p>${emailForm(false)}</div>
    <div class="card"><h2>Spreadsheet</h2><p class="desc">${ME?`Download the office list (${plural(csvRows.length,'bill')}) with the same columns as the office’s Excel tracker: bill, title, summary, department, division, committee, House and Senate sponsors, last action, fiscal impact, one column for each designation, office priority, assignments and notes.`:`Download every bill and bill file (${csvRows.length.toLocaleString()}) with bill, title, summary, committee, House and Senate sponsors, last action, fiscal impact and next hearing. Sign in to include the office’s columns.`}</p>
     <button class="btn primary" id="csvAll">Download .csv</button><p class="small muted" style="margin-top:12px">Opens in Excel, Numbers or Google Sheets. To download a filtered set, use the Bills tab.</p></div>
   </div>`);
}
function pageEmail(token){
  if(token==='invalid') return shell('updates',`<div class="card"><h2>That link didn’t work</h2><p class="desc">It may have expired or been used to unsubscribe. Sign up again on the <a href="#updates">Updates</a> tab.</p></div>`);
  if(token==='unsubscribed') return shell('updates',`<div class="card"><h2>You’re unsubscribed</h2><p class="desc">No more Deseret Docket emails will go to that address. You can sign up again any time on the <a href="#updates">Updates</a> tab.</p></div>`);
  if(EMTOKEN!==token){EMTOKEN=token;EMLOADED=null;fetch('/api/sub?t='+encodeURIComponent(token)).then(r=>r.json().then(j=>({ok:r.ok,j}))).then(({ok,j})=>{EMLOADED=ok?j:{error:j.error||'Not found'};if(ok)EM=emFromApi(j.opts);route(true)}).catch(()=>{EMLOADED={error:'The settings didn’t load.'};route(true)})}
  if(!EMLOADED) return shell('updates',`<div class="card"><p>Loading your email settings…</p></div>`);
  if(EMLOADED.error) return shell('updates',`<div class="card"><h2>That link didn’t work</h2><p class="desc">${esc(EMLOADED.error)}</p></div>`);
  return shell('updates',`<div class="card" style="max-width:760px"><h2>${EMLOADED.justConfirmed===false?'':'Your email settings'}</h2><p class="desc">${EMLOADED.confirmed?'You’re confirmed. Change anything below and save.':'Confirm from the email we sent, or save here.'}</p>${emailForm(true)}</div>`);
}

/* ===================== HEARINGS ===================== */
let hearScope=null;
function pageHearings(){
  const S=UI.session; if(!hearScope) hearScope=ME?'office':'all';
  const filt=b=>hearScope==='office'?onOffice(b)&&priOf(b)!=='notrelevant':hearScope==='mine'?mineAssigned(b):hearScope==='watch'?matchesFor(b).length>0:true;
  const hs=meetings(S,filt).filter(h=>h.d&&h.d>=TODAY).sort((a,b)=>a.d-b.d);
  // two office bills heard at the same time in different rooms need two people
  const conflicts=[];
  if(ME){const imp=b=>['high','priority'].includes(priOf(b))||(!canSee('priority')&&onOffice(b));
    const up=meetings(S,b=>onOffice(b)&&imp(b)).filter(h=>h.d&&h.d>=TODAY);
    for(let i=0;i<up.length;i++)for(let j=i+1;j<up.length;j++){const a=up[i],b=up[j];
      if(a.committee!==b.committee&&ymd(a.d)===ymd(b.d)&&Math.abs(a.d-b.d)<=90*60e3)conflicts.push([a,b])}}
  const seg=`<div class="seg" role="group" aria-label="Which bills">${[...(ME?[['office','Office list'],['mine','Assigned to me']]:[]),['watch','Watch list'],['all','All bills']].map(([k,l])=>`<button type="button" data-hear="${k}" class="${hearScope===k?'on':''}" aria-pressed="${hearScope===k}">${l}</button>`).join('')}</div>`;
  let last=null;
  const body=hs.map(h=>{const d=ymd(h.d);const head=d!==last?`<h3 style="margin:22px 0 4px">${WD[h.d.getDay()]}, ${fmtLong(h.d)}</h3>`:'';last=d;
    return head+`<div class="hearing"><div class="when"><b>${fmtTime(h.d)}</b><span>${esc(h.place)}</span></div><div><h4>${esc(h.committee)}</h4>
     ${h.bills.map(b=>`<div class="hb"><a class="billnum" href="${billHref(b)}">${esc(shortNum(b.num))}</a><span class="serif">${esc(b.title)}</span>${priOf(b)?`<span class="pri" style="--c:${priColor(priOf(b))}">${esc(priName(priOf(b)))}</span>`:''}${assignOf(b).map(a=>`<span class="chip">${esc(a)}</span>`).join('')}${b.agm?'<span class="pill solid">AG mentioned</span>':''}</div>`).join('')}
     ${h.url?`<a class="small" href="${esc(h.url)}" target="_blank" rel="noopener">Agenda on le.utah.gov</a>`:''}</div></div>`}).join('');
  return shell('hearings',`<div class="card"><div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:240px"><h2>Hearings</h2>
   <p class="desc">Committee agendas with these bills, soonest first. Meetings within three days are marked on the Bills tab.</p></div>${seg}</div>
   ${conflicts.length?conflicts.map(([a,b])=>`<div class="conflict"><b>Two at once:</b> ${a.bills.filter(onOffice).map(x=>esc(shortNum(x.num))).join(', ')} in ${esc(a.committee)} (${fmtTime(a.d)}) and ${b.bills.filter(onOffice).map(x=>esc(shortNum(x.num))).join(', ')} in ${esc(b.committee)} (${fmtTime(b.d)}) on ${WD[a.d.getDay()]}, ${fmtLong(a.d)}. ${[...new Set([...a.bills,...b.bills].flatMap(assignOf))].length?'Assigned: '+esc([...new Set([...a.bills,...b.bills].flatMap(assignOf))].join(', '))+'.':'Nobody is assigned yet.'}</div>`).join(''):''}
   ${hs.length?body:`<p class="empty">No upcoming committee meetings for these bills.</p>`}</div>`);
}

/* ===================== LEGISLATORS ===================== */
let legSort='total', legHouse='all';
function pageLegislators(){
  const S=UI.session; const rows=allRows(S);
  if(!LEGS) return shell('legislators',`<div class="card"><p>Loading legislators…</p></div>`);
  const stats=LEGS.map(l=>{const chief=rows.filter(b=>!b.file&&(b.spId===l.id||(!b.spId&&legMatchName(l,b.sponsor))));const floor=rows.filter(b=>!b.file&&(b.flId===l.id||(!b.flId&&legMatchName(l,b.floor))));const files=rows.filter(b=>b.file&&legMatchName(l,b.sponsor));
    return {l,chief:chief.length,floor:floor.length,files:files.length,office:ME?[...chief,...floor,...files].filter(onOffice).length:0,total:chief.length+files.length}});
  let list=stats.filter(s=>legHouse==='all'||s.l.house===legHouse);
  const sorts={total:(a,b)=>b.total-a.total||b.floor-a.floor,floor:(a,b)=>b.floor-a.floor,files:(a,b)=>b.files-a.files,office:(a,b)=>b.office-a.office||b.total-a.total,name:(a,b)=>a.l.full.localeCompare(b.l.full),district:(a,b)=>a.l.house.localeCompare(b.l.house)||(+a.l.district)-(+b.l.district)};
  list.sort(sorts[legSort]||sorts.total);
  const max=Math.max(1,...list.map(s=>s.total));
  return shell('legislators',`<div class="card"><h2>Legislators</h2>
   <p class="desc">Who is sponsoring the most legislation this session. <b>Chief</b> counts numbered bills they’re the chief sponsor of plus their bill files that aren’t numbered yet. <b>Floor</b> counts bills they carry in the other house. Click a name to see their bills.</p>
   <div class="filters"><div class="field"><label for="legSort">Sort by</label><select id="legSort">${[['total','Most bills'],['floor','Most floor sponsorships'],['files','Most unnumbered bill files'],...(ME?[['office','Most on the office list']]:[]),['name','Name'],['district','House and district']].map(([k,l])=>`<option value="${k}" ${legSort===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="seg" role="group" aria-label="Chamber" style="align-self:flex-end">${[['all','Both'],['H','House'],['S','Senate']].map(([k,l])=>`<button type="button" data-leghouse="${k}" class="${legHouse===k?'on':''}">${l}</button>`).join('')}</div></div>
   <div class="leg head"><span></span><span>Legislator</span><span class="n">Chief</span><span class="n">Floor</span><span class="n hide-m">${ME?'Office list':'Bill files'}</span><span class="hide-m"></span></div>
   ${list.map(s=>`<div class="leg party-${s.l.party==='R'||s.l.party==='D'?s.l.party:'O'}"><span class="ini" aria-hidden="true">${esc((s.l.name||'').split(/\s+/).filter(w=>/^[A-Z]/.test(w)).map(w=>w[0]).filter((c,i,a)=>i===0||i===a.length-1).join(''))}</span><div><div class="nm"><a href="#bills" data-sponsor="${esc(s.l.id)}">${esc(s.l.name)}</a></div><div class="sub"><span class="dot"></span> ${s.l.party==='R'?'Republican':s.l.party==='D'?'Democrat':esc(s.l.party||'')} · ${s.l.house==='H'?'House':'Senate'} District ${esc(s.l.district)}</div></div>
    <span class="n"><b>${s.total}</b>${s.files?`<div class="sub">${s.files} not numbered</div>`:''}</span><span class="n">${s.floor}</span><span class="n hide-m">${ME?s.office:s.files}</span><span class="hide-m"><div class="bar"><i style="width:${(s.total/max*100).toFixed(1)}%"></i></div></span></div>`).join('')}</div>`);
}

/* ===================== BUDGET ===================== */
const PAL=['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)','var(--c6)','var(--c7)','var(--c8)','var(--c9)','var(--c10)'];
function pieSVG(items,label){
  const tot=items.reduce((s,x)=>s+x.v,0)||1; let a=-Math.PI/2; const R=100,r=58,cx=110,cy=110;
  const arc=(a0,a1)=>{const big=a1-a0>Math.PI?1:0;const p=(ang,rad)=>[cx+rad*Math.cos(ang),cy+rad*Math.sin(ang)];const [x0,y0]=p(a0,R),[x1,y1]=p(a1,R),[x2,y2]=p(a1,r),[x3,y3]=p(a0,r);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${big} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}A${r} ${r} 0 ${big} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}Z`};
  const paths=items.map((x,i)=>{const a0=a,a1=a+(x.v/tot)*Math.PI*2*(items.length===1?.9999:1);a=a1;return `<path d="${arc(a0,a1)}" fill="${x.c}" data-i="${i}"><title>${esc(x.l)}: ${money(x.v)} (${(x.v/tot*100).toFixed(1)}%)</title></path>`}).join('');
  return `<svg viewBox="0 0 220 220" role="img" aria-label="${esc(label)}">${paths}<text x="110" y="104" text-anchor="middle" style="font:600 19px var(--sans);fill:var(--ink)">${money(tot,true)}</text><text x="110" y="126" text-anchor="middle" style="font:12px var(--sans);fill:var(--muted)">total</text></svg>`;
}
function pieBlock(id,items,label,note){
  items=items.filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  if(items.length>9){const rest=items.slice(8);items=items.slice(0,8).concat([{l:`${rest.length} others`,v:rest.reduce((s,x)=>s+x.v,0),sub:rest.map(x=>x.l).join(', ')}])}
  items.forEach((x,i)=>x.c=x.c||PAL[i%PAL.length]);
  const tot=items.reduce((s,x)=>s+x.v,0);
  if(!tot) return `<p class="empty">${esc(note||'Nothing to chart yet.')}</p>`;
  return `<div class="pie-wrap" id="${id}"><div class="pie">${pieSVG(items,label)}</div><div class="legend">${items.map((x,i)=>`<div class="li" data-i="${i}" style="--c:${x.c}"><span class="sw"></span><span>${esc(x.l)}${x.sub?`<div class="sub">${esc(x.sub.slice(0,140))}${x.sub.length>140?'…':''}</div>`:''}${x.n?`<div class="sub">${esc(x.n)}</div>`:''}</span><span class="v">${money(x.v,true)}</span><span class="p">${(x.v/tot*100).toFixed(1)}%</span></div>`).join('')}</div></div>${note?`<p class="small muted" style="margin-top:10px">${note}</p>`:''}`;
}
const SUB_MAP=[[/correction|court|judicial|public safety|attorney general|pardon|juvenile|criminal|police|highway patrol|victim|indigent|prosecut|sentencing/i,'Criminal Justice'],
  [/state board of education|school|public education|charter/i,'Public Education'],[/higher education|university|college|technical/i,'Higher Education'],
  [/health and human services|medicaid|human services|health/i,'Social Services'],[/natural resources|environmental quality|agriculture|water|wildlife|forestry|parks|lands|geological/i,'Natural Resources, Agriculture, and Environmental Quality'],
  [/transportation|udot|aviation/i,'Transportation and Infrastructure'],[/workforce|commerce|economic|tourism|cultural|heritage|housing|alcoholic|financial institutions|insurance/i,'Economic and Community Development'],
  [/government operations|tax commission|treasurer|auditor|elections|lieutenant governor|governor|legislat|capitol|technology services|finance/i,'General Government']];
function subOf(b){const hay=[...((b.fn&&b.fn.ag)||[]),b.title].join(' ');for(const [re,n] of SUB_MAP)if(re.test(hay))return n;return 'Not matched to a subcommittee'}
function cjAgencyOf(b,cjRows){const hay=[...((b.fn&&b.fn.ag)||[])].join(' ')+' '+b.title;
  const keys=[[/correction/i,'Corrections'],[/court|judicial/i,'Courts'],[/public safety|highway patrol|bureau of criminal|peace officer/i,'Public Safety'],[/attorney general/i,'Attorney General'],[/pardon|parole/i,'Board of Pardons'],[/juvenile/i,'Juvenile'],[/indigent/i,'Indigent'],[/commission on criminal|ccjj|governor/i,"Governor's Office"]];
  for(const [re,k] of keys)if(re.test(hay)){const row=cjRows.find(r=>r.t.includes(k));if(row)return row.t}return 'Other or not named'}
let budView={gen:'base',cj:'base',req:'all',mtg:'cj'}, reqAll=false;
function budgetSession(){const ss=INDEX.sessions.filter(s=>s.count>0);const want=`${BUDGET&&BUDGET.fy||''}GS`;return (ss.find(s=>s.id===want)||ss[0]||{}).id}
function pageBudget(){
  if(!BUDGET){getJSON('data/budget.json').then(b=>{BUDGET=b;route(true)}).catch(()=>{BUDGET={error:true};route(true)});return shell('budget',`<div class="card"><p>Loading the budget…</p></div>`)}
  if(BUDGET.error||!BUDGET.subs) return shell('budget',`<div class="card"><h2>Budget</h2><p class="desc">The budget data hasn’t been built yet. It appears after the next weekday update.</p></div>`);
  const B=BUDGET, col=B.subs[0]?B.subs[0].v.length-1:6, hdr=(B.header||[])[col]||'Appropriation';
  const sess=`${B.fy}GS`; const S=(INDEX.sessions.find(x=>x.id===sess)||{}).count?sess:budgetSession();
  const hdrNice=hdr.replace(/^(\d{4}) Base Start$/,'FY$1 base budget').replace(/^(\d{4}) Appropriation$/,'FY$1 appropriation').replace(/^(\d{4}) Appropriated$/,'FY$1 appropriation');
  if(!BILLS[S]){loadSession(S).then(()=>route(true));return shell('budget',`<div class="card"><p>Loading fiscal notes…</p></div>`)}
  const fnBills=(BILLS[S]||[]).filter(b=>b.fn&&!b.fn.none&&fnCost(b));
  const costOf=b=>{const c=fnCost(b);return Math.max(0,c.on)+Math.max(0,c.one)};
  const costly=fnBills.filter(b=>costOf(b)>0);
  const total=B.subs.reduce((s,r)=>s+(r.v[col]||0),0);
  const fnTotal=costly.reduce((s,b)=>s+costOf(b),0);
  const genItems=budView.gen==='base'?B.subs.map(r=>({l:r.t,v:r.v[col]})):Object.entries(costly.reduce((m,b)=>{const k=subOf(b);m[k]=(m[k]||0)+costOf(b);return m},{})).map(([l,v])=>({l,v,n:`${costly.filter(b=>subOf(b)===l).length} bills`}));
  const cjBase=B.cj.map(r=>({l:r.t,v:r.v[col]}));
  const cjBills=(BILLS[S]||[]).filter(b=>b.cj&&b.fn);
  const cjCostly=cjBills.filter(b=>!b.fn.none&&fnCost(b)&&costOf(b)>0);
  const cjItems=budView.cj==='base'?cjBase:Object.entries(cjCostly.reduce((m,b)=>{const k=cjAgencyOf(b,B.cj);m[k]=(m[k]||0)+costOf(b);return m},{})).map(([l,v])=>({l,v}));
  const cjTotal=B.cj.reduce((s,r)=>s+(r.v[col]||0),0);
  let reqs=(B.requests||[]).filter(r=>r.by), reqLabel=`${B.fy} General Session`;
  if(!reqs.length&&B.requestsPrev&&B.requestsPrev.length){reqs=B.requestsPrev;reqLabel=`${B.prevFy} General Session (this session’s requests aren’t posted yet)`}
  if(budView.req==='cj') reqs=reqs.filter(r=>r.sub==='Criminal Justice');
  const reqAmt=r=>Math.abs(r.req[0]||0)+Math.abs(r.req[1]||0);
  reqs=reqs.slice().sort((a,b)=>reqAmt(b)-reqAmt(a));
  const byLeg=Object.entries(reqs.reduce((m,r)=>{m[r.by]=m[r.by]||{n:0,v:0};m[r.by].n++;m[r.by].v+=reqAmt(r);return m},{})).sort((a,b)=>b[1].v-a[1].v);
  const mtgs=(B.meetings||[]).filter(m=>m.status==='ok'&&(budView.mtg!=='cj'||m.com==='APPCRI'||/criminal/i.test(m.name))).slice(0,12);
  const vAtM=(m,vi,s)=>m.videos&&m.videos[vi]?`${m.videos[vi]}#t=${Math.max(0,Math.floor(s))}s`:m.page;
  const seg=(k,opts)=>`<div class="seg" role="group">${opts.map(([v,l])=>`<button type="button" data-bud="${k}|${v}" class="${budView[k]===v?'on':''}" aria-pressed="${budView[k]===v}">${l}</button>`).join('')}</div>`;
  return shell('budget',`
   <div class="card"><h2>How the budget is shaping up</h2>
    <p class="desc">The state budget from the Legislature’s Compendium of Budget Information (COBI), the costs in this session’s fiscal notes, the requests legislators have made, and what’s being said about money in appropriations meetings.</p>
    <div class="stat3"><div><span>State budget, ${esc(hdrNice)}</span><b>${money(total,true)}</b></div><div><span>Criminal justice share</span><b>${money(cjTotal,true)}</b></div><div><span>${esc(sessName(S))} fiscal notes with a cost${S!==sess?' (no '+B.fy+' bills numbered yet)':''}</span><b>${costly.length}</b></div><div><span>Their combined cost</span><b>${money(fnTotal,true)}</b></div></div>
    <p class="small muted" style="margin:0">Budget figures are COBI’s operating and capital budgets plus expendable funds. Fiscal-note costs are General, Income Tax and Uniform School Fund amounts (ongoing plus one-time) from each bill’s latest fiscal note; a fiscal note isn’t an appropriation.</p></div>
   <div class="grid2">
    <div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><h2>General budget</h2><p class="desc">${budView.gen==='base'?`By appropriations subcommittee, ${esc(hdrNice)}.`:`Fiscal-note costs by the subcommittee the agency belongs to.`}</p></div>${seg('gen',[['base','Budget'],['fn','Fiscal notes']])}</div>
     ${pieBlock('pieGen',genItems,'General budget',budView.gen==='fn'?'Matched to a subcommittee by the agency named in each fiscal note.':'')}</div>
    <div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><h2>Law enforcement and criminal justice</h2><p class="desc">${budView.cj==='base'?`Criminal Justice subcommittee agencies, ${esc(hdrNice)}.`:`Fiscal-note costs on criminal justice bills, by agency.`}</p></div>${seg('cj',[['base','Budget'],['fn','Fiscal notes']])}</div>
     ${pieBlock('pieCj',cjItems,'Criminal justice budget')}</div>
   </div>
   <div class="card"><h2>Criminal justice fiscal notes</h2><p class="desc">Every criminal justice bill in the ${esc(sessName(S))} with a fiscal note (${cjBills.length}), largest cost first.</p>
    ${cjBills.length?`<div class="tablewrap"><table class="compact" style="min-width:760px"><thead><tr><th style="padding-left:12px">Bill</th><th>Title</th><th style="text-align:right">Ongoing</th><th style="text-align:right">One-time</th><th>Agency</th><th>Where it is</th></tr></thead><tbody>
     ${cjBills.slice().sort((a,b)=>(fnCost(b)?costOf(b):-1)-(fnCost(a)?costOf(a):-1)).map(b=>{const c=fnCost(b);return `<tr><td style="padding-left:12px"><a class="billnum" href="${billHref(b)}">${esc(shortNum(b.num))}</a></td><td class="serif">${esc(b.title)}</td><td style="text-align:right">${b.fn.none||!c?'—':money(Math.abs(c.on))}</td><td style="text-align:right">${b.fn.none||!c?'—':money(Math.abs(c.one))}</td><td class="small">${esc((b.fn.ag||[])[0]||'')}</td><td class="small">${esc(b.act)}</td></tr>`}).join('')}</tbody></table></div>`:`<p class="empty">No criminal justice fiscal notes yet.</p>`}</div>
   <div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><h2>Legislator requests</h2><p class="desc">Requests for appropriation from the ${esc(reqLabel)}, largest first, with what the subcommittee prioritized and what was appropriated.</p></div>${seg('req',[['all','All'],['cj','Criminal Justice']])}</div>
    ${byLeg.length?`<div class="small" style="margin-bottom:12px"><b>Most requested:</b> ${byLeg.slice(0,6).map(([n,x])=>`${esc(n)} (${x.n}, ${money(x.v,true)})`).join(' · ')}</div>`:''}
    ${reqs.length?`<div class="tablewrap"><table class="compact" style="min-width:900px"><thead><tr><th style="padding-left:12px">Requested by</th><th>Request</th><th>Agency</th><th style="text-align:right">Requested</th><th style="text-align:right">Prioritized</th><th style="text-align:right">Appropriated</th></tr></thead><tbody>
     ${reqs.slice(0,reqAll?400:25).map(r=>`<tr><td style="padding-left:12px;white-space:nowrap">${esc(r.by)}</td><td><span class="serif">${esc(r.name.replace(/\s*\([HS]AR\d+\)\s*$/,''))}</span>${r.txt?`<div class="sub">${esc(r.txt.slice(0,180))}${r.txt.length>180?'…':''}</div>`:''}</td><td class="small">${esc(r.agency)}<div class="sub">${esc(r.sub)}</div></td>
      <td style="text-align:right">${money(reqAmt(r))}<div class="sub">${r.req[0]?'ongoing':'one-time'}</div></td><td style="text-align:right">${money(Math.abs(r.pri[0]||0)+Math.abs(r.pri[1]||0))}</td><td style="text-align:right">${money(Math.abs(r.app[0]||0)+Math.abs(r.app[1]||0))}</td></tr>`).join('')}</tbody></table></div>${reqs.length>25&&!reqAll?`<p><button class="btn sm" id="reqMore">Show all ${reqs.length}</button></p>`:''}`:`<p class="empty">No legislator requests posted yet.</p>`}</div>
   ${talkChart(B)}
   <div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><h2>What’s being said in appropriations meetings</h2><p class="desc">From the meeting recordings: the official timeline notes about requests, and each moment someone mentions a dollar amount. Captions are automatic and can be wrong; follow the time link to hear it.</p></div>${seg('mtg',[['cj','Criminal Justice'],['all','All subcommittees']])}</div>
    ${mtgs.length?mtgs.map((m,i)=>{const d=pd(m.date);return `<details class="disc" ${i===0?'open':''}><summary style="list-style:none;cursor:pointer"><div class="kicker">${d?fmtLong(d):''}</div><h4>${esc(m.name)}</h4><span class="small muted">${m.rfa.length?plural(m.rfa.length,'request')+' presented · ':''}${plural(m.money.length,'money mention')}</span></summary>
      <div class="links"><a href="${esc(m.page)}" target="_blank" rel="noopener">Meeting page</a>${m.agenda?`<a href="${esc(m.agenda)}" target="_blank" rel="noopener">Agenda</a>`:''}</div>
      ${m.rfa.length?`<div class="agbox" style="margin-bottom:10px"><b>Requests for appropriation</b><ul>${m.rfa.map(x=>`<li><a class="ts" href="${esc(vAtM(m,x[2],x[0]))}" target="_blank" rel="noopener">${clock(x[0])}</a><span>${esc(x[1])}</span></li>`).join('')}</ul></div>`:''}
      ${m.money.slice(0,40).map(x=>`<div class="money-moment"><a class="ts" href="${esc(vAtM(m,x[3],x[0]))}" target="_blank" rel="noopener">${clock(x[0])}</a><div>${x[1]?`<div class="ctx">${esc(x[1])}</div>`:''}${esc(x[2]).replace(/(\$\s?\d[\d,.]*\s*(?:million|billion|thousand)?|\b\d[\d,.]*\s+(?:million|billion)\b)/gi,'<mark>$1</mark>')}</div></div>`).join('')}</details>`}).join(''):`<p class="empty">No appropriations meeting transcripts yet.</p>`}</div>`);
}


// How much money talk each subcommittee's meetings have had lately, from the recordings.
function spokenAmount(t){const m=String(t).replace(/,/g,'').match(/\$?\s?(\d+(?:\.\d+)?)\s*(million|billion|thousand|k|m)?/i);if(!m)return 0;const n=+m[1],u=(m[2]||'').toLowerCase();return n*(u==='billion'?1e9:u==='million'||u==='m'?1e6:u==='thousand'||u==='k'?1e3:1)}
function talkChart(B){
  const since=ymd(new Date(Date.now()-120*864e5));
  const ms=(B.meetings||[]).filter(m=>m.status==='ok'&&(m.date||'')>=since);
  if(!ms.length) return '';
  const by={};
  for(const m of ms){const k=m.name.replace(/ Appropriations Subcommittee$/,'').replace(/ Appropriations Committee$/,'');const x=by[k]=by[k]||{n:0,amt:0,rfa:0,mt:0};x.mt++;x.n+=m.money.length;x.rfa+=m.rfa.length;for(const mm of m.money)x.amt+=Math.max(0,...(mm[4]||[]).map(spokenAmount),0)}
  const rows=Object.entries(by).sort((a,b)=>b[1].n-a[1].n); const max=Math.max(1,...rows.map(r=>r[1].n));
  return `<div class="card"><h2>Where the money talk is</h2><p class="desc">Each appropriations subcommittee’s meetings in the last four months: how often someone named a dollar amount and how many legislator requests were presented. It’s a rough gauge of where budget conversations are heading, not a tally of decisions.</p>
   ${rows.map(([k,x],i)=>`<div style="display:grid;grid-template-columns:minmax(140px,280px) minmax(0,1fr) 120px;gap:14px;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)"><div class="small"><b>${esc(k)}</b><div class="sub">${plural(x.mt,'meeting')}${x.rfa?' · '+plural(x.rfa,'request'):''}</div></div><div class="bar" style="height:14px;--c:${/criminal/i.test(k)?'var(--c1)':'var(--c9)'}"><i style="width:${(x.n/max*100).toFixed(1)}%"></i></div><div class="small" style="text-align:right"><b>${x.n}</b> money mentions</div></div>`).join('')}</div>`;
}

/* ===================== WATCH LIST ===================== */
function pageWatch(){
  const S=UI.session; const canW=ME&&(isAdmin()||P().watch);
  const row=(x,i,kind)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)"><input type="checkbox" id="wl-${kind}-${i}" ${x.on?'checked':''} data-toggle="${kind}:${i}"><label class="serif" style="flex:1;font-size:17px;${x.on?'':'color:var(--muted);text-decoration:line-through'}" for="wl-${kind}-${i}">${esc(x.t)}</label><button class="linkbtn small" data-remove="${kind}:${i}">Remove</button></div>`;
  const count=allRows(S).filter(b=>matchesFor(b).length).length;
  return shell('watchlist',`<div class="card"><h2>Watch list</h2><p class="desc">Every bill’s full text is checked against the words and Utah Code chapters below, and matches are flagged on the Bills tab. ${ME?(canW?`The office shares one watch list${WATCHMETA&&WATCHMETA.by?` (last changed by ${esc(WATCHMETA.by)})`:''}.`:'Your account can see the office’s watch list but not change it.'):'As a guest, your changes last until you leave the page and aren’t saved.'}</p>
   ${textReady(S)?'':`<p class="small muted">Still loading bill text (${TEXTSTATE[S].loaded} of ${TEXTSTATE[S].total}). Until then, matches use titles and summaries.</p>`}
   <div class="grid2"><div><h3>Words and phrases</h3><p class="small muted">Matches whole words in any capitalization, even across line breaks.</p>${W.terms.map((x,i)=>row(x,i,'terms')).join('')||'<p class="small muted">Nothing yet.</p>'}
    <form class="filters" id="addTerm" style="margin-top:12px"><div class="field grow"><input id="termIn" placeholder="e.g. deceptive trade practice" aria-label="Add a word or phrase"></div><button class="btn">Add</button></form></div>
   <div><h3>Utah Code chapters</h3><p class="small muted"><b>13</b> covers all of Title 13; <b>13-11</b> covers 13-11-1, 13-11-4.5 and so on.</p>${W.codes.map((x,i)=>row(x,i,'codes')).join('')||'<p class="small muted">Nothing yet.</p>'}
    <form class="filters" id="addCode" style="margin-top:12px"><div class="field grow"><input id="codeIn" placeholder="e.g. 77-38" aria-label="Add a Utah Code title, chapter or section"></div><button class="btn">Add</button></form></div></div>
   <hr><form id="optsForm"><label class="check"><input type="checkbox" name="struck" ${W.opts.struck?'checked':''}><span>Count language a bill strikes out of existing code</span></label>
    <label class="check"><input type="checkbox" name="defsOnly" ${W.opts.defsOnly?'checked':''}><span>Only count matches inside definitions</span></label>
    <label class="check"><input type="checkbox" name="titlesOnly" ${W.opts.titlesOnly?'checked':''}><span>Search titles and summaries only</span></label><button class="btn" style="margin-top:8px">Save options</button></form>
   <p class="small muted" style="margin-top:16px">Matching <b>${count}</b> bills in the ${esc(sessName(S))}.</p></div>`);
}
function saveWatch(){if(ME&&(isAdmin()||P().watch))api('watch',{terms:W.terms,codes:W.codes,opts:W.opts}).then(r=>{WATCHMETA={by:r.watch.by,at:r.watch.at}}).catch(e=>toast('Couldn’t save the watch list: '+e.message))}

/* ===================== ACCOUNT ===================== */
function pageAccount(){
  if(!ME) return shell('',`<div class="card" style="max-width:640px"><h2>You’re browsing as a guest</h2><p class="desc">Guests can see every bill, hearing, legislator and budget figure. <a href="/login">Sign in</a> to see and edit the office’s information.</p></div>`);
  const p=P();
  return shell('',`<div class="grid2"><div class="card"><h2>Your account</h2>
   <dl class="kv"><dt>Username</dt><dd>${esc(ME.user)}</dd><dt>Name</dt><dd>${esc(ME.display||'—')}</dd><dt>Role</dt><dd>${isAdmin()?'Admin: sees and changes everything, manages accounts':'Member'}</dd>
   ${isAdmin()?'':`<dt>Can change</dt><dd>${p.edit&&p.fields.length?esc(p.fields.map(f=>({position:'position',agAction:'AG office action',departments:'departments',divisions:'divisions',designations:'designations',priority:'office priority',note:'notes',assignees:'assignments'}[f])).join(', ')):'Nothing (view only)'}</dd>
   <dt>Office priority</dt><dd>${p.seePriority?'Visible':'Hidden'}</dd><dt>Bills</dt><dd>${p.scope==='all'?'All bills':p.scope==='departments'?'Bills in '+esc(p.departments.map(deptName).join(', ')):p.scope==='assigned'?'Bills assigned to you':`${p.bills.length} chosen bills`}</dd>`}</dl>
   <p style="margin-top:18px"><a class="btn" href="/logout">Sign out</a></p></div>
   <div class="card"><h2>Change your password</h2>${ME.source==='db'?`<form id="pwForm"><div class="field" style="margin-bottom:10px"><label for="pwOld">Current password</label><input type="password" id="pwOld" autocomplete="current-password" required style="width:100%"></div>
    <div class="field" style="margin-bottom:10px"><label for="pwNew">New password (at least 10 characters)</label><input type="password" id="pwNew" autocomplete="new-password" minlength="10" required style="width:100%"></div><button class="btn primary">Change password</button></form>`
    :`<p class="desc">Your account is set in Cloudflare (the DOCKET_USERS setting). To change its password, make a new line with <code>make_password.py</code> and replace yours there.</p>`}</div></div>`);
}

/* ===================== ADMIN ===================== */
let ADMIN=null;
const FIELD_LABEL={position:'Position',agAction:'AG office action',departments:'Departments',divisions:'Divisions',designations:'Designations',priority:'Office priority',note:'Notes',assignees:'Assigned to'};
function pageAdmin(){
  if(!isAdmin()) return shell('',`<div class="card"><h2>Admins only</h2></div>`);
  if(!ADMIN){api('users').then(j=>{ADMIN=j;route(true)}).catch(e=>{ADMIN={error:e.message};route(true)});return shell('admin',`<div class="card"><p>Loading accounts…</p></div>`)}
  if(ADMIN.error) return shell('admin',`<div class="card"><h2>Accounts</h2><p class="desc">${esc(ADMIN.error)}</p></div>`);
  const scopeTxt=p=>p.scope==='all'?'All bills':p.scope==='departments'?esc(p.departments.map(deptName).join(', ')||'No departments'):p.scope==='assigned'?'Assigned to them':`${p.bills.length} chosen bills`;
  return shell('admin',`<div class="card"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><h2>Accounts</h2><p class="desc">Admins see and change everything. For everyone else, choose what they can change, whether they see the office priority and notes, and which bills they can see. By default new accounts can’t see priorities.</p></div><button class="btn primary" id="addUser">Add an account</button></div>
   <div class="tablewrap" style="border:0"><table class="users" style="min-width:760px"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Can change</th><th>Priority</th><th>Bills</th><th></th></tr></thead><tbody>
   ${ADMIN.admins.map(a=>`<tr><td><b>${esc(a)}</b></td><td class="muted">—</td><td>Admin</td><td>Everything</td><td>Visible</td><td>All bills</td><td class="small muted">Set in Cloudflare</td></tr>`).join('')}
   ${ADMIN.users.map(u=>`<tr style="${u.disabled?'opacity:.55':''}"><td><b>${esc(u.username)}</b>${u.disabled?' <span class="pill muted">Disabled</span>':''}</td><td>${esc(u.name||'—')}<div class="sub">${esc(u.email||'')}</div></td><td>${u.role==='admin'?'Admin':'Member'}</td>
     <td class="small">${u.role==='admin'?'Everything':u.perms.edit&&u.perms.fields.length?esc(u.perms.fields.map(f=>FIELD_LABEL[f]).join(', ')):'View only'}</td><td>${u.role==='admin'||u.perms.seePriority?'Visible':'Hidden'}</td><td class="small">${u.role==='admin'?'All bills':scopeTxt(u.perms)}</td>
     <td style="white-space:nowrap"><button class="btn sm" data-edituser="${esc(u.username)}">Edit</button> <button class="btn sm" data-useract="${u.disabled?'enable':'disable'}|${esc(u.username)}">${u.disabled?'Enable':'Disable'}</button> <button class="btn sm danger" data-useract="delete|${esc(u.username)}">Delete</button></td></tr>`).join('')}
   </tbody></table></div></div>
   <div class="card"><h2>People for “Assigned to”</h2><p class="desc">Everyone with an account is already in the list (${esc(ADMIN.people.all.filter(n=>!ADMIN.people.extra.includes(n)).join(', ')||'nobody yet')}). Add anyone else here, one name per line.</p>
    <textarea id="peopleIn" aria-label="Extra people, one per line">${esc(ADMIN.people.extra.join('\n'))}</textarea><p><button class="btn primary" id="savePeople">Save names</button></p></div>
   <dialog id="userDlg"></dialog>`);
}
function userForm(u){
  const p=u?(u.role==='admin'?{edit:true,fields:Object.keys(FIELD_LABEL),seePriority:true,seeNotes:true,watch:true,scope:'all',departments:[],bills:[]}:u.perms):{edit:true,fields:['position','departments','divisions','designations','note','assignees','agAction'],seePriority:false,seeNotes:true,watch:true,scope:'all',departments:[],bills:[]};
  return `<form id="userForm" method="dialog"><h2>${u?'Edit '+esc(u.username):'Add an account'}</h2>
   <div class="grid2" style="gap:12px;margin:12px 0"><div class="field"><label for="uName">Username</label><input id="uName" ${u?'readonly':''} value="${esc(u?u.username:'')}" required pattern="[a-z0-9._\\-]{2,40}" style="width:100%" placeholder="e.g. jsmith"></div>
    <div class="field"><label for="uDisp">Full name</label><input id="uDisp" value="${esc(u?u.name:'')}" style="width:100%"></div>
    <div class="field"><label for="uEmail">Email</label><input id="uEmail" type="email" value="${esc(u?u.email:'')}" style="width:100%"></div>
    <div class="field"><label for="uPw">${u?'New password (leave blank to keep)':'Starting password'}</label><div style="display:flex;gap:6px"><input id="uPw" type="text" autocomplete="off" ${u?'':'required'} minlength="10" style="flex:1;min-width:0"><button type="button" class="btn sm" id="genPw">Make one</button></div></div></div>
   <span class="flabel">Role</span><label class="check"><input type="radio" name="uRole" value="member" ${!u||u.role!=='admin'?'checked':''}><span>Member, with the permissions below</span></label><label class="check"><input type="radio" name="uRole" value="admin" ${u&&u.role==='admin'?'checked':''}><span>Admin: sees and changes everything, manages accounts</span></label>
   <div id="permBox"><hr style="margin:14px 0"><span class="flabel">Can change</span>
    <label class="check"><input type="checkbox" id="pEdit" ${p.edit?'checked':''}><span>Can edit office information</span></label>
    <div class="daypick" style="margin:4px 0 10px 26px">${Object.entries(FIELD_LABEL).map(([f,l])=>`<label><input type="checkbox" data-pf="${f}" ${p.fields.includes(f)?'checked':''}>${l}</label>`).join('')}</div>
    <label class="check"><input type="checkbox" id="pPri" ${p.seePriority?'checked':''}><span>Can see the office priority</span></label>
    <label class="check"><input type="checkbox" id="pNotes" ${p.seeNotes?'checked':''}><span>Can see notes</span></label>
    <label class="check"><input type="checkbox" id="pWatch" ${p.watch?'checked':''}><span>Can change the watch list</span></label>
    <span class="flabel" style="margin-top:10px">Bills they can see the office’s information for</span>
    <label class="check"><input type="radio" name="pScope" value="all" ${p.scope==='all'?'checked':''}><span>All bills</span></label>
    <label class="check"><input type="radio" name="pScope" value="departments" ${p.scope==='departments'?'checked':''}><span>Only bills in these departments</span></label>
    <div class="daypick" style="margin:0 0 6px 26px">${CONFIG.departments.map(d=>`<label><input type="checkbox" data-pd="${d.id}" ${p.departments.includes(d.id)?'checked':''}>${esc(d.name)}</label>`).join('')}</div>
    <label class="check"><input type="radio" name="pScope" value="assigned" ${p.scope==='assigned'?'checked':''}><span>Only bills assigned to them</span></label>
    <label class="check"><input type="radio" name="pScope" value="bills" ${p.scope==='bills'?'checked':''}><span>Only these bills (${esc(sessName(UI.session))})</span></label>
    <textarea id="pBills" style="min-height:60px;margin-left:26px;width:calc(100% - 26px)" placeholder="HB 20, SB 101">${esc(p.bills.filter(k=>k.startsWith(UI.session+'/')).map(k=>shortNum(k.split('/')[1])).join(', '))}</textarea></div>
   <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button type="button" class="btn" id="userCancel">Cancel</button><button class="btn primary" id="userSave" value="save">Save</button></div></form>`;
}
function openUserDlg(u){
  const dlg=$('userDlg');dlg.innerHTML=userForm(u);dlg.showModal();
  const sync=()=>{$('permBox').style.display=document.querySelector('input[name=uRole]:checked').value==='admin'?'none':''};sync();
  dlg.querySelectorAll('input[name=uRole]').forEach(r=>r.onchange=sync);
  $('genPw').onclick=()=>{const a='abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';$('uPw').value=[...crypto.getRandomValues(new Uint8Array(14))].map(x=>a[x%a.length]).join('')};
  $('userCancel').onclick=()=>dlg.close();
  $('userForm').onsubmit=async e=>{e.preventDefault();
    const toKey=s=>{const m=s.trim().toUpperCase().replace(/\./g,'').match(/^([A-Z]{2,4})\s*0*(\d{1,4})$/);return m?`${UI.session}/${m[1]}${m[2].padStart(4,'0')}`:null};
    const keepOther=u&&u.perms?u.perms.bills.filter(k=>!k.startsWith(UI.session+'/')):[];
    const body={action:'save',username:$('uName').value.trim().toLowerCase(),name:$('uDisp').value.trim(),email:$('uEmail').value.trim(),password:$('uPw').value,role:document.querySelector('input[name=uRole]:checked').value,
      perms:{edit:$('pEdit').checked,fields:[...dlg.querySelectorAll('[data-pf]')].filter(x=>x.checked).map(x=>x.dataset.pf),seePriority:$('pPri').checked,seeNotes:$('pNotes').checked,watch:$('pWatch').checked,
        scope:document.querySelector('input[name=pScope]:checked').value,departments:[...dlg.querySelectorAll('[data-pd]')].filter(x=>x.checked).map(x=>x.dataset.pd),bills:[...keepOther,...$('pBills').value.split(/[,;\n]+/).map(toKey).filter(Boolean)]}};
    try{await api('users',body);dlg.close();toast(body.password?`Saved. Give ${body.username} their password: ${body.password}`:'Saved');ADMIN=null;route(true)}catch(err){toast(err.message)}};
}

/* ===================== BILL PAGE ===================== */
const clock=s=>{s=Math.max(0,Math.floor(s||0));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=String(s%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${x}`:`${m}:${x}`};
const vAt=(t,sec)=>t.video?`${t.video}#t=${Math.max(0,Math.floor(sec))}s`:t.page;
const AG_JS=/\b(?:(?:assistant|deputy|chief deputy|solicitor)\s+)?attorney\s*-?\s*general(?:'s)?(?:\s+office)?\b|\bAG'?s\s+office\b|\bA\.G\.(?=\s)|\bsolicitor\s+general\b|\boffice\s+of\s+the\s+attorney\b/gi;
const markAG=t=>esc(t).replace(AG_JS,m=>`<mark>${m}</mark>`);
function markTerms(t){let h=esc(t);for(const x of W.terms.filter(x=>x.on)){h=h.replace(new RegExp(termRe(x.t).source,'gi'),m=>`<mark>${m}</mark>`)}return h}
function snippet(raw,term){
  const re=termRe(term); const plain=raw.replace(STRIP_ALL,''); const m=re.exec(plain); if(!m) return esc(plain.slice(0,160));
  const map=[];for(let i=0;i<raw.length;i++){if(raw[i]!=='\u0001'&&raw[i]!=='\u0002')map.push(i)}
  const a=Math.max(0,m.index-80),z=Math.min(plain.length,m.index+m[0].length+80);
  const ra=map[a],rz=z<plain.length?map[z]:raw.length,ms=map[m.index],me=map[m.index+m[0].length-1]+1;
  const render=s=>{let out='',st=false;for(const ch of s){if(ch==='\u0001'){if(!st){out+='<s class="struck">';st=true}}else if(ch==='\u0002'){if(st){out+='</s>';st=false}}else out+=esc(ch)}return out+(st?'</s>':'')};
  let open=false;for(let i=0;i<ra;i++){if(raw[i]==='\u0001')open=true;else if(raw[i]==='\u0002')open=false}
  return (a>0?'…':'')+render((open?'\u0001':'')+raw.slice(ra,ms))+'<mark>'+render(raw.slice(ms,me))+'</mark>'+render(raw.slice(me,rz))+(z<plain.length?'…':'');
}
function changesCard(b){
  const vd=b.vd, cmp=b.cmp; if(!vd&&!cmp) return '';
  const terms=W.terms.filter(x=>x.on).map(x=>termRe(x.t));
  const items=(vd&&vd.items||[]).map(it=>({it,hit:terms.some(re=>re.test(it[2])||re.test(it[3]))})).sort((a,b)=>b.hit-a.hit);
  const one=({it,hit})=>`<div class="vd ${hit?'hit':''}"><div class="w">${esc(it[0])} · ${it[1]==='add'?'Added':it[1]==='del'?'Removed':'Changed'}${hit?' · <span style="color:var(--link)">matches the watch list</span>':''}</div>${it[2]?`<div class="old">${markTerms(it[2])}</div>`:''}${it[3]?`<div class="new">${markTerms(it[3])}</div>`:''}</div>`;
  const d=vd&&pd(vd.at);
  return `<div class="changes-card"><div class="kicker">Latest text changes</div><h3>${vd?`${esc(vd.from)} → ${esc(vd.to)}`:esc(cmp[0])}</h3>
   <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">${cmp?`<a class="btn primary" href="${esc(cmp[2])}" target="_blank" rel="noopener">Open the comparison PDF</a>`:''}<span class="small muted" style="align-self:center">${cmp?esc(cmp[0])+(pd(cmp[1])?', '+fmtLong(pd(cmp[1])):''):''}</span></div>
   ${vd?`<p class="small muted" style="margin:0 0 6px">${plural(vd.n,'section')} changed${d?' · '+fmtLong(d):''}. Struck text in red, new text in green${terms.length?'; sections with watch-list words come first':''}.</p>${items.slice(0,6).map(one).join('')}${items.length>6?`<details><summary class="small" style="cursor:pointer;color:var(--link);margin-top:8px">Show ${items.length-6} more</summary>${items.slice(6).map(one).join('')}</details>`:''}${vd.n>items.length?`<p class="small muted">Showing ${items.length} of ${vd.n}. The comparison PDF has everything.</p>`:''}`:''}</div>`;
}
function discussionSection(b){
  const list=b.tx.slice().sort((x,y)=>(y.date||'').localeCompare(x.date||'')||(y.t0||0)-(x.t0||0));
  const intro=`<p class="small muted">From the Legislature’s committee and floor recordings. Notes come from the official meeting timeline; transcripts are automatic captions and can contain errors. Mentions of the Attorney General are flagged.</p>`;
  if(!list.length) return `<section><h2>What was discussed</h2>${intro}<p class="small muted">No committee or floor discussion recorded yet.</p></section>`;
  return `<section><h2>What was discussed</h2>${intro}${list.map(t=>{const d=pd(t.date);const mins=t.t1&&t.t0!=null?Math.max(1,Math.round((t.t1-t.t0)/60)):null;
    const status=t.status==='ok'?`${mins?mins+' min · ':''}${(t.words||0).toLocaleString()} words transcribed`:t.status==='nocap'?'Video found; captions aren’t ready yet.':'The meeting video doesn’t mark where this bill came up yet.';
    return `<div class="disc ${t.ag&&t.ag.length?'hasag':''}"><div class="kicker">${t.kind==='floor'?'Floor debate':'Committee hearing'} · ${d?fmtLong(d):''}</div><h4>${esc(t.label)}</h4>${t.item?`<div class="small">${esc(t.item)}</div>`:''}<div class="small muted">${status}</div>
    <div class="links">${t.t0!=null&&t.video?`<a href="${esc(vAt(t,t.t0))}" target="_blank" rel="noopener">Watch from ${clock(t.t0)}</a>`:''}<a href="${esc(t.page)}" target="_blank" rel="noopener">Meeting page</a></div>
    ${t.ag&&t.ag.length?`<div class="agbox"><b>Attorney General mentioned (${t.ag.length})</b><ul>${t.ag.map(a=>`<li><a class="ts" href="${esc(vAt(t,a[0]))}" target="_blank" rel="noopener">${clock(a[0])}</a><span>${markAG(a[1])}</span></li>`).join('')}</ul></div>`:''}
    ${t.notes&&t.notes.length?`<ul>${t.notes.map(n=>`<li><a class="ts" href="${esc(vAt(t,n[0]))}" target="_blank" rel="noopener">${clock(n[0])}</a><span>${esc(n[2])}</span></li>`).join('')}</ul>`:''}
    ${t.status==='ok'&&b.txc!=null?`<details data-tx="${esc(b.session)}|${b.txc}|${esc(b.num)}|${esc(t.key)}"><summary>Read the transcript</summary><div class="tx">Loading…</div></details>`:''}</div>`}).join('')}</section>`;
}
function fiscalSection(b){
  const f=b.fn; if(b.file) return '';
  if(!f) return `<section><h2>Fiscal note</h2><p class="small muted">No fiscal note posted yet.</p></section>`;
  const c=fnCost(b);const fy=(f.exp&&f.exp.fy)||[];
  return `<section><h2>Fiscal note</h2>${f.none?'<p>Enactment likely won’t result in direct, measurable costs to the state.</p>':''}
   ${c?`<div class="fn"><div><span>General/Education Funds, ongoing</span><b>${money(-f.net[0])}</b></div><div><span>One-time</span><b>${money(-f.net[1])}</b></div><div><span>${fy.length?'Total spending '+esc(fy[0]):'Total'}</span><b>${f.exp&&f.exp.tot?money(f.exp.tot[0]):money(-f.net[2])}</b></div></div><p class="small muted" style="margin:0">Positive numbers are costs; negative numbers are savings or new revenue.</p>`:''}
   ${f.exp&&f.exp.txt?`<p class="serif">${esc(f.exp.txt)}</p>`:''}${f.rev&&f.rev.txt?`<p class="serif">${esc(f.rev.txt)}</p>`:''}
   ${f.local?`<p class="small"><b>Local government:</b> ${esc(f.local)}</p>`:''}${f.ind?`<p class="small"><b>Individuals and businesses:</b> ${esc(f.ind)}</p>`:''}
   <p class="small"><a href="${esc(f.u)}" target="_blank" rel="noopener">Read the full fiscal note</a>${f.d?` · ${esc(f.d)}`:''}${b.fa?` · Analyst ${esc(b.fa)}`:''}</p></section>`;
}
function agSection(b){
  if(b.file&&!agActOf(b)&&!canEdit('agAction')) return '';
  const t=agActOf(b), auto=b.agd||[], meta=(off(b)||{}).meta||{};
  const fnAG=b.fn&&(b.fn.ag||[]).some(a=>/attorney general/i.test(a));
  return `<section><h2>What the AG office will have to do</h2>
   ${ME?(canEdit('agAction')?`<textarea id="agActIn" placeholder="What the office will need to do if this passes: new duties, cases, rules, reports, staffing…">${esc(t)}</textarea><div style="display:flex;gap:10px;align-items:center;margin-top:8px"><button class="btn primary" id="saveAg">Save</button>${meta.agAction&&meta.agAction.by?`<span class="tiny muted">Last edited by ${esc(meta.agAction.by===ME.user?'you':meta.agAction.by)}</span>`:''}</div>`:(t?`<p class="serif">${esc(t)}</p>`:'<p class="small muted">The office hasn’t written this up yet.</p>')):''}
   ${auto.length?`<p class="small muted" style="margin:14px 0 6px">Where the bill text gives the Attorney General a role (current version, struck language left out):</p><ul class="small" style="padding-left:18px;margin:0">${auto.map(x=>`<li style="margin-bottom:6px"><b>${esc(x[0])}:</b> ${markAG(x[1])}</li>`).join('')}</ul>`:(b.file?'':'<p class="small muted" style="margin-top:10px">The bill text doesn’t mention the Attorney General.</p>')}
   ${fnAG?`<p class="small" style="margin-top:8px">The fiscal note names the Attorney General’s office; see the cost below.</p>`:''}</section>`;
}
function officePanel(b){
  if(!ME) return `<aside class="side"><h3>Office information</h3><p class="small muted">Departments, divisions, designations and notes are for signed-in staff. <a href="/login?next=${encodeURIComponent('/'+location.hash)}">Sign in</a> to see them.</p>${b.sug.length?`<div class="sidegroup"><span class="flabel">Likely divisions, from the bill text</span>${b.sug.map(x=>`<div class="small">${esc(divName(x))} <span class="muted">(${esc(deptName((divById(x)||{}).dept))})</span></div>`).join('')}</div>`:''}</aside>`;
  const o=off(b)||{}, meta=o.meta||{};
  const by=f=>meta[f]&&meta[f].by?`<div class="tiny muted" style="margin-top:3px">Set by ${esc(meta[f].by===ME.user?'you':meta[f].by)}${meta[f].at?' · '+fmtLong(new Date(meta[f].at)):''}</div>`:'';
  const p=priOf(b);
  const pos=posOf(b);
  return `<aside class="side"><h3>Office information</h3><div class="tiny muted">Shared with the office${isAdmin()||P().scope==='all'?'':' (your account sees some bills)'}.</div>
   <div class="sidegroup"><span class="flabel">Position</span>${[['','No position','var(--line-2)'],...(CONFIG.positions||[]).map(x=>[x.id,x.name,x.color])].map(([v,l,c])=>`<label class="radio ${(pos||'')===v?'sel':''}" style="--c:${c}"><input type="radio" name="pos" value="${v}" ${(pos||'')===v?'checked':''} ${canEdit('position')?'':'disabled'}><span class="dot"></span>${esc(l)}</label>`).join('')}${by('position')}</div>
   <div class="sidegroup"><span class="flabel">Department</span>${msHTML('departments',b.key,deptsOf(b),canEdit('departments'))}${by('departments')}</div>
   <div class="sidegroup"><span class="flabel">Division</span>${msHTML('divisions',b.key,divsOf(b),canEdit('divisions'),deptsOf(b).length?'Choose…':'Department first')}${suggHTML(b)}${by('divisions')}</div>
   <div class="sidegroup"><span class="flabel">Designations</span>${msHTML('designations',b.key,desigOf(b),canEdit('designations'))}${by('designations')}</div>
   ${canSee('priority')?`<div class="sidegroup"><span class="flabel">Office priority</span>${[['','No priority','var(--line-2)'],...CONFIG.priorities.map(x=>[x.id,x.name,x.color])].map(([v,l,c])=>`<label class="radio ${(p||'')===v?'sel':''}" style="--c:${c}"><input type="radio" name="pri" value="${v}" ${(p||'')===v?'checked':''} ${canEdit('priority')?'':'disabled'}><span class="dot"></span>${esc(l)}</label>`).join('')}${by('priority')}</div>`:''}
   <div class="sidegroup"><span class="flabel">Assigned to</span>${msHTML('assignees',b.key,assignOf(b),canEdit('assignees'),'Assign…')}${by('assignees')}</div>
   ${canSee('note')?`<div class="sidegroup"><label class="flabel" for="noteIn">Notes</label><textarea id="noteIn" ${canEdit('note')?'':'readonly'}>${esc(noteOf(b))}</textarea>${by('note')}${canEdit('note')?'<button class="btn primary" id="saveNote" style="margin-top:8px">Save note</button>':''}</div>`:''}
   <details class="sidegroup" id="teamLog" data-key="${esc(OFFICE[b.key]||!b.tid?b.key:`${b.session}/F-${b.tid}`)}"><summary class="small" style="cursor:pointer;color:var(--link)">Office history</summary><div class="small muted" id="teamLogBody">Loading…</div></details></aside>`;
}
function pageBill(session,num){
  const key=`${session}/${num}`; const b=BYKEY[key];
  if(!b){if(!BILLS[session]){loadSession(session).then(()=>route(true));return shell('bills','<div class="card"><p>Loading…</p></div>')}return shell('bills',`<div class="card"><h2>Not found</h2><p class="desc">No bill ${esc(num)} in the ${esc(sessName(session))}.</p></div>`)}
  const m=matchesFor(b); const hs=b.ag.map(a=>({...a,d:pd(a.date)})).filter(a=>a.d).sort((x,y)=>y.d-x.d); const yr=session.slice(0,4);
  const sp=h=>{const s=sponsorCell(b,h);return s};
  return shell('bills',`<a class="crumb" href="#bills">← Bills</a>
   <div class="billhead"><div class="no">${b.file?esc(fileStatus(b))+' (no bill number yet)':esc(shortNum(b.num))} · ${esc(sessName(session))}</div><h2>${esc(b.title)}${outcome(b)?` <span class="pill ${outcome(b).k}" style="font-size:15px;vertical-align:middle">${esc(outcome(b).l)}</span>`:''}</h2>
    <div class="sponsors"><div><span class="l">House</span>${sp('H')}</div><div><span class="l">Senate</span>${sp('S')}</div>${b.cosp.length?`<div><span class="l">Cosponsors</span>${esc(b.cosp.join(', '))}</div>`:''}</div>
    <div class="where"><span class="muted">Where it is now</span><span class="now">${esc(b.own)}</span><span>${esc(b.act)}${b.date?', '+fmtMDY(b.date):''}</span></div>
    ${b.file?'':`<a class="small" href="https://le.utah.gov/~${yr}/bills/static/${esc(b.num)}.html" target="_blank" rel="noopener">Open on le.utah.gov</a>`}</div>
   ${changesCard(b)}
   <div class="detail"><div>
    <section><h2>Summary</h2><p class="serif" style="font-size:17px">${esc(b.description||(b.file?'The Legislature publishes only the title and sponsor of a bill file until it gets a number.':'No summary yet.'))}</p>${b.subj.length?`<p class="small muted">Subjects: ${esc(b.subj.join(', '))}</p>`:''}${b.rc.length?`<p class="small muted">Recommended by ${esc(b.rc.join(', '))}</p>`:''}</section>
    ${agSection(b)}
    ${fiscalSection(b)}
    <section><h2>What has changed</h2>${b.ch.length?`<table class="compact"><tbody>${b.ch.slice().reverse().map(x=>{const d=pd(x[0]);return `<tr><td style="white-space:nowrap">${d?fmtMDY(d)+' '+fmtTime(d):''}</td><td><b>${esc(x[1])}</b>: ${esc(x[2])}</td></tr>`}).join('')}</tbody></table>`:'<p class="small muted">No changes recorded since Deseret Docket started tracking this bill.</p>'}</section>
    ${b.file?'':discussionSection(b)}
    ${b.file?'':`<section><h2>Where the watch list appears</h2>${m.length?`<p class="small muted">${plural(m.length,'place')} in ${esc(b.version||'the bill')}.</p><div class="tablewrap" style="border:0"><table class="compact"><thead><tr><th>Term</th><th>Where</th><th>Text</th></tr></thead><tbody>${m.slice(0,200).map(x=>`<tr><td><b>${esc(x.term)}</b>${x.inDef?' <span class="pill muted">definition</span>':''}${x.struck?' <span class="pill warn">struck</span>':''}</td><td>${esc(x.where)}</td><td>${x.code?esc(x.raw):snippet(x.raw,x.term)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="small muted">None of the watch list’s words or code chapters appear in this bill.</p>'}</section>`}
    ${b.file?'':`<section><h2>Committee hearings</h2>${hs.length?hs.map(h=>`<div class="card tight" style="margin-bottom:8px"><b>${esc(h.committee)}</b><div class="small">${WD[h.d.getDay()]}, ${fmtLong(h.d)} · ${fmtTime(h.d)} · ${esc(h.place)}${h.url?` · <a href="${esc(h.url)}" target="_blank" rel="noopener">Agenda</a>`:''}</div></div>`).join(''):'<p class="small muted">Not on any committee agenda yet.</p>'}</section>
    <section><h2>Status and votes</h2><div class="tablewrap" style="border:0"><table class="compact"><thead><tr><th>Date</th><th>Action</th><th>Location</th><th>Vote</th></tr></thead><tbody>${b.hist.map(h=>{const d=pd(h[0]);return `<tr><td>${d?fmtMDY(d):''}</td><td>${esc(h[1])}</td><td>${esc(h[2])}</td><td>${esc(h[3])}</td></tr>`}).join('')}</tbody></table></div></section>
    <section class="docs"><h2>Documents</h2>${b.docs.map(g=>`<b>${esc(g[0])}</b><ul>${g[1].map(i=>{const d=pd(i[1]);return `<li><a href="${esc(i[2])}" target="_blank" rel="noopener">${esc(i[0])}</a>${d?', '+MONTHS[d.getMonth()]+' '+d.getDate():''}</li>`}).join('')}</ul>`).join('')||'<p class="small muted">None yet.</p>'}</section>`}
   </div>${officePanel(b)}</div>`,true);
}

/* ===================== ROUTER ===================== */
let booted=false;
function route(soft){
  if(!INDEX) return;
  if(soft&&(openMS||(document.activeElement&&['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&app.contains(document.activeElement))||document.querySelector('dialog[open]'))) return;
  closeMS();
  const h=decodeURIComponent(location.hash.slice(1))||'updates'; const parts=h.split('-'); const view=parts[0];
  const y=scrollY; let html;
  if(view==='updates') html=pageUpdates();
  else if(view==='bills') html=pageBills();
  else if(view==='hearings') html=pageHearings();
  else if(view==='legislators') html=pageLegislators();
  else if(view==='budget') html=pageBudget();
  else if(view==='watchlist') html=pageWatch();
  else if(view==='account') html=pageAccount();
  else if(view==='admin') html=pageAdmin();
  else if(view==='email') html=pageEmail(parts.slice(1).join('-'));
  else if(view==='bill') html=pageBill(parts[1],parts.slice(2).join('-'));
  else html=shell('',`<div class="card"><h2>Not found</h2></div>`);
  app.innerHTML=html; bind();
  if(soft) scrollTo(0,y);
  const titles={updates:'Updates',bills:'Bills',hearings:'Hearings',legislators:'Legislators',budget:'Budget',watchlist:'Watch list',account:'Account',admin:'Admin',email:'Email settings',bill:view==='bill'?(parts[2]==='F'?'Bill file':shortNum(parts.slice(2).join('-'))):''};
  document.title=(titles[view]?titles[view]+' · ':'')+'Deseret Docket';
}
const on=(id,ev,fn)=>{const el=$(id);if(el)el[ev]=fn};
function bind(){
  bindMS(app);
  on('sessSel','onchange',async e=>{UI.session=e.target.value;saveUI();PAGE=1;await loadSession(UI.session);if(location.hash.startsWith('#bill-'))location.hash='#bills';else route()});
  // bills
  on('fShow','onchange',e=>{FLT.show=e.target.value;PAGE=1;saveFLT();route()});
  on('fPri','onchange',e=>{FLT.pri=e.target.value?[e.target.value]:[];PAGE=1;saveFLT();route()});
  const ff=$('fFind'); if(ff){ff.onchange=()=>{FLT.find=ff.value;PAGE=1;saveFLT();route()};ff.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();ff.blur()}}}
  on('clearSp','onclick',()=>{FLT.sponsor='';saveFLT();route()});
  on('csvBtn','onclick',()=>downloadCSV(filteredBills(),`deseret-docket-${UI.session}-${todayStr}.csv`));
  on('csvAll','onclick',()=>downloadCSV(ME?allRows(UI.session).filter(onOffice).sort(SORTS.num):allRows(UI.session).sort(SORTS.num),`deseret-docket-${UI.session}-${ME?'office-list':'all-bills'}-${todayStr}.csv`));
  app.querySelectorAll('[data-sort]').forEach(btn=>btn.onclick=()=>{const c=btn.dataset.sort;FLT.sort=FLT.sort.col===c?{col:c,dir:-FLT.sort.dir}:{col:c,dir:1};saveFLT();route(true)});
  app.querySelectorAll('[data-page]').forEach(btn=>btn.onclick=()=>{PAGE+=+btn.dataset.page;route();scrollTo(0,0)});
  // drag a column heading to move it
  let dragCol=null;
  app.querySelectorAll('th[data-col]').forEach(th=>{
    th.addEventListener('dragstart',e=>{dragCol=th.dataset.col;th.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragCol)});
    th.addEventListener('dragend',()=>{th.classList.remove('dragging');app.querySelectorAll('th.drag-over').forEach(x=>x.classList.remove('drag-over'))});
    th.addEventListener('dragover',e=>{if(!dragCol)return;e.preventDefault();th.classList.add('drag-over')});
    th.addEventListener('dragleave',()=>th.classList.remove('drag-over'));
    th.addEventListener('drop',e=>{e.preventDefault();const to=th.dataset.col;if(!dragCol||dragCol===to)return;const o=COLS.order.filter(c=>c!==dragCol);o.splice(o.indexOf(to),0,dragCol);COLS.order=o;saveCols();dragCol=null;route(true)});
  });
  on('colBtn','onclick',e=>{e.stopPropagation();const wrap=$('colMenu');if(openMS&&openMS.wrap===wrap){closeMS();return}closeMS();
    const pop=document.createElement('div');pop.className='ms-pop';
    const draw=()=>{const all=COLS.order.filter(colAllowed);pop.innerHTML=`<div class="grp">Show and order columns</div>${all.map((c,i)=>`<div class="colrow"><label><input type="checkbox" data-colshow="${c}" ${COLS.hidden.includes(c)?'':'checked'} ${c==='num'?'disabled':''}> ${esc(COLDEFS[c].label)}</label><button type="button" data-colmv="${c}|-1" aria-label="Move ${esc(COLDEFS[c].label)} left" ${i===0?'disabled':''}>↑</button><button type="button" data-colmv="${c}|1" aria-label="Move ${esc(COLDEFS[c].label)} right" ${i===all.length-1?'disabled':''}>↓</button></div>`).join('')}<div class="foot"><button type="button" class="linkbtn small" data-colreset>Reset to default</button><button type="button" class="btn sm" data-done>Done</button></div>`};
    draw();document.body.appendChild(pop);placePop(pop,$('colBtn'),true);$('colBtn').setAttribute('aria-expanded','true');let dirty=false;
    pop.onclick=ev=>{ev.stopPropagation();const t=ev.target;
      if(t.dataset.colmv){const [c,d]=t.dataset.colmv.split('|');const all=COLS.order.filter(colAllowed);const i=all.indexOf(c),j=i+(+d);if(j<0||j>=all.length)return;const other=all[j];const o=COLS.order.slice();const a=o.indexOf(c),b2=o.indexOf(other);[o[a],o[b2]]=[o[b2],o[a]];COLS.order=o;dirty=true;draw()}
      else if(t.dataset.colreset!==undefined){COLS={order:DEFAULT_ORDER.slice(),hidden:[]};dirty=true;draw()}
      else if(t.dataset.done!==undefined){closeMS()}};
    pop.onchange=ev=>{const c=ev.target.dataset.colshow;if(!c)return;COLS.hidden=ev.target.checked?COLS.hidden.filter(x=>x!==c):[...COLS.hidden,c];dirty=true};
    openMS={wrap,btn:$('colBtn'),pop,onClose:()=>{if(dirty){saveCols();route(true)}}};
  });
  on('fPos','onchange',e=>{FLT.pos=e.target.value;PAGE=1;saveFLT();route()});
  app.querySelectorAll('select[data-pos]').forEach(s=>s.onchange=async()=>{const b=BYKEY[s.dataset.pos];if(await saveBill(b,{position:s.value||null}))toast(`${billLabel(b)}: ${s.value?posName(s.value):'position cleared'}`);s.blur();route(true)});
  app.querySelectorAll('input[name=pos]').forEach(r=>r.onchange=async()=>{const b=BYKEY[curKey()];if(await saveBill(b,{position:r.value||null}))toast('Position saved');route(true)});
  on('saveAg','onclick',async()=>{const b=BYKEY[curKey()];if(await saveBill(b,{agAction:$('agActIn').value.trim()}))toast('Saved for the office')});
  app.querySelectorAll('[data-agact]').forEach(btn=>btn.onclick=()=>{const b=BYKEY[btn.dataset.agact];let dlg=$('noteDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='noteDlg';document.body.appendChild(dlg)}
    dlg.innerHTML=`<form method="dialog"><h2>AG office action: ${esc(billLabel(b))}</h2><p class="small muted">${esc(b.title)}</p>${b.agd.length?`<p class="small muted">From the bill text: ${esc(b.agd[0][1].slice(0,240))}${b.agd.length>1?' (and '+(b.agd.length-1)+' more)':''}</p>`:''}<textarea id="dlgNote" style="min-height:140px" placeholder="What the office will need to do if this passes">${esc(agActOf(b))}</textarea><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn" id="dlgCancel">Cancel</button><button class="btn primary" id="dlgSave">Save</button></div></form>`;
    dlg.showModal();$('dlgCancel').onclick=()=>dlg.close();$('dlgSave').onclick=async e=>{e.preventDefault();if(await saveBill(b,{agAction:$('dlgNote').value.trim()})){toast('Saved');dlg.close();route(true)}}});
  app.querySelectorAll('select[data-pri]').forEach(s=>s.onchange=async()=>{const b=BYKEY[s.dataset.pri];if(await saveBill(b,{priority:s.value||null}))toast(`${billLabel(b)}: priority ${s.value?'set to '+priName(s.value):'cleared'}`);s.blur();route(true)});
  app.querySelectorAll('[data-sug]').forEach(btn=>btn.onclick=async()=>{const [k,dv]=btn.dataset.sug.split('|');const b=BYKEY[k];const d=(divById(dv)||{}).dept;const patch={divisions:[...divsOf(b),dv]};if(d&&!deptsOf(b).includes(d)&&canEdit('departments'))patch.departments=[...deptsOf(b),d];if(await saveBill(b,patch))toast(`${billLabel(b)}: added to ${divName(dv)}`);route(true)});
  app.querySelectorAll('[data-note]').forEach(btn=>btn.onclick=()=>{const b=BYKEY[btn.dataset.note];let dlg=$('noteDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='noteDlg';document.body.appendChild(dlg)}
    dlg.innerHTML=`<form method="dialog"><h2>Note for ${esc(billLabel(b))}</h2><p class="small muted">${esc(b.title)}</p><textarea id="dlgNote" style="min-height:140px">${esc(noteOf(b))}</textarea><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn" id="dlgCancel">Cancel</button><button class="btn primary" id="dlgSave">Save note</button></div></form>`;
    dlg.showModal();$('dlgCancel').onclick=()=>dlg.close();$('dlgSave').onclick=async e=>{e.preventDefault();const v=$('dlgNote').value.trim();if(await saveBill(b,{note:v})){toast('Note saved');dlg.close();route(true)}}});
  app.querySelectorAll('[data-goshow]').forEach(a=>a.onclick=()=>{FLT.show=a.dataset.goshow;saveFLT()});
  // updates and email
  app.querySelectorAll('[data-upd]').forEach(b=>b.onclick=()=>{updScope=b.dataset.upd;route(true)});
  app.querySelectorAll('input[name=emScope]').forEach(r=>r.onchange=()=>{$('emListRow').style.display=r.value==='list'&&r.checked?'flex':'none'});
  on('emForm','onsubmit',async e=>{e.preventDefault();EM=readEM();const btn=e.target.querySelector('button.primary');btn.disabled=true;
    try{if(EMTOKEN&&location.hash.startsWith('#email-')){const r=await fetch('/api/sub',{method:'POST',headers:{'Content-Type':'application/json','X-Docket':'1'},body:JSON.stringify({t:EMTOKEN,opts:emToApi(EM)})});const j=await r.json();if(!r.ok)throw new Error(j.error);toast('Email settings saved')}
      else{const j=await api('subscribe',{email:EM.email,opts:emToApi(EM)});toast(j.wait?'We just sent a confirmation. Check your inbox (and spam folder).':`Check ${EM.email} for a confirmation link.`)}}
    catch(err){toast(err.message)}finally{btn.disabled=false}});
  on('emUnsub','onclick',async()=>{if(!confirm('Stop all Deseret Docket emails to this address?'))return;await fetch('/api/sub',{method:'POST',headers:{'Content-Type':'application/json','X-Docket':'1'},body:JSON.stringify({t:EMTOKEN,action:'delete'})});EMTOKEN=null;location.hash='#email-unsubscribed'});
  // hearings, legislators, budget
  app.querySelectorAll('[data-hear]').forEach(b=>b.onclick=()=>{hearScope=b.dataset.hear;route(true)});
  on('legSort','onchange',e=>{legSort=e.target.value;route(true)});
  app.querySelectorAll('[data-leghouse]').forEach(b=>b.onclick=()=>{legHouse=b.dataset.leghouse;route(true)});
  app.querySelectorAll('[data-sponsor]').forEach(a=>a.onclick=()=>{FLT.sponsor=a.dataset.sponsor;FLT.show='all';PAGE=1;saveFLT()});
  on('reqMore','onclick',()=>{reqAll=true;route(true)});
  app.querySelectorAll('[data-bud]').forEach(b=>b.onclick=()=>{const [k,v]=b.dataset.bud.split('|');budView[k]=v;route(true)});
  app.querySelectorAll('.pie-wrap').forEach(w=>{w.querySelectorAll('.li').forEach(li=>{li.onmouseenter=()=>{const p=w.querySelector(`path[data-i="${li.dataset.i}"]`);p&&p.classList.add('hl')};li.onmouseleave=()=>w.querySelectorAll('path.hl').forEach(p=>p.classList.remove('hl'))})});
  // watch list
  app.querySelectorAll('[data-toggle]').forEach(cb=>cb.onchange=()=>{const [k,i]=cb.dataset.toggle.split(':');W[k][i].on=cb.checked;saveWatch();route(true)});
  app.querySelectorAll('[data-remove]').forEach(btn=>btn.onclick=()=>{const [k,i]=btn.dataset.remove.split(':');W[k].splice(i,1);saveWatch();route(true)});
  on('addTerm','onsubmit',e=>{e.preventDefault();const v=$('termIn').value.trim().replace(/\s+/g,' ');if(!v)return;if(W.terms.some(x=>x.t.toLowerCase()===v.toLowerCase())){toast('Already on the list');return}W.terms.push({t:v,on:true});saveWatch();route();toast(`Now searching for “${v}”`)});
  on('addCode','onsubmit',e=>{e.preventDefault();const v=$('codeIn').value.trim().replace(/^title\s+/i,'');if(!/^\d+[A-Za-z]?(-\d+[A-Za-z]?(-\d+(\.\d+)?)?)?$/.test(v)){toast('Use a format like 13, 13-11 or 13-11-4.5');return}if(W.codes.some(x=>x.t===v))return;W.codes.push({t:v,on:true});saveWatch();route()});
  on('optsForm','onsubmit',e=>{e.preventDefault();const f=e.target;['struck','defsOnly','titlesOnly'].forEach(k=>W.opts[k]=f[k].checked);saveWatch();route();toast('Options saved')});
  // account and admin
  on('pwForm','onsubmit',async e=>{e.preventDefault();try{await api('password',{old:$('pwOld').value,new:$('pwNew').value});toast('Password changed. Sign in again with the new one.');setTimeout(()=>location.href='/login',1500)}catch(err){toast(err.message)}});
  on('addUser','onclick',()=>openUserDlg(null));
  app.querySelectorAll('[data-edituser]').forEach(b=>b.onclick=()=>openUserDlg(ADMIN.users.find(u=>u.username===b.dataset.edituser)));
  app.querySelectorAll('[data-useract]').forEach(b=>b.onclick=async()=>{const [action,username]=b.dataset.useract.split('|');if(action==='delete'&&!confirm(`Delete the account ${username}? They’ll be signed out and can’t sign in again.`))return;
    try{await api('users',{action,username});toast(action==='delete'?'Account deleted':action==='disable'?'Account disabled':'Account enabled');ADMIN=null;route(true)}catch(err){toast(err.message)}});
  on('savePeople','onclick',async()=>{try{const j=await api('people',{names:$('peopleIn').value.split('\n').map(s=>s.trim()).filter(Boolean)});PEOPLE=j.people.all;ADMIN=null;toast('Names saved');route(true)}catch(err){toast(err.message)}});
  // bill page
  app.querySelectorAll('input[name=pri]').forEach(r=>r.onchange=async()=>{const b=BYKEY[curKey()];if(await saveBill(b,{priority:r.value||null}))toast('Priority saved');route(true)});
  on('saveNote','onclick',async()=>{const b=BYKEY[curKey()];if(await saveBill(b,{note:$('noteIn').value.trim()}))toast('Note saved for the office')});
  app.querySelectorAll('details[data-tx]').forEach(dt=>dt.addEventListener('toggle',async()=>{
    if(!dt.open||dt.dataset.done) return; dt.dataset.done=1;
    const [sess,chunk,num,key]=dt.dataset.tx.split('|'); const box=dt.querySelector('.tx');
    try{const c=await loadTx(sess,chunk);const lines=(c[num]||{})[key]||[];const b=BYKEY[sess+'/'+num];const t=b.tx.find(x=>x.key===key);
      box.innerHTML=lines.length?lines.map(l=>`<p><a class="ts" href="${esc(vAt(t,l[0]))}" target="_blank" rel="noopener">${clock(l[0])}</a><span>${markAG(l[1])}</span></p>`).join(''):'<p>No transcript text.</p>'}
    catch(e){box.textContent='The transcript didn’t load. Close and reopen to try again.';delete dt.dataset.done}}));
  const tl=$('teamLog'); if(tl) tl.addEventListener('toggle',async()=>{if(!tl.open||tl.dataset.done)return;tl.dataset.done=1;
    const nice=w=>{const [f,v]=w.split(':');if(f==='agAction')return v==='edited'?'edited the AG office action':'cleared the AG office action';if(f==='position')return v==='none'?'cleared the position':'set the position to '+posName(v);if(f==='note')return v==='edited'?'edited the note':'cleared the note';if(f==='watchlist')return 'edited the watch list';
      const lab={departments:'departments',divisions:'divisions',designations:'designations',assignees:'assignments',priority:'priority',division:'division',flag:'flag'}[f]||f;
      const val=(v||'').split(',').filter(Boolean).map(x=>f==='departments'||f==='division'?deptName(x):f==='divisions'?divName(x):f==='priority'||f==='flag'?priName(x)||x:x).join(', ');
      return v==='none'?`cleared ${lab}`:`set ${lab} to ${val}`};
    try{const r=await api('log?key='+encodeURIComponent(tl.dataset.key));$('teamLogBody').innerHTML=r.log.length?'<ul style="padding-left:18px;margin:6px 0">'+r.log.map(x=>`<li>${esc(x.by===ME.user?'You':x.by)} ${esc(nice(x.what))} · ${fmtLong(new Date(x.at))}</li>`).join('')+'</ul>':'No changes yet.'}
    catch(e){$('teamLogBody').textContent='History didn’t load.';delete tl.dataset.done}});
}
const curKey=()=>{const p=decodeURIComponent(location.hash.slice(1)).split('-');return p[1]+'/'+p.slice(2).join('-')};
let lastPull=0;
window.addEventListener('hashchange',()=>{route();scrollTo(0,0);if(ME&&Date.now()-lastPull>10000){lastPull=Date.now();pullOffice(true)}});

/* ===================== START ===================== */
(async()=>{
  try{
    const meP=fetch('/api/me',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():{user:null}).catch(()=>({user:null}));
    [INDEX,CONFIG]=await Promise.all([getJSON('data/index.json'),getJSON('config.json')]);
    const me=await meP;
    if(me&&me.user){ME={user:me.user,display:me.display,role:me.role,perms:me.perms,source:me.source,people:me.people};PEOPLE=me.people||[]}
    loadCols();
    getJSON('data/legislators.json').then(l=>{LEGS=l;if(booted&&location.hash.startsWith('#legislators'))route(true)}).catch(()=>{LEGS=[]});
    const ids=INDEX.sessions.map(s=>s.id);
    if(!UI.session||!ids.includes(UI.session)) UI.session=(INDEX.sessions.find(s=>s.count>0||s.files>0)||INDEX.sessions[0]).id;
    const off=ME?pullOffice(false):null;
    await loadSession(UI.session);
    if(ME){await off;setInterval(()=>pullOffice(true),60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)pullOffice(true)})}
    booted=true; route();
  }catch(e){
    app.innerHTML=`<main class="gut"><div class="wrap"><h2 style="margin-top:40px">Couldn’t load bill data</h2><p class="lede">The data files didn’t load (${esc(e.message)}). Reload the page to try again.</p></div></main>`;
  }
})();
