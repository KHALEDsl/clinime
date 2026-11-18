import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createLoopy, normalizeLoopyConfig, LOOPY_CAMPAIGN_ID } from '../server/loopy.mjs';

// All provider traffic is fake. These tests never call a live Loopy endpoint.
class MemoryStore {
  records = new Map(); n = 0;
  async getWithMetadata(key) { return structuredClone(this.records.get(key) || null); }
  async setJSON(key, data, condition) {
    const current = this.records.get(key);
    if (condition.onlyIfNew && current || condition.onlyIfMatch && current?.etag !== condition.onlyIfMatch) return { modified: false };
    const etag = String(++this.n); this.records.set(key, structuredClone({ data, etag })); return { modified: true, etag };
  }
}
const USER = { id: 'account-sara', email: 'sara@example.invalid', name: 'سارة' };
const OTHER = { id: 'account-nora', email: 'nora@example.invalid', name: 'نورة' };
const CONFIG = { apiKey: 'fake-api-key', apiSecret: 'fake-signing-secret', username: 'fake-user' };
const OFFER = {
  id: LOOPY_CAMPAIGN_ID, description: 'بطاقة كلينيمي', disableTerms: false, consentEnabled: false, uniqueEmailFieldName: '',
  business: { name: 'clinime', website: 'https://clinime.online', email: 'private-business@example.invalid' },
  fieldsToCollect: [{ name: 'الاسم', type: 'text', required: true }, { name: 'البريد الإلكتروني', type: 'email', required: true }],
  terms: 'ختم واحد بعد زيارة شخصية مكتملة ومدفوعة. خمس زيارات تمنحك جلسة تنظيف البشرة الأساسي مجانًا لنفسك أو للإهداء.',
  rewards: [{ rewardName: 'عناية بشرة مجانية', rewardText: 'بعد الزيارة الخامسة، لكِ جلسة تنظيف البشرة الأساسي مجانًا. احجزيها لنفسك أو أهديها.', stampsRequired: 5 }],
};
const card = (id = 'sara-private-card', address = USER.email) => ({ id, campaignId: LOOPY_CAMPAIGN_ID, customerDetails: { 'البريد الإلكتروني': address, 'الاسم': 'اسم خاص' }, status: 'installed' });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
function setup(options = {}) {
  const store = options.store || new MemoryStore(), calls = []; let time = Date.parse('2026-11-04T12:00:00Z');
  const fetchImpl = async (url, init) => {
    const body = init.body ? JSON.parse(init.body) : undefined, call = { url, init, body }; calls.push(call);
    if (url.includes('/campaign/public/')) return json(options.offer || OFFER);
    if (url.endsWith(`/card/cid/${LOOPY_CAMPAIGN_ID}?count=false`)) return options.lookup ? options.lookup(call, store) : json({ recordsFiltered: '0', data: [] });
    if (init.method === 'GET' && url.startsWith('https://api.loopyloyalty.com/card/')) return options.getCard ? options.getCard(call, store) : json({ card: { ...card(), passStatus: 'installed' } });
    if (url.includes('/enrol/')) return options.enrol ? options.enrol(call, store) : json({ pid: 'sara-private-card', url: 'https://q.passkit.net/p-sara-private-card' });
    return options.write ? options.write(call, store) : json({ success: true });
  };
  const service = createLoopy({ store, config: CONFIG, fetchImpl, now: () => time, timeoutMs: 25, ...options.service });
  const input = async patch => ({ requestId: randomUUID(), name: USER.name, acceptTerms: true, campaignVersion: (await service.campaign()).version, ...patch });
  const enrol = async patch => service.submit(USER, await input(patch));
  const writes = () => calls.filter(c => c.init.method !== 'GET' && !c.url.includes('/campaign/public/') && !c.url.endsWith(`/card/cid/${LOOPY_CAMPAIGN_ID}?count=false`));
  return { service, store, calls, input, enrol, fetchImpl, writes, advance: n => { time += n; } };
}

test('normalizes server environment, disables missing credentials and never exposes keys in public views', async () => {
  assert.deepEqual(normalizeLoopyConfig({ LOOPY_API_KEY: 'key', LOOPY_API_SECRET: 'secret', LOOPY_USERNAME: 'name' }), { apiKey: 'key', apiSecret: 'secret', username: 'name', campaignId: LOOPY_CAMPAIGN_ID, verifiedBindings: {} });
  const f = setup({ service: { config: {} } });
  assert.equal(f.service.configured, false);
  assert.deepEqual(await f.service.read(USER), { status: 'none', configured: false });
  await assert.rejects(f.service.submit(USER, await f.input()), { code: 'LOOPY_NOT_CONFIGURED' });
  assert.equal(f.writes().length, 0);
  const offer = await f.service.campaign(); assert.equal(offer.business.email, undefined); assert.equal(offer.uniqueEmailFieldName, undefined);
});

test('authenticates read-only lookup with the documented raw HS256 JWT and exact claims', async () => {
  const f = setup({ lookup: call => {
    const value = call.init.headers.Authorization; assert.ok(!value.startsWith('Bearer'));
    const [h, p, signature] = value.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'HS256', typ: 'JWT' });
    assert.equal(signature, createHmac('sha256', CONFIG.apiSecret).update(`${h}.${p}`).digest('base64url'));
    const claims = JSON.parse(Buffer.from(p, 'base64url'));
    assert.deepEqual(claims, { uid: CONFIG.apiKey, pid: CONFIG.apiKey, username: CONFIG.username, iat: 1793793600, exp: 1793793660 });
    assert.equal(call.url, `https://api.loopyloyalty.com/card/cid/${LOOPY_CAMPAIGN_ID}?count=false`);
    assert.deepEqual(call.body, { dt: { draw: 1, start: 0, length: 100, search: USER.email, order: { column: 'created', dir: 'desc' } } }); assert.equal(call.init.redirect, 'error');
    return json({ recordsFiltered: '1', data: [card()] });
  } });
  const linked = await f.service.lookup(USER);
  assert.equal(linked.enrollment.url, 'https://q.passkit.net/p-sara-private-card');
  assert.equal(f.writes().length, 0); assert.equal(linked.enrollment.pid, undefined);
});

