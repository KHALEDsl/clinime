import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const source = await readFile(new URL('../client/care-point/care-point.js', import.meta.url), 'utf8');
const roundId = '51d320e6-cd3d-471d-a9bd-54c7fbed0a2a';
const requestId = '0ff24502-7e86-4967-99e0-c416ef5b8618';

// Exercise the shipped controller through its actual parent-message boundary.
// This intentionally supplies transport fixtures; it does not mutate an API or
// claim that these supplied standings are real competition data.
function controller({ pending = true } = {}) {
  const elements = new Map(), listeners = new Map(), sent = [], timers = new Set(), intervals=[];
  let time=Date.parse('2026-11-09T12:00:00Z');
  const values = new Map([
    ['clinime-care-intro:v2', '1'],
    ...(pending ? [['clinime-care-live-requests:v1', JSON.stringify({ owner: 'account-a', complete: { requestId, roundId, rotations: Array(16).fill(0) } })]] : [])
  ]);
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', innerHTML: '', value: '', hidden: true, disabled: false, dataset: {}, children: [], handlers: new Map(),
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener(type, handler) { this.handlers.set(type, handler); }, setAttribute() {}, focus() {}, querySelector() { return null; }
    });
    return elements.get(id);
  };
  const parent = { postMessage(value) { sent.push(value); } };
  const sandbox = {
    console, Intl, Date: class extends Date { static now() { return time; } }, crypto: { randomUUID }, parent,
    location: { origin: 'https://clinic.example' },
    document: { hidden: false, getElementById: element, querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) },
    matchMedia: () => ({ matches: true }),
    addEventListener: (type, listener) => listeners.set(type, listener),
    setInterval(fn,delay) { intervals.push({fn,delay}); },
    setTimeout(fn, delay) { const timer = setTimeout(fn, delay); timers.add(timer); return timer; },
    clearTimeout(timer) { clearTimeout(timer); timers.delete(timer); }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  const message = data => listeners.get('message')({ origin: sandbox.location.origin, source: parent, data });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  return {
    element, sent, values,
    async poll(){time+=30000;for(const timer of intervals)if(timer.delay===30000)timer.fn();await tick();},
    hidden(value){sandbox.document.hidden=value;},
    pause(){message({type:'clinime:game-pause'});},
    async click(id) { element(id).handlers.get('click')?.({ preventDefault() {} }); await tick(); },
    async submitName() { element('first-name-form').handlers.get('submit')({ preventDefault() {} }); await tick(); },
    async reply(result, error) { const request = sent.at(-1); message({ type: 'clinime:care-response', id: request.id, ...(error ? { error } : { result }) }); await tick(); },
    async refresh(data) {
      message({ type: 'clinime:care-context', userId: 'account-a', active: true });
      const request = sent.at(-1);
      assert.equal(request.type, 'clinime:care-request');
      assert.equal(request.action, 'get');
      message({ type: 'clinime:care-response', id: request.id, result: data });
      await tick();
    },
    dispose() { for (const timer of timers) clearTimeout(timer); }
  };
}
function snapshot({ eligible = true, rank = 1, points = 100 } = {}) {
  return {
    week: { key: '2026-11-08', startsAt: '2026-11-07T21:00:00Z', endsAt: '2026-11-14T21:00:00Z', status: 'active' },
    player: { points, rank, eligible, roundsCompleted: points / 100, alias: 'خالد', needsName: false, suggestedName: 'خالد' },
    leaderboard: { rows: rank ? [{ alias: 'خالد', points, rank, isYou: true }] : [], total: rank ? 1 : 0 },
    round: null,
    lastCompletion: { requestId, roundId, awarded: 100 }
  };
}

test('current player rank is shown even if a legacy response carries an old exclusion flag', async () => {
  const app = controller();
  try {
    await app.refresh(snapshot({ eligible: false, rank: 2, points: 500 }));
    assert.equal(app.element('hub-rank').textContent, '٢');
    assert.equal(app.element('result-rank').textContent, '٢');
    assert.match(app.element('result-feedback').textContent, /أنت في المركز ٢ حاليًا/);
    assert.doesNotMatch(app.element('result-feedback').textContent + app.element('hub-preview').textContent, /خارج|حساب التجربة/);
  } finally { app.dispose(); }
});

