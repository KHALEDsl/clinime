"""Export canonical Clinime v2 tokens to CSS and DTCG 2025.10 value shapes."""
import csv
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'spec/token-proposal.json').read_text())
OUT=ROOT/'tokens'; OUT.mkdir(exist_ok=True)

def nest(root,key,value):
    parts=key.split('.')
    for part in parts[:-1]:root=root.setdefault(part,{})
    root[parts[-1]]=value

def color(value):
    return {'colorSpace':'srgb','components':[int(value[i:i+2],16)/255 for i in (1,3,5)],'alpha':1,'hex':value}

global_tokens={'$description':'Clinime v2 canonical palette and metrics. Source anchor colors are preserved exactly.'}
for key,value in data['primitive'].items():nest(global_tokens,'primitive.'+key,{'$type':'color','$value':color(value)})
for value in data['metrics']['space']:nest(global_tokens,'space.'+str(value),{'$type':'dimension','$value':{'value':value,'unit':'px'}})
for value in [0,4,8,12,16,9999]:nest(global_tokens,'radius.'+str(value),{'$type':'dimension','$value':{'value':value,'unit':'px'}})
for key,value in {'compact':36,'control':44,'comfortable':48,'row':64}.items():nest(global_tokens,'height.'+key,{'$type':'dimension','$value':{'value':value,'unit':'px'}})
for key,value in data['metrics']['motion'].items():
    if key.endswith('Ms'):nest(global_tokens,'motion.'+key,{'$type':'duration','$value':{'value':value,'unit':'ms'}})
    else:nest(global_tokens,'motion.'+key,{'$type':'cubicBezier','$value':value})
for key,value in data['metrics']['zIndex'].items():nest(global_tokens,'layer.'+key,{'$type':'number','$value':value})
for locale,family in [('en','Sora'),('ar','Noto Sans Arabic')]:nest(global_tokens,'font.'+locale,{'$type':'fontFamily','$value':[family,'sans-serif']})
(OUT/'global.tokens.json').write_text(json.dumps(global_tokens,indent=2)+'\n')

def native_key(key):
    if key.startswith('surface.'):
        tail=key[8:];return 'color/bg/'+{'base':'surface','brand-wash':'brand'}.get(tail,tail)
    return 'color/'+key.replace('.','/')

css=['/* Clinime v2 generated from spec/token-proposal.json. Keep source font and icon licenses. */']
for mode in ['light','dark']:
    tokens={'$description':'Clinime '+mode+' semantic theme. Merge with global.tokens.json. Dark and Arabic are explicit extensions.'}
    css.append(':root {' if mode=='light' else '[data-theme="dark"] {')
    for key,value in data['semantic'][mode].items():
        source=data['semanticAliases'][mode].get(key)
        if source and data['primitive'].get(source)==value:
            token={'$type':'color','$value':'{primitive.'+source+'}'}
        else:token={'$type':'color','$value':color(value)}
        nest(tokens,native_key(key).replace('/','.'),token)
        css.append('  --cl-'+native_key(key).replace('/','-')+': '+value+';')
    css.append('}')
    (OUT/(mode+'.tokens.json')).write_text(json.dumps(tokens,indent=2)+'\n')
css.append(':root {')
for value in data['metrics']['space']:css.append(f'  --cl-space-{value}: {value}px;')
for value in [0,4,8,12,16,9999]:css.append(f'  --cl-radius-{value}: {value}px;')
for name,value in {'height-compact':36,'height-control':44,'height-comfortable':48,'height-row':64,'width-sidebar':240,'width-rail':72,'width-panel':380}.items():css.append(f'  --cl-{name}: {value}px;')
css+=['  --cl-font-en: "Sora", sans-serif;','  --cl-font-ar: "Noto Sans Arabic", sans-serif;','  --cl-motion-fast: 120ms;','  --cl-motion-enter: 180ms;','  --cl-motion-exit: 120ms;','  --cl-motion-ease: cubic-bezier(.2,0,0,1);','}','@media (prefers-reduced-motion: reduce) { :root { --cl-motion-fast: 0ms; --cl-motion-enter: 0ms; --cl-motion-exit: 0ms; } }']
(OUT/'clinime-v2.css').write_text('\n'.join(css)+'\n')

def lum(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    c=[x/12.92 if x<=.04045 else ((x+.055)/1.055)**2.4 for x in c]
    return sum(x*y for x,y in zip(c,[.2126,.7152,.0722]))
def ratio(a,b):
    l=sorted([lum(a),lum(b)]);return (l[1]+.05)/(l[0]+.05)
rows=[]
for mode in ['light','dark']:
    s=data['semantic'][mode]
    pairs=[('text.primary','surface.base',4.5),('text.secondary','surface.base',4.5),('text.primary','surface.canvas',4.5),('text.secondary','surface.canvas',4.5),('text.heading','surface.selected',4.5),('action.on-primary','action.primary',4.5),('border.control','surface.base',3),('focus.ring','surface.base',3)]
    for status in ['completed','confirmed','active','success','warning','error','info']:
        pairs.extend([(f'status.{status}.text',f'status.{status}.surface',4.5),(f'status.{status}.border',f'status.{status}.surface',3)])
    for fg,bg,minimum in pairs:
        measured=ratio(s[fg],s[bg]);rows.append({'mode':mode,'foreground':fg,'background':bg,'fg':s[fg],'bg':s[bg],'ratio':round(measured,3),'threshold':minimum,'result':'pass'if measured>=minimum else'fail'})
with (OUT/'contrast-pairs.csv').open('w')as f:
    w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
report={'count':len(rows),'failed':[r for r in rows if r['result']=='fail'],'scope':'Selected text and non-text pairs only; no claim of full WCAG conformance.','prohibitedWhiteOnPink':round(ratio('#FFFFFF','#FFD8EB'),3),'format':'DTCG 2025.10 color/dimension/duration value shapes; no third-party importer certification.'}
(OUT/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
if (OUT/'native-variable-contract.json').exists():
    import runpy
    runpy.run_path(str(ROOT/'build/export-native-tokens.py'),run_name='__main__')
