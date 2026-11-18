import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from '../scripts/staff-local-server.mjs';
import { createLoopyEnrollment, LOOPY_CAMPAIGN_ID } from '../scripts/loopy-local-enrollment.mjs';

const USER = { id: 'local-account-sara', email: 'sara@example.invalid', name: 'سارة' };
const OFFER = {
  id: LOOPY_CAMPAIGN_ID, description: 'بطاقة مكافآت كلينيمي', disableTerms: false,
  business: { name: 'clinime', website: 'https://clinime.online', email: 'private-business@example.invalid' },
  design: { backgroundColor: '#FCE8F0', textColor: '#2D3E5B' }, consentEnabled: false,
  fieldsToCollect: [{ name: 'الاسم', type: 'text', required: true }, { name: 'البريد الإلكتروني', type: 'email', required: true }],
  terms: 'تحصلين على ختم بعد إتمام كل زيارة باسمك وسدادها. عند اكتمال خمسة أختام، تستحقين جلسة تنظيف البشرة الأساسي مجانًا. يمكنك حجزها لنفسك أو إهداؤها مرة واحدة عبر «مكافآتي» في كلينيمي إلى بريد المستفيدة. لا يكفي تأكيد الحجز لاكتساب ختم.',
  rewards: [{ rewardName: 'عناية بشرة مجانية', rewardText: 'بعد الزيارة الخامسة، لكِ جلسة تنظيف البشرة الأساسي مجانًا. احجزيها لنفسك أو أهديها.', stampsRequired: 5 }],
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function setup(options = {}) {
  const store = options.store || new MemoryStore();
  const calls = [], saves = [];
  let clock = Date.parse('2026-11-04T12:00:00Z');
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'POST') return options.enrol ? options.enrol(url, init, { store, saves }) : json({ pid: 'private-member-sara', url: 'https://q.passkit.net/p-SaraPrivatePass' });
    return options.get ? options.get(url, init) : json(options.offer || OFFER);
  };
  const persist = async () => {
    if (options.persist) await options.persist(saves.length + 1);
    saves.push({ records: structuredClone([...store.records]), version: store.version });
  };
  const service = createLoopyEnrollment({ store, persist, fetchImpl, now: () => clock, timeoutMs: options.timeoutMs || 1000, cacheMs: options.cacheMs || 300_000 });
  const input = async patch => ({ requestId: randomUUID(), name: 'سارة', acceptTerms: true, campaignVersion: (await service.campaign()).version, ...patch });
  const posts = () => calls.filter(c => c.init.method === 'POST');
  return { service, store, calls, saves, input, posts, fetchImpl, persist, advance: n => { clock += n; } };
}
function restored(snapshot) { const store = new MemoryStore(); store.records = new Map(structuredClone(snapshot.records)); store.version = snapshot.version; return store; }

test('loads real provider terms/reward without exposing business email; concurrent public reads share cache', async () => {
  const f = setup();
  const [a, b] = await Promise.all([f.service.campaign(), f.service.campaign()]);
  assert.deepEqual(a, b); assert.equal(f.calls.length, 1);
  assert.equal(a.terms, OFFER.terms); assert.equal(a.rewards[0].stampsRequired, 5);
  assert.equal(a.rewards[0].rewardName, 'عناية بشرة مجانية'); assert.equal(a.business.email, undefined);
  a.terms = 'changed by client'; assert.equal((await f.service.campaign()).terms, OFFER.terms);
  assert.deepEqual(await f.service.read(USER), { status: 'none' });
});

test('requires authenticated identity, valid name, explicit terms and current campaign version before issuance', async () => {
  const f = setup();
  await assert.rejects(f.service.submit(null, {}), e => e.status === 401);
  for (const acceptTerms of [false, 'true', 1, undefined]) await assert.rejects(f.service.submit(USER, await f.input({ acceptTerms })), e => e.code === 'LOOPY_TERMS_REQUIRED');
  await assert.rejects(f.service.submit(USER, await f.input({ name: '' })), e => e.code === 'INVALID_REQUEST');
  await assert.rejects(f.service.submit(USER, await f.input({ campaignVersion: 'old' })), e => e.code === 'LOOPY_CAMPAIGN_CHANGED');
  assert.equal(f.posts().length, 0); assert.equal(f.saves.length, 0);
});

