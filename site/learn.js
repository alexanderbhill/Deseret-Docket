/* Learn the Legislature: visual games and guides for interns and new staff.
   Face match · Who Said It? (real quotes from hearing recordings) · How a bill becomes law ·
   Floor and calendar vocabulary · Meet the members. */
'use strict';
let LG={score:0,streak:0,best:lsGet('docket-learn-best',{}),q:null,answered:null};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const legTitle=l=>`${l.house==='H'?'Rep.':'Sen.'} ${l.name}`;
const GAMES=[['faces','🧑‍⚖️ Face match'],['map','🗺️ District map'],['party','🗳️ Red or blue?'],['facts','✨ Fun facts'],['quotes','💬 Who said it?'],['redo','🏛️ Capitol quirks'],['terms','📖 Floor vocabulary'],['agquiz','⚡ AG Office Showdown']];
function lgBest(k,v){if(v>(LG.best[k]||0)){LG.best[k]=v;lsSet('docket-learn-best',LG.best)}
  // Post to the shared leaderboard when it beats what the board has for you.
  if(ME&&LGB&&v>(((LGB.board[ME.user]||{}).s||{})[k]||0))api('lgboard',{game:k,score:v}).then(j=>{LGB=j}).catch(()=>{})}
// ---------- flagged questions: two different people flagging a question removes it for everyone
let LGF=null;
function loadFlags(){if(LGF===null){LGF={};if(ME)api('lgflags').then(j=>{LGF=j.flags||{};if(location.hash.startsWith('#learn'))route(true)}).catch(()=>{})}return LGF}
const hash32=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)};
function qidOf(sub,q){if(!q)return '';if(sub==='faces'||sub==='party')return q.l?`${sub}:${q.l.id}`:'';if(sub==='facts')return q.l&&q.fact?`facts:${q.l.id}:${hash32(q.fact[0])}`:'';if(sub==='quotes')return q.q?`quotes:${hash32(q.q)}`:'';if((sub==='redo'||sub==='terms')&&q.t)return `${sub}:${hash32(q.t[0])}`;if(sub==='map'&&q.l)return `map:${q.ch}:${q.l.id}:${q.mode}`;return ''}
const isHidden=id=>id&&(loadFlags()[id]||[]).length>=2;
// ---------- leaderboard: everyone's best streak in each game (best points for Put it in order)
let LGB=null, LGBGAME='all';
function loadBoard(){if(LGB===null&&ME){LGB=undefined;api('lgboard').then(j=>{LGB=j;
  // Send any personal bests from this browser the board doesn't have yet.
  const mine=(j.board[j.me]||{}).s||{};for(const [k] of GAMES)if((LG.best[k]||0)>(mine[k]||0))api('lgboard',{game:k,score:LG.best[k]}).then(x=>{LGB=x}).catch(()=>{});
  if(location.hash.startsWith('#learn'))route(true)}).catch(()=>{LGB={board:{},me:ME.user}})}return LGB}
// The "All games" total: each game counts up to 100 points, your best as a share of the office's best in that game,
// so piling up one game can't outweigh the others.
const LGB_CAP=100;
function boardHTML(){
  if(!ME)return `<div class="card"><h2>🏆 Leaderboard</h2><p class="desc">Sign in to put your scores on the office leaderboard.</p></div>`;
  const B=loadBoard();if(!B)return '<div class="card"><p>Loading the leaderboard…</p></div>';
  const top={};for(const x of Object.values(B.board))for(const [k,v] of Object.entries(x.s||{}))top[k]=Math.max(top[k]||0,v);
  const pts=(s,k)=>s&&top[k]?Math.round(LGB_CAP*s/top[k]):0;
  const g=LGBGAME, rows=Object.entries(B.board).map(([u,x])=>({u,n:x.n||u,v:g==='all'?GAMES.reduce((a,[k])=>a+pts((x.s||{})[k],k),0):((x.s||{})[g]||0),s:x.s||{}})).filter(r=>r.v>0).sort((a,b)=>b.v-a.v||a.n.localeCompare(b.n));
  let rank=0,prev=null;rows.forEach((r,i)=>{if(r.v!==prev){rank=i+1;prev=r.v}r.rank=rank});
  const medal=n=>n===1?'🥇':n===2?'🥈':n===3?'🥉':n;
  const unit=g==='agquiz'?'Best score':'Best streak';
  return `<div class="card"><h2>🏆 Leaderboard</h2><p class="desc">${g==='all'?`Every game counts the same: each is worth up to ${LGB_CAP} points, your best compared with the office’s best in that game. Playing one game over and over can’t earn more than ${LGB_CAP}, so the top spot goes to whoever does well across all ${GAMES.length}.`:`Everyone’s ${unit.toLowerCase()} in this game.`}</p>
   <div class="seg lgb-seg" role="group" aria-label="Game">${[['all','All games'],...GAMES].map(([k,l])=>`<button type="button" data-lgb="${k}" class="${g===k?'on':''}">${l}</button>`).join('')}</div>
   ${rows.length?`<table class="lgb"><thead><tr><th>#</th><th>Player</th>${g==='all'?GAMES.map(([k,l])=>`<th class="n hide-m" title="${esc(l.replace(/^\S+\s/,''))}">${l.split(' ')[0]}</th>`).join(''):''}<th class="n">${g==='all'?`Total <span class="tiny muted">of ${GAMES.length*LGB_CAP}</span>`:unit}</th></tr></thead><tbody>${rows.slice(0,50).map(r=>`<tr class="${r.u===B.me?'me':''}"><td>${medal(r.rank)}</td><td>${esc(r.n)}${r.u===B.me?' <span class="tiny muted">(you)</span>':''}</td>${g==='all'?GAMES.map(([k])=>`<td class="n hide-m" ${r.s[k]?`title="Your best: ${r.s[k].toLocaleString()} · office best: ${(top[k]||0).toLocaleString()}"`:''}>${r.s[k]?pts(r.s[k],k):''}</td>`).join(''):''}<td class="n"><b>${r.v.toLocaleString()}</b></td></tr>`).join('')}</tbody></table>`:'<p class="empty">No scores yet. Play a game to get on the board.</p>'}</div>`;
}
// ---------- keyboard: 1–4 (or R and D) to answer, Enter, space or → for the next card
document.addEventListener('keydown',e=>{
  if(!location.hash.startsWith('#learn')||e.metaKey||e.ctrlKey||e.altKey)return;
  const el=document.activeElement;if(el&&(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||el.isContentEditable))return;
  const card=document.querySelector('#app .card.lg');if(!card)return;
  const next=$('lgNext');
  if(next&&(e.key==='Enter'||e.key===' '||e.key==='ArrowRight')){e.preventDefault();next.click();return}
  const btns=[...card.querySelectorAll('[data-lgface],[data-lgquote],[data-lgparty],[data-lgfact],[data-lgquirk],[data-lgterm],[data-lgmapface]')].filter(b=>!b.disabled);
  if(!btns.length)return;
  let b=null;const k=e.key.toLowerCase();
  if(/^[1-9]$/.test(k))b=btns[+k-1];else if(k==='r'||k==='d')b=btns.find(x=>x.dataset.lgparty===k.toUpperCase());
  if(b){e.preventDefault();b.click()}
});
const keyHint=(n=4)=>`<p class="tiny muted lg-keys">Keys: <kbd>1</kbd>–<kbd>${n}</kbd> to answer · <kbd>Enter</kbd> for the next one</p>`;

