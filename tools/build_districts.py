#!/usr/bin/env python3
"""Builds site/data/districts.json (district shapes for the Learn map game) and site/data/where.json
(the cities or counties each House and Senate district covers, shown on legislator hover cards).
Districts are fixed through 2032, so this only needs to run again after redistricting.
Source: Utah UGRC (gis.utah.gov). Needs: pip install shapely.
Usage: python3 tools/build_districts.py
"""
import json, math, os, sys, urllib.request
from shapely.geometry import shape
from shapely.ops import transform
HERE=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.join(HERE,'..','site','geo')
B='https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services'
def L(n):
    u=f'{B}/{n}/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&maxAllowableOffset=0.0005&geometryPrecision=5&resultRecordCount=2000'
    return json.load(urllib.request.urlopen(u,timeout=180))['features']
LAT0=39.5; K=math.cos(math.radians(LAT0))
# Utah bbox approx lon -114.06..-109.04, lat 36.99..42.0
X0,Y1=-114.06,42.01
S=100  # px per degree of lon*K
def proj(x,y,z=None): return ((x-X0)*K*S, (Y1-y)*S)
def path(g,tol=0.12):
    g=transform(proj,g).simplify(tol,preserve_topology=True)
    polys=[g] if g.geom_type=='Polygon' else list(getattr(g,'geoms',[]))
    d=[]
    for p in polys:
        if p.geom_type!='Polygon' or p.area<0.02: continue
        for ring in [p.exterior,*p.interiors]:
            c=list(ring.coords)[:-1]
            d.append('M'+'L'.join(f'{x:.1f} {y:.1f}' for x,y in c)+'Z')
    return ''.join(d)
eq=lambda g: transform(lambda x,y,z=None:(x*K,y),g)   # equal-ish area
cnum={f['properties']['COUNTYNBR']:f['properties']['NAME'].title() for f in L('UtahCountyBoundaries')}
cities=[(f['properties']['NAME'],shape(f['geometry']).buffer(0),cnum.get(f['properties']['COUNTYNBR'],'')) for f in L('UtahMunicipalBoundaries')]
counties=[(f['properties']['NAME'].title(),shape(f['geometry']).buffer(0)) for f in L('UtahCountyBoundaries')]
res={'proj':{'x0':X0,'y1':Y1,'k':K,'s':S},'counties':[{'n':n,'d':path(g,.25)} for n,g in counties]}
for ch,name in (('H','UtahHouseDistricts2022to2032'),('S','UtahSenateDistricts2022to2032')):
    ds=[]
    for f in L(name):
        g=shape(f['geometry']).buffer(0); ga=eq(g).area
        rp=g.representative_point(); cx,cy=proj(rp.x,rp.y)
        cs=[];incity=0
        for n,c,cc in cities:
            if not c.intersects(g): continue
            i=eq(c.intersection(g)).area; ca=eq(c).area
            if i/ca>=0.04 or i/ga>=0.03: cs.append([n.replace(' City','') if n in ('Magna City','Kearns City') else n, round(i/ca,2), cc]); incity+=i
        co=[]
        for n,c in counties:
            if c.intersects(g):
                i=eq(c.intersection(g)).area
                if i/ga>=0.02 or i/eq(c).area>=0.10: co.append([n, round(i/eq(c).area,2), i/ga])
        cs.sort(key=lambda x:-x[1]); co.sort(key=lambda x:-x[1])
        URB={'Salt Lake','Utah','Davis','Weber','Washington','Cache'}
        parts=[]
        for n,sh,_ in co:
            if n in URB:
                cl=[x for x in cs if x[2]==n]
                parts+=[(x[0] if x[1]>=0.9 else 'part of '+x[0]) for x in cl] or [('part of ' if sh<0.9 else '')+n+' County']
            else: parts.append(('part of ' if sh<0.9 else '')+n+' County')
        kind='cities' if len(parts)<=7 and all(n in URB for n,_,_ in co) else 'counties'
        if kind=='counties': parts=[('part of ' if sh<0.9 else '')+n+' County' for n,sh,_ in co]
        ds.append({'n':str(f['properties']['DIST']),'d':path(g),'c':[round(cx,1),round(cy,1)],'cities':[x[:2] for x in cs],'counties':[x[:2] for x in co],'urban':round(incity/ga,2),'where':parts,'kind':kind})
    ds.sort(key=lambda x:int(x['n']))
    res[ch]=ds
minx=0;maxx=(-109.04-X0)*K*S;maxy=(Y1-36.99)*S
res['vb']=[0,0,round(maxx+2),round(maxy+2)]
json.dump(res,open(os.path.join(OUT,'districts.json'),'w'),separators=(',',':'))
json.dump({ch:{x['n']:{'w':x['where'],'k':x['kind']} for x in res[ch]} for ch in 'HS'},open(os.path.join(OUT,'where.json'),'w'),separators=(',',':'))
print('wrote districts.json and where.json')
