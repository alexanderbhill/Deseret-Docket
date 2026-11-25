/* The Outreach walk-through: shown at the top of Outreach → Overview, step by step, and in a pop-up from the
   "Walk me through it" button. It follows one idea from the wish list to a bill (the language, the divisions'
   input, redlines, sending it to the sponsor and drafter, the draft coming back) and then the rest of the tab
   (meetings, asks, testimony, interim, follow-ups). Everything is a mock-up with the signed-in person as the
   sender; nothing is saved or sent. */
'use strict';
let OUTDEMO_I=0;
const odHide=()=>{try{return localStorage.getItem('dd-outdemo')==='hide'}catch(e){return false}};
function outreachDemo(){
  const me=demoMe(),first=demoFirst(),b=demoBill(),name=b.file?b.title:`${shortNum(b.num)} ${b.title}`;
  const div=demoDiv(b),divs=[...new Set([...(b.sug||[]),...CONFIG.divisions.filter(d=>d.dept!=='executive').map(d=>d.id)])].slice(0,3).map(divName);
  const title=ME&&ME.title?`${ME.title}, Utah Attorney General’s Office`:'Utah Attorney General’s Office';
  const due=(()=>{const d=new Date(TODAY);let n=0;while(n<3){d.setDate(d.getDate()+1);if(d.getDay()%6)n++}return `${WD[d.getDay()]}, ${fmtLong(d)}`})();
  const sp=b.sponsor||'Rep. Example', spLast=sp.replace(/^(Rep|Sen)\.\s*/,'').split(/[ ,]/)[0];
  const idea='Clarify when restitution must be paid';
  const file=(n,s)=>`<span class="out-file">${ic('file')}${esc(n)} <span class="tiny muted">${esc(s)}</span></span>`;
  const tick=(t,on)=>`<span class="wish-st s${on}">${esc(t)}</span>`;
  const steps=WISH_STEPS.slice(0,6).map(([,l])=>l);
  const stepper=n=>`<ol class="wish-steps" style="margin:6px 0">${steps.map((l,i)=>`<li class="${i<n?'done':i===n?'on':''}"><button type="button" tabindex="-1">${esc(l)}</button></li>`).join('')}</ol>`;
  return [
   ['What Outreach is for','Everyone with Outreach',`<p>Outreach is where the office keeps its work with the Legislature in one place. Most of it is one job: <b>getting the office’s bill language written, checked by the right divisions, and into the hands of a sponsor and the drafting attorney.</b></p>
     <div class="od-grid">${[['⭐','Wish list','Ideas for future sessions and their language'],['📝','Draft review','Drafts out to the divisions and back to the drafter'],['🤝','Meetings','Who met with which legislator, about what'],['✅','Asks','What we asked for and what they committed to'],['🎤','Testimony','Two-minute statements for committee meetings'],['✏️','Amendments','Changes to bills already moving'],['🏛️','Interim','What interim committees are studying']].map(([i,t,d])=>`<div class="od-tile"><span>${i}</span><b>${esc(t)}</b><span class="small muted">${esc(d)}</span></div>`).join('')}</div>
     <p class="small">First, add your name, title and email under <a href="#account">Your account → Your profile</a>. Every email you send from here goes out under your name, and replies come straight to you.</p>`],
   ['1. Put the idea on the wish list','You',`<p>Each idea goes on one of three lists: the <b>OAG wish list</b>, the <b>client wish list</b> (what the agencies we represent are asking for) and <b>outside ideas</b>. Mark the priorities, the team and the point of contact. Already keep a spreadsheet? <b>Import your spreadsheet</b> brings it in.</p>
     <div class="demo-page"><table class="compact out-t" style="width:100%"><thead><tr><th></th><th>OAG team</th><th>Summary</th><th>Where it stands</th><th>OAG POC</th></tr></thead><tbody>
      <tr><td><span class="wish-pri">★</span></td><td><b>${esc(div)}</b></td><td><b>${esc(idea)}</b> <span class="pill warn">Need sponsor</span></td><td>${tick('Writing the language',1)}</td><td class="small">${esc(me)}</td></tr>
      <tr><td></td><td><b>${esc(divs[1]||'Civil')}</b></td><td><b>Request for more investigator positions</b></td><td>${tick('Idea',0)}</td><td class="small">${esc(me)}</td></tr></tbody></table></div>
     <p class="small muted">Click an idea to open it. It moves along: ${steps.map(esc).join(' → ')}.</p>`],
   ['2. Write or attach the language','You',`<p>Open the idea and type the proposed language, or attach it. Plenty of attorneys work in Word with tracked changes, and that works here too: attach the <b>.docx</b> or a marked-up <b>PDF</b>.</p>
     <div class="demo-page"><b>${esc(idea)}</b>${stepper(1)}<div class="small" style="background:var(--row-alt);padding:8px 10px;border-radius:6px;font-family:Georgia,serif">Section 77-38b-205 is amended to read: (1) A court shall order restitution … within 60 days …</div>
      <div style="margin-top:6px">${file('Restitution timing – proposed language.docx','48 KB')}</div></div>`],
   ['3. Get the divisions’ input','You',`<p>Press <b>Get the divisions’ input</b> and pick the divisions that should look at it. Each one gets an email that reads like a note from you, signed with your name and title. Replies go to you.</p>
     ${dmail(`${me} (AG’s Office)`,`${div} contacts`,`Please review our proposed language: ${idea}`,revEmailHTML(idea,'Draft 1','',div,due,false,true))}`],
   ['4. They answer from the email, their way','Division staff',`<p>Two buttons. <b>No concerns</b> is one click. <b>Send comments or a redline</b> opens a short page where they can type comments and suggested language, or just attach their marked-up Word file or PDF. Nobody needs an account.</p>
     <div class="demo-page" style="max-width:520px"><b class="serif" style="font-size:18px;color:var(--navy)">${esc(div)}’s comments</b><div class="small muted">${esc(idea)} · Comments due ${esc(due)}</div>
      <div class="small" style="border:1px solid var(--field);border-radius:6px;padding:6px 8px;margin-top:6px">Sixty days is tight for victims paid in installments. Suggest 90.</div>
      <div class="small" style="margin-top:6px"><b>Attach a redline</b> ${file('Restitution – CR redline.docx','61 KB')}</div>${dbtn('Send comments','#002147','#fff')}</div>`],
   ['5. Everything comes back to you','You',`<p>When the last division answers, you get one email with every answer in it, and their redlines attached. Divisions that haven’t answered get one reminder on the due date, from you.</p>
     ${dmail('Deseret Docket',me,`Ready to send back: ${idea}`,`<p><b>Everything’s in.</b></p>${divs.map((d,i)=>`<div style="padding:6px 0;border-top:1px solid var(--line)"><b>${esc(d)}</b>: ${i===0?'Comments':'No concerns'}${i===0?`<div class="small">Sixty days is tight for victims paid in installments. Suggest 90.</div><div>${file('Restitution – CR redline.docx','61 KB')}</div>`:''}</div>`).join('')}`)}`],
   ['6. Send it to the sponsor and drafter','You',`<p>Press <b>Send to the sponsor and drafter</b>. Deseret Docket writes the email, with the language in it, and opens it in your Outlook so it goes from your own mailbox. Attach the Word file, send, and press <b>Yes, mark it sent</b>.</p>
     ${dmail(`${me} <you@agutah.gov>`,`${sp}; drafting attorney`,`Proposed language: ${idea}`,`<p>Hi Representative ${esc(spLast)},</p><p>The Utah Attorney General’s Office would like to propose the following for the next General Session: ${esc(idea.toLowerCase())}.</p><p>Proposed language: …</p><p>Thanks,<br>${esc(me)}<br><span class="muted">${esc(title)}</span></p><div>${file('Restitution timing – proposed language.docx','48 KB')}</div>`)}
     ${stepper(3)}`],
   ['7. When a draft comes back','You',`<p>When the drafting attorney sends a draft (or a sponsor asks what the office thinks of a bill), log it under <b>Draft review</b>. Each draft sits in the column for whose turn it is, and the same loop runs again: out to the divisions, back to you, back to the drafter.</p>
     <div class="rev-lanes" style="grid-template-columns:repeat(3,minmax(0,1fr))">${[['us','Waiting on us'],['team','Waiting on divisions'],['drafter','Waiting on the drafter']].map(([k,l],i)=>`<div class="rev-lane ${k}" style="min-width:0"><h3 style="font-size:14px">${l}</h3>${i===1?`<div class="rev-card team" style="padding:10px"><b class="small">${esc(name)}</b><div class="tiny muted">Draft 2 · 1 of 3 answered</div></div>`:''}</div>`).join('')}</div>`],
   ['8. Meetings and asks','You',`<p>After you talk with a legislator, <b>Log a meeting</b>: who, which bills, what was said and a follow-up date. Anything you asked them for goes under <b>Asks</b>, with what they committed to. The Overview lists sponsors of the office’s bills nobody has met with yet.</p>
     <div class="demo-page"><div class="small"><b>${esc(fmtLong(TODAY))}</b> · ${esc(sp)} · ${esc(name)}</div><div class="small">Open to moving the deadline to 90 days. <span class="pill muted">Follow up ${esc(due)}</span></div>
      <div class="small" style="margin-top:6px;border-top:1px solid var(--line);padding-top:6px"><b>Ask:</b> Amend lines 40–52 to 90 days · <span class="pill pass">They committed</span></div></div>`],
   ['9. Committee meetings and testimony','You',`<p>For a bill on a committee agenda, <b>Testimony</b> suggests the committee meetings it’s scheduled for. Pick one (or choose another), and the draft greets that committee’s chair by name and fills in your name and title. Rehearse against the clock, then save, copy or print.</p>
     <div class="demo-page"><div class="small"><b>Committee meeting</b>: House Judiciary Committee · ${esc(fmtLong(TODAY))} at 4:00 PM ▾</div>
      <div class="small" style="font-family:Georgia,serif;background:var(--row-alt);padding:8px 10px;border-radius:6px;margin-top:6px">Chair [last name] and members of the committee, thank you for the time. My name is ${esc(me)}, ${esc(ME&&ME.title||'[your title]')} with the Utah Attorney General’s Office. The office supports ${esc(name)}…</div>
      <div class="small" style="margin-top:6px"><span class="out-clock" style="font-size:22px;color:var(--navy)">1:42</span> of 2:00</div></div>`],
   ['10. Interim','You',`<p>Between sessions, <b>Interim</b> shows what the Legislature chose for each interim committee to study, read straight from its approved list. Press <b>Track</b> on anything that touches the office, and note who’s preparing and the meeting date.</p>
     <div class="demo-page"><b>Judiciary</b><div class="small muted">Study items</div><div class="small" style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding:4px 0">Victims’ Services Funding and Impact Statements <span class="pill pass">Tracking</span></div><div class="small" style="display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding:4px 0">Criminal Fines ${dbtn('Track','#fff','#002147').replace('padding:9px 14px','padding:3px 10px;border:1px solid #a8b7c6')}</div></div>`],
   ['11. Follow-ups find you','You',`<p>Anything with a follow-up date that’s yours shows as a number on the Outreach tab, and you get one email when it comes due. That’s it. Press <b>Add an idea</b> on the Wish list to start.</p>
     <div class="demo-page"><div><b>Outreach</b> <span class="badge">2</span></div><div class="small">Follow up: ${esc(sp)} on the 90-day change · <span class="pill warn">Today</span></div></div>`],
  ];
}
function outDemoCard(){
  if(odHide())return `<div class="out-demo-mini"><button type="button" class="linkbtn" id="odShow">${ic('spark')}Show the walk-through of how Outreach works</button></div>`;
  const S=outreachDemo();OUTDEMO_I=Math.max(0,Math.min(S.length-1,OUTDEMO_I));const [t,who,html]=S[OUTDEMO_I];
  return `<div class="card out-demo"><div class="demo-top"><div><span class="kicker">How Outreach works · Step ${OUTDEMO_I+1} of ${S.length}</span><h2>${esc(t)}</h2><span class="chip">${ic('user')}${esc(who)}</span></div>
     <div style="display:flex;gap:6px"><button type="button" class="btn sm" data-demo="outreach" data-step="${OUTDEMO_I}">Full screen</button><button type="button" class="btn sm" id="odHide">Hide</button></div></div>
    <div class="demo-dots">${S.map((s,j)=>`<button type="button" class="${j===OUTDEMO_I?'on':j<OUTDEMO_I?'done':''}" data-odgo="${j}" aria-label="Step ${j+1}: ${esc(s[0])}"></button>`).join('')}</div>
    <div class="out-demo-body">${html}</div>
    <div class="demo-nav"><button type="button" class="btn" data-odgo="${OUTDEMO_I-1}" ${OUTDEMO_I===0?'disabled':''}>← Back</button><span class="tiny muted">A mock-up. Nothing here is saved or sent.</span><button type="button" class="btn primary" data-odgo="${OUTDEMO_I+1}">${OUTDEMO_I===S.length-1?'Done':'Next →'}</button></div></div>`;
}
document.addEventListener('click',e=>{
  const g=e.target.closest&&e.target.closest('[data-odgo]');
  if(g){e.preventDefault();const n=+g.dataset.odgo,S=outreachDemo();if(n>=S.length){try{localStorage.setItem('dd-outdemo','hide')}catch(_){}OUTDEMO_I=0}else OUTDEMO_I=Math.max(0,n);route(true);const c=document.querySelector('.out-demo');if(c&&c.getBoundingClientRect().top<0)c.scrollIntoView({block:'start'});return}
  if(e.target.closest&&e.target.closest('#odHide')){try{localStorage.setItem('dd-outdemo','hide')}catch(_){}route(true);return}
  if(e.target.closest&&e.target.closest('#odShow')){try{localStorage.removeItem('dd-outdemo')}catch(_){}OUTDEMO_I=0;route(true)}
});
