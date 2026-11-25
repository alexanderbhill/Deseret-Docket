/* Learn → AG Showdown: a Kahoot-style game built from the AG's Office fun facts, recent big cases and
   the office's priorities. Ten timed questions, four colored answers, more points for faster answers,
   a streak bonus, and after each question a one-line way to say it to other interns, legislators,
   friends and family. Best scores go on the Learn leaderboard (game "agquiz").
   Sources: attorneygeneral.utah.gov (history, Executive Team, staff bios, newsroom, 2025 Impact report)
   and news coverage of the Kalshi (Oct. 2026), Live Nation (Apr. 2026) and Snap cases. */
'use strict';
const AGK_SECS=20, AGK_N=10;
// [question, [right answer, wrong, wrong, wrong], what to say about it]
const AGK_BANK=[
 ['The Utah Attorney General’s Office started in…',['1850, while Utah was still a territory','1896, at statehood','1912','1947'],'It’s older than the state: it began in 1850, 46 years before statehood.'],
 ['Why did the territorial AG’s office disappear in 1874?',['Congress’s Poland Act abolished it','The Legislature defunded it','The governor merged it into the courts','It moved to Washington, D.C.'],'Congress wiped it out with the Poland Act in 1874, and Utah’s 1895 constitution brought it back.'],
 ['How does Utah choose its Attorney General?',['Voters elect them to a four-year term','The governor appoints them','The Legislature picks them','The Utah Supreme Court appoints them'],'The AG is elected statewide on their own, every four years, so they answer to voters, not the governor.'],
 ['What does it take to run for Attorney General?',['Be at least 25 and a member of the Utah State Bar','Be at least 35 and a former judge','Have served in the Legislature','Live in Salt Lake County'],'Candidates must be at least 25 and licensed Utah lawyers.'],
 ['Derek Brown is Utah’s ___ Attorney General.',['22nd','12th','18th','30th'],'Derek Brown, who took office in January 2025, is Utah’s 22nd Attorney General.'],
 ['Who was Utah’s first woman Attorney General?',['Jan Graham','Christine Durham','Olene Walker','Deidre Henderson'],'Jan Graham, elected in 1992, was the first woman to hold the office.'],
 ['Who served the longest as Attorney General?',['Mark Shurtleff, 12 years','Sean Reyes, 11 years','Jan Graham, 8 years','Vernon Romney, 8 years'],'Mark Shurtleff served 12 years, from 2001 to 2013.'],
 ['The office describes its work with three words. Which are they?',['Counselors, protectors and stewards','Prosecutors, defenders and judges','Lawyers, lobbyists and leaders','Investigators, auditors and advisers'],'Think three hats: counselors to state government, protectors of Utahns, and stewards of public lands, water and taxpayer dollars.'],
 ['About how many state agencies, boards, commissions and schools does the office represent?',['About 60','About 6','About 600','Only the governor’s office'],'The AG is the state’s lawyer: it represents nearly 60 agencies, boards, commissions, colleges and universities.'],
 ['Which of these is NOT one of the office’s five departments?',['Federal Affairs','Appellate','Public Protection','Criminal'],'The five departments are Appellate, Civil, Criminal, Public Protection and Administration, led by the AG and the Executive Team.'],
 ['Which of these does the AG’s Office NOT run?',['Local police departments','Statewide prosecutions that cross county lines','Defending state laws in court','Legal advice to state agencies'],'It doesn’t oversee local police or the courts. It prosecutes cases that need special skills or cross county lines, and it defends the state.'],
 ['Who leads the Appellate Department and defends Utah’s laws on appeal?',['Solicitor General Stanford Purser','Administrator John Dougall','Daniel Burton','Douglas Crapo'],'Solicitor General Stanford Purser oversees appeals and defending Utah’s laws and constitution.'],
 ['Who is the Chief Deputy Attorney General and General Counsel, the office’s senior executive?',['Daniel Burton','Mark E. Burns','Stewart Young','Katie Hass'],'Daniel Burton runs the office’s legal, legislative, administrative and communications work under AG Brown.'],
 ['Who leads the office’s work with the Legislature, agencies, business leaders and advocacy groups?',['Katie Hass, Director of External Relations','Stanford Purser, Solicitor General','John Dougall, Administrator','Stewart Young, Criminal Deputy'],'Katie Hass, Deputy General Counsel and Director of External Relations, is the office’s point person with the Legislature.'],
 ['Before becoming AG, Derek Brown served in which part of state government?',['The Utah House of Representatives','The Utah Supreme Court','The governor’s cabinet','The State Tax Commission'],'He represented House District 49, was counsel to U.S. Sens. Bennett and Hatch, and later chaired the Utah Republican Party.'],
 ['In October 2026, Utah sued which “prediction market” for taking sports and other bets from Utahns?',['Kalshi','DraftKings','Robinhood','Polymarket'],'Utah has banned gambling since statehood. The office says Kalshi made an estimated $30 million to $61 million in fees from Utah bets and is asking a court to stop it.'],
 ['Right after Utah sued Kalshi, who sued Utah over its gambling enforcement?',['The U.S. government and the Commodity Futures Trading Commission','The Utah Legislature','The NCAA','Nevada'],'The federal government and the CFTC sued Utah and AG Brown in federal court on October 26, 2026, so this fight is now on two tracks.'],
 ['In April 2026, a jury sided with Utah and 33 other states in an antitrust trial against…',['Live Nation and Ticketmaster','Google','Amazon','Meta'],'The Justice Department settled partway through trial. Utah and 33 states kept going and won: the jury found Live Nation and Ticketmaster ran an illegal monopoly.'],
 ['In June 2025, Utah sued which app, saying its design hooks kids and helps predators and drug dealers reach them?',['Snapchat (Snap Inc.)','Pinterest','Discord','Roblox'],'Utah’s Snap lawsuit is one of several against social media companies over harm to kids. A federal judge threw out Snap’s countersuit in March 2026.'],
 ['Utah’s second lawsuit against TikTok focuses on…',['TikTok LIVE and the exploitation of minors','Chinese data storage only','Music copyright','Unpaid state taxes'],'One TikTok case is about addictive design; the second targets TikTok LIVE, alleging it failed to protect minors from exploitation. Courts let both move forward.'],
 ['A tech industry group sued AG Brown in 2026 to block which Utah law?',['The App Store Accountability Act (age checks in app stores)','The kratom law','The state flag law','The water banking law'],'Defending state laws is core work: the office is defending Utah’s app store age-verification law in federal court.'],
 ['In November 2025, a settlement from a complaint Utah led with 52 other attorneys general brought $700 million from…',['Google, over its Play Store','Apple, over the App Store','Purdue Pharma','Juul'],'Utah led the multistate Google Play case that ended in a $700 million settlement.'],
 ['What happened to the office’s Internet Crimes Against Children prosecutions in 2025?',['They more than doubled compared with 2024','They were moved to the FBI','They stayed flat','They were cut in half'],'Protecting kids online is a top priority: ICAC prosecutions more than doubled in 2025.'],
 ['When AG Brown took office, what did he say the office’s criminal focus has to be?',['Violent crime','Immigration enforcement','Traffic offenses','Parking and permits'],'He said the focus has to be violent criminals, because that’s where the office’s authority is.'],
 ['Which of these is one of AG Brown’s stated priorities?',['Defending Utah against federal overreach, including on public lands','Running county jails','Writing the state budget','Setting school curriculum'],'Other priorities: protecting kids and consumers, public safety, transparency, and making the office the state’s best law firm.'],
 ['In Kane County v. United States (2025), the court found that the state and counties own…',['Key rights-of-way (roads) across public lands','The Great Salt Lake','National parks','All federal land in Utah'],'It’s a stewardship win: the ruling confirmed state and county rights-of-way on public lands.'],
 ['In late 2025, Utah launched a bipartisan task force on artificial intelligence with which state’s attorney general?',['North Carolina','California','Texas','New York'],'Utah teamed up with North Carolina’s AG on a bipartisan AI task force.'],
];
let AGK={state:'start'};
let agkTick=null;
function agkStop(){if(agkTick){clearInterval(agkTick);agkTick=null}}
function agkNew(){agkStop();const qs=shuffle(AGK_BANK).slice(0,AGK_N).map(([q,opts,say])=>{const o=shuffle(opts.map((t,i)=>({t,ok:i===0})));return {q,o,say}});
  AGK={state:'q',qs,i:0,score:0,streak:0,best:0,right:0,picked:null,t0:Date.now(),gain:0};agkTimer()}
