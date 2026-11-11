/*__SPOTS__*/
const MAP = /*__MAP__*/;

/* ===== 小工具 ===== */
const $ = s=>document.querySelector(s);
const $$ = s=>document.querySelectorAll(s);
const store = {
  get(k,d){ try{ const v=localStorage.getItem(k); return v===null?d:JSON.parse(v); }catch(e){ return d; } },
  set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} },
};
const esc = s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let toastT=0;
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),1900); }
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ease=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;

/* ===== 狀態（開機就會用到，全部宣告在最前面，避免 TDZ：還沒初始化就被讀取） ===== */
let rolling=false, updating=false, lastId=null, curTab="roll", listDir="all", pickedId=null;
let reachIdx = store.get("wd_reach",1);             // REACHES 的 index
let dir      = store.get("wd_dir","all");           // all / N / E / S
let far      = store.get("wd_far",false);           // 不要太近
let scene    = store.get("wd_scene","");            // 今天想怎麼玩（情境，單選）
// 情境：一次代表一種玩法，只要有其中一項就算（OR）；細的條件才是「全部都要」（AND）
const SCENES={
  run:   {name:"放電跑跳", sub:"草地・溜滑梯・沙坑", ic:"grass",   any:["草","滑","沙"]},
  animal:{name:"摸摸動物", sub:"餵食・近距離接觸",   ic:"bunny",   any:["動"]},
  water: {name:"玩水玩沙", sub:"戲水池・海邊",       ic:"water",   any:["水","沙"]},
  train: {name:"火車飛機", sub:"看火車・坐小火車",   ic:"train",   any:["車","機"]},
  hands: {name:"動手做",   sub:"採果・DIY・摸蜆",    ic:"hands",   any:["手"]},
  rain:  {name:"下雨也OK", sub:"室內・有屋頂",       ic:"umbrella",any:["雨"]},
};
let flt  = Object.assign({avoid:false,noresv:false}, store.get("wd_flt",{}));
let data = Object.assign({edits:{},added:[],deleted:[]}, store.get("wd_data",{}));
let hist = store.get("wd_hist",[]);                 // [{id,t,name,min}]
let splashDoneR; const splashDone=new Promise(r=>{ splashDoneR=r; });

/* ===== 出發點、地圖投影（麥卡托：經緯度 → 地圖座標，像查表換算） ===== */
const CITY_LABELS=[["桃園",24.99,121.30],["台北",25.06,121.54],["基隆",25.12,121.72],["宜蘭",24.72,121.70],["苗栗",24.53,120.84],
  ["台中",24.18,120.68],["彰化",24.05,120.50],["南投",23.92,120.85],["花蓮",23.85,121.45],["雲林",23.70,120.40],["嘉義",23.47,120.40],
  ["台南",23.05,120.25],["高雄",22.75,120.45],["屏東",22.55,120.62],["台東",22.85,121.10],["新竹",24.78,120.96]];
