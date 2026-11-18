// Private, loopback-only media jobs. Content edits reuse generated photography;
// a requested new look gets a fresh seed and its own immutable asset.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { rename, stat } from 'node:fs/promises';
import path from 'node:path';

export const supportsVisual = draft => ['ستوري','منشور'].includes(draft.format);
const bad = (status,message) => Object.assign(Error(message),{status});
const scenes = {
  basic:'Skincare campaign studio product photograph. A single elegant unmarked frosted blush-pink glass facial cleanser pump bottle, standing upright on a pale rose travertine block, one small dollop of foamy cleanser at its base. Warm pink seamless background, soft reflected sunlight, subtle water caustics. No bowls or dishes',
  deep:'Macro beauty still life, a single bead of water on a translucent glass disc, plush folded spa linen, warm cream stone',
  hydra:'Macro beauty still life of refracting aqua droplets, curved clear glass, glossy pale blue surface',
  lashes:'Fine beauty still life of a clean lash spoolie, delicate shadows over softly folded ivory satin',
  brow:'A brushed metal brow spoolie and a small round mirror on cream stone, delicate directional shadows',
  laser:'Minimalist laser treatment studio still life, professional protective eyewear resting on a folded towel, frosted glass',
  micro:'Skincare editorial still life, a sealed unbranded serum ampoule and clinical stainless steel tray in side light',
  lips:'Macro studio still life of rose-toned translucent glass and a single peach flower petal'
};
export async function visualPrompt(draft,brief,key){
  const scene=scenes[draft.serviceId] || 'A thoughtfully arranged aesthetic clinic studio, sculptural translucent glass, linen and rosy limestone';
  const style='Premium Saudi beauty editorial photography, vertical magazine still life, one distinct focal subject in upper half, realistic tactile materials, soft directional light and gentle natural shadows. Unlettered photograph, no logos, no graphic design, no watermarks.';
  let instruction='';
  if(brief?.trim()){
    // Translation is optional; no customer records, patient details or photos enter the engine.
    try{
      const r=await fetch('http://127.0.0.1:18997/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},signal:AbortSignal.timeout(30000),body:JSON.stringify({model:'maeen',temperature:0,max_tokens:110,messages:[
        {role:'system',content:'Design a standalone English photo prompt for this Arabic visual request. When only a color or lighting change is requested, retain compatible elements of this base scene: '+scene+'. When a replacement subject is requested, replace the base scene completely. Include subject and explicit composition/color constraints. If there is no visual instruction, reply DEFAULT. Never add words to render, service claims or names.'},
        {role:'user',content:brief.slice(0,1000)}]})});
      if(r.ok){const fragment=(await r.json()).choices?.[0]?.message?.content?.trim();if(fragment&&!/DEFAULT/i.test(fragment))instruction=fragment.slice(0,550);}
    }catch{/* Use the supplied brief if the local translator is offline. */instruction=brief.slice(0,350);}
  }
  return [instruction||scene,style].join('. ');
}

