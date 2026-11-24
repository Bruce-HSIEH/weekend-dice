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
let scene    = store.get("wd_scene","");
let cnty     = store.get("wd_cnty",[]);             // 指定縣市（可多選；有選就不看車程和方向）
if(!Array.isArray(cnty)) cnty=[];
const REGIONS=[["北部",["基隆市","台北市","新北市","桃園市","新竹市","新竹縣","宜蘭縣"]],["中部",["苗栗縣","台中市","彰化縣","南投縣","雲林縣"]],
  ["南部",["嘉義市","嘉義縣","台南市","高雄市","屏東縣"]],["東部",["花蓮縣","台東縣"]]];
let cntyOpen = false;
let wxAny = [];   // 天氣題：地點至少要有其中一個標記（空的＝不限）
let view3 = "home";              // v3 首頁狀態：home（兩扇門）/ ask（幫我決定問答）/ map（地圖模式）
let mapMode = false;             // 地圖模式：只看距離＋排除條件，不看玩法和講究
let nameLimit = 90;              // 畫面裡的點少於這個數才標名字（地圖模式放寬）            // 今天想怎麼玩（情境，單選）
// 情境：一次代表一種玩法，只要有其中一項就算（OR）；細的條件才是「全部都要」（AND）
const SCENES={
  run:   {name:"放電跑跳", sub:"草地・遊戲場",   rsub:"室內遊戲場",   ic:"grass",  any:["草","滑","沙"]},
  slide: {name:"溜滑梯",   sub:"特色溜滑梯",     rsub:"室內溜滑梯",   ic:"slide",  any:["滑"]},
  animal:{name:"摸摸動物", sub:"餵食・近距離",   rsub:"室內也能看",   ic:"bunny",  any:["動"]},
  water: {name:"玩水",     sub:"戲水池・海邊",   rsub:"室內玩水",     ic:"water",  any:["水"]},
  sand:  {name:"玩沙",     sub:"沙坑・沙灘",     rsub:"室內沙坑",     ic:"sand",   any:["沙"]},
  train: {name:"看火車",   sub:"火車・小火車",   rsub:"室內也能看",   ic:"train",  any:["車"]},
  plane: {name:"看飛機",   sub:"機場・觀景台",   rsub:"室內也能看",   ic:"plane",  any:["機"]},
  hands: {name:"動手做",   sub:"採果・DIY",      rsub:"室內 DIY",     ic:"hands",  any:["手"]},
  spring:{name:"泡腳溫泉", sub:"長輩最愛",       rsub:"有屋頂的",     ic:"spring", any:["泉"]},
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
/* 開多遠改成連續的分鐘數（reachM，0＝全台都可以）；舊的 REACHES 只當成「幾個常用刻度」 */
let reachM = store.get("wd_reachM", null); if(reachM==null) reachM = (RC()||REACHES[1]).m;
function fmtReach(m){ if(!m) return "全台都可以"; if(m<60) return `${m} 分鐘內`; const h=Math.floor(m/60), r=m%60; return r?`${h} 小時 ${r} 分內`:`${h} 小時內`; }
function RC(){
  if(!reachM) return {m:0,name:"全台都可以",km:0,big:"不限",sm:"全台"};
  const pts=[[0,0],[30,24],[60,52],[90,82],[120,112],[180,170],[300,290]];
  let km=290; for(let i=1;i<pts.length;i++){ if(reachM<=pts[i][0]){ const [a,b]=[pts[i-1],pts[i]]; km=a[1]+(b[1]-a[1])*(reachM-a[0])/(b[0]-a[0]); break; } }
  return {m:reachM,name:fmtReach(reachM),km,big:String(reachM),sm:"分鐘"};
}
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
  const R=RC(), max=R.m||9999;
  const last=REACHES.length-1;
  const min = far ? (reachM ? Math.max(15,reachM-30) : 180) : 0;
  return {min,max};
}
function passesTags(s){
  if(s.off) return false;
  if(mapMode) return !(flt.noresv && s.tags.includes("約")) && !(flt.avoid && visitedRecently(s.id));
  for(const t of TAGS) if(t.g!=="ex" && flt[t.key] && !s.tags.includes(t.ch)) return false;
  if(flt.noresv && s.tags.includes("約")) return false;
  if(scene && SCENES[scene] && !SCENES[scene].any.some(ch=>s.tags.includes(ch))) return false;
  if(flt.avoid && visitedRecently(s.id)) return false;
  return true;
}
// 地點在哪個縣市：用 SVG 的 isPointInFill 判斷點在不在縣市形狀裡（結果記起來）
const cCache={};
function countyOf(s){
  if(s.lat==null) return null;
  if(s.id in cCache) return cCache[s.id];
  const paths=$$("#counties .county"); if(!paths.length) return null;
  const [x,y]=proj(s.lat,s.lng); let hit=null;
  for(const p of paths){ try{ if(p.isPointInFill(new DOMPoint(x,y))){ hit=p.dataset.n; break; } }catch(e){} }
  if(!hit){ let best=1e9; for(const p of paths){ const b=p.getBBox(), dx=b.x+b.width/2-x, dy=b.y+b.height/2-y, d=dx*dx+dy*dy; if(d<best){ best=d; hit=p.dataset.n; } } }
  return cCache[s.id]=hit;
}
function isCandidate(s){
  if(!passesTags(s)) return false;
  if(!mapMode && wxAny.length && !wxAny.some(c=>s.tags.includes(c))) return false;
  if(cnty.length) return cnty.includes(countyOf(s));   // 指定縣市模式：只看縣市
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
  // 元素清單先記起來（畫點時更新），不要每一格都重新查 DOM
  let DG=[], NM=[], LB=[];
  function cacheEls(){ DG=[...$$("#dots .dg")]; NM=[...$$("#names .nm")]; LB=[...$$("#labels .lbl")]; }
  const $home=$("#home"), $pin=$("#pin"), $van=$("#mapVan"), $ring=$("#rippleRing"), $mask=$("#maskCirc"), $shadow=$("#landShadow"), $names=$("#names"), $labels=$("#labels"), $counties=$("#counties"), $landStroke=$("#landStroke");
  // 縣市底圖
  $("#counties").innerHTML=MAP.counties.map(c=>`<path class="county" data-n="${c.n}" d="${c.d}" fill="${COUNTY_COLOR[c.n]||"#DDEFD6"}" stroke="#fff" stroke-linejoin="round"/>`).join("");
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
  const tf=(el,x,y,s,extra="")=>el.setAttribute("transform",`translate(${x},${y}) scale(${s})${extra}`);
  function applyView(){
    const {x,y,k}=view;
    cam.setAttribute("transform",`translate(${cw/2-k*x},${ch/2-k*y}) scale(${k})`);
    const inv=1/k, big=card.classList.contains("big"), chosen=card.classList.contains("chosen"), picking=card.classList.contains("picking");
    LB.forEach(l=>tf(l,l.dataset.x,l.dataset.y,inv));
    // 點的大小：小地圖、點很多時都縮小，避免全部疊成一團
    const many=DG.length>150?.75:DG.length>60?.88:1, ds=(big?.78:.6)*many;
    if(chosen){
      // 挑中之後只剩一個點：只更新那一個，鏡頭拉近時才不會卡
      const d=DG.find(d=>d.classList.contains("pick")); if(d) tf(d,d.dataset.x,d.dataset.y,inv*ds);
      const n=NM.find(n=>n.classList.contains("pick")); if(n) tf(n,n.dataset.x,n.dataset.y,inv, false?"":"");   // 小車從下面來，名字放到圖釘上方
    } else {
      DG.forEach(d=>tf(d,d.dataset.x,d.dataset.y,inv*ds));
      // 名字標籤：放大地圖、畫面裡的點不太多時才標；彼此會撞到的就跳過（先到先放，像簡單的碰撞檢查）
      let show=false;
      if(big && !picking){
        const scr=n=>[(+n.dataset.x-x)*k+cw/2, (+n.dataset.y-y)*k+ch/2];
        let vis=0; NM.forEach(n=>{ const [sx,sy]=scr(n); if(sx>-20&&sx<cw+20&&sy>-20&&sy<ch+20) vis++; });
        show=vis>0 && vis<=nameLimit;
        if(show){ const placed=[]; NM.forEach(n=>{
          const [sx,sy]=scr(n), w=(n.textContent.length*11+6), r=[sx-w/2, sy+5, sx+w/2, sy+19];
          const ok = r[0]>2 && r[2]<cw-2 && sy>0 && sy<ch-12 && !placed.some(p=>r[0]<p[2]&&r[2]>p[0]&&r[1]<p[3]&&r[3]>p[1]);
          n.style.display=ok?"":"none"; if(ok){ placed.push(r); tf(n,n.dataset.x,n.dataset.y,inv); } }); }
      }
      $names.style.display=show?"":"none";
      $labels.style.opacity=show?"0":"";
    }
    tf($home,HP[0],HP[1],inv);
    if($pin.dataset.x) tf($pin,$pin.dataset.x,$pin.dataset.y,inv);
    if($van.dataset.x) $van.setAttribute("transform",`translate(${$van.dataset.x},${$van.dataset.y}) scale(${inv*(+$van.dataset.flip||1)},${inv})`);
    $ring.setAttribute("stroke-width",2.5*inv); $ring.setAttribute("stroke-dasharray",`${7*inv} ${5*inv}`);
    $mask.setAttribute("r",ringR); $ring.setAttribute("r",ringR);
    $shadow.setAttribute("transform",`translate(${4*inv},${6*inv})`);
    // 線寬自己跟著縮放算（不用 vector-effect:non-scaling-stroke，iPhone 上那個每一格都很耗）
    $counties.setAttribute("stroke-width",2*inv); $landStroke.setAttribute("stroke-width",3.2*inv);
  }

  // 依「開多遠＋方向」算鏡頭：看得到整個擴散範圍
  function targetView(){
    if(cnty.length){
      let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
      $$("#counties .county").forEach(p=>{ if(!cnty.includes(p.dataset.n)) return; const b=p.getBBox(); x0=Math.min(x0,b.x); y0=Math.min(y0,b.y); x1=Math.max(x1,b.x+b.width); y1=Math.max(y1,b.y+b.height); });
      if(x1>x0){ const pad=26, k=Math.min(cw/(x1-x0+pad*2), ch/(y1-y0+pad*2), 6); return {x:(x0+x1)/2,y:(y0+y1)/2,k,r:0}; }
    }
    const R=RC();
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
    $$("#counties .county").forEach(p=>p.classList.toggle("off",!!cnty.length && !cnty.includes(p.dataset.n)));
    const all=!RC().km || !origin || !!cnty.length;
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
    // 地點名稱（放大到點夠少時才顯示）
    $("#names").innerHTML=all.map(s=>{ const [x,y]=proj(s.lat,s.lng), nm=s.name.replace(/（.*?）/g,"").replace(/＋.*/,"");
      return `<g class="nm" data-id="${esc(s.id)}" data-x="${x}" data-y="${y}"><text y="15" text-anchor="middle">${esc(nm.length>9?nm.slice(0,8)+"…":nm)}</text></g>`; }).join("");
    cacheEls(); hideInfo();
    applyView();
  }
  function litCounty(n){ $$("#counties .county").forEach(p=>p.classList.toggle("lit",p.dataset.n===n)); }
  function countyCenter(n){ const p=$(`#counties .county[data-n="${n}"]`); if(!p) return [0,0]; const b=p.getBBox(); return [b.x+b.width/2,b.y+b.height/2]; }
  // 挑中之後：只留挑中的那個點（和名字），其他點都藏起來
  function choose(id){ card.classList.add("chosen");
    $$("#dots .dg").forEach(d=>d.classList.toggle("pick",d.dataset.id===id));
    $$("#names .nm").forEach(n=>n.classList.toggle("pick",n.dataset.id===id)); }
  function hidePick(){ card.classList.remove("chosen"); $$("#dots .dg.pick,#names .nm.pick").forEach(d=>d.classList.remove("pick")); litCounty(null); $("#pin").style.display="none"; $("#mapVan").style.display="none"; delete $("#pin").dataset.x; delete $("#mapVan").dataset.x; }
  function flash(id,on){ const g=$(`#dots .dg[data-id="${CSS.escape(id)}"] circle`); if(g) g.classList.toggle("flash",on); }
  // 小動畫：數值補間（給圖釘落下、小車開過去用）
  function tween(ms,fn){ return new Promise(res=>{ const t0=performance.now(); const st=now=>{ const t=Math.min(1,(now-t0)/ms); fn(t); if(t<1) requestAnimationFrame(st); else res(); }; requestAnimationFrame(st); }); }
  async function dropPin(s){
    const [x,y]=proj(s.lat,s.lng), pin=$("#pin"), inn=pin.querySelector(".pinIn");
    pin.dataset.x=x; pin.dataset.y=y; pin.style.display=""; applyView();
    await tween(380,t=>{ const b=t<.6? -60*(1-t/.6)*(1-t/.6) : -10*Math.sin((t-.6)/.4*Math.PI); inn.setAttribute("transform",`translate(0,${b})`); });
    inn.removeAttribute("transform");
  }
  // 小車開過去：鏡頭同時跟著小車拉近，最後停在目的地附近（約 12 公里見方）
  // 挑中之後：鏡頭直接拉近到目的地（不再有小車）
  async function drive(s){
    const [x,y]=proj(s.lat,s.lng);
    const [, y2]=proj(s.lat+0.06,s.lng), unit=Math.abs(y-y2)||1;
    const a={...view}, kEnd=Math.max(a.k, Math.min(40, Math.min(cw,ch)/(unit*7)));
    await tween(1100,t=>{ const c=ease(t);
      view={ x:a.x+(x-a.x)*c, y:a.y+(y-a.y)*c, k:Math.exp(Math.log(a.k)+(Math.log(kEnd)-Math.log(a.k))*c) };
      applyView(); });
  }

  function refresh(anim=true){ userCam=false; size(); placeOrigin(); paintCounties(); paintWedge(); paintDots(); anim?animateTo():(()=>{ const b=targetView(); view={x:b.x,y:b.y,k:b.k}; ringR=b.r; applyView(); })(); }
  window.addEventListener("resize",()=>{ size(); const b=targetView(); view={x:b.x,y:b.y,k:b.k}; ringR=b.r; applyView(); });
  /* ===== 手指縮放、拖曳地圖；點一下地點看名字 =====
     兩指：以兩指中點為中心縮放；一指：拖曳。像處理觸控 IC 的多點座標，自己算位移和距離變化 */
  const pts=new Map(); let g0=null, moved=false, userCam=false;
  const local=e=>{ const r=card.getBoundingClientRect(); return [e.clientX-r.left, e.clientY-r.top]; };
  // 手勢期間：不重算上百個點和名字，只把「手勢開始那一刻的畫面」當成一張圖用 GPU 平移縮放（像 LCD 硬體捲動，不重畫 framebuffer）
  // 放開手指才把新位置真正畫一次。這樣越放大也不會越鈍。
  let base=null, gRaf=0;
  function gpuView(){
    gRaf=0; if(!base) return;
    const s=view.k/base.k, tx=(base.x-view.x)*view.k, ty=(base.y-view.y)*view.k;
    svg.style.transform=`translate3d(${tx}px,${ty}px,0) scale(${s})`;
  }
  function gpuBegin(){ if(base) return; base={...view}; svg.style.transformOrigin=`${cw/2}px ${ch/2}px`; svg.style.willChange="transform"; card.classList.add("gesturing"); }
  function gpuCommit(){ if(!base) return; cancelAnimationFrame(gRaf); gRaf=0; base=null; svg.style.transform=""; svg.style.willChange=""; card.classList.remove("gesturing"); applyView(); }
  const toMap=([sx,sy])=>[(sx-(cw/2-view.k*view.x))/view.k, (sy-(ch/2-view.k*view.y))/view.k];
  const clampK=k=>Math.max(.35, Math.min(40, k));
  function gestureStart(){
    const ps=[...pts.values()];
    if(ps.length===1) g0={mode:"pan", p:ps[0], v:{...view}};
    else { const [a,b]=ps, mid=[(a[0]+b[0])/2,(a[1]+b[1])/2]; g0={mode:"pinch", d:Math.hypot(a[0]-b[0],a[1]-b[1])||1, mid, anchor:toMap(mid), v:{...view}}; }
  }
  svg.addEventListener("pointerdown",e=>{
    if(rolling || tapCb) return;
    pts.set(e.pointerId,local(e)); moved=false;
    if(pts.size===2 && !card.classList.contains("big")){ setBig(true); showHint(); }   // 小地圖上兩指一張開 → 直接變大地圖
    if(pts.size<=2){ cancelAnimationFrame(raf); gestureStart(); }
    if(card.classList.contains("big")) gpuBegin();
    if(card.classList.contains("big") || pts.size===2) try{ svg.setPointerCapture(e.pointerId); }catch(_){}
  });
  svg.addEventListener("pointermove",e=>{
    if(!pts.has(e.pointerId) || !g0) return;
    pts.set(e.pointerId,local(e));
    const big=card.classList.contains("big");
    if(g0.mode==="pan"){
      const p=pts.get(e.pointerId), dx=p[0]-g0.p[0], dy=p[1]-g0.p[1];
      if(Math.hypot(dx,dy)>6) moved=true;
      if(!big || !moved) return;                    // 小地圖一指滑動留給捲動頁面
      view={x:g0.v.x-dx/view.k, y:g0.v.y-dy/view.k, k:view.k};
    } else {
      const [a,b]=[...pts.values()], d=Math.hypot(a[0]-b[0],a[1]-b[1]), mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      const k=clampK(g0.v.k*d/g0.d); moved=true;
      view={k, x:g0.anchor[0]-(mid[0]-cw/2)/k, y:g0.anchor[1]-(mid[1]-ch/2)/k};
    }
    userCam=true; if(base){ if(!gRaf) gRaf=requestAnimationFrame(gpuView); } else applyView(); e.preventDefault();
  });
  const end=e=>{
    if(!pts.has(e.pointerId)) return;
    const wasPinch=g0&&g0.mode==="pinch";
    pts.delete(e.pointerId);
    if(pts.size>0){ gestureStart(); return; }
    g0=null; gpuCommit();
    if(e.type==="pointerup" && !moved && !wasPinch && !rolling) onTap(local(e));
  };
  svg.addEventListener("pointerup",end); svg.addEventListener("pointercancel",end);
  svg.addEventListener("wheel",e=>{ if(rolling) return; e.preventDefault(); cancelAnimationFrame(raf);
    const p=local(e), an=toMap(p), k=clampK(view.k*Math.pow(1.0018,-e.deltaY));
    view={k, x:an[0]-(p[0]-cw/2)/k, y:an[1]-(p[1]-ch/2)/k}; userCam=true; gpuBegin(); if(!gRaf) gRaf=requestAnimationFrame(gpuView); clearTimeout(wT); wT=setTimeout(gpuCommit,160); },{passive:false});
  let wT=0;
  // ＋／－ 按鈕：以畫面中心為基準放大縮小（不用兩指也能縮放）
  function zoomBy(f){
    if(rolling) return; cancelAnimationFrame(raf); gpuCommit();
    const a={...view}, k1=clampK(a.k*f); if(Math.abs(k1-a.k)<1e-6) return;
    userCam=true; Snd.play("tick");
    tween(280,t=>{ const e=ease(t); view={x:a.x,y:a.y,k:a.k*Math.pow(k1/a.k,e)}; applyView(); });
  }
  // 第一次放大地圖時提示：可以自己點地點來選（前 3 次）
  function showHint(){
    const n=store.get("wd_hint",0); if(n>=3) return; store.set("wd_hint",n+1);
    const h=$("#mapHint"); h.hidden=false; h.classList.remove("out"); clearTimeout(h._t);
    h._t=setTimeout(()=>{ h.classList.add("out"); setTimeout(()=>h.hidden=true,400); },3800);
  }
  // 點一下：小地圖 → 放大；大地圖 → 找最近的點（手指 24px 內）顯示名字
  function onTap(p){
    if(tapCb) return;
    if(!card.classList.contains("big")){ Snd.play("pop"); setBig(true); showHint(); return; }
    let best=null, bd=28*28;
    $$("#dots .dg").forEach(d=>{ const sx=(+d.dataset.x-view.x)*view.k+cw/2, sy=(+d.dataset.y-view.y)*view.k+ch/2, dd=(sx-p[0])**2+(sy-p[1])**2; if(dd<bd){ bd=dd; best=d.dataset.id; } });
    if(best) showInfo(best); else { hideInfo(); zoomCounty(p); }
  }
  function showInfo(id){
    const s=spots().find(x=>x.id===id); if(!s) return;
    $$("#dots .dg").forEach(d=>d.classList.toggle("sel",d.dataset.id===id));
    const b=bucketOf(s.min);
    $("#dotInfo").innerHTML=`<span class="m" style="background:${b.c}">${s.min}<small>分</small></span><span class="tx"><b>${esc(s.name)}</b><small>${esc(s.area)}・${esc(s.note||"")}</small></span><span class="go">${ui("flag",16)}選這個</span>`;
    $("#dotInfo").hidden=false; $("#dotInfo").onclick=()=>{ pickManual(s); };
    Snd.play("tick");
  }
  // 點地圖空白處：拉近到那個縣市（已經夠近就不動）
  function zoomCounty(p){
    const [mx,my]=toMap(p); let hit=null;
    for(const c of $$("#counties .county")){ try{ if(c.isPointInFill(new DOMPoint(mx,my))){ hit=c; break; } }catch(e){} }
    if(!hit) return;
    const b=hit.getBBox(), k=Math.min(40, Math.min(cw/(b.width+30), ch/(b.height+30)));
    if(view.k>=k*.85) return;
    cancelAnimationFrame(raf); Snd.play("pop");
    const a={...view}, tx=b.x+b.width/2, ty=b.y+b.height/2;
    tween(600,t=>{ const e=ease(t); view={x:a.x+(tx-a.x)*e, y:a.y+(ty-a.y)*e, k:a.k*Math.pow(k/a.k,e)}; applyView(); });
  }
  function hideInfo(){ $("#dotInfo").hidden=true; $$("#dots .dg.sel").forEach(d=>d.classList.remove("sel")); }
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
    card.classList.toggle("big",!!on); if(!on) hideInfo();
    $("#zoomBtn").innerHTML=ui(on?"shrink":"expand",18);
    $("#zoomBtn").setAttribute("aria-label",on?"縮小地圖":"放大地圖");
    return new Promise(res=>{ const t0=performance.now(); const f=now=>{ if(pts.size){ size(); applyView(); } else snap(); if(now-t0<520) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  }
  return {zoomBy,showHint,choose,refresh,animateTo,paintDots,hidePick,flash,dropPin,drive,size,waitTap,cancelTap,setBig,snap,litCounty,countyCenter,hideInfo};
})();

/* ===== 控制面板 ===== */
function renderReach(){
  $("#reachSeg").style.gridTemplateColumns=`repeat(${REACHES.length},1fr)`;
  $("#reachSeg").innerHTML=REACHES.map((r,i)=>`<button data-i="${i}" class="${reachIdx===i?"on":""}">${r.big}<small>${r.sm}</small></button>`).join("");
  $$("#reachSeg button").forEach(b=>b.onclick=()=>{ if(rolling) return; reachIdx=+b.dataset.i; reachM=REACHES[reachIdx].m; store.set("wd_reach",reachIdx); leaveCnty(); Snd.play("pop"); Map2.hidePick(); renderHome(); });
  $("#reachTag").innerHTML= cnty.length ? `指定：<b>${cnty.length>2?cnty.slice(0,2).join("、")+` 等 ${cnty.length} 個`:cnty.join("、")}</b>` : `可以開到：<b>${RC().name}</b>`;
  $(".panel").classList.toggle("cntyMode",!!cnty.length);
}
function renderDir(){
  const arrow=d=>d==="all"?ui("compass",15):`<svg class="ic" width="15" height="15" viewBox="0 0 24 24"><g transform="rotate(${({N:0,E:100,S:200,W:290})[d]} 12 12)"><path d="M12 3 L18 12 H14 V21 H10 V12 H6 Z" fill="#FF7A59" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></g></svg>`;
  $("#dirSeg").innerHTML=Object.entries(DIRS).map(([k,d])=>`<button data-d="${k}" class="${dir===k?"on":""}">${arrow(k)}${d.name}</button>`).join("");
  $$("#dirSeg button").forEach(b=>b.onclick=()=>{ if(rolling) return; dir=b.dataset.d; store.set("wd_dir",dir); leaveCnty(); Snd.play("pop"); Map2.hidePick(); renderHome(); });
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
function leaveCnty(){ if(cnty.length){ cnty=[]; store.set("wd_cnty",cnty); toast("改回用車程挑"); } }
function renderCnty(){
  const n=cnty.length;
  $("#cntyBtn").innerHTML=`${ui("pin",17)}<span>指定縣市</span><b>${n?(n>2?cnty.slice(0,2).join("、")+` 等 ${n} 個`:cnty.join("、")):"不指定"}</b><span class="arr">${cntyOpen?"▲":"▼"}</span>`;
  $("#cntyBtn").classList.toggle("on",!!n);
  $("#cntyBox").hidden=!cntyOpen;
  if(!cntyOpen) return;
  const cnt={}; spots().forEach(s=>{ if(s.lat!=null && passesTags(s)){ const c=countyOf(s); cnt[c]=(cnt[c]||0)+1; } });
  $("#cntyBox").innerHTML=REGIONS.map(([r,list])=>`<div class="cRow"><span class="cReg">${r}</span><div class="cList">${
    list.map(c=>`<button class="cChip ${cnty.includes(c)?"on":""} ${cnt[c]?"":"zero"}" data-c="${c}">${/^(新竹|嘉義)/.test(c)?c:c.replace(/[縣市]$/,"")}<i>${cnt[c]||0}</i></button>`).join("")}</div></div>`).join("")
    +`<div class="cFoot"><span>可以多選；選了就不看車程和方向</span>${n?`<button class="cClr" id="cClr">清除</button>`:""}</div>`;
  $$("#cntyBox .cChip").forEach(b=>b.onclick=()=>{ if(rolling) return; const c=b.dataset.c; cnty=cnty.includes(c)?cnty.filter(x=>x!==c):[...cnty,c]; store.set("wd_cnty",cnty); Snd.play("toggle",cnty.includes(c)); Map2.hidePick(); renderHome(); });
  if($("#cClr")) $("#cClr").onclick=()=>{ cnty=[]; store.set("wd_cnty",cnty); Snd.play("pop"); Map2.hidePick(); renderHome(); };
}
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
  $("#poolInfo").innerHTML=`<b>${list.length}</b><small>個地點 ${poolOpen?"▲":"▼"}</small>`;
  $("#poolInfo").setAttribute("aria-label",`符合條件的地點有 ${list.length} 個，${poolOpen?"收起":"看清單"}`);
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
function renderHome(moveCam=true){ if(view3==="map" && typeof renderMapBar==="function") renderMapBar(); renderReach(); renderDir(); renderCnty(); renderScenes(); renderChips(); renderPool(); moveCam?Map2.refresh(true):Map2.paintDots(); }
function renderAll(){ renderHome(false); if(curTab==="list") renderList(); if(curTab==="trail") renderTrail(); }


/* ===== 設定出發點 ===== */
function setOrigin(o,msg){
  origin=o; store.set("wd_origin",o); setHP(); Map2.hidePick(); renderHome(); renderOriginTag();
  if(msg){ toast(msg); Snd.play("tada"); }
}
function renderOriginTag(){ if(typeof renderHome3==="function" && view3==="home") renderHome3(); $("#fromTag").innerHTML=ui("pin",16)+originName()+`<span class="chg">${origin?"更改":"點我設定"}</span>`; $("#mapCard").classList.toggle("noOrigin",!origin); }
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
  $("#oMap").onclick=()=>{ closeSheet(); setTab("roll"); Map2.setBig(true); window.scrollTo({top:0,behavior:"smooth"}); reachIdx=4; reachM=REACHES[reachIdx].m; Map2.refresh(true); renderReach();
    toast("在地圖上點一下你要出發的地方"); Van.say("點地圖選出發點～",2500);
    Map2.waitTap((lat,lng)=>{ if(lat<21.8||lat>25.4||lng<119.9||lng>122.1){ toast("請點台灣本島上的地方"); return; } reachIdx=store.get("wd_reach",1); reachM=REACHES[reachIdx].m; setOrigin({lat,lng,kind:"map",label:nearestCity(lat,lng)+"附近"},`出發點：${nearestCity(lat,lng)}附近`); }); };
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
    reachIdx=i; reachM=REACHES[reachIdx].m; renderReach(); Map2.refresh(false); Snd.play("blip",k%6);
    $("#rndDie").innerHTML=dieSvg(1+Math.floor(Math.random()*6));
    await sleep(60+k*k*4);
  }
  store.set("wd_reach",reachIdx); $("#rndBtn").classList.remove("spin"); $("#rndDie").innerHTML=dieSvg(Math.min(6,reachIdx+1));
  renderHome(); Snd.play("tada"); Van.say(`這次：${RC().name}！`,1600);
  rolling=false;
}
$("#rndBtn").onclick=randomReach;