test('eligible completion displays authoritative rank; reopening repaints retained success from GET without a score mutation', async () => {
  const app = controller();
  try {
    await app.refresh(snapshot());
    assert.equal(app.element('result-rank').textContent, '١');
    assert.equal(app.element('result-total').textContent, '١٠٠');
    await app.refresh(snapshot({ rank: 2, points: 200 }));
    assert.equal(app.element('hub-rank').textContent, '٢');
    assert.equal(app.element('result-rank').textContent, '٢');
    assert.equal(app.element('result-total').textContent, '٢٠٠');
    assert.match(app.element('result-feedback').textContent, /أنت في المركز ٢ حاليًا/);
    assert.deepEqual(app.sent.filter(item => item.type === 'clinime:care-request').map(item => item.action), ['get', 'get']);
  } finally { app.dispose(); }
});

test('missing eligible rank after points is disclosed rather than replaced by a fabricated rank or endless waiting', async () => {
  const app = controller();
  try {
    await app.refresh(snapshot({ rank: null }));
    assert.equal(app.element('hub-rank').textContent, 'غير متاح');
    assert.equal(app.element('result-rank').textContent, 'غير متاح');
    assert.match(app.element('rank-message').textContent, /حدّثي الترتيب/);
    assert.doesNotMatch(app.element('result-feedback').textContent, /أنت في المركز/);
  } finally { app.dispose(); }
});

test('first Play asks for explicit first-name save with a private trusted suggestion; saving retains play intent', async () => {
  const app = controller({ pending: false });
  try {
    const data = snapshot({ rank: null, points: 0 });
    data.player = { ...data.player, alias: null, needsName: true, suggestedName: 'خالد' };
    data.lastCompletion = null;
    await app.refresh(data);
    await app.click('start-round');
    assert.equal(app.element('name').hidden, false);
    assert.equal(app.element('first-name').value, 'خالد');
    assert.equal(app.sent.filter(item => item.type === 'clinime:care-request').length, 1);
    await app.submitName();
    assert.equal(app.sent.at(-1).action, 'name');
    assert.equal(app.sent.at(-1).body.firstName, 'خالد');
    await app.reply({ ...data, player: { ...data.player, alias: 'خالد', needsName: false } });
    assert.equal(app.sent.at(-1).action, 'start');
    assert.equal([...app.values.values()].some(value => value.includes('خالد')), false);
  } finally { app.dispose(); }
});

test('unknown name acknowledgement retries the identical request without awarding points or issuing a round', async () => {
  const app = controller({ pending: false });
  try {
    const data = snapshot({ rank: null, points: 0 });
    data.player = { ...data.player, alias: null, needsName: true, suggestedName: null };
    data.lastCompletion = null;
    await app.refresh(data);
    await app.click('hub-name');
    app.element('first-name').value = 'خالد';
    await app.submitName();
    const first = JSON.parse(JSON.stringify(app.sent.at(-1).body));
    await app.reply(null, { code: 'NETWORK_UNCERTAIN', uncertain: true });
    assert.equal(app.element('first-name').disabled, true);
    await app.submitName();
    assert.deepEqual(JSON.parse(JSON.stringify(app.sent.at(-1).body)), first);
    await app.reply({ ...data, player: { ...data.player, alias: 'خالد', needsName: false } });
    assert.equal(app.element('hub').hidden, false);
    assert.deepEqual(app.sent.filter(item => item.type === 'clinime:care-request').map(item => item.action), ['get', 'name', 'name']);
    assert.equal(app.element('hub-points').textContent, '٠');
  } finally { app.dispose(); }
});

test('leaderboard uses actual first names including the current player, while legacy aliases stay hidden', async () => {
  const app = controller({ pending: false });
  try {
    const data = snapshot();
    data.leaderboard.rows.push({ alias: 'خالد', points: 100, rank: 1, isYou: false }, { alias: 'لاعبة 12171F5E24EE', points: 100, rank: 1, isYou: false });
    await app.refresh(data);
    const markup = app.element('ranking-list').innerHTML;
    assert.equal((markup.match(/>خالد</g) || []).length, 1);
    assert.match(markup, /<bdi dir="auto">أنت<\/bdi>/);
    assert.doesNotMatch(markup, /<small>أنت<\/small>/);
    assert.doesNotMatch(markup, /بانتظار الاسم|>مشاركة</);
    assert.doesNotMatch(markup, /12171F5E24EE|لاعبة/);
  } finally { app.dispose(); }
});

