import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=Object.fromEntries(await Promise.all(['copy','data','engine','loading','muse'].map(async name=>[name,await readFile(new URL(`../client/${name}.js`,import.meta.url),'utf8')])));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function setup(api={}){
 const events={},elements=new Map(['app','overlay','announce'].map(id=>[id,{innerHTML:'',textContent:''}])),renders=[],photos=[],timers=[];
 const document={documentElement:{},activeElement:null,visibilityState:'visible',getElementById:id=>elements.get(id)||null,querySelector:()=>null,querySelectorAll:selector=>selector==='[data-loading-photo]'?photos:[],addEventListener:(name,fn)=>events[name]=fn};
 const context=vm.createContext({console,document,Intl,Date,URLSearchParams,location:{hash:'#/services',origin:'http://127.0.0.1'},history:{replaceState(){},pushState(){}},localStorage:{getItem:()=>'{"locale":"en"}',setItem(){}},sessionStorage:{getItem:()=>'1'},ASSETS:{skin:'/skin.webp'},scrollY:0,scrollTo(){},requestAnimationFrame:fn=>fn(),setInterval(){},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},matchMedia:()=>({matches:true}),addEventListener(){},renderApp:()=>renders.push({route:context.App.state.route,status:context.App.state.configStatus}),renderModal:()=>'',ClinimeAPI:{uuid:()=> 'test',setCSRF(){},me:async()=>({user:null}),...api}});
 context.window=context;for(const name of ['copy','data','engine','loading','muse'])vm.runInContext(code[name],context);
 const click=action=>events.click({target:{closest:s=>s==='[data-action]'?{dataset:{action},disabled:false}:null},preventDefault(){}});
 return{context,state:context.App.state,renders,photos,timers,click};
}
const catalog=[{id:'basic',nameAr:'تنظيف البشرة',nameEn:'Facial',category:'skin',price:250,duration:40,options:[],image:'skin'}];
test('public deep link renders loading rows before config or account returns, then real live prices',async()=>{
 const config=deferred(),session=deferred(),h=setup({config:()=>config.promise,me:()=>session.promise});
 const start=h.context.App.start();
 assert.equal(h.state.route,'services');
 const loading=h.context.MuseDiscovery.services();
 assert.match(loading,/aria-busy="true"/);assert.match(loading,/clinime-skeleton-row/);
 assert.doesNotMatch(loading,/data-action="toggle-service"/);assert.doesNotMatch(loading,/No treatments found/);
 config.resolve({catalog,catalogVersion:'live-v1'});await settle();
 assert.equal(h.state.configStatus,'ready');assert.match(h.context.MuseDiscovery.services(),/Facial/);
 assert.match(h.context.MuseDiscovery.services(),/data-action="toggle-service"/);
 assert.ok(h.renders.some(r=>r.route==='services'&&r.status==='ready'));
 // Loading completion must leave a newer user navigation in place.
 h.context.App.go('search');session.resolve({user:null});await start;assert.equal(h.state.route,'search');
});
test('config failure stops skeletons and exposes retry; latest retry owns the catalog',async()=>{
 const first=deferred(),newer=deferred();let calls=0;
 const h=setup({config:()=>++calls===1?Promise.reject(new Error('offline')):calls===2?first.promise:newer.promise});
 await h.context.App.start();assert.equal(h.state.configStatus,'error');
 const error=h.context.MuseDiscovery.services();assert.match(error,/Could not load treatments/);assert.match(error,/data-action="retry-config"/);assert.doesNotMatch(error,/clinime-skeleton-row/);
 h.click('retry-config');h.click('retry-config');assert.equal(h.state.configStatus,'loading');
 newer.resolve({catalog:[{...catalog[0],nameEn:'Latest facial',price:300}]});await settle();
 first.resolve({catalog:[{...catalog[0],nameEn:'Old facial',price:100}]});await settle();
 const menu=h.context.MuseDiscovery.services();assert.match(menu,/Latest facial/);assert.doesNotMatch(menu,/Old facial/);
});
test('an empty authoritative catalog becomes an empty result only after success',async()=>{
 const config=deferred(),h=setup({config:()=>config.promise});const start=h.context.App.start();
 assert.match(h.context.MuseDiscovery.services(),/clinime-skeleton-row/);
 config.resolve({catalog:[]});await start;
 assert.doesNotMatch(h.context.MuseDiscovery.services(),/clinime-skeleton-row/);
 assert.match(h.context.MuseDiscovery.services(),/state-panel/);
 assert.doesNotMatch(h.context.MuseDiscovery.home(),/service-hydra/);
});
function fakePhoto(source,decode){const handlers={};return{dataset:{photoState:'loading'},isConnected:true,complete:false,naturalWidth:100,getAttribute:()=>source,addEventListener:(name,fn)=>handlers[name]=fn,decode,handlers};}
test('photo waits for decode, reuses successful cache, and recovers from errors and stalls',async()=>{
 const h=setup(),decode=deferred(),photo=fakePhoto('/photo.webp',()=>decode.promise);h.photos.push(photo);h.context.ClinimeLoading.hydrate();
 photo.handlers.load();assert.equal(photo.dataset.photoState,'loading');decode.resolve();await settle();assert.equal(photo.dataset.photoState,'ready');
 assert.match(h.context.ClinimeLoading.photo('/photo.webp'),/data-photo-state="ready"/);
 const broken=fakePhoto('/broken.webp',async()=>{});h.photos.push(broken);h.context.ClinimeLoading.hydrate();broken.handlers.error();assert.equal(broken.dataset.photoState,'error');
 assert.match(h.context.ClinimeLoading.photo('/broken.webp'),/data-photo-state="error"/);
 const slow=fakePhoto('/slow.webp',async()=>{});h.photos.push(slow);h.context.ClinimeLoading.hydrate();h.timers.at(-1)();assert.equal(slow.dataset.photoState,'error');
 await slow.handlers.load();assert.equal(slow.dataset.photoState,'ready');
});

test('a decoded URL cannot hide the placeholder for a new image node still waiting on bytes',async()=>{
 const h=setup(),first=fakePhoto('/cached.webp',async()=>{});h.photos.push(first);h.context.ClinimeLoading.hydrate();await first.handlers.load();
 assert.match(h.context.ClinimeLoading.photo('/cached.webp'),/data-photo-state="ready"/);
 const decode=deferred(),next=fakePhoto('/cached.webp',()=>decode.promise);next.dataset.photoState='ready';next.naturalWidth=0;h.photos.splice(0,1,next);
 const timerCount=h.timers.length;h.context.ClinimeLoading.hydrate();
 assert.equal(next.dataset.photoState,'loading');assert.equal(h.timers.length,timerCount+1,'a fresh pending node gets its own load deadline');
 next.naturalWidth=100;next.handlers.load();assert.equal(next.dataset.photoState,'loading','wait for this node to decode');
 decode.resolve();await settle();assert.equal(next.dataset.photoState,'ready');
 const complete=fakePhoto('/cached.webp',async()=>{});complete.complete=true;complete.dataset.photoState='ready';h.photos.splice(0,1,complete);h.context.ClinimeLoading.hydrate();
 assert.equal(complete.dataset.photoState,'ready','an actual complete cached node stays visible');await settle();assert.equal(complete.dataset.photoState,'ready');
});
