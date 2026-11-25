/* Icons and visual pieces: line icons, the bill progress tracker and the at-a-glance chips. */
'use strict';
const ICONS={
  share:'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  flag:'M5 21V4M5 4h11l-2 4 2 4H5',
  priority:'M6 13l6-6 6 6M6 19l6-6 6 6',
  impact:'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 8v5M12 16.5v.01',
  building:'M4 21h16M6 21V8l6-4 6 4v13M10 21v-5h4v5M9.5 10.5h.01M14.5 10.5h.01',
  layers:'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  users:'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 0 1 0 6M18 15c2 .5 3 2.5 3 5',
  user:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6',
  pencil:'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  calendar:'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  file:'M7 3h7l5 5v13H7zM14 3v5h5',
  dollar:'M12 3v18M16 7c-1-1.5-2.5-2-4-2-2 0-4 1-4 3s2 3 4 3.5 4 1.5 4 3.5-2 3-4 3c-1.5 0-3-.5-4-2',
  scale:'M12 4v16M8 20h8M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z',
  mic:'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  clock:'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2',
  news:'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5M8 16h3',
  eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  check:'M5 12l5 5L20 7',
  x:'M6 6l12 12M18 6L6 18',
  ballot:'M4 12h16v8H4zM8 12V5h8v7M10 8h4',
  merge:'M6 3v18M18 3v4c0 5-12 5-12 10',
  home:'M4 11l8-7 8 7M6 9v11h12V9',
  list:'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  chart:'M4 20V11M10 20V5M16 20v-6M2 20h20',
  hive:'M9.5 3.5h5a3.5 3.5 0 0 1 3.5 3.5H6a3.5 3.5 0 0 1 3.5-3.5zM5.5 7h13a1.75 1.75 0 0 1 0 3.5h-13a1.75 1.75 0 0 1 0-3.5zM4.5 10.5h15a1.75 1.75 0 0 1 0 3.5h-15a1.75 1.75 0 0 1 0-3.5zM5.5 14h13a1.75 1.75 0 0 1 0 3.5h-13a1.75 1.75 0 0 1 0-3.5zM7 17.5h10V21H7zM10.5 21v-1.5a1.5 1.5 0 0 1 3 0V21',
  book:'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM19 19v2H6',
  gear:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  spark:'M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z',
  bell:'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  mail:'M3 6h18v12H3zM3 7l9 6 9-6',
  table:'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14',
  diff:'M5 4h6v6H5zM13 14h6v6h-6zM8 10v4a3 3 0 0 0 3 3h2M16 14v-4a3 3 0 0 0-3-3h-2',
  search:'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  repeat:'M4 12a8 8 0 0 1 14-5l2 2M20 4v5h-5M20 12a8 8 0 0 1-14 5l-2-2M4 20v-5h5',
  trophy:'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M10 17h4v4',
  wrap:'M5 3h14v18l-7-4-7 4z',
  external:'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
};
const ic=(n,cls='')=>ICONS[n]?`<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICONS[n]}"/></svg>`:'';

// Headings that get an icon wherever they appear.
const H2ICON={'Today’s updates':'bell','Hearings':'calendar','New bill files':'file','Spreadsheet':'table','Media availabilities':'mic','Get updates by email':'mail',
  'Floor calendar watch':'list','Most talked-about bills':'news','Substitutes that touch your code sections':'diff','Bills':'list','Watch list':'eye','Budget':'chart',
  'Fiscal Hive':'hive','Learn the Legislature':'book','Who is sponsoring the most legislation':'users','Summary':'file','In plain English':'spark',
  'What the AG office will have to do':'scale','Fiscal note':'dollar','What has changed':'clock','Committee hearings':'calendar','Floor calendar':'list',
  'What was discussed':'mic','Where the watch list appears':'eye','Bill collisions':'merge','Documents':'file','Status and actions':'clock',
  'Has this bill run before?':'repeat','Votes':'ballot','News & sentiment':'news','Accounts':'users','Association positions':'users','Session wrap-up':'wrap',
  'How the budget is shaping up':'chart','General budget':'chart','Committee budget':'layers','Legislator requests':'user','What’s being said in appropriations meetings':'mic','Where the money talk is':'dollar',
  'Office budget request':'dollar','What we asked for vs. what we’re getting':'chart','Session wrap-up page':'wrap','Your account':'user','Change your password':'gear',
  'Appropriations threshold':'dollar','By department':'building','Fastest responders':'trophy','Outbox':'mail','Where the suggestion missed':'search','Who gets requests':'users','History':'clock',
  'Governor watch':'scale','Implementation tracker':'list','My season':'trophy','Collisions':'merge','Money':'dollar','Office':'building','Sponsor':'user','Team notes':'pencil','What it does':'file','What the office would have to do':'scale',
  'People for “Assigned to”':'users','Media availabilities':'mic','Legislature in the news':'news','Where the money goes':'dollar','Staff list upload':'table'};
// Icons for the kinds of change on the Updates page.
function changeIcon(k){k=k||'';return /hearing|agenda|meeting/i.test(k)?'calendar':/sub|text|version|amend/i.test(k)?'diff':/fiscal/i.test(k)?'dollar':/AG/.test(k)?'scale':/vote|pass|read|floor|circl|rules|calendar/i.test(k)?'ballot':/sponsor/i.test(k)?'user':/governor|sign|veto|law/i.test(k)?'check':/new bill|numbered/i.test(k)?'file':/discuss|transcript|video/i.test(k)?'mic':'bell'}
function iconHeads(html){
  return html.replace(/<h2( [^>]*)?>([^<]+?)(<|$)/g,(m,attr,txt,end)=>{const k=txt.trim().replace(/^What this (substitute|version) does$/,'x');const n=H2ICON[k]||(k==='x'?'diff':'');return n?`<h2${attr||''}>${ic(n,'h')}${txt}${end}`:m});
}

