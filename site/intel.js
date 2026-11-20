/* Bill intelligence: floor calendar watch, substitute alerts, bill collisions, "this bill has run
   before", similar laws elsewhere, sponsors and public records, news coverage, trending bills, media
   and media availability analyses. */
'use strict';
let MEDIA=null, HIST=null, MAV=null, BILLTAB='overview', BILLTAB_KEY='';
function loadMedia(){if(MEDIA===null){MEDIA=undefined;getJSON('data/media.json').then(j=>{MEDIA=j;route(true)}).catch(()=>{MEDIA={bills:{},trending:{day:[],week:[]},sources:[]}})}return MEDIA||null}
function loadHist(){if(HIST===null){HIST=undefined;getJSON('data/history.json').then(j=>{HIST=j;route(true)}).catch(()=>{HIST={}})}return HIST||null}
function loadMAV(){if(MAV===null){MAV=undefined;getJSON('data/media-avail.json').then(j=>{MAV=j;route(true)}).catch(()=>{MAV={items:[]}})}return MAV||null}
const aiOf=b=>{if(typeof loadAI==='function')loadAI(b.session);const a=((typeof AIDATA!=='undefined'&&AIDATA[b.session])||{})[b.num];return a||null};

// ---------- floor calendar watch
const FLOOR_JS=/reading calendar|\bcircled\b|\buncircled\b|\brules\b|concurrence calendar|consent calendar|time certain/i;
function floorMoves(b,days){const since=ymd(new Date(Date.now()-days*864e5));return (b.hist||[]).filter(h=>h[0]&&h[0].slice(0,10)>=since&&FLOOR_JS.test(h[1]||''))}
function floorWords(a){if(/\buncircled\b/i.test(a))return 'Uncircled';if(/\bcircled\b/i.test(a))return 'Circled';if(/to rules|returned? to rules/i.test(a))return 'Sent to Rules';if(/rules to/i.test(a))return 'Out of Rules';if(/3rd reading calendar/i.test(a))return 'On the 3rd reading calendar';if(/2nd reading calendar/i.test(a))return 'On the 2nd reading calendar';if(/concurrence/i.test(a))return 'On the concurrence calendar';return a}

// ---------- substitutes that touch watched code
function subWatchHits(b){
  const vd=b.vd;if(!vd||!vd.items)return [];const codes=W.codes.filter(x=>x.on).map(x=>x.t);if(!codes.length)return [];
  const out=new Set();for(const it of vd.items){const m=String(it[0]).match(/^Section ([0-9A-Za-z.\-]+)/);if(!m)continue;const sec=m[1];for(const c of codes)if(sec===c||sec.startsWith(c+'-'))out.add(sec)}
  return [...out];
}
function subSummary(b){
  const ai=aiOf(b);if(ai&&ai.subsum&&(!ai.ver||ai.ver===b.version))return {txt:ai.subsum,src:'ai'};
  const vd=b.vd;if(!vd||!vd.items||!vd.items.length)return null;
  const secs=[...new Set(vd.items.map(i=>(String(i[0]).match(/^Section ([0-9A-Za-z.\-]+)/)||[])[1]).filter(Boolean))];
  const add=vd.items.filter(i=>i[1]==='add').length, del=vd.items.filter(i=>i[1]==='del').length, chg=vd.items.length-add-del;
  const hp=vd.items.find(i=>i[0]==='Highlighted provisions');
  const parts=[];if(chg)parts.push(`rewrites ${plural(chg,'passage')}`);if(add)parts.push(`adds ${add}`);if(del)parts.push(`removes ${del}`);
  return {txt:`${esc(vd.to)} ${parts.join(', ')||'makes changes'}${secs.length?` in ${secs.length>4?plural(secs.length,'code section'):'Section '+secs.join(', ')}`:''}.${hp?' The bill’s own summary of its provisions changed too.':''}`,src:'auto',html:true};
}

