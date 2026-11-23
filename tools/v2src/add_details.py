#!/usr/bin/env python3
"""合併新查到的地點介紹：python3 add_details.py batch.json → 更新 details_data.json 並重新產生 details_v3.js"""
import json,sys
data=json.load(open('details_data.json'))
if len(sys.argv)>1:
    new=json.load(open(sys.argv[1])); data.update(new); print('added',len(new))
json.dump(data,open('details_data.json','w'),ensure_ascii=False,indent=1)
head='''/* ===== 地點詳細資料 =====
   do：去那裡做什麼　tip：價格、時間、注意事項　site：官網　posts：近三年的網路分享 [標題, 網址]
   資料來自 2023–2026 的網路文章與官網，出發前仍請看官方公告。原始資料在 details_data.json，用 add_details.py 合併 */
const DETAIL='''
open('details_v3.js','w').write(head+json.dumps(data,ensure_ascii=False,indent=0)+';\n')
print('total',len(data))
