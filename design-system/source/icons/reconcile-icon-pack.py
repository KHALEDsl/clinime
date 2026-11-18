"""Append original pinned Lucide icons required by the current Clinime build."""
import hashlib
import io
import json
import re
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parent.parent
manifest_path = ROOT / 'icon-manifest.json'
manifest = json.loads(manifest_path.read_text())
before = json.loads(json.dumps(manifest['icons']))
have = {i['name'] for i in before}
cache = ROOT / 'cache' / f"lucide-static-{manifest['upstream_version']}.tgz"
cache.parent.mkdir(exist_ok=True)
if not cache.exists():
    cache.write_bytes(urllib.request.urlopen(manifest['source_tarball']).read())
archive_bytes = cache.read_bytes()
assert hashlib.sha256(archive_bytes).hexdigest() == manifest['source_tarball_sha256']
archive = tarfile.open(fileobj=io.BytesIO(archive_bytes), mode='r:gz')
members = {m.name: m for m in archive.getmembers()}
available = {Path(n).stem for n in members if n.startswith('package/icons/') and n.endswith('.svg')}
contract = json.loads((PROJECT / 'spec/component-contract.json').read_text())
specified = {i['name'] for i in contract['iconManifest']}
by_name = {i['name']: i for i in contract['iconManifest']}

def icon_fields(value, in_icon_context=False):
    result = set()
    if isinstance(value, dict):
        for key, child in value.items():
            is_context = in_icon_context or 'icon' in key.lower()
            if key == 'name' and in_icon_context and isinstance(child, str):
                result.add(child)
            elif is_context:
                result |= icon_fields(child, True)
            elif isinstance(child, (dict, list)):
                result |= icon_fields(child, False)
    elif isinstance(value, list):
        for child in value:
            result |= icon_fields(child, in_icon_context)
    elif in_icon_context and isinstance(value, str) and value in available:
        result.add(value)
    return result

family_path = PROJECT / 'build/component-families.json'
family_icons = icon_fields(json.loads(family_path.read_text()))
renderer_path = PROJECT / 'build/components-figma.js'
literal_slugs = set(re.findall(r"['\"]([a-z][a-z0-9-]+)['\"]", renderer_path.read_text()))
renderer_icons = literal_slugs & available
required = specified | icon_fields(contract) | family_icons | renderer_icons
missing_upstream = required - available
if missing_upstream:
    raise ValueError('Required names not in official release: ' + ', '.join(sorted(missing_upstream)))

# category, English action or object label, Arabic semantic counterpart.
LABELS = {
    'accessibility': ('Feedback and system','Accessibility','إمكانية الوصول'),
    'alarm-clock': ('Appointments','Reminder time','وقت التذكير'),
    'arrow-up-down': ('Actions','Sort','ترتيب'),
    'badge-check': ('People and communication','Verified identity','هوية مؤكدة'),
    'ban': ('Appointments','Unavailable','غير متاح'),
    'bell-off': ('People and communication','Mute notifications','كتم التنبيهات'),
    'box': ('Inventory','Supply item','صنف من المستلزمات'),
    'calculator': ('Finance','Calculate amount','حساب المبلغ'),
    'calendar-range': ('Appointments','Date range','الفترة الزمنية'),
    'calendar-search': ('Appointments','Find appointment','البحث عن موعد'),
    'check-check': ('Feedback and system','Acknowledged','تم الاطلاع'),
    'circle-dashed': ('Feedback and system','Not started','لم يبدأ'),
    'circle-dot': ('Actions','Selected option','الخيار المحدد'),
    'circle-user-round': ('People and communication','Client profile','ملف المراجعة'),
    'circle-x': ('Feedback and system','Failed','تعذر الإكمال'),
    'clipboard-check': ('Clinical','Reviewed intake','استمارة مراجعة'),
    'coins': ('Finance','Amount collected','المبلغ المحصل'),
    'contact': ('People and communication','Contact details','بيانات التواصل'),
    'database': ('Feedback and system','Stored records','السجلات المحفوظة'),
    'expand': ('Actions','Expand view','توسيع العرض'),
    'file-text': ('Clinical','Document','مستند'),
    'flask-conical': ('Clinical','Laboratory service','خدمة مختبرية'),
    'globe': ('People and communication','Website','الموقع الإلكتروني'),
    'grid-2x2': ('Navigation','Grid view','عرض الشبكة'),
    'hand': ('Clinical','Manual care','العناية اليدوية'),
    'hand-coins': ('Finance','Receive payment','استلام دفعة'),
    'hard-drive-download': ('Feedback and system','Local backup','نسخة احتياطية محلية'),
    'heart-handshake': ('Clinical','Care support','دعم الرعاية'),
    'key-round': ('Feedback and system','Access key','مفتاح الوصول'),
    'layers': ('Inventory','Item groups','مجموعات الأصناف'),
    'list-checks': ('Clinical','Preparation checklist','قائمة الاستعداد'),
    'lock': ('Feedback and system','Restricted access','وصول مقيد'),
    'messages-square': ('People and communication','Conversation','المحادثة'),
    'move': ('Appointments','Move appointment','نقل الموعد'),
    'navigation': ('People and communication','Directions','الاتجاهات'),
    'notebook-tabs': ('Clinical','Care instructions','تعليمات الرعاية'),
    'package-check': ('Inventory','Stock received','تم استلام المخزون'),
    'percent': ('Finance','Percentage','النسبة المئوية'),
    'redo-2': ('Actions','Redo','إعادة'),
    'scan-face': ('Clinical','Facial service','خدمة العناية بالوجه'),
    'share-2': ('Actions','Share','مشاركة'),
    'shield': ('Feedback and system','Privacy','الخصوصية'),
    'shield-alert': ('Feedback and system','Access warning','تنبيه الوصول'),
    'shrink': ('Actions','Reduce view','تصغير العرض'),
    'tag': ('Inventory','Item category','تصنيف الصنف'),
    'test-tube': ('Clinical','Sample','عينة'),
    'undo-2': ('Actions','Undo','تراجع'),
    'zap': ('Clinical','Device-based service','خدمة باستخدام جهاز'),
}

