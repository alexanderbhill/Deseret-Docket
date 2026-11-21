/* Learn → District map: every House and Senate district, statewide and zoomed in on the Wasatch Front.
   Game: find a legislator's district on the map, or name who represents the highlighted one.
   Reference: one dot per legislator, colored by party. District shapes come from Utah's UGRC
   (site/geo/districts.json, built by tools/build_districts.py). */
'use strict';
let MAPGEO=null;
function loadMapGeo(){if(MAPGEO===null){MAPGEO=undefined;getJSON('geo/districts.json').then(g=>{MAPGEO=g;if(location.hash.startsWith('#learn'))route(true)}).catch(()=>{MAPGEO=false;route(true)})}return MAPGEO}
// Wasatch Front window: Brigham City to Santaquin, Tooele to Park City (in the map's own units).
function wasatchVB(g){const p=g.proj,x=lon=>(lon-p.x0)*p.k*p.s,y=lat=>(p.y1-lat)*p.s;const x0=x(-112.32),x1=x(-111.42),y0=y(41.36),y1=y(39.98);return [x0,y0,x1-x0,y1-y0]}
const mapCh=()=>LG.mapch||'S';
const legForDist=(ch,n)=>(LEGS||[]).find(l=>l.house===ch&&String(l.district)===String(n));
let EXECAPP=null;
function leaders(){const c=(typeof loadComs==='function'?loadComs():[]).find(x=>x.id==='APPEXE');return new Set(c?(c.members||[]).map(m=>m.id):[])}
const newMember=l=>{const y=+((l.since||'').match(/\d{4}/)||[0])[0];return y>=new Date().getFullYear()-3};
// One map pane. opts: {dots, hl:{n:class}, click}
function mapPane(g,ch,vb,label,opts){
  const sc=vb[2]/g.vb[2];// smaller window → smaller dots and lines
  const zoom=sc<0.9, r=zoom?4.2*sc*1.6:4.2, sw=(1.1*sc).toFixed(2);
  const lead=opts.dots?leaders():null;
  const paths=g[ch].map(d=>`<path d="${d.d}" class="dist ${(opts.hl||{})[d.n]||''}" data-dist="${d.n}" ${opts.click?`tabindex="-1"`:''}><title>${ch==='H'?'House':'Senate'} District ${d.n}</title></path>`).join('');
  const dots=opts.dots?g[ch].map(d=>{const l=legForDist(ch,d.n);if(!l)return '';const pc=l.party==='D'?'d':l.party==='R'?'r':'o';
    return `<circle cx="${d.c[0]}" cy="${d.c[1]}" r="${r.toFixed(2)}" class="dot ${pc} ${newMember(l)?'ring':''} ${lead.has(l.id)?'lead':''}" style="stroke-width:${(r*(lead.has(l.id)?0.5:0.36)).toFixed(2)}" data-info="leg:${esc(l.id)}" tabindex="0"><title>${esc(legTitle(l))}</title></circle>`}).join(''):'';
  return `<figure class="mappane"><figcaption>${esc(label)}</figcaption><svg viewBox="${vb.map(v=>v.toFixed(1)).join(' ')}" class="umap ${opts.click?'clickable':''}" style="--sw:${sw}px" role="img" aria-label="${esc(label)} map of Utah ${ch==='H'?'House':'Senate'} districts">${g.counties.map(c=>`<path d="${c.d}" class="cty"/>`).join('')}${paths}${dots}</svg></figure>`;
}
function mapPair(g,ch,opts){return `<div class="mappair">${mapPane(g,ch,g.vb,'Statewide',opts)}${mapPane(g,ch,wasatchVB(g),'Wasatch Front, zoomed in',opts)}</div>`}
const chSeg=()=>`<div class="seg" role="group" aria-label="Chamber">${[['S','Senate (29)'],['H','House (75)']].map(([k,l])=>`<button type="button" data-mapch="${k}" class="${mapCh()===k?'on':''}" aria-pressed="${mapCh()===k}">${l}</button>`).join('')}</div>`;

