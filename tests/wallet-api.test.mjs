import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAPI, normalizeEnv } from '../server/api.mjs';
import { hash, mac, token, update, read } from '../server/core.mjs';
import { LOOPY_CAMPAIGN_ID } from '../server/loopy.mjs';

class Store {
  records = new Map(); version = 0;
  async getWithMetadata(key) { return structuredClone(this.records.get(key) || null); }
  async setJSON(key, data, options = {}) {
    const current = this.records.get(key);
    if ((options.onlyIfNew && current) || (options.onlyIfMatch && current?.etag !== options.onlyIfMatch)) return { modified: false };
    const etag = String(++this.version);
    this.records.set(key, { data: structuredClone(data), etag, metadata: {} });
    return { modified: true, etag };
  }
}
const OFFER = {
  id: LOOPY_CAMPAIGN_ID, description: 'بطاقة كلينيمي', disableTerms: false, terms: 'شروط البطاقة الحالية', consentEnabled: false,
  business: { name: 'clinime', email: 'private-business@example.com' },
  fieldsToCollect: [{ name: 'الاسم', type: 'text', required: true }, { name: 'البريد الإلكتروني', type: 'email', required: true }],
  rewards: [{ rewardName: 'عناية بشرة مجانية', rewardText: 'بعد الزيارة الخامسة، لكِ جلسة تنظيف البشرة الأساسي مجانًا. احجزيها لنفسك أو أهديها.', stampsRequired: 5 }],
};
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const save = (store, key, data) => update(store, key, () => ({ value: data, result: true }));
function setup(options = {}) {
  const store = new Store(), calls = []; let time = Date.parse('2026-11-04T08:00:00Z');
  const env = { APP_SECRET: 'wallet-test-secret-at-least-thirty-two-characters', PUBLIC_ORIGIN: 'https://clinic.example', RESEND_API_KEY: 'private-mail-key', EMAIL_FROM: 'clinic@example.com', CLINIME_WALLET_ENABLED: 'true', LOOPY_API_KEY: 'private-loopy-key', LOOPY_API_SECRET: 'private-loopy-secret', LOOPY_USERNAME: 'private-loopy-user', CLINIC_SCHEDULE_JSON: JSON.stringify({ timeZone: 'Asia/Riyadh', weekdays: [0,1,2,3,4,5,6], open: '10:00', close: '18:00', stepMinutes: 30, horizonDays: 60 }), ...options.env };
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (options.fetch) return options.fetch(url, init);
    if (url.includes('/campaign/public/')) return response(OFFER);
    if (url.includes('/card/cid/')) return response({ recordsFiltered: 0, data: [] });
    if (url.includes('/enrol/')) return response({ pid: 'private-member', url: 'https://loyalty.is/privateReceipt' });
    throw Error('Unexpected provider request');
  };
  const api = createAPI({ store, env, now: () => time, loopyFetch: fetchImpl, mail: { send: async () => ({ status: 'sent' }) } });
  async function account(email = 'sara@example.com') {
    const user = { id: mac(env.APP_SECRET, 'user:' + email), email, name: 'سارة', preferences: { email: true }, favorite: false };
    const raw = token(), id = hash(randomUUID());
    await save(store, 'user/' + user.id, user);
    await save(store, 'auth/' + id, { email, session: { hash: mac(env.APP_SECRET, 'session:' + raw), expiresAt: time + 86400000, revoked: false } });
    return { user, cookie: `__Host-clinime-session=${id}.${raw}`, csrfToken: mac(env.APP_SECRET, 'csrf:' + raw) };
  }
  async function request(path, { method = 'GET', data, active, origin = env.PUBLIC_ORIGIN, csrf, rawBody } = {}) {
    const headers = {};
    if (method !== 'GET') { headers.origin = origin; headers['content-type'] = 'application/json'; }
    if (active) { headers.cookie = active.cookie; headers['x-csrf-token'] = csrf ?? active.csrfToken; }
    const result = await api(new Request(env.PUBLIC_ORIGIN + '/api' + path, { method, headers, ...(rawBody !== undefined ? { body: rawBody } : data !== undefined ? { body: JSON.stringify(data) } : {}) }), { ip: '192.0.2.19' });
    return { status: result.status, data: await result.json() };
  }
  return { env, store, calls, request, account, advance: ms => time += ms };
}
const enrollmentKey = user => `loopy/v1/${LOOPY_CAMPAIGN_ID}/${hash(user.email)}`;
const enrollInput = version => ({ requestId: randomUUID(), name: 'سارة', acceptTerms: true, campaignVersion: version });