test('lookup pages wildcard results and only adopts exact verified email, never another customer field', async () => {
  const wildcard = Array.from({ length: 100 }, (_, i) => ({ ...card(`other-${i}`, `other-${i}@example.invalid`), customerDetails: { 'البريد الإلكتروني': `other-${i}@example.invalid`, note: USER.email } }));
  const f = setup({ lookup: ({ body }) => body.dt.start === 0 ? json({ recordsFiltered: '101', data: wildcard }) : json({ recordsFiltered: '101', data: [card('exact-card', 'SARA@EXAMPLE.INVALID')] }) });
  const result = await f.service.lookup(USER); assert.equal(result.enrollment.url, 'https://q.passkit.net/p-exact-card');
  assert.equal(f.calls.filter(c => c.body?.dt).length, 2); assert.equal(f.writes().length, 0);
});

test('duplicates, incomplete pagination and cross-campaign hits fail closed without issuing or delivering', async () => {
  for (const response of [{ recordsFiltered: '2', data: [card('one'), card('two')] }, { recordsFiltered: '1', data: [] }, { recordsFiltered: '1', data: [{ ...card(), campaignId: 'other-campaign' }] }, { recordsFiltered: '0', data: [card()] }, { recordsFiltered: '1', data: [{ ...card(), status: 'invalidated' }] }]) {
    const f = setup({ lookup: () => json(response) });
    await assert.rejects(f.service.lookup(USER)); assert.equal(f.writes().length, 0);
  }
});

test('enrollment links existing verified-email card, ignores attacker email and emits no enrolment', async () => {
  const f = setup({ lookup: () => json({ recordsFiltered: '1', data: [card()] }) });
  const result = await f.enrol({ email: OTHER.email }); assert.equal(result.enrollment.status, 'issued'); assert.equal(f.writes().length, 0);
  assert.equal(JSON.stringify(result).includes('اسم خاص'), false);
});

test('explicit current terms are required, and unknown campaign fields or rewards block enrolment', async () => {
  const f = setup();
  await assert.rejects(f.service.submit(null, {}), { code: 'AUTH_REQUIRED' });
  await assert.rejects(f.enrol({ acceptTerms: false }), { code: 'LOOPY_TERMS_REQUIRED' });
  await assert.rejects(f.enrol({ campaignVersion: 'stale' }), { code: 'LOOPY_CAMPAIGN_CHANGED' });
  for (const offer of [{ ...OFFER, consentEnabled: true }, { ...OFFER, fieldsToCollect: [...OFFER.fieldsToCollect, { name: 'booking', type: 'text' }] }, { ...OFFER, rewards: [{ ...OFFER.rewards[0], stampsRequired: 6 }] }]) {
    await assert.rejects(setup({ offer }).service.campaign());
  }
  assert.equal(f.writes().length, 0);
});

test('new enrollment persists an acknowledged intent before public POST and requests no consent opt-in', async () => {
  const f = setup({ enrol: (call, store) => {
    const record = [...store.records.values()][0].data;
    assert.equal(record.enrollment.status, 'pending'); assert.equal(record.enrollment.phase, 'enrol');
    assert.equal(call.init.headers.Authorization, undefined);
    assert.deepEqual(call.body, { campaignId: LOOPY_CAMPAIGN_ID, customerData: { 'الاسم': USER.name, 'البريد الإلكتروني': USER.email }, dataConsentOptIn: false });
    return json({ pid: 'one-private-card', url: 'https://loyalty.is/PrivateOne' });
  } });
  assert.equal((await f.enrol()).enrollment.status, 'issued');
  assert.equal((await f.enrol()).enrollment.status, 'issued'); assert.equal(f.writes().length, 1);
  assert.ok(![...f.store.records.keys()][0].includes(USER.email));
});

test('two service instances and concurrent request IDs cannot issue a second card', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const f = setup({ enrol: async () => { await gate; return json({ pid: 'one-card', url: 'https://q.passkit.net/p-one-card' }); }, service: { timeoutMs: 500 } });
  const second = createLoopy({ store: f.store, config: CONFIG, fetchImpl: f.fetchImpl, now: () => Date.parse('2026-11-04T12:00:00Z') });
  const input = await f.input(); const first = f.service.submit(USER, input);
  while (!f.writes().length) await new Promise(r => setImmediate(r));
  assert.equal((await second.submit(USER, { ...input, requestId: randomUUID() })).enrollment.status, 'pending');
  release(); assert.equal((await first).enrollment.status, 'issued'); assert.equal(f.writes().length, 1);
});

test('lost enrollment receipt, body timeout, invalid URL and 500 never permit a new issuance', async () => {
  for (const enrol of [async () => { throw Error('connection lost'); }, async () => new Promise(() => {}), async () => json({ pid: 'pid', url: 'https://evil.invalid/card' }), async () => json({}, 500), async () => ({ ok: true, status: 200, json: async () => new Promise(() => {}) })]) {
    const f = setup({ enrol });
    assert.equal((await f.enrol()).enrollment.status, 'unknown');
    assert.equal((await f.enrol()).enrollment.status, 'unknown');
    assert.equal(f.writes().length, 1);
  }
});

