"""Encode rendered SVG frames for email. No booking details or codes are rasterized."""
from pathlib import Path
from PIL import Image
import json
root=Path(__file__).resolve().parents[1]
results=[]
for kind,duration in [('bloom',70),('gift',60)]:
    paths=sorted((root/'evidence/mail-animation-renderer').glob(kind+'-*.png'))
    if len(paths)!=49: raise ValueError('Expected49 rendered frames')
    frames=[Image.open(p).convert('RGB') for p in paths]
    sheet=Image.new('RGB',(598*7,250*7))
    for i,frame in enumerate(frames):sheet.paste(frame,((i%7)*598,(i//7)*250))
    palette=sheet.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
    indexed=[frame.quantize(palette=palette,dither=Image.Dither.NONE) for frame in frames]
    out=root/'client/email-assets'/f'{kind}.gif'
    # No NETSCAPE loop extension: play once, stop on the final readable illustration.
    indexed[0].save(out,save_all=True,append_images=indexed[1:],duration=duration,optimize=True,disposal=1)
    with Image.open(out) as actual:
        durations=[]
        for i in range(actual.n_frames): actual.seek(i);durations.append(actual.info.get('duration',0))
        results.append({'asset':out.name,'frames':actual.n_frames,'size':actual.size,'durationMs':sum(durations),'loop':actual.info.get('loop'),'bytes':out.stat().st_size})
(root/'evidence/email-gif-validation.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps(results))