const STEPS=[
 ['Bill file opened','A legislator asks Legislative Research and General Counsel to draft a bill. Only the title is public at first.','📝'],
 ['Numbered and introduced','The bill gets a number (H.B. 12, S.B. 3) and a first reading on the floor of the house where it started.','🔢'],
 ['Rules Committee','Rules decides which standing committee hears it. Bills can sit in Rules a long time, or never leave.','🗂️'],
 ['Standing committee hearing','The sponsor presents, the public testifies, and the committee votes: favorable, held, amended or substituted.','🏛️'],
 ['Second reading calendar','Back on the floor. In the Senate, bills are debated and voted on second reading too.','📋'],
 ['Third reading and final vote','The final debate and vote in that house. A bill can be circled (put on hold) and uncircled later.','🗳️'],
 ['The other house','It all repeats in the second chamber: Rules, committee, second and third readings.','🔁'],
 ['Concurrence','If the second house changed the bill, the first house must agree (concur) to the changes.','🤝'],
 ['Enrolled','The final text is prepared and signed by the Speaker and the Senate President.','✒️'],
 ['Governor','The governor has 20 days after the session ends to sign or veto. Bills not acted on become law without a signature.','🏢'],
 ['Effective date','Most bills take effect in early May. Some take effect on signing or another date in the bill.','📅'],
];
const TERMS=[
 ['Circled','A bill is placed on hold on the floor until a member moves to uncircle it.',['Sent back to committee for good','Passed with no debate','Combined with another bill']],
 ['Sine die','The final adjournment of the session, at midnight on the 45th day.',['The first day of the session','A vote to override a veto','A tie vote']],
 ['Fiscal note','The Legislature’s estimate of what a bill would cost or save the state.',['A note from a lobbyist','The sponsor’s opening remarks','A list of cosponsors']],
 ['Substitute','A new version of the bill that replaces the old one (1st Sub., 2nd Sub.).',['An amendment from the governor','A bill from the other house','A backup sponsor']],
 ['Rules Committee','The committee that assigns bills to standing committees and manages the floor calendar.',['The committee that writes the budget','The ethics committee','A conference committee']],
 ['Concurrence','The first house’s vote to accept changes the second house made.',['A joint hearing','A veto override','A motion to adjourn']],
 ['Enrolled bill','The final, official version passed by both houses, sent to the governor.',['A bill that hasn’t been numbered','A bill held in committee','A bill with no sponsor']],
 ['Coordination clause','Language that reconciles two bills amending the same code section.',['A clause naming the sponsor','A sunset date','A funding formula']],
 ['Consent calendar','A list of uncontroversial bills passed together with little debate.',['Bills awaiting the governor','Bills that failed','Bills with fiscal notes']],
 ['Strike the enacting clause','A motion that kills the bill.',['A motion to pass the bill','A motion to amend the title','A motion to substitute']],
 ['Veto override session','A session the Legislature can call to override the governor’s vetoes.',['The first week of session','A budget hearing','A special election']],
 ['Interim','The months between sessions when committees study issues and draft bills.',['The last week of session','A recess during floor debate','A vote by mail']],
];

// Games you play and guides you read, kept apart. External links open in a new tab.
const LEARN_PLAY=[['faces','🧑‍⚖️','Face match','See a photo, pick the legislator. Then flip it: see a name, pick the face.'],
 ['map','🗺️','District map','Find a legislator’s district on the map of Utah, or name who represents the gold one.'],
 ['party','🗳️','Red or blue?','Guess whether each legislator is a Republican or a Democrat from the photo.'],
 ['facts','✨','Fun facts','A clue about someone’s job, hometown or years in office. Who is it?'],
 ['quotes','💬','Who said it?','A real line from a committee hearing. Guess which legislator said it.'],
 ['redo','🏛️','Capitol quirks','Jell-O, the state dinosaur, a 45-day session: odd bills and fun facts from Utah’s Legislature.'],
 ['terms','📖','Floor vocabulary','Circled, sine die, concurrence… learn the words you’ll hear on day one.'],
 ['agquiz','⚡','AG Office Showdown','A fast, timed quiz on the Attorney General’s Office: its history, leaders, big cases and priorities.'],
 ['board','🏆','Leaderboard','See who in the office has the longest streak in each game.']];
