import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, chmod, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = join(root, 'scripts/maeen-art/compose.swift');
let compiled;

function run(command, args, input, timeout = 180000) {
  return new Promise((done, reject) => {
    const proc = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'], timeout });
    const errors = [];
    proc.stderr.on('data', chunk => errors.push(chunk));
    proc.stdin.on('error', () => {});
    proc.once('error', reject);
    proc.once('close', code => {
      if (code === 0) return done();
      const message = Buffer.concat(errors).toString().trim();
      if (message.includes('TEXT_TOO_LONG')) {
        return reject(Object.assign(new Error('النص طويل على صورة واحدة. اختصر المسودة وجرّب توليدها من جديد.'), { code: 'TEXT_TOO_LONG' }));
      }
      reject(new Error(message || 'تعذّر تجهيز الصورة للتحميل.'));
    });
    proc.stdin.end(input);
  });
}

async function getRenderer() {
  const key = createHash('sha256').update(await readFile(source)).digest('hex').slice(0, 16);
  const directory = join(homedir(), 'Library/Caches/ClinimeMaeenImage/layout');
  const binary = join(directory, 'layout-' + key);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await access(binary, constants.X_OK);
  } catch {
    const temporary = await mkdtemp(join(directory, '.compile-'));
    try {
      const out = join(temporary, 'layout');
      await run('/usr/bin/xcrun', ['swiftc', '-O', source, '-o', out]);
      await rename(out, binary);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  return binary;
}

export async function composeStory({ photoPath, outputPath, draft }) {
  if (typeof draft?.text !== 'string' || !draft.text.trim()) throw new Error('المسودة تحتاج نصًا.');
  const height = draft.format === 'ستوري' ? 1920 : 1350;
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(output), '.' + randomUUID() + '.png');
  compiled ??= getRenderer().catch(error => { compiled = undefined; throw error; });
  try {
    await run(await compiled, [], JSON.stringify({
      photo: resolve(photoPath), output: temporary, assets: join(root, 'dist/assets'),
      text: draft.text, height
    }));
    await chmod(temporary, 0o600);
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
  return { width: 1080, height, outputPath: output };
}
