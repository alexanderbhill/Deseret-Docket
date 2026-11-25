/* Learn → The AG's Office, explained: counselors, protectors and stewards; the org chart; the office in
   the news (data/ag.json, built by intel_update.py); and fun facts. Leaders and history are from
   attorneygeneral.utah.gov (Executive Team, Our Departments, History). */
'use strict';
const AG_LEADS={appellate:['Stanford Purser','Solicitor General'],civil:['Mark E. Burns','Civil Deputy Attorney General'],criminal:['Stewart Young','Criminal Deputy Attorney General'],pp:['Douglas Crapo','Public Protection Deputy Attorney General'],admin:['John Dougall','Administrator']};
const AG_SITE='https://attorneygeneral.utah.gov';
// The Executive Team, for the org chart's hover cards. Bios are summarized from the office's staff pages.
// Photos are uploaded by an admin (hover a name → Change photo or bio) and kept with any bio edits.
const AG_PEOPLE={
 brown:['Derek Brown','Attorney General','Utah’s 22nd Attorney General, in office since January 2025. A Pepperdine Law graduate, he clerked for a former chief judge of the U.S. Court of Appeals for the Third Circuit, practiced constitutional and appellate law at Mayer Brown and Sidley Austin, and was legal counsel to U.S. Sens. Bob Bennett and Orrin Hatch. He represented House District 49 in the Utah Legislature, taught communications law at BYU, was deputy chief of staff and state director for Sen. Mike Lee, and chaired the Utah Republican Party. He and his wife, Emilie, have four children and live in Cottonwood Heights.','/attorney-general-derek-brown/'],
 burton:['Daniel Burton','Chief Deputy Attorney General and General Counsel','The office’s senior executive. He oversees its legal, legislative, administrative and communications work, advises the Attorney General on hard legal and policy questions, and directs the office’s engagement with the Legislature. His portfolio runs from protecting children online and defending Utah’s interests in federal public lands to consumer protection, privacy, antitrust, public safety, natural resources and energy. He joined the office in 2015 from Woodbury Corporation, where he was senior corporate counsel. B.A., BYU; J.D., University of Utah S.J. Quinney College of Law.','/staff/daniel-burton/'],
 hass:['Katie Hass','Deputy General Counsel and Director of External Relations','Advises on legal and policy matters and leads the office’s work with the Utah Legislature, government agencies, business leaders and advocacy groups. She previously directed the Utah Division of Consumer Protection, leading a team of 30+ investigators and attorneys, and before that led state and federal policy work as associate general counsel for government relations at Melaleuca. She began her career as a litigation associate at Dechert LLP. J.D., cum laude, BYU Law; B.A. in economics and political science, University of Vermont. Admitted in Utah, Idaho and D.C.','/staff/katie-hass/'],
 purser:['Stanford Purser','Solicitor General','Leads the Appellate Department, which handles the state’s appeals and defends Utah’s laws and constitution in court, including through Constitutional Defense and Special Litigation.','/appeals/'],
 burns:['Mark E. Burns','Civil Deputy Attorney General','Leads the Civil Department, the state’s law firm for its agencies: it counsels and defends departments, boards and commissions on everything from water and public lands to schools, transportation and health care.','/civil/'],
 crapo:['Douglas Crapo','Public Protection Deputy Attorney General','Leads the Public Protection Department, which enforces consumer protection, securities, antitrust and data-privacy laws and represents the state’s licensing and real estate regulators.','/public-protection/'],
 young:['Stewart Young','Criminal Deputy Attorney General','Leads the Criminal Department: prosecutors and investigators who take on crimes that cross county lines or need special skills, such as internet crimes against children, human trafficking, Medicaid fraud and financial crimes.','/criminal/'],
 dougall:['John Dougall','Administrator','Leads the Administration Department, which runs the office’s budget, people, technology and operations. He served as Utah’s State Auditor from 2013 to 2025.','/executive-team/']};
