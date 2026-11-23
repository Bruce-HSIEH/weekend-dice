import sys, numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
OUT=sys.argv[1]
INK="#2B3A55"
icon=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="1024" height="1024">
<rect width="300" height="300" fill="#FBF1E4"/>
<circle cx="150" cy="128" r="62" fill="#F4A582"/>
<circle cx="150" cy="128" r="84" fill="none" stroke="#F4A582" stroke-width="3" stroke-dasharray="4 11" opacity=".7"/>
<path d="M-10 186 C40 150 90 158 130 176 C170 194 210 160 310 166 V310 H-10Z" fill="#CFE4D6" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>
<path d="M-10 228 C60 200 120 208 170 222 C220 236 260 216 310 208 V310 H-10Z" fill="#A9D3C0" stroke="{INK}" stroke-width="5" stroke-linejoin="round"/>
<path d="M150 310 C128 276 192 262 160 238 C140 224 172 210 156 190" fill="none" stroke="{INK}" stroke-width="6" stroke-linecap="round" stroke-dasharray="10 14"/>
<g fill="none" stroke="{INK}" stroke-width="4.5" stroke-linecap="round"><path d="M200 66 q9 -9 18 0 q9 -9 18 0"/><path d="M226 94 q6 -6 12 0 q6 -6 12 0"/></g>
</svg>'''
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1024,"height":1024})
    pg.set_content(f"<html><body style='margin:0'>{icon}</body></html>"); pg.screenshot(path=f"{OUT}/icons/_icon1024.png"); b.close()
im=Image.open(f"{OUT}/icons/_icon1024.png").convert("RGB")
for s,n in [(180,"v2-apple-touch-icon.png"),(192,"v2-icon-192.png"),(512,"v2-icon-512.png")]:
    im.resize((s,s),Image.LANCZOS).save(f"{OUT}/icons/{n}",optimize=True)
import os; os.remove(f"{OUT}/icons/_icon1024.png")
# 啟動圖：跟開機畫面第一格一樣（180deg 暖白漸層）
def lerp(c1,c2,t): return c1+(c2-c1)*t
stops=[(0,np.array([0xFB,0xF4,0xEA])),(.55,np.array([0xF6,0xEE,0xE3])),(1,np.array([0xF2,0xE4,0xD6]))]
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
    Image.fromarray(img.round().astype(np.uint8)).quantize(64).save(f"{OUT}/splash/v2-{W}x{H}.png",optimize=True)
print("done")