function agkTimer(){agkStop();agkTick=setInterval(()=>{if(AGK.state!=='q'||location.hash!=='#learn-agquiz'){agkStop();return}
  const left=Math.max(0,AGK_SECS-(Date.now()-AGK.t0)/1000);const bar=$('agkBar'),n=$('agkLeft');if(bar)bar.style.width=(left/AGK_SECS*100)+'%';if(n)n.textContent=Math.ceil(left);
  if(left<=0)agkPick(-1)},200)}
function agkPick(i){
  if(AGK.state!=='q')return;agkStop();
  const q=AGK.qs[AGK.i],ok=i>=0&&q.o[i].ok,secs=(Date.now()-AGK.t0)/1000;
  AGK.picked=i;AGK.state='reveal';
  if(ok){AGK.streak++;AGK.right++;AGK.best=Math.max(AGK.best,AGK.streak);AGK.gain=Math.round(1000*(1-Math.min(secs,AGK_SECS)/AGK_SECS/2))+Math.min(AGK.streak-1,5)*100}else{AGK.streak=0;AGK.gain=0}
  AGK.score+=AGK.gain;route(true);
}
function agkNext(){if(AGK.i+1>=AGK.qs.length){AGK.state='end';if(typeof lgBest==='function')lgBest('agquiz',Math.min(10000,AGK.score));route(true);return}
  AGK.i++;AGK.picked=null;AGK.state='q';AGK.t0=Date.now();route(true);agkTimer()}