const LEARN_READ=[['process','🛤️','How a bill becomes law','Where bill ideas come from, who drafts and prices them, every step to the governor, and how the budget gets built.'],
 ['ag','⚖️','The AG’s Office, explained','Counselors, protectors and stewards: the org chart, what each division does, the office in the news, and fun facts.'],
 ['districts','📍','Where every legislator is','A map of Utah with a dot for each senator or representative, colored by party.'],
 ['members','👥','Members and their bills','Every legislator with a photo, ranked by how many bills they’re sponsoring this session.'],
 ['https://utahsenate.smugmug.com','📸','Utah Senate photos','The Senate’s photo galleries: floor sessions, committee hearings, bill signings and Capitol events.'],
 ['https://adambrown.info/p/research/utah_legislature','📊','Adam Brown’s guide to the Legislature','A BYU political scientist’s data on every session: bill statistics, how legislators vote, ideology scores and rankings.']];
function learnTile([k,i,t,d]){const ext=/^https?:/.test(k);
  return `<a class="learn-tile${ext?' ext':''}" href="${ext?k:'#learn-'+k}"${ext?' target="_blank" rel="noopener"':''}><span class="ico">${i}</span><b>${t}${ext&&typeof ic==='function'?ic('external'):''}</b><span>${d}</span>${!ext&&LG.best[k]?`<span class="best">Best: ${LG.best[k]}</span>`:''}${ext?`<span class="tiny muted">${esc(k.replace(/^https?:\/\/(www\.)?/,'').split('/')[0])}</span>`:''}</a>`}
function pageLearn(sub,extra=''){
  if(LG.sub!==(sub||'')){LG.sub=sub||'';LG.q=null;LG.answered=null}
  if(!LEGS)return shell('learn','<div class="card"><p>Loading legislators…</p></div>');
  const cur=sub||'', chip=([k,i,t])=>/^https?:/.test(k)?'':`<a href="#learn-${k}" class="${cur===k?'on':''}">${i} ${t}</a>`;
  const head=`<div class="card learn-hero"><div><h2>Learn the Legislature</h2></div>
   <nav class="learn-nav" aria-label="Learn"><a href="#learn" class="${cur===''?'on':''}">🏠 Start</a></nav>
   <div class="learn-navs"><nav class="learn-nav" aria-label="Games"><span class="nav-l">Play</span>${LEARN_PLAY.map(chip).join('')}</nav>
   <nav class="learn-nav" aria-label="Guides"><span class="nav-l">Learn</span>${LEARN_READ.map(chip).join('')}</nav></div></div>`;
  const pick={faces:gameFaces,party:gameParty,redo:gameRedo,facts:gameFacts,quotes:gameQuotes,terms:gameTerms,map:()=>typeof gameMap==='function'?gameMap():'',agquiz:()=>typeof gameAG==='function'?gameAG():''};
  let body='';
  if(pick[sub])body=pick[sub]();else if(sub==='process')body=guideProcess();else if(sub==='members')body=memberGrid();else if(sub==='board')body=boardHTML();
  else if(sub==='districts')body=typeof refMap==='function'?refMap():'';else if(sub==='ag')body=typeof pageAGGuide==='function'?pageAGGuide():'';
  // Skip anything two people have flagged.
  for(let i=0;i<25&&body&&pick[sub]&&LG.q&&!LG.answered&&isHidden(qidOf(sub,LG.q));i++){LG.q=null;body=pick[sub]()}
  const qid=qidOf(sub,LG.q), mine=qid&&ME&&(loadFlags()[qid]||[]).includes(ME.user);
  if(qid&&ME&&body.startsWith('<div class="card lg"'))body=body.slice(0,-6)+`<p class="lg-flag">${mine?'<span class="tiny muted">🚩 You flagged this question. It’s removed once someone else flags it too.</span> <button type="button" class="linkbtn tiny" data-lgunflag="'+esc(qid)+'">Undo</button>':'<button type="button" class="linkbtn tiny" data-lgflag="'+esc(qid)+'" title="Wrong, confusing or has more than one right answer? Two flags remove it.">🚩 Flag this question</button>'}</p></div>`;
  if(body.startsWith('<div class="card lg"')&&body.endsWith('</div>')&&!(sub==='map'&&LG.q&&LG.q.mode==='where'))body=body.slice(0,-6)+(sub==='party'?`<p class="tiny muted lg-keys">Keys: <kbd>R</kbd> or <kbd>D</kbd> to answer · <kbd>Enter</kbd> for the next one</p>`:keyHint())+'</div>';
  if(!body) body=`<h3 class="learn-sec">${typeof ic==='function'?ic('trophy'):''} Play</h3><p class="small muted learn-sec-d">Quick games to learn faces, districts and the vocabulary. Your best streaks go on the office leaderboard.</p>
   <div class="learn-grid">${LEARN_PLAY.map(learnTile).join('')}</div>
   <h3 class="learn-sec">${typeof ic==='function'?ic('book'):''} Learn</h3><p class="small muted learn-sec-d">Guides and references to read at your own pace.</p>
   <div class="learn-grid">${LEARN_READ.map(learnTile).join('')}</div>`;
  return shell('learn',head+body+extra);
}

