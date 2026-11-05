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
<g transform="translate(250 270) scale(4.6)" stroke-linejoin="round">
 <path d="M14 34 L34 12 L112 12 L92 34 Z" fill="#E8F1FB" stroke="{INK}" stroke-width="5"/>
 <path d="M92 34 L112 12 L112 90 L92 112 Z" fill="#C9D8EA" stroke="{INK}" stroke-width="5"/>
 <circle cx="62" cy="23" r="5" fill="{INK}"/><circle cx="102" cy="62" r="4.5" fill="{INK}"/>
 <rect x="12" y="32" width="82" height="82" rx="16" fill="#fff" stroke="{INK}" stroke-width="5"/>
 <circle cx="30" cy="52" r="7" fill="#F2735A"/><circle cx="76" cy="96" r="7" fill="{INK}"/>
 <path d="M38 70 q5 -6 10 0 M58 70 q5 -6 10 0" stroke="{INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
 <path d="M44 80 q9 11 18 0 Z" fill="#F2735A" stroke="{INK}" stroke-width="4" />
 <ellipse cx="32" cy="80" rx="6" ry="3.5" fill="#FFB7A6"/><ellipse cx="74" cy="80" rx="6" ry="3.5" fill="#FFB7A6"/>
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