test('read-only reconciliation can adopt a completed uncertain issuance, but absence never reissues', async () => {
  let found = false;
  const f = setup({ enrol: () => { throw Error('lost'); }, lookup: () => json({ recordsFiltered: found ? '1' : '0', data: found ? [card()] : [] }) });
  await f.enrol(); assert.equal((await f.service.reconcile(USER)).enrollment.status, 'unknown'); assert.equal(f.writes().length, 1);
  found = true; assert.equal((await f.service.reconcile(USER)).enrollment.status, 'issued'); assert.equal(f.writes().length, 1);
});

test('failed durable claim prevents enrollment and a lost final acknowledgement never resends', async () => {
  const f = setup(); const original = f.store.setJSON.bind(f.store); f.store.setJSON = async () => { throw Error('storage failed'); };
  await assert.rejects(f.enrol()); assert.equal(f.writes().length, 0);
  f.store.setJSON = original;
  const g = setup({ enrol: (_call, store) => {
    store.setJSON = async () => { throw Error('receipt storage failed'); };
    return json({ pid: 'private', url: 'https://q.passkit.net/p-private' });
  } });
  await assert.rejects(g.enrol()); assert.equal(g.writes().length, 1);
  g.advance(60_000); assert.equal((await g.enrol()).enrollment.status, 'unknown'); assert.equal(g.writes().length, 1);
});

test('booking delivery uses only individual message endpoint, durable intent, and no stamp mutation', async () => {
  const f = setup({ write: (call, store) => {
    const intents = [...store.records.values()][0].data.intents; assert.equal(Object.values(intents)[0].status, 'pending');
    assert.ok(call.url.endsWith('/card/push')); assert.deepEqual(call.body, { cardID: 'sara-private-card', message: 'موعدك 10 نوفمبر 10:00 — تنظيف البشرة الأساسي' });
    return json({ success: true });
  } });
  await f.enrol(); const event = { id: 'booking:confirmed:one:1', kind: 'booking-message', message: 'موعدك 10 نوفمبر 10:00 — تنظيف البشرة الأساسي' };
  assert.equal((await f.service.deliver(USER, event)).status, 'delivered');
  assert.equal((await f.service.deliver(USER, event)).status, 'delivered'); assert.equal(f.writes().length, 2);
  await assert.rejects(f.service.deliver(USER, { ...event, message: 'different' }), { code: 'LOOPY_EVENT_CONFLICT' });
});

test('no linked card means no automatic enrollment or provider write from booking delivery', async () => {
  const f = setup(); assert.deepEqual(await f.service.deliver(USER, { id: 'booking:1', kind: 'booking-message', message: 'موعد مؤكد' }), { status: 'blocked', reason: 'LOOPY_CARD_REQUIRED' });
  assert.equal(f.writes().length, 0); assert.equal(f.calls.length, 1);
});

test('stamp delivery is idempotent for a frozen visit ID and uses the documented increment once', async () => {
  const f = setup(); await f.enrol();
  const event = { id: 'visit:paid:one', kind: 'stamp', stamps: 1 };
  assert.equal((await f.service.deliver(USER, event)).status, 'delivered');
  assert.equal((await f.service.deliver(USER, event)).status, 'delivered');
  assert.equal(f.writes().filter(c => c.url.includes('addStamps')).length, 1);
  assert.equal(f.writes().at(-1).body, undefined);
  assert.equal(f.writes().at(-1).url, 'https://api.loopyloyalty.com/card/cid/sara-private-card/addStamps/1');
  await assert.rejects(f.service.deliver(USER, { ...event, id: 'bad', stamps: 2 }), { code: 'INVALID_LOOPY_EVENT' });
});

test('uncertain stamp cannot replay and blocks subsequent mutation until explicit reconciliation', async () => {
  const f = setup({ write: async () => new Promise(() => {}) }); await f.enrol();
  const event = { id: 'visit:paid:one', kind: 'stamp', stamps: 1 };
  assert.equal((await f.service.deliver(USER, event)).status, 'unknown');
  assert.equal((await f.service.deliver(USER, event)).status, 'unknown');
  assert.equal((await f.service.deliver(USER, { ...event, id: 'visit:paid:two' })).status, 'blocked');
  assert.equal((await f.service.deliver(USER, { id: 'booking:1', kind: 'booking-message', message: 'موعد مؤكد' })).status, 'blocked');
  assert.equal(f.writes().length, 2);
});

test('unknown or rejected message intents never block financial delivery and cannot repeat their push', async () => {
  for (const status of [500, 400]) {
    const f = setup({ write: call => call.url.endsWith('/card/push') ? json({}, status) : json({ success: true }) }); await f.enrol();
    const message = { id: 'notification:one', kind: 'booking-message', message: 'Update' };
    const expected = status === 500 ? 'unknown' : 'rejected';
    assert.equal((await f.service.deliver(USER, message)).status, expected);
    for (const event of [{ id: 'visit:one', kind: 'stamp', stamps: 1 }, { id: 'reward:one', kind: 'redeem', rewardType: 1, rewards: 1 }]) {
      assert.equal((await f.service.deliver(USER, event)).status, 'delivered');
      assert.equal((await f.service.deliver(USER, event)).status, 'delivered');
    }
    assert.equal((await f.service.deliver(USER, message)).status, expected);
    assert.equal(f.calls.filter(call => call.url.endsWith('/card/push')).length, 1);
    assert.equal(f.calls.filter(call => call.url.includes('/addStamps/')).length, 1);
    assert.equal(f.calls.filter(call => call.url.includes('/redeemReward/')).length, 1);
  }
});