// ---------- face match
function newFaceQ(rev){
  const pool=LEGS.filter(l=>l.id);const l=pool[Math.floor(Math.random()*pool.length)];
  const others=shuffle(pool.filter(x=>x.id!==l.id&&x.house===l.house)).slice(0,3);
  LG.q={l,opts:shuffle([l,...others]),rev};LG.answered=null;
}
function gameFaces(){
  if(!LG.q||!LG.q.opts||LG.q.kind!=='face'){newFaceQ(Math.random()<.3);LG.q.kind='face'}
  const {l,opts,rev}=LG.q, a=LG.answered;
  const fb=a?(a===l.id?`<div class="lg-fb ok">Yes! That’s ${esc(legTitle(l))}, ${l.house==='H'?'House':'Senate'} District ${esc(l.district)}${legWhere(l)?` (${esc(legWhere(l))})`:''}.</div>`:`<div class="lg-fb no">Not quite. That’s ${esc(legTitle(l))}, ${l.house==='H'?'House':'Senate'} District ${esc(l.district)}.</div>`):'';
  return `<div class="card lg"><div class="lg-top"><h2>${rev?'Which one is…':'Who is this?'}</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.faces||0}</b></div></div>
   ${rev?`<p class="lg-name">${esc(legTitle(l))}</p><div class="lg-faces">${opts.map((o,i)=>`<button class="lg-face ${a?(o.id===l.id?'right':o.id===a?'wrong':''):''}" data-lgface="${esc(o.id)}" ${a?'disabled':''} aria-label="Option ${i+1}"><span class="kn">${i+1}</span><img src="${esc(legPhoto(o))}" alt="" loading="lazy">${a?`<span>${esc(o.name)}</span>`:''}</button>`).join('')}</div>`
   :`<div class="lg-photo"><img src="${esc(legPhoto(l))}" alt="Photo of a legislator"></div><div class="lg-opts">${opts.map((o,i)=>`<button class="btn lg-opt ${a?(o.id===l.id?'right':o.id===a?'wrong':''):''}" data-lgface="${esc(o.id)}" ${a?'disabled':''}><span class="kn">${i+1}</span>${esc(legTitle(o))}</button>`).join('')}</div>`}
   ${fb}${a?'<p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>':''}</div>`;
}

// ---------- red or blue? (party from the photo)
function gameParty(){
  if(!LG.q){const pool=LEGS.filter(l=>l.party==='R'||l.party==='D');const ds=pool.filter(l=>l.party==='D'),rs=pool.filter(l=>l.party==='R');const src=Math.random()<.4?ds:rs;LG.q={l:src[Math.floor(Math.random()*src.length)]};LG.answered=null}
  const {l}=LG.q,a=LG.answered;
  return `<div class="card lg"><div class="lg-top"><h2>Republican or Democrat?</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.party||0}</b></div></div>
   <div class="lg-photo"><img src="${esc(legPhoto(l))}" alt="Photo of a legislator"></div>
   <div class="lg-opts"><button class="btn lg-opt party-btn r ${a?(l.party==='R'?'right':a==='R'?'wrong':''):''}" data-lgparty="R" ${a?'disabled':''}><span class="kn">R</span>Republican</button><button class="btn lg-opt party-btn d ${a?(l.party==='D'?'right':a==='D'?'wrong':''):''}" data-lgparty="D" ${a?'disabled':''}><span class="kn">D</span>Democrat</button></div>
   ${a?`<div class="lg-fb ${a===l.party?'ok':'no'}">${a===l.party?'Right!':'Not this time.'} ${esc(legTitle(l))} is a ${l.party==='R'?'Republican':'Democrat'} representing ${l.house==='H'?'House':'Senate'} District ${esc(l.district)}${legWhere(l)?` (${esc(legWhere(l))})`:''}.</div><p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:''}</div>`;
}
// ---------- fun facts (job, hometown counties, years in office, committees, and facts an admin added)
let LEGFACTS=null;
function loadLegFacts(){if(LEGFACTS===null){LEGFACTS={};if(ME)api('legfacts').then(j=>{LEGFACTS=j.facts||{};route(true)}).catch(()=>{})}return LEGFACTS}
function factsFor(l){
  // [clue shown in the question, the same fact with a pronoun for the answer]
  const f=[];const p=pron(l);
  const words=s=>(s||'').toLowerCase().split(/[^a-z]+/).filter(w=>w.length>3);
  const cs=s=>(s||'').split(/\s*,\s*|\s+and\s+/).map(x=>x.replace(/\s*count(y|ies)$/i,'').trim().toLowerCase()).filter(Boolean);
  if(l.profession){const job=l.profession.replace(/\s*\/\s*/g,' / ');const jw=words(job);f.push([`Outside the Legislature, this legislator works as: ${job}.`,`Outside the Legislature, ${p.s} works as: ${job}.`,o=>words(o.profession).some(w=>jw.includes(w))])}
  if(l.since){const y=(l.since.match(/\d{4}/)||[])[0];if(y)f.push([`This legislator has served since ${y}.`,`${p.S} has served since ${y}.`,o=>(o.since||'').includes(y)])}
  if(l.counties){const c=`${l.counties.includes(',')?'parts of ':''}${l.counties} ${l.counties.includes(',')?'counties':'County'}`;const mine=cs(l.counties);f.push([`This legislator’s district covers ${c}.`,`${p.P} district covers ${c}.`,o=>cs(o.counties).some(x=>mine.includes(x))])}
  const ch=(typeof loadComs==='function'?loadComs():[]).filter(c=>(c.members||[]).some(m=>m.id===l.id&&/chair/i.test(m.pos||'')));
  if(ch.length)f.push([`This legislator chairs the ${ch[0].name}.`,`${p.S} chairs the ${ch[0].name}.`,o=>(ch[0].members||[]).some(m=>m.id===o.id&&/chair/i.test(m.pos||''))]);
  for(const x of (loadLegFacts()[l.id]||[]))f.push([x.replace(/\b(She|He)\b/g,'This legislator').replace(/\b(she|he)\b/g,'this legislator').replace(/\b(Her|His)\b/g,'This legislator’s').replace(/\b(her|his)\b/g,'this legislator’s'),x]);
  return f;
}
function gameFacts(){
  if(!LG.q){const pool=shuffle(LEGS.filter(l=>factsFor(l).length));if(!pool.length)return '<div class="card"><p>Loading…</p></div>';const l=pool[0];const fs=factsFor(l);const fact=fs[Math.floor(Math.random()*fs.length)];
    const fits=fact[2]||(()=>false);const others=shuffle(LEGS.filter(o=>o.id!==l.id&&o.house===l.house&&!fits(o))).slice(0,3);
    if(others.length<3){LG.q=null;return gameFacts()}LG.q={l,fact,opts:shuffle([l,...others])};LG.answered=null}
  const {l,fact,opts}=LG.q,a=LG.answered;
  return `<div class="card lg"><div class="lg-top"><h2>Who is it?</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.facts||0}</b></div></div>
   <blockquote class="lg-quote">✨ ${esc(fact[0])}</blockquote>
   <div class="lg-faces">${opts.map((o,i)=>`<button class="lg-face ${a?(o.id===l.id?'right':o.id===a?'wrong':''):''}" data-lgfact="${esc(o.id)}" ${a?'disabled':''}><span class="kn">${i+1}</span><img src="${esc(legPhoto(o))}" alt="" loading="lazy"><span>${esc(legTitle(o))}</span></button>`).join('')}</div>
   ${a?`<div class="lg-fb ${a===l.id?'ok':'no'}">${a===l.id?'Right!':'Not quite.'} It’s ${esc(legTitle(l))}. ${esc(fact[1])}</div><p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:''}
   ${isAdmin()?`<details class="small" style="margin-top:12px"><summary>Add a fun fact about a legislator</summary><form id="factForm" class="filters" style="margin-top:8px"><div class="field"><label for="factLeg">Legislator</label><select id="factLeg">${LEGS.slice().sort((x,y)=>x.full.localeCompare(y.full)).map(o=>`<option value="${o.id}">${esc(o.full)}</option>`).join('')}</select></div><div class="field grow"><label for="factTxt">Fact (write it about them, e.g. “She ran the Boston Marathon.”)</label><input id="factTxt" maxlength="200"></div><button class="btn">Add</button></form></details>`:''}</div>`;
}

