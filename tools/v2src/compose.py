import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
import re, json
src=open("src_v11.html").read()
L=src.split("\n")
def seg(a,b):
    i=src.index(a); j=src.index(b,i+len(a)); return src[i:j]
head="\n".join(L[:52])+"\n"
css_keep=src[src.index("/* ---------- 行前檢查（條件） ---------- */"):src.index("/* ---------- 開機畫面")]
UI=seg("/* ===== 自畫 SVG 圖示 ===== */","/* ===== 實心手繪骰子")
UI=UI.replace("    trash:`",'''    grass:`<path d="M1.5 21.5 Q12 10.5 22.5 21.5Z" fill="#8FCF6B" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M6.5 18.5l.8-1.8.8 1.8M11 16.2l.8-1.8.8 1.8M15.5 18.2l.8-1.8.8 1.8" fill="none" stroke="${c}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.5 1.8l3.4 3.4-3.4 3.4-3.4-3.4z" fill="#FF7A59" stroke="${c}" stroke-width="1.7" stroke-linejoin="round"/><path d="M17.5 8.6c-1.5 2-3.5 3-5 5.5" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="1.6 1.6"/>`,
    bunny:`<path d="M8.2 10.5C6.6 7 6.3 2.6 8 2.3c1.7-.3 2.6 3.6 2.6 7.4M15.8 10.5c1.6-3.5 1.9-7.9.2-8.2-1.7-.3-2.6 3.6-2.6 7.4" fill="#fff" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.3 4.8c.2 1.3.6 2.8 1 3.9M15.7 4.8c-.2 1.3-.6 2.8-1 3.9" fill="none" stroke="#FF8FA3" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="12" cy="15.3" rx="7" ry="6.2" fill="#fff" stroke="${c}" stroke-width="2"/><circle cx="9.4" cy="14.6" r="1.05" fill="${c}"/><circle cx="14.6" cy="14.6" r="1.05" fill="${c}"/><circle cx="7.6" cy="17" r="1.2" fill="#FFB3C1"/><circle cx="16.4" cy="17" r="1.2" fill="#FFB3C1"/><path d="M11 16.6h2l-1 1z" fill="#FF8FA3" stroke="${c}" stroke-width=".9" stroke-linejoin="round"/>`,
    water:`<path d="M12 2.8C9 7 7 9.6 7 12.3a5 5 0 0 0 10 0c0-2.7-2-5.3-5-9.5z" fill="#9AD3F7" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M10 12.8a2.2 2.2 0 0 0 2 2" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M2.5 20c1.6-1.3 3.2-1.3 4.8 0s3.2 1.3 4.7 0 3.2-1.3 4.7 0 3.2 1.3 4.8 0" fill="none" stroke="${c}" stroke-width="1.9" stroke-linecap="round"/>`,
    train:`<rect x="5" y="3.5" width="14" height="14" rx="4" fill="#FF8FA3" stroke="${c}" stroke-width="2"/><rect x="7.5" y="6" width="9" height="5" rx="1.5" fill="#CDEBFF" stroke="${c}" stroke-width="1.6"/><circle cx="9" cy="14.2" r="1.2" fill="#FFD54A" stroke="${c}" stroke-width="1.2"/><circle cx="15" cy="14.2" r="1.2" fill="#FFD54A" stroke="${c}" stroke-width="1.2"/><path d="M8 17.5l-2 3.5M16 17.5l2 3.5M5.5 20.5h13" fill="none" stroke="${c}" stroke-width="1.9" stroke-linecap="round"/>`,
    sand:`<path d="M5.5 9.5h13l-1.6 10.5a1.6 1.6 0 0 1-1.6 1.3H8.7a1.6 1.6 0 0 1-1.6-1.3z" fill="#FFD54A" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M6.5 9.5c0-4 2.5-6.3 5.5-6.3s5.5 2.3 5.5 6.3" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><path d="M5.5 13h13" stroke="${c}" stroke-width="1.6"/><circle cx="12" cy="16.8" r="1.4" fill="#FF7A59"/>`,
    slide:`<path d="M4.5 20.5V6.5M8.5 20.5V6.5M4.5 10h4M4.5 14h4" fill="none" stroke="${c}" stroke-width="1.9" stroke-linecap="round"/><path d="M8.5 6.5c4 0 5 5 7.5 9.5 1 1.8 2.5 2.6 4.5 2.6v2.4c-3 0-5-1.2-6.5-3.8C12 13 11 9.5 8.5 9.5z" fill="#FF7A59" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>`,
    hands:`<path d="M7.5 12V6.2a1.4 1.4 0 0 1 2.8 0V11M10.3 10.5V4.6a1.4 1.4 0 0 1 2.8 0v5.9M13.1 10.5V5.6a1.4 1.4 0 0 1 2.8 0v6.4M15.9 12V8.5a1.4 1.4 0 0 1 2.8 0v5.3c0 4.3-2.6 7.2-6.6 7.2-2.6 0-4.3-1.3-5.6-3.4L4 13.6a1.4 1.4 0 0 1 2.3-1.5l1.2 1.6" fill="#FFE3C7" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
    plane:`<path d="M21 4.2c-.8-.8-2.3-.6-3.4.5l-3.1 3.1-8.3-2.5-1.8 1.8 6.6 4-3 3.1-2.7-.4-1.5 1.5 3.3 1.8 1.8 3.3 1.5-1.5-.4-2.7 3.1-3 4 6.6 1.8-1.8-2.5-8.3 3.1-3.1c1.1-1.1 1.3-2.6.5-3.4z" fill="#CDEBFF" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>`,
    tree:`<circle cx="12" cy="9.5" r="6.5" fill="#8FCF6B" stroke="${c}" stroke-width="2"/><path d="M12 13.5v7.5M12 16.5l-2.5-2M12 15l2.5-2" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/><path d="M5 21h14" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
    parking:`<rect x="3.5" y="3.5" width="17" height="17" rx="4.5" fill="#6FA8F0" stroke="${c}" stroke-width="2"/><path d="M9.5 17V7.5h3.3a2.9 2.9 0 0 1 0 5.8H9.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
    bottle:`<path d="M9.5 3.5h5l-.8 3h-3.4z" fill="#FFB3C1" stroke="${c}" stroke-width="1.7" stroke-linejoin="round"/><rect x="8" y="6.5" width="8" height="2.5" rx="1" fill="#fff" stroke="${c}" stroke-width="1.7"/><path d="M8.5 9h7v9.5a2.5 2.5 0 0 1-2.5 2.5h-2a2.5 2.5 0 0 1-2.5-2.5z" fill="#fff" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M8.6 14h6.8v4.5a2.4 2.4 0 0 1-2.4 2.4h-2a2.4 2.4 0 0 1-2.4-2.4z" fill="#FFF3C4"/><path d="M10.5 12h1.5M10.5 15h1.5" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/>`,
    spring:`<path d="M3.5 13.5h17c0 4-3.6 7-8.5 7s-8.5-3-8.5-7z" fill="#9AD3F7" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M8 10.5c-1.2-1.5 1.2-2.5 0-4.5M12 10.5c-1.2-1.5 1.2-2.5 0-4.5M16 10.5c-1.2-1.5 1.2-2.5 0-4.5" fill="none" stroke="#FF7A59" stroke-width="1.9" stroke-linecap="round"/>`,
    calendar:`<rect x="3.5" y="5" width="17" height="15.5" rx="3" fill="#fff" stroke="${c}" stroke-width="2"/><path d="M3.5 9.5h17" stroke="${c}" stroke-width="2"/><path d="M3.6 9.4V8a3 3 0 0 1 3-3h10.8a3 3 0 0 1 3 3v1.4z" fill="#FF8FA3"/><path d="M8 3v4M16 3v4" stroke="${c}" stroke-width="2" stroke-linecap="round"/><path d="M8.5 14.8l2.3 2.2 4.6-4.4" fill="none" stroke="#3FA34D" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    expand:`<path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5" fill="none" stroke="${c}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`,
    shrink:`<path d="M19.5 10.5h-6v-6M4.5 13.5h6v6M13.5 10.5L20 4M10.5 13.5L4 20" fill="none" stroke="${c}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`,
    plusc:`<circle cx="12" cy="12" r="9" fill="#fff" stroke="${c}" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,
    compass:`<circle cx="12" cy="12" r="9" fill="#fff" stroke="${c}" stroke-width="2.1"/><path d="M12 5.5l2.6 6.5H9.4z" fill="#FF7A59" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 18.5L9.4 12h5.2z" fill="#C9D8EA" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
    map:`<path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5l-5.5 2.5-6-2.5-5.5 2.5z" fill="#FFF0B3" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M9 4v13.5M15 6.5V20" ${L} stroke-width="1.8"/><circle cx="12" cy="11" r="2.2" fill="#FF7A59" stroke="${c}" stroke-width="1.6"/>`,
    home:`<path d="M3.5 11.5 12 4l8.5 7.5" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v10h12V10" fill="#FFF6E2" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M5 10.5 12 4.5l7 6" fill="#FF8FA3" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><rect x="10" y="14" width="4" height="6" rx="1" fill="#FFD54A" stroke="${c}" stroke-width="1.6"/>`,
    trash:`''',1)
