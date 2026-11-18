import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {CATALOG} from '../server/catalog.mjs';
import {openDraftStore} from '../scripts/maeen-draft-store.mjs';
import {runDraftTurn} from '../scripts/maeen-draft-tools.mjs';

test('catalog clarification preserves the requested Riyadh day, survives replay, and materializes one owned draft',async()=>{
  const store=openDraftStore(':memory:');
  const beforeMidnight=new Date('2026-11-04T20:59:00Z'),afterMidnight=new Date('2026-11-04T21:02:00Z');
  const turn=(content,extra={},now=beforeMidnight,owner='one')=>runDraftTurn({owner,body:{requestId:randomUUID(),...extra},thread:[{role:'user',content}],catalog:CATALOG,store,key:'fixture',now,generate:async()=> 'نص تجريبي.'});
  try{
    const ask=await turn('جهّز لي ستوري عن تنظيف البشرة واحفظه لبكرة');
    assert.deepEqual(ask.choices,['تنظيف البشرة الأساسي','تنظيف البشرة العميق']);
    assert.equal(store.list('one').length,0);
    const {pending}=ask;
    const skipped=await turn('مو العميق',{pending});
    assert.ok(skipped.pending);assert.equal(store.list('one').length,0);
    await assert.rejects(turn('الأساسي',{pending},afterMidnight,'two'),{status:400});
    const requestId=randomUUID(),ctx={pending,requestId};
    const {draft}=await turn('الأساسي',ctx,afterMidnight);
    assert.equal(draft.targetDate,'2026-11-05');
    assert.equal((await turn('الأساسي',ctx,afterMidnight)).draft.id,draft.id);
    assert.equal(store.list('one').length,1);
    const active={draftId:draft.id,revision:1};
    await turn('عندكم شي غير هذا؟',active);
    await turn('عدل الخدمة إلى مساج بالأحجار',active);
    assert.equal(store.get('one',draft.id).revision,1);
    const text='احجزي اليوم، وكل خميس عندنا ستوري جديد.';
    const edited=(await turn('استبدل نص المسودة بهذا النص:\n'+text,active)).draft;
    assert.equal(edited.text,text);assert.equal(edited.targetDate,draft.targetDate);assert.equal(edited.id,draft.id);
    assert.equal(edited.revision,2);assert.equal(store.list('one').length,1);
    await assert.rejects(turn('اختصرها',active),{status:409});
  }finally{store.close();}
});