// ---------- Capitol quirks: fun facts, odd bills and how Utah's short session compares
const REDO_QUOTES={
 h:['“In the legislature, promptitude of decision is oftener an evil than a benefit.”','Alexander Hamilton, Federalist No. 70 (1788)','https://avalon.law.yale.edu/18th_century/fed70.asp'],
 c:['“It appears that the act was conceived and passed in haste, on March 9, 1961, in the compulsory closing hours of an overtaxed legislature, producing an unconstitutional pregnancy, resulting in a birth in which its legislative pains could not be anaesthetized by any proper judicial ministration.”','Utah Supreme Court (1962)','https://law.justia.com/cases/utah/supreme-court/1962/9697-0.html'],
 m:['“It will be of little avail to the people, that the laws are made by men of their own choice, if the laws be so voluminous that they cannot be read, or so incoherent that they cannot be understood.”','James Madison, Federalist No. 62 (1788)','https://avalon.law.yale.edu/18th_century/fed62.asp'],
 t:['“No man’s life, liberty, or property are safe while the Legislature is in session.”','Judge Gideon J. Tucker, New York Surrogate’s Court (1866)',''],
 b:['“Laws, like sausages, cease to inspire respect in proportion as we know how they are made.”','Often credited to Otto von Bismarck, but probably first said by the poet John Godfrey Saxe (1869)',''],
 j:['“There’s always room for Jell-O.”','Jell-O’s long-running advertising slogan',''],
 u:['“Industry”','Utah’s state motto, adopted in 1959 along with the beehive emblem','']};
