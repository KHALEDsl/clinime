"""Install the pinned local macOS arm64 image engine. No credentials required."""
import hashlib
import os
import platform
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

ENGINE = ('https://github.com/leejet/stable-diffusion.cpp/releases/download/master-1047-984eb06/'
          'sd-master-984eb06-bin-Darwin-macOS-26.6.2-arm64.zip')
ENGINE_HASH = '857a2178db0a745ce841eb9526201605dc7c05a9fb6dd1b50fac6ccf6fbc93a6'
MODEL = ('https://huggingface.co/Lykon/DreamShaper/resolve/'
         '228d79cb20811466f5c5710aa91f05dabd0b8a14/DreamShaper8_LCM.safetensors')
MODEL_HASH = 'a4f3e1526c5dc4fcbe342f5c410d83ae202c7a415fcefcbb92e0f93fcd0a87c3'
MODEL_TERMS = 'https://huggingface.co/Lykon/dreamshaper-8-lcm'
cache = Path(os.environ.get('CLINIME_MAEEN_IMAGE_CACHE',
                            Path.home() / 'Library/Caches/ClinimeMaeenImage'))


def digest(file):
    with file.open('rb') as stream:
        value = hashlib.sha256()
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def fetch(url, expected, filename):
    output = cache / filename
    if output.exists() and digest(output) == expected:
        return output
    with tempfile.TemporaryDirectory(dir=cache) as tmp:
        partial = Path(tmp) / 'download'
        subprocess.run(['curl', '-fL', '--retry', '3', url, '-o', str(partial)], check=True)
        if digest(partial) != expected:
            raise RuntimeError('Downloaded artifact hash does not match the pinned source.')
        partial.chmod(0o600)
        partial.replace(output)
    return output


if __name__ == '__main__':
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise SystemExit('This installer targets macOS on Apple silicon.')
    cache.mkdir(mode=0o700, parents=True, exist_ok=True)
    with zipfile.ZipFile(fetch(ENGINE, ENGINE_HASH, 'sd.zip')) as archive:
        for file in ('sd-cli', 'libstable-diffusion.dylib', 'ggml.txt', 'stable-diffusion.cpp.txt'):
            target = cache / file
            with archive.open(file) as incoming, target.open('wb') as output:
                shutil.copyfileobj(incoming, output)
            target.chmod(0o700 if file in ('sd-cli', 'libstable-diffusion.dylib') else 0o600)
    fetch(MODEL, MODEL_HASH, 'DreamShaper8_LCM.safetensors')
    print('Local image model ready. Model card and usage terms:', MODEL_TERMS)