DIE=seg("/* ===== 實心手繪骰子","/* ===== 風景素材")
SCEN=seg("/* ===== 風景素材","/* ===== 地點資料")
SND=seg("/* ===== 音效 & 背景音樂","/* ===== 吉祥物")
SND=SND.replace("    pop(){","    tick(){ tone(1350,.035,{vol:.07,type:\"square\"}); },\n    blip(i=0){ tone(N(72+[0,2,4,7,9,12][i%6]),.09,{vol:.09}); },\n    beep(){ tone(N(79),.1,{vol:.08,type:\"triangle\"}); tone(N(84),.14,{vol:.08,type:\"triangle\",at:.12}); },\n    pop(){",1)

_src=SND
_i=_src.index("  const BPM=120"); _j=_src.index("  const BGM_SR=")
SND=_src[:_i]+open("bgm_pop.js").read()+_src[_j:]
_i=SND.index("      const nb=oc.createBuffer"); _j=SND.index("      oc.startRendering()")
SND=SND[:_i]+open("bgm_synth.js").read()+SND[_j:]
SND=SND.replace("背景音樂：輕快的出遊小曲","背景音樂：活力流行小曲")
CAR=seg("// 圓滾滾","const Car=(()=>{")
SHEET=seg("/* ===== 彈出視窗 ===== */","/* 明信片上的小風景")
PM=seg("function postmark(){","function showResult").replace(">新豐出發<",">出發囉！<")
CONF=seg("/* 紙花","/* ===== 資料匯出")
EXP=seg("/* ===== 資料匯出","/* ===== 名單頁")
EXP=EXP.replace('const SYNC_KEYS=["wd_data","wd_hist","wd_mode","wd_flt","wd_sfx","wd_bgm"];','const SYNC_KEYS=["wd_data","wd_hist","wd_reach","wd_dir","wd_far","wd_scene","wd_flt","wd_sfx","wd_bgm"];')
old_mode='  if(d.wd_mode!==undefined){ mode=+d.wd_mode||0; store.set("wd_mode",mode); }\n'
assert old_mode in EXP
EXP=EXP.replace(old_mode,'''  if(d.wd_reach!==undefined){ reachIdx=Math.max(0,Math.min(REACHES.length-1,+d.wd_reach||0)); store.set("wd_reach",reachIdx); }
  if(d.wd_dir && DIRS[d.wd_dir]){ dir=d.wd_dir; store.set("wd_dir",dir); }
  if(typeof d.wd_far==="boolean"){ far=d.wd_far; store.set("wd_far",far); }
  if(typeof d.wd_scene==="string"){ scene=d.wd_scene; store.set("wd_scene",scene); }
''')
EXP=EXP.replace('flt=Object.assign({rain:false,easy:false,free:false,food:false,avoid:false},d.wd_flt)','flt=Object.assign({avoid:false,noresv:false},d.wd_flt)')
VER=seg("/* ===== 版本 & 改版紀錄 ===== */","/* ===== 自動檢查更新")
VER=VER.replace('const APP_VERSION="1.1.0";','const APP_VERSION="2.0.0";').replace('const CHANGELOG=[\n','const CHANGELOG=[\n  ["2.0.0","11/11","台灣地圖大改版！",["首頁變成台灣地圖：從你現在的位置（或自己點、或存好的家）往外擴散，看得到今天開得到哪裡","選「今天想怎麼玩」：放電跑跳、摸摸動物、玩水玩沙、火車飛機、動手做、下雨也OK","「講究一下」可以再加停車、哺乳室、樹蔭、溫泉、不要預約等條件","按「幫我挑一個」：地圖放大，縣市跑馬燈一個一個亮，停在挑中的地方","地點擴充到全台 341 個，新配色、新的活力背景音樂"]],\n',1)
UPD=seg("/* ===== 自動檢查更新","/* ===== 首次繪製")
js=open("main.js").read()
spots=open("spots_v3.js").read()
mp=json.load(open("map.json"))
for k,v in {"/*__SPOTS__*/":spots,"/*__MAP__*/":json.dumps(mp,ensure_ascii=False,separators=(",",":")),"/*__UI__*/":UI,"/*__DIE__*/":DIE,"/*__SCENERY__*/":SCEN,
            "/*__SND__*/":SND,"/*__CARSVG__*/":CAR,"/*__SHEET__*/":SHEET,"/*__POSTMARK__*/":PM,"/*__CONFETTI__*/":CONF,"/*__EXPORT__*/":EXP,
            "/*__VERSION__*/":VER,"/*__UPDATE__*/":UPD}.items():
    assert k in js, k; js=js.replace(k,v)
out=head+open("top.css").read()+css_keep+open("splash.css").read().replace("</style>",open("theme.css").read()+"\n</style>")+open("body.html").read()+"<script>\n"+js+"</script>\n</body>\n</html>\n"
open("../../index.html","w").write(out)
print(len(out))
