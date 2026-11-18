import { readFile, writeFile, mkdir, copyFile, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import { CATALOG } from '../server/catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = path.resolve(root, '../..');
const out = path.join(root, 'dist');
const source = path.join(root, 'client');
const assetsDir = path.join(out, 'assets');
const brand = path.join(root, 'assets-source/brand');
const imagery = path.join(root, 'assets-source/imagery');
const fontSource = path.join(root, 'assets-source/fonts');
await rm(out, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });
await mkdir(path.join(assetsDir,'email'),{recursive:true});
for(const file of ['bloom.png','gift.png','logo.png','bloom.gif','gift.gif','care-victory.png','care-victory.gif']) await copyFile(path.join(source,'email-assets',file),path.join(assetsDir,'email',file));
const assets = {};
for (const [key, name] of Object.entries({clinic:'clinic-interior.png',skin:'skincare-stilllife.png',beauty:'beauty-portrait.png',laser:'laser-editorial.png',editorial:'skincare-editorial.png'})) {
  await copyFile(path.join(imagery,name),path.join(assetsDir,name));
  assets[key]='/assets/'+name;
}
// The approved Muse cover stays independent of the catalog art.
const treatmentAssets = [...CATALOG.map(service => service.id), 'clinic-story', 'category-skin', 'category-consult'];
await mkdir(path.join(assetsDir, 'treatments'), { recursive: true });
for (const id of treatmentAssets) {
  const image = await readFile(path.join(source, 'service-photos', id + '.jpg'));
  const revision = crypto.createHash('sha256').update(image).digest('hex').slice(0, 10);
  const filename = id + '-' + revision + '.jpg';
  await writeFile(path.join(assetsDir, 'treatments', filename), image);
  assets['treatment-' + id] = '/assets/treatments/' + filename;
}
assets.portrait=assets.beauty;
await mkdir(path.join(assetsDir, 'specialists'), { recursive: true });
for (const id of ['layla', 'noura', 'sara', 'lama', 'rema', 'hana', 'yara']) {
  await copyFile(path.join(source, 'specialist-photos', id + '.jpg'), path.join(assetsDir, 'specialists', id + '.jpg'));
}
for (const [key,name] of Object.entries({logo:'clinime-logo-light.svg',mark:'clinime-mark.svg',favicon:'clinime-app-icon.svg'})) {
  await copyFile(path.join(brand,name),path.join(assetsDir,name));
  assets[key]='/assets/'+name;
}
await writeFile(path.join(assetsDir,'clinime-logo-white.svg'),(await readFile(path.join(brand,'clinime-logo-light.svg'),'utf8')).replaceAll('#2D3E5B','#FFFFFF'));
assets.logoWhite='/assets/clinime-logo-white.svg';
let fonts='';
for(const [weight,name] of [[400,'Regular'],[500,'Medium'],[600,'SemiBold']]) {
 const file=`IBMPlexSansArabic-${name}.ttf`;
 await copyFile(path.join(fontSource,file),path.join(assetsDir,file));
 fonts+=`@font-face{font-family:PlexArabic;font-weight:${weight};font-style:normal;font-display:swap;src:url('/assets/${file}') format('truetype')}\n`;
}
await copyFile(path.join(fontSource,'OFL.txt'),path.join(assetsDir,'OFL.txt'));
const extra=`
#intro{position:fixed;inset:0;z-index:100;background:#FFF8FB;display:grid;place-items:center}#intro[hidden]{display:none}.intro-lockup{width:230px;height:70px;position:relative;direction:ltr}.intro-mark{position:absolute;inset:0 auto auto 80px;width:70px;height:70px;opacity:0}.intro-logo{width:230px;position:absolute;top:6px;left:0;opacity:0}.is-playing .intro-mark{animation:mark-enter 1.2s cubic-bezier(.22,1,.36,1) both}.is-playing .intro-logo{animation:logo-enter .3s .95s ease both}.intro-skip{position:absolute;bottom:max(32px,env(safe-area-inset-bottom));padding:12px 24px;border:1px solid #7C8798;border-radius:10px;color:#2D3E5B;background:white;font:inherit;min-height:44px}@keyframes mark-enter{0%{opacity:1;transform:rotate(180deg) scale(1.35)}42%{opacity:1;transform:rotate(0) scale(1.35)}78%{opacity:1;transform:translateX(-86px) scale(.68)}100%{opacity:0;transform:translateX(-86px) scale(.68)}}@keyframes logo-enter{to{opacity:1}}@media(prefers-reduced-motion:reduce){#intro{display:none}.app-content{animation:none!important}}.skip-link{position:fixed;inset-block-start:8px;inset-inline-start:8px;z-index:150;padding:12px;background:white;border:2px solid #2D3E5B;transform:translateY(-150%)}.skip-link:focus{transform:none}
`;
const css = fonts + (await Promise.all(['style.css','discovery.css','journey.css','muse.css','muse-journey.css','loading.css','review-motion.css','loyalty.css','care-point.css'].map(f=>readFile(path.join(source,f),'utf8')))).join('\n') + extra;
const version = crypto.createHash('sha256').update(css).digest('hex').slice(0,12);
await writeFile(path.join(assetsDir,`app-${version}.css`),css);
const scripts=['copy.js','data.js','api.js','engine.js','loading.js','discovery.js','journey.js','review-motion.js','muse.js','muse-motion.js','loyalty.js','care-point.js','view.js'];
const javascript='window.ASSETS='+JSON.stringify(assets)+';\n'+(await Promise.all(scripts.map(f=>readFile(path.join(source,f),'utf8')))).join('\n;\n')+'\n;App.start();\n';
const scriptVersion=crypto.createHash('sha256').update(javascript).digest('hex').slice(0,12);
await writeFile(path.join(assetsDir,`app-${scriptVersion}.js`),javascript);
const html=`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#FFFFFF"><meta name="description" content="اكتشفي خدمات كلينيمي واختاري موعدك وأديري حجوزاتك."><title>Clinime — كلينيمي</title><link rel="icon" type="image/svg+xml" href="${assets.favicon}"><link rel="stylesheet" href="/assets/app-${version}.css"></head>
<body data-customer-theme="muse"><a class="skip-link" href="#main-content">تجاوز إلى المحتوى · Skip to content</a><div id="intro" hidden></div><div id="app"></div><div id="overlay"></div><div id="announce" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div><noscript>فعّلي JavaScript لعرض الخدمات وإدارة حجوزاتك.</noscript><script src="/assets/app-${scriptVersion}.js" defer></script></body></html>`;
await writeFile(path.join(out,'index.html'),html);
await writeFile(path.join(out,'robots.txt'),'User-agent: *\nDisallow: /api/\n');
// Isolated Care Point: use the exact server generator in the public frame.
const gameDir=path.join(out,'game');
await mkdir(gameDir,{recursive:true});
const gameSources={'care-point.css':await readFile(path.join(source,'care-point/care-point.css')),'care-point.js':await readFile(path.join(source,'care-point/care-point.js')),'care-point-engine.js':await readFile(path.join(root,'server/care-point-engine.cjs'))};
const gameVersion=crypto.createHash('sha256').update(Buffer.concat(Object.values(gameSources))).digest('hex').slice(0,12);
for(const [name,content] of Object.entries(gameSources))await writeFile(path.join(gameDir,name),content);
let gameEntry=await readFile(path.join(source,'care-point/index.html'),'utf8');
for(const name of Object.keys(gameSources))gameEntry=gameEntry.replaceAll('/game/'+name,'/game/'+name+'?v='+gameVersion);
await writeFile(path.join(gameDir,'index.html'),gameEntry);
await writeFile(path.join(root,'build-manifest.json'),JSON.stringify({builtAt:new Date().toISOString(),carePointVersion:gameVersion,entryBytes:Buffer.byteLength(html),sources:scripts,script:`app-${scriptVersion}.js`,stylesheet:`app-${version}.css`,assets:Object.keys(assets)},null,2)+'\n');
console.log(`Built Clinime mobile: ${Buffer.byteLength(html)} byte entry, ${scripts.length} scripts, external original assets.`);