// [question, answer, wrong answers, what to know, source link, which quote to show (a key of REDO_QUOTES)]
const QUIRKS=[
 ['Utah’s general session lasts 45 days. In 2025, which was the only other state with a regular session that short?','Virginia',['Texas','California','Montana'],'Most legislatures meet for four months or more, and some meet all year. Only 11 states put no limit on session length at all. A short session packs hundreds of final votes into the last few nights, which is when mistakes slip in.',''],
 ['Before Utah settled on a 45-day session in the early 1980s, what did it have?','A 60-day session one year and a 20-day budget session the next',['A 90-day session every year','No time limit','A 10-day session'],'The 45-day general session replaced the old pattern. Even then, people worried that a short session forces lawmakers to rush.',''],
 ['In 1962, the Utah Supreme Court looked at an act passed in the “compulsory closing hours” of the 1961 session. What did it find?','It was unconstitutional',['It was the best law of the year','It had never been voted on','It belonged to another state'],'The court blamed the haste of the last night of session. Its full sentence is one of the most colorful lines in a Utah opinion (see below).','https://law.justia.com/cases/utah/supreme-court/1962/9697-0.html','c'],
 ['Texas’s legislature meets for how long?','140 days, every other year',['45 days a year','All year round','Two weeks a year'],'A few states still meet only every other year. Utah meets every year, but for fewer days than almost anyone. Alexander Hamilton might have approved of taking it slow (see below).','','h'],
 ['In 2001, the Utah Senate passed a resolution recognizing which food as “a favorite snack food of Utah”?','Jell-O',['Fry sauce','Funeral potatoes','Snelgrove’s ice cream'],'S.R. 5 followed a BYU student campaign with more than 14,000 signatures. During debate a few senators joked that the state snack should come from Utah, like Snelgrove’s ice cream.','https://le.utah.gov/~2001/bills/sbillenr/SR0005.pdf','j'],
 ['Who talked Sen. Curt Bramble into sponsoring the 2018 bill that made the Utahraptor the state dinosaur?','A 10-year-old boy',['A museum lobbyist','The governor','A paleontology professor'],'Kenyon Roberts first wanted the Utahraptor to replace the Allosaurus as the state fossil. The compromise kept the Allosaurus and added a brand-new symbol: state dinosaur.','https://onlinelibrary.utah.gov/state-symbol/dinosaur/'],
 ['The bill making the Gila monster Utah’s state reptile in 2019 was pushed by whom?','Students at Lava Ridge Intermediate School in Santa Clara',['A reptile breeders’ group','The Division of Wildlife Resources','A Utah Jazz player'],'H.B. 144 passed the Senate unanimously in the closing minutes of the 2019 session. It was the last thing the Legislature did that year.','https://www.stgeorgeutah.com/news/archive/2019/03/18/lgl19-jmr-lava-ridge-students-persuade-lawmakers-to-make-gila-monster-utahs-state-reptile/'],
 ['In 2011, Utah named an official state firearm. Which one?','The Browning M1911 pistol',['The Winchester rifle','The Colt Peacemaker','The Remington shotgun'],'John Browning was born in Ogden. Utah is often credited as the first state to name an official firearm.','https://sltrib.com/news/politics/2019/01/19/utahs-state-reptile-gila'],
 ['Utah’s official state cooking pot is the…','Dutch oven',['Crock-Pot','Cast-iron skillet','Pressure cooker'],'The Legislature named it in 1997. It sits in the same section of code as the state bird (the California gull) and the state animal (the elk).',''],
 ['A Daybreak Elementary-backed bill to name a state dog fell short. Which breed was it?','Golden retriever',['Border collie','German shepherd','Labrador retriever'],'Student-backed state symbols are a session tradition, but not all of them make it.','https://sltrib.com/news/politics/2019/01/19/utahs-state-reptile-gila'],
 ['Which work of land art in the Great Salt Lake became Utah’s state work of art in 2016?','The Spiral Jetty',['Sun Tunnels','The Tree of Utah','Gilgal Garden'],'H.B. 134 (2016) designated it. Robert Smithson built the 1,500-foot coil of rock in 1970.','https://le.utah.gov/~2016/bills/hbillint/HB0134.pdf'],
 ['What was the very first state symbol the Utah Legislature adopted, on April 3, 1896?','The Great Seal',['The beehive','The sego lily','The state flag'],'It came in the Legislature’s first regular session after statehood. The beehive emblem wasn’t made official until 1959.','','u'],
 ['Utah adopted a new state flag in 2023. About how many designs did people submit?','More than 7,000',['About 50','About 400','More than 100,000'],'An earlier bill for a new flag in 2019 didn’t make it out of the Legislature.',''],
 ['In 2026, a lawmaker proposed limiting how many bills each legislator could introduce. What happened?','It went nowhere, and lawmakers introduced a record number of bills',['It passed unanimously','The governor vetoed it','It was struck down in court'],'The governor had even endorsed the idea in his State of the State address.','https://www.fox13now.com/news/politics/2026-utah-legislature-miscellaneous','m'],
 ['In the final hour of the 2018 session, the House raced through a bill lowering the penalty for keeping which animals in captivity?','Raccoons and coyotes',['Pet skunks','Bison','Gila monsters'],'Late-night bills often pass with little introduction and no debate.','https://www.ksl.com/article/46278350','t'],
 ['A law passed last year cites the wrong section of code. How does it usually get fixed?','A cleanup bill the next session',['The governor edits it','It fixes itself on the effective date','A court rewrites it'],'Bills that only fix errors, outdated references and typos are often called technical corrections bills. Many of them trace back to the last-night rush.','','b'],
];
// A shuffled deck per game, so nothing repeats until every question has been seen.
function deckNext(key,n){
  LG.decks=LG.decks||{};let d=LG.decks[key];
  if(!d||!d.left.length){let left=shuffle([...Array(n).keys()]);if(d&&d.last!=null&&left[0]===d.last&&n>1)left.push(left.shift());d={left,last:null};LG.decks[key]=d}
  d.last=d.left.shift();return d.last;
}
function gameRedo(){
  if(!LG.q||LG.q.kind!=='quirk'){const t=QUIRKS[deckNext('quirks',QUIRKS.length)];LG.q={kind:'quirk',t,opts:shuffle([t[1],...t[2]])};LG.answered=null}
  const {t,opts}=LG.q,a=LG.answered,ok=a===t[1];
  const quotes=`<div class="redo-q">${[REDO_QUOTES[t[5]]].filter(Boolean).map(q=>`<figure><blockquote>${esc(q[0])}</blockquote><figcaption>${q[2]?`<a href="${q[2]}" target="_blank" rel="noopener">${esc(q[1])}</a>`:esc(q[1])}</figcaption></figure>`).join('')}</div>`;
  const seen=QUIRKS.length-((LG.decks.quirks||{left:[]}).left.length);
  return `<div class="card lg"><div class="lg-top"><h2>Capitol quirks</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.redo||0}</b></div></div>
   <p class="lg-name" style="font-size:21px">${esc(t[0])}</p><div class="lg-opts col">${opts.map((o,i)=>`<button class="btn lg-opt ${a?(o===t[1]?'right':o===a?'wrong':''):''}" data-lgquirk="${esc(o)}" ${a?'disabled':''}><span class="kn">${i+1}</span>${esc(o)}</button>`).join('')}</div>
   ${a?`<div class="lg-fb ${ok?'ok':'no'}"><b>${ok?'Right!':'Not quite.'} ${esc(t[1])}.</b> ${esc(t[3])}${t[4]?` <a href="${t[4]}" target="_blank" rel="noopener">Source</a>`:''}</div>${t[5]?quotes:''}<p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:''}
   <p class="small muted" style="text-align:center">Question ${seen} of ${QUIRKS.length}. You won’t see one twice until you’ve seen them all.</p></div>`;
}

// ---------- who said it (presenter quotes from hearing transcripts, plus quotes people add)
let QUOTES=null, WSQ=null;
function loadWSQ(){if(WSQ===null){WSQ=[];if(ME)api('wsquotes').then(j=>{WSQ=j.quotes||[];QUOTES=null;route(true)}).catch(()=>{})}return WSQ}
// A quote is guessable when it names something: a bill, a committee, a place, a number.
const RECOG=/\b(this bill|the bill|bill (?:does|would|will)|committee|district|county|city|utah|salt lake|provo|ogden|st\.? george|logan|school|university|police|court|water|lake|tax|code|section|division|department|[0-9]{2,})\b/i;
function loadQuotes(){
  if(QUOTES!==null)return;QUOTES=undefined;
  const added=()=>loadWSQ().map(x=>({q:x.q,l:legById(x.id),ctx:x.ctx,by:x.by,mine:x.by===(ME&&ME.user),qid:x.at})).filter(x=>x.l);
  const S=INDEX.sessions.find(s=>s.txFiles>0);if(!S){QUOTES=shuffle(added());return}
  const go=async()=>{if(!BILLS[S.id])await loadSession(S.id);const out=[];
    for(const k of shuffle([...Array(S.txFiles).keys()]).slice(0,2)){const chunk=await loadTx(S.id,k);
    for(const b of BILLS[S.id].filter(x=>x.txc===k))for(const t of b.tx){const n=(t.notes||[]).find(x=>/presented the bill/i.test(x[2]));if(!n)continue;
      const m=n[2].match(/^(Rep|Sen)\.\s+(.+?)\s+presented/);if(!m)continue;const last=m[2].split(/\s+/).pop().toLowerCase();
      const l=LEGS.find(x=>(x.house==='H')===(m[1]==='Rep')&&(x.full||'').toLowerCase().startsWith(last+','));if(!l)continue;
      // Stop at the next timeline note (questions, public comment, the vote) so only the presenter's own words count.
      const nx=(t.notes||[]).map(x=>x[0]).filter(x=>x>n[0]+5).sort((p,q)=>p-q)[0];
      const lines=((chunk[b.num]||{})[t.key]||[]).filter(x=>x[0]>=n[0]+4&&x[0]<=Math.min(n[0]+90,nx?nx-3:Infinity));
      let txt=lines.map(x=>x[1]).join(' ').replace(/\b(uh|um|uh,|um,)\b,?\s*/gi,'').replace(/\s+/g,' ');
      txt=txt.replace(/^(.*?(chair|committee|members)[^.]*\.\s*)/i,'');const sents=(txt.match(/[^.?!]+[.?!]/g)||[]).map(x=>x.trim());
      const good=sents.filter(x=>{const w=x.split(/\s+/).length;return w>=8&&w<=40&&!/thank you|good to be here|mr\.? chair|madam chair|motion|favorabl|recommend|sorry|looking for|questions?\b|seeing none|any discussion|public comment|the floor|i'?m (?:here|joined)|with me today|turn (?:the time|it) over|i'?m an? (?:attorney|lawyer|resident|member|parent|teacher|business|citizen)|my name is|i represent|i don'?t represent|on behalf of|here (?:today )?(?:as|for|with)|just myself|speaking (?:for|on)|anyone (?:here|else)|speak (?:to|on|in favor|against) (?:this|the) bill|come (?:forward|up)|state your name|have you (?:gotten|had)|if i could ask|dais|timer|i also volunteer|volunteer capacity|motion|i move|^(?:and |so |but |well,? )?(?:senator|representative|rep\.|sen\.|chair) [a-z]+,/i.test(x)});
      // Keep only quotes that mention something recognizable, starting from that sentence.
      const i=good.findIndex(x=>RECOG.test(x));if(i<0)continue;
      const q=good.slice(i,i+2).join(' ');
      if(q.split(/\s+/).length>=10)out.push({q,l,b,t,com:(t.label||'').replace(/,?\s*day \d+$/i,'')})}}
    QUOTES=shuffle([...out,...added()]);route(true)};
  go().catch(()=>{QUOTES=shuffle(added());route(true)});
}
function wsForm(){
  if(!ME)return '';
  const mine=(WSQ||[]).filter(x=>isAdmin()||x.by===ME.user);
  return `<details class="small" style="margin-top:14px"><summary>Add a “Who said it?” quote</summary>
   <form id="wsForm" class="filters" style="margin-top:8px"><div class="field"><label for="wsLeg">Who said it</label><select id="wsLeg">${LEGS.slice().sort((x,y)=>x.full.localeCompare(y.full)).map(o=>`<option value="${o.id}">${esc(legTitle(o))}</option>`).join('')}</select></div>
   <div class="field grow"><label for="wsTxt">The quote (mention a bill, committee or place so people can work it out)</label><textarea id="wsTxt" rows="2" maxlength="400"></textarea></div>
   <div class="field grow"><label for="wsCtx">Where it was said (optional)</label><input id="wsCtx" maxlength="120" placeholder="H.B. 12 in House Education Committee"></div><button class="btn">Add quote</button></form>
   ${mine.length?`<div class="tiny muted" style="margin-top:8px">${isAdmin()?'Quotes people have added':'Quotes you’ve added'}:</div>${mine.map(x=>`<div class="tiny">“${esc(x.q.slice(0,90))}${x.q.length>90?'…':''}” <span class="muted">(${esc((legById(x.id)||{}).name||x.id)}, added by ${esc(x.by)})</span> <button class="linkbtn tiny" data-wsdel="${esc(x.at)}">remove</button></div>`).join('')}`:''}</details>`;
}
function gameQuotes(){
  loadQuotes();if(QUOTES===undefined)return '<div class="card"><p>Finding quotes in the hearing recordings…</p></div>';
  if(!QUOTES.length)return `<div class="card"><p class="empty">No hearing transcripts are available yet.</p>${wsForm()}</div>`;
  if(!LG.q||LG.q.kind!=='quote'){const x=QUOTES[deckNext('quotes',QUOTES.length)];const others=shuffle(LEGS.filter(o=>o.id!==x.l.id&&o.house===x.l.house)).slice(0,3);LG.q={kind:'quote',...x,opts:shuffle([x.l,...others])};LG.answered=null}
  const {q,l,b,t,com,ctx,by,opts}=LG.q,a=LG.answered;
  const hint=b?`Presenting <b>${esc(shortNum(b.num))}, ${esc(b.title)}</b>${com?` in the <b>${esc(com)}</b>`:''}. Automatic captions, lightly cleaned up.`:`${ctx?esc(ctx)+'. ':''}Added by ${esc(by)}.`;
  return `<div class="card lg"><div class="lg-top"><h2>Who said it?</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.quotes||0}</b></div></div>
   <blockquote class="lg-quote">“${esc(q)}”</blockquote><p class="small muted" style="text-align:center">${hint}</p>
   <div class="lg-faces">${opts.map((o,i)=>`<button class="lg-face ${a?(o.id===l.id?'right':o.id===a?'wrong':''):''}" data-lgquote="${esc(o.id)}" ${a?'disabled':''}><span class="kn">${i+1}</span><img src="${esc(legPhoto(o))}" alt="" loading="lazy"><span>${esc(legTitle(o))}</span></button>`).join('')}</div>
   ${a?`<div class="lg-fb ${a===l.id?'ok':'no'}">${a===l.id?'Right!':'Not this time.'} ${esc(legTitle(l))} said it${b?` while presenting <a href="${billHref(b)}">${esc(shortNum(b.num))}, ${esc(b.title)}</a>${t&&t.video?` · <a href="${esc(vAt(t,t.t0))}" target="_blank" rel="noopener">hear it</a>`:''}`:''}.</div><p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:''}
   ${wsForm()}</div>`;
}

