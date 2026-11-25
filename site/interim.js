/* Interim: the work between sessions that becomes next year's bills.
   Overview · Wish list (wish.js) · Rumor bills · Study items (the interim committees' study list, outreach.js) · Activity log
   Rumor bills are bills someone heard are coming: who's carrying it, how the office heard, how sure it is and the
   divisions it would touch. Like a wish list idea, a rumor can go to the divisions through Draft review, and once a
   bill file opens the site offers the likely match (same sponsor, words in common) so it can be linked in one click.
   Who can use it: admins, and accounts with Admin → Edit → "Can use Interim". Stored as Outreach items. */
'use strict';
const RUM_COLS=[['heard','Heard',['heard','watching']],['confirmed','Confirmed',['confirmed']],['filed','Bill file opened',['filed','numbered']]];
const RUM_CONF={whisper:['Whisper','muted'],likely:['Likely','gold'],confirmed:['Confirmed','pass']};
const INT_TABS=[['','Overview'],['rumors','Rumor bills'],['wish','Wish list'],['study','Study items'],['activity','Activity log']];
const intRumors=()=>outOf('rumor');
const STOP=new Set('regulation regulations regulatory program programs services service public office offices department county counties local government governments funding fund funds account accounts reform revisions modifications related authority enforcement requirement standards process procedure procedures amendments amendment bill bills act code utah state relating provisions provision changes modifies modify amends section sections related requirements require requires establishes creates within regarding about would make makes their other with from that this into have will which also than under more such'.split(' '));
const intWords=t=>[...new Set(String(t||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w.length>=4&&!STOP.has(w)))];
// Bill files and bills that look like a rumor or wish list idea: same sponsor and/or words in common with the title.
let INTMATCH={sig:'',m:{}};
function intMatches(it){
  const S=UI.session, sig=S+'|'+(FILES[S]||[]).length+'|'+(Array.isArray(OUT)?OUT.length:0)+'|'+actSig();
  if(INTMATCH.sig!==sig)INTMATCH={sig,m:{}};
  if(INTMATCH.m[it.id])return INTMATCH.m[it.id];
  const words=intWords([it.keywords,it.summary].join(' ')), kw=intWords(it.keywords), linked=new Set(outLoad().map(x=>x.bill).filter(Boolean));
  const out=[];
  if(!it.bill&&!['dead','passed','parked'].includes(it.status))for(const b of allRows(S)){
    if(linked.has(b.key))continue;
    const tw=new Set(intWords(b.title+' '+(b.description||''))), common=words.filter(w=>tw.has(w)), kwHit=kw.filter(w=>tw.has(w)).length;
    const sp=it.sponsor&&(b.spId===it.sponsor||b.flId===it.sponsor||(legById(it.sponsor)&&legMatchName(legById(it.sponsor),b.sponsor)));
    const score=(sp?3:0)+common.length+kwHit;
    if((sp&&common.length)||common.length>=3||kwHit>=2)out.push({b,score,sp,common});
  }
  return INTMATCH.m[it.id]=out.sort((a,b)=>b.score-a.score).slice(0,3);
}
const intOpenItems=()=>[...intRumors(),...outOf('wish')].filter(x=>!x.bill&&outIsOpen(x));
function intDueCount(){if(!canInterim()||!Array.isArray(OUT))return 0;return intOpenItems().filter(it=>(it.kind==='rumor'?outMine(it):wishMine(it))&&intMatches(it).length).length}
function intMatchBox(it){const m=intMatches(it);if(!m.length)return '';
  return `<div class="int-match"><span class="tiny"><b>${ic('search')}Possible match${m.length>1?'es':''}</b></span>${m.map(x=>`<div class="int-mrow"><span>${x.b.file?'<span class="pill muted">Bill file</span> ':''}<a href="${billHref(x.b)}">${esc(x.b.file?x.b.title:billLabel(x.b)+' '+x.b.title)}</a><span class="tiny muted"> · ${esc(x.b.sponsor||'')}${x.sp?' (same sponsor)':''}${x.common.length?' · '+esc(x.common.slice(0,4).join(', ')):''}</span></span><button type="button" class="btn sm" data-intlink="${esc(it.id)}|${esc(x.b.key)}">That’s it</button></div>`).join('')}</div>`}