/* 幫我挑一個：候選地點輪流閃 → 停在一個 → 圖釘落下 → 小車開過去 → 明信片 */
async function pick(){
  if(rolling) return;
  if(!origin && !cnty.length){ Snd.play("pop"); showOrigin(); return; }
  const pool=candidates();
  if(!pool.length){ Snd.play("oops"); toast("沒有符合條件的地點，開遠一點或拿掉一些條件試試"); $("#goBtn").animate([{transform:"translateX(0)"},{transform:"translateX(-9px)"},{transform:"translateX(9px)"},{transform:"none"}],{duration:300}); return; }
  let p2=pool.length>1?pool.filter(s=>s.id!==lastId):pool;
  // 加權抽：符合「誰去」偏好的地點，每符合一項多一份機會
  const wts=p2.map(s=>1+2*whoPref.filter(ch=>s.tags.includes(ch)).length), tot=wts.reduce((a,b)=>a+b,0);
  let r=Math.random()*tot, wi=0; while(wi<p2.length-1 && (r-=wts[wi])>0) wi++;
  const spot=p2[wi]; lastId=spot.id;
  rolling=true; $("#goBtn").disabled=true; Map2.hidePick();
  window.scrollTo({top:0,behavior:"smooth"});
  Map2.hideInfo(); await Map2.setBig(true); Map2.animateTo(400);
  Van.say("我找找看…",1400);
  const onMap=pool.filter(s=>s.lat!=null);
  $("#mapCard").classList.add("picking");
  // 跑馬燈：有地點的縣市繞著出發點一個一個亮，越跑越慢，最後停在挑中的那個縣市
  const byC={}; onMap.forEach(s=>{ const c=countyOf(s); (byC[c]=byC[c]||[]).push(s); });
  const target=spot.lat!=null?countyOf(spot):null;
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
  await goTo(spot);
}
// 挑中（不管是抽的還是自己在地圖上點的）之後：只留那個點 → 圖釘 → 小車開過去、鏡頭拉近 → 明信片
async function goTo(spot){
  rolling=true; $("#goBtn").disabled=true; lastId=spot.id;
  if(spot.lat!=null){ Map2.choose(spot.id); Snd.play("pop"); await Map2.dropPin(spot); Snd.play("beep"); await Map2.drive(spot); }
  Snd.play("tada"); Van.say(`去${spot.name.replace(/（.*?）/,"").slice(0,8)}！`,1800);
  await sleep(150);
  rolling=false; $("#goBtn").disabled=false;
  if(sheetOpen()) toast(`挑到：${spot.name}`); else showResult(spot);
}
// 自己在地圖上點選
async function pickManual(s){
  if(rolling) return;
  Map2.hideInfo(); Map2.hidePick(); Van.say("就決定是你了！",1400);
  await goTo(s);
}
$("#goBtn").onclick=pick;
$("#cntyBtn").onclick=()=>{ if(rolling) return; cntyOpen=!cntyOpen; Snd.play("pop"); renderCnty(); };
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
function detailHtml(s){
  const d=(typeof DETAIL!=="undefined"&&DETAIL[s.name])||null, q=encodeURIComponent;
  const lk=(u,t)=>`<a class="dLink" href="${esc(u)}" target="_blank" rel="noopener">${ui("nav",14)}${esc(t)}</a>`;
  let h=`<div class="detail">`;
  if(d){
    h+=`<div class="dRow"><b>去那裡做什麼</b><p>${esc(d.do)}</p></div>`;
    if(d.tip) h+=`<div class="dRow"><b>出發前知道</b><p>${esc(d.tip)}</p></div>`;
  } else h+=`<div class="dRow"><b>去那裡做什麼</b><p>這個地點的詳細介紹還沒補上（會一區一區陸續補齊），可以先看下面 Google 找到的近三年網路分享。</p></div>`;
  h+=`<div class="dRow"><b>看更多</b><div class="dLinks">`;
  if(d&&d.site) h+=lk(d.site,"官網");
  // 文章年份：三年內正常顯示；超過三年標「較舊」；看不出年份標「年份不明」
  const cut=new Date().getFullYear()-3;
  if(d&&d.posts) d.posts.forEach(p=>{
    const ys=(p[0].match(/20\d\d/g)||[]).map(Number), y=ys.length?Math.max(...ys):0;
    const tag= !y ? `<span class="dAge">年份不明</span>` : y<cut ? `<span class="dAge old">${y} 年較舊</span>` : "";
    h+=lk(p[1],p[0]).replace("</a>",tag+"</a>");
  });
  h+=lk("https://www.google.com/search?q="+q(s.name+" 親子")+"&tbs=qdr:y3","Google：近三年的網路分享");
  h+=`</div></div><div class="dNote">資料整理自網路文章，價格和時間可能變動，出發前請看官方公告</div></div>`;
  return h;
}
function showResult(s,opt={}){
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
      <div class="addr">${ui("clock",18)}從出發點開車約 ${s.min} 分鐘${s.baseMin?"（估計）":""}</div>
      <div class="stk">${stickers(s)||`<span class="stkr">${ui("spark",18)}出發就對了</span>`}</div>
      ${s.note?`<div class="msg">${esc(s.note)}</div>`:""}
      ${detailHtml(s)}
      ${lv?`<div class="last">${ui("clock",14)} 上次去：${fmtDate(lv)}</div>`:""}
      <div class="acts">
        <a class="btn yellow wide big3" id="goNav" href="${mapUrl(s)}" target="_blank" rel="noopener">${ui("nav",26)}導航出發</a>
        ${opt.fromList?"":`<button class="btn wide big3" id="againBtn">${ui("again",24)}換一個</button>`}
      </div>
      <button class="linkBtn" id="editFromRes">${ui("note",16)}編輯這個地點（改名字、車程、標記）</button>
      <div class="est">車程是估計值，出發前看一下導航喔</div>
    </div></div>`);
  // 按「導航出發」＝決定去了：自動記到足跡，同時打開 Google 地圖
  $("#goNav").onclick=()=>{
    hist.push({id:s.id,t:Date.now(),name:s.name,min:s.min}); if(hist.length>500) hist=hist.slice(-500); store.set("wd_hist",hist);
    Snd.play("cheer"); confetti(); toast("出發囉！足跡記下來了");
    setTimeout(()=>{ closeSheet(); renderAll(); },900);
  };
  if($("#againBtn")) $("#againBtn").onclick=()=>{ closeSheet(); setTimeout(pick,250); };
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
  $$("#list .tk").forEach(r=>r.onclick=()=>{ Snd.play("pop"); const s=spots().find(x=>x.id===r.dataset.id); if(s) showResult(s,{fromList:true}); });
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
$("#hList").onclick=()=>{ Snd.play("pop"); setTab("list"); };
$("#hTrail").onclick=()=>{ Snd.play("pop"); setTab("trail"); };
$$(".pgBack").forEach(b=>b.onclick=()=>{ Snd.play("pop"); setTab("roll"); setView("home"); });
$$("#nav button").forEach(b=>b.onclick=()=>{ if(curTab===b.dataset.tab) return; Snd.play("pop"); setTab(b.dataset.tab); });

/*__VERSION__*/
/*__UPDATE__*/

/* ===== v3 大按鈕介面：首頁兩扇門 → 地圖模式／幫我決定（一頁一題） ===== */
/* 天氣題：取代原本的「誰去」。選了就照做（硬條件），不是加權 */
const WX={
  sun: {name:"天氣好，出去跑", sub:"戶外、室內都可以",       ic:"spark",     any:[]},
  hot: {name:"很熱，怕曬",     sub:"只挑室內、有樹蔭或能玩水", ic:"tree", any:["雨","蔭","水"]},
  rain:{name:"下雨，找室內",   sub:"只挑下雨也能去的",         ic:"umbrella", any:["雨"]},
};
/* 開多遠：分細一點（分鐘，0＝全台） */
const DIST=[
  {m:30, name:"30 分鐘內", sub:"附近走走"},
  {m:45, name:"45 分鐘內", sub:"小小出門"},
  {m:60, name:"1 小時內",  sub:"半日遊剛好"},
  {m:90, name:"1.5 小時內",sub:"一日遊"},
  {m:120,name:"2 小時內",  sub:"出遠門"},
  {m:180,name:"3 小時內",  sub:"走很遠"},
  {m:0,  name:"多遠都可以",sub:"全台"},
];
let ask={step:0, wx:"sun", scene:"", fl:[], mins:60};
/* 第三頁「講究一下」：可複選，選了就是硬條件 */
const PICKY=[
  {k:"easy",  name:"推車長輩好走", ic:"stroller"},
  {k:"park",  name:"好停車",       ic:"parking"},
  {k:"free",  name:"免門票",       ic:"ticket"},
  {k:"food",  name:"附近有得吃",   ic:"bowl"},
  {k:"nurse", name:"哺乳室・尿布台",ic:"bottle"},
  {k:"shade", name:"有樹蔭",       ic:"tree", noRain:true},
  {k:"noresv",name:"不用預約",     ic:"calendar"},
  {k:"avoid", name:"最近沒去過",   ic:"clock"},
];
const flOf=fl=>Object.fromEntries((fl||[]).map(k=>[k,true]));
let last3=store.get("wd_last3",null);
if(last3 && (last3.mins==null || !last3.wx)) last3=null;
if(last3 && last3.scene && !SCENES[last3.scene]) last3.scene="";   // 舊版（誰去／刻度）紀錄不相容，直接忽略

function setView(v){
  view3=v;
  $("#tabRoll").dataset.view=v;
  $("#homeView").hidden=v!=="home"; $("#askView").hidden=v!=="ask"; $("#mapBar").hidden=v!=="map";
  $("#mapCard").hidden=v!=="map"; $("#mapBackF").hidden=v!=="map"; $("#zoomPM").hidden=v!=="map";
  nameLimit = v==="map" ? 400 : 90;
  window.scrollTo(0,0);
  if(v==="home") renderHome3();
  if(v==="map"){ Map2.hidePick(); Map2.setBig(true); requestAnimationFrame(()=>{ renderHome(true); renderMapBar(); }); }
}
// 「誰去」不刪地點，只是讓符合的地點比較容易被抽中（加權），選項才不會一下子變很少
let whoPref=[];
function whoFlt(w){ return {avoid:!!flt.avoid, noresv:!!flt.noresv}; }
function lastLabel(l){ return `${(WX[l.wx]||WX.sun).name.split("，")[0]}・${l.scene&&SCENES[l.scene]?SCENES[l.scene].name:"都可以"}${l.fl&&l.fl.length?`＋${l.fl.length} 個講究`:""}・${fmtReach(l.mins)}`; }
// 「幫我決定」的插圖：一顆會輕輕擺動的指南針（取代骰子）
function compassDoorSvg(){
  const t=[0,45,90,135,180,225,270,315].map(a=>`<line x1="60" y1="${a%90?17:13}" x2="60" y2="${a%90?22:22}" stroke="${INK}" stroke-width="${a%90?2:3}" stroke-linecap="round" transform="rotate(${a} 60 60)"/>`).join("");
  return `<svg viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="63" r="50" fill="${INK}" opacity=".15"/><circle cx="60" cy="60" r="50" fill="#FFF9F0" stroke="${INK}" stroke-width="3.5"/><circle cx="60" cy="60" r="40" fill="none" stroke="#F4A582" stroke-width="2" stroke-dasharray="2 5"/>${t}
  <text x="60" y="36" text-anchor="middle" font-family="Fraunces,Georgia,serif" font-weight="600" font-size="12" fill="${INK}">N</text>
  <g class="cNeedle"><path d="M60 40 L68 60 L60 64 L52 60 Z" fill="#F2735A" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><path d="M60 86 L68 60 L60 56 L52 60 Z" fill="#fff" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/></g>
  <circle cx="60" cy="60" r="5" fill="#FFD54A" stroke="${INK}" stroke-width="2.5"/></svg>`;
}
function renderHome3(){
  $("#dMapIl").innerHTML=mapDoorSvg(); $("#dDiceIl").innerHTML=compassDoorSvg();
  $("#doorLast").hidden=!last3;
  if(last3) $("#doorLast").innerHTML=`${ui("again",22)}<span><b>照上次再抽一個</b><small>${esc(lastLabel(last3))}</small></span><i>›</i>`;
  $("#hOrigin").innerHTML=`${ui("pin",20)}${esc(originName())}<span>更改</span>`;
  $("#hSet").innerHTML=`${ui("check",20)}家庭設定`;
  $("#hList").innerHTML=`${ui("ticketL",20)}地點名單`; $("#hTrail").innerHTML=`${ui("foot",20)}去過的足跡`;
}
function mapDoorSvg(){
  return `<svg width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="44" fill="#fff" stroke="${INK}" stroke-width="3"/>
    <path d="M44 14c6 2 12 10 14 20 3 12 2 26-4 38-3 6-8 10-11 10-2-6-6-10-10-14-4-6-5-14-3-22 2-10 6-22 14-32z" fill="#BFE6D6" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="40" cy="36" r="5" fill="#FF7A59" stroke="#fff" stroke-width="2"/><circle cx="50" cy="52" r="5" fill="#FF7A59" stroke="#fff" stroke-width="2"/><circle cx="38" cy="62" r="5" fill="#FF7A59" stroke="#fff" stroke-width="2"/>
    <circle cx="66" cy="66" r="12" fill="none" stroke="${INK}" stroke-width="4"/><path d="M75 75l9 9" stroke="${INK}" stroke-width="5" stroke-linecap="round"/></svg>`;
}

/* 地圖模式 */
function renderMapBar(){
  const n=candidates().length;
  $("#mbCount").innerHTML=`<b>${n}</b> 個地點`;
  $("#mbReach").value=reachM||255; $("#mbReachTxt").textContent=RC().name;
  $("#mbBack").innerHTML=`‹ 回首頁`;
  $("#mbRand").innerHTML=`${ui("again",18)}抽一個`;
}
$("#doorMap").onclick=()=>{ Snd.play("pop"); mapMode=true; whoPref=[]; wxAny=[]; scene=""; dir="all"; cnty=[]; far=false; setView("map"); Map2.showHint&&Map2.showHint(); };
$("#zIn").onclick=e=>{ e.stopPropagation(); Map2.zoomBy(1.8); };
$("#zOut").onclick=e=>{ e.stopPropagation(); Map2.zoomBy(1/1.8); };
$("#mapBackF").onclick=()=>$("#mbBack").onclick();
$("#mbBack").onclick=()=>{ if(rolling) return; Snd.play("pop"); closeSheet&&sheetOpen()&&closeSheet(); setView("home"); };
const REACH_MAX=255;   // 拉到最右邊＝全台都可以
let reachSndAt=0, reachDraw=0;
$("#mbReach").oninput=e=>{ if(rolling) return;
  const v=+e.target.value; reachM = v>=REACH_MAX ? 0 : v; store.set("wd_reachM",reachM);
  $("#mbReachTxt").textContent=RC().name;
  const now=performance.now(); if(now-reachSndAt>90){ reachSndAt=now; Snd.play("blip",Math.min(5,Math.floor(v/50))); }
  // 拉桿一直動時，地圖每一格最多更新一次
  if(!reachDraw) reachDraw=requestAnimationFrame(()=>{ reachDraw=0; Map2.hidePick(); renderHome(true); });
};
$("#mbRand").onclick=()=>{ if(rolling) return; pick(); };

/* 幫我決定：今天誰去 → 怎麼玩 → 開多遠 */
function askCount(o){ const s0={scene,flt,reachIdx,reachM,dir,cnty,far,mapMode,wxAny};
  scene=o.scene??ask.scene; wxAny=(WX[o.wx??ask.wx]||WX.sun).any; flt=flOf(o.fl??(ask.step>=2?ask.fl:[])); reachM=o.mins??0; dir="all"; cnty=[]; far=false; mapMode=false;
  const n=candidates().length; ({scene,flt,reachIdx,reachM,dir,cnty,far,mapMode,wxAny}=s0); return n; }
/* 天氣預報（Open-Meteo，免金鑰）：平日看這週六、週末看今天；一天只抓一次 */
let wxCast=null;
function wxTarget(){ const d=new Date(), w=d.getDay(); if(w===0||w===6) return {d,label:"今天"}; const s=new Date(d); s.setDate(d.getDate()+(6-w)); return {d:s,label:"這週六"}; }
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
async function loadWx(){
  const t=wxTarget(), key=ymd(new Date())+"@"+ymd(t.d);
  const c=store.get("wd_wx",null); if(c&&c.key===key){ wxCast=c; return c; }
  const la=origin?origin.lat:24.88, lo=origin?origin.lng:120.99;
  try{
    const ctl=new AbortController(); setTimeout(()=>ctl.abort(),5000);
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la.toFixed(2)}&longitude=${lo.toFixed(2)}&daily=precipitation_probability_max,temperature_2m_max&timezone=Asia%2FTaipei&forecast_days=7`,{signal:ctl.signal});
    const j=await r.json(), i=j.daily.time.indexOf(ymd(t.d)); if(i<0) return null;
    wxCast={key,label:t.label,rain:j.daily.precipitation_probability_max[i],tmax:Math.round(j.daily.temperature_2m_max[i])};
    store.set("wd_wx",wxCast); return wxCast;
  }catch(e){ return null; }
}
const wxSuggest=c=>!c?null: c.rain>=60?"rain": c.tmax>=31?"hot":"sun";
function renderAsk(){
  const st=ask.step;
  $("#askBack").innerHTML="‹ 上一步";
  $("#askDots").innerHTML=[0,1,2,3].map(i=>`<i class="${i<=st?"on":""}"></i>`).join("");
  let h="";
  if(st===0){
    $("#askQ").textContent="天氣怎麼樣？";
    const c=wxCast, sg=wxSuggest(c);
    h=(c?`<div class="wxCast">${c.label}預報：降雨機率 <b>${c.rain}%</b>・最高 <b>${c.tmax}°C</b></div>`:`<div class="wxCast" id="wxLoading">正在看天氣預報…</div>`)
      +Object.entries(WX).map(([k,w])=>{ const n=askCount({wx:k}); return `<button class="big3row ${n?"":"zero"} ${sg===k?"sug":""}" data-v="${k}"><span class="ic">${ui(w.ic,44)}</span><span class="tx"><b>${w.name}</b><small>${w.sub}</small></span>${sg===k?`<em>建議</em>`:""}<i>${n} 個</i></button>`; }).join("");
    if(!c) loadWx().then(r=>{ if(ask.step===0 && view3==="ask"){ if(r) renderAsk(); else { const el=$("#wxLoading"); if(el) el.textContent="抓不到天氣預報，自己選一下吧"; } } });
  } else if(st===1){
    $("#askQ").textContent="今天想怎麼玩？";
    const rainy=ask.wx==="rain";
    // 跟天氣對不上的玩法（0 個地點）直接不顯示，不讓上下題打架
    h=Object.entries(SCENES).map(([k,s])=>{ const n=askCount({scene:k}); if(!n) return ""; return `<button class="tile3" data-v="${k}"><span class="ic">${ui(s.ic,52)}</span><b>${s.name}</b><small>${rainy?s.rsub:s.sub}</small><i>${n}</i></button>`; }).join("")
      +`<button class="tile3 wide" data-v=""><span class="ic">${ui("spark",40)}</span><b>都可以</b><small>不挑玩法</small><i>${askCount({scene:""})}</i></button>`;
  } else if(st===2){
    $("#askQ").textContent="還要講究什麼？";
    const now=askCount({fl:ask.fl});
    h=`<div class="pickyHint">可以複選，不選也可以直接下一步</div>`+PICKY.filter(p=>!(p.noRain&&ask.wx==="rain")).map(p=>{
        const on=ask.fl.includes(p.k), n=on?now:askCount({fl:[...ask.fl,p.k]});
        return `<button class="pick3 ${on?"on":""} ${n?"":"zero"}" data-v="${p.k}"><span class="ic">${ui(p.ic,30)}</span><b>${p.name}</b><i>${on?"✓":n+" 個"}</i></button>`; }).join("")
      +`<button class="nextBtn" data-v="__next">下一步（還有 ${now} 個地點）›</button>`;
  } else {
    $("#askQ").textContent="開多遠？";
    h=DIST.map(d=>{ const n=askCount({mins:d.m}); return `<button class="distRow ${n?"":"zero"}" data-v="${d.m}"><span class="tx"><b>${d.name}</b><small>${d.sub}</small></span><i>${n} 個</i></button>`; }).join("");
  }
  $("#askGrid").className="askGrid s"+st;
  $("#askGrid").innerHTML=h;
  $$("#askGrid button").forEach(b=>b.onclick=()=>{
    if(b.classList.contains("zero")){ Snd.play("oops"); toast("這個選項沒有地點，換一個試試"); return; }
    Snd.play("toggle",true);
    const v=b.dataset.v;
    if(st===0){ ask.wx=v; ask.step=1; renderAsk(); }
    else if(st===1){ ask.scene=v; ask.fl=ask.fl.filter(k=>!(k==="shade"&&ask.wx==="rain")); ask.step=2; renderAsk(); }
    else if(st===2){ if(v==="__next"){ ask.step=3; renderAsk(); return; } ask.fl=ask.fl.includes(v)?ask.fl.filter(x=>x!==v):[...ask.fl,v]; renderAsk(); }
    else { ask.mins=+v; runDecide(ask); }
  });
}
$("#doorDice").onclick=()=>{ Snd.play("pop"); ask={step:0,wx:wxSuggest(wxCast)||"sun",scene:"",fl:[],mins:60}; setView("ask"); renderAsk(); };
$("#askBack").onclick=()=>{ Snd.play("pop"); if(ask.step===0) setView("home"); else { ask.step--; renderAsk(); } };
async function runDecide(a){
  mapMode=false; scene=a.scene; whoPref=[]; wxAny=(WX[a.wx]||WX.sun).any; flt=flOf(a.fl); reachM=a.mins; dir="all"; cnty=[]; far=false;
  store.set("wd_scene",scene); store.set("wd_reachM",reachM);
  last3={wx:a.wx,scene:a.scene,fl:a.fl||[],mins:a.mins}; store.set("wd_last3",last3); store.set("wd_flt",flt);
  setView("map");
  await sleep(450);
  pick();
}
$("#doorLast").onclick=()=>{ if(!last3) return; Snd.play("pop"); runDecide(last3); };
$("#hOrigin").onclick=()=>{ Snd.play("pop"); showOrigin(); };
$("#hSet").onclick=()=>{ Snd.play("pop"); showSettings3(); };
function showSettings3(){
  const row=(k,ic,l,sub)=>`<button class="set3 ${flt[k]?"on":""}" data-k="${k}">${ui(ic,26)}<span><b>${l}</b><small>${sub}</small></span><i class="sw3"></i></button>`;
  openSheet(`<div class="sheetBody form"><h2>家庭設定</h2><div class="note2">設定一次，之後每次挑都會套用</div>
    <div style="display:grid;gap:10px;margin-top:12px">
      ${row("noresv","calendar","不要需預約的","臨時起意，進得去最重要")}
      ${row("avoid","clock","避開 30 天內去過的","每次都去新地方")}
      <button class="set3" id="s3Origin">${ui("pin",26)}<span><b>出發點</b><small>${esc(originName())}</small></span><i>›</i></button>
    </div></div>`);
  $$(".set3[data-k]").forEach(b=>b.onclick=()=>{ const k=b.dataset.k; flt[k]=!flt[k]; store.set("wd_flt",flt); b.classList.toggle("on",flt[k]); Snd.play("toggle",flt[k]); });
  $("#s3Origin").onclick=()=>{ closeSheet(); setTimeout(showOrigin,250); };
}

