"""Generate complete CSS and DTCG sets from the verified 205 native variables."""
from pathlib import Path
import json,re,shutil
ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'tokens'
rows=json.loads((out/'native-variable-contract.json').read_text())['variables']
lookup={r[0]:r for r in rows}

def cssname(r):return re.fullmatch(r'var\((.+)\)',r[3])[1]
def unit(name):
    if name.startswith(('layer/','opacity/')):return ''
    if name.startswith('motion/'):return 'ms'
    return 'px'
def hexcolor(v):
    h='#'+''.join(f'{round(v[k]*255):02X}'for k in ['r','g','b'])
    return h+(f'{round(v.get("a",1)*255):02X}'if v.get('a',1)!=1 else '')
def cssvalue(r,v):
    if isinstance(v,str)and v.startswith('alias:'):return 'var('+cssname(lookup[v[6:]])+')'
    if r[1]=='COLOR':return hexcolor(v)
    if r[1]=='FLOAT':return str(v)+unit(r[0])
    return str(v)
def dtvalue(r,v):
    typ='color'if r[1]=='COLOR'else'duration'if unit(r[0])=='ms'else'number'if unit(r[0])==''else'dimension'
    if isinstance(v,str)and v.startswith('alias:'):value='{'+v[6:].replace('/','.')+'}'
    elif typ=='color':value={'colorSpace':'srgb','components':[v[k]for k in ['r','g','b']],'alpha':v.get('a',1),'hex':hexcolor(v)}
    elif typ in ['dimension','duration']:value={'value':v,'unit':unit(r[0])}
    else:value=v
    return {'$type':typ,'$value':value}
def nest(root,key,token):
    parts=key.split('/')
    for p in parts[:-1]:root=root.setdefault(p,{})
    root[parts[-1]]=token

sets={k:{'$description':'Clinime v2 '+k+' tokens, exported from verified native variables. Merge global, one theme, and component sets.'}for k in ['global','light','dark','component']}
css=['/* Generated from verified native-variable-contract.json. 205 native variables. */']
css.append('@font-face{font-family:Sora;src:url("../source/brand/assets/Sora-400.ttf") format("truetype");font-weight:400;font-style:normal;font-display:swap}')
css.append('@font-face{font-family:Sora;src:url("../source/brand/assets/Sora-600.ttf") format("truetype");font-weight:600;font-style:normal;font-display:swap}')
css.append('@font-face{font-family:"Noto Sans Arabic";src:url("../source/fonts/NotoSansArabic.ttf") format("truetype");font-weight:100 900;font-style:normal;font-display:swap}')
css.append(':root {')
for r in rows:
    modes=dict(r[4]);value=modes.get('Light',next(iter(modes.values())))
    css.append('  '+cssname(r)+': '+cssvalue(r,value)+';')
    if r[0].startswith('color/'):
        nest(sets['light'],r[0],dtvalue(r,modes['Light']));nest(sets['dark'],r[0],dtvalue(r,modes['Dark']))
    else:nest(sets['component'if r[0].startswith('component/')else'global'],r[0],dtvalue(r,value))
css.extend(['  --cl-font-en: "Sora", sans-serif;','  --cl-font-ar: "Noto Sans Arabic", sans-serif;','  --cl-motion-ease: cubic-bezier(.2,0,0,1);','}'])
css.append('[data-theme="dark"] {')
for r in rows:
    modes=dict(r[4])
    if 'Dark'in modes:css.append('  '+cssname(r)+': '+cssvalue(r,modes['Dark'])+';')
css.extend(['}','@media(prefers-reduced-motion:reduce){:root{--cl-motion-fast-ms:0ms;--cl-motion-enter-ms:0ms;--cl-motion-exit-ms:0ms}}'])
(out/'clinime-v2.css').write_text('\n'.join(css)+'\n')
for name,tokens in sets.items():(out/(name+'.tokens.json')).write_text(json.dumps(tokens,indent=2)+'\n')
shutil.copyfile(ROOT/'spec/typography.css',out/'typography.css')
shutil.copyfile(ROOT/'spec/native-text-styles.json',out/'native-text-styles.json')
fonts=ROOT/'source/fonts';fonts.mkdir(exist_ok=True)
for name in ['NotoSansArabic.ttf','NotoSansArabic-OFL.txt']:shutil.copyfile(ROOT/'preview/assets'/name,fonts/name)

def flatten(d,p=''):
    a={}
    for k,v in d.items():
        if k.startswith('$'):continue
        key=p+'.'+k if p else k
        if isinstance(v,dict)and'$value'in v:a[key]=v
        elif isinstance(v,dict):a.update(flatten(v,key))
    return a
errors=[]
for theme in ['light','dark']:
    combined={**flatten(sets['global']),**flatten(sets[theme]),**flatten(sets['component'])}
    for name,t in combined.items():
        value=t['$value']
        if isinstance(value,str)and value.startswith('{')and value[1:-1]not in combined:errors.append([theme,name,value])
    if len(combined)!=205:errors.append([theme,'count',len(combined)])
defined=set(re.findall(r'(--cl-[\w-]+)\s*:', '\n'.join(css)))
missing=[cssname(r)for r in rows if cssname(r)not in defined]
report={'nativeVariables':len(rows),'lightCombinedTokens':205,'darkCombinedTokens':205,'missingCSSVariables':missing,'unresolvedAliases':errors,'scope':'Exact exported names/values and reference closure; not certification of an arbitrary importer.'}
(out/'export-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
if errors or missing:raise SystemExit(1)
