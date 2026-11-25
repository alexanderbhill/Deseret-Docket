/* Walk-through demos, for while email isn't connected: the whole Fiscal Hive round trip (POC → division
   email → answer → reminder → dashboard), the alert emails people sign up for on Updates, and the draft review
   loop with Outlook connected (drafter's email → divisions → POC → back to the drafter in the same thread). Everything
   here is a mock-up built from a real bill; nothing is saved or sent. The email designs match
   lib/fiscal.js (requestEmail) and send_alerts.py (wrap_html). */
'use strict';
function demoBill(){
  const pool=Object.values(BILLS).flat().filter(b=>!b.file&&b.title&&b.sponsor);
  const nb=b=>!(typeof isBudgetBill==='function'&&isBudgetBill(b));
  const b=pool.find(b=>nb(b)&&b.agm&&(b.sug||[]).length&&b.fn&&!b.fn.none)||pool.find(b=>nb(b)&&(b.sug||[]).length&&b.fn)||pool.find(b=>(b.sug||[]).length)||pool[0];
  return b||{num:'HB0101',title:'Crime Victim Restitution Amendments',sponsor:'Rep. Example',session:UI.session,sug:['cr-victims'],key:''};
}
const demoDiv=b=>divName((b.sug||[])[0]||'cr-victims');
const dmail=(from,to,subj,body,cc)=>`<div class="dmail"><div class="dmail-hd"><div><span class="tiny muted">From</span> ${esc(from)}</div><div><span class="tiny muted">To</span> ${esc(to)}</div>${cc?`<div><span class="tiny muted">CC</span> ${esc(cc)}</div>`:''}<div><span class="tiny muted">Subject</span> <b>${esc(subj)}</b></div></div><div class="dmail-body">${body}</div></div>`;
const dbtn=(l,bg,fg)=>`<span style="display:inline-block;margin:4px 6px 4px 0;padding:9px 14px;border-radius:6px;background:${bg};color:${fg};font-weight:600;font-size:14px">${l}</span>`;
function fhEmailHTML(b,div,reminder){
  return `<div style="font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#333">
   <div style="background:#002147;color:#fff;padding:14px 18px;border-bottom:4px solid #e9d8a6;border-radius:8px 8px 0 0;font-weight:600">Fiscal Hive · Deseret Docket</div>
   <div style="padding:6px 18px 18px;background:#fffdf2;border:1px solid #dbe3ea;border-top:0;border-radius:0 0 8px 8px">
   <p style="font-size:17px;color:#002147;font-weight:600">${reminder?`Reminder: a fiscal note question is waiting for ${esc(div)}`:`1 bill needs a fiscal impact check from ${esc(div)}`}</p>
   <p>Please answer each bill with one click. <b>No impact</b> is recorded right away. <b>Probable fiscal impact</b> opens a short form for the amount and what it would pay for. <b>Wrong section</b> lets you tell us who should get it instead. No sign-in needed.</p>
   <div style="padding:16px 0;border-top:1px solid #dbe3ea"><div style="font-weight:700;color:#002147;font-size:16px">${esc(shortNum(b.num))}: ${esc(b.title)}</div>
    <p style="margin:6px 0">${esc((b.description||'A one-paragraph summary of what the bill does goes here.').slice(0,280))}</p>
    <div style="background:#ebf4f8;border-left:3px solid #3c5a78;padding:8px 12px;margin:8px 0;font-size:14px"><b>Automatic assessment:</b> Likely has a fiscal impact. It adds duties for ${esc(div)}.</div>
    <div style="font-size:14px;margin-bottom:6px;color:#2e4d6d;text-decoration:underline">Read the bill on le.utah.gov</div>
    ${dbtn('No impact','#3c5a78','#fff')}${dbtn('Probable fiscal impact','#002147','#fff')}${dbtn('Wrong section','#e9d8a6','#002147')}</div>
   <p style="color:#5b6672;font-size:13px">Sent for ${esc((ME&&(ME.display||ME.user))||'the office')}. Anyone in the To line can answer for the section; people on CC are copied so they know it’s coming. Unanswered requests get one reminder after 24 hours. Please don't forward this email outside the office.</p>
   <p style="color:#8a929b;font-size:11px;text-align:center">Attorney Work Product / Attorney-Client Communication</p></div></div>`;
}
function fiscalDemo(){
  const b=demoBill(),div=demoDiv(b),poc=(ME&&(ME.display||ME.user))||'the point of contact';
  return [
   ['A new bill shows up','The system',`<p>Four times every weekday the site checks the Legislature for new bills and new substitutes. Each one becomes a card in the Fiscal Hive <b>Inbox</b>. A new substitute always gets its own card, even if the earlier version was cleared, because changes can change the cost.</p>
     <div class="demo-card"><div class="kicker">New bill · ${esc(sessName(b.session))}</div><b class="serif">${esc(shortNum(b.num))}: ${esc(b.title)}</b><div class="small muted">${esc(b.sponsor)}</div>
      <div class="demo-ai"><b>Suggested division:</b> <span class="chip">${esc(div)}</span> <span class="tiny muted">High confidence</span><br><b>Fiscal note likely needed?</b> Likely: it adds duties for the office.</div></div>`],
   ['The POC confirms where it goes',poc,`<p>The point of contact reads the card, keeps or changes the suggested division, and presses <kbd>Enter</kbd> (or <kbd>N</kbd> if no request is needed). The next card slides in.</p>
     <div class="demo-card"><b class="serif">${esc(shortNum(b.num))}</b> → <span class="chip">${esc(div)}</span> <span class="pill pass">Queued</span></div>
     <div class="fh-queue" style="margin-top:12px"><b>1 bill queued for 1 division.</b> <span>One email per division goes out when you leave the Fiscal Hive, sign out, or after 10 idle minutes.</span><span class="btn sm primary">Send now</span></div>`],
   ['One email per division','The system',`<p>Everything routed in one sitting is bundled: <b>one email per division</b>, listing every bill that division needs to look at. Its <b>Send</b> people (Settings → Who gets requests) are on the To line and can answer; its <b>CC</b> people are copied so they know it’s coming.</p>
     <div class="demo-flow"><span>${ic('hive')}Fiscal Hive</span><span class="arr">→</span><span>${ic('mail')}${esc(div)}</span></div>`],
   ['What the division sees',`${div} staff`,`<p>This is the email. Every button is a private link tied to that person and that bill, so nobody has to sign in.</p>${dmail('Deseret Docket <alerts@…>',`${div}: Send contacts`,`Fiscal impact check: 1 bill for ${div}`,fhEmailHTML(b,div,false),`${div}: CC contacts`)}`],
   ['They answer with one click',`${div} staff`,`<div class="demo-3">
      <div><b>No impact</b><p class="small">Recorded the moment they click. A confirmation page says thanks; nothing else to do.</p><div class="demo-page"><b>Thanks!</b><span class="small">Recorded: no fiscal impact for ${esc(shortNum(b.num))}.</span></div></div>
      <div><b>Probable fiscal impact</b><p class="small">A short form, no sign-in:</p><div class="demo-page"><label class="tiny">Estimated amount</label><span class="demo-in">$45,000</span><label class="tiny">What it would pay for</label><span class="demo-in">0.5 FTE investigator</span><label class="tiny">Ongoing or one-time</label><span class="demo-in">Ongoing</span></div></div>
      <div><b>Wrong section</b><p class="small">They pick who should get it instead:</p><div class="demo-page"><label class="tiny">Should go to</label><span class="demo-in">Financial Crimes ▾</span><span class="small">The POC confirms before it’s re-sent.</span></div></div></div>`],
   ['No answer? A reminder','The system',`<p>If a division hasn’t answered within <b>24 hours</b> (weekends count), it gets one automatic reminder, with the same To and CC people. The POC can also press the 🔔 bell on any card to send one right away; the card shows when the last reminder went out.</p>${dmail('Deseret Docket <alerts@…>',`${div}: Send contacts`,`Reminder: fiscal impact check for ${div}`,fhEmailHTML(b,div,true),`${div}: CC contacts`)}`],
   ['Answers land on the dashboard',poc,`<p>Each answer moves the card along: <b>Waiting</b> → <b>Answered</b>. Estimates from every division are added up per bill. If the total is more than the Appropriations threshold (${money((typeof FH!=='undefined'&&FH&&FH.threshold)||20000)} by default), the bill is flagged <b>Needs Appropriations</b> and listed on its own tab. A “wrong section” reply lands in <b>Needs attention</b>.</p>
     <div class="demo-card"><b class="serif">${esc(shortNum(b.num))}</b> <span class="pill pass">Answered</span> <span class="pill warn">Needs Appropriations</span><div class="small">${esc(div)}: $45,000 ongoing · 0.5 FTE investigator</div></div>
     <p class="small">Every step (routed, emailed, reminded, answered) is in the card’s history. The leaderboard ranks the fastest divisions, and the accuracy bar tracks how often the suggested division was right.</p>`],
   ['Today: the Outbox','Admins',`<p>Email isn’t connected yet. Until it is, every one of these emails is saved to <b>Settings → Outbox</b> instead of being sent. Open one there to see exactly what a division would get, and use its links to test answering. Once RESEND_API_KEY and MAIL_FROM are set, the same emails go out for real.</p>`]];
}
function alertsDemo(){
  const b=demoBill(),site='deseret-docket.pages.dev';
  const W=(title,intro,body)=>`<div style="font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#1d1d1b"><div style="font:600 22px Georgia,serif;margin:8px 0 2px">${title}</div><div style="color:#6b6b66;font-size:14px;margin-bottom:16px">${intro}</div>${body}
    <p style="color:#6b6b66;font-size:13px;margin-top:22px;border-top:1px solid #e3e2dd;padding-top:12px">From the Deseret Docket bill tracker. Links open the public view of each bill; signing in isn't needed.<br><u style="color:#7a4a0a">Change what you get</u> · <u style="color:#7a4a0a">Unsubscribe</u></p></div>`;
  const sec=(t,inner)=>`<div style="background:#fff;border:1px solid #e3e2dd;border-radius:8px;padding:14px 16px;margin:0 0 14px"><div style="font-weight:600;margin-bottom:8px">${t}</div>${inner}</div>`;
  const line=(x,extra)=>`<div style="margin:0 0 10px"><b style="color:#7a4a0a">${esc(shortNum(x.num))}</b> <span style="font-family:Georgia,serif">${esc(x.title)}</span><div style="color:#6b6b66;font-size:14px">${esc(x.sponsor)}${extra||''}</div></div>`;
  const others=Object.values(BILLS).flat().filter(x=>!x.file&&x!==b&&x.title&&!(typeof isBudgetBill==='function'&&isBudgetBill(x))&&x.session===b.session&&(x.sug||[]).length).slice(3,5);
  const d=new Date(TODAY);do{d.setDate(d.getDate()+1)}while(d.getDay()===0||d.getDay()===6);
  const cal=sec(`${WD[d.getDay()]}, ${fmtLong(d)} · 8:00 a.m. · House Judiciary Committee`,[b,...others].map(x=>line(x,' · Room 20 House Building')).join(''));
  const ws=FILES[UI.session]||[];
  return [
   ['Pick what you want','You',`<p>On the Updates tab, turn on the emails you want, choose the days and time, and narrow them to the office list, your assignments or the watch list. A confirmation email makes sure the address is yours.</p>
     <div class="demo-toggles">${[['Morning roundup','Hearings for the next week and every change since the last email.',1],['Evening heads-up','The night before a bill on your list is heard.',1],['New bill files','Bill requests legislators opened since the last email.',0],['Fiscal notes','New and updated fiscal notes, with the cost.',1],['Session wrap-up','At sine die: what passed, what died.',0]].map(([t,dsc,on])=>`<div class="demo-tog"><span class="sw ${on?'on':''}"></span><div><b>${t}</b><div class="small muted">${dsc}</div></div></div>`).join('')}</div>`],
   ['The morning roundup','Your inbox, at the time you picked',dmail('Deseret Docket <alerts@…>','you@example.gov',`Deseret Docket: ${1+others.length} bills on the calendar`,W('Your Deseret Docket',`${WD[TODAY.getDay()]}, ${fmtLong(TODAY)}. Hearings for the next week, soonest first.`,`<h3 style="font:600 18px Georgia,serif;margin:12px 0 4px">On the calendar</h3>${cal}<h3 style="font:600 18px Georgia,serif;margin:18px 0 4px">Since the last email</h3>${sec('2 changes',line(b,' · <b>New substitute</b>: 1st Substitute')+line(b,' · <b>Fiscal note</b>: $45,000 ongoing'))}`))],
   ['The evening heads-up','Your inbox, the night before',dmail('Deseret Docket <alerts@…>','you@example.gov',`Tomorrow: ${1+others.length} bills in committee`,W('Coming up tomorrow',`${WD[d.getDay()]}, ${fmtLong(d)}. When and where each bill is heard.`,cal))],
   ['New bill files','Your inbox',dmail('Deseret Docket <alerts@…>','you@example.gov','Deseret Docket: new bill files opened',W('New bill files',`${WD[TODAY.getDay()]}, ${fmtLong(TODAY)}.`,sec(`${Math.min(3,ws.length)||3} new`,(ws.length?ws.slice(0,3):[{title:'Victim Services Amendments',sponsor:'Rep. Example',act:'In process'}]).map(f=>`<div style="margin:0 0 8px"><span style="font-family:Georgia,serif">${esc(f.title)}</span><div style="color:#6b6b66;font-size:14px">${esc(f.sponsor)} · ${esc(f.act||'')}</div></div>`).join(''))))],
   ['Change or stop anytime','You',`<p>Every email ends with <b>Change what you get</b> and <b>Unsubscribe</b> links that work without signing in. Nothing goes out on days or times you didn’t pick.</p><p class="small muted">Email isn’t connected yet; these emails start once the office’s sending domain is set up.</p>`]];
}