test('wallet feature requires explicit flag, all server credentials and base configuration; no provider calls while disabled', async () => {
  for (const env of [{ CLINIME_WALLET_ENABLED: 'false' }, { CLINIME_WALLET_ENABLED: undefined }, { LOOPY_API_SECRET: '' }, { LOOPY_USERNAME: '' }]) {
    const s = setup({ env }), active = await s.account();
    assert.equal(normalizeEnv(s.env).walletEnabled, false);
    assert.equal((await s.request('/config')).data.walletEnrollment, undefined);
    assert.equal((await s.request('/wallet/campaign', { active })).status, 503);
    assert.equal((await s.request('/wallet/enroll', { method: 'POST', active, data: enrollInput('old') })).status, 503);
    assert.equal(s.calls.length, 0); assert.equal(await read(s.store, 'clinic/booking-ledger-v1'), null);
  }
  const off = setup({ env: { APP_SECRET: '' } });
  assert.deepEqual((await off.request('/config')).data, { emailEnabled: false });
  assert.equal((await off.request('/wallet/campaign')).status, 503);
  assert.equal(off.calls.length, 0); assert.equal(await read(off.store, 'clinic/booking-ledger-v1'), null);
});

test('public config advertises the real five-visit service reward and activates once without historical credit import or secrets', async () => {
  const s = setup();
  await save(s.store, 'clinic/booking-ledger-v1', { schema: 1, bookings: {}, requests: {}, loyalty: { untouched: true } });
  const first = await s.request('/config');
  assert.deepEqual(first.data.walletEnrollment, { kind: 'public-loopy-campaign', url: 'https://loyalty.is/qoq6ip', target: 5, rewardKind: 'complimentary-service', serviceId: 'basic', giftable: true, customEnrollment: true });
  const ledger = await read(s.store, 'clinic/booking-ledger-v1'), etag = s.store.records.get('clinic/booking-ledger-v1').etag;
  assert.equal(ledger.walletIntegration.enabled, true); assert.deepEqual(ledger.loyalty, { untouched: true });
  assert.deepEqual(ledger.walletOutbox?.events || {}, {});
  await s.request('/config'); assert.equal(s.store.records.get('clinic/booking-ledger-v1').etag, etag);
  assert.equal(s.calls.length, 0); assert.ok(!JSON.stringify(first.data).includes('private-')); assert.equal(first.data.walletEnrollment.amount, undefined);
});

test('anonymous, invalid production identity, origin, CSRF and malformed-body requests do not call provider or activate', async () => {
  const s = setup(), active = await s.account(), fixture = await s.account('local@example.invalid');
  assert.equal((await s.request('/wallet/campaign')).status, 401);
  assert.equal((await s.request('/wallet/campaign', { active: fixture })).status, 403);
  assert.equal((await s.request('/wallet/enroll', { method: 'POST', active, origin: 'https://evil.example', data: {} })).status, 403);
  assert.equal((await s.request('/wallet/enroll', { method: 'POST', active, csrf: 'bad', data: {} })).status, 403);
  assert.equal((await s.request('/wallet/enroll', { method: 'POST', active, rawBody: '{broken' })).status, 400);
  assert.equal(s.calls.length, 0); assert.equal(await read(s.store, 'clinic/booking-ledger-v1'), null);
});

test('campaign GET links one exact existing card without enrollment and keeps provider internals private', async () => {
  const s = setup({ fetch: (url, init) => url.includes('/campaign/public/') ? response(OFFER) : response({ recordsFiltered: 1, data: [{ id: 'existing-card', campaignId: LOOPY_CAMPAIGN_ID, status: 'installed', customerDetails: { 'البريد الإلكتروني': 'sara@example.com', other: 'private-customer' } }] }) });
  const active = await s.account(), value = await s.request('/wallet/campaign', { active });
  assert.equal(value.status, 200); assert.equal(value.data.canEnroll, true); assert.equal(value.data.enrollment.status, 'issued');
  assert.equal(value.data.enrollment.url, 'https://q.passkit.net/p-existing-card'); assert.equal(value.data.enrollment.pid, undefined);
  assert.equal(value.data.campaign.business.email, undefined); assert.ok(!JSON.stringify(value.data).includes('private-'));
  assert.equal(s.calls.some(c => c.url.includes('/enrol/')), false);
  const count = s.calls.length; await s.request('/wallet/campaign', { active }); assert.equal(s.calls.length, count);
  assert.equal((await read(s.store, enrollmentKey(active.user))).enrollment.pid, 'existing-card');
});