/* ===== 首次繪製 ===== */
(function(){
  const d=new Date(), wd=d.getDay(), h=d.getHours();
  $("#greet").textContent = (wd===0||wd===6) ? (h<12?"週末早安！今天開多遠？":"週末午後，出門走走吧") : (h<17?"先挑好，假日直接出發":"下班了～找個近的走走");
})();
$("#cl1").innerHTML=cloudSvg(90); $("#cl2").innerHTML=cloudSvg(60);
$("#hReach").innerHTML=ui("car",20)+"去哪裡玩";
$("#hScene").insertAdjacentHTML("afterbegin",ui("map",20)+"今天想怎麼玩？");
$("#hCond").innerHTML=ui("check",20)+"講究一下";
renderOriginTag();
$("#goBtn").innerHTML=`<svg viewBox="0 0 110 80">${carSvg("happy")}</svg>幫我挑一個！`;
$("#rndDie").innerHTML=dieSvg(Math.min(6,reachIdx+1));
$("#searchIc").innerHTML=ui("search",20);
$("#addBtn").innerHTML=ui("plus",28);
const NAV=[["roll","map","挑地點"],["list","ticketL","名單"],["trail","foot","足跡"]];
$$("#nav button").forEach((b,i)=>b.innerHTML=ui(NAV[i][1],24)+NAV[i][2]);
paintSndBtns(); renderReach(); renderDir(); renderCnty(); renderScenes(); renderChips(); renderPool(); Map2.refresh(false);
setView("home");
$("#footCount").textContent=`口袋名單 ${spots().length} 個地點`;