test('a lost message receipt retains its pending intent without replay while financial events proceed', async () => {
  const f = setup(); await f.enrol(); const original = f.store.setJSON.bind(f.store);
  f.store.setJSON = async (key, data, condition) => {
    if (Object.values(data.intents || {}).some(intent => intent.kind === 'booking-message' && intent.status === 'delivered')) throw Error('lost message receipt persistence');
    return original(key, data, condition);
  };
  const message = { id: 'notification:pending', kind: 'booking-message', message: 'Update' };
  await assert.rejects(f.service.deliver(USER, message)); f.store.setJSON = original;
  assert.equal((await f.service.deliver(USER, message)).status, 'pending');
  assert.deepEqual(await f.service.deliver(USER, { ...message, id: 'notification:later' }), { status: 'blocked', reason: 'LOOPY_PREVIOUS_UNCONFIRMED' });
  for (const event of [{ id: 'visit:after-message', kind: 'stamp', stamps: 1 }, { id: 'reward:after-message', kind: 'redeem', rewardType: 1, rewards: 1 }]) {
    assert.equal((await f.service.deliver(USER, event)).status, 'delivered');
    assert.equal((await f.service.deliver(USER, event)).status, 'delivered');
  }
  f.advance(60000); assert.equal((await f.service.deliver(USER, message)).status, 'unknown');
  const intents = Object.values([...f.store.records.values()][0].data.intents);
  assert.equal(intents.find(intent => intent.kind === 'booking-message').status, 'pending');
  assert.equal(f.calls.filter(call => call.url.endsWith('/card/push')).length, 1);
  assert.equal(f.calls.filter(call => call.url.includes('/addStamps/')).length, 1);
  assert.equal(f.calls.filter(call => call.url.includes('/redeemReward/')).length, 1);
});

test('a financial intent pending after a lost receipt continues fencing all new writes', async () => {
  for (const event of [{ id: 'visit:pending', kind: 'stamp', stamps: 1 }, { id: 'reward:pending', kind: 'redeem', rewardType: 1, rewards: 1 }]) {
    const f = setup(); await f.enrol(); const original = f.store.setJSON.bind(f.store);
    f.store.setJSON = async (key, data, condition) => {
      if (Object.values(data.intents || {}).some(intent => intent.status === 'delivered')) throw Error('lost financial receipt persistence');
      return original(key, data, condition);
    };
    await assert.rejects(f.service.deliver(USER, event)); f.store.setJSON = original;
    for (const later of [{ id: 'visit:later', kind: 'stamp', stamps: 1 }, { id: 'reward:later', kind: 'redeem', rewardType: 1, rewards: 1 }, { id: 'notification:later', kind: 'booking-message', message: 'Update' }]) {
      assert.deepEqual(await f.service.deliver(USER, later), { status: 'blocked', reason: 'LOOPY_PREVIOUS_UNCONFIRMED' });
    }
    f.advance(60000); assert.equal((await f.service.deliver(USER, event)).status, 'unknown');
    assert.equal(f.writes().length, 2);
  }
});

test('redeems exactly one first reward, replays receipt safely and rejects zero-based reward index', async () => {
  const f = setup(); await f.enrol(); const event = { id: 'reward:used:1', kind: 'redeem', rewardType: 1, rewards: 1 };
  assert.equal((await f.service.deliver(USER, event)).status, 'delivered');
  assert.equal((await f.service.deliver(USER, event)).status, 'delivered');
  assert.ok(f.writes().at(-1).url.endsWith('/redeemReward/1/1'));
  assert.equal(f.writes().at(-1).body, undefined);
  assert.equal(f.writes().at(-1).url, 'https://api.loopyloyalty.com/card/cid/sara-private-card/redeemReward/1/1');
  await assert.rejects(f.service.deliver(USER, { ...event, id: 'bad', rewardType: 0 }), { code: 'INVALID_LOOPY_EVENT' });
});

test('recipient isolation: another account cannot read or mutate the linked card', async () => {
  const f = setup(); await f.enrol();
  assert.equal((await f.service.read(OTHER)).status, 'none');
  assert.equal((await f.service.deliver(OTHER, { id: 'visit:one', kind: 'stamp', stamps: 1 })).status, 'blocked');
  assert.equal(f.writes().length, 1);
  await assert.rejects(f.service.read({ ...USER, id: 'attacker-id' }), { code: 'LOOPY_IDENTITY_CONFLICT' });
});

test('provider access rejection is reported truthfully without a fake successful delivery', async () => {
  const f = setup({ write: () => json({}, 403) }); await f.enrol();
  const result = await f.service.deliver(USER, { id: 'visit:one', kind: 'stamp', stamps: 1 });
  assert.deepEqual(result, { status: 'rejected', reason: 'LOOPY_ACCESS_DENIED' });
  assert.equal((await f.service.deliver(USER, { id: 'visit:one', kind: 'stamp', stamps: 1 })).status, 'rejected');
  assert.equal(f.writes().length, 2);
});

test('concurrent deliveries serialize before provider mutation and a saved pending intent cannot replay', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const f = setup({ write: async () => { await gate; return json({ success: true }); }, service: { timeoutMs: 500 } }); await f.enrol();
  const event = { id: 'visit:one', kind: 'stamp', stamps: 1 }, first = f.service.deliver(USER, event);
  while (f.writes().length < 2) await new Promise(r => setImmediate(r));
  assert.equal((await f.service.deliver(USER, event)).status, 'pending');
  assert.equal((await f.service.deliver(USER, { ...event, id: 'visit:two' })).status, 'blocked');
  release(); assert.equal((await first).status, 'delivered'); assert.equal(f.writes().length, 2);
});

test('delivery can link an existing installed card without terms or new enrollment', async () => {
  const f = setup({ lookup: () => json({ recordsFiltered: '1', data: [card()] }) });
  const result = await f.service.deliver(USER, { id: 'booking:existing:1', kind: 'booking-message', message: 'موعد مؤكد' });
  assert.equal(result.status, 'delivered'); assert.equal(f.writes().length, 1); assert.ok(f.writes()[0].url.endsWith('/card/push'));
  assert.equal((await f.service.read(USER)).status, 'issued');
});