const AG_LEAD_ID={appellate:'purser',civil:'burns',criminal:'young',pp:'crapo',admin:'dougall'};
let AGPX=null; // admin-uploaded photos and bio edits: {id:{photo,bio}}
function loadAGPX(){if(AGPX===null){AGPX={};if(ME)api('agpeople').then(j=>{AGPX=j.people||{};if(location.hash==='#learn-ag')route(true)}).catch(()=>{})}return AGPX}
const agInitials=n=>{const w=n.split(' ').filter(x=>/^[A-Z]/.test(x));return (w[0][0]+(w.length>1?w[w.length-1][0]:'')).toUpperCase()};
function agFace(id,cls=''){const p=AG_PEOPLE[id],x=(loadAGPX()[id])||{};return x.photo?`<img class="agface ${cls}" src="${esc(x.photo)}" alt="">`:`<span class="agface ini ${cls}" aria-hidden="true">${esc(agInitials(p[0]))}</span>`}
// The org chart name that opens the photo-and-bio card.
const agName=id=>`<b class="agp" tabindex="0" data-info="agp:${id}">${esc(AG_PEOPLE[id][0])}</b>`;
function agPersonCard(id){const p=AG_PEOPLE[id];if(!p)return '';const x=(loadAGPX()[id])||{};
  return `<div class="agp-card">${x.photo?`<img class="agp-photo" src="${esc(x.photo)}" alt="Photo of ${esc(p[0])}">`:`<span class="agp-photo ini" aria-hidden="true">${esc(agInitials(p[0]))}</span>`}
   <div class="nm">${esc(p[0])}</div><div class="tiny muted">${esc(p[1])}</div><p class="small" style="margin:8px 0">${esc(x.bio||p[2])}</p>
   <a class="tiny" href="${AG_SITE}${p[3]}" target="_blank" rel="noopener">More on the AG’s website ${typeof ic==='function'?ic('external'):''}</a>
   ${isAdmin()?`<div style="margin-top:8px"><button type="button" class="btn sm" data-agpedit="${id}">Change photo or bio</button></div>`:''}</div>`}
async function agPhotoData(file){const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error('That file isn’t an image.'));i.src=URL.createObjectURL(file)});
  const S=240,c=document.createElement('canvas');c.width=c.height=S;const k=Math.max(S/img.width,S/img.height),w=img.width*k,h=img.height*k;c.getContext('2d').drawImage(img,(S-w)/2,(S-h)/2.6,w,h);return c.toDataURL('image/jpeg',.82)}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-agpedit]');if(!b||!isAdmin())return;e.preventDefault();if(typeof closeInfo==='function')closeInfo();
  const id=b.dataset.agpedit,p=AG_PEOPLE[id],x=(loadAGPX()[id])||{};
  let dlg=$('agpDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='agpDlg';document.body.appendChild(dlg)}
  dlg.innerHTML=`<form method="dialog" id="agpForm"><h2>${esc(p[0])}</h2><p class="small muted">${esc(p[1])}. Upload a headshot, or paste a link to one (for example, right-click the photo on their page on the AG’s website and copy the image address).</p>
   <div style="display:flex;gap:14px;align-items:center;margin:10px 0"><span id="agpPrev">${agFace(id,'lg')}</span><div class="field"><label for="agpFile">Upload a photo</label><input type="file" id="agpFile" accept="image/*"><label for="agpUrl" style="margin-top:8px">Or a link to a photo</label><input id="agpUrl" type="url" placeholder="https://attorneygeneral.utah.gov/…jpg" value="${esc(/^https:/.test(x.photo||'')?x.photo:'')}" style="width:100%">${x.photo?'<label class="check" style="margin-top:6px"><input type="checkbox" id="agpNoPhoto"><span>Remove the photo</span></label>':''}</div></div>
   <div class="field"><label for="agpBio">Bio</label><textarea id="agpBio" style="width:100%;min-height:150px">${esc(x.bio||p[2])}</textarea></div>
   <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn" id="agpCancel">Cancel</button><button class="btn primary" id="agpSave">Save</button></div></form>`;
  dlg.showModal();let photo=null;
  $('agpCancel').onclick=()=>dlg.close();
  $('agpUrl').oninput=()=>{const u=$('agpUrl').value.trim();if(/^https:\/\/\S+$/.test(u)){photo=u;$('agpPrev').innerHTML=`<img class="agface lg" src="${esc(u)}" alt="">`}};
  $('agpFile').onchange=async ev=>{try{photo=await agPhotoData(ev.target.files[0]);$('agpPrev').innerHTML=`<img class="agface lg" src="${photo}" alt="">`}catch(err){toast(err.message)}};
  $('agpForm').onsubmit=async ev=>{ev.preventDefault();const bio=$('agpBio').value.trim();
    try{const j=await api('agpeople',{id,bio:bio===p[2]?'':bio,...(photo?{photo}:{}),...($('agpNoPhoto')&&$('agpNoPhoto').checked?{photo:''}:{})});AGPX=j.people||{};dlg.close();toast(`${p[0]}: saved`);route(true)}catch(err){toast(err.message)}};
});
const AG_DEPT_URL={appellate:'/appeals/',civil:'/civil/',criminal:'/criminal/',pp:'/public-protection/',admin:'/executive-team/'};
const STEWARD_DIVS=['cv-water','cv-forestry','cv-ogm','cv-parks-wildlife','cv-public-lands','cv-agriculture','cv-environment','ap-cdsl','ad-administration'];
const AG_ROLES=[
 ['counsel','🧭','Counselors','The state’s lawyers. The Utah Constitution makes the Attorney General the state’s legal adviser, so the office represents nearly 60 agencies, boards, commissions, colleges and universities, plus the Governor, Auditor, Treasurer and the Legislature. It advises them, defends them in court and helps them carry out new laws.',
   d=>(d.dept==='civil'||d.id==='ap-civil')&&!STEWARD_DIVS.includes(d.id)],
 ['protect','🛡️','Protectors','Keeping people safe. Prosecutors and investigators take on crimes that cross county lines or need special skills: child exploitation online, human trafficking, Medicaid fraud, financial crimes. Public Protection goes after scams, price-fixing and companies that break consumer laws.',
   d=>d.dept==='criminal'||d.dept==='pp'||d.id==='ap-criminal'],
 ['steward','🌲','Stewards','Looking after what belongs to everyone: public lands and access to them, water, wildlife, state lands and the environment, the constitutions of Utah and the United States, and the taxpayer dollars the office spends.',
   d=>STEWARD_DIVS.includes(d.id)]];
