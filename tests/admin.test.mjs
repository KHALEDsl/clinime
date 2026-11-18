import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAPI } from '../server/api.mjs';
import { configuredAdminEmails } from '../server/admin.mjs';

const ADMIN = 'owner@example.invalid', LEDGER = 'clinic/booking-ledger-v1';
class FakeStore {
  records = new Map(); reads = []; writes = []; version = 0;
  async getWithMetadata(key, options) {
    this.reads.push({ key, options });
    return structuredClone(this.records.get(key) || null);
  }
  async setJSON(key, value, options) {
    const row = this.records.get(key);
    if (options.onlyIfNew && row || options.onlyIfMatch && row?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++this.version);
    this.records.set(key, { data: structuredClone(value), etag, metadata: {} });
    this.writes.push(key);
    return { modified: true, etag };
  }
}
function setup(overrides = {}) {
  const store = new FakeStore(), messages = [];
  let clock = Date.parse('2026-10-28T08:00:00Z');
  const env = {
    APP_SECRET: 'unit-test-secret-with-at-least-thirty-two-characters', PUBLIC_ORIGIN: 'https://clinic.example',
    RESEND_API_KEY: 'test-only', EMAIL_FROM: 'Clinic <bookings@clinic.example>', CLINIME_ADMIN_EMAILS: ADMIN,
    CLINIC_SCHEDULE_JSON: JSON.stringify({ timeZone: 'Asia/Riyadh', weekdays: [0, 1, 2, 3, 4, 5, 6], open: '10:00', close: '18:00', stepMinutes: 30, horizonDays: 60 }), ...overrides,
  };
  const app = createAPI({ store, env, now: () => clock, mail: { send: async message => { messages.push(structuredClone(message)); return { status: 'sent' }; } } });
  async function request(path, { method = 'GET', account, data, headers = {} } = {}) {
    const h = { ...headers };
    if (method !== 'GET') h.Origin = env.PUBLIC_ORIGIN;
    if (data !== undefined) h['Content-Type'] = 'application/json';
    if (account) { h.Cookie = account.cookie; h['X-CSRF-Token'] = account.csrfToken; }
    const response = await app(new Request(env.PUBLIC_ORIGIN + path, { method, headers: h, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }), { ip: '192.0.2.1' });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie'), headers: response.headers };
  }
  async function login(address = ADMIN) {
    const challenge = await request('/api/auth/request', { method: 'POST', data: { requestId: randomUUID(), email: address, locale: 'en', mode: 'code' } });
    assert.equal(challenge.status, 200);
    const code = messages.at(-1).text.match(/Sign-in code: (\d{6})/)[1];
    const result = await request('/api/auth/verify', { method: 'POST', data: { challengeId: challenge.data.challengeId, code } });
    assert.equal(result.status, 200);
    return { ...result.data, cookie: result.cookie.split(';')[0] };
  }
  return { store, request, login, advance: milliseconds => clock += milliseconds };
}
const bookingInput = () => ({ requestId: randomUUID(), items: [{ serviceId: 'basic', optionId: null }], date: '2026-10-29', time: '10:00', professional: 'any', contactName: 'Sample visitor', attendee: { kind: 'self' } });

test('admin allowlist normalizes explicit addresses and fails closed on malformed or absent configuration', () => {
  assert.deepEqual(configuredAdminEmails('  OWNER@EXAMPLE.INVALID  '), [ADMIN]);
  assert.deepEqual(configuredAdminEmails(`${ADMIN},staff@example.com`), [ADMIN, 'staff@example.com']);
  assert.deepEqual(configuredAdminEmails(`${ADMIN}\nstaff@example.com`), [ADMIN, 'staff@example.com']);
  for (const raw of [undefined, null, '', ' ', '*', '@example.invalid', '*@example.invalid', 'owner.*@example.invalid', 'Person <' + ADMIN + '>', ADMIN + ',invalid', ADMIN + ',', [ADMIN], ADMIN + ';staff@example.com']) assert.deepEqual(configuredAdminEmails(raw), [], String(raw));
});