test('lost delivery receipt persistence cannot permit a duplicate after restarting the service', async () => {
  let fail = false;
  const f = setup({ write: () => { fail = true; return json({ success: true }); } }); await f.enrol();
  const original = f.store.setJSON.bind(f.store);
  f.store.setJSON = async (...args) => { if (fail) throw Error('lost persistence'); return original(...args); };
  const event = { id: 'visit:paid:one', kind: 'stamp', stamps: 1 };
  await assert.rejects(f.service.deliver(USER, event)); assert.equal(f.writes().length, 2);
  const second = createLoopy({ store: f.store, config: CONFIG, fetchImpl: f.fetchImpl, now: () => Date.parse('2026-11-04T12:10:00Z'), timeoutMs: 25 });
  assert.equal((await second.deliver(USER, event)).status, 'unknown'); assert.equal(f.writes().length, 2);
});

test('a lost delivery-claim acknowledgement stops before the provider mutation', async () => {
  const f = setup(); await f.enrol(); const original = f.store.setJSON.bind(f.store);
  f.store.setJSON = async (...args) => { const result = await original(...args); return { modified: result.modified }; };
  await assert.rejects(f.service.deliver(USER, { id: 'visit:paid:one', kind: 'stamp', stamps: 1 }), { code: 'STORE_UNAVAILABLE' });
  assert.equal(f.writes().length, 1);
});

test('uncertain redemption serializes financial mutations and cannot be replayed', async () => {
  const f = setup({ write: () => json({}, 500) }); await f.enrol();
  const event = { id: 'reward:used:1', kind: 'redeem', rewardType: 1, rewards: 1 };
  assert.equal((await f.service.deliver(USER, event)).status, 'unknown');
  assert.equal((await f.service.deliver(USER, event)).status, 'unknown');
  assert.equal((await f.service.deliver(USER, { id: 'visit:one', kind: 'stamp', stamps: 1 })).status, 'blocked');
  assert.equal(f.writes().length, 2);
});

test('configured verified binding reconciles an explicitly chosen installed card without issuance or list heuristics', async () => {
  const config = { ...CONFIG, verifiedBindings: { [USER.email]: 'chosen-installed-card' } };
  const f = setup({ service: { config }, getCard: call => {
    assert.equal(call.url, 'https://api.loopyloyalty.com/card/chosen-installed-card?includeEvents=false&includeRewards=false');
    assert.equal(call.init.method, 'GET'); assert.ok(call.init.headers.Authorization);
    return json({ card: { ...card('chosen-installed-card'), passStatus: 'installed' } });
  } });
  const result = await f.service.bindExisting(USER);
  assert.equal(result.enrollment.status, 'issued'); assert.equal(result.enrollment.url, 'https://q.passkit.net/p-chosen-installed-card');
  assert.equal(result.enrollment.pid, undefined); assert.equal(f.writes().length, 0);
  assert.equal(f.calls.some(c => c.body?.dt), false);
  assert.equal((await f.service.deliver(USER, { id: 'booking:chosen:1', kind: 'booking-message', message: 'موعد مؤكد' })).status, 'delivered');
  assert.equal(f.writes()[0].body.cardID, 'chosen-installed-card');
});

test('read-only lookup honors only server binding, verifies GET identity and never accepts a requested PID', async () => {
  const f = setup({ service: { config: { ...CONFIG, verifiedBindings: { [USER.email]: 'chosen' } } }, getCard: () => json({ card: { ...card('chosen'), passStatus: 'installed' } }) });
  assert.equal((await f.service.linkExisting(USER, { pid: 'attacker-card' })).enrollment.url, 'https://q.passkit.net/p-chosen');
  assert.equal(f.writes().length, 0);
  for (const override of [{ id: 'not-chosen' }, { campaignId: 'wrong-campaign' }, { customerDetails: { 'البريد الإلكتروني': OTHER.email } }, { passStatus: 'issued', status: 'issued' }, { passStatus: 'invalidated', status: 'invalidated' }, { passStatus: 'installed', status: 'removed' }]) {
    const bad = setup({ service: { config: { ...CONFIG, verifiedBindings: { [USER.email]: 'chosen' } } }, getCard: () => json({ card: { ...card('chosen'), passStatus: 'installed', ...override } }) });
    await assert.rejects(bad.service.bindExisting(USER), { code: 'LOOPY_BINDING_UNVERIFIED' }); assert.equal(bad.writes().length, 0);
  }
});

test('private bindings normalize environment JSON but never permit unconfigured or cross-account binding', async () => {
  const normalized = normalizeLoopyConfig({ ...CONFIG, LOOPY_VERIFIED_BINDINGS_JSON: JSON.stringify({ 'SARA@EXAMPLE.INVALID': 'chosen' }) });
  assert.deepEqual(normalized.verifiedBindings, { [USER.email]: 'chosen' });
  assert.throws(() => normalizeLoopyConfig({ LOOPY_VERIFIED_BINDINGS_JSON: '{bad' }));
  assert.throws(() => normalizeLoopyConfig({ verifiedBindings: { [USER.email]: 'https://evil.invalid' } }));
  const f = setup({ service: { config: normalized } });
  await assert.rejects(f.service.bindExisting(OTHER), { code: 'LOOPY_VERIFIED_BINDING_REQUIRED' }); assert.equal(f.calls.length, 0);
});

test('correct five-stamp reward name is insufficient when the configured reward text changed', async () => {
  const f = setup({ offer: { ...OFFER, rewards: [{ ...OFFER.rewards[0], rewardText: 'A different service' }] } });
  await assert.rejects(f.service.campaign(), { code: 'LOOPY_REWARD_CHANGED' }); assert.equal(f.writes().length, 0);
});

test('expired whole-service deadline prevents lookup fetch and remains retryable before any intent', async () => {
  const f = setup({ service: { deadlineAt: Date.now() - 1 } });
  await assert.rejects(f.service.deliver(USER, { id: 'booking:deadline:1', kind: 'booking-message', message: 'موعد مؤكد' }), { code: 'LOOPY_LOOKUP_UNAVAILABLE' });
  assert.equal(f.calls.length, 0); assert.equal(f.store.records.size, 0);
});