test('server NAME_REQUIRED returns an editable form after the start request finishes', async () => {
  const app = controller({ pending: false });
  try {
    const data = snapshot({ rank: null, points: 0 });
    data.lastCompletion = null;
    await app.refresh(data);
    await app.click('start-round');
    assert.equal(app.sent.at(-1).action, 'start');
    await app.reply(null, { code: 'NAME_REQUIRED' });
    assert.equal(app.element('name').hidden, false);
    assert.equal(app.element('first-name').disabled, false);
    assert.equal(app.element('name-save').disabled, false);
    assert.equal(app.element('name-save').textContent, 'احفظي وابدئي');
  } finally { app.dispose(); }
});

test('authenticated entry asks for a missing name immediately without starting or awarding', async () => {
  const app = controller({ pending: false });
  try {
    const data = snapshot({ rank: null, points: 0 });
    data.player = { ...data.player, alias: null, needsName: true };
    data.lastCompletion = null;
    await app.refresh(data);
    assert.equal(app.element('name').hidden, false);
    assert.deepEqual(app.sent.filter(item => item.type === 'clinime:care-request').map(item => item.action), ['get']);
  } finally { app.dispose(); }
});

test('rank summary remains authoritative outside the named top page and hides generic legacy rows', async () => {
  const app = controller({ pending: false });
  try {
    const data = snapshot({ rank: 72, points: 100 });
    data.player.totalCompetitors = 102;
    data.leaderboard = { total: 102, visibleTotal: 90, rows: [{ alias: 'خالد', rank: 2, points: 500, isYou: false }, { alias: 'مشاركة', rank: 1, points: 600 }, { alias: null, rank: 3, points: 400 }] };
    await app.refresh(data);
    assert.match(app.element('ranking-status').innerHTML, /أنت في المركز ٧٢ حاليًا/);
    assert.match(app.element('ranking-status').innerHTML, /١٠٢/);
    assert.doesNotMatch(app.element('ranking-list').innerHTML, />مشاركة<|بانتظار الاسم|مشاركة في التحدّي/);
    assert.match(app.element('ranking-list').innerHTML, /خالد/);
  } finally { app.dispose(); }
});

test('visible ranking silently refreshes every thirty seconds without disabling play', async()=>{
 const app=controller({pending:false});
 try{
  const before=snapshot({points:500,rank:1});before.lastCompletion=null;
  await app.refresh(before);await app.click('open-ranking');
  const count=app.sent.length;
  await app.poll();
  assert.equal(app.sent.length,count+1);assert.equal(app.sent.at(-1).action,'get');
  assert.equal(app.element('start-round').disabled,false);
  assert.equal(app.element('connection-status').textContent,'');
  await app.reply(snapshot({points:500,rank:2}));
  assert.match(app.element('ranking-status').innerHTML,/أنت في المركز ٢ حاليًا/);
  assert.equal(app.element('ranking').hidden,false);
 }finally{app.dispose();}
});

test('silent polling preserves the displayed result on a failed read and stops while hidden or paused',async()=>{
 const app=controller({pending:false});
 try{
  await app.refresh(snapshot({points:500,rank:1}));
  await app.poll();await app.reply(null,{code:'NETWORK_UNCERTAIN'});
  assert.equal(app.element('hub-points').textContent,'٥٠٠');
  assert.equal(app.element('connection-status').textContent,'');
  const count=app.sent.length;app.hidden(true);await app.poll();assert.equal(app.sent.length,count);
  app.hidden(false);app.pause();await app.poll();assert.equal(app.sent.length,count);
 }finally{app.dispose();}
});

test('a silent read cannot overwrite a name edit or interrupt the input',async()=>{
 const app=controller({pending:false});
 try{
  await app.refresh(snapshot({points:500,rank:1}));await app.poll();
  const get=app.sent.at(-1);
  await app.click('hub-name');app.element('first-name').value='ريم';
  assert.equal(app.element('first-name').disabled,false);
  await app.reply(snapshot({points:400,rank:3}));
  assert.equal(app.element('name').hidden,false);
  assert.equal(app.element('first-name').value,'ريم');
  assert.equal(app.element('hub-points').textContent,'٥٠٠');
  assert.equal(get.action,'get');
 }finally{app.dispose();}
});