// ---------- bill collisions: two bills amending the same code section, with different wording
let COLL=null, COLLSIG='';
function collisions(){
  const S=UI.session, rows=(BILLS[S]||[]).filter(b=>!b.file&&(outcome(b)||{}).k!=='dead');
  const sig=S+rows.length+(TEXTSTATE[S]||{}).loaded;if(COLL&&COLLSIG===sig)return COLL;COLLSIG=sig;
  const bySec={};for(const b of rows)for(const s of b.secs)(bySec[s]=bySec[s]||[]).push(b);
  const sub=(b,sec)=>{const ps=(TEXT[S]||{})[b.num]||[];const m={};for(const p of ps){if(p[0]===`Section ${sec}`||p[0].startsWith(`Section ${sec} >`))m[p[0]]=p[1].replace(/\u0001[^\u0002]*\u0002/g,'').replace(/\s+/g,' ').trim()}return m};
  const out={};
  for(const [sec,list] of Object.entries(bySec)){if(list.length<2||list.length>8)continue;
    for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],c=list[j];const ta=sub(a,sec),tc=sub(c,sec);
      const diff=Object.keys(ta).filter(k=>k in tc&&ta[k]!==tc[k]).map(k=>k.replace(`Section ${sec}`,'').replace(/^ > /,'')||'the section');
      const rec={sec,diff:diff.slice(0,4),nd:diff.length};(out[a.key]=out[a.key]||[]).push({other:c,...rec});(out[c.key]=out[c.key]||[]).push({other:a,...rec})}}
  COLL=out;return out;
}

// ---------- has this bill run before?
function tokens(t){return new Set(String(t||'').toLowerCase().replace(/amendments?|modifications?|act|provisions?/g,' ').split(/[^a-z0-9]+/).filter(w=>w.length>2))}
function runBefore(b){
  const H=loadHist();if(!H)return null;const out=[];const ts=tokens(b.title);const secs=new Set(b.secs);
  for(const [ses,bills] of Object.entries(H)){if(ses===b.session||ses[0]==='_')continue;
    for(const r of Object.values(bills)){const shared=r.secs.filter(s=>secs.has(s)).length;const rt=tokens(r.t);const inter=[...ts].filter(w=>rt.has(w)).length;const jac=inter/Math.max(1,new Set([...ts,...rt]).size);
      const score=(secs.size?shared/Math.max(secs.size,r.secs.length||1):0)*0.6+jac*0.4+(r.t.toLowerCase()===b.title.toLowerCase()?0.5:0);
      if((shared>=2||jac>=0.55||(shared>=1&&jac>=0.3))&&score>=0.3)out.push({ses,r,shared,score})}}
  return out.sort((a,c)=>c.score-a.score).slice(0,6);
}

// ---------- tags on the Bills table
function billExtraTags(b){const t=[];
  if(floorMoves(b,3).length)t.push(`<a class="pill warn tagx" href="${billHref(b)}" data-jump="${esc(b.key)}|hearings|floor" data-full="${esc('Floor calendar, last 3 days:\n'+floorMoves(b,3).map(h=>`• ${h[1]} (${fmtMD(pd(h[0]))})`).join('\n')+'\n\nClick to open the floor calendar for this bill.')}">${esc(floorWords(floorMoves(b,3)[0][1]))}</a>`);
  if(ME&&subWatchHits(b).length)t.push('<span class="pill warn">Sub touches watched code</span>');
  if(!b.file&&(collisions()[b.key]||[]).some(x=>x.nd))t.push(`<a class="pill ink tagx" href="${billHref(b)}" data-jump="${esc(b.key)}|text|collisions" data-full="${esc(collTip(b))}">${ic('merge')}Collision</a>`);
  return t.join('');
}

