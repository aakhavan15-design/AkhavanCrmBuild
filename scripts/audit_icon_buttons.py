import re,glob,sys
APPLY=len(sys.argv)>1
res=[]
for f in sorted(glob.glob('src/**/*.tsx',recursive=True)):
    s=open(f,encoding='utf-8').read(); out=s; off=0
    for m in re.finditer(r'<button\b',s):
        i=m.end();d=0
        while i<len(s):
            c=s[i]
            if c=='{':d+=1
            elif c=='}':d-=1
            elif c=='>' and d==0 and s[i-1]!='=':break
            i+=1
        attrs=s[m.end():i]; j=s.find('</button>',i)
        body=s[i+1:j] if j>0 else ''
        stripped=re.sub(r'<[A-Za-z][^<>]*?/>','',body)
        stripped=re.sub(r'<[^>]*>','',stripped).strip()
        if stripped or re.search(r'aria-label|title=|\{\.\.\.',attrs): continue
        icons=re.findall(r'<([A-Z][A-Za-z0-9]*)',body)
        res.append((f,s[:m.start()].count('\n')+1,icons[:2],re.sub(r'\s+',' ',attrs)[:90]))
for r in res: print(r[0].split('/')[-1],r[1],r[2],r[3])
print(len(res))