test('lookup errors return safe truthful 503; an existing issued receipt remains available when public campaign fails', async () => {
  const s = setup({ fetch: () => response({ message: 'raw-private-provider-error' }, 403) }), active = await s.account();
  const failed = await s.request('/wallet/campaign', { active });
  assert.equal(failed.status, 503); assert.equal(failed.data.error.code, 'LOOPY_ACCESS_DENIED');
  assert.ok(!JSON.stringify(failed).includes('raw-private'));
  await save(s.store, enrollmentKey(active.user), { accountId: active.user.id, email: active.user.email, enrollment: { status: 'issued', pid: 'private-id', url: 'https://loyalty.is/issuedReceipt', issuedAt: '2026-11-04T08:00:00Z' }, intents: {} });
  const issued = await s.request('/wallet/campaign', { active });
  assert.equal(issued.status, 200); assert.equal(issued.data.enrollment.status, 'issued'); assert.equal(issued.data.campaign, null);
  assert.equal(issued.data.enrollment.url, 'https://loyalty.is/issuedReceipt'); assert.equal(issued.data.campaignError.code, 'LOOPY_CAMPAIGN_UNAVAILABLE');
});

test('unknown enrollment reconciles by read lookup only and never permits a second enrollment request', async () => {
  const s = setup(), active = await s.account();
  await save(s.store, enrollmentKey(active.user), { accountId: active.user.id, email: active.user.email, enrollment: { status: 'unknown', claim: 'original-claim', requestId: randomUUID(), startedAt: 1 }, intents: {} });
  const result = await s.request('/wallet/campaign', { active });
  assert.equal(result.data.enrollment.status, 'unknown'); assert.equal(result.data.enrollment.retryAllowed, false);
  const replay = await s.request('/wallet/enroll', { method: 'POST', active, data: enrollInput(result.data.campaign.version) });
  assert.equal(replay.data.enrollment.status, 'unknown'); assert.equal(s.calls.some(c => c.url.includes('/enrol/')), false);
});

test('explicit current terms and valid name are required before enrollment; account email is authoritative and request replay issues once', async () => {
  const s = setup(), active = await s.account(), campaign = (await s.request('/wallet/campaign', { active })).data.campaign;
  for (const patch of [{ acceptTerms: false }, { campaignVersion: 'old' }, { name: '' }]) {
    const result = await s.request('/wallet/enroll', { method: 'POST', active, data: { ...enrollInput(campaign.version), ...patch } });
    assert.ok([400,409].includes(result.status));
  }
  assert.equal(s.calls.some(c => c.url.includes('/enrol/')), false);
  const input = { ...enrollInput(campaign.version), email: 'attacker@example.com', pid: 'attacker-card' };
  const issued = await s.request('/wallet/enroll', { method: 'POST', active, data: input });
  assert.equal(issued.status, 200); assert.equal(issued.data.enrollment.status, 'issued'); assert.equal(issued.data.enrollment.pid, undefined);
  const posts = s.calls.filter(c => c.url.includes('/enrol/')); assert.equal(posts.length, 1);
  assert.equal(JSON.parse(posts[0].init.body).customerData['البريد الإلكتروني'], active.user.email);
  assert.equal((await s.request('/wallet/enroll', { method: 'POST', active, data: input })).data.enrollment.status, 'issued');
  assert.equal(s.calls.filter(c => c.url.includes('/enrol/')).length, 1);
});

test('wallet campaign reads are rate limited per authenticated account', async () => {
  const s = setup(), active = await s.account();
  for (let i = 0; i < 60; i++) assert.equal((await s.request('/wallet/campaign', { active })).status, 200);
  assert.equal((await s.request('/wallet/campaign', { active })).status, 429);
});