const AGK_SHAPES=[['▲','red'],['◆','blue'],['●','yellow'],['■','green']];
function gameAG(){
  if(AGK.state==='start'){agkStop();return `<div class="card agk agk-start"><div class="agk-logo">⚖️</div><h2>AG Showdown</h2>
    <p class="desc">${AGK_N} questions about the Utah Attorney General’s Office: its history, who leads it, the big cases lately and what it’s focused on now. You get ${AGK_SECS} seconds each; faster right answers score more, and streaks add a bonus. After each one you’ll get a line you can use when someone asks what the office does.</p>
    <p><button class="btn primary agk-go" id="agkStart">Start</button></p>${LG.best.agquiz?`<p class="small muted">Your best: ${LG.best.agquiz.toLocaleString()} points</p>`:''}
    <p class="tiny muted">Keys: <kbd>1</kbd>–<kbd>4</kbd> to answer · <kbd>Enter</kbd> for the next question</p></div>`}
  if(AGK.state==='end'){const pct=Math.round(AGK.right/AGK.qs.length*100);
    return `<div class="card agk agk-end"><h2>${pct>=90?'🏆 Ready for the Capitol':pct>=70?'🎉 Nicely done':pct>=50?'👍 Getting there':'📚 Keep studying'}</h2>
     <div class="agk-final"><div><b>${AGK.score.toLocaleString()}</b><span>points</span></div><div><b>${AGK.right}/${AGK.qs.length}</b><span>right</span></div><div><b>${AGK.best}</b><span>best streak</span></div></div>
     <h3 style="font-family:var(--sans);font-size:16px;margin-top:18px">Your talking points from this round</h3><ul class="agk-recap">${AGK.qs.map(q=>`<li>${esc(q.say)}</li>`).join('')}</ul>
     <p><button class="btn primary" id="agkStart">Play again</button> <a class="btn" href="#learn-ag">Read the AG’s Office guide</a> <a class="btn" href="#learn-board">Leaderboard</a></p></div>`}
  const q=AGK.qs[AGK.i],rev=AGK.state==='reveal',left=Math.max(0,AGK_SECS-(Date.now()-AGK.t0)/1000);
  const right=q.o.findIndex(o=>o.ok);
  return `<div class="card agk"><div class="agk-top"><span class="pill">Question ${AGK.i+1} of ${AGK.qs.length}</span><span class="agk-score">${AGK.score.toLocaleString()} pts${AGK.streak>1?` · 🔥 ${AGK.streak}`:''}</span></div>
   <h2 class="agk-q">${esc(q.q)}</h2>
   ${rev?'':`<div class="agk-timer"><i id="agkBar" style="width:${left/AGK_SECS*100}%"></i></div><div class="agk-left" id="agkLeft" aria-hidden="true">${Math.ceil(left)}</div>`}
   <div class="agk-grid">${q.o.map((o,i)=>`<button type="button" class="agk-a ${AGK_SHAPES[i][1]} ${rev?(o.ok?'right':i===AGK.picked?'wrong':'dim'):''}" data-agk="${i}" ${rev?'disabled':''}><span class="agk-sh" aria-hidden="true">${AGK_SHAPES[i][0]}</span><span>${esc(o.t)}</span>${rev&&o.ok?'<span class="agk-ck" aria-label="Right answer">✓</span>':''}</button>`).join('')}</div>
   ${rev?`<div class="agk-fb ${AGK.picked===right?'ok':'no'}"><b>${AGK.picked===right?`Correct! +${AGK.gain.toLocaleString()}`:AGK.picked<0?'Time’s up.':'Not quite.'}</b> <span>Say it like this: ${esc(q.say)}</span></div>
   <p style="text-align:center"><button class="btn primary" id="agkNext">${AGK.i+1>=AGK.qs.length?'See your score':'Next question →'}</button></p>`:''}</div>`;
}
function agkBind(){
  if(location.hash!=='#learn-agquiz'){agkStop();return}
  on('agkStart','onclick',()=>{agkNew();route(true)});
  on('agkNext','onclick',agkNext);
  app.querySelectorAll('[data-agk]').forEach(b=>b.onclick=()=>agkPick(+b.dataset.agk));
}
document.addEventListener('keydown',e=>{
  if(location.hash!=='#learn-agquiz'||document.querySelector('dialog[open]')||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName||'')||e.metaKey||e.ctrlKey||e.altKey)return;
  if(AGK.state==='q'&&/^[1-4]$/.test(e.key)){e.preventDefault();agkPick(+e.key-1)}
  else if(e.key==='Enter'&&AGK.state==='reveal'){e.preventDefault();agkNext()}
  else if(e.key==='Enter'&&(AGK.state==='start'||AGK.state==='end')){e.preventDefault();agkNew();route(true)}
});
