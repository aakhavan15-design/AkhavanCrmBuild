import re,glob,json
routes=set(re.findall(r'<Route path="([^"*]+)',open('src/App.tsx',encoding='utf-8').read()))
routes={r.rstrip('/') or '/' for r in routes}|{'/accounts'}
files=glob.glob('src/**/*.tsx',recursive=True)
out={'dead_nav':[], 'buttons_no_handler':[], 'empty_handler':[], 'form_no_submit':[], 'href_hash':[], 'input_no_label':[], 'dead_navigate':[]}
for f in files:
    s=open(f,encoding='utf-8').read()
    for m in re.finditer(r'navigate\(\s*[`\'"](/[^`\'"?$]*)',s):
        p=m.group(1).rstrip('/') or '/'
        if p not in routes and not any(p.startswith(r+'/') for r in routes if r!='/'): out['dead_navigate'].append((f,p))
    for m in re.finditer(r'<(button|Button)\b([^>]*?)>',s,re.S):
        a=m.group(2)
        if 'onClick' in a or 'type="submit"' in a or "type='submit'" in a or '{...' in a or 'disabled' in a and False: 
            if re.search(r'onClick=\{\s*(\(\)\s*=>\s*(\{\s*\})?|undefined|null)\s*\}',a): out['empty_handler'].append((f,s[:m.start()].count('\n')+1))
            continue
        if 'type="submit"' in a: continue
        if 'type="button"' in a and 'aria-' in a: pass
        out['buttons_no_handler'].append((f,s[:m.start()].count('\n')+1,a.strip()[:70]))
    for m in re.finditer(r'<form\b([^>]*)>',s):
        if 'onSubmit' not in m.group(1): out['form_no_submit'].append((f,s[:m.start()].count('\n')+1))
    for m in re.finditer(r'href=["\']#["\']',s): out['href_hash'].append((f,s[:m.start()].count('\n')+1))
    for m in re.finditer(r'<(input|textarea|select)\b([^>]*)>',s,re.S):
        a=m.group(2)
        if 'type="hidden"' in a or 'type="file"' in a and 'aria-label' in a: continue
        if not re.search(r'aria-label|aria-labelledby|\bid=|placeholder|label=',a):
            ctx=s[max(0,m.start()-200):m.start()]
            if '<label' in ctx and '</label>' not in ctx.split('<label')[-1]: continue
            out['input_no_label'].append((f,s[:m.start()].count('\n')+1))
for k,v in out.items(): print(k,len(v)); [print('  ',x) for x in v[:25]]