const AG_LIST=[['1896–1901','A. C. Bishop'],['1901–1909','M. R. Breeden'],['1909–1917','A. R. Barns'],['1917–1921','Dan B. Shields'],['1921–1929','Harvey H. Cluff'],['1929–1933','George P. Parker'],['1933–1941','Joseph Chez'],['1941–1949','Grover A. Giles'],['1949–1953','Clinton D. Vernon'],['1953–1959','E. R. Callister'],['1959–1961','Walter L. Budge'],['1961–1965','A. Pratt Kessler'],['1965–1969','Phil L. Hansen'],['1969–1977','Vernon B. Romney'],['1977–1981','Robert B. Hansen'],['1981–1989','David L. Wilkinson'],['1989–1993','Paul Van Dam'],['1993–2001','Jan Graham'],['2001–2013','Mark Shurtleff'],['2013','John Swallow'],['2013–2024','Sean Reyes'],['2025–','Derek Brown']];
const AG_FACTS=[
 ['🗓️','Older than the state','The office was first set up in 1850, when Utah was still a territory, 46 years before statehood.'],
 ['📜','Abolished, then reborn','Congress’s Poland Act wiped out the territorial office in 1874. Utah’s 1895 constitution created it again.'],
 ['🗳️','Elected, not appointed','Since statehood on January 4, 1896, the Attorney General has been elected on their own, for four-year terms, not picked by the governor.'],
 ['🎂','Who can run','Candidates must be at least 25 and licensed members of the Utah State Bar.'],
 ['2️⃣2️⃣','Number 22','Derek Brown, who took office in 2025, is Utah’s 22nd Attorney General.'],
 ['👩‍⚖️','First woman','Jan Graham, elected in 1992, was the first woman to serve as Utah’s Attorney General.'],
 ['⏳','Longest tenure','Mark Shurtleff served 12 years (2001–2013), the longest of anyone.'],
 ['🚓','What it doesn’t run','The office doesn’t oversee local police, the courts or the Division of Child and Family Services, though its attorneys represent children’s interests in DCFS cases.'],
 ['🎲','Calling Kalshi’s bet','In October 2026 the office sued the prediction market Kalshi, saying its sports and election bets break Utah’s gambling ban, which dates to statehood.'],
 ['🎟️','Beating Ticketmaster','In April 2026, Utah and 33 other states won a jury verdict that Live Nation and Ticketmaster ran an illegal monopoly, after the U.S. Justice Department settled mid-trial.'],
 ['📱','Kids online come first','The office has sued TikTok (twice) and Snap over harm to children, and ICAC prosecutions more than doubled in 2025.'],
 ['🎯','Where the focus is','AG Brown’s stated priorities: violent crime, protecting kids and consumers, defending Utah against federal overreach (including on public lands), and transparency.']]
const AG_WINS=[['2025','ICAC prosecutions more than doubled compared with 2024.'],['Nov. 2025','A $700 million Google Play settlement, from a complaint Utah led with 52 other attorneys general.'],['Nov. 2025','A bipartisan AI task force launched with North Carolina’s attorney general.'],['Sept. 2025','A consent order requiring Aylo to remove child sexual abuse material and pay a $5 million penalty.'],['July 2025','Kane County v. United States: the court found the state and counties own key rights-of-way to public lands.']];