// ---------- floor vocabulary (the bill process guide lives in guides.js)
function gameTerms(){
  if(!LG.q||LG.q.kind!=='term'){const t=TERMS[deckNext('terms',TERMS.length)];LG.q={kind:'term',t,opts:shuffle([t[1],...t[2]])};LG.answered=null}
  const {t,opts}=LG.q,a=LG.answered;
  return `<div class="card lg"><div class="lg-top"><h2>What does it mean?</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.terms||0}</b></div></div>
   <p class="lg-name">${esc(t[0])}</p><div class="lg-opts col">${opts.map((o,i)=>`<button class="btn lg-opt ${a?(o===t[1]?'right':o===a?'wrong':''):''}" data-lgterm="${esc(o)}" ${a?'disabled':''}><span class="kn">${i+1}</span>${esc(o)}</button>`).join('')}</div>
   ${a?`<div class="lg-fb ${a===t[1]?'ok':'no'}">${a===t[1]?'Correct!':'Not quite.'} <b>${esc(t[0])}:</b> ${esc(t[1])}</div><p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:''}</div>`;
}
function memberGrid(){return legRankHTML()}

function lgAnswer(ok,key){if(ok){LG.score++;LG.streak++;lgBest(key,LG.streak)}else LG.streak=0}
function learnBind(){
  if(!location.hash.startsWith('#learn'))return;
  app.querySelectorAll('[data-lgface]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgface;lgAnswer(LG.answered===LG.q.l.id,'faces');route(true)});
  app.querySelectorAll('[data-lgquote]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgquote;lgAnswer(LG.answered===LG.q.l.id,'quotes');route(true)});
  app.querySelectorAll('[data-lgparty]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgparty;lgAnswer(LG.answered===LG.q.l.party,'party');route(true)});
  app.querySelectorAll('[data-lgfact]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgfact;lgAnswer(LG.answered===LG.q.l.id,'facts');route(true)});
  on('factForm','onsubmit',async e=>{e.preventDefault();const id=$('factLeg').value,t=$('factTxt').value.trim();if(!t)return;try{const j=await api('legfacts',{id,fact:t});LEGFACTS=j.facts;toast('Fun fact added');$('factTxt').value=''}catch(err){toast(err.message)}});
  app.querySelectorAll('[data-lgquirk]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgquirk;lgAnswer(LG.answered===LG.q.t[1],'redo');route(true)});
  on('wsForm','onsubmit',async e=>{e.preventDefault();const id=$('wsLeg').value,q=$('wsTxt').value.trim(),ctx=$('wsCtx').value.trim();if(!q)return;try{const j=await api('wsquotes',{id,q,ctx});WSQ=j.quotes||[];QUOTES=null;toast('Thanks! Your quote is in the game.');$('wsTxt').value='';$('wsCtx').value=''}catch(err){toast(err.message)}});
  app.querySelectorAll('[data-wsdel]').forEach(b=>b.onclick=async()=>{try{const j=await api('wsquotes',{del:b.dataset.wsdel});WSQ=j.quotes||[];QUOTES=null;route(true)}catch(err){toast(err.message)}});

  app.querySelectorAll('[data-lgterm]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgterm;lgAnswer(LG.answered===LG.q.t[1],'terms');route(true)});
  on('lgNext','onclick',()=>{LG.q=null;route(true)});
  app.querySelectorAll('[data-lgflag],[data-lgunflag]').forEach(b=>b.onclick=async()=>{const qid=b.dataset.lgflag||b.dataset.lgunflag;try{const j=await api('lgflags',{qid,undo:!!b.dataset.lgunflag});LGF=j.flags||{};
    if(isHidden(qid)){toast('Thanks. That question has two flags now, so it’s been removed.');LG.q=null}else if(!b.dataset.lgunflag)toast('Thanks for flagging it. One more flag removes it.');route(true)}catch(err){toast(err.message)}});
  app.querySelectorAll('[data-lgb]').forEach(b=>b.onclick=()=>{LGBGAME=b.dataset.lgb;route(true)});
  if(typeof mapBind==='function')mapBind();if(typeof agBind==='function')agBind();if(typeof guideBind==='function')guideBind();
}