// ---------- bill progress: Introduced → Out of committee → Passed first house → Passed second house → To governor → Signed → In effect
function billSteps(b){
  if(b.file)return null;
  const H=b.hist.slice().sort((x,y)=>x[0].localeCompare(y[0]));
  const first=re=>H.find(h=>re.test(h[1]));
  const intro=first(/1st reading \(Introduced\)/i)||first(/Numbered Bill Publicly Distributed/i);
  const passes=H.filter(h=>/passed (2nd & )?3rd reading/i.test(h[1]));
  const p1=passes[0], house1=p1&&(p1[1].split('/')[0]||'');
  const p2=p1&&passes.find(h=>(h[1].split('/')[0]||'')!==house1);
  const com=first(/Comm - (Favorable|Substitute|Amendment|Consent Calendar) Recommendation|committee report favorable/i);
  const gov=first(/to Governor/i), signed=first(/Governor Signed|became law|law without/i), veto=first(/vetoed/i);
  const o=outcome(b);const dead=o&&o.k==='dead'&&!signed;
  const c=(CONFIG.sessions||{})[b.session];const sd=c&&pd(c.sineDie);
  // Most bills take effect 60 days after the session adjourns.
  const eff=signed&&sd?new Date(sd.getFullYear(),sd.getMonth(),sd.getDate()+61):null;
  const steps=[
    ['Introduced',intro&&intro[0]],
    ['Out of committee',com?com[0]:(p1?'skip':null)],
    [`Passed ${house1==='Senate'?'Senate':house1==='House'?'House':'first house'}`,p1&&p1[0]],
    [`Passed ${house1==='Senate'?'House':house1==='House'?'Senate':'second house'}`,p2&&p2[0]],
    ['To governor',gov&&gov[0]],
    [veto&&!signed?'Vetoed':'Signed',(signed||veto)&&(signed||veto)[0]],
    ['In effect',eff?'eff':null],
  ];
  let cur=steps.findIndex(s=>!s[1]);if(cur<0)cur=steps.length;
  return {steps,cur,dead:dead||(veto&&!signed),eff};
}
function progressHTML(b){
  const P=billSteps(b);if(!P)return '';
  const now=Date.now();
  return `<ol class="prog ${P.dead?'stopped':''}" aria-label="Where this bill is in the process">${P.steps.map(([l,d],i)=>{
    const done=i<P.cur, here=i===P.cur, stop=P.dead&&(here||(l==='Vetoed'));
    const date=d==='skip'?'Skipped':d==='eff'?(P.eff>now?'About ':'')+fmtMD(P.eff):d?fmtMD(pd(d)):'';
    const cls=stop?'stop':done?(l==='In effect'||l==='Signed'?'done fin':'done'):here?'here':'';
    return `<li class="${cls}"><span class="pl">${done&&!stop?ic('check'):stop?ic('x'):''}${esc(stop&&here&&l!=='Vetoed'?'Stopped':l)}</span><span class="pd">${esc(date||(stop&&here?(o=>o?o.l:'')(outcome(b)):'')||' ')}</span></li>`}).join('')}</ol>`;
}
// Compact version for the Bills table.
function progMini(b){
  const P=billSteps(b);if(!P)return '';
  const n=P.steps.length;const lab=P.dead?'Stopped':P.cur>=n?'In effect':P.steps[Math.max(0,P.cur-1)][0];
  return `<div class="progmini ${P.dead?'stopped':''}" title="${esc(P.cur?`${lab} (${P.cur} of ${n} steps)`:'Not introduced yet')}">${P.steps.map((s,i)=>`<i class="${i<P.cur?'on':''} ${P.dead&&i===P.cur?'x':''}"></i>`).join('')}</div>`;
}
// ---------- at-a-glance chips on the bill page: stance, priority, fiscal impact, office list
function glanceHTML(b){
  if(b.file)return '';
  const out=[];
  if(ME){const p=posOf(b);out.push(`<span class="glance" style="--c:${p?posColor(p):'var(--line-2)'}">${ic('flag')}<span><small>Stance</small>${esc(p?posName(p):'None yet')}</span></span>`);
    if(canSee('priority')){const r=priOf(b);const x=r&&CONFIG.priorities.find(q=>q.id===r);out.push(`<span class="glance" style="--c:${x?x.color:'var(--line-2)'}">${ic('priority')}<span><small>Priority</small>${esc(x?x.name:'None')}</span></span>`)}}
  const c=b.fn&&fnCost(b);const cost=c?Math.max(0,c.on)+Math.max(0,c.one):0;
  out.push(`<span class="glance" style="--c:${cost?'var(--maroon)':b.fn?'var(--green)':'var(--line-2)'}">${ic('impact')}<span><small>Fiscal impact</small>${b.fn?(cost?money(cost,true):(b.fn.none?'None':'See note')):'No note yet'}</span></span>`);
  const h=typeof nextHearing==='function'?nextHearing(b):null;
  if(h&&h.d)out.push(`<span class="glance" style="--c:var(--steel)">${ic('calendar')}<span><small>Next hearing</small>${esc(fmtMD(h.d))} · ${esc(fmtTime(h.d))}</span></span>`);
  if(b.tx&&b.tx.length)out.push(`<span class="glance" style="--c:var(--steel)">${ic('mic')}<span><small>Discussed</small>${plural(b.tx.length,'time')}</span></span>`);
  return `<div class="glances">${out.join('')}</div>`;
}