test('persists pending before POST, uses verified account email and durably stores private receipt', async () => {
  const f = setup({ enrol: (_url, init, { saves }) => {
    assert.equal(saves.length, 1); assert.equal(saves[0].records[0][1].data.status, 'pending');
    assert.deepEqual(JSON.parse(init.body), { campaignId: LOOPY_CAMPAIGN_ID, customerData: { 'الاسم': 'سارة', 'البريد الإلكتروني': USER.email } });
    assert.equal(init.redirect, 'error');
    return json({ pid: 'opaque-private-pid', url: 'https://loyalty.is/privateCard123' });
  } });
  const result = await f.service.submit(USER, await f.input({ email: 'attacker@example.invalid' }));
  assert.equal(result.enrollment.status, 'issued'); assert.equal(result.enrollment.url, 'https://loyalty.is/privateCard123');
  assert.equal(result.enrollment.pid, undefined); assert.equal(f.saves.length, 2);
  const receipt = f.saves[1].records[0][1].data;
  assert.equal(receipt.pid, 'opaque-private-pid'); assert.equal(receipt.email, USER.email); assert.equal(receipt.terms, OFFER.terms);
  assert.ok(!f.saves[1].records[0][0].includes(USER.email));
});

test('concurrent requests across two adapter instances issue at most one external card', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const f = setup({ enrol: async () => { await gate; return json({ pid: 'one-member', url: 'https://q.passkit.net/p-OnlyOneCard' }); } });
  const second = createLoopyEnrollment({ store: f.store, persist: f.persist, fetchImpl: f.fetchImpl, now: () => Date.parse('2026-11-04T12:00:00Z') });
  const one = f.service.submit(USER, await f.input());
  const two = second.submit(USER, { requestId: randomUUID(), name: 'سارة', acceptTerms: true, campaignVersion: (await second.campaign()).version });
  const competing = await two; assert.equal(competing.enrollment.status, 'pending');
  release(); const created = await one;
  assert.equal(created.enrollment.status, 'issued'); assert.equal(f.posts().length, 1);
});

test('successful request replay, different request ID and process restoration reuse same private card', async () => {
  const f = setup(), body = await f.input();
  const created = await f.service.submit(USER, body);
  assert.deepEqual(await f.service.submit(USER, body), created);
  assert.deepEqual(await f.service.submit(USER, await f.input()), created);
  const next = setup({ store: restored(f.saves.at(-1)) });
  assert.deepEqual(await next.service.read(USER), created.enrollment);
  assert.deepEqual(await next.service.submit(USER, body), created);
  assert.equal(next.calls.length, 0); assert.equal(f.posts().length, 1);
});

test('lost provider response remains unknown across refresh, different request IDs and process restoration', async () => {
  const f = setup({ enrol: () => { throw Error('network connection lost after remote write'); } });
  const request = await f.input();
  const uncertain = await f.service.submit(USER, request);
  assert.equal(uncertain.enrollment.status, 'unknown'); assert.equal(uncertain.enrollment.retryAllowed, false);
  assert.deepEqual(await f.service.submit(USER, request), uncertain);
  await f.service.submit(USER, await f.input()); assert.equal(f.posts().length, 1);
  const next = setup({ store: restored(f.saves.at(-1)) });
  assert.equal((await next.service.submit(USER, request)).enrollment.status, 'unknown'); assert.equal(next.posts().length, 0);
});

test('provider POST timeout including stalled response body never retries automatically', async () => {
  for (const enrol of [() => new Promise(() => {}), () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })]) {
    const f = setup({ enrol, timeoutMs: 10 });
    const request = await f.input();
    assert.equal((await f.service.submit(USER, request)).enrollment.status, 'unknown');
    await f.service.submit(USER, request); assert.equal(f.posts().length, 1);
  }
});

test('malformed success receipts, untrusted URLs, redirects and provider server errors are unknown, not safe retries', async () => {
  const receipts = [
    { pid: '', url: 'https://loyalty.is/member' },
    { pid: 'member', url: 'http://loyalty.is/member' },
    { pid: 'member', url: 'https://loyalty.is.evil.invalid/member' },
    { pid: 'member', url: 'https://loyalty.is@evil.invalid/member' },
    { pid: 'member', url: 'https://loyalty.is/member?redirect=https://evil.invalid' },
    { pid: 'member', url: 'https://q.passkit.net/arbitraryPath' },
    { pid: 'member', url: 'https://q.passkit.net/p-member#other' },
    { pid: 'member', url: 'https://app.loopyloyalty.com/unverified-path' },
  ];
  for (const receipt of receipts) {
    const f = setup({ enrol: () => json(receipt) });
    const request = await f.input();
    assert.equal((await f.service.submit(USER, request)).enrollment.status, 'unknown');
    await f.service.submit(USER, request); assert.equal(f.posts().length, 1);
    assert.equal((await f.service.read(USER)).url, undefined);
  }
  for (const response of [new Response('{bad-json', { status: 200 }), new Response('', { status: 302 }), json({}, 500), json({}, 503)]) {
    const f = setup({ enrol: () => response });
    assert.equal((await f.service.submit(USER, await f.input())).enrollment.status, 'unknown');
  }
});

