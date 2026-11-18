import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openDraftStore } from '../scripts/maeen-draft-store.mjs';

const create = { requestId:'r1', serviceId:'basic', serviceName:'تنظيف البشرة الأساسي', format:'ستوري', text:'وش ودّك تعرفين عن أول جلسة؟', targetDate:'2026-11-05' };

test('reopening the store restores content and retry receipts for the same account only', t => {
  const dir = mkdtempSync(join(tmpdir(),'maeen-drafts-'));
  t.after(() => rmSync(dir, { recursive:true, force:true }));
  const path = join(dir, 'private','drafts.sqlite');
  let store = openDraftStore(path);
  const first = store.save('sara',create);
  store.close();
  store = openDraftStore(path);
  t.after(() => store.close());
  assert.deepEqual(store.list('sara'),[first]);
  assert.deepEqual(store.save('sara',create),first);
  assert.deepEqual(store.list('reem'),[]);
  assert.throws(() => store.get('reem',first.id), {status:404});
  assert.throws(() => store.save('reem',{...create,id:first.id,revision:1}), {status:404});
  assert.notEqual(store.save('reem',create).id,first.id);
  assert.equal(store.list('sara').length,1);
});

test('concurrent editors require a fresh revision and retries cannot overwrite newer edits', t => {
  const dir = mkdtempSync(join(tmpdir(),'maeen-revision-'));
  const a = openDraftStore(join(dir,'drafts.sqlite'));
  const b = openDraftStore(join(dir,'drafts.sqlite'));
  t.after(() => { a.close(); b.close(); rmSync(dir,{recursive:true, force:true}); });
  const first = a.save('owner',create);
  const update = {...create,id:first.id,revision:1,requestId:'r2',text:'أول زيارة لك؟'};
  const second = b.save('owner',update);
  assert.equal(second.revision,2);
  assert.throws(() => a.save('owner',{...update,requestId:'r3',text:'تعديل قديم'}), {status:409});
  const latest = a.save('owner',{...update,revision:2,requestId:'r3',text:'قبل أول زيارة، ارسلي سؤالك.'});
  assert.deepEqual(b.save('owner',update),second);
  assert.throws(() => b.save('owner',{...update,text:'طلب مختلف بنفس الرقم'}), {status:409});
  assert.deepEqual(a.get('owner',first.id),latest);
});

test('invalid dates or empty content do not reserve request IDs', t => {
  const store = openDraftStore(':memory:');
  t.after(() => store.close());
  for (const invalid of [{targetDate:'2026-02-30'},{text:'  '}]) {
    assert.throws(() => store.save('owner',{...create,...invalid}), {status:400});
  }
  assert.equal(store.save('owner',{...create,targetDate:null}).targetDate,null);
});

test('a chat turn can replay its pre-generation fingerprint across process restarts', t => {
  const dir = mkdtempSync(join(tmpdir(),'maeen-intent-'));
  const path = join(dir,'drafts.sqlite');
  let store = openDraftStore(path);
  const fingerprint = 'a'.repeat(64);
  const other = 'b'.repeat(64);
  assert.equal(store.replay('owner',create.requestId,fingerprint),null);
  const first = store.save('owner',{...create,fingerprint});
  store.close();
  store = openDraftStore(path);
  t.after(() => { store.close(); rmSync(dir,{recursive:true,force:true}); });
  const latest = store.save('owner',{...create,requestId:'edit-1',id:first.id,revision:1,text:'نص محدّث',fingerprint:other});
  assert.deepEqual(store.replay('owner',create.requestId,fingerprint),first);
  assert.deepEqual(store.save('owner',{...create,text:'صياغة بديلة لنفس الطلب',fingerprint}),first);
  assert.throws(() => store.replay('owner',create.requestId,other),{status:409});
  assert.equal(store.replay('other',create.requestId,fingerprint),null);
  assert.deepEqual(store.list('owner'),[latest]);
});