/* 出發點：每個人自己設定（手機定位／地圖上點／存成「家」），只存在這支手機裡，不會上傳 */
const D2R=Math.PI/180;
const proj=(lat,lng)=>[MAP.translate[0]+MAP.scale*lng*D2R, MAP.translate[1]-MAP.scale*Math.log(Math.tan(Math.PI/4+lat*D2R/2))];
const unproj=(x,y)=>[(2*Math.atan(Math.exp((MAP.translate[1]-y)/MAP.scale))-Math.PI/2)/D2R, (x-MAP.translate[0])/MAP.scale/D2R];
const REF={lat:24.893,lng:120.993};               // 內建名單的車程是從這裡（新竹縣新豐）量的
let origin = store.get("wd_origin",null);           // {lat,lng,kind:"gps"|"home"|"map",label}
let homeSpot = store.get("wd_home",null);           // 存起來的「家」
let HP=[0,0];
const setHP=()=>{ const o=origin||{lat:24.85,lng:121.0}; HP=proj(o.lat,o.lng); };
setHP();
const KM=MAP.scale/6371/Math.cos(24*D2R);         // 地圖上 1 公里 = 幾個單位（台灣範圍內差不多）
function distKm(a,b){ const R=6371, dLa=(b.lat-a.lat)*D2R, dLo=(b.lng-a.lng)*D2R; const h=Math.sin(dLa/2)**2+Math.cos(a.lat*D2R)*Math.cos(b.lat*D2R)*Math.sin(dLo/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
/* 車程估計：直線距離 → 大約分鐘；再乘上這個地點的「路況係數」（用原本從新豐量的車程反推，山路會比較大） */
const estMin=km=>8+km*1.0;
const round5=m=>Math.max(5,Math.round(m/5)*5);
/* 中央山脈擋在中間：花東 ↔ 西部要繞北邊（蘇花）或南邊（南迴），不能用直線算 */
const isEast=p=>p.lng>121.25 && p.lat<24.55;
const GATES=[{lat:24.60,lng:121.85},{lat:22.35,lng:120.80}];
function roadKm(a,b){
  if(isEast(a)===isEast(b)) return distKm(a,b);
  return Math.min(...GATES.map(g=>distKm(a,g)+distKm(g,b)))+35;   // 山路、蘇花多算一點
}
function minFrom(s){
  if(s.manual || s.lat==null || !origin) return s.min;
  if(distKm(origin,REF)<3) return s.min;
  const ratio=Math.max(.8,Math.min(2.2, s.min/estMin(roadKm(REF,s))));
  return round5(estMin(roadKm(origin,s))*ratio);
}
function nearestCity(lat,lng){ let best=null,bd=1e9; CITY_LABELS.forEach(([n,la,lo])=>{ const d=distKm({lat,lng},{lat:la,lng:lo}); if(d<bd){bd=d;best=n;} }); return best; }
const originName=()=>!origin?"還沒設定出發點": origin.kind==="home"?"從家出發": origin.kind==="gps"?`從目前位置出發`:`從${origin.label||"地圖上的點"}出發`;

/* 開多遠：分鐘 → 大約的擴散半徑（公里，只是示意） */
const REACHES=[
  {m:30, big:"30",  sm:"分鐘", name:"30 分鐘內", km:24},
  {m:60, big:"1",   sm:"小時", name:"1 小時內",  km:52},
  {m:90, big:"1.5", sm:"小時", name:"1.5 小時內",km:82},
  {m:120,big:"2",   sm:"小時", name:"2 小時內",  km:112},
  {m:180,big:"3",   sm:"小時", name:"3 小時內",  km:170},
  {m:0,  big:"不限",sm:"全台", name:"全台都可以",km:0},
];
/* 各縣市大約幾分鐘開得到（決定地圖哪些縣市亮起來） */

/* 方向：從家裡看出去的方位角（0°=正北，順時針） */
const DIRS={
  all:{name:"不限", sub:"都可以"},
  N:  {name:"往北", sub:"北邊",      from:330, to:85},
  E:  {name:"往東", sub:"東邊・山區", from:85,  to:160},
  S:  {name:"往南", sub:"南邊",      from:160, to:250},
  W:  {name:"往西", sub:"西邊・海邊", from:250, to:330},
};
/* 車程分組（名單、足跡、明信片的顏色） */
const BUCKETS=[{max:30,name:"30 分鐘內",c:"#3DAA6E",l:"#CDEFD9"},{max:60,name:"1 小時內",c:"#3B8EDB",l:"#CFE5FA"},
  {max:90,name:"1.5 小時內",c:"#F29A3A",l:"#FDE3C4"},{max:120,name:"2 小時內",c:"#E0607E",l:"#FAD6DF"},
  {max:180,name:"3 小時內",c:"#2AA5A0",l:"#CDEFEC"},{max:9999,name:"3 小時以上",c:"#8A6BD1",l:"#E4DAF7"}];
/* Q 版地圖每個縣市的顏色（相鄰的不同色） */
const COUNTY_COLOR={"台北市":"#FFD1DC","新北市":"#D7EDB5","基隆市":"#FFE08A","桃園市":"#FFC9B5","新竹縣":"#D9CCF5","新竹市":"#FFE08A","苗栗縣":"#BFE6D6",
  "台中市":"#FFE08A","彰化縣":"#D9CCF5","南投縣":"#FFC9B5","雲林縣":"#FFD1DC","嘉義縣":"#FFE08A","嘉義市":"#BFDDF7","台南市":"#D7EDB5","高雄市":"#D9CCF5",
  "屏東縣":"#BFDDF7","台東縣":"#FFD1DC","花蓮縣":"#BFE6D6","宜蘭縣":"#BFDDF7"};
const bucketOf=m=>BUCKETS.find(b=>m<=b.max);
const TAGS=[
  {ch:"草",key:"grass",label:"放電大草地",ic:"grass",g:"kid"},
  {ch:"動",key:"animal",label:"餵小動物",ic:"bunny",g:"kid"},
  {ch:"水",key:"water",label:"玩水",ic:"water",g:"kid"},
  {ch:"車",key:"train",label:"看火車・坐小火車",ic:"train",g:"kid"},
  {ch:"沙",key:"sand",label:"沙坑・玩沙",ic:"sand",g:"kid"},
  {ch:"滑",key:"slide",label:"特色溜滑梯",ic:"slide",g:"kid"},
  {ch:"手",key:"hands",label:"動手體驗",ic:"hands",g:"kid"},
  {ch:"機",key:"plane",label:"看飛機",ic:"plane",g:"kid"},
  {ch:"雨",key:"rain",label:"雨天可去",ic:"umbrella",g:"adult"},
  {ch:"走",key:"easy",label:"推車長輩好走",ic:"stroller",g:"adult"},
  {ch:"蔭",key:"shade",label:"有樹蔭不怕曬",ic:"tree",g:"adult"},
  {ch:"停",key:"park",label:"好停車",ic:"parking",g:"adult"},
  {ch:"奶",key:"nurse",label:"哺乳室・尿布台",ic:"bottle",g:"adult"},
  {ch:"泉",key:"spring",label:"泡腳・溫泉",ic:"spring",g:"adult"},
  {ch:"免",key:"free",label:"免門票",ic:"ticket",g:"adult"},
  {ch:"吃",key:"food",label:"附近有得吃",ic:"bowl",g:"adult"},
  {ch:"約",key:"resv",label:"要先預約",ic:"calendar",g:"ex"},
];

/*__UI__*/
/*__DIE__*/
/*__SCENERY__*/

/* ===== 地點資料：內建名單＋使用者改的（像 FW 的 default table + NVM 覆寫） ===== */
const BASE = BASE_RAW.map(([name,area,min,tg,note,lat,lng])=>({id:"b:"+name,name,area,min,tags:[...tg],note,off:false,lat,lng}));
function spots(){
  const del=new Set(data.deleted);
  return BASE.filter(s=>!del.has(s.id)).map(s=>data.edits[s.id]?Object.assign({},s,data.edits[s.id]):s).concat(data.added.map(s=>({...s,manual:true})))
    .map(s=>{ const m=minFrom(s); return m===s.min ? s : {...s, min:m, baseMin:s.min}; });
}
const saveData=()=>store.set("wd_data",data);
const visitedRecently = id=>hist.some(h=>h.id===id && Date.now()-h.t < 30*864e5);
const lastVisit = id=>hist.filter(h=>h.id===id).reduce((a,h)=>Math.max(a,h.t),0);
function bearingOf(lat,lng){
  const o=origin||REF, dx=(lng-o.lng)*Math.cos(o.lat*D2R), dy=lat-o.lat;
  return (Math.atan2(dx,dy)/D2R+360)%360;
}
function dirOf(s){
  if(s.dir) return s.dir;
  if(s.lat==null) return "near";
  const b=bearingOf(s.lat,s.lng);
  for(const k of ["N","E","S","W"]){ const d=DIRS[k]; if(d.from<d.to ? (b>=d.from&&b<d.to) : (b>=d.from||b<d.to)) return k; }
  return "N";
}
const dirName=d=>d==="near"?"附近":DIRS[d].name;
function reachRange(){
  const R=REACHES[reachIdx], max=R.m||9999;
  const last=REACHES.length-1;
  const min = far ? (reachIdx===0?15 : reachIdx===last?REACHES[last-1].m : REACHES[reachIdx-1].m) : 0;
  return {min,max};
}
function passesTags(s){
  if(s.off) return false;
  for(const t of TAGS) if(t.g!=="ex" && flt[t.key] && !s.tags.includes(t.ch)) return false;
  if(flt.noresv && s.tags.includes("約")) return false;
  if(scene && SCENES[scene] && !SCENES[scene].any.some(ch=>s.tags.includes(ch))) return false;
  if(flt.avoid && visitedRecently(s.id)) return false;
  return true;
}
function isCandidate(s){
  if(!passesTags(s)) return false;
  const {min,max}=reachRange();
  if(s.min>max || s.min<min) return false;
  if(dir!=="all" && s.min>20 && dirOf(s)!==dir) return false;
  if(!origin) return true;   // 20 分鐘內的附近地點不分方向
  return true;
}
const candidates=()=>spots().filter(isCandidate);

/*__SND__*/

/*__CARSVG__*/
/* ===== 吉祥物「叭叭車」：小露營車。戳一下會叭叭叫、講話；2.5 秒內戳 5 下 → 引擎過熱冒煙（冷卻 2 秒） ===== */
const Van=(()=>{
  const btn=$("#vanBtn"), g=$("#van"), bub=$("#bubble");
  const LINES=["叭叭！今天去哪？","油加滿了，出發吧！","往南走走好不好？","帶阿公阿嬤一起去！","下雨也有地方去喔","記得帶水壺～","行李綁好了！","找個大草地放電吧"];
  let taps=[], bubT=0, busy=false;
  const draw=(f="normal")=>{ g.innerHTML=carSvg(f); };
  function say(t,ms=1600){ bub.textContent=t; bub.classList.add("show"); clearTimeout(bubT); bubT=setTimeout(()=>bub.classList.remove("show"),ms); }
  function poke(){
    if(busy) return;
    const now=Date.now(); taps=taps.filter(x=>now-x<2500); taps.push(now);
    if(taps.length>=5){
      busy=true; taps=[]; draw("hot"); btn.classList.remove("honk"); btn.classList.add("hot"); Snd.play("steam"); say("引擎過熱了啦～",1900);
      setTimeout(()=>{ btn.classList.remove("hot"); draw(); busy=false; },2000); return;
    }
    btn.classList.remove("honk"); void btn.offsetWidth; btn.classList.add("honk");
    Snd.play("honk"); draw("happy"); say(LINES[Math.floor(Math.random()*LINES.length)]);
    setTimeout(()=>{ if(!busy) draw(); },900);
  }
  draw(); btn.onclick=poke;
  return {say,draw};
})();

/* ===== 台灣地圖：縣市亮起來、從家裡擴散的圓、方向扇形、地點小點 ===== */
const Map2=(()=>{
  const svg=$("#map"), cam=$("#cam"), card=$("#mapCard");
  let cw=360, ch=420, view={x:HP[0],y:HP[1]+40,k:1}, ringR=0, raf=0;
  // 縣市底圖
  $("#counties").innerHTML=MAP.counties.map(c=>`<path class="county" data-n="${c.n}" d="${c.d}" fill="${COUNTY_COLOR[c.n]||"#DDEFD6"}" stroke="#fff" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`).join("");
  $("#landClipPath").setAttribute("d",MAP.outline);
  ["#landShadow","#dimmer","#landStroke"].forEach(q=>$(q).setAttribute("d",MAP.outline));
  $("#twBase").innerHTML=MAP.counties.map(c=>`<path d="${c.d}" fill="${COUNTY_COLOR[c.n]||"#DDEFD6"}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`).join("")+`<path d="${MAP.outline}" fill="none" stroke="${INK}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
  $("#labels").innerHTML=CITY_LABELS.map(([n,la,lo])=>{ const [x,y]=proj(la,lo); return `<g class="lbl" data-x="${x}" data-y="${y}"><text text-anchor="middle" font-size="12.5" fill="${INK}" stroke="#fff" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke">${n}</text></g>`; }).join("");
  $("#home").innerHTML=`<g transform="translate(-13,-24)"><path d="M3 12 L13 3 L23 12" fill="#FF8FA3" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M6 11v12h14V11" fill="#FFF6E2" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><rect x="11" y="16" width="5" height="7" rx="1.5" fill="#FFD54A" stroke="${INK}" stroke-width="2"/></g><circle r="4" fill="${INK}"/>`;
  $("#pin").innerHTML=`<g class="pinIn"><path d="M0 0 C-3 -8 -12 -14 -12 -24 A12 12 0 0 1 12 -24 C12 -14 3 -8 0 0Z" fill="#FF7A59" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/><circle cy="-24" r="4.5" fill="#fff" stroke="${INK}" stroke-width="2"/></g>`;
  $("#mapVan").innerHTML=`<g transform="translate(-27,-38) scale(.5)">${carSvg("happy")}</g>`;
  function placeOrigin(){ ["#maskCirc","#rippleRing"].forEach(q=>{ $(q).setAttribute("cx",HP[0]); $(q).setAttribute("cy",HP[1]); }); $("#home").style.display=origin?"":"none"; }
  placeOrigin();

  function size(){ const r=card.getBoundingClientRect(); cw=r.width||360; ch=r.height||420; svg.setAttribute("viewBox",`0 0 ${cw} ${ch}`); }
  // 讓「不受縮放影響」的東西（小點、標籤、家、圖釘、小車）維持固定大小
  function applyView(){
    const {x,y,k}=view;
    cam.setAttribute("transform",`translate(${cw/2-k*x},${ch/2-k*y}) scale(${k})`);
    const inv=1/k;
    $$("#labels .lbl").forEach(l=>l.setAttribute("transform",`translate(${l.dataset.x},${l.dataset.y}) scale(${inv})`));
    $$("#dots .dg").forEach(d=>d.setAttribute("transform",`translate(${d.dataset.x},${d.dataset.y}) scale(${inv})`));
    $("#home").setAttribute("transform",`translate(${HP[0]},${HP[1]}) scale(${inv})`);
    const pin=$("#pin"); if(pin.dataset.x) pin.setAttribute("transform",`translate(${pin.dataset.x},${pin.dataset.y}) scale(${inv})`);
    const v=$("#mapVan"); if(v.dataset.x) v.setAttribute("transform",`translate(${v.dataset.x},${v.dataset.y}) scale(${inv*(+v.dataset.flip||1)},${inv})`);
    $("#rippleRing").setAttribute("stroke-width",2.5*inv); $("#rippleRing").setAttribute("stroke-dasharray",`${7*inv} ${5*inv}`);
    $("#maskCirc").setAttribute("r",ringR); $("#rippleRing").setAttribute("r",ringR);
    $("#landShadow").setAttribute("transform",`translate(${4*inv},${6*inv})`);
  }
  // 依「開多遠＋方向」算鏡頭：看得到整個擴散範圍
  function targetView(){
    const R=REACHES[reachIdx];
    if(!R.km || !origin){ const k=Math.min(cw/400,ch/720)*0.98; return {x:200,y:360,k,r:0}; }
    const r=R.km*KM; let x=HP[0], y=HP[1];
    if(dir!=="all"){ const d=DIRS[dir], mid=(d.from<d.to? (d.from+d.to)/2 : ((d.from+d.to+360)/2)%360)*D2R; x+=Math.sin(mid)*r*.42; y-=Math.cos(mid)*r*.42; }
    const half=r*1.12+18;
    const k=Math.min(cw/(2*half), ch/(2*half), 6);
    return {x,y,k,r};
  }
  function animateTo(ms=850){
    cancelAnimationFrame(raf);
    const a={...view,r:ringR}, b=targetView(), t0=performance.now();
    const step=now=>{
      const t=Math.min(1,(now-t0)/ms), e=ease(t);
      view={x:a.x+(b.x-a.x)*e, y:a.y+(b.y-a.y)*e, k:a.k*Math.pow(b.k/a.k,e)};
      ringR=a.r+(b.r-a.r)*e;
      applyView();
      if(t<1) raf=requestAnimationFrame(step);
    };
    raf=requestAnimationFrame(step);
  }
  // 擴散範圍以外蓋一層淡白；選了方向，只有那個扇形是亮的
  function paintCounties(){
    const all=!REACHES[reachIdx].km || !origin;
    $("#dimmer").style.display=$("#rippleRing").style.display = all?"none":"";
  }
  function paintWedge(){
    if(dir==="all"){ $("#wedgeClipPath").setAttribute("d",""); $("#maskG").removeAttribute("clip-path"); return; }
    const d=DIRS[dir], R=1500, a1=d.from*D2R, a2=(d.to<d.from?d.to+360:d.to)*D2R;
    const p=a=>`${HP[0]+Math.sin(a)*R} ${HP[1]-Math.cos(a)*R}`;
    $("#wedgeClipPath").setAttribute("d",`M${HP[0]} ${HP[1]} L${p(a1)} A${R} ${R} 0 ${(a2-a1)>Math.PI?1:0} 1 ${p(a2)} Z`);
    $("#maskG").setAttribute("clip-path","url(#wedgeClip)");
  }
  function paintDots(){
    // 只畫符合條件的點（不符合的灰點拿掉，地圖比較乾淨）
    const all=spots().filter(s=>s.lat!=null && isCandidate(s));
    $("#dots").innerHTML=all.map(s=>{ const [x,y]=proj(s.lat,s.lng);
      return `<g class="dg" data-id="${esc(s.id)}" data-x="${x}" data-y="${y}"><circle class="dot on" r="5.5" fill="#FF7A59" stroke="#fff" stroke-width="2"/></g>`; }).join("");
    applyView();
  }
  // 地點在哪個縣市：用 SVG 的 isPointInFill 判斷點在不在縣市形狀裡（結果記起來，不用每次算）
  const cCache={};
  function countyOf(s){
    if(s.id in cCache) return cCache[s.id];
    const [x,y]=proj(s.lat,s.lng); let hit=null;
    for(const p of $$("#counties .county")){ try{ if(p.isPointInFill(new DOMPoint(x,y))){ hit=p.dataset.n; break; } }catch(e){} }
    if(!hit){ let best=1e9; for(const p of $$("#counties .county")){ const b=p.getBBox(), dx=b.x+b.width/2-x, dy=b.y+b.height/2-y, d=dx*dx+dy*dy; if(d<best){ best=d; hit=p.dataset.n; } } }
    return cCache[s.id]=hit;
  }
  function litCounty(n){ $$("#counties .county").forEach(p=>p.classList.toggle("lit",p.dataset.n===n)); }
  function countyCenter(n){ const p=$(`#counties .county[data-n="${n}"]`); if(!p) return [0,0]; const b=p.getBBox(); return [b.x+b.width/2,b.y+b.height/2]; }
  function hidePick(){ litCounty(null); $("#pin").style.display="none"; $("#mapVan").style.display="none"; delete $("#pin").dataset.x; delete $("#mapVan").dataset.x; }
  function flash(id,on){ const g=$(`#dots .dg[data-id="${CSS.escape(id)}"] circle`); if(g) g.classList.toggle("flash",on); }
  // 小動畫：數值補間（給圖釘落下、小車開過去用）
  function tween(ms,fn){ return new Promise(res=>{ const t0=performance.now(); const st=now=>{ const t=Math.min(1,(now-t0)/ms); fn(t); if(t<1) requestAnimationFrame(st); else res(); }; requestAnimationFrame(st); }); }
  async function dropPin(s){
    const [x,y]=proj(s.lat,s.lng), pin=$("#pin"), inn=pin.querySelector(".pinIn");
    pin.dataset.x=x; pin.dataset.y=y; pin.style.display=""; applyView();
    await tween(380,t=>{ const b=t<.6? -60*(1-t/.6)*(1-t/.6) : -10*Math.sin((t-.6)/.4*Math.PI); inn.setAttribute("transform",`translate(0,${b})`); });
    inn.removeAttribute("transform");
  }
  async function drive(s){
    const [x,y]=proj(s.lat,s.lng), v=$("#mapVan");
    v.dataset.flip = x<HP[0] ? -1 : 1; v.style.display="";
    await tween(650,t=>{ const e=ease(t); v.dataset.x=HP[0]+(x-HP[0])*e; v.dataset.y=HP[1]+(y-HP[1])*e - Math.sin(t*Math.PI)*8/view.k; applyView(); });
  }
  function refresh(anim=true){ size(); placeOrigin(); paintCounties(); paintWedge(); paintDots(); anim?animateTo():(()=>{ const b=targetView(); view={x:b.x,y:b.y,k:b.k}; ringR=b.r; applyView(); })(); }
  window.addEventListener("resize",()=>{ size(); const b=targetView(); view={x:b.x,y:b.y,k:b.k}; ringR=b.r; applyView(); });
  let tapCb=null;
  svg.addEventListener("click",e=>{
    if(!tapCb) return;
    const r=svg.getBoundingClientRect(), sx=e.clientX-r.left, sy=e.clientY-r.top;
    const mx=(sx-(cw/2-view.k*view.x))/view.k, my=(sy-(ch/2-view.k*view.y))/view.k;
    const [lat,lng]=unproj(mx,my); const cb=tapCb; tapCb=null; card.classList.remove("tapping"); cb(lat,lng);
  });
  const waitTap=cb=>{ tapCb=cb; card.classList.add("tapping"); };
  const cancelTap=()=>{ tapCb=null; card.classList.remove("tapping"); };
  function snap(){ size(); const b=targetView(); view={x:b.x,y:b.y,k:b.k}; ringR=b.r; applyView(); }
  // 地圖放大／縮小：卡片高度用 CSS 動畫，動畫期間每一格重新對焦
  function setBig(on){
    if(card.classList.contains("big")===!!on) return Promise.resolve();
    card.classList.toggle("big",!!on);
    $("#zoomBtn").innerHTML=ui(on?"shrink":"expand",18);
    $("#zoomBtn").setAttribute("aria-label",on?"縮小地圖":"放大地圖");
    return new Promise(res=>{ const t0=performance.now(); const f=now=>{ snap(); if(now-t0<520) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  }
  return {refresh,animateTo,paintDots,hidePick,flash,dropPin,drive,size,waitTap,cancelTap,setBig,snap,countyOf,litCounty,countyCenter};
})();

/* ===== 控制面板 ===== */
function renderReach(){
  $("#reachSeg").style.gridTemplateColumns=`repeat(${REACHES.length},1fr)`;
  $("#reachSeg").innerHTML=REACHES.map((r,i)=>`<button data-i="${i}" class="${reachIdx===i?"on":""}">${r.big}<small>${r.sm}</small></button>`).join("");
  $$("#reachSeg button").forEach(b=>b.onclick=()=>{ if(rolling) return; reachIdx=+b.dataset.i; store.set("wd_reach",reachIdx); Snd.play("pop"); Map2.hidePick(); renderHome(); });
  $("#reachTag").innerHTML=`可以開到：<b>${REACHES[reachIdx].name}</b>`;
}
function renderDir(){
  const arrow=d=>d==="all"?ui("compass",15):`<svg class="ic" width="15" height="15" viewBox="0 0 24 24"><g transform="rotate(${({N:0,E:100,S:200,W:290})[d]} 12 12)"><path d="M12 3 L18 12 H14 V21 H10 V12 H6 Z" fill="#FF7A59" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></g></svg>`;
  $("#dirSeg").innerHTML=Object.entries(DIRS).map(([k,d])=>`<button data-d="${k}" class="${dir===k?"on":""}">${arrow(k)}${d.name}</button>`).join("");
  $$("#dirSeg button").forEach(b=>b.onclick=()=>{ if(rolling) return; dir=b.dataset.d; store.set("wd_dir",dir); Snd.play("pop"); Map2.hidePick(); renderHome(); });
}
function tagIcons(s,sz,max=4){ const t=TAGS.filter(x=>s.tags.includes(x.ch)); return t.slice(0,max).map(x=>ui(x.ic,sz)).join("")+(t.length>max?`<b class="more">+${t.length-max}</b>`:""); }
const CK=on=>`<span class="ck">${on?`<svg width="10" height="10" viewBox="0 0 12 12"><path d="M2 6.3l2.6 2.6L10 3.4" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`:""}</span>`;
// 細節條件的完整清單（[key, icon, 名稱]）
const EXTRA=()=>[
  ["adult","大人在意（全部都要有）",TAGS.filter(t=>t.g==="adult").map(t=>[t.key,t.ic,t.label])],
  ["kid","更細的玩法（全部都要有）",TAGS.filter(t=>t.g==="kid").map(t=>[t.key,t.ic,t.label])],
  ["ex","排除",[["noresv","calendar","不要需預約的"],["avoid","clock","避開 30 天內去過"],["far","car",`不要太近（${reachRange().min||15} 分鐘以上）`]]],
];
const isOn=k=>k==="far"?far:!!flt[k];
function toggleCond(k){ if(k==="far"){ far=!far; store.set("wd_far",far); } else { flt[k]=!flt[k]; store.set("wd_flt",flt); } Snd.play("toggle",isOn(k)); Map2.hidePick(); }
function countWith(fn){ const s0=scene; const r=fn(); scene=s0; return r; }
function renderScenes(){
  const n=k=>countWith(()=>{ scene=k; return candidates().length; });
  $("#scenes").innerHTML=Object.entries(SCENES).map(([k,s])=>{ const c=n(k); return `<button class="scene ${scene===k?"on":""} ${c?"":"zero"}" data-s="${k}">
      <span class="si">${ui(s.ic,30)}</span><b>${s.name}</b><small>${s.sub}</small><i>${c}</i></button>`; }).join("");
  $$("#scenes .scene").forEach(b=>b.onclick=()=>{ if(rolling) return; const k=b.dataset.s; scene = scene===k ? "" : k; store.set("wd_scene",scene); Snd.play("toggle",!!scene); Map2.hidePick(); renderHome(false); });
}
function renderChips(){
  const on=EXTRA().flatMap(g=>g[2]).filter(([k])=>isOn(k));
  $("#chips").innerHTML=(on.length
      ? `<div class="sumTags">${on.map(([k,ic,l])=>`<button class="sumTag" data-k="${k}">${ui(ic,15)}${l.replace(/（.*?）/,"")}<span class="x">×</span></button>`).join("")}</div>`
      : `<div class="sumNone">沒有特別要求</div>`)
    +`<button class="addCond" id="addCond">${ui("plusc",16)}${on.length?"調整條件":"加條件"}<small>停車、哺乳室、樹蔭…</small></button>`;
  $$("#chips .sumTag").forEach(b=>b.onclick=()=>{ if(rolling) return; toggleCond(b.dataset.k); renderHome(false); });
  $("#addCond").onclick=()=>{ if(rolling) return; Snd.play("pop"); showConds(); };
}
function showConds(){
  const paint=()=>{
    $("#condBody").innerHTML=EXTRA().map(([g,title,list])=>`<div class="chipGrp"><div class="chipTitle">${title}</div><div class="tags">${
      list.map(([k,ic,l])=>`<button class="ltag ${isOn(k)?"on":""}" data-k="${k}">${CK(isOn(k))}${ui(ic,17)}${l}</button>`).join("")}</div></div>`).join("");
    $$("#condBody .ltag").forEach(b=>b.onclick=()=>{ toggleCond(b.dataset.k); paint(); renderHome(false); });
    const n=candidates().length;
    $("#condDone").innerHTML=n?`好了，有 ${n} 個地點`:`沒有符合的地點，拿掉一些試試`;
    $("#condClr").style.visibility=EXTRA().flatMap(g=>g[2]).some(([k])=>isOn(k))?"visible":"hidden";
  };
  openSheet(`<div class="sheetBody form condSheet"><h2>講究一下</h2><div class="note2">勾越多，選擇越少；不確定就先不要勾</div>
    <div id="condBody"></div>
    <div class="condFoot"><button class="btn" id="condClr">全部清掉</button><button class="btn yellow" id="condDone"></button></div></div>`);
  paint();
  $("#condDone").onclick=closeSheet;
  $("#condClr").onclick=()=>{ EXTRA().flatMap(g=>g[2]).forEach(([k])=>{ if(k==="far") far=false; else flt[k]=false; }); store.set("wd_far",far); store.set("wd_flt",flt); Snd.play("pop"); paint(); renderHome(false); };
}
let poolOpen=false;
function renderPool(){
  const list=candidates().sort((a,b)=>a.min-b.min||a.name.localeCompare(b.name,"zh-Hant"));
  $("#poolInfo").innerHTML=`符合條件的地點有 <b>${list.length}</b> 個 <span class="more">${poolOpen?"收起 ▲":"看清單 ▼"}</span>`;
  $("#poolList").hidden=!poolOpen;
  if(!poolOpen) return;
  $("#poolList").innerHTML = list.length ? list.map(s=>{ const b=bucketOf(s.min); return `<button class="pl" data-id="${esc(s.id)}">
      <span class="m" style="background:${b.c}">${s.min}<small>分</small></span>
      <span class="tx"><b>${esc(s.name)}</b><small>${esc(s.area)}・${s.min<=20?"附近":dirName(dirOf(s))}</small></span>
      <span class="tg">${tagIcons(s,16)}</span></button>`; }).join("")
    : `<div class="empty" style="padding:14px">沒有符合的地點，開遠一點或拿掉一些條件試試</div>`;
  $$("#poolList .pl").forEach(r=>r.onclick=()=>{ const s=spots().find(x=>x.id===r.dataset.id); if(s){ Snd.play("pop"); showResult(s); } });
}
$("#poolInfo").onclick=()=>{ poolOpen=!poolOpen; Snd.play("pop"); renderPool(); if(poolOpen) setTimeout(()=>$("#poolList").scrollIntoView({behavior:"smooth",block:"end"}),60); };
function renderHome(moveCam=true){ renderReach(); renderDir(); renderScenes(); renderChips(); renderPool(); moveCam?Map2.refresh(true):Map2.paintDots(); }
function renderAll(){ renderHome(false); if(curTab==="list") renderList(); if(curTab==="trail") renderTrail(); }


/* ===== 設定出發點 ===== */
function setOrigin(o,msg){
  origin=o; store.set("wd_origin",o); setHP(); Map2.hidePick(); renderHome(); renderOriginTag();
  if(msg){ toast(msg); Snd.play("tada"); }
}
function renderOriginTag(){ $("#fromTag").innerHTML=ui("pin",16)+originName()+`<span class="chg">${origin?"更改":"點我設定"}</span>`; $("#mapCard").classList.toggle("noOrigin",!origin); }
function locate(){
  if(!navigator.geolocation){ toast("這支手機不能定位，改用地圖點選吧"); return; }
  toast("定位中…");
  navigator.geolocation.getCurrentPosition(p=>{
    const lat=p.coords.latitude, lng=p.coords.longitude;
    if(lat<21.8||lat>25.4||lng<119.9||lng>122.1){ toast("你好像不在台灣本島，改用地圖點選吧"); return; }
    setOrigin({lat,lng,kind:"gps",label:nearestCity(lat,lng)+"附近"},`出發點：目前位置（${nearestCity(lat,lng)}附近）`);
  },err=>{ toast(err.code===1?"沒有定位權限，可以到設定打開，或改用地圖點選":"定位失敗，改用地圖點選吧"); },{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
}
function showOrigin(){
  const near=origin?`${nearestCity(origin.lat,origin.lng)}附近`:"";
  openSheet(`<div class="sheetBody form">
    <h2>從哪裡出發？</h2>
    <div class="note2" style="font-size:14px;line-height:1.6">${origin?`現在：${originName()}（${near}）`:"先設定出發點，地圖才知道要從哪裡擴散。"}<br>位置只存在這支手機裡，不會傳到任何地方。</div>
    <div style="display:grid;gap:10px;margin-top:12px">
      <button class="btn yellow" id="oGps">${ui("pin",20)}用我現在的位置</button>
      <button class="btn" id="oMap">${ui("map",20)}在地圖上點一下</button>
      ${homeSpot?`<button class="btn green" id="oHome">${ui("home",20)}從家出發（${nearestCity(homeSpot.lat,homeSpot.lng)}附近）</button>`:""}
      ${origin && origin.kind!=="home"?`<button class="btn" id="oSave">${ui("home",20)}把現在的出發點存成「家」</button>`:""}
    </div>
  </div>`);
  $("#oGps").onclick=()=>{ closeSheet(); locate(); };
  $("#oMap").onclick=()=>{ closeSheet(); setTab("roll"); Map2.setBig(true); window.scrollTo({top:0,behavior:"smooth"}); reachIdx=4; Map2.refresh(true); renderReach();
    toast("在地圖上點一下你要出發的地方"); Van.say("點地圖選出發點～",2500);
    Map2.waitTap((lat,lng)=>{ if(lat<21.8||lat>25.4||lng<119.9||lng>122.1){ toast("請點台灣本島上的地方"); return; } reachIdx=store.get("wd_reach",1); setOrigin({lat,lng,kind:"map",label:nearestCity(lat,lng)+"附近"},`出發點：${nearestCity(lat,lng)}附近`); }); };
  if($("#oHome")) $("#oHome").onclick=()=>{ closeSheet(); setOrigin({...homeSpot,kind:"home"},"從家出發！"); };
  if($("#oSave")) $("#oSave").onclick=()=>{ homeSpot={lat:origin.lat,lng:origin.lng}; store.set("wd_home",homeSpot); origin={...origin,kind:"home"}; store.set("wd_origin",origin); renderOriginTag(); closeSheet(); toast("存好了，之後可以直接「從家出發」"); Snd.play("tada"); };
}
$("#fromTag").onclick=()=>{ Snd.play("pop"); showOrigin(); };

/* 隨機決定開多遠：在幾個距離之間跳來跳去，最後停在一個（取代原本的骰子） */
async function randomReach(){
  if(rolling) return;
  if(!origin){ Snd.play("pop"); showOrigin(); return; } rolling=true; Map2.hidePick();
  $("#rndBtn").classList.add("spin"); Van.say("這次開多遠呢～",1200);
  let i=reachIdx, final=Math.floor(Math.random()*REACHES.length);
  const steps=7+Math.floor(Math.random()*3);
  for(let k=0;k<steps;k++){
    i = k===steps-1 ? final : (i+1+Math.floor(Math.random()*(REACHES.length-1)))%REACHES.length;
    reachIdx=i; renderReach(); Map2.refresh(false); Snd.play("blip",k%6);
    $("#rndDie").innerHTML=dieSvg(1+Math.floor(Math.random()*6));
    await sleep(60+k*k*4);
  }
  store.set("wd_reach",reachIdx); $("#rndBtn").classList.remove("spin"); $("#rndDie").innerHTML=dieSvg(Math.min(6,reachIdx+1));
  renderHome(); Snd.play("tada"); Van.say(`這次：${REACHES[reachIdx].name}！`,1600);
  rolling=false;
}
$("#rndBtn").onclick=randomReach;

/* 幫我挑一個：候選地點輪流閃 → 停在一個 → 圖釘落下 → 小車開過去 → 明信片 */
async function pick(){
  if(rolling) return;
  if(!origin){ Snd.play("pop"); showOrigin(); return; }
  const pool=candidates();
  if(!pool.length){ Snd.play("oops"); toast("沒有符合條件的地點，開遠一點或拿掉一些條件試試"); $("#goBtn").animate([{transform:"translateX(0)"},{transform:"translateX(-9px)"},{transform:"translateX(9px)"},{transform:"none"}],{duration:300}); return; }
  let p2=pool.length>1?pool.filter(s=>s.id!==lastId):pool;
  const spot=p2[Math.floor(Math.random()*p2.length)]; lastId=spot.id;
  rolling=true; $("#goBtn").disabled=true; Map2.hidePick();
  window.scrollTo({top:0,behavior:"smooth"});
  await Map2.setBig(true);
  Van.say("我找找看…",1400);
  const onMap=pool.filter(s=>s.lat!=null);
  $("#mapCard").classList.add("picking");
  // 跑馬燈：有地點的縣市繞著出發點一個一個亮，越跑越慢，最後停在挑中的那個縣市
  const byC={}; onMap.forEach(s=>{ const c=Map2.countyOf(s); (byC[c]=byC[c]||[]).push(s); });
  const target=spot.lat!=null?Map2.countyOf(spot):null;
  let cs=Object.keys(byC);
  const ang=n=>{ const [x,y]=Map2.countyCenter(n); return Math.atan2(x-HP[0],-(y-HP[1])); };
  cs.sort((a,b)=>ang(a)-ang(b));
  const lightDots=(n,on)=>(byC[n]||[]).forEach(s=>Map2.flash(s.id,on));
  if(cs.length>1 && target){
    const ti=cs.indexOf(target), L=cs.length;
    let loops=Math.max(1,Math.ceil((14-ti)/L)); while(loops*L+ti>30 && loops>1) loops--;
    const total=loops*L+ti; let prev=null;
    for(let k=0;k<=total;k++){
      const n=cs[k%L];
      if(prev) lightDots(prev,false);
      Map2.litCounty(n); lightDots(n,true); prev=n;
      Snd.play("blip",k);
      const p=k/total; await sleep(45+Math.pow(p,2.4)*260);
    }
    lightDots(prev,false);
    await sleep(120);
  } else {
    // 只有一個縣市：在這個縣市裡的地點之間跳
    if(target) Map2.litCounty(target);
    const pool2=target?byC[target]:onMap; let prev=null; const steps=Math.min(14,Math.max(6,pool2.length*2));
    for(let k=0;k<steps && pool2.length>1;k++){
      const s=k===steps-1?spot:pool2[Math.floor(Math.random()*pool2.length)];
      if(prev) Map2.flash(prev,false); Map2.flash(s.id,true); prev=s.id; Snd.play("blip",k);
      await sleep(60+Math.pow(k/steps,2.2)*240);
    }
    if(prev) Map2.flash(prev,false);
  }
  $("#mapCard").classList.remove("picking");
  if(spot.lat!=null){ Map2.flash(spot.id,true); Snd.play("pop"); await Map2.dropPin(spot); Snd.play("beep"); await Map2.drive(spot); }
  Snd.play("tada"); Van.say(`去${spot.name.replace(/（.*?）/,"").slice(0,8)}！`,1800);
  await sleep(150);
  rolling=false; $("#goBtn").disabled=false;
  if(sheetOpen()) toast(`挑到：${spot.name}`); else showResult(spot);
}
$("#goBtn").onclick=pick;
$("#zoomBtn").innerHTML=ui("expand",18);
$("#zoomBtn").onclick=e=>{ e.stopPropagation(); if(rolling) return; Snd.play("pop"); Map2.setBig(!$("#mapCard").classList.contains("big")); };
// 回頭改條件時，地圖自動縮回小的，把畫面讓給條件
$(".panel").addEventListener("click",e=>{ if(!rolling && e.target.closest("button")) Map2.setBig(false); });

/*__SHEET__*/

/* 明信片上的小地圖：從家裡到目的地的虛線 */
function viewSvg(s,b){
  if(s.lat==null) return `<svg viewBox="0 0 400 132" preserveAspectRatio="xMidYMid slice"><rect width="400" height="132" fill="${b.l}"/><circle cx="60" cy="40" r="18" fill="#FFD54A" stroke="${INK}" stroke-width="3"/><path d="M0 112 Q120 84 230 108 T400 100 V132 H0Z" fill="#8FCF6B" stroke="${INK}" stroke-width="3"/></svg>`;
  const [x,y]=proj(s.lat,s.lng), [hx,hy]=HP;
  let x0=Math.min(x,hx), x1=Math.max(x,hx), y0=Math.min(y,hy), y1=Math.max(y,hy);
  const pad=Math.max(14,(x1-x0+y1-y0)*.25); x0-=pad; x1+=pad; y0-=pad; y1+=pad;
  let w=x1-x0, h=y1-y0; const A=400/132;
  if(w/h<A){ const nw=h*A; x0-=(nw-w)/2; w=nw; } else { const nh=w/A; y0-=(nh-h)/2; h=nh; }
  const u=w/400;
  return `<svg viewBox="${x0} ${y0} ${w} ${h}" preserveAspectRatio="xMidYMid slice"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#CDEAF9"/><use href="#twBase"/>
    <path d="M${hx} ${hy} Q${(hx+x)/2+ (y-hy)*.15} ${(hy+y)/2-(x-hx)*.15} ${x} ${y}" fill="none" stroke="${b.c}" stroke-width="${3.5*u}" stroke-dasharray="${8*u} ${6*u}" stroke-linecap="round"/>
    <circle cx="${hx}" cy="${hy}" r="${6*u}" fill="#FFD54A" stroke="${INK}" stroke-width="${2.2*u}"/>
    <g transform="translate(${x} ${y}) scale(${u})"><path d="M0 0 C-3 -8 -12 -14 -12 -24 A12 12 0 0 1 12 -24 C12 -14 3 -8 0 0Z" fill="#FF7A59" stroke="${INK}" stroke-width="2.6"/><circle cy="-24" r="4.5" fill="#fff" stroke="${INK}" stroke-width="2"/></g></svg>`;
}
/*__POSTMARK__*/
function showResult(s){
  const b=bucketOf(s.min), lv=lastVisit(s.id), d=dirOf(s);
  openSheet(`<div class="pc">
    <div class="view">${viewSvg(s,b)}
      <div class="stamp"><div class="si" style="background:${b.c}"><span style="font-size:20px;line-height:1">${s.min}</span><span>分鐘</span></div></div>
      ${postmark()}
    </div>
    <div class="sheetBody">
      <div class="to">TO：</div>
      <h2>${esc(s.name)}</h2>
      <div class="addr">${ui("pin",18)}${esc(s.area||"—")}・${s.min<=20?"出發點附近":dirName(d)}</div>
      <div class="addr">${ui("car",18)}從出發點開車約 ${s.min} 分鐘${s.baseMin?"（估計）":""}</div>
      <div class="stk">${stickers(s)||`<span class="stkr">${ui("spark",18)}出發就對了</span>`}</div>
      ${s.note?`<div class="msg">${esc(s.note)}</div>`:""}
      ${lv?`<div class="last">${ui("clock",14)} 上次去：${fmtDate(lv)}</div>`:""}
      <div class="acts">
        <a class="btn navy wide" href="${mapUrl(s)}" target="_blank" rel="noopener">${ui("nav",22)}Google 地圖導航</a>
        <button class="btn yellow" id="goHere">${ui("flag",20)}就去這！</button>
        <button class="btn" id="againBtn">${ui("again",20)}再挑一個</button>
      </div>
      <button class="linkBtn" id="editFromRes">編輯這個地點</button>
      <div class="est">車程是估計值，出發前看一下導航喔</div>
    </div></div>`);
  $("#goHere").onclick=()=>{
    hist.push({id:s.id,t:Date.now(),name:s.name,min:s.min}); if(hist.length>500) hist=hist.slice(-500); store.set("wd_hist",hist);
    Snd.play("cheer"); confetti(); toast("出發囉！足跡記下來了");
    setTimeout(()=>{ closeSheet(); renderAll(); },700);
  };
  $("#againBtn").onclick=()=>{ closeSheet(); setTimeout(pick,250); };
  $("#editFromRes").onclick=()=>{ Snd.play("pop"); editSpot(s.id); };
}

/*__CONFETTI__*/
/*__EXPORT__*/

/* ===== 名單頁（票根） ===== */
function renderDirTabs(){
  const all=spots(), cnt=k=>k==="all"?all.length: all.filter(s=> k==="near"? s.min<=20 : (s.min>20 && dirOf(s)===k)).length;
  const opts=[["all","全部"],["near","附近"],["N","往北"],["E","往東"],["S","往南"],["W","往西"]];
  $("#tierTabs").innerHTML=opts.map(([k,n])=>`<button data-k="${k}" class="${listDir===k?"on":""}" style="${listDir===k?`background:${INK}`:""}">${n} ${cnt(k)}</button>`).join("");
  $$("#tierTabs button").forEach(b=>b.onclick=()=>{ listDir=b.dataset.k; Snd.play("pop"); renderList(); });
}
function renderList(){
  $("#listTitle").innerHTML=`${ui("ticketL",28)}口袋名單<small>${spots().length} 個地點</small>`;
  renderDirTabs();
  const q=$("#q").value.trim().toLowerCase();
  const all=spots().filter(s=>(!q || (s.name+s.area+(s.note||"")).toLowerCase().includes(q))
    && (listDir==="all" || (listDir==="near"? s.min<=20 : (s.min>20 && dirOf(s)===listDir))));
  let h="";
  for(const b of BUCKETS){
    const lo=BUCKETS[BUCKETS.indexOf(b)-1]; const arr=all.filter(s=>s.min<=b.max && (!lo || s.min>lo.max)).sort((a,c)=>a.min-c.min||a.name.localeCompare(c.name,"zh-Hant"));
    if(!arr.length) continue;
    h+=`<div class="grpH"><i style="background:${b.c}">${b.name}</i><small>${arr.length} 個</small></div>`+
      arr.map(s=>`<button class="tk ${s.off?"off":""}" data-id="${esc(s.id)}">
        <span class="stub" style="background:${b.c}">${s.min}<small>分鐘</small></span>
        <span class="tx"><div class="nm">${esc(s.name)}${s.off?`<span class="badge gray">不挑</span>`:""}${visitedRecently(s.id)?`<span class="badge">最近去過</span>`:""}</div><div class="ar">${esc(s.area)}・${s.min<=20?"附近":dirName(dirOf(s))}${s.note?"・"+esc(s.note):""}</div></span>
        <span class="tg">${tagIcons(s,17)}</span></button>`).join("");
  }
  $("#list").innerHTML = h || `<div class="empty">找不到地點<br>按右下角的 ＋ 加一個吧！</div>`;
  $$("#list .tk").forEach(r=>r.onclick=()=>{ Snd.play("pop"); editSpot(r.dataset.id); });
}
$("#q").addEventListener("input",()=>renderList());

/* ===== 足跡頁 ===== */
function armBtn(el,label,fn){ let armed=false,t=0; el.onclick=()=>{ if(!armed){ armed=true; Snd.play("oops"); el.querySelector(".r").textContent=label; clearTimeout(t); t=setTimeout(()=>{ armed=false; renderTrail(); },3500); return; } fn(); }; }
function renderTrail(){
  $("#trailTitle").innerHTML=`${ui("foot",28)}出遊足跡`;
  const ids=new Set(hist.map(h=>h.id)), yr=new Date().getFullYear();
  const thisYear=hist.filter(h=>new Date(h.t).getFullYear()===yr).length;
  $("#stats").innerHTML=`<div class="stat"><b>${thisYear}</b><small>${yr} 年出門次數</small></div><div class="stat"><b>${ids.size}</b><small>去過的地方</small></div>`;
  const all=spots(), byId=Object.fromEntries(all.map(s=>[s.id,s]));
  const recent=[...hist].sort((a,b)=>b.t-a.t).slice(0,40);
  $("#trail").innerHTML = recent.length ? recent.map(h=>{
    const s=byId[h.id], name=s?s.name:(h.name||"（已刪除的地點）"), min=s?s.min:(h.min||0), b=bucketOf(min||1);
    return `<div class="stop" style="--c:${b.c}"><div class="d">${fmtDate(h.t)}・約 ${min} 分鐘</div><div class="n">${esc(name)}</div></div>`;
  }).join("") : `<div class="empty" style="margin-left:-26px">${ui("car",40)}<br>還沒有足跡<br>挑到喜歡的地點，按「就去這！」就會記在這裡</div>`;
  $("#settings").innerHTML=`
    <button class="set" id="sBgm">${ui("note",20)}背景音樂<span class="r">${Snd.bgmOn?"開":"關"}</span></button>
    <button class="set" id="sSfx">${ui("speaker",20)}音效<span class="r">${Snd.sfxOn?"開":"關"}</span></button>
    <button class="set" id="sLog">${ui("spark",20)}改版紀錄<span class="r">v${APP_VERSION}</span></button>
    <button class="set" id="sExport">${ui("box",20)}匯出資料<span class="r">換手機、換網址用</span></button>
    <button class="set" id="sImport">${ui("boxIn",20)}匯入資料<span class="r">貼上匯出的代碼</span></button>
    <button class="set" id="sReset">${ui("reset",20)}還原內建名單<span class="r">自己新增的會保留</span></button>
    <button class="set danger" id="sClear">${ui("trash",20)}清除足跡<span class="r">${hist.length} 筆</span></button>`;
  $("#sBgm").onclick=()=>setBgm(!Snd.bgmOn);
  $("#sSfx").onclick=()=>setSfx(!Snd.sfxOn);
  $("#sLog").onclick=()=>{ Snd.play("pop"); showLog(); };
  $("#sExport").onclick=()=>{ Snd.play("pop"); showExport(); };
  $("#sImport").onclick=()=>{ Snd.play("pop"); showImport(); };
  armBtn($("#sReset"),"再按一次確認還原",()=>{ data.edits={}; data.deleted=[]; saveData(); toast("內建名單已還原"); Snd.play("tada"); renderAll(); });
  armBtn($("#sClear"),"再按一次確認清除",()=>{ hist=[]; store.set("wd_hist",hist); toast("足跡清掉了"); renderAll(); });
  $("#footCount").textContent=`口袋名單 ${all.length} 個地點`;
}

/* ===== 新增／編輯地點 ===== */
function editSpot(id){
  const s = id ? spots().find(x=>x.id===id) : {id:null,name:"",area:"",min:30,tags:[],note:"",off:false};
  if(!s) return;
  const f={...s,tags:[...s.tags]}; f.d = s.min<=20 && !s.dir ? "near" : dirOf(s);
  const isBase = !!f.id && f.id.startsWith("b:");
  openSheet(`<div class="sheetBody form">
    <h2>${id?"編輯地點":"新增地點"}</h2>
    <label>名稱</label><input type="text" id="fName" maxlength="40" value="${esc(f.name)}" placeholder="例如：南寮漁港">
    <label>地區</label><input type="text" id="fArea" maxlength="20" value="${esc(f.area)}" placeholder="例如：新竹市">
    <label>從出發點開車大約幾分鐘${s.baseMin?"（目前是估計的，改了就照你的）":""}</label>
    <div class="minRow"><button id="mMinus">−</button><output id="fMin"></output><button id="mPlus">＋</button><span class="tl" id="fTier"></span></div>
    <label>在哪個方向</label><div class="seg dirSeg" id="fDir" style="grid-template-columns:repeat(5,1fr)"></div>
    <label>貼上標籤</label><div class="tags" id="fTags"></div>
    <label>一句話備註</label><textarea id="fNote" maxlength="80" placeholder="例如：有大草皮、記得帶防曬">${esc(f.note||"")}</textarea>
    <div class="sw"><span class="t">${ui("eyeoff",20)}先不要挑到這裡</span><button id="fOff" class="${f.off?"on":""}" aria-label="不要挑到"></button></div>
    <div class="formActs">
      ${id?`<button class="btn danger" id="fDel">刪除</button>`:""}
      <button class="btn green" id="fSave">${ui("check",20)}儲存</button>
    </div>
  </div>`);
  const paintMin=()=>{ const b=bucketOf(f.min); $("#fMin").textContent=f.min+" 分"; $("#fTier").textContent=b.name; $("#fTier").style.background=b.c; };
  const paintDir=()=>{ $("#fDir").innerHTML=[["near","附近"],["N","往北"],["E","往東"],["S","往南"],["W","往西"]].map(([k,n])=>`<button data-d="${k}" class="${f.d===k?"on":""}">${n}</button>`).join("");
    $$("#fDir button").forEach(b=>b.onclick=()=>{ f.d=b.dataset.d; Snd.play("pop"); paintDir(); }); };
  const ck=on=>`<span class="ck">${on?`<svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 6.3l2.6 2.6L10 3.4" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`:""}</span>`;
  const paintTags=()=>{ $("#fTags").innerHTML=TAGS.map(t=>`<button class="ltag ${f.tags.includes(t.ch)?"on":""}" data-ch="${t.ch}">${ck(f.tags.includes(t.ch))}${ui(t.ic,19)}${t.label}</button>`).join("");
    $$("#fTags .ltag").forEach(b=>b.onclick=()=>{ const c=b.dataset.ch; f.tags=f.tags.includes(c)?f.tags.filter(x=>x!==c):f.tags.concat(c); Snd.play("toggle",f.tags.includes(c)); paintTags(); }); };
  paintMin(); paintDir(); paintTags();
  const step=d=>{ f.min=Math.max(5,Math.min(300,f.min+d)); Snd.play("pop"); paintMin(); };
  $("#mMinus").onclick=()=>step(-5); $("#mPlus").onclick=()=>step(5);
  $("#fOff").onclick=e=>{ f.off=!f.off; e.currentTarget.classList.toggle("on",f.off); Snd.play("toggle",!f.off); };
  $("#fSave").onclick=()=>{
    f.name=$("#fName").value.trim(); f.area=$("#fArea").value.trim(); f.note=$("#fNote").value.trim();
    if(!f.name){ toast("名稱要填喔"); $("#fName").focus(); return; }
    const out={name:f.name,area:f.area,min:f.min,tags:f.tags,note:f.note,off:f.off};
    if(isBase && f.min!==s.min) out.manual=true;                 // 自己改過車程 → 之後都照這個
    if(isBase && f.min===s.min && s.baseMin){ out.min=s.baseMin; }  // 沒改 → 維持估計
    // 方向：跟地圖算出來的一樣就不另外存（內建地點有座標）
    const auto = s.lat!=null ? dirOf({...s,dir:undefined}) : null;
    if(f.d!=="near" && f.d!==auto) out.dir=f.d; else if(f.d==="near" && s.lat==null) out.dir=undefined;
    if(s.lat!=null){ out.lat=s.lat; out.lng=s.lng; }
    if(!id){ data.added.push(Object.assign({id:"u:"+Date.now().toString(36)+Math.random().toString(36).slice(2,6)},out)); toast("新增好了！"); }
    else if(isBase){ data.edits[id]=out; toast("改好了！"); }
    else { const i=data.added.findIndex(x=>x.id===id); if(i>=0) data.added[i]=Object.assign({id},out); toast("改好了！"); }
    saveData(); Snd.play("tada"); closeSheet(); renderAll();
  };
  if(id){
    let armed=false;
    $("#fDel").onclick=e=>{
      if(!armed){ armed=true; e.currentTarget.classList.add("armed"); e.currentTarget.textContent="再按一次刪除"; Snd.play("oops"); return; }
      if(isBase){ data.deleted.push(id); delete data.edits[id]; } else data.added=data.added.filter(x=>x.id!==id);
      saveData(); toast("刪掉了"); closeSheet(); renderAll();
    };
  }
}
$("#addBtn").onclick=()=>{ Snd.play("pop"); editSpot(null); };

/* ===== 底部導覽列 ===== */
function setTab(t){
  curTab=t;
  $$("#nav button").forEach(b=>b.classList.toggle("on",b.dataset.tab===t));
  $("#tabRoll").hidden=t!=="roll"; $("#tabList").hidden=t!=="list"; $("#tabTrail").hidden=t!=="trail";
  if(t==="list") renderList(); if(t==="trail") renderTrail(); if(t==="roll") Map2.refresh(false);
  window.scrollTo(0,0);
}
$$("#nav button").forEach(b=>b.onclick=()=>{ if(curTab===b.dataset.tab) return; Snd.play("pop"); setTab(b.dataset.tab); });

/*__VERSION__*/
/*__UPDATE__*/

/* ===== 首次繪製 ===== */
(function(){
  const d=new Date(), wd=d.getDay(), h=d.getHours();
  $("#greet").textContent = (wd===0||wd===6) ? (h<12?"週末早安！今天開多遠？":"週末午後，出門走走吧") : (h<17?"先挑好，假日直接出發":"下班了～找個近的走走");
})();
$("#cl1").innerHTML=cloudSvg(90); $("#cl2").innerHTML=cloudSvg(60);
$("#hReach").innerHTML=ui("car",20)+"開多遠、往哪邊";
$("#hScene").insertAdjacentHTML("afterbegin",ui("map",20)+"今天想怎麼玩？");
$("#hCond").innerHTML=ui("check",20)+"講究一下";
renderOriginTag();
$("#goBtn").innerHTML=`<svg viewBox="0 0 110 80">${carSvg("happy")}</svg>幫我挑一個！`;
$("#rndDie").innerHTML=dieSvg(Math.min(6,reachIdx+1));
$("#searchIc").innerHTML=ui("search",20);
$("#addBtn").innerHTML=ui("plus",28);
const NAV=[["roll","map","挑地點"],["list","ticketL","名單"],["trail","foot","足跡"]];
$$("#nav button").forEach((b,i)=>b.innerHTML=ui(NAV[i][1],24)+NAV[i][2]);
paintSndBtns(); renderReach(); renderDir(); renderScenes(); renderChips(); renderPool(); Map2.refresh(false);
$("#footCount").textContent=`口袋名單 ${spots().length} 個地點`;

/* ===== 開機畫面：天空 → 台灣浮出來 → 從家裡一圈圈擴散 → 字一個個跳出 → 標題飛到首頁（FLIP） ===== */
(function(){
  const sp=$("#splash"); if(!sp){ splashDoneR(); return; }
  const o=`transform-box:view-box;transform-origin:${HP[0]}px ${HP[1]}px`;   // 從出發點（沒設定就從北台灣）擴散
  $("#spMap").innerHTML=`<svg viewBox="0 0 400 720"><use href="#twBase"/>
    <circle class="sp-ring" stroke-width="7" cx="${HP[0]}" cy="${HP[1]}" r="260" style="${o}"/><circle class="sp-ring r2" stroke-width="7" cx="${HP[0]}" cy="${HP[1]}" r="260" style="${o}"/><circle class="sp-ring r3" stroke-width="7" cx="${HP[0]}" cy="${HP[1]}" r="260" style="${o}"/>
    <circle cx="${HP[0]}" cy="${HP[1]}" r="9" fill="#FFD54A" stroke="${INK}" stroke-width="3"/></svg>`;
  const tt=$("#spTitle");
  tt.innerHTML=[..."假日骰骰"].map((c,i)=>`<span style="--i:${i}">${c}</span>`).join("");
  const centerTitle=()=>{ tt.style.left=Math.round((window.innerWidth-tt.getBoundingClientRect().width)/2)+"px"; };
  centerTitle();
  setTimeout(()=>sp.classList.add("sp-live"),150);   // 前 0.15 秒跟 iPhone 啟動圖一樣：只有天空底色
  let out=false;
  function exit(){
    if(out) return; out=true;
    const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish=()=>{ sp.remove(); document.body.classList.remove("sp-flying"); setTimeout(()=>document.body.classList.remove("enter"),1100); splashDoneR(); };
    document.body.classList.remove("booting");
    if(reduce){ document.body.classList.add("enter"); sp.classList.add("sp-fade"); setTimeout(finish,520); return; }
    window.scrollTo(0,0);
    document.body.classList.add("sp-flying","enter");
    Map2.refresh(false);
    centerTitle();
    tt.querySelectorAll("span").forEach(s=>{ s.style.animation="none"; s.style.opacity="1"; });
    requestAnimationFrame(()=>{
      const a=tt.getBoundingClientRect(), b=$("#h1t").getBoundingClientRect();
      tt.style.transition="transform .75s cubic-bezier(.6,0,.15,1)";
      tt.style.transform=`translate(${b.left-a.left}px,${b.top-a.top}px) scale(${b.width/a.width})`;
      sp.classList.add("sp-exit");
      setTimeout(finish,800);
    });
  }
  const t0=performance.now();
  const fontsOk=Promise.race([document.fonts?document.fonts.ready:Promise.resolve(), new Promise(r=>setTimeout(r,1200))]);
  fontsOk.then(()=>{ centerTitle(); const wait=Math.max(0,2400-(performance.now()-t0)); setTimeout(exit,wait); });
  setTimeout(exit,4000);   // 保險：最多 4 秒
})();
splashDone.then(()=>setTimeout(()=>{ if(!origin){ Van.say("先告訴我從哪裡出發～",2400); } else Van.say("今天想開多遠？",1800); },900));
