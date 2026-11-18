import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openVisualJobs} from '../scripts/maeen-visuals.mjs';
import {imageRequest} from '../scripts/maeen-draft-tools.mjs';
import {setTimeout as sleep} from 'node:timers/promises';

test('a draft retains its original visual and separates copy changes, new looks and other staff',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'maeen-private-'));
  let renders=0,fail=false;
  const adapters={prompt:async(_,brief)=>brief,render:async({prompt,outputPath})=>{renders++;if(fail)throw Error('fixture');await writeFile(outputPath,prompt);},
    compose:async({photoPath,outputPath,draft})=>writeFile(outputPath,(await readFile(photoPath,'utf8'))+' '+draft.text)};
  let jobs=openVisualJobs(directory,adapters);
  const owner='one',one={id:'sample',revision:1,serviceId:'basic',text:'الأولى',format:'ستوري'};
  async function wait(d,status){for(let i=0;i<150;i++){const s=jobs.status(owner,d);if(s.status===status)return s;await sleep(10);}throw Error('job incomplete');}
  try{
    const start=(d,id,brief,regenerate)=>jobs.start(owner,d,{requestId:id,brief,regenerate});
    start(one,'request-1','first',false);
    start(one,'request-1','first',false);
    const first=await wait(one,'ready');assert.equal(renders,1);
    const id=first.url.split('/').at(-1).replace('.png','');
    assert.equal(jobs.file('two',id),null);
    const two={...one,revision:2,text:'الثانية'};
    start(two,'request-2','copy change',false);const edited=await wait(two,'ready');
    assert.equal(renders,1);assert.notEqual(edited.url,first.url);
    start(two,'request-3','rose',true);start(two,'request-4','blue',true);
    const blue=await wait(two,'ready');
    assert.equal(renders,3);assert.match(await readFile(jobs.file(owner,blue.url.split('/').at(-1).replace('.png','')),'utf8'),/blue/);
    fail=true;start(two,'request-5','failure',true);assert.equal((await wait(two,'failed')).previousUrl,blue.url);
    jobs.close();jobs=openVisualJobs(directory,adapters);
    assert.equal(jobs.status(owner,two).previousUrl,blue.url);
    assert.equal(jobs.status('two',two).status,'none');
  }finally{jobs.close();await rm(directory,{recursive:true});}
});
test('visual edit and literal caption have different intents',()=>{
  for(const text of ['خلّي الصورة وردية','ولّد صورة بإضاءة هادئة','وريني الصورة'])assert.ok(imageRequest(text),text);
  for(const text of ['كيف أولد صورة؟','استبدل نص المسودة بهذا النص: صورة','لا تولد صورة'])assert.equal(imageRequest(text),false,text);
});