test('admin GET routes require verified sessions and exact allowed identity; client role claims are ignored', async () => {
  const s = setup(), customer = await s.login('customer@example.com');
  for (const path of ['/api/admin/me', '/api/admin/bookings', '/.netlify/functions/api/admin/bookings']) {
    assert.equal((await s.request(path)).status, 401);
    assert.equal((await s.request(path, { account: customer, headers: { 'X-Admin-Email': ADMIN, 'X-Role': 'admin' } })).status, 403);
    assert.equal((await s.request(path + '?email=' + ADMIN + '&role=admin', { account: customer })).status, 403);
  }
  const lookalikes = [ADMIN + '.evil', 'prefix.' + ADMIN, 'owner+alias@example.invalid'];
  for (const address of lookalikes) {
    const account = await s.login(address);
    assert.equal((await s.request('/api/admin/me', { account })).status, 403, address);
  }
});

test('missing or malformed allowlist grants no access even to the approved email', async () => {
  for (const CLINIME_ADMIN_EMAILS of [undefined, '', `${ADMIN},*`]) {
    const s = setup({ CLINIME_ADMIN_EMAILS }), account = await s.login();
    assert.equal((await s.request('/api/admin/me', { account })).status, 403);
    assert.equal((await s.request('/api/admin/bookings', { account })).status, 403);
  }
});

test('admin identity is private and customer /me shape remains unchanged', async () => {
  const s = setup({ CLINIME_ADMIN_EMAILS: ' OWNER@EXAMPLE.INVALID ' }), account = await s.login('owner@example.invalid');
  const result = await s.request('/api/admin/me', { account });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.user, { email: ADMIN, name: '' });
  assert.equal(result.data.role, 'admin');
  assert.equal(result.data.csrfToken, account.csrfToken);
  assert.equal(result.data.asOf, '2026-10-28T08:00:00.000Z');
  assert.equal(result.headers.get('cache-control'), 'no-store, private');
  assert.deepEqual(Object.keys((await s.request('/api/me', { account })).data).sort(), ['bookings', 'csrfToken', 'favorite', 'preferences', 'user']);
  assert.equal((await s.request('/api/admin/me', { headers: { Cookie: account.cookie + 'forged' } })).status, 401);
  await s.request('/api/auth/logout', { method: 'POST', account });
  assert.equal((await s.request('/api/admin/bookings', { account })).status, 401);
});

