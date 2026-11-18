// Bounded public-package check. Reports paths/categories, never secret contents.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const skip = new Set(['.git', 'node_modules', 'dist']);
const failures = [];
let checked = 0;
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const full = path.join(dir, item.name), rel = path.relative(root, full).split(path.sep).join('/');
    if (item.isSymbolicLink()) { failures.push([rel, 'symlink outside portable source contract']); continue; }
    if (item.isDirectory()) {
      if (['.netlify', '.playwright-cli', 'evidence', '.demo-data'].includes(item.name)) continue;
      await walk(full); continue;
    }
    if ((item.name.startsWith('.env') && item.name !== '.env.example') || /^\.(?:loopy|resend|specialists|netlify-env)/.test(item.name)) failures.push([rel, 'private configuration/export filename']);
    const data = await readFile(full); checked++;
    const text = data.toString('utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) failures.push([rel, 'private key']);
    if (/(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|re_[A-Za-z0-9]{20,}|nfp_[A-Za-z0-9]{20,})/.test(text)) failures.push([rel, 'credential token pattern']);
    if (/[\w.+-]+@(?:gmail|hotmail|outlook|icloud|yahoo)\.[A-Za-z.]+/i.test(text)) failures.push([rel, 'personal email literal']);
    if (/\.(?:mjs|cjs|js|py|sh|json)$/.test(item.name) && /\/Users\/[A-Za-z0-9_-]+\//.test(text)) failures.push([rel, 'machine-specific source path']);
  }
}
await walk(root);
if (failures.length) { console.error(JSON.stringify({ checked, failures }, null, 2)); process.exitCode = 1; }
else console.log(`Public source check: ${checked} files; no matched private keys, credential tokens, personal email literals or machine-specific code paths. This is a bounded check, not a universal security guarantee.`);
