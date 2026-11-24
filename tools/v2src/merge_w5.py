import json,sys
d=json.load(open('details_data.json'))
b=json.load(open(sys.argv[1]))
linkonly=set(sys.argv[2].split(',')) if len(sys.argv)>2 else set()
for k,v in b.items():
    if not v.get('found') or k not in d: continue
    old=d[k]; newp=v.get('posts',[])
    urls={p[1] for p in newp}
    old['posts']=newp+[p for p in old.get('posts',[]) if p[1] not in urls]
    if k not in linkonly:
        if v.get('do'): old['do']=v['do']
        if v.get('tip'): old['tip']=v['tip']
        elif 'tip' in old: old.pop('tip')
    print('更新' if k not in linkonly else '加連結',k)
json.dump(d,open('details_data.json','w'),ensure_ascii=False,indent=1)