function revEmailHTML(name,ver,from,div,due,reminder){
  return `<div style="font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif;color:#333">
   <div style="background:#002147;color:#fff;padding:14px 18px;border-bottom:4px solid #e9d8a6;border-radius:8px 8px 0 0;font-weight:600">Draft review · Deseret Docket</div>
   <div style="padding:6px 18px 18px;background:#fffdf2;border:1px solid #dbe3ea;border-top:0;border-radius:0 0 8px 8px">
   <p style="font-size:17px;color:#002147;font-weight:600">${reminder?`Reminder: ${esc(div)}’s comments on ${esc(name)} are still needed`:`${esc(div)}: please review ${esc(name)}`}</p>
   <div style="background:#ebf4f8;border-radius:8px;padding:10px 14px;margin:8px 0"><div style="font-weight:700;color:#002147;font-size:16px">${esc(name)} <span style="font-weight:500;color:#5b6672">(${esc(ver)})</span></div>
    <div style="font-size:14px;color:#5b6672">From ${esc(from)}, drafting attorney (LRGC) · Comments due <b>${esc(due)}</b></div><div style="font-size:14px;margin-top:4px;color:#2e4d6d;text-decoration:underline">Open the draft</div></div>
   <p style="font-size:14px"><b>What to look for:</b> The new deadlines on lines 40–58 and who has to give notice.</p>
   <p>Tell Dan whether ${esc(div)} has concerns. <b>No concerns</b> is recorded with one click. <b>Send comments</b> opens a short form for your comments and any suggested language. No sign-in needed.</p>
   ${dbtn('No concerns','#3c5a78','#fff')}${dbtn('Send comments','#002147','#fff')}
   <p style="color:#5b6672;font-size:13px">Sent for Dan, who puts the office’s feedback together and sends it back to the drafter. Anyone in the To line can answer for the division.${reminder?'':' If nobody answers, one reminder goes out when comments are due.'}</p>
   <p style="color:#8a929b;font-size:11px;text-align:center">Attorney Work Product / Attorney-Client Communication</p></div></div>`;
}
function reviewDemo(){
  const b=demoBill(),name=b.file?b.title:`${shortNum(b.num)} ${b.title}`,ver='Draft 2',drafter='Jordan Smith',sp=b.sponsor||'Rep. Example';
  const divs=[...new Set([...(b.sug||[]),...CONFIG.divisions.map(d=>d.id)])].slice(0,4).map(divName);
  const due=(()=>{const d=new Date(TODAY);let n=0;while(n<3){d.setDate(d.getDate()+1);if(d.getDay()%6)n++}return `${WD[d.getDay()]}, ${fmtLong(d)}`})();
  const lane=(t,items)=>`<div class="rev-lane ${t}" style="min-width:0"><h3 style="font-size:14px">${REV_TURN[t]}</h3>${items}</div>`;
  const mini=(st,html)=>`<div class="rev-card ${st}" style="padding:10px"><b class="small">${esc(name)}</b><div class="tiny muted">${ver} · ${drafter} · POC Dan</div>${html}</div>`;
  const chips=sts=>`<div class="rev-divs">${divs.map((d,i)=>`<span class="rev-div ${sts[i]}">${sts[i]==='none'?ic('check'):sts[i]==='comments'?ic('pencil'):sts[i]==='waiting'?ic('clock'):''}${esc(d)}</span>`).join('')}</div>`;
  const conn=`<span class="pill pass" style="font-size:11.5px">With Outlook connected</span>`, now=`<span class="pill muted" style="font-size:11.5px">Works today</span>`;
  return [
   ['The draft arrives','The drafter → Dan’s inbox',`<p>${conn} The drafting attorney emails Dan the draft as usual. Deseret Docket watches Dan’s and Katie’s inboxes for messages from <b>le.utah.gov</b> with a draft attached, matches it to the bill or bill file, and offers to log it. No copying anything over.</p>
     ${dmail(`${drafter} <jsmith@le.utah.gov>`,'Dan (AG’s Office)',`${name}: ${ver} for your review`,`<p>Hi Dan,</p><p>Attached is ${ver} of ${esc(name)} for ${esc(sp)}. We’d appreciate the office’s comments by the end of next week.</p><p>Thanks,<br>${drafter}<br>Office of Legislative Research and General Counsel</p><p class="small">📎 ${esc(b.num||'Draft')}_${ver.replace(' ','')}.pdf</p>`)}
     <div class="demo-card" style="margin-top:10px"><div class="kicker">New draft spotted in Dan’s inbox</div><b class="serif">${esc(name)} · ${ver}</b><div class="small muted">From ${drafter} (LRGC) · ${esc(sp)} copied</div><div style="margin-top:6px"><span class="btn sm primary">Log it</span> <span class="btn sm">Not a draft</span></div></div>
     <p class="small muted">Today, Dan or Katie presses <b>Log a draft</b> and pastes in the details. It takes about 20 seconds.</p>`],
   ['Dan sends it to the divisions','Dan',`<p>${now} Dan picks the divisions and a due date and presses <b>Send to divisions</b>. Each division gets its own email; it lands in <b>Waiting on divisions</b>, and the clock starts.</p>
     <div class="rev-lanes" style="grid-template-columns:repeat(3,minmax(0,1fr))">${lane('us','')}${lane('team',mini('team',`<div class="small">0 of 4 answered <span class="pill muted">Due ${esc(due.split(', ').slice(1).join(', '))}</span></div>${chips(['waiting','waiting','waiting','waiting'])}`))}${lane('drafter','')}</div>`],
   ['What each division gets',`${divs[0]} staff`,`<p>${now} One email per division, sent to the people under Fiscal Hive → Settings → Who gets requests. Both buttons are private links tied to that division and this draft, so nobody signs in.</p>${dmail('Deseret Docket <alerts@…>',`${divs[0]}: Send contacts`,`Draft review: ${name} (${ver}) for ${divs[0]}`,revEmailHTML(name,ver,drafter,divs[0],due,false))}`],
   ['They answer from the email',`Division staff`,`<div class="demo-3">
      <div><b>No concerns</b><p class="small">One confirm button, then done.</p><div class="demo-page"><b>Thank you!</b><span class="small">Recorded for ${esc(divs[1])}: no concerns.</span></div></div>
      <div><b>Send comments</b><p class="small">Comments, plus suggested language if they have it:</p><div class="demo-page"><label class="tiny">Comments</label><span class="demo-in">Line 44: 30 days isn’t enough time for the office to respond.</span><label class="tiny">Suggested language</label><span class="demo-in">“within 60 days”</span></div></div>
      <div><b>On the board</b><p class="small">Each answer turns its chip as it comes in.</p>${mini('team',`<div class="small">2 of 4 answered</div>${chips(['comments','none','waiting','waiting'])}`)}</div></div>`],
   ['No answer? One reminder','The system',`<p>${now} On the due date, any division that hasn’t answered gets one automatic reminder. Dan can press <b>Remind</b> any time, for everyone waiting or one division.</p>${dmail('Deseret Docket <alerts@…>',`${divs[3]}: Send contacts`,`Reminder: comments on ${name} for ${divs[3]}`,revEmailHTML(name,ver,drafter,divs[3],due,true))}`],
   ['Dan hears when it’s all in','Dan',`<p>${now} When the last division answers, the draft moves to <b>Waiting on us</b> and Dan gets one email with every answer in it.</p>${dmail('Deseret Docket <alerts@…>','Dan',`Ready to send back: ${name}`,`<div style="font:15px/1.5 -apple-system,Segoe UI,Arial,sans-serif"><p style="font-size:17px;color:#002147;font-weight:600">Every division has answered on ${esc(name)}</p><p>It’s ready for you to put the office’s feedback together and send it back to ${drafter}.</p>${divs.map((d,i)=>`<div style="padding:8px 0;border-top:1px solid #dbe3ea"><b>${esc(d)}</b>: ${i===0?'Comments<div class="small">Line 44: 30 days isn’t enough time for the office to respond. Suggested: “within 60 days”</div>':'No concerns'}</div>`).join('')}${dbtn('Put the feedback together','#002147','#fff')}</div>`)}`],
   ['Send it from Outlook, in the same thread','Dan',`<p>${conn} Deseret Docket drafts the office’s feedback from the divisions’ answers. Dan edits it and presses <b>Send from Outlook</b>. It goes from <b>Dan’s own mailbox</b>, as a reply in the drafter’s thread with ${esc(sp)} copied, and it’s logged the moment it leaves. No “did it go out?” step.</p>
     <div class="demo-page" style="gap:8px"><div class="small"><b>To</b> ${drafter} <span class="muted">jsmith@le.utah.gov</span> · <b>CC</b> ${esc(sp)}</div><div class="small"><b>Subject</b> RE: ${esc(name)}: ${ver} for your review</div>
      <div class="demo-in" style="white-space:pre-wrap;font-size:13.5px">Hi Jordan,\n\nThank you for sending ${esc(name)} (${ver}). Here is the Attorney General’s Office’s feedback:\n\n• Line 44: 30 days isn’t enough time for the office to respond.\n  Suggested language: “within 60 days”\n\nPlease let me know if you have any questions.\n\nDan</div>
      <div><span class="btn sm primary">${ic('mail')}Send from Outlook</span> <span class="btn sm">Open in Outlook instead</span></div></div>
     <p class="small muted">Today, <b>Open in Outlook</b> fills in a new email with the same text, and Dan presses <b>Yes, mark it sent back</b> after sending.</p>`],
   ['The drafter’s reply is logged by itself','The drafter → Dan’s inbox',`<p>${conn} When the drafter replies in that thread, the reply shows up in the draft’s trail without anyone logging it. If it has a new version attached, Deseret Docket asks whether to start the next round with the same divisions.</p>
     <div class="rev-lanes" style="grid-template-columns:repeat(3,minmax(0,1fr))">${lane('us','')}${lane('team','')}${lane('drafter',mini('drafter',`<div class="small">Sent back by Dan · 2 days</div><div class="rev-banner us" style="margin-top:6px;font-size:13px">📎 ${drafter} replied with <b>Draft 3</b>. <span class="btn sm primary">Start the next round</span></div>`))}</div>
     <ol class="rev-log" style="margin-top:12px"><li><span class="tiny muted">Today · ${drafter}</span><div class="small">Replied: “Took the 60-day change. Draft 3 attached.”</div></li><li><span class="tiny muted">2 days ago · Dan</span><div class="small">Sent the office’s feedback back to ${drafter}, ${esc(sp)}</div></li><li><span class="tiny muted">3 days ago · ${esc(divs[0])}</span><div class="small">${esc(divs[0])}: sent comments</div></li></ol>`],
   ['Today, and what connecting adds','Admins',`<p><b>Works today:</b> logging drafts, the three columns, the division emails and their answer pages, reminders, the “all in” email to Dan or Katie, the feedback draft, and the trail. Until the office’s sending domain is set up, the division emails wait in Fiscal Hive → Settings → <b>Outbox</b>, where you can open them and test the links.</p>
     <p><b>Connecting Outlook adds</b> the three green steps: spotting drafts in Dan’s and Katie’s inboxes, sending the feedback from their own mailbox in the same thread, and logging replies on its own. IT would add two Microsoft Graph permissions to the app registration the office already uses for the bill tracker workbook: <b>Mail.Send</b> and <b>Mail.Read</b>, limited to Dan’s and Katie’s mailboxes. That’s best done once Deseret Docket is running on the office’s own servers.</p>`]];
}
function openDemo(kind,start){
  const steps=kind==='fiscal'?fiscalDemo():kind==='review'?reviewDemo():alertsDemo();let i=Math.max(0,Math.min(steps.length-1,+start||0));
  let dlg=$('demoDlg');if(!dlg){dlg=document.createElement('dialog');dlg.id='demoDlg';dlg.className='demo-dlg';document.body.appendChild(dlg)}
  const draw=()=>{const [t,who,html]=steps[i];
    dlg.innerHTML=`<div class="demo-top"><div><span class="kicker">${kind==='fiscal'?'Fiscal Hive demo':kind==='review'?'Draft review demo':'Email alerts demo'} · Step ${i+1} of ${steps.length}</span><h2>${esc(t)}</h2><span class="chip">${ic('user')}${esc(who)}</span></div><button type="button" class="btn sm" data-dx>Close</button></div>
     <div class="demo-dots">${steps.map((s,j)=>`<button type="button" class="${j===i?'on':j<i?'done':''}" data-dgo="${j}" aria-label="Step ${j+1}: ${esc(s[0])}"></button>`).join('')}</div>
     <div class="demo-body">${html}</div>
     <div class="demo-nav"><button type="button" class="btn" data-dprev ${i===0?'disabled':''}>← Back</button><span class="tiny muted">A mock-up with a real bill. Nothing is saved or sent.</span><button type="button" class="btn primary" data-dnext>${i===steps.length-1?'Done':'Next →'}</button></div>`;
    dlg.querySelector('[data-dx]').onclick=()=>dlg.close();
    dlg.querySelector('[data-dprev]').onclick=()=>{if(i>0){i--;draw()}};
    dlg.querySelector('[data-dnext]').onclick=()=>{if(i<steps.length-1){i++;draw()}else dlg.close()};
    dlg.querySelectorAll('[data-dgo]').forEach(b=>b.onclick=()=>{i=+b.dataset.dgo;draw()});
  };
  draw();if(!dlg.open)dlg.showModal();
  dlg.onkeydown=e=>{if(e.key==='ArrowRight'&&i<steps.length-1){i++;draw()}else if(e.key==='ArrowLeft'&&i>0){i--;draw()}};
}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-demo]');if(b){e.preventDefault();openDemo(b.dataset.demo,b.dataset.step)}});
