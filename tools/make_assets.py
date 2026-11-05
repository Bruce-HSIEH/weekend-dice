import sys, numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
OUT=sys.argv[1]
INK="#2B3A55"
icon=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FD0F5"/><stop offset="1" stop-color="#D6F0FD"/></linearGradient></defs>
<rect width="1024" height="1024" fill="url(#sky)"/>
<g transform="translate(110 150)"><circle r="78" fill="#FFD54A" stroke="{INK}" stroke-width="16"/></g>
<path d="M610 250a60 60 0 0 1 10-118 80 80 0 0 1 146-30 66 66 0 0 1 118 28 56 56 0 0 1 30 120z" fill="#fff" stroke="{INK}" stroke-width="16" stroke-linejoin="round"/>
<path d="M0 640 Q260 520 520 610 T1024 590 V1024 H0Z" fill="#8FCF6B" stroke="{INK}" stroke-width="16"/>
<rect x="-20" y="780" width="1064" height="260" fill="#5B6170" stroke="{INK}" stroke-width="16"/>
<g fill="#FFD54A">{"".join(f'<rect x="{x}" y="890" width="110" height="22" rx="11"/>' for x in range(-40,1024,200))}</g>
<ellipse cx="520" cy="842" rx="270" ry="34" fill="rgba(0,0,0,.25)"/>
<g transform="translate(240 250) scale(4.7)">
 {"".join(f'<rect x="{12+13*i/10}" y="{30-13*i/10}" width="84" height="84" rx="24" fill="{INK}" stroke="{INK}" stroke-width="10"/>' for i in range(10,0,-1))}
 {"".join(f'<rect x="{12+13*i/10}" y="{30-13*i/10}" width="84" height="84" rx="24" fill="#C9D8EA"/>' for i in range(10,0,-1))}
 <rect x="12" y="30" width="84" height="84" rx="24" fill="#fff" stroke="{INK}" stroke-width="5"/>
 <path d="M26 52 Q26 42 46 41" fill="none" stroke="#E3ECF7" stroke-width="5" stroke-linecap="round"/>
 <circle cx="34" cy="54" r="6.5" fill="#F2735A"/><circle cx="76" cy="94" r="6.5" fill="{INK}"/>
 <path d="M38 72 q5 -6 10 0 M60 72 q5 -6 10 0" stroke="{INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
 <path d="M46 81 q8 10 16 0 Z" fill="#F2735A" stroke="{INK}" stroke-width="4" stroke-linejoin="round"/>
 <ellipse cx="32" cy="82" rx="6" ry="3.5" fill="#FFB7A6"/><ellipse cx="76" cy="82" rx="6" ry="3.5" fill="#FFB7A6"/>
</g>
</svg>'''
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1024,"height":1024})
    pg.set_content(f"<html><body style='margin:0'>{icon}</body></html>"); pg.screenshot(path=f"{OUT}/icons/_icon1024.png"); b.close()
im=Image.open(f"{OUT}/icons/_icon1024.png").convert("RGB")
for s,n in [(180,"v1-apple-touch-icon.png"),(192,"v1-icon-192.png"),(512,"v1-icon-512.png")]:
    im.resize((s,s),Image.LANCZOS).save(f"{OUT}/icons/{n}",optimize=True)
import os; os.remove(f"{OUT}/icons/_icon1024.png")
# 啟動圖：跟開機畫面第一格一樣（180deg 天空漸層）
def lerp(c1,c2,t): return c1+(c2-c1)*t
stops=[(0,np.array([0x8F,0xD0,0xF5])),(.55,np.array([0xC4,0xE9,0xFC])),(1,np.array([0xEA,0xF7,0xFF]))]
SPL=[(440,956,3),(402,874,3),(430,932,3),(393,852,3),(420,912,3),(428,926,3),(390,844,3),(375,812,3),(414,896,3),(414,896,2),(375,667,2),(320,568,2)]
for w,h,r in SPL:
    W,H=w*r,h*r
    a=np.deg2rad(180); dx,dy=np.sin(a),-np.cos(a)        # CSS 角度：0deg 朝上，順時針
    L=abs(W*dx)+abs(H*dy)
    ys,xs=np.mgrid[0:H,0:W].astype(np.float32)
    t=((xs-W/2)*dx+(ys-H/2)*dy)/L+.5
    img=np.zeros((H,W,3),np.float32)
    for i in range(3):
        img[...,i]=np.interp(t,[s[0] for s in stops],[s[1][i] for s in stops])
    Image.fromarray(img.round().astype(np.uint8)).quantize(64).save(f"{OUT}/splash/v1-{W}x{H}.png",optimize=True)
print("done")