test('admin reads current customer ledger through create, reschedule and cancellation without copying or leaks', async () => {
  const s = setup(), admin = await s.login(), customer = await s.login('customer@example.com');
  assert.deepEqual((await s.request('/api/admin/bookings', { account: admin })).data.bookings, []);
  const created = await s.request('/api/bookings', { method: 'POST', account: customer, data: bookingInput() });
  assert.equal(created.status, 200);
  const id = created.data.booking.id;
  const raw = s.store.records.get(LEDGER).data.bookings[id];
  raw.privateSecret = 'do-not-leak'; raw.gift = { code: 'private-gift' };
  raw.items[0].privateSecret = 'nested-item-secret'; raw.contact.privateSecret = 'nested-contact-secret'; raw.attendee.privateSecret = 'nested-attendee-secret';
  const writes = s.store.writes.length;
  const first = await s.request('/api/admin/bookings', { account: admin });
  assert.equal(first.status, 200); assert.equal(first.data.total, 1);
  assert.equal(first.data.bookings[0].id, id); assert.equal(first.data.bookings[0].status, 'confirmed');
  assert.equal(first.data.bookings[0].contact.email, customer.user.email);
  assert.equal(first.data.bookings[0].emailStatus, 'sent');
  assert.equal(s.store.writes.length, writes, 'admin reads perform no writes');
  assert.deepEqual(Object.keys(first.data.bookings[0]).sort(), ['attendee', 'contact', 'createdAt', 'date', 'emailStatus', 'id', 'items', 'professional', 'revision', 'status', 'time', 'updatedAt']);
  for (const field of ['ownerId', 'fingerprint', 'gift', 'emailMessage', 'mailStartedAt', 'emailTemplateVersion', 'privateSecret', 'private-gift', 'nested-item-secret', 'nested-contact-secret', 'nested-attendee-secret']) assert.equal(JSON.stringify(first.data).includes(field), false, field);
  assert.equal(s.store.reads.filter(row => row.key === LEDGER).every(row => row.options.consistency === 'strong'), true);
  s.advance(1000);
  const moved = await s.request('/api/bookings/' + id, { method: 'PATCH', account: customer, data: { requestId: randomUUID(), revision: 1, date: '2026-10-30', time: '12:00' } });
  assert.equal(moved.status, 200);
  const second = (await s.request('/api/admin/bookings', { account: admin })).data;
  assert.equal(second.total, 1); assert.equal(second.bookings[0].id, id); assert.equal(second.bookings[0].revision, 2);
  assert.equal(second.bookings[0].date, '2026-10-30'); assert.equal(second.bookings[0].time, '12:00');
  assert.notEqual(second.asOf, first.data.asOf);
  assert.equal((await s.request('/api/admin/bookings?date=2026-10-29', { account: admin })).data.total, 0);
  assert.equal((await s.request('/api/admin/bookings?date=2026-10-30&status=confirmed', { account: admin })).data.total, 1);
  s.advance(1000);
  assert.equal((await s.request('/api/bookings/' + id, { method: 'DELETE', account: customer, data: { requestId: randomUUID(), revision: 2 } })).status, 200);
  const cancelled = (await s.request('/api/admin/bookings?status=cancelled', { account: admin })).data;
  assert.equal(cancelled.total, 1); assert.equal(cancelled.bookings[0].id, id); assert.equal(cancelled.bookings[0].revision, 3);
  assert.equal(cancelled.bookings[0].status, 'cancelled');
  assert.equal((await s.request('/api/admin/bookings?status=confirmed', { account: admin })).data.total, 0);
  assert.equal((await s.request('/api/me', { account: customer })).data.bookings[0].status, 'cancelled');
});

test('admin filters validate dates/statuses and ledger overflow fails closed instead of hiding records', async () => {
  const s = setup(), account = await s.login();
  for (const suffix of ['?date=2026-02-30', '?date=2026-1-01', '?date=invalid', '?status=paid', '?status=']) assert.equal((await s.request('/api/admin/bookings' + suffix, { account })).status, 400, suffix);
  s.store.records.set(LEDGER, { etag: 'overflow', data: { bookings: Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [String(i), {}])) } });
  assert.equal((await s.request('/api/admin/bookings', { account })).status, 503);
});

test('admin sessions expire under the existing authentication rules and endpoints have no writes', async () => {
  const s = setup(), account = await s.login();
  assert.equal((await s.request('/api/admin/bookings',{method:'POST',account,data:{}})).status,400);
  for (const method of ['PATCH', 'DELETE']) assert.equal((await s.request('/api/admin/bookings', { method, account, data: {} })).status, 404);
  assert.equal(s.store.records.has(LEDGER), false);
  s.advance(604800001);
  assert.equal((await s.request('/api/admin/me', { account })).status, 401);
});

test('explicit verified-email enrollment accepts any verified account while keeping customer ownership and session expiry', async () => {
  const s = setup({ CLINIME_ADMIN_ACCESS: 'verified-email', CLINIME_ADMIN_EMAILS: undefined });
  const customer = await s.login('visitor@example.com');
  const created = await s.request('/api/bookings', { method: 'POST', account: customer, data: bookingInput() });
  assert.equal(created.status, 200);
  const admin = await s.login('new.operator@example.net');
  const me = await s.request('/api/admin/me', { account: admin });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, 'new.operator@example.net');
  assert.equal(me.data.role, 'admin');
  const list = await s.request('/api/admin/bookings', { account: admin });
  assert.equal(list.data.bookings[0].id, created.data.booking.id);
  const own = await s.request('/api/me', { account: admin });
  assert.deepEqual(own.data.bookings, []);
  assert.equal('role' in own.data, false);
  await s.request('/api/auth/logout', { method: 'POST', account: admin });
  assert.equal((await s.request('/api/admin/me', { account: admin })).status, 401);
  s.advance(604800001);
  assert.equal((await s.request('/api/admin/bookings', { account: customer })).status, 401);
});