/* ===== 開機畫面：天空 → 台灣浮出來 → 從家裡一圈圈擴散 → 字一個個跳出 → 標題飛到首頁（FLIP） ===== */
(function(){
  const sp=$("#splash"); if(!sp){ splashDoneR(); return; }
  // 開機插畫：暖色太陽從山後升起、一條小路延伸到遠方、兩隻小鳥
  $("#spScene").innerHTML=`<svg viewBox="-40 -40 380 380"><defs><path id="spArc" d="M-6 150 A156 156 0 0 1 306 150"/><clipPath id="spClip"><circle cx="150" cy="150" r="140"/></clipPath></defs><circle cx="150" cy="150" r="140" fill="#FBF1E4"/><g clip-path="url(#spClip)">
    <g class="sp-sun"><circle cx="150" cy="150" r="58" fill="#F4A582"/><circle cx="150" cy="150" r="78" fill="none" stroke="#F4A582" stroke-width="2" stroke-dasharray="3 9" opacity=".7"/></g>
    <path class="sp-hill h1" d="M-10 196 C40 160 90 168 130 186 C170 204 210 170 310 176 V310 H-10Z" fill="#CFE4D6" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path class="sp-hill h2" d="M-10 232 C60 206 120 214 170 228 C220 242 260 222 310 214 V310 H-10Z" fill="#A9D3C0" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path class="sp-road" d="M150 300 C130 270 190 256 160 236 C140 222 172 210 156 194" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
    <g class="sp-bird" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"><path d="M196 92 q7 -7 14 0 q7 -7 14 0"/><path d="M218 116 q5 -5 10 0 q5 -5 10 0"/></g></g><circle cx="150" cy="150" r="140" fill="none" stroke="${INK}" stroke-width="3"/><g class="sp-arc"><text font-family="Fraunces,Georgia,serif" font-weight="500" font-size="16" letter-spacing="9" fill="${INK}"><textPath href="#spArc" startOffset="50%" text-anchor="middle">ELSEWHERE</textPath></text><circle cx="${150-161*Math.sin(.68)}" cy="${150-161*Math.cos(.68)}" r="2.6" fill="#F4A582"/><circle cx="${150+161*Math.sin(.68)}" cy="${150-161*Math.cos(.68)}" r="2.6" fill="#F4A582"/></g></svg>`;
  setTimeout(()=>sp.classList.add("sp-live"),150);   // 前 0.15 秒跟 iPhone 啟動圖一樣：只有底色
  let out=false;
  function exit(){
    if(out) return; out=true;
    const finish=()=>{ sp.remove(); setTimeout(()=>document.body.classList.remove("enter"),1100); splashDoneR(); };
    document.body.classList.remove("booting");
    window.scrollTo(0,0);
    document.body.classList.add("enter"); Map2.refresh(false);
    sp.classList.add("sp-fade"); setTimeout(finish,560);
  }
  const t0=performance.now();
  const fontsOk=Promise.race([document.fonts?document.fonts.ready:Promise.resolve(), new Promise(r=>setTimeout(r,1200))]);
  fontsOk.then(()=>{ const wait=Math.max(0,3800-(performance.now()-t0)); setTimeout(exit,wait); });
  setTimeout(exit,5500);   // 保險：最多 5.5 秒
})();
splashDone.then(()=>setTimeout(()=>{ loadWx(); if(!origin){ Van.say("我先找找你在哪～",2400); locate(); } else Van.say("今天想開多遠？",1800); },900));
