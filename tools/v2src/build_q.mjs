import fs from "fs";
import * as topo from "topojson-client";
import * as simp from "topojson-simplify";
import { geoMercator, geoPath, geoArea } from "d3-geo";
const t = JSON.parse(fs.readFileSync("node_modules/taiwan-atlas/counties-10t.json"));
const SKIP = new Set(["連江縣","金門縣","澎湖縣"]);
// 1) 大幅簡化（Q 版：線條少、比較圓）
const pre = simp.presimplify(t);
const s = simp.simplify(pre, simp.quantile(pre, Number(process.argv[2]||0.35)));
// 2) 把 arcs 從量化差分格式解回絕對座標，方便做平滑（共用邊界一起平滑，縣市之間不會有縫）
if (s.transform) {
  const { scale:[sx,sy], translate:[tx,ty] } = s.transform;
  s.arcs = s.arcs.map(a => { let x=0,y=0; return a.map(([dx,dy]) => { x+=dx; y+=dy; return [x*sx+tx, y*sy+ty]; }); });
  delete s.transform;
}
// 3) Chaikin 平滑（切角兩次），端點固定
const chaikin = (pts, n=2) => { for (let k=0;k<n;k++){ if (pts.length<3) break; const o=[pts[0]];
  for (let i=0;i<pts.length-1;i++){ const [x0,y0]=pts[i],[x1,y1]=pts[i+1]; o.push([x0*.75+x1*.25,y0*.75+y1*.25],[x0*.25+x1*.75,y0*.25+y1*.75]); }
  o.push(pts[pts.length-1]); pts=o; } return pts; };
s.arcs = s.arcs.map(a => chaikin(a, 2));
const fc = topo.feature(s, s.objects.counties);
// 4) 去掉外島和太小的島（綠島、蘭嶼、龜山島…），Q 版只留本島
fc.features = fc.features.filter(f => !SKIP.has(f.properties.COUNTYNAME)).map(f => {
  if (f.geometry.type === "MultiPolygon") {
    const shoe = r => { let a=0; for (let i=0;i<r.length-1;i++) a+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1]; return Math.abs(a/2); };
    const polys = f.geometry.coordinates.map(c => ({c, a: shoe(c[0])}));
    const big = Math.max(...polys.map(p=>p.a));
    f.geometry.coordinates = polys.filter(p => p.a===big || p.a > 0.004).map(p=>p.c);
  }
  return f;
});
const W = 400, H = 720;
const proj = geoMercator().fitExtent([[14, 14], [W - 14, H - 14]], fc);
const path = geoPath(proj);
const r1 = d => d.replace(/(\d+\.\d)\d+/g, "$1");
const counties = fc.features.map(f => ({ n: f.properties.COUNTYNAME, d: r1(path(f)) }));
const outline = r1(path({type:"FeatureCollection",features:fc.features}));
const merged = topo.merge(s, s.objects.counties.geometries.filter(g => !SKIP.has(g.properties.COUNTYNAME)));
{ const shoe2 = r => { let a=0; for (let i=0;i<r.length-1;i++) a+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1]; return Math.abs(a/2); };
  const ps = merged.coordinates.map(c=>({c,a:shoe2(c[0])})); const big=Math.max(...ps.map(p=>p.a));
  merged.coordinates = ps.filter(p=>p.a===big).map(p=>p.c); }
fs.writeFileSync("map_q.json", JSON.stringify({ W, H, scale: proj.scale(), translate: proj.translate(), counties, outline: r1(path(merged)) }));
console.log("bytes", fs.statSync("map_q.json").size);