test('one absolute deadline spans lookup pages instead of resetting for each request', async () => {
  const originalNow = Date.now; let wall = 1_000_000; Date.now = () => wall;
  try {
    const f = setup({ service: { deadlineAt: wall + 1000, timeoutMs: 1000 }, lookup: ({ body }) => {
      wall += 600;
      return json({ recordsFiltered: 300, data: Array.from({ length: 100 }, (_, i) => card(`other-${body.dt.start + i}`, `other-${body.dt.start + i}@example.invalid`)) });
    } });
    await assert.rejects(f.service.deliver(USER, { id: 'booking:deadline:pages', kind: 'booking-message', message: 'موعد مؤكد' }), { code: 'LOOPY_LOOKUP_UNAVAILABLE' });
    assert.equal(f.calls.length, 2); assert.equal(f.writes().length, 0); assert.equal(f.store.records.size, 0);
  } finally { Date.now = originalNow; }
});

test('deadline caps a hanging lookup body and aborts it as retryable before mutation', async () => {
  let signal;
  const f = setup({ service: { deadlineAt: Date.now() + 25, timeoutMs: 1000 }, lookup: call => {
    signal = call.init.signal; return { ok: true, status: 200, json: () => new Promise(() => {}) };
  } });
  await assert.rejects(f.service.deliver(USER, { id: 'booking:deadline:body', kind: 'booking-message', message: 'موعد مؤكد' }), { code: 'LOOPY_LOOKUP_UNAVAILABLE' });
  assert.equal(signal.aborted, true); assert.equal(f.writes().length, 0); assert.equal(f.store.records.size, 0);
});

test('verified-binding lookup timeout is retryable while identity mismatch remains distinct', async () => {
  const config = { ...CONFIG, verifiedBindings: { [USER.email]: 'chosen' } };
  const f = setup({ service: { config, timeoutMs: 10 }, getCard: () => new Promise(() => {}) });
  await assert.rejects(f.service.deliver(USER, { id: 'booking:binding:timeout', kind: 'booking-message', message: 'موعد مؤكد' }), { code: 'LOOPY_LOOKUP_UNAVAILABLE' });
  assert.equal(f.writes().length, 0); assert.equal(f.store.records.size, 0);
  const mismatch = setup({ service: { config }, getCard: () => json({ card: card('chosen', OTHER.email) }) });
  await assert.rejects(mismatch.service.deliver(USER, { id: 'booking:binding:mismatch', kind: 'booking-message', message: 'موعد مؤكد' }), { code: 'LOOPY_BINDING_UNVERIFIED' });
});

test('expired financial preflight is retryable and never stores a mutation intent', async () => {
  const f = setup(); await f.enrol();
  const expired = createLoopy({ store: f.store, fetchImpl: f.fetchImpl, config: CONFIG, deadlineAt: Date.now() - 1 });
  await assert.rejects(expired.deliver(USER, { id: 'visit:deadline:preflight', kind: 'stamp', stamps: 1 }), { code: 'LOOPY_CAMPAIGN_UNAVAILABLE' });
  assert.equal(f.writes().length, 1); assert.deepEqual([...f.store.records.values()][0].data.intents, {});
});

test('deadline after durable intent caps a stalled mutation body, preserves receipt reserve and never resends', async () => {
  let signal;const f = setup({ write: call => { signal=call.init.signal;return {ok:true,status:200,json:()=>new Promise(()=>{})}; } });await f.enrol();
  const originalNow=Date.now,base=originalNow();let wall=base;const originalSave=f.store.setJSON.bind(f.store);
  Date.now=()=>wall;
  f.store.setJSON=async(key,data,condition)=>{const result=await originalSave(key,data,condition);if(Object.values(data.intents||{}).some(intent=>intent.status==='pending'))wall=base+2990;return result;};
  try{
    const bounded=createLoopy({store:f.store,fetchImpl:f.fetchImpl,config:CONFIG,deadlineAt:base+5000,timeoutMs:100,writeTimeoutMs:1000});
    const event={id:'visit:deadline:write',kind:'stamp',stamps:1};
    assert.equal((await bounded.deliver(USER,event)).status,'unknown');assert.equal(signal.aborted,true);
    assert.equal((await bounded.deliver(USER,event)).status,'unknown');assert.equal(f.writes().length,2);
    assert.equal(Object.values([...f.store.records.values()][0].data.intents)[0].status,'unknown');
  }finally{Date.now=originalNow;f.store.setJSON=originalSave;}
});

test('delivery operations can acknowledge a response slower than the independent read timeout',async()=>{
  for(const event of [{id:'slow:stamp',kind:'stamp',stamps:1},{id:'slow:redeem',kind:'redeem',rewardType:1,rewards:1},{id:'slow:message',kind:'booking-message',message:'Update'}]){
    const f=setup({service:{timeoutMs:5,writeTimeoutMs:100},write:async()=>{await new Promise(resolve=>setTimeout(resolve,20));return json({success:true});}});await f.enrol();
    assert.equal((await f.service.deliver(USER,event)).status,'delivered');assert.equal((await f.service.deliver(USER,event)).status,'delivered');assert.equal(f.writes().length,2);
  }
  let lookupSignal;const unavailable=setup({service:{timeoutMs:5,writeTimeoutMs:100},lookup:call=>{lookupSignal=call.init.signal;return new Promise(()=>{});}});
  await assert.rejects(unavailable.service.deliver(USER,{id:'read:slow',kind:'stamp',stamps:1}),{code:'LOOPY_LOOKUP_UNAVAILABLE'});
  assert.equal(lookupSignal.aborted,true);assert.equal(unavailable.writes().length,0);assert.equal(unavailable.store.records.size,0);
});