let AGNEWS=null, AGTAB='news', AGDEPT=null;
function loadAGNews(){if(AGNEWS===null){AGNEWS=undefined;getJSON('data/ag.json').then(j=>{AGNEWS=j;if(location.hash==='#learn-ag')route(true)}).catch(()=>{AGNEWS={}})}return AGNEWS}
const divChip=d=>`<span class="chip divchip" tabindex="0" data-info="div:${esc(d.id)}" style="--c:${deptColor(d.dept)}">${esc(d.name)}</span>`;
function pageAGGuide(){
  const divs=CONFIG.divisions||[], depts=CONFIG.departments||[];
  const N=loadAGNews();
  // division cards list bills; before this session's bills are numbered, use the latest session that has them
  if(!allRows(UI.session).some(b=>!b.file)){const x=INDEX.sessions.find(x=>x.count>0);if(x&&!BILLS[x.id]&&!pageAGGuide.l){pageAGGuide.l=1;loadSession(x.id)}}
  const news=N?{news:N.news||[],oped:N.oped||[],press:N.press||[]}:null;
  const item=x=>{const d=pd(x.date);return `<a class="agnews" href="${esc(x.u)}" target="_blank" rel="noopener">${x.img?`<img src="${esc(x.img)}" alt="" loading="lazy">`:`<span class="agn-ph">${AGTAB==='oped'?'✍️':AGTAB==='press'?'⚖️':'📰'}</span>`}<span><b>${esc(x.t)}</b><span class="tiny muted">${esc(x.src||'')}${d?' · '+fmtLong(d):''}</span>${x.d?`<span class="small">${esc(x.d.slice(0,170))}${x.d.length>170?'…':''}</span>`:''}</span></a>`};
  return `<div class="card ag-hero"><div class="ag-hero-t"><div class="kicker">A beginner’s guide</div><h2>How the Utah Attorney General’s Office works</h2>
    <p class="desc">The Attorney General is one of Utah’s five statewide elected officials and the state’s chief lawyer. The office’s own motto for its work: <b>counselors, protectors and stewards</b>. Here’s who does what, how it’s organized, and what it’s been up to lately.</p></div>
    <div class="ag-stats"><div><b>1850</b><span>Year the office began</span></div><div><b>22nd</b><span>Attorney General: Derek Brown</span></div><div><b>~60</b><span>State agencies and boards it represents</span></div><div><b>${depts.filter(d=>d.designate!==false).length}</b><span>Departments, plus the Executive Team</span></div><div><b>${divs.filter(d=>d.dept!=='executive').length}</b><span>Divisions and practice areas we track</span></div></div></div>

   <div class="card"><h2>Counselors, protectors, stewards</h2><p class="desc">The three hats the office wears. Hover any division for what it handles and how many of this session’s bills look like its work. (The grouping of divisions under each hat is ours, for learning.)</p>
    <div class="ag-roles">${AG_ROLES.map(([k,i,t,d,f])=>{const ds=divs.filter(f);return `<div class="ag-role ${k}"><div class="ag-role-hd"><span class="ico">${i}</span><h3>${t}</h3></div><p class="small">${esc(d)}</p><div class="tiny muted" style="margin:6px 0">${plural(ds.length,'division')}</div><div class="chips">${ds.map(divChip).join('')}</div></div>`}).join('')}</div></div>

   <div class="card"><h2>The org chart</h2><p class="desc">Hover (or tap) a name for their photo and bio. Click a department to see its divisions.</p>
    <div class="agorg">
     <div class="agorg-top"><div class="agorg-box ag">${agFace('brown')}<span class="tiny">Attorney General</span>${agName('brown')}</div></div>
     <div class="agorg-mid"><div class="agorg-box">${agFace('burton')}<span class="tiny">Chief Deputy Attorney General and General Counsel</span>${agName('burton')}</div><div class="agorg-box">${agFace('hass')}<span class="tiny">Deputy General Counsel and Director of External Relations</span>${agName('hass')}</div></div>
     <div class="agorg-depts">${depts.filter(d=>d.designate!==false).map(d=>{const L=AG_LEADS[d.id];const ds=divs.filter(x=>x.dept===d.id);return `<button type="button" class="agorg-box dept ${AGDEPT===d.id?'on':''}" data-agdept="${esc(d.id)}" style="--c:${d.color}" aria-expanded="${AGDEPT===d.id}">${AG_LEAD_ID[d.id]?agFace(AG_LEAD_ID[d.id],'sm'):''}<span class="tiny">${esc(d.name)}</span>${L?`${AG_LEAD_ID[d.id]?agName(AG_LEAD_ID[d.id]):`<b>${esc(L[0])}</b>`}<span class="tiny muted">${esc(L[1])}</span>`:''}<span class="tiny agorg-n">${plural(ds.length,'division')} ${AGDEPT===d.id?'▴':'▾'}</span></button>`}).join('')}</div>
     ${AGDEPT?`<div class="agorg-divs" style="--c:${deptColor(AGDEPT)}"><div class="chips">${divs.filter(x=>x.dept===AGDEPT).map(divChip).join('')}</div>${AG_DEPT_URL[AGDEPT]?`<a class="small" href="${AG_SITE}${AG_DEPT_URL[AGDEPT]}" target="_blank" rel="noopener">${esc(deptName(AGDEPT))} on the AG’s website →</a>`:''}</div>`:''}
    </div>
    <p class="tiny muted" style="margin-top:10px">Leaders from the office’s Executive Team and Our Departments pages. Divisions are the practice areas this site uses to route bills, which can be finer-grained than the office’s official divisions.</p></div>

   <div class="grid2" style="align-items:start">
    <div class="card"><h2>The office in the news</h2>
     <div class="seg" role="group" aria-label="News">${[['news','In the news'],['oped','AG Brown’s op-eds'],['press','Press releases']].map(([k,l])=>`<button type="button" data-agtab="${k}" class="${AGTAB===k?'on':''}" aria-pressed="${AGTAB===k}">${l}${news?` <span class="tiny">(${news[k].length})</span>`:''}</button>`).join('')}</div>
     <div class="agnews-list">${!news?'<p>Loading…</p>':news[AGTAB].length?news[AGTAB].slice(0,12).map(item).join(''):`<p class="empty">${AGTAB==='news'?'No newspaper stories mention the office in the last 60 days.':'Nothing yet. This fills in after the next weekday update.'}</p>`}</div>
     <p class="tiny muted">${AGTAB==='news'?'Stories from the news feeds the site follows that mention the Attorney General or the office.':AGTAB==='oped'?`From the office’s <a href="${AG_SITE}/op-eds-and-articles/" target="_blank" rel="noopener">Op-eds and Articles</a> page.`:`From the office’s <a href="${AG_SITE}/newsroom/" target="_blank" rel="noopener">newsroom</a>.`} Refreshed with each weekday update.</p></div>
    <div class="card"><h2>Recent highlights</h2><p class="desc">A few results from the office’s <a href="${AG_SITE}/2025-impact/" target="_blank" rel="noopener">2025 Impact</a> report.</p>
     <ol class="ag-wins">${AG_WINS.map(([d,t])=>`<li><span class="tiny muted">${esc(d)}</span><span>${esc(t)}</span></li>`).join('')}</ol></div></div>

   <div class="card"><h2>Fun facts</h2><p class="desc">Tap a card to flip it. Ready to test yourself? <a href="#learn-agquiz">Play AG Office Showdown →</a></p>
    <div class="flipgrid">${AG_FACTS.map(([i,t,d])=>`<button type="button" class="flip" aria-label="${esc(t)}"><span class="f-front"><span class="ico">${i}</span><b>${esc(t)}</b></span><span class="f-back">${esc(d)}</span></button>`).join('')}</div></div>

   <div class="card"><h2>Every Attorney General since statehood</h2><p class="desc">Hover a name for their years in office.</p>
    <div class="ag-line">${AG_LIST.map(([y,n],i)=>`<span class="ag-dot ${i===AG_LIST.length-1?'now':''}" tabindex="0" data-full="${esc(`${i+1}. ${n}, ${y}${i===AG_LIST.length-1?' (serving now)':''}`)}"><i></i><span class="tiny">${esc(y.slice(0,4))}</span><b>${esc(n.split(' ').slice(-1)[0])}</b></span>`).join('')}</div>
    <p class="tiny muted">From the office’s <a href="${AG_SITE}/utah-attorney-generals-office-history/" target="_blank" rel="noopener">history page</a>.</p></div>`;
}
function agBind(){
  if(location.hash!=='#learn-ag')return;
  app.querySelectorAll('[data-agtab]').forEach(b=>b.onclick=()=>{AGTAB=b.dataset.agtab;route(true)});
  app.querySelectorAll('[data-agdept]').forEach(b=>b.onclick=()=>{AGDEPT=AGDEPT===b.dataset.agdept?null:b.dataset.agdept;route(true)});
  app.querySelectorAll('.flip').forEach(b=>b.onclick=()=>b.classList.toggle('on'));
}