// ---------- the bill page: overview extras and tabs
function billExtraParts(b){
  if(b.file)return {};
  const ai=aiOf(b), ss=subSummary(b), hits=ME?subWatchHits(b):[], col=(collisions()[b.key]||[]).sort((x,y)=>y.nd-x.nd), fm=floorMoves(b,14), o={};
  if(ai&&ai.sum)o.plain=`<section class="plain" id="bs-plain"><h2>In plain English</h2><p class="serif" style="font-size:17px">${esc(ai.sum)}</p><p class="tiny muted">AI summary of ${esc(ai.ver||'the bill')}. Check the bill text before relying on it.</p></section>`;
  if(ss)o.version=`<section id="bs-version"><h2>What this ${/sub/i.test(b.version)?'substitute':'version'} does</h2><p>${ss.html?ss.txt:esc(ss.txt)}</p>${hits.length?`<div class="alertbox"><b>Touches code on the watch list:</b> Section ${esc(hits.join(', '))}</div>`:''}<p class="tiny muted">${ss.src==='ai'?'AI summary of the changes.':'Automatic summary from the text comparison.'}</p></section>`;
  if(fm.length)o.floor=`<section id="bs-floor"><h2>Floor calendar</h2>${fm.map(x=>`<div class="small"><b>${esc(floorWords(x[1]))}</b> · ${esc(x[1])} · ${fmtMDY(pd(x[0]))}</div>`).join('')}<p class="tiny muted">Circling, Rules and calendar moves are where bills often stall or speed up.</p></section>`;
  if(col.length)o.collisions=`<section id="bs-collisions"><h2>Bill collisions</h2><p class="small muted">Other bills this session that amend the same Utah Code sections. Different wording in the same subsection usually needs a coordination clause.</p>${col.slice(0,8).map(x=>`<div class="coll ${x.nd?'hot':''}"><a class="billnum" href="${billHref(x.other)}">${esc(shortNum(x.other.num))}</a> <span class="serif">${esc(x.other.title)}</span><div class="small">Both amend Section ${esc(x.sec)}${x.nd?` · <b>different wording in ${esc(x.diff.join(', '))}${x.nd>x.diff.length?` and ${x.nd-x.diff.length} more`:''}</b>`:' · no conflicting wording found'}</div></div>`).join('')}</section>`;
  return o;
}
function billOverviewExtras(b){const o=billExtraParts(b);return (o.plain||'')+(o.version||'')+(o.floor||'')+(o.collisions||'')}
const BILL_TABS=[['overview','Overview'],['hearings','Hearings and debate'],['text','Text and watch list'],['history','History and votes'],['media','News']];const BTICON={overview:'home',hearings:'mic',text:'diff',history:'clock',media:'news'};
function billTabsNav(b,secs){
  if(b.file)return '';
  if(BILLTAB_KEY!==b.key){BILLTAB_KEY=b.key;BILLTAB='overview'}
  if(PENDJUMP&&PENDJUMP.key===b.key)BILLTAB=PENDJUMP.tab;
  const m=(loadMedia()||{bills:{}}).bills[b.num]&&MEDIA.session===b.session?MEDIA.bills[b.num]:null;
  const label=k=>{const l=BILL_TABS.find(t=>t[0]===k)[1];return k==='media'&&m?`${l} (${m.items.length})`:l};
  const jump=secs&&secs.length?`<label class="sr" for="billJump">Jump to a section</label><select id="billJump" class="billjump"><option value="">Jump to…</option>${BILL_TABS.map(([k])=>{const ss=secs.filter(x=>x[0]===k);return ss.length?`<optgroup label="${esc(label(k))}">${ss.map(x=>`<option value="${k}|${x[1]}">${esc(x[2])}</option>`).join('')}</optgroup>`:''}).join('')}</select>`:'';
  return `<nav class="billtabs" aria-label="Bill sections">${BILL_TABS.map(([k])=>`<button type="button" data-billtab="${k}" class="${BILLTAB===k?'on':''}" aria-pressed="${BILLTAB===k}">${ic(BTICON[k])}${esc(label(k))}</button>`).join('')}<span class="grow"></span>${jump}${ME?`<a class="btn sm" href="#packet-${esc(b.session)}-${esc(b.num)}">Prep packet</a>`:''}</nav>`;
}
function meterSVG(score,n){
  const a=Math.PI*(1-(score+1)/2), r=70, cx=90, cy=86, x=cx+r*Math.cos(a), y=cy-r*Math.sin(a);
  const label=n<3?'Too few mentions to say':score>0.25?'Mostly positive':score<-0.25?'Mostly negative':'Mixed or neutral';
  return `<svg viewBox="0 0 180 104" class="meter" role="img" aria-label="Sentiment: ${label}"><defs><linearGradient id="sg" x1="0" x2="1"><stop offset="0" stop-color="#78081c"/><stop offset=".5" stop-color="#e9d8a6"/><stop offset="1" stop-color="#2f6f3a"/></linearGradient></defs>
   <path d="M20 86 A70 70 0 0 1 160 86" fill="none" stroke="url(#sg)" stroke-width="16" stroke-linecap="round"/>
   <line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#002147" stroke-width="4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="7" fill="#002147"/>
   <text x="20" y="102" font-size="10" fill="#5b6672">Negative</text><text x="160" y="102" font-size="10" fill="#5b6672" text-anchor="end">Positive</text></svg><div class="meter-l"><b>${label}</b></div>`;
}
function billTabBody(b){
  if(BILLTAB==='media'){
    const M=loadMedia();if(!M)return '<p>Loading…</p>';
    const m=M.session===b.session?M.bills[b.num]:null;
    return `<section id="bs-news"><h2>News & sentiment</h2><p class="small muted">News stories that mention ${esc(shortNum(b.num))} by number or exact title, from the last 60 days. Checked with every data update${M.fetched?`; last checked ${fmtAP(new Date(M.fetched+'Z'))}`:''}.</p>
     ${m?`<div class="sent"><div>${meterSVG(m.score,m.n)}</div><div class="small"><p><b>What is the sentiment meter?</b> A rough read of the tone of the ${plural(m.n,'recent news story','recent news stories')}, from the positive and negative words they use. It tells you which way the conversation is leaning, not how many people agree. Open the stories to judge for yourself.</p></div></div>
      <div class="rows">${m.items.map(x=>`<div class="row" style="grid-template-columns:110px minmax(0,1fr) auto"><span class="small">${x.date?fmtMD(new Date(x.date.length>10?x.date+'Z':x.date)):''}<span class="sub">${esc(x.src)}</span></span><div class="what" style="font-size:15px"><a href="${esc(x.u)}" target="_blank" rel="noopener">${esc(x.t||'(post)')}</a>${x.d?`<span class="sub">${esc(x.d.slice(0,200))}</span>`:''}</div><div class="r"><span class="sdot" style="--c:${x.s>0.2?'var(--green)':x.s<-0.2?'var(--maroon)':'var(--line-2)'}" title="Tone ${x.s}"></span></div></div>`).join('')}</div>`
     :`<p class="empty">No news stories mention this bill yet.</p>`}
     <p class="tiny muted">Sources: ${esc((M.sources||[]).filter(s=>s.ok).map(s=>s.name).join(', ')||'none reachable on the last check')}.</p></section>`;
  }
  if(BILLTAB==='history'){
    const rb=runBefore(b);
    const prompt=`Look for bills similar to this Utah bill that other states have considered or passed, and any model legislation it may be based on. For each one, say the state, the bill or law, whether it passed, and anything notable about how it worked out.\n\nUtah ${b.session.slice(0,4)} ${shortNum(b.num)}: ${b.title}\nSponsor: ${b.sponsor.replace(/^(Rep|Sen)\.\s*/,'')}\nSummary: ${b.description||'(no summary yet)'}\nBill text: https://le.utah.gov/~${b.session.slice(0,4)}/bills/static/${b.num}.html`;
    const V=typeof loadVotes==='function'?loadVotes():null;const rec=V&&V[b.session]&&V[b.session][b.num];
    const nm=id=>{const l=legById(id);return l?(l.full||l.name).split(',')[0]:id};
    return `<section id="bs-runbefore"><h2>Has this bill run before?</h2><p class="small muted">Earlier Utah bills with the same code sections or a very similar title, from the last four general sessions.</p>
     ${rb===null?'<p>Loading…</p>':rb.length?`<div class="tablewrap"><table class="compact"><thead><tr><th>Session</th><th>Bill</th><th>Sponsor</th><th>How far it got</th><th>Where it stopped</th></tr></thead><tbody>${rb.map(x=>`<tr><td>${esc(x.ses.slice(0,4))}</td><td><a href="https://le.utah.gov/~${esc(x.ses.slice(0,4))}/bills/static/${esc(x.r.n)}.html" target="_blank" rel="noopener"><b>${esc(shortNum(x.r.n))}</b></a> ${esc(x.r.t)}<div class="sub">${x.shared?plural(x.shared,'shared code section'):'Similar title'}</div></td><td class="small">${esc(x.r.sp.replace(/^(Rep|Sen)\.\s*/,''))}</td><td><span class="pill ${/law/i.test(x.r.stage)?'pass':/vetoed|stopped|never/i.test(x.r.stage)?'dead':'ink'}">${esc(x.r.stage)}</span></td><td class="small">${esc(x.r.died||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">No close match in the last four sessions. (Earlier sessions fill in over the first few data updates.)</p>'}
     <div class="claudebox"><div><b>Similar bills in other states</b><div class="small muted">Opens Claude with this bill’s title and summary, ready to ask about similar bills and model legislation elsewhere.</div></div><a class="btn primary" href="https://claude.ai/new?q=${encodeURIComponent(prompt)}" target="_blank" rel="noopener">Ask Claude</a></div></section>
     <section id="bs-votes"><h2>Votes</h2>${(()=>{const fl=(rec&&rec.v)||[];const cm=b.hist.filter(h=>h[3]&&/^(\d+)-(\d+)/.test(h[3])&&(+h[3].split('-')[0]+ +h[3].split('-')[1])>0&&!(h[4]&&fl.some(v=>v[0]===h[4])));
       return (fl.length?fl.slice().sort((x,y)=>(y[2]||'').localeCompare(x[2]||'')).map(v=>`<details class="vote"><summary><b>${v[1]==='H'?'House':'Senate'}</b> · ${esc(v[3]||'Floor vote')} · ${esc(v[2]||'')}<span class="vt"><span class="y">${v[4].length} yes</span> <span class="n">${v[5].length} no</span> <span class="muted">${v[6].length} absent</span></span></summary>
         <div class="vcols"><div><b>Yes</b><p>${v[4].map(nm).sort().map(esc).join(', ')||'—'}</p></div><div><b>No</b><p>${v[5].map(nm).sort().map(esc).join(', ')||'—'}</p></div><div><b>Absent or not voting</b><p>${v[6].map(nm).sort().map(esc).join(', ')||'—'}</p></div></div></details>`).join(''):'')
       +(cm.length?`<table class="compact" style="margin-top:8px"><tbody>${cm.map(h=>`<tr><td>${fmtMDY(pd(h[0]))}</td><td>${esc(h[1])}</td><td><b>${esc(h[3])}</b> <span class="tiny muted">yes–no–absent</span></td></tr>`).join('')}</tbody></table>`:'')
       +(!fl.length&&!cm.length?'<p class="small muted">No recorded votes yet.</p>':'')
       +`<p class="tiny muted">Floor roll calls come from le.utah.gov and fill in with each data update.</p>`})()}</section>`;
  }
  return '';
}

// ---------- Daily Updates extras
function updatesExtras(){
  const S=UI.session;let h='';
  const pool=allRows(S).filter(b=>!b.file&&(updScope==='office'&&ME?onOffice(b):updScope==='mine'?mineAssigned(b):true));
  const moves=pool.flatMap(b=>floorMoves(b,3).map(x=>({b,x}))).sort((a,c)=>c.x[0].localeCompare(a.x[0]));
  if(moves.length)h+=`<div class="card"><h2>Floor calendar watch</h2><p class="desc">Bills moved onto a reading calendar, circled or uncircled, or sent to or from Rules in the last three days. These moves happen fast and are where bills quietly stall or jump ahead.</p><div class="rows">${moves.slice(0,40).map(({b,x})=>`<div class="row"><a class="k" href="${billHref(b)}">${esc(shortNum(b.num))}</a><div class="what">${esc(floorWords(x[1]))}<span class="sub">${esc(b.title)} · ${esc(x[1])}</span></div><div class="r"><span class="small muted">${fmtMD(pd(x[0]))} ${fmtTime(pd(x[0]))}</span></div></div>`).join('')}</div></div>`;
  if(ME){const subs=pool.filter(b=>b.vd&&b.vd.at&&b.vd.at.slice(0,10)>=ymd(new Date(Date.now()-7*864e5))&&subWatchHits(b).length);
    if(subs.length)h+=`<div class="card"><h2>Substitutes that touch your code sections</h2><p class="desc">New versions from the last week that change Utah Code on the watch list.</p><div class="rows">${subs.map(b=>{const ss=subSummary(b);return `<div class="row"><a class="k" href="${billHref(b)}">${esc(shortNum(b.num))}</a><div class="what">${esc(b.vd.to)}: Section ${esc(subWatchHits(b).join(', '))}<span class="sub">${ss?(ss.html?ss.txt:esc(ss.txt)):esc(b.title)}</span></div><div class="r"><span class="pill warn">Watch list</span></div></div>`}).join('')}</div></div>`}
  const M=loadMedia();
  if(M&&M.trending&&(M.trending.week||[]).length&&M.session===S){const row=(l,lbl)=>`<div><h3 style="font-family:var(--sans);font-size:16px">${lbl}</h3>${l.length?`<ol class="trend">${l.slice(0,8).map(([n,c])=>{const b=BYKEY[`${S}/${n}`];return `<li><a class="billnum" href="${b?billHref(b):'#'}">${esc(shortNum(n))}</a> <span class="serif">${esc(b?b.title:'')}</span><span class="v">${plural(c,'mention')}</span></li>`}).join('')}</ol>`:'<p class="small muted">Nothing yet.</p>'}</div>`;
    h+=`<div class="card"><h2>Most talked-about bills</h2><p class="desc">Bills mentioned most in Utah news coverage.</p><div class="grid2">${row(M.trending.day||[],'Last 24 hours')}${row(M.trending.week||[],'Last 7 days')}</div></div>`}
  return h;
}
let MQ=null;
function mavHTML(){
  const V=loadMAV();const S=UI.session;
  return `<h2>Media availabilities</h2><p class="desc">House and Senate leaders’ media availabilities, streamed live on Facebook, transcribed and summarized after they finish: topics, bills mentioned, and who said what.</p>
   ${isAdmin()?`<form class="filters" id="mavForm"><div class="field grow"><label for="mavUrl">Analyze a Facebook video</label><input id="mavUrl" placeholder="https://www.facebook.com/…/videos/…"></div><button class="btn">Add</button></form><p class="tiny muted" style="margin-top:-8px">New videos on the House and Senate pages are picked up automatically when Facebook allows it. If one is missed, paste its link here.${MQ&&MQ.length?' Waiting: '+MQ.filter(q=>q.status==='waiting').length+'. '+MQ.filter(q=>q.status==='failed').map(q=>`Couldn’t fetch ${esc(q.label||q.url)}: ${esc(q.note||'')}`).join(' '):''}</p>`:''}
   ${V&&V.items&&V.items.length?V.items.slice(0,4).map((x,i)=>`<details class="disc" ${i===0?'open':''}><summary style="cursor:pointer;list-style:none"><div class="kicker">${x.date?fmtLong(new Date(x.date)):''}${x.mins?' · '+x.mins+' min':''}</div><h4>${esc(x.label)}</h4></summary>
     <p>${esc(x.summary||'')}</p>${(x.topics||[]).length?`<div class="tags">${x.topics.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div>`:''}${(x.bills||[]).length?`<p class="small"><b>Bills mentioned:</b> ${x.bills.map(n=>{const k=`${S}/${String(n).replace(/[\s.]/g,'').replace(/^([A-Z]+)(\d+)$/,(m,a,d)=>a+d.padStart(4,'0'))}`;return BYKEY[k]?`<a href="${billHref(BYKEY[k])}">${esc(n)}</a>`:esc(n)}).join(', ')}</p>`:''}
     ${(x.quotes||[]).length?`<ul>${x.quotes.map(q=>`<li><a class="ts" href="${esc(x.url)}" target="_blank" rel="noopener">${clock(q.t)}</a><span><b>${esc(q.who)}:</b> “${esc(q.text)}”</span></li>`).join('')}</ul>`:''}
     <div class="links"><a href="${esc(x.url)}" target="_blank" rel="noopener">Watch on Facebook</a>${(x.transcript||[]).length?`<a href="https://claude.ai/new?q=${encodeURIComponent('Summarize this Utah Legislature media availability ('+x.label+'). List the topics, any bills mentioned, and notable quotes with who said them when the transcript makes it clear. Automatic transcript:\n\n'+x.transcript.map(t=>t[1]).join(' ').slice(0,6000))}" target="_blank" rel="noopener">Summarize in Claude</a>`:''}${x.src==='ai'?'<span class="tiny muted">AI summary; speaker names come from the transcript and can be wrong.</span>':''}</div></details>`).join(''):'<p class="empty">No media availabilities analyzed yet.</p>'}`;
}


// Hover text for the tags: what the collision is, or what was said about the Attorney General.
function collTip(b){
  const c=(collisions()[b.key]||[]).filter(x=>x.nd).sort((x,y)=>y.nd-x.nd);
  return `Amends the same Utah Code as ${plural(c.length,'other bill')}, with different wording:\n`+c.slice(0,5).map(x=>`• ${shortNum(x.other.num)}, ${x.other.title}: Section ${x.sec}, different in ${x.diff.slice(0,3).join(', ')}${x.nd>x.diff.length?' and more':''}`).join('\n')+(c.length>5?`\n• …and ${c.length-5} more`:'')+'\n\nUsually needs a coordination clause. Click to see every collision.';
}
function agTip(b){
  const q=(b.tx||[]).flatMap(t=>(t.ag||[]).map(a=>({t,a}))).sort((x,y)=>(y.t.date||'').localeCompare(x.t.date||''));
  if(!q.length)return `The Attorney General came up ${plural(b.agm||0,'time')} in hearing or floor transcripts. Click to read them.`;
  const cut=s=>{s=String(s).replace(/\s+/g,' ').trim();return s.length>190?s.slice(0,190)+'…':s};
  return `The Attorney General came up ${plural(q.length,'time')}:\n`+q.slice(0,3).map(({t,a})=>`• “${cut(a[1])}”\n   ${t.label}${t.date?', '+fmtMD(pd(t.date)):''}`).join('\n')+(q.length>3?`\n• …and ${q.length-3} more`:'')+'\n\nClick to read them with the video.';
}
// Clicking a tag opens the bill on the right tab and scrolls to that section.
let PENDJUMP=null;
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('[data-jump]');if(!a)return;const [key,tab,id]=a.dataset.jump.split('|');PENDJUMP={key,tab,id};
  if(location.hash===a.getAttribute('href')){e.preventDefault();BILLTAB=tab;route()}},true);