test('insufficient remaining delivery budget defers before intent creation or any provider mutation',async()=>{
  const f=setup();await f.enrol();
  const bounded=createLoopy({store:f.store,fetchImpl:f.fetchImpl,config:CONFIG,timeoutMs:25,writeTimeoutMs:100,deadlineAt:Date.now()+2050});
  for(const event of [{id:'budget:stamp',kind:'stamp',stamps:1},{id:'budget:redeem',kind:'redeem',rewardType:1,rewards:1},{id:'budget:message',kind:'booking-message',message:'Update'}]){
    assert.deepEqual(await bounded.deliver(USER,event),{status:'blocked',reason:'LOOPY_DELIVERY_BUDGET'});
  }
  assert.deepEqual([...f.store.records.values()][0].data.intents,{});assert.equal(f.writes().length,1);
  const event={id:'budget:stamp',kind:'stamp',stamps:1};assert.equal((await f.service.deliver(USER,event)).status,'delivered');assert.equal((await f.service.deliver(USER,event)).status,'delivered');assert.equal(f.writes().length,2);
});

test('an independent mutation timeout still preserves unknown financial intent and its fence',async()=>{
  const f=setup({service:{timeoutMs:5,writeTimeoutMs:15},write:()=>new Promise(()=>{})});await f.enrol();
  const event={id:'write:timeout',kind:'stamp',stamps:1};assert.equal((await f.service.deliver(USER,event)).status,'unknown');assert.equal((await f.service.deliver(USER,event)).status,'unknown');
  assert.deepEqual(await f.service.deliver(USER,{id:'write:later',kind:'redeem',rewardType:1,rewards:1}),{status:'blocked',reason:'LOOPY_PREVIOUS_UNCONFIRMED'});assert.equal(f.writes().length,2);
});

test('delivery pending visibility follows the longer mutation timeout while the same intent cannot replay',async()=>{
  let release,started;const gate=new Promise(resolve=>{release=resolve;});const entered=new Promise(resolve=>{started=resolve;});
  const f=setup({service:{timeoutMs:5,writeTimeoutMs:100},write:async()=>{started();await gate;return json({success:true});}});await f.enrol();const event={id:'write:active',kind:'stamp',stamps:1};
  const active=f.service.deliver(USER,event);await entered;
  try{f.advance(5030);assert.equal((await f.service.deliver(USER,event)).status,'pending');assert.equal(f.writes().length,2);}finally{release();}
  assert.equal((await active).status,'delivered');assert.equal((await f.service.deliver(USER,event)).status,'delivered');assert.equal(f.writes().length,2);
});

const stampReceipt = (marker, patch = {}) => ({ id: 79064493, uuid: 'provider-event-uuid', card_id: 'sara-private-card', username: CONFIG.username, type: 1, quantity: 1, ua: marker, created: '2026-11-04T12:00:02Z', ...patch });

test('an ambiguous stamp adopts exactly its marked provider receipt without repeating the mutation',async()=>{
  let marker;const f=setup({write:(call,store)=>{
    marker=call.init.headers['User-Agent'];const intent=Object.values([...store.records.values()][0].data.intents)[0];
    assert.match(marker,/^clinime-stamp\/[0-9a-f-]{36}$/);assert.equal(intent.providerMarker,marker);assert.equal(intent.status,'pending');
    return json({},500);
  },getCard:call=>{
    assert.equal(call.init.method,'GET');assert.ok(call.init.headers.Authorization);assert.equal(call.url,'https://api.loopyloyalty.com/card/sara-private-card?includeEvents=true');
    return json({card:card(),events:[stampReceipt(marker)]});
  }});await f.enrol();const event={id:'receipt:stamp',kind:'stamp',stamps:1};
  const result=await f.service.deliver(USER,event);assert.equal(result.status,'delivered');assert.equal(result.reconciliationAvailable,undefined);
  assert.equal((await f.service.reconcileDelivery(USER,event)).status,'delivered');assert.equal((await f.service.deliver(USER,event)).status,'delivered');
  assert.equal(f.calls.filter(call=>call.url.includes('/addStamps/')).length,1);assert.equal(f.calls.filter(call=>call.url.includes('includeEvents=true')).length,1);
  const intent=Object.values([...f.store.records.values()][0].data.intents)[0];assert.equal(intent.providerEventId,79064493);assert.equal(intent.reason,undefined);assert.ok(intent.reconciledAt);
  assert.equal(JSON.stringify(result).includes(marker),false);assert.equal(JSON.stringify(result).includes('sara-private-card'),false);assert.equal(JSON.stringify(result).includes('79064493'),false);
});

test('later read-only reconciliation can adopt an exact receipt and release the next financial event',async()=>{
  let marker,available=false;const f=setup({write:call=>{if(call.url.includes('/addStamps/')){marker=call.init.headers['User-Agent'];return json({},500);}return json({success:true});},getCard:()=>json({card:card(),events:available?[stampReceipt(marker)]:[]})});await f.enrol();
  const event={id:'receipt:later',kind:'stamp',stamps:1};const unknown=await f.service.deliver(USER,event);assert.equal(unknown.status,'unknown');assert.equal(unknown.reconciliationAvailable,true);
  assert.deepEqual(await f.service.deliver(USER,{id:'reward:blocked',kind:'redeem',rewardType:1,rewards:1}),{status:'blocked',reason:'LOOPY_PREVIOUS_UNCONFIRMED'});
  available=true;assert.equal((await f.service.reconcileDelivery(USER,event)).status,'delivered');
  assert.equal((await f.service.deliver(USER,{id:'reward:blocked',kind:'redeem',rewardType:1,rewards:1})).status,'delivered');assert.equal(f.calls.filter(call=>call.url.includes('/addStamps/')).length,1);
});

