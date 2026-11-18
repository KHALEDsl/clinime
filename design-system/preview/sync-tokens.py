"""Export the canonical v2 semantic tokens for the standalone specimen."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent
source = root.parent / 'spec/token-proposal.json'
data = json.loads(source.read_text())
lines = ['/* Generated from ../spec/token-proposal.json. Run sync-tokens.py to refresh. */']
for mode, selector in [('light', ':root'), ('dark', 'html[data-theme="dark"]')]:
    lines.append(selector + ' {')
    for key, value in data['semantic'][mode].items():
        lines.append(f'  --cl-{key.replace(".", "-")}: {value};')
    lines.append('}')
lines.append(':root { --cl-brand-pink: #FFD8EB; --cl-brand-slate: #2D3E5B; }')
(root / 'assets/clinime-canonical.css').write_text('\n'.join(lines) + '\n')
print(f'Exported {len(data["semantic"]["light"])} light and {len(data["semantic"]["dark"])} dark semantic tokens.')