function billExtraBind(){
  if(PENDJUMP&&location.hash.startsWith('#bill-')){const j=PENDJUMP;const el=document.getElementById('bs-'+j.id);if(el){PENDJUMP=null;
    // Scroll a few times: data that finishes loading re-draws the page and can put the scroll back.
    const go=(flash)=>{const e2=document.getElementById('bs-'+j.id);if(!e2||!location.hash.startsWith('#bill-'))return;const t=j.id==='discussed'&&e2.querySelector('.disc.hasag .agbox')||e2;const r=t.getBoundingClientRect();if(Math.abs(r.top-16)>40)scrollTo(0,scrollY+r.top-16);if(flash){const f=t.closest('.disc')||e2;f.classList.add('flash');setTimeout(()=>f.classList.remove('flash'),1800)}};
    setTimeout(()=>go(true),60);setTimeout(()=>go(),700);setTimeout(()=>go(),1600)}}
  app.querySelectorAll('[data-billtab]').forEach(b=>b.onclick=()=>{BILLTAB=b.dataset.billtab;route(true)});
  on('billJump','onchange',e=>{const [t,id]=e.target.value.split('|');if(!t)return;e.target.blur();BILLTAB=t;route();
    setTimeout(()=>{const el=document.getElementById('bs-'+id);if(el){el.scrollIntoView({behavior:'smooth',block:'start'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),1600)}},60)});
  on('mavForm','onsubmit',async e=>{e.preventDefault();try{const j=await api('media/queue',{url:$('mavUrl').value.trim()});MQ=j.queue;toast('Added. It’s analyzed on the next run (within about 30 minutes on session weekdays), or run “Media availability analysis” from GitHub Actions.');route(true)}catch(err){toast(err.message)}});
  if(isAdmin()&&MQ===null&&location.hash.slice(1).split('-')[0]==='updates'){MQ=[];api('media/queue').then(j=>{MQ=j.queue||[];if(MQ.length)route(true)}).catch(()=>{})}
}