// ---------- the game
function nearDists(g,ch,n,k){const me=g[ch].find(d=>d.n===String(n));return g[ch].filter(d=>d.n!==me.n).map(d=>({d,x:Math.hypot(d.c[0]-me.c[0],d.c[1]-me.c[1])})).sort((a,b)=>a.x-b.x).slice(0,k).map(x=>x.d.n)}
function gameMap(){
  const g=loadMapGeo();if(g===undefined)return '<div class="card"><p>Drawing the districts…</p></div>';if(!g)return '<div class="card"><p class="empty">The district map didn’t load. Reload the page to try again.</p></div>';
  const ch=mapCh();
  if(!LG.q||LG.q.kind!=='map'||LG.q.ch!==ch){
    const pool=g[ch].map(d=>legForDist(ch,d.n)).filter(Boolean);const l=pool[Math.floor(Math.random()*pool.length)];
    const mode=Math.random()<.5?'where':'who';
    // "Who represents this?" offers nearby districts' members, so the region alone doesn't give it away.
    const others=shuffle(nearDists(g,ch,l.district,6)).slice(0,3).map(n=>legForDist(ch,n)).filter(Boolean);
    LG.q={kind:'map',ch,l,mode,opts:shuffle([l,...others])};LG.answered=null}
  const {l,mode,opts}=LG.q,a=LG.answered,ok=a&&(mode==='where'?a===String(l.district):a===l.id);
  const hl={};if(mode==='who'||a){hl[l.district]=a?'right':'target'}if(a&&mode==='where'&&!ok)hl[a]='wrong';
  const where=legWhere(l);
  const prompt=mode==='where'?`<div class="map-ask"><img src="${esc(legPhoto(l))}" alt=""><div><div class="kicker">Click this legislator’s district</div><b>${esc(legTitle(l))}</b><div class="small muted">${l.party==='R'?'Republican':l.party==='D'?'Democrat':esc(l.party||'')}</div></div></div>`
    :`<div class="map-ask"><span class="map-swatch"></span><div><div class="kicker">Who represents the gold district?</div><b>${ch==='H'?'House':'Senate'} District ${esc(l.district)}</b></div></div>
      <div class="lg-faces">${opts.map((o,i)=>`<button class="lg-face ${a?(o.id===l.id?'right':o.id===a?'wrong':''):''}" data-lgmapface="${esc(o.id)}" ${a?'disabled':''}><span class="kn">${i+1}</span><img src="${esc(legPhoto(o))}" alt="" loading="lazy"><span>${esc(legTitle(o))}</span></button>`).join('')}</div>`;
  return `<div class="card lg"><div class="lg-top"><h2>District map</h2><div class="lg-score">Score <b>${LG.score}</b> · Streak <b>${LG.streak}</b> · Best <b>${LG.best.map||0}</b></div></div>
   <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">${chSeg()}<a class="small" href="#learn-districts">See the reference map with everyone’s dot →</a></div>
   ${prompt}
   ${mapPair(g,ch,{hl,click:mode==='where'&&!a})}
   ${a?`<div class="lg-fb ${ok?'ok':'no'}">${ok?'Right!':'Not quite.'} ${esc(legTitle(l))} represents ${ch==='H'?'House':'Senate'} District ${esc(l.district)}${where?`: ${esc(where)}`:''}.${mode==='where'&&!ok?` You picked District ${esc(a)}${legForDist(ch,a)?` (${esc(legTitle(legForDist(ch,a)))})`:''}.`:''}</div><p style="text-align:center"><button class="btn primary" id="lgNext">Next →</button></p>`:mode==='where'?'<p class="tiny muted" style="text-align:center">Click a district on either map. The zoomed-in map is easier for the Wasatch Front.</p>':''}</div>`;
}

// ---------- the reference map
function refMap(){
  const g=loadMapGeo();if(g===undefined)return '<div class="card"><p>Drawing the districts…</p></div>';if(!g)return '<div class="card"><p class="empty">The district map didn’t load.</p></div>';
  const ch=mapCh();const ls=g[ch].map(d=>legForDist(ch,d.n)).filter(Boolean);
  const R=ls.filter(l=>l.party==='R').length,D=ls.filter(l=>l.party==='D').length;
  return `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start"><div><h2>Where every legislator is</h2><p class="desc">One dot per ${ch==='H'?'representative':'senator'}, placed in the middle of their district. Hover a dot to see who it is and which cities or counties they cover; click for their profile.</p></div>${chSeg()}</div>
   <div class="maplegend"><span><i class="lgd r"></i>Republican (${R})</span><span><i class="lgd d"></i>Democrat (${D})</span>${ls.some(l=>l.party!=='R'&&l.party!=='D')?`<span><i class="lgd o"></i>Other (${ls.filter(l=>l.party!=='R'&&l.party!=='D').length})</span>`:''}<span><i class="lgd ring"></i>Took office in the last three years</span><span><i class="lgd lead"></i>On Executive Appropriations (leadership)</span></div>
   ${mapPair(g,ch,{dots:true})}
   <p class="small" style="text-align:center"><a class="btn" href="#learn-map">${typeof ic==='function'?ic('trophy'):''}Play the district map game</a></p>
   <p class="tiny muted">District lines: Utah Geospatial Resource Center (2022–2032 districts).</p></div>`;
}

// ---------- events
function mapBind(){
  if(!location.hash.startsWith('#learn'))return;
  app.querySelectorAll('[data-mapch]').forEach(b=>b.onclick=()=>{LG.mapch=b.dataset.mapch;LG.q=null;route(true)});
  app.querySelectorAll('.umap.clickable [data-dist]').forEach(p=>p.onclick=()=>{if(LG.answered||!LG.q||LG.q.kind!=='map')return;LG.answered=p.dataset.dist;lgAnswer(LG.answered===String(LG.q.l.district),'map');route(true)});
  app.querySelectorAll('[data-lgmapface]').forEach(b=>b.onclick=()=>{LG.answered=b.dataset.lgmapface;lgAnswer(LG.answered===LG.q.l.id,'map');route(true)});
  app.querySelectorAll('.umap .dot[data-info]').forEach(d=>d.onclick=e=>{e.stopPropagation();location.hash='#legislators-'+d.dataset.info.slice(4)});
}