export function openVisualJobs(directory,{render,compose,prompt=visualPrompt}){
  mkdirSync(directory,{recursive:true,mode:0o700});
  const db=new DatabaseSync(path.join(directory,'jobs.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS jobs(
      id TEXT PRIMARY KEY,owner TEXT NOT NULL,draftId TEXT NOT NULL,revision INTEGER NOT NULL,
      requestId TEXT NOT NULL,snapshot TEXT NOT NULL,brief TEXT NOT NULL,fresh INTEGER NOT NULL,
      photo TEXT,status TEXT NOT NULL,error TEXT,UNIQUE(owner,draftId,revision,requestId)
    );
    CREATE INDEX IF NOT EXISTS recent ON jobs(owner,draftId,revision);`);
  const latest=db.prepare('SELECT * FROM jobs WHERE owner=? AND draftId=? AND revision=? ORDER BY rowid DESC LIMIT 1');
  const byId=db.prepare('SELECT * FROM jobs WHERE id=? AND owner=?');
  const prior=db.prepare("SELECT * FROM jobs WHERE owner=? AND draftId=? AND revision<? AND status='ready' ORDER BY revision DESC,rowid DESC LIMIT 1");
  const next=db.prepare("SELECT * FROM jobs WHERE status='pending' ORDER BY rowid LIMIT 1");
  let running=false,secret;
  const filepath=(id,suffix)=>path.join(directory,id+suffix+'.png');
  const readyForVersion=db.prepare("SELECT id FROM jobs WHERE owner=? AND draftId=? AND revision=? AND status='ready' ORDER BY rowid DESC LIMIT 1");
  const url=id=>'/__local/maeen/visual/'+id+'.png';
  function display(row){
    if(!row)return {status:'none'};
    if(row.status==='ready')return {status:'ready',url:url(row.id)};
    const previous=readyForVersion.get(row.owner,row.draftId,row.revision);
    return {status:row.status,...(previous?{previousUrl:url(previous.id)}:{}),...(row.status==='failed'?{error:row.error}:{})};
  }
  async function drain(){
    if(running)return;
    running=true;
    try{
      for(let job;(job=next.get());){
        try{
          const draft=JSON.parse(job.snapshot);
          const previous=!job.fresh && prior.get(job.owner,job.draftId,job.revision);
          let photo=job.photo;
          if(!photo && previous && JSON.parse(previous.snapshot).serviceId===draft.serviceId) photo=previous.photo;
          if(!photo || !existsSync(filepath(photo,'-photo'))){
            const file=filepath(job.id,'-photo-tmp');
            await render({prompt:await prompt(draft,job.brief,secret),outputPath:file});
            if(!(await stat(file)).size) throw Error('Empty generated image');
            await rename(file,filepath(job.id,'-photo'));photo=job.id;
          }
          db.prepare('UPDATE jobs SET photo=? WHERE id=?').run(photo,job.id);
          const tmp=filepath(job.id,'-layout');
          await compose({photoPath:filepath(photo,'-photo'),outputPath:tmp,draft});
          await rename(tmp,filepath(job.id,''));
          db.prepare("UPDATE jobs SET status='ready',error=NULL WHERE id=?").run(job.id);
        }catch(e){
          console.error('Maeen image job:',String(e.message).slice(0,600));
          const msg=/long|fit|طويل/i.test(e.message)?'النص أطول من مساحة الصورة. اختصره وجرّب من جديد.':'تعذّر تجهيز الصورة. المسودة محفوظة وتقدر تعيد المحاولة.';
          db.prepare("UPDATE jobs SET status='failed',error=? WHERE id=?").run(msg,job.id);
        }
      }
    }finally{running=false;}
  }
  function start(owner,draft,{requestId,regenerate=false,brief='',key}={}){
    if(!supportsVisual(draft))throw bad(400,'توليد الصور متاح للستوري والمنشور.');
    if(!/^[\w-]{8,140}$/.test(requestId||''))throw bad(400,'طلب الصورة غير صالح.');
    const same=db.prepare('SELECT * FROM jobs WHERE owner=? AND draftId=? AND revision=? AND requestId=?').get(owner,draft.id,draft.revision,requestId);
    const current=latest.get(owner,draft.id,draft.revision);
    secret=key||secret;
    if(same || (current && !regenerate && ['pending','ready'].includes(current.status))){
      setImmediate(drain);return display(same||current);
    }
    const id=randomUUID();
    db.prepare('INSERT INTO jobs(id,owner,draftId,revision,requestId,snapshot,brief,fresh,photo,status) VALUES(?,?,?,?,?,?,?,?,?,\'pending\')')
      .run(id,owner,draft.id,draft.revision,requestId,JSON.stringify(draft),brief,regenerate?1:0,!regenerate && current?.photo?current.photo:null);
    setImmediate(drain);
    return display(byId.get(id,owner));
  }
  return {start,status(owner,draft){const row=latest.get(owner,draft.id,draft.revision);if(row?.status==='pending')setImmediate(drain);return display(row);},
    file(owner,id){const row=byId.get(id,owner);return row?.status==='ready'?filepath(row.id,''):null;},
    resume(key){secret=key;setImmediate(drain);},close(){db.close();}};
}