function pageInterim(sub){
  if(!canInterim())return shell('',`<div class="card"><h2>Interim</h2><p class="desc">Ask an admin to turn on Interim for your account.</p></div>`);
  const L=outLoad();
  const view=(sub||'').split('-')[0];
  const head=`<div class="card out-head"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div style="flex:1;min-width:260px"><h2>Interim</h2>
     <p class="desc">Between sessions: the office’s wish list and its language, bills people say are coming, and what the interim committees are studying. When a bill file opens that looks like one of them, it shows up here to link in one click. Anything can go to the divisions through Draft review.</p></div>
    <div class="out-add"><button class="btn primary" data-outnew="rumor">${ic('news')}Heard about a bill</button><button class="btn" data-outnew="wish">⭐ Add a wish list idea</button><a class="btn" href="#interim-study">${ic('calendar')}Track a study item</a></div></div>
   <nav class="out-nav" aria-label="Interim">${INT_TABS.map(([k,l])=>`<a href="#interim${k?'-'+k:''}" class="${view===k?'on':''}" ${view===k?'aria-current="page"':''}>${l}</a>`).join('')}</nav>
   ${['wish','rumors','study'].includes(view)?`<div class="out-filt"><label class="check"><input type="checkbox" id="intMine" ${OUTMINE?'checked':''}><span>Only mine</span></label><label class="check"><input type="checkbox" id="intOpen" ${OUTOPEN?'checked':''}><span>Hide finished</span></label></div>`:''}</div>`;
  if(!L)return shell('interim',head+`<div class="card"><p>${OUT&&OUT.error?esc(OUT.error):'Loading…'}</p></div>`);
  const body=view==='wish'?wishPage():view==='rumors'?intRumorPage():view==='study'?outInterim():view==='activity'?actPage('interim'):intOverview();
  return shell('interim',head+body);
}
function intOverview(){
  const R=intRumors(), act=actLoad('interim'), soon=ymd(new Date(TODAY.getTime()+30*864e5));
  const study=outOf('interim').filter(x=>x.date&&x.date>=todayStr&&x.date<=soon&&x.status!=='done').sort((a,b)=>a.date.localeCompare(b.date));
  const matches=intOpenItems().filter(it=>intMatches(it).length);
  const fresh=R.filter(r=>outIsOpen(r)&&(Date.now()-new Date(r.created_at))<30*864e5);
  const wishOpenN=outOf('wish').filter(outIsOpen).length;
  return `<div class="out-day"><div class="${matches.length?'hot':''}"><b>${matches.length}</b><span>possible bill file match${matches.length===1?'':'es'} to check</span></div><div><b>${fresh.length}</b><span>rumored bill${fresh.length===1?'':'s'} heard in the last 30 days</span></div><div><b>${wishOpenN}</b><span>wish list idea${wishOpenN===1?'':'s'} in progress</span></div><div><b>${study.length}</b><span>interim meeting${study.length===1?'':'s'} in the next 30 days</span></div></div>
   ${matches.length?`<div class="card"><h2>Bill files that look like ours</h2><p class="desc">New bill files and bills with the same sponsor or words in common with a rumored bill or a wish list idea. Press <b>That’s it</b> to link them; the item moves to “Bill file opened” and the bill’s page shows the connection.</p>
     <div class="rows">${matches.map(it=>`<div class="row" style="grid-template-columns:minmax(0,1fr)"><div class="what" style="font-size:14.5px">${it.kind==='rumor'?'<span class="pill muted">Rumor</span>':'<span class="pill gold">Wish list</span>'} ${esc(it.summary)}${it.sponsor?` <span class="tiny muted">· ${esc(outLegName(it.sponsor))}</span>`:''}${intMatchBox(it)}</div></div>`).join('')}</div></div>`:''}
   <div class="grid2" style="align-items:start">
    <div class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2>Rumor bills</h2><a class="btn sm" href="#interim-rumors">All →</a></div>
     ${R.filter(outIsOpen).length?`<div class="rows">${R.filter(outIsOpen).sort((a,b)=>(b.heard||b.created_at||'').localeCompare(a.heard||a.created_at||'')).slice(0,6).map(r=>`<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><div class="what" style="font-size:14.5px">${esc(r.summary)}<span class="sub">${[r.sponsor?outLegName(r.sponsor):'',r.heard?'heard '+outDate(r.heard):'',(r.divisions||[]).map(divName).join(', ')].filter(Boolean).map(esc).join(' · ')}</span></div><div class="r">${intConf(r)}${outEdit(r)}</div></div>`).join('')}</div>`:'<p class="empty">Nothing yet. Press <b>Heard about a bill</b> when someone mentions a bill that’s coming.</p>'}</div>
    <div class="card"><h2>Interim meetings coming up</h2>${study.length?`<div class="rows">${study.map(i=>`<div class="row" style="grid-template-columns:96px minmax(0,1fr) auto"><span class="small">${esc(outDate(i.date))}</span><div class="what" style="font-size:14.5px">${esc(i.topic)}<span class="sub">${[(outInterims().find(c=>c.id===i.com)||{}).name||'',pn(i.owner),i.division?divName(i.division):''].filter(Boolean).map(esc).join(' · ')}${i.link?` · <a href="${esc(i.link)}" target="_blank" rel="noopener">Materials</a>`:''}</span></div><div class="r">${outEdit(i)}</div></div>`).join('')}</div>`:'<p class="empty">No tracked study items have a meeting date in the next 30 days. Open <a href="#interim-study">Study items</a> and press <b>Track</b> on anything that touches the office.</p>'}</div></div>
   ${typeof wishOverview==='function'?wishOverview():''}
   <div class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h2>Recent activity</h2><a class="btn sm" href="#interim-activity">Full log →</a></div>${actFeed(act,{limit:10,compact:true,empty:'Nothing yet. Activity shows up here by itself as people add and move ideas, rumors and study items.'})}</div>`;
}
const intConf=r=>{const c=RUM_CONF[r.confidence]||RUM_CONF.whisper;return `<span class="pill ${c[1]}">${c[0]}</span>`};
function intRumorCard(r){
  const rv=outOf('review').filter(x=>x.rumor===r.id).sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||''));const b=r.bill&&BYKEY[r.bill];
  const openRv=rv.find(x=>revTurn(x)!=='closed');
  return `<div class="rum" data-rum="${esc(r.id)}"><div class="rum-top">${intConf(r)}${r.status==='dead'?'<span class="pill muted">Didn’t happen</span>':''}<span class="tiny muted">${r.heard?'Heard '+esc(outDate(r.heard)):''}</span></div>
    <b class="rum-sum">${esc(r.summary)}</b>
    ${r.sponsor?`<div>${outLegChip(r.sponsor)}</div>`:''}
    ${r.source?`<div class="small muted">${esc(r.source)}</div>`:''}
    ${r.details?`<div class="small out-clip">${esc(r.details)}</div>`:''}
    ${(r.divisions||[]).length?`<div class="rum-divs">${r.divisions.map(v=>`<span class="chip"><span class="dot" style="--c:${(divById(v)&&deptColor(divById(v).dept))||'var(--muted)'}"></span>${esc(divName(v))}</span>`).join('')}</div>`:''}
    ${b?`<div class="small">${ic('file')}${outBill(r.bill)} ${b.file?esc(b.title):''}</div>`:intMatchBox(r)}
    ${rv.length?`<div class="small">${rv.map(x=>`<button type="button" class="linkbtn small" data-actopen="${esc(x.id)}">Draft review: ${esc(REV_TURN[revTurn(x)])}</button>`).join(' · ')}</div>`:''}
    <div class="rum-foot"><span class="tiny muted">${r.owner?'POC '+esc(pn(r.owner)):''}</span><span style="display:flex;gap:6px;flex-wrap:wrap">${openRv?'':`<button type="button" class="btn sm" data-intrev="${esc(r.id)}" title="Starts a Draft review so the divisions can weigh in from their email">Get the divisions’ input</button>`}${outEdit(r)}</span></div></div>`;
}
function intRumorPage(){
  const all=intRumors().filter(r=>(!OUTMINE||outMine(r)));
  const dead=all.filter(r=>r.status==='dead');
  return `<div class="card"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start"><div><h2>Rumor bills</h2>
     <p class="desc">Bills people say are coming, before there’s a bill file: who’s carrying it, how the office heard and how sure it is. When a bill file opens with the same sponsor or the same words, it shows up on the card; press <b>That’s it</b> to link it. <b>Get the divisions’ input</b> sends it through Draft review, just like a draft.</p></div>
     <button class="btn primary" data-outnew="rumor">+ Heard about a bill</button></div></div>
   <div class="rum-board">${RUM_COLS.map(([k,l,sts])=>{const c=all.filter(r=>sts.includes(r.status)).sort((a,b)=>(b.heard||b.created_at||'').localeCompare(a.heard||a.created_at||''));
     return `<div class="rum-col"><h3>${esc(l)} <span class="tiny muted">${c.length}</span></h3>${c.map(intRumorCard).join('')||'<p class="small muted">Nothing here.</p>'}</div>`}).join('')}</div>
   ${dead.length&&!OUTOPEN?`<div class="card"><h2>Didn’t happen <span class="tiny muted">${dead.length}</span></h2><div class="rum-board one">${dead.map(intRumorCard).join('')}</div></div>`:dead.length?`<p class="small muted">${plural(dead.length,'rumor')} that didn’t happen ${dead.length===1?'is':'are'} hidden. Uncheck <b>Hide finished</b> to see ${dead.length===1?'it':'them'}.</p>`:''}`;
}
async function intLink(id,key){
  const it=(OUT||[]).find(x=>x.id===id);const b=BYKEY[key];if(!it||!b)return;
  const status=it.kind==='rumor'?(b.file?'filed':'numbered'):(b.file?'filed':'numbered');
  try{const j=await api('outreach',{kind:it.kind,id:it.id,item:{...it,bill:key,status}});OUT=j.items;toast(`Linked to ${b.file?'the bill file':billLabel(b)}`);route(true)}catch(e){toast(e.message)}
}
async function intToReview(id){
  const r=(OUT||[]).find(x=>x.id===id);if(!r)return;
  if(!(r.divisions||[]).length&&!confirm('No divisions are picked on this rumor yet. Start the draft review anyway? You can pick them in the next step.'))return;
  const item={title:r.summary,rumor:r.id,fromRole:r.sponsor?'sponsor':'stakeholder',from:r.sponsor?outLegName(r.sponsor):'',legs:r.sponsor?[r.sponsor]:[],divisions:r.divisions||[],bill:r.bill||'',
    notes:[r.details,r.source?`How we heard: ${r.source}`:''].filter(Boolean).join('\n'),owner:r.owner||(PEOPLE.find(p=>outMe().includes(p.toLowerCase()))||ME.user),received:todayStr};
  try{const j=await api('outreach',{kind:'review',item});OUT=j.items;toast('Draft review started');route(true);if(j.id&&typeof revOpen==='function')setTimeout(()=>revOpen(j.id),60)}catch(e){toast(e.message)}
}
document.addEventListener('click',e=>{
  const l=e.target.closest&&e.target.closest('[data-intlink]');if(l){e.preventDefault();const [id,key]=l.dataset.intlink.split('|');intLink(id,key);return}
  const r=e.target.closest&&e.target.closest('[data-intrev]');if(r){e.preventDefault();intToReview(r.dataset.intrev)}
});
function intBind(){
  if(!location.hash.startsWith('#interim'))return;
  on('intMine','onchange',e=>{OUTMINE=e.target.checked;route(true)});
  on('intOpen','onchange',e=>{OUTOPEN=e.target.checked;route(true)});
  if(typeof actBind==='function')actBind();
}