additions = []
for name in sorted(required - have):
    if name not in LABELS:
        raise ValueError('A reviewed bilingual label is required for ' + name)
    category, english, arabic = LABELS[name]
    original = archive.extractfile(members[f'package/icons/{name}.svg']).read()
    (ROOT / 'svg' / f'{name}.svg').write_bytes(original)
    mirror = bool(by_name.get(name, {}).get('mirrorRtl', False))
    decision = 'Mirror logical undo/redo direction in RTL. Keep the same action label and history semantics.' if mirror else 'Keep original; physical object, clinical metaphor, state, vertical movement or data symbol is not text direction.'
    entry = {
        'name': name, 'component_name': f'Icon/{category}/{name}', 'category': category,
        'label_en': english, 'label_ar': arabic, 'path': f'svg/{name}.svg',
        'rtl': {'mirror': mirror, 'decision': decision},
        'source': f"https://github.com/lucide-icons/lucide/blob/{manifest['upstream_version']}/icons/{name}.svg",
        'package': f"lucide-static@{manifest['upstream_version']}",
        'sha256': hashlib.sha256(original).hexdigest(),
    }
    manifest['icons'].append(entry)
    additions.append(entry)

assert manifest['icons'][:len(before)] == before, 'Existing entries changed'
manifest['count'] = len(manifest['icons'])
manifest['version'] = '1.1.0'
manifest['reconciliation'] = {
    'date': '2026-10-26', 'specified_unique': len(specified),
    'renderer_unique': len(renderer_icons), 'family_icon_fields_unique': len(family_icons),
    'required_unique': len(required), 'required_missing_after': [],
    'contract': 'spec/component-contract.json', 'renderer': 'build/components-figma.js',
    'families': 'build/component-families.json',
    'method': 'Union original pack with all specified icon names, recursive icon fields and renderer literal names present in the official pinned archive. Existing entries remain unchanged.',
    'inputs_sha256': {str(p.relative_to(PROJECT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in [PROJECT / 'spec/component-contract.json', renderer_path, family_path]},
}
manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
# Retain the first expansion delta on an idempotent no-change re-run.
if additions or not (ROOT / 'icon-additions-manifest.json').exists():
    (ROOT / 'icon-additions-manifest.json').write_text(json.dumps({
        'name': 'Clinime icon additions', 'upstream_version': manifest['upstream_version'],
        'previous_count': len(before), 'added_count': len(additions), 'total_count': manifest['count'],
        'license_file': 'LICENSE', 'icons': additions,
    }, indent=2, ensure_ascii=False) + '\n')
    (ROOT / 'missing-names.txt').write_text('\n'.join(i['name'] for i in additions) + '\n')
    (ROOT / 'icon-additions-file-map.json').write_text(json.dumps({
        i['name']: str((ROOT / i['path']).resolve()) for i in additions
    }, indent=2) + '\n')
symbols = []
for entry in manifest['icons']:
    source = (ROOT / entry['path']).read_text()
    body = re.sub(r'^.*?<svg\b[^>]*>', '', source, flags=re.S).rsplit('</svg>', 1)[0]
    symbols.append(f'<symbol id="i-{entry["name"]}" viewBox="0 0 24 24">{body}</symbol>')
sprite = '<svg xmlns="http://www.w3.org/2000/svg">' + '\n'.join(symbols) + '</svg>'
(ROOT / 'clinime-icons.svg').write_text(sprite)
(PROJECT / 'preview/assets/clinime-icons.svg').write_text(sprite)
for p in [PROJECT / 'preview/asset-manifest.json']:
    data = json.loads(p.read_text())
    for entry in data['assets']:
        if entry['file'] == 'assets/clinime-icons.svg':
            entry['sha256'] = hashlib.sha256(sprite.encode()).hexdigest()
    data['icon_pack_count'] = manifest['count']
    p.write_text(json.dumps(data, indent=2) + '\n')
print(json.dumps({'added': len(additions), 'total': manifest['count'], 'required_missing_after': sorted(required - {i['name'] for i in manifest['icons']}), 'file_map': str(ROOT / 'icon-additions-file-map.json')}, indent=2))