// ---------- Legislature in the news: recent stories about the Legislature from Utah newsrooms
let LEGNEWS_ALL=false;
function agoText(iso){if(!iso)return '';const d=new Date(iso.length>10?iso+'Z':iso);const m=Math.round((Date.now()-d)/6e4);if(m<60)return `${Math.max(1,m)} min ago`;const h=Math.round(m/60);if(h<24)return `${h} hr ago`;const dd=Math.round(h/24);return dd===1?'Yesterday':dd<7?`${dd} days ago`:fmtMD(d)}
function legNewsHTML(){
  const M=loadMedia();if(!M)return '';
  const L=M.leg||[];const show=LEGNEWS_ALL?L:L.slice(0,6);
  const ini=s=>esc((s||'').split(/\s+/).filter(w=>/^[A-Z0-9]/.test(w)).map(w=>w[0]).join('').slice(0,3));
  return `<div class="card" id="legNews"><h2>${ic('news','h')}Legislature in the news</h2><p class="desc">The latest stories about the Legislature from Utah newsrooms. Click a story to read it on the news site.</p>
   ${L.length?`<div class="lnews">${show.map(x=>`<a class="ln" href="${esc(x.u)}" target="_blank" rel="noopener">${x.img?`<img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;ln-ph&quot;>${ini(x.src)}</span>'">`:`<span class="ln-ph">${ini(x.src)}</span>`}<span class="ln-b"><b>${esc(x.t)}</b><span class="ln-m">${esc(x.src)} · ${esc(agoText(x.date))} ${ic('external')}</span></span></a>`).join('')}</div>
    ${L.length>6?`<button type="button" class="linkbtn small" id="legNewsMore" style="margin-top:8px">${LEGNEWS_ALL?'Show fewer':`Show all ${L.length} stories`}</button>`:''}`
   :'<p class="empty">No stories yet. They appear after the next data update.</p>'}
   ${M.fetched?`<p class="tiny muted" style="margin-top:8px">Checked ${esc(agoText(M.fetched))} · ${esc((M.sources||[]).filter(s=>s.ok).map(s=>s.name).join(', '))}</p>`:''}</div>`;
}
document.addEventListener('click',e=>{if(e.target&&e.target.id==='legNewsMore'){LEGNEWS_ALL=!LEGNEWS_ALL;route(true)}});
