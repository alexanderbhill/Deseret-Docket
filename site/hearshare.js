/* Share a hearing or floor debate: the Share button on each "What was discussed" tile copies
   the bill number and title, the committee and date, and a link to the moment the discussion
   starts in the video, then shows a "copied" notice. */
'use strict';
function hearShareText(el){
  const d=el.dataset;
  return [d.hsBill,[d.hsCom,d.hsDate].filter(Boolean).join(' · '),d.hsUrl?`Watch the discussion: ${d.hsUrl}`:''].filter(Boolean).join('\n');
}
async function copyText(t){
  try{if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(t);return true}}catch(e){}
  const ta=document.createElement('textarea');ta.value=t;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:-1000px;opacity:0';document.body.appendChild(ta);ta.select();
  let ok=false;try{ok=document.execCommand('copy')}catch(e){}ta.remove();return ok;
}
document.addEventListener('click',async e=>{
  const b=e.target.closest&&e.target.closest('.hshare');if(!b)return;
  e.preventDefault();
  const ok=await copyText(hearShareText(b));
  if(ok){toast('Copied: the bill, the committee and date, and a link to where the discussion starts');b.classList.add('copied');const old=b.innerHTML;b.innerHTML=`${ic('check')}Copied`;setTimeout(()=>{b.classList.remove('copied');b.innerHTML=old},2200)}
  else toast('Couldn’t copy automatically. Select the text and copy it yourself.');
});
function hearShareBind(){}