test('stamp reconciliation rejects wrong facts, missing evidence, duplicate markers and invalid card identity',async()=>{
  const cases=[
    {name:'wrong marker',event:{ua:'node'}},{name:'wrong card',event:{card_id:'other-card'}},{name:'wrong username',event:{username:'another-user'}},
    {name:'wrong type',event:{type:2}},{name:'wrong quantity',event:{quantity:2}},{name:'old timestamp',event:{created:'2026-11-04T11:59:58Z'}},
    {name:'invalid timestamp',event:{created:'not-a-date'}},{name:'missing event id',event:{id:null}},{name:'duplicate marker',duplicate:true},{name:'missing events',missing:true},
    {name:'wrong card email',card:{customerDetails:{'البريد الإلكتروني':OTHER.email}}},{name:'wrong campaign',card:{campaignId:'other-campaign'}},{name:'wrong card status',card:{status:'removed'}},
  ];
  for(const fixture of cases){
    let marker;const f=setup({write:call=>{marker=call.init.headers['User-Agent'];return json({},500);},getCard:()=>{
      const entry=stampReceipt(marker,fixture.event);return json({card:{...card(),...fixture.card},...(fixture.missing?{}:{events:fixture.duplicate?[entry,{...entry,id:79064494}]:[entry]})});
    }});await f.enrol();const event={id:`receipt:invalid:${fixture.name}`,kind:'stamp',stamps:1};
    assert.equal((await f.service.deliver(USER,event)).status,'unknown',fixture.name);assert.equal((await f.service.reconcileDelivery(USER,event)).status,'unknown',fixture.name);
    assert.equal(f.calls.filter(call=>call.url.includes('/addStamps/')).length,1,fixture.name);
    assert.deepEqual(await f.service.deliver(USER,{id:'blocked',kind:'stamp',stamps:1}),{status:'blocked',reason:'LOOPY_PREVIOUS_UNCONFIRMED'},fixture.name);
  }
});

test('legacy stamps without a marker and uncertain redemptions never use receipt lookup or replay',async()=>{
  const f=setup({write:()=>json({},500)});await f.enrol();const event={id:'receipt:legacy',kind:'stamp',stamps:1};await f.service.deliver(USER,event);
  const record=[...f.store.records.values()][0].data;delete Object.values(record.intents)[0].providerMarker;const before=f.calls.length;
  for(const result of [await f.service.reconcileDelivery(USER,event),await f.service.deliver(USER,event)]){assert.equal(result.status,'unknown');assert.equal(result.reconciliationAvailable,undefined);}
  assert.equal(f.calls.length,before);assert.equal(f.calls.filter(call=>call.url.includes('/addStamps/')).length,1);
  const g=setup({write:()=>json({},500)});await g.enrol();const redemption={id:'receipt:redeem',kind:'redeem',rewardType:1,rewards:1};await g.service.deliver(USER,redemption);const redemptionBefore=g.calls.length;
  assert.equal((await g.service.reconcileDelivery(USER,redemption)).status,'unknown');assert.equal(g.calls.length,redemptionBefore);assert.equal(g.calls.filter(call=>call.url.includes('/redeemReward/')).length,1);
});

test('reused local markers or provider event ids cannot reconcile another stamp',async()=>{
  for(const reuse of ['marker','event-id']){
    let marker,available=false;const f=setup({write:call=>{marker=call.init.headers['User-Agent'];return json({},500);},getCard:()=>json({card:card(),events:available?[stampReceipt(marker)]:[]})});await f.enrol();const event={id:`receipt:reuse:${reuse}`,kind:'stamp',stamps:1};await f.service.deliver(USER,event);
    const record=[...f.store.records.values()][0].data;record.intents['another-intent']={kind:'stamp',status:'delivered',...(reuse==='marker'?{providerMarker:marker}:{providerEventId:79064493})};available=true;
    assert.equal((await f.service.reconcileDelivery(USER,event)).status,'unknown');assert.equal(f.calls.filter(call=>call.url.includes('/addStamps/')).length,1);
  }
});

test('receipt lookup timeout preserves the stamped intent and never permits another provider write',async()=>{
  let signal;const f=setup({service:{timeoutMs:5,writeTimeoutMs:10},write:()=>json({},500),getCard:call=>{signal=call.init.signal;return new Promise(()=>{});}});await f.enrol();const event={id:'receipt:read-timeout',kind:'stamp',stamps:1};
  assert.equal((await f.service.deliver(USER,event)).status,'unknown');assert.equal(signal.aborted,true);
  assert.equal((await f.service.reconcileDelivery(USER,event)).status,'unknown');assert.equal((await f.service.deliver(USER,event)).status,'unknown');
  assert.equal(f.calls.filter(call=>call.url.includes('/addStamps/')).length,1);assert.equal(Object.values([...f.store.records.values()][0].data.intents)[0].status,'unknown');
});

test('a read-confirmed receipt cannot be downgraded by the original mutation returning late',async()=>{
  let marker,release,started;const gate=new Promise(resolve=>{release=resolve;});const entered=new Promise(resolve=>{started=resolve;});
  const f=setup({service:{writeTimeoutMs:100},write:async call=>{marker=call.init.headers['User-Agent'];started();await gate;return json({},500);},getCard:()=>json({card:card(),events:[stampReceipt(marker)]})});await f.enrol();const event={id:'receipt:race',kind:'stamp',stamps:1};
  const active=f.service.deliver(USER,event);await entered;
  try{assert.equal((await f.service.reconcileDelivery(USER,event)).status,'delivered');}finally{release();}
  assert.equal((await active).status,'delivered');assert.equal(Object.values([...f.store.records.values()][0].data.intents)[0].status,'delivered');assert.equal(f.calls.filter(call=>call.url.includes('/addStamps/')).length,1);
});