test('booking create, account list, move and cancel project durable outbox status without provider delivery', async () => {
  const s = setup(), active = await s.account();
  const input = { requestId: randomUUID(), items: [{ serviceId: 'basic', optionId: null }], date: '2026-11-05', time: '10:00', professional: 'any', contactName: 'سارة', attendee: { kind: 'self' } };
  const created = await s.request('/bookings', { method: 'POST', active, data: input });
  assert.equal(created.status, 200, JSON.stringify(created));
  const booking = created.data.booking;
  assert.equal(booking.walletSync.status, 'pending');
  await update(s.store, 'clinic/booking-ledger-v1', ledger => { ledger.walletOutbox.events[`booking:${booking.id}:1`].status = 'sent'; return { value: ledger, result: true }; });
  assert.equal((await s.request('/me', { active })).data.bookings[0].walletSync.status, 'synced');
  const moved = await s.request('/bookings/' + booking.id, { method: 'PATCH', active, data: { ...input, requestId: randomUUID(), revision: 1, time: '12:00' } });
  assert.equal(moved.status, 200); assert.equal(moved.data.booking.walletSync.status, 'pending');
  const cancelled = await s.request('/bookings/' + booking.id, { method: 'DELETE', active, data: { requestId: randomUUID(), revision: 2 } });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.data.booking.walletSync.status, 'pending');
  assert.equal(s.calls.length, 0);
});

test('private verified binding configuration is server-only and GET verifies the selected installed card', async () => {
  const s = setup({ env: { LOOPY_VERIFIED_BINDINGS_JSON: JSON.stringify({ 'sara@example.com': 'chosen-private-card' }) }, fetch: url => url.includes('/campaign/public/') ? response(OFFER) : response({ card: { id: 'chosen-private-card', campaignId: LOOPY_CAMPAIGN_ID, passStatus: 'installed', customerDetails: { 'البريد الإلكتروني': 'sara@example.com' } } }) });
  const active = await s.account(), config = await s.request('/config'), result = await s.request('/wallet/campaign', { active });
  assert.equal(result.status, 200); assert.equal(result.data.enrollment.status, 'issued');
  assert.equal(result.data.enrollment.url, 'https://q.passkit.net/p-chosen-private-card');
  assert.equal(s.calls.some(c => c.url.includes('/card/chosen-private-card?')), true);
  assert.equal(s.calls.some(c => c.url.includes('/card/cid/')), false);
  assert.ok(!JSON.stringify(config.data).includes('chosen-private-card'));
  assert.equal(result.data.verifiedBindings, undefined);
});

test('admin create, move and cancel expose only the same safe outbox projection to the customer', async () => {
  const s = setup({ env: { CLINIME_ADMIN_EMAILS: 'admin@example.com' } }), admin = await s.account('admin@example.com'), customer = await s.account();
  const input = { requestId: randomUUID(), customerEmail: customer.user.email, items: [{ serviceId: 'basic' }], date: '2026-11-05', time: '10:00', professional: 'any', contactName: 'سارة', attendee: { kind: 'self' } };
  const created = await s.request('/admin/bookings', { method: 'POST', active: admin, data: input });
  assert.equal(created.status, 200, JSON.stringify(created)); assert.equal(created.data.booking.walletSync.status, 'pending');
  assert.equal(created.data.booking.ownerId, undefined); assert.equal(created.data.booking._adminAudit, undefined);
  const id = created.data.booking.id;
  const moved = await s.request('/admin/bookings/' + id, { method: 'PATCH', active: admin, data: { requestId: randomUUID(), revision: 1, date: '2026-11-05', time: '12:00' } });
  assert.equal(moved.status, 200); assert.equal(moved.data.booking.walletSync.status, 'pending');
  const cancelled = await s.request('/admin/bookings/' + id, { method: 'DELETE', active: admin, data: { requestId: randomUUID(), revision: 2 } });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.data.booking.walletSync.status, 'pending');
  const me = (await s.request('/me', { active: customer })).data;
  assert.equal(me.bookings[0].status, 'cancelled'); assert.equal(me.bookings[0].walletSync.status, 'pending');
  assert.equal(me.bookings[0]._adminAudit, undefined); assert.equal(s.calls.length, 0);
});

test('direct loyalty and admin workspace reads activate the server-selected program without a prior config request', async () => {
  const s = setup({ env: { CLINIME_ADMIN_EMAILS: 'admin@example.com' } }), active = await s.account(), admin = await s.account('admin@example.com');
  const loyalty = await s.request('/loyalty', { active });
  assert.equal(loyalty.status, 200); assert.equal((await read(s.store, 'clinic/booking-ledger-v1')).walletIntegration.enabled, true);
  const workspace = await s.request('/admin/workspace', { active: admin });
  assert.equal(workspace.status, 200); assert.equal(s.calls.length, 0);
});

