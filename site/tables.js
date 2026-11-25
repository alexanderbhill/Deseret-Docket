/* Wide tables: frozen columns and a scroll bar on top as well as the bottom.
   Bills: the bill number and title stay put by default while the rest scrolls; Freeze (next to Columns) or the
   pin on any column heading changes which columns stay. Every other wide table keeps its first column in place, and
   the pin on a heading freezes everything up to that column. Choices are remembered in this browser. */
'use strict';
const FRZ=lsGet('docket-freeze-v1',null)||{};
const frzSave=()=>lsSet('docket-freeze-v1',FRZ);
const frzBills=()=>Array.isArray(FRZ.bills)?FRZ.bills:['num','title'];
const tblKey=(t,i)=>(location.hash.split('-')[0]||'#updates')+':'+(t.className.split(' ').filter(c=>c!=='frz-on')[0]||'t')+':'+i;
function headCells(t){const r=t.tHead&&t.tHead.rows[0];return r?[...r.cells]:[]}
// Which column indexes are frozen in this table.
function frzCols(t,key){const hs=headCells(t);
  if(t.classList.contains('bills')){const want=frzBills();return hs.map((h,i)=>want.includes(h.dataset.col)?i:-1).filter(i=>i>=0)}
  const n=FRZ[key]===undefined?1:FRZ[key];return hs.slice(0,n).map((_,i)=>i)}
function applyFreeze(t,key){
  const hs=headCells(t);if(!hs.length)return;
  const wrap=t.closest('.tablewrap');const over=wrap&&wrap.scrollWidth>wrap.clientWidth+4;
  t.querySelectorAll('.frz').forEach(c=>{c.classList.remove('frz','frz-last');c.style.left=''});
  t.classList.toggle('frz-on',!!over);
  // pins on the headings (only once per render)
  hs.forEach((h,i)=>{if(h.querySelector('.pin'))return;const b=document.createElement('button');b.type='button';b.className='pin';b.dataset.pin=i;b.setAttribute('aria-label','Freeze or unfreeze this column');b.title='Keep this column in place while you scroll sideways';b.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 1.5l4.5 4.5-2 .5-2.6 2.6.4 3.4-1.3 1.3L6.3 11 2.7 14.6 1.4 13.3 5 9.7 2.2 6.9 3.5 5.6l3.4.4L9.5 3.4z" fill="currentColor"/></svg>';(h.querySelector('.h')||h).appendChild(b)});
  if(!over||getComputedStyle(t).display!=='table')return;
  const cols=frzCols(t,key);let left=0;
  const widths=hs.map(h=>h.getBoundingClientRect().width);
  cols.forEach((ci,n)=>{const last=n===cols.length-1;
    for(const row of t.rows){if(row.cells.length!==hs.length)continue;const c=row.cells[ci];c.classList.add('frz');if(last)c.classList.add('frz-last');c.style.left=left+'px'}
    hs[ci].classList.add('pinned');left+=widths[ci]});
  hs.forEach((h,i)=>{if(!cols.includes(i))h.classList.remove('pinned')});
}
// A second scroll bar above the table, kept in step with the one at the bottom.
function topScroll(wrap){
  let top=wrap.previousElementSibling;if(!top||!top.classList.contains('topscroll')){top=document.createElement('div');top.className='topscroll';top.setAttribute('aria-hidden','true');top.innerHTML='<div></div>';wrap.parentNode.insertBefore(top,wrap)}
  const t=wrap.querySelector('table');const over=wrap.scrollWidth>wrap.clientWidth+4&&t&&getComputedStyle(t).display==='table';
  top.hidden=!over;if(!over)return;
  top.firstChild.style.width=wrap.scrollWidth+'px';top.style.width=wrap.clientWidth+'px';
  let lock=false;top.onscroll=()=>{if(lock){lock=false;return}lock=true;wrap.scrollLeft=top.scrollLeft};
  wrap.onscroll=()=>{if(lock){lock=false;return}lock=true;top.scrollLeft=wrap.scrollLeft};
  top.scrollLeft=wrap.scrollLeft;
}
function tablesBind(){
  requestAnimationFrame(()=>{document.querySelectorAll('#app .tablewrap').forEach((w,i)=>{const t=w.querySelector('table');if(!t)return;applyFreeze(t,tblKey(t,i));topScroll(w)})});
}
let frzT=null;addEventListener('resize',()=>{clearTimeout(frzT);frzT=setTimeout(tablesBind,150)});
document.addEventListener('click',e=>{
  const p=e.target.closest&&e.target.closest('.pin');if(!p)return;e.preventDefault();e.stopPropagation();
  const t=p.closest('table'),wraps=[...document.querySelectorAll('#app .tablewrap')],i=wraps.indexOf(t.closest('.tablewrap')),key=tblKey(t,i),ci=+p.dataset.pin;
  if(t.classList.contains('bills')){const col=headCells(t)[ci].dataset.col;const cur=frzBills();FRZ.bills=cur.includes(col)?cur.filter(c=>c!==col):[...cur,col];toast(cur.includes(col)?`${COLDEFS[col].label} scrolls again`:`${COLDEFS[col].label} stays in place`)}
  else{const n=FRZ[key]===undefined?1:FRZ[key];FRZ[key]=n===ci+1?ci:ci+1}
  frzSave();applyFreeze(t,key);
},true);
// Bills → Freeze menu (next to Columns)
function freezeMenu(){return `<details class="frzmenu"><summary class="btn">Freeze</summary><div class="frzpop"><p class="tiny muted">Columns that stay put while you scroll sideways. You can also press the pin on any heading.</p>${visibleCols().map(c=>`<label class="check"><input type="checkbox" data-frz="${c}" ${frzBills().includes(c)?'checked':''}><span>${esc(COLDEFS[c].label)}</span></label>`).join('')}<button type="button" class="linkbtn tiny" data-frzreset>Back to bill number and title</button></div></details>`}
document.addEventListener('change',e=>{const c=e.target.closest&&e.target.closest('[data-frz]');if(!c)return;const cur=frzBills();FRZ.bills=c.checked?[...new Set([...cur,c.dataset.frz])]:cur.filter(x=>x!==c.dataset.frz);frzSave();tablesBind()});
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('[data-frzreset]')){delete FRZ.bills;frzSave();document.querySelectorAll('[data-frz]').forEach(c=>c.checked=frzBills().includes(c.dataset.frz));tablesBind()}
  const open=document.querySelector('details.frzmenu[open]');if(open&&!open.contains(e.target))open.open=false});