// Approved desktop team UI: immutable-versioned public assets, private API data only.
const staffSource=path.join(source,'admin/staff');
async function entries(dir,base=''){const all=[];for(const entry of await readdir(dir,{withFileTypes:true})){const rel=path.join(base,entry.name);if(entry.isDirectory())all.push(...await entries(path.join(dir,entry.name),rel));else all.push(rel);}return all.sort();}
const files=await entries(staffSource),digest=crypto.createHash('sha256');
for(const file of files){digest.update(file);digest.update(await readFile(path.join(staffSource,file)));}
const adminVersion=digest.digest('hex').slice(0,12),prefix='/assets/admin-'+adminVersion+'/',destination=path.join(out,prefix.slice(1));
await mkdir(destination,{recursive:true});await mkdir(path.join(out,'admin'),{recursive:true});
for(const file of files){const target=path.join(destination,file);await mkdir(path.dirname(target),{recursive:true});if(/\.(?:js|css|html)$/.test(file)){const content=(await readFile(path.join(staffSource,file),'utf8')).replaceAll('/admin/staff/',prefix);await writeFile(target,content);}else await copyFile(path.join(staffSource,file),target);}
const staffEntry=(await readFile(path.join(staffSource,'index.html'),'utf8')).replaceAll('/admin/staff/',prefix);
await writeFile(path.join(out,'admin/index.html'),staffEntry);
await writeFile(path.join(out,'robots.txt'),'User-agent: *\nDisallow: /api/\nDisallow: /admin\n');
await writeFile(path.join(root,'admin-build-manifest.json'),JSON.stringify({version:adminVersion,prefix,files},null,2));
console.log('Built approved reception/doctor interface: /admin, '+adminVersion+'. Server records only.');