test('verified-email enrollment never grants access from an unverified email, challenge or forged cookie', async () => {
  const s = setup({ CLINIME_ADMIN_ACCESS: 'verified-email', CLINIME_ADMIN_EMAILS: '' });
  const pending = await s.request('/api/auth/request', { method: 'POST', data: { requestId: randomUUID(), email: 'unverified@example.net', locale: 'en', mode: 'code' } });
  assert.equal(pending.status, 200);
  assert.equal(pending.cookie, null);
  const headers = { 'X-Admin-Email': 'unverified@example.net', 'X-Role': 'admin', Cookie: '__Host-clinime-session=' + pending.data.challengeId + '.' + 'A'.repeat(43) };
  for (const path of ['/api/admin/me', '/api/admin/bookings', '/.netlify/functions/api/admin/bookings']) {
    assert.equal((await s.request(path)).status, 401);
    assert.equal((await s.request(path + '?email=unverified@example.net&role=admin', { headers })).status, 401);
  }
});

test('verified-email admins retain CSRF and exact-origin checks on real reception operations', async () => {
  const s = setup({ CLINIME_ADMIN_ACCESS: 'verified-email', CLINIME_ADMIN_EMAILS: '' });
  const customer = await s.login('visitor@example.com');
  const created = await s.request('/api/bookings', { method: 'POST', account: customer, data: { ...bookingInput(), date: '2026-10-28', time: '12:00' } });
  assert.equal(created.status, 200);
  const id = created.data.booking.id, admin = await s.login('new.operator@example.net');
  const arrival = '/api/admin/bookings/' + id + '/arrival';
  assert.equal((await s.request(arrival, { method: 'POST', data: { requestId: randomUUID(), revision: 1 } })).status, 401);
  assert.equal((await s.request(arrival, { method: 'POST', account: { ...admin, csrfToken: 'forged' }, data: { requestId: randomUUID(), revision: 1 } })).status, 403);
  assert.equal((await s.request(arrival, { method: 'POST', account: admin, headers: { origin: 'https://elsewhere.example' }, data: { requestId: randomUUID(), revision: 1 } })).status, 403);
  assert.equal((await s.request(arrival, { method: 'POST', account: admin, data: { requestId: randomUUID(), revision: 1 } })).status, 200);
  assert.equal((await s.request('/api/admin/bookings/' + id + '/availability?date=2026-10-29', { account: admin })).status, 200);
  const moved = await s.request('/api/admin/bookings/' + id, { method: 'PATCH', account: admin, data: { requestId: randomUUID(), revision: 1, date: '2026-10-29', time: '13:00' } });
  assert.equal(moved.status, 200);
  assert.equal(moved.data.booking.revision, 2);
  const cancelled = await s.request('/api/admin/bookings/' + id, { method: 'DELETE', account: admin, data: { requestId: randomUUID(), revision: 2 } });
  assert.equal(cancelled.status, 200);
  assert.equal((await s.request('/api/me', { account: customer })).data.bookings[0].status, 'cancelled');
});

test('only the exact server verified-email setting enables open enrollment', async () => {
  for (const CLINIME_ADMIN_ACCESS of [undefined, '', '*', 'true', 'verified', 'VERIFIED-EMAIL', ' verified-email ']) {
    const s = setup({ CLINIME_ADMIN_ACCESS }), account = await s.login('new.operator@example.net');
    assert.equal((await s.request('/api/admin/me?access=verified-email', { account, headers: { 'X-Admin-Access': 'verified-email' } })).status, 403);
  }
});
