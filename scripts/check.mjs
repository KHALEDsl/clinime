import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
let count=0;
async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())await walk(full);else if(/\.(?:mjs|js)$/.test(item.name)){const result=spawnSync(process.execPath,['--check',full],{encoding:'utf8'});if(result.status!==0)throw Error(result.stderr);count++;}}}
for(const dir of ['client','scripts','server','netlify/functions','dist']) {try{await walk(path.join(root,dir));}catch(e){if(e.code!=='ENOENT')throw e;}}
const html=await readFile(path.join(root,'dist/index.html'),'utf8');
if(/<script(?![^>]*\bsrc=)/.test(html))throw Error('Unexpected inline script');
if(/123456|RESEND_API_KEY|APP_SECRET/.test(html))throw Error('Unexpected fixture or secret name in entry');
let localConfig='';try{localConfig=await readFile(path.join(root,'.env'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
const privateValues=localConfig.split('\n').filter(l=>/^(?:APP_SECRET|RESEND_API_KEY|LOOPY_API_KEY|LOOPY_API_SECRET)=/.test(l)).map(l=>l.slice(l.indexOf('=')+1).trim().replace(/^["']|["']$/g,'')).filter(v=>v.length>=16);
try{const loopy=JSON.parse(await readFile(path.join(root,'.loopy-credentials.json'),'utf8'));privateValues.push(...[loopy.apiKey,loopy.apiSecret,...Object.values(loopy.verifiedBindings||{})].filter(v=>typeof v==='string'&&v.length>=16));}catch(e){if(e.code!=='ENOENT')throw e;}
for(const name of await readdir(path.join(root,'dist/assets'))){if(!/\.(?:js|css|svg)$/.test(name))continue;const value=await readFile(path.join(root,'dist/assets',name),'utf8');if(privateValues.some(secret=>value.includes(secret)))throw Error('Private credential found in generated assets');if(name.endsWith('.js')&&/123456|provider-confirm|review-tools|تجريبي|معاينة/.test(value))throw Error('Internal review or demonstration behavior found in public application');}
console.log(`Syntax checked ${count} JavaScript files; generated public assets contain no private credentials or internal review controls.`);

const publishedScripts=(await readdir(path.join(root,'dist/assets'))).filter(n=>n.endsWith('.js'));
for(const name of publishedScripts){const value=await readFile(path.join(root,'dist/assets',name),'utf8');if(/ClinimeMoments|ClinimeExperience|moment-confirmation|data-action="open-gift"/.test(value))throw Error('Email-only artwork must not add a website gift or motion experience');}

// Staff code and its entry are nested under the content-versioned asset path.
// Check these too; a top-level-only scan cannot cover the published team app.
async function checkNestedAssets(dir){for(const item of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())await checkNestedAssets(full);else if(/\.(?:js|css|svg|html)$/.test(item.name)){const value=await readFile(full,'utf8');if(privateValues.some(secret=>value.includes(secret)))throw Error('Private credential found in nested generated assets');if(item.name.endsWith('.html')&&(/<script(?![^>]*\bsrc=)/.test(value)||/\son[a-z]+\s*=/i.test(value)))throw Error('Active inline script or event handler in published staff entry');}}}
await checkNestedAssets(path.join(root,'dist/assets'));
const staffEntry=await readFile(path.join(root,'dist/admin/index.html'),'utf8');
if(/<base\b|<script(?![^>]*\bsrc=)|\son[a-z]+\s*=/i.test(staffEntry))throw Error('CSP-incompatible staff entry');
console.log('Nested staff assets and entry checked for private credentials and CSP-compatible markup.');

// The isolated challenge is published outside /assets; scan its nested sources too.
await checkNestedAssets(path.join(root,'dist/game'));
for(const name of ['index.html','care-point.js']){
 const value=await readFile(path.join(root,'dist/game',name),'utf8');
 if(/clinime-care-points:v1|مشاركة توضيحية|نقاطك محفوظة على هذا الجهاز|معاينة محلية/.test(value))throw Error('Local-only Care Point behavior found in public game');
}
console.log('Care Point frame checked for private credentials and local-only scoring fixtures.');