test('definitive 400 rejection can be corrected with fresh request but repeated original request is not resubmitted', async () => {
  let attempt = 0;
  const f = setup({ enrol: () => ++attempt === 1 ? json({ error: 'invalid name' }, 400) : json({ pid: 'fixed', url: 'https://loyalty.is/fixedCard' }) });
  const first = await f.input();
  assert.equal((await f.service.submit(USER, first)).enrollment.errorCode, 'LOOPY_ENROLLMENT_REJECTED');
  assert.equal((await f.service.submit(USER, first)).enrollment.status, 'none'); assert.equal(f.posts().length, 1);
  assert.equal((await f.service.submit(USER, await f.input({ name: 'سارة النافع' }))).enrollment.status, 'issued'); assert.equal(f.posts().length, 2);
});

test('failure to persist claim prevents any external POST', async () => {
  const f = setup({ persist: () => { throw Error('disk unavailable'); } });
  await assert.rejects(f.service.submit(USER, await f.input()), e => e.code === 'LOOPY_STORE_UNAVAILABLE');
  assert.equal(f.posts().length, 0);
  assert.equal((await f.service.read(USER)).status, 'pending');
  await f.service.submit(USER, await f.input()); assert.equal(f.posts().length, 0);
});

test('receipt persistence failure and crash after durable claim cannot issue a duplicate', async () => {
  const f = setup({ persist: nth => { if (nth === 2) throw Error('lost disk'); } });
  const request = await f.input();
  await assert.rejects(f.service.submit(USER, request), e => e.code === 'LOOPY_RECEIPT_UNSAVED');
  assert.equal((await f.service.submit(USER, request)).enrollment.status, 'issued'); assert.equal(f.posts().length, 1);
  // Disk contains only the pending claim after this crash. Neither a retry nor
  // passing time establishes that the external card was not created.
  const next = setup({ store: restored(f.saves[0]) });
  next.advance(61_000);
  assert.equal((await next.service.read(USER)).status, 'unknown');
  assert.equal((await next.service.submit(USER, request)).enrollment.status, 'unknown'); assert.equal(next.posts().length, 0);
});

test('private issued receipt is isolated by authenticated account ID', async () => {
  const f = setup(); await f.service.submit(USER, await f.input());
  assert.deepEqual(await f.service.read({ id: 'different-user', email: 'reem@example.invalid' }), { status: 'none' });
  assert.ok(!JSON.stringify(await f.service.campaign()).includes('private-member-sara'));
});

test('campaign retrieval/config errors prevent external writes rather than dropping new fields or opting into marketing', async () => {
  for (const offer of [{ ...OFFER, consentEnabled: true }, { ...OFFER, fieldsToCollect: [...OFFER.fieldsToCollect, { name: 'phone', type: 'text', required: true }] }, { ...OFFER, id: 'different-campaign' }]) {
    const f = setup({ offer });
    await assert.rejects(f.service.campaign()); assert.equal(f.posts().length, 0);
  }
  const failed = setup({ get: () => json({}, 503) });
  await assert.rejects(failed.service.campaign(), e => e.code === 'LOOPY_CAMPAIGN_UNAVAILABLE');
  assert.equal(failed.posts().length, 0);
});

test('submission revalidates terms immediately rather than accepting cached campaign text', async () => {
  let offer = structuredClone(OFFER);
  const f = setup({ get: () => json(offer) });
  const request = await f.input();
  offer.terms = 'شروط جديدة منشورة بعد عرض النموذج.';
  await assert.rejects(f.service.submit(USER, request), e => e.status === 409 && e.code === 'LOOPY_CAMPAIGN_CHANGED');
  assert.equal(f.posts().length, 0); assert.equal(f.saves.length, 0);
  assert.equal((await f.service.campaign()).terms, offer.terms);
});

test('submission blocks newly required provider fields even inside the display cache lifetime', async () => {
  let offer = structuredClone(OFFER);
  const f = setup({ get: () => json(offer) });
  const request = await f.input();
  offer.fieldsToCollect.push({ name: 'new required field', type: 'text', required: true });
  await assert.rejects(f.service.submit(USER, request), e => e.code === 'LOOPY_FORM_CHANGED');
  assert.equal(f.posts().length, 0); assert.equal(f.saves.length, 0);
});

test('fresh submit validation does not join a prior in-flight display GET with old terms', async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  let reads = 0;
  const revised = { ...OFFER, terms: 'الشروط الجديدة بعد بدء التحميل الأول.' };
  const f = setup({ get: async () => ++reads === 1 ? (await waiting, json(OFFER)) : json(revised) });
  const display = f.service.campaign();
  // Compute the original version through an independent all-fake adapter; the
  // real page might retain that version from an earlier opened tab.
  const oldVersion = (await setup().service.campaign()).version;
  const submit = f.service.submit(USER, { requestId: randomUUID(), name: 'سارة', acceptTerms: true, campaignVersion: oldVersion });
  release(); await display;
  await assert.rejects(submit, e => e.code === 'LOOPY_CAMPAIGN_CHANGED');
  assert.equal(reads, 2); assert.equal(f.posts().length, 0);
});