test('a Wallet projection read failure cannot change accepted customer or admin booking receipts into errors', async () => {
  const s = setup({ env: { CLINIME_ADMIN_EMAILS: 'admin@example.com' } }), customer = await s.account(), admin = await s.account('admin@example.com');
  const originalSet = s.store.setJSON.bind(s.store), originalGet = s.store.getWithMetadata.bind(s.store);
  let armed = false, faults = 0;
  s.store.setJSON = async (key, data, options) => {
    const previous = s.store.records.get(key)?.data;
    const result = await originalSet(key, data, options);
    // Arm only after the final email receipt is durably saved. Domain mutation
    // and confirmation reads have completed; the next ledger read is optional.
    if (result.modified && key === 'clinic/booking-ledger-v1' && Object.values(data.bookings || {}).some(b => b.emailStatus === 'sent' && previous?.bookings?.[b.id]?.revision === b.revision && previous.bookings[b.id].emailStatus !== 'sent')) armed = true;
    return result;
  };
  s.store.getWithMetadata = async key => {
    if (armed && key === 'clinic/booking-ledger-v1') { armed = false; faults++; throw Error('optional projection read unavailable'); }
    return originalGet(key);
  };
  const input = { requestId: randomUUID(), items: [{ serviceId: 'basic' }], date: '2026-11-05', time: '10:00', professional: 'any', contactName: 'سارة', attendee: { kind: 'self' } };
  const created = await s.request('/bookings', { method: 'POST', active: customer, data: input });
  assert.equal(created.status, 200, JSON.stringify(created)); assert.equal(created.data.emailStatus, 'sent');
  assert.equal(created.data.booking.walletSync, undefined); assert.equal(faults, 1);
  const id = created.data.booking.id;
  const moved = await s.request('/bookings/' + id, { method: 'PATCH', active: customer, data: { ...input, requestId: randomUUID(), revision: 1, time: '12:00' } });
  assert.equal(moved.status, 200); assert.equal(moved.data.booking.time, '12:00'); assert.equal(moved.data.emailStatus, 'sent'); assert.equal(faults, 2);
  const cancelled = await s.request('/admin/bookings/' + id, { method: 'DELETE', active: admin, data: { requestId: randomUUID(), revision: 2 } });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.data.booking.status, 'cancelled'); assert.equal(cancelled.data.emailStatus, 'sent'); assert.equal(faults, 3);
  const manual = await s.request('/admin/bookings', { method: 'POST', active: admin, data: { ...input, requestId: randomUUID(), customerEmail: customer.user.email, time: '14:00' } });
  assert.equal(manual.status, 200); assert.equal(manual.data.booking.time, '14:00'); assert.equal(manual.data.emailStatus, 'sent'); assert.equal(faults, 4);
  assert.equal((await read(s.store, 'clinic/booking-ledger-v1')).bookings[id].status, 'cancelled');
  assert.equal(s.calls.length, 0);
});

test('/me retains its authoritative booking list when optional Wallet status fails but preserves required read errors', async () => {
  const s = setup(), active = await s.account();
  const created = await s.request('/bookings', { method: 'POST', active, data: { requestId: randomUUID(), items: [{ serviceId: 'basic' }], date: '2026-11-05', time: '10:00', professional: 'any', contactName: 'سارة', attendee: { kind: 'self' } } });
  assert.equal(created.status, 200);
  const original = s.store.getWithMetadata.bind(s.store);
  let ledgerReads = 0, failAt = 2;
  s.store.getWithMetadata = async key => {
    if (key === 'clinic/booking-ledger-v1' && ++ledgerReads === failAt) throw Error('ledger read unavailable');
    return original(key);
  };
  const me = await s.request('/me', { active });
  assert.equal(me.status, 200); assert.equal(ledgerReads, 2); assert.equal(me.data.bookings[0].id, created.data.booking.id);
  assert.equal(me.data.bookings[0].walletSync, undefined); assert.equal(me.data.user.email, active.user.email);
  assert.equal(me.data.csrfToken, active.csrfToken); assert.deepEqual(me.data.preferences, { email: true });
  ledgerReads = 0; failAt = 1;
  assert.equal((await s.request('/me', { active })).status, 503);
});
