import re,glob,sys
APPLY = len(sys.argv)>1
def tag_end(s,i):
    d=0;q=None
    while i<len(s):
        c=s[i]
        if q: 
            if c==q and s[i-1]!='\\': q=None
        elif c in '"\'`' and d>0: q=c
        elif c=='{': d+=1
        elif c=='}': d-=1
        elif c=='>' and d==0 and s[i-1]!='=': return i
        i+=1
    return -1
total=0;fixed=0;left=[]
for f in sorted(glob.glob('src/**/*.tsx',recursive=True)):
    s=open(f,encoding='utf-8').read(); out=s; offs=0
    for m in re.finditer(r'<(input|textarea|select)\b',s):
        e=tag_end(s,m.end())
        if e<0: continue
        attrs=s[m.end():e]
        if re.search(r'aria-label|aria-labelledby|\bid=|label=|type="hidden"|\bhidden\b|\{\.\.\.',attrs): continue
        ctx=s[max(0,m.start()-260):m.start()]
        if '<label' in ctx and '</label>' not in ctx.split('<label')[-1]: continue  # wrapped by label
        total+=1
        name=None
        lm=list(re.finditer(r'<(?:label|span)[^>]*>([^<{}]{2,40})</(?:label|span)>',ctx))
        if lm and not re.search(r'<(input|select|textarea)',ctx[lm[-1].end():]): name=lm[-1].group(1).strip()
        elif 'placeholder' in attrs: continue
        elif re.search(r'type="?file',attrs): name='انتخاب فایل'
        elif re.search(r'Search|جست',ctx[-120:]): name='جست‌وجو'
        if name and APPLY:
            ins=m.end(); out=out[:ins+offs]+f' aria-label="{name}"'+out[ins+offs:]; offs+=len(f' aria-label="{name}"'); fixed+=1
        elif not name: left.append((f.split('/')[-1],s[:m.start()].count('\n')+1,re.sub(r'\s+',' ',ctx[-70:])))
    if APPLY and out!=s: open(f,'w',encoding='utf-8').write(out)
print('unlabeled',total,'fixed',fixed,'left',len(left))
for x in left[:20]: print(x)
