/* Office uploads: outside committees' positions (Excel, CSV or a Google Sheet) and the office's own
   budget request, plus the "requested vs. funded" charts on the Budget page. */
'use strict';

// ---------- reading spreadsheets
function parseCSV(text){
  const rows=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;else if(c===','){row.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f=''}else f+=c}
  if(f||row.length){row.push(f);rows.push(row)}
  return rows.map(r=>r.map(x=>x.trim())).filter(r=>r.some(Boolean));
}
let XLSXP=null;
function loadXLSX(){if(!XLSXP)XLSXP=new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';s.onload=()=>ok(window.XLSX);s.onerror=()=>{XLSXP=null;no(new Error('The Excel reader didn’t load. Save the file as .csv and try again.'))};document.head.appendChild(s)});return XLSXP}
async function readSheetFile(file){
  if(/\.csv$|\.txt$/i.test(file.name)) return parseCSV(await file.text());
  const X=await loadXLSX();const wb=X.read(await file.arrayBuffer());const ws=wb.Sheets[wb.SheetNames[0]];
  return X.utils.sheet_to_json(ws,{header:1,raw:false,defval:''}).map(r=>r.map(x=>String(x).trim())).filter(r=>r.some(Boolean));
}

// ---------- making sense of the cells
function normPos(t){t=String(t||'').toLowerCase().replace(/[^a-z ]/g,' ').trim();if(!t)return '';
  if(/priority/.test(t)&&/oppos|against/.test(t))return 'priority-oppose';if(/priority/.test(t)&&/support|favor/.test(t))return 'priority-support';
  if(/oppos|against|^o$/.test(t))return 'oppose';if(/support|favor|^s$|^for$/.test(t))return 'support';if(/neutral|no position|monitor|watch|^n$/.test(t))return 'neutral';
  if(/^(x|yes|y|tagged|track|tracking)$/.test(t))return 'tagged';return ''}
function normCommittee(t){t=String(t||'').toUpperCase().replace(/[^A-Z]/g,'');if(!t)return '';
  const d=(CONFIG.designations||[]).find(x=>[x.id,x.name,x.full].some(v=>String(v).toUpperCase().replace(/[^A-Z]/g,'')===t));return d?d.id:''}
function normBill(t,session){const m=String(t||'').toUpperCase().replace(/\./g,'').replace(/\s+/g,'').match(/^(HB|SB|HCR|SCR|HJR|SJR|HR|SR)0*(\d{1,4})/);return m?`${session}/${m[1]}${m[2].padStart(4,'0')}`:''}

// ---------- the committee positions importer (Admin page)
let CPI=null; // {rows, head, mode, billCol, comCol, posCol, source}
function adminExtraHTML(){
  const pending=CPI&&CPI.rows.length?cpiPreview():'';
  return `<div class="card" id="cpiCard"><h2>Committee positions</h2><p class="desc">Upload the positions outside committees (${esc((CONFIG.designations||[]).map(d=>d.name).join(', '))}) have taken. They show up in the Committee positions column. You can also set them by hand on any bill.</p>
   <div class="filters"><div class="field"><label for="cpiFile">Excel or CSV file</label><input type="file" id="cpiFile" accept=".xlsx,.xls,.csv,.txt"></div>
    <div class="field grow"><label for="cpiUrl">Or a Google Sheet link</label><input id="cpiUrl" placeholder="https://docs.google.com/spreadsheets/d/…"></div><button class="btn" id="cpiFetch">Read sheet</button></div>
   <p class="small muted">Two layouts work: one row per bill with a column for each committee (headings like ULELC, SWAP), or one row per position with columns for bill, committee and position. Positions can be written the usual way (“Priority oppose”, “Support”, “Neutral”…). An X just tags the bill.</p>
   ${pending}</div>
   <div class="card"><h2>Office budget request</h2><p class="desc">Upload the office’s budget request to fill in the “What we asked for” chart on the Budget page. Use a sheet with a category column and an amount column; a third column for what’s being funded is optional. You can edit the numbers after.</p>
   <div class="filters"><div class="field"><label for="brFile">Excel or CSV file</label><input type="file" id="brFile" accept=".xlsx,.xls,.csv,.txt"></div><div class="field grow"><label for="brLabel">Label</label><input id="brLabel" placeholder="e.g. FY2028 request" value="${esc((BREQ&&BREQ.label)||'')}"></div></div>
   <div id="brTable">${brTable()}</div></div>`;
}
function cpiPreview(){
  const c=CPI, head=c.head;
  const sel=(id,cur,opts)=>`<select id="${id}">${opts.map(([v,l])=>`<option value="${v}" ${String(cur)===String(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;
  const colOpts=head.map((h,i)=>[i,h||`Column ${i+1}`]);
  const parsed=cpiRows();
  return `<hr><h3 style="font-family:var(--sans);font-size:17px">Check the columns</h3><p class="small muted">${esc(c.source)} · ${plural(c.rows.length,'row')}</p>
   <div class="filters"><div class="field"><label for="cpiMode">Layout</label>${sel('cpiMode',c.mode,[['wide','A column for each committee'],['long','Bill, committee and position columns']])}</div>
    <div class="field"><label for="cpiBill">Bill number column</label>${sel('cpiBill',c.billCol,colOpts)}</div>
    ${c.mode==='long'?`<div class="field"><label for="cpiCom">Committee column</label>${sel('cpiCom',c.comCol,colOpts)}</div><div class="field"><label for="cpiPos">Position column</label>${sel('cpiPos',c.posCol,colOpts)}</div>`:`<div class="field"><span class="flabel">Committee columns found</span><div class="small">${head.map((h,i)=>normCommittee(h)?`<span class="chip">${esc(h)}</span>`:'').join(' ')||'<span style="color:var(--maroon)">None. Rename the headings to the committee names, or switch the layout.</span>'}</div></div>`}
    <div class="field"><label for="cpiSess">Session</label><select id="cpiSess">${INDEX.sessions.map(s=>`<option value="${s.id}" ${s.id===(c.session||UI.session)?'selected':''}>${esc(sessName(s.id))}</option>`).join('')}</select></div></div>
   <div class="tablewrap"><table class="compact"><thead><tr><th>Bill</th><th>Committee</th><th>Position</th><th>From the sheet</th></tr></thead><tbody>${parsed.ok.slice(0,12).map(r=>`<tr><td>${esc(shortNum(r.key.split('/')[1]))}${BYKEY[r.key]?'':' <span class="pill warn">not found</span>'}</td><td>${esc(desigName(r.committee))}</td><td>${esc(cposLabel(r.pos))}</td><td class="small muted">${esc(r.raw)}</td></tr>`).join('')||'<tr><td colspan="4">Nothing readable yet. Check the columns above.</td></tr>'}</tbody></table></div>
   <p class="small">${plural(parsed.ok.length,'position')} ready${parsed.skipped?`, ${plural(parsed.skipped,'cell')} skipped (blank or not a position)`:''}.</p>
   <div style="display:flex;gap:10px"><button class="btn primary" id="cpiGo" ${parsed.ok.length?'':'disabled'}>Import ${plural(parsed.ok.length,'position')}</button><button class="btn" id="cpiCancel">Cancel</button></div>`;
}
function cpiRows(){
  const c=CPI, S=c.session||UI.session, ok=[]; let skipped=0;
  for(const r of c.rows){const key=normBill(r[c.billCol],S);if(!key)continue;
    if(c.mode==='wide'){c.head.forEach((h,i)=>{const com=normCommittee(h);if(!com||i===c.billCol)return;const pos=normPos(r[i]);if(pos)ok.push({key,committee:com,pos,raw:r[i]});else if(r[i])skipped++})}
    else{const com=normCommittee(r[c.comCol]),pos=normPos(r[c.posCol]);if(com&&pos)ok.push({key,committee:com,pos,raw:`${r[c.comCol]}: ${r[c.posCol]}`});else skipped++}}
  return {ok,skipped};
}
function cpiStart(rows,source){
  if(!rows.length){toast('That sheet looks empty.');return}
  let hi=rows.findIndex(r=>r.some(x=>/bill/i.test(x))||r.some(normCommittee));if(hi<0)hi=0;
  const head=rows[hi], data=rows.slice(hi+1);
  const billCol=Math.max(0,head.findIndex(h=>/bill|number|^#$/i.test(h)));
  const wide=head.some((h,i)=>i!==billCol&&normCommittee(h));
  CPI={rows:data,head,mode:wide?'wide':'long',billCol,comCol:Math.max(0,head.findIndex(h=>/committee|group|org/i.test(h))),posCol:Math.max(0,head.findIndex(h=>/position|stance/i.test(h))),source,session:UI.session};
  route(true);setTimeout(()=>$('cpiCard')&&$('cpiCard').scrollIntoView({block:'start'}),100);
}

// ---------- the office budget request
let BREQ=null;
function loadBREQ(){if(BREQ!==null)return;BREQ=undefined;api('budgetreq').then(j=>{BREQ=j;route(true)}).catch(()=>{BREQ={items:[]}})}
function brTable(){
  if(BREQ===null||BREQ===undefined){loadBREQ();return '<p class="small muted">Loading…</p>'}
  const it=BREQ.items||[];
  return `<div class="tablewrap"><table class="compact"><thead><tr><th>Category</th><th style="text-align:right">Requested</th><th style="text-align:right">Funded (optional)</th><th></th></tr></thead><tbody>${it.map((x,i)=>`<tr><td><input data-br="${i}|cat" value="${esc(x.cat)}" style="width:100%" aria-label="Category"></td><td><input data-br="${i}|req" value="${x.req||''}" inputmode="numeric" style="width:130px;text-align:right" aria-label="Requested"></td><td><input data-br="${i}|got" value="${x.got??''}" inputmode="numeric" style="width:130px;text-align:right" aria-label="Funded"></td><td><button class="btn sm" data-brdel="${i}" aria-label="Remove row">×</button></td></tr>`).join('')}</tbody></table></div>
   <div style="display:flex;gap:10px;margin-top:10px"><button class="btn" id="brAdd">Add a row</button><button class="btn primary" id="brSave">Save budget request</button>${BREQ.at?`<span class="small muted" style="align-self:center">Last saved by ${esc(BREQ.by)}, ${fmtLong(new Date(BREQ.at))}</span>`:''}</div>`;
}
function brFromRows(rows){
  const num=v=>{const n=+String(v||'').replace(/[$,\s()]/g,'');return Number.isFinite(n)?n:NaN};
  let hi=rows.findIndex(r=>r.some(x=>/categor|item|program|line/i.test(x)));const head=hi>=0?rows[hi]:[];const data=rows.slice(hi+1);
  let ci=head.findIndex(h=>/categor|item|program|line/i.test(h));if(ci<0)ci=0;
  let ri=head.findIndex(h=>/request|ask/i.test(h));if(ri<0)ri=data[0]?data[0].findIndex((v,i)=>i!==ci&&!isNaN(num(v))):1;
  const gi=head.findIndex(h=>/fund|approp|got|receiv|award/i.test(h));
  const items=[];for(const r of data){const cat=r[ci];const req=num(r[ri]);if(!cat||isNaN(req)||/^total/i.test(cat))continue;const g=gi>=0?num(r[gi]):NaN;
    const ex=items.find(x=>x.cat===cat);if(ex){ex.req+=req;if(!isNaN(g))ex.got=(ex.got||0)+g}else items.push({cat,req:Math.round(req),got:isNaN(g)?null:Math.round(g)})}
  return items;
}
function budgetReqHTML(){
  if(BREQ===null||BREQ===undefined){if(ME)loadBREQ();return ''}
  const it=(BREQ.items||[]).filter(x=>x.req>0||x.got>0);
  if(!it.length) return ME&&isAdmin()?`<div class="card"><h2>What we asked for vs. what we’re getting</h2><p class="desc">Upload the office’s budget request on the <a href="#admin">Admin</a> page to compare it with what’s being funded.</p></div>`:'';
  const pal=it.map((x,i)=>PAL[i%PAL.length]);
  const req=it.map((x,i)=>({l:x.cat,v:x.req,c:pal[i]})), got=it.map((x,i)=>({l:x.cat,v:x.got||0,c:pal[i]}));
  const tr=it.reduce((s,x)=>s+x.req,0), tg=it.reduce((s,x)=>s+(x.got||0),0), anyGot=it.some(x=>x.got!=null);
  return `<div class="card"><h2>What we asked for vs. what we’re getting${BREQ.label?` <span class="small muted" style="font-weight:400">${esc(BREQ.label)}</span>`:''}</h2><p class="desc">The office’s budget request by category, next to what’s being funded so far. Same colors mean the same category in both charts.</p>
   <div class="grid2"><div><h3 style="font-family:var(--sans);font-size:16px">Requested · ${money(tr,true)}</h3>${pieBlock('pieReq',req,'Requested by category')}</div>
    <div><h3 style="font-family:var(--sans);font-size:16px">Funded · ${anyGot?money(tg,true)+` (${tr?Math.round(tg/tr*100):0}% of the request)`:'not entered yet'}</h3>${anyGot?pieBlock('pieGot',got,'Funded by category'):'<p class="empty">Add funded amounts on the Admin page as appropriations are decided.</p>'}</div></div>
   ${anyGot?`<div class="tablewrap" style="margin-top:14px"><table class="compact"><thead><tr><th>Category</th><th style="text-align:right">Requested</th><th style="text-align:right">Funded</th><th style="text-align:right">Difference</th></tr></thead><tbody>${it.map(x=>{const d=(x.got||0)-x.req;return `<tr><td>${esc(x.cat)}</td><td style="text-align:right">${money(x.req)}</td><td style="text-align:right">${x.got==null?'—':money(x.got)}</td><td style="text-align:right;color:${d<0?'var(--maroon)':'var(--green)'}">${x.got==null?'—':(d<0?'−':'+')+money(Math.abs(d))}</td></tr>`}).join('')}</tbody></table></div>`:''}</div>`;
}

function adminExtraBind(){
  if(!location.hash.startsWith('#admin'))return;
  on('cpiFile','onchange',async e=>{const f=e.target.files[0];if(!f)return;try{cpiStart(await readSheetFile(f),f.name)}catch(err){toast(err.message)}});
  on('cpiFetch','onclick',async()=>{const u=$('cpiUrl').value.trim();if(!u)return;try{const j=await api('cpos/sheet',{url:u});cpiStart(parseCSV(j.csv),'Google Sheet')}catch(err){toast(err.message)}});
  ['cpiMode','cpiBill','cpiCom','cpiPos','cpiSess'].forEach(id=>on(id,'onchange',e=>{const k={cpiMode:'mode',cpiBill:'billCol',cpiCom:'comCol',cpiPos:'posCol',cpiSess:'session'}[id];CPI[k]=k==='mode'||k==='session'?e.target.value:+e.target.value;route(true)}));
  on('cpiCancel','onclick',()=>{CPI=null;route(true)});
  on('cpiGo','onclick',async()=>{const rows=cpiRows().ok.map(r=>({key:r.key,committee:r.committee,pos:r.pos}));try{const j=await api('cpos/import',{rows,source:CPI.source});toast(`Imported ${plural(j.positions,'position')} on ${plural(j.bills,'bill')}`);CPI=null;officeSig='';await pullOffice(true);route(true)}catch(err){toast(err.message)}});
  on('brFile','onchange',async e=>{const f=e.target.files[0];if(!f)return;try{const items=brFromRows(await readSheetFile(f));if(!items.length){toast('No categories with amounts were found in that file.');return}BREQ={...BREQ,items,file:f.name};route(true);toast(`Read ${plural(items.length,'category','categories')}. Check them, then save.`)}catch(err){toast(err.message)}});
  const sync=()=>{app.querySelectorAll('[data-br]').forEach(i=>{const [n,k]=i.dataset.br.split('|');const x=BREQ.items[+n];if(!x)return;x[k]=k==='cat'?i.value:(i.value===''&&k==='got'?null:+i.value.replace(/[$,\s]/g,'')||0)})};
  on('brAdd','onclick',()=>{sync();BREQ.items=[...(BREQ.items||[]),{cat:'',req:0,got:null}];route(true)});
  app.querySelectorAll('[data-brdel]').forEach(b=>b.onclick=()=>{sync();BREQ.items.splice(+b.dataset.brdel,1);route(true)});
  on('brSave','onclick',async()=>{sync();try{await api('budgetreq',{items:BREQ.items,label:$('brLabel').value,file:BREQ.file||''});BREQ=null;toast('Budget request saved');route(true)}catch(err){toast(err.message)}});
}
