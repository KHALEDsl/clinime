import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAPI } from '../server/api.mjs';

const ADMIN = 'owner@example.invalid', LEDGER = 'clinic/booking-ledger-v1';
class FakeStore {
  records = new Map(); version = 0; unknownOnce = null;
  async getWithMetadata(key, options) {
    assert.equal(options.consistency, 'strong');
    return structuredClone(this.records.get(key) || null);
  }
  async setJSON(key, value, options) {
    const existing = this.records.get(key);
    if (options.onlyIfNew && existing || options.onlyIfMatch && existing?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++this.version);
    this.records.set(key, { data: structuredClone(value), etag });
    if (this.unknownOnce === key) { this.unknownOnce = null; throw Error('lost durable acknowledgement'); }
    return { modified: true, etag };
  }
}
function setup(overrides = {}) {
  const store = new FakeStore(), mail = { calls: [], accepted: new Map(), status: 'sent', hook: null,
    async send(message) {
      this.calls.push(structuredClone(message));
      if (this.hook) await this.hook(message);
      if (this.status === 'sent') this.accepted.set(message.key, structuredClone(message));
      return { status: this.status };
    },
  };
  let clock = Date.parse('2026-10-28T08:00:00Z');
  const env = { APP_SECRET: 'unit-test-secret-with-at-least-thirty-two-characters', PUBLIC_ORIGIN: 'https://clinic.example', RESEND_API_KEY: 'test-only', EMAIL_FROM: 'Clinic <bookings@clinic.example>', CLINIME_ADMIN_EMAILS: ADMIN, CLINIC_SCHEDULE_JSON: JSON.stringify({ timeZone: 'Asia/Riyadh', weekdays: [0, 1, 2, 3, 4, 5, 6], open: '10:00', close: '18:00', stepMinutes: 30, horizonDays: 60 }), ...overrides };
  const api = createAPI({ store, mail, env, now: () => clock });
  async function request(path, { method = 'GET', account, data, origin = env.PUBLIC_ORIGIN, headers = {} } = {}) {
    const h = { ...headers };
    if (method !== 'GET') h.Origin = origin;
    if (data !== undefined) h['Content-Type'] = 'application/json';
    if (account) { h.Cookie = account.cookie; h['X-CSRF-Token'] = account.csrfToken; }
    const result = await api(new Request(env.PUBLIC_ORIGIN + path, { method, headers: h, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }), { ip: '192.0.2.1' });
    return { status: result.status, data: await result.json(), cookie: result.headers.get('set-cookie') };
  }
  async function login(email = ADMIN) {
    const challenge = await request('/api/auth/request', { method: 'POST', data: { requestId: randomUUID(), email, locale: 'en', mode: 'code' } });
    assert.equal(challenge.status, 200);
    const code = mail.calls.at(-1).text.match(/Sign-in code: (\d{6})/)[1];
    const verified = await request('/api/auth/verify', { method: 'POST', data: { challengeId: challenge.data.challengeId, code } });
    assert.equal(verified.status, 200);
    return { ...verified.data, cookie: verified.cookie.split(';')[0] };
  }
  async function create(account, extra = {}) {
    const result = await request('/api/bookings', { method: 'POST', account, data: { requestId: randomUUID(), items: [{ serviceId: 'basic', optionId: null }], date: '2026-10-28', time: '12:00', professional: 'any', contactName: 'Fixture visitor', attendee: { kind: 'self' }, ...extra } });
    assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data.booking;
  }
  const raw = id => store.records.get(LEDGER).data.bookings[id];
  return { store, mail, request, login, create, raw, setTime: value => clock = Date.parse(value) };
}
const operation = (revision, extra = {}) => ({ requestId: randomUUID(), revision, ...extra });
const path = booking => '/api/admin/bookings/' + booking.id;
const assertCode = (result, status, code) => { assert.equal(result.status, status, JSON.stringify(result.data)); assert.equal(result.data.error.code, code); };

test('admin actions require allowlisted identity, existing session, origin and CSRF; body role and owner cannot grant access', async () => {
  const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com'), other = await s.login('other@example.com'), b = await s.create(owner);
  for (const [method, suffix, extra] of [['POST', '/arrival', {}], ['PATCH', '', { date: '2026-10-29', time: '12:00' }], ['DELETE', '', {}]]) {
    const data = operation(1, { ...extra, role: 'admin', admin: true, ownerId: admin.user.id, email: ADMIN });
    assertCode(await s.request(path(b) + suffix, { method, data }), 401, 'AUTH_REQUIRED');
    assertCode(await s.request(path(b) + suffix, { method, account: other, data }), 403, 'ADMIN_REQUIRED');
    assertCode(await s.request(path(b) + suffix, { method, account: admin, data, origin: 'https://evil.example' }), 403, 'ORIGIN_INVALID');
    assertCode(await s.request(path(b) + suffix, { method, account: { ...admin, csrfToken: 'forged' }, data }), 403, 'CSRF_INVALID');
  }
  assert.equal(s.raw(b.id).revision, 1); assert.equal(s.raw(b.id)._adminAudit, undefined);
  assertCode(await s.request(path(b) + '/availability?date=2026-10-28', { account: other }), 403, 'ADMIN_REQUIRED');
});

test('admin reschedule and cancellation preserve owner, ID and immutable booking values and appear in customer /me', async () => {
  const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com'), other = await s.login('other@example.com'), b = await s.create(owner);
  const before = structuredClone(s.raw(b.id));
  const move = operation(1, { date: '2026-10-29', time: '13:00', ownerId: admin.user.id, contact: { email: ADMIN }, items: [{ price: 1 }], payment: { status: 'paid' } });
  const result = await s.request(path(b), { method: 'PATCH', account: admin, data: move });
  assert.equal(result.status, 200); assert.equal(result.data.booking.id, b.id); assert.equal(result.data.booking.revision, 2);
  assert.equal(result.data.emailStatus, 'sent'); assert.equal(result.data.booking.date, '2026-10-29');
  const after = s.raw(b.id);
  for (const field of ['id', 'ownerId', 'items', 'contact', 'attendee', 'professional', 'createdAt', 'gift']) assert.deepEqual(after[field], before[field], field);
  assert.equal(after.payment, undefined); assert.equal(after._adminAudit.length, 1); assert.equal(after._adminAudit[0].actorId, admin.user.id);
  assert.equal(s.mail.calls.at(-1).to, owner.user.email); assert.match(s.mail.calls.at(-1).key, /\/2$/);
  assert.equal(JSON.stringify(result.data).includes('_adminAudit'), false); assert.equal(JSON.stringify(result.data).includes('actorId'), false);
  const me = (await s.request('/api/me', { account: owner })).data;
  assert.equal(me.bookings[0].date, '2026-10-29'); assert.equal(me.bookings[0]._adminAudit, undefined);
  assert.equal((await s.request('/api/me', { account: other })).data.bookings.length, 0);
  assertCode(await s.request('/api/bookings/' + b.id, { method: 'DELETE', account: other, data: operation(2) }), 404, 'NOT_FOUND');
  const cancelled = await s.request(path(b), { method: 'DELETE', account: admin, data: operation(2) });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.data.booking.status, 'cancelled'); assert.equal(cancelled.data.booking.revision, 3);
  assert.equal((await s.request('/api/me', { account: owner })).data.bookings[0].status, 'cancelled');
  assert.equal(s.raw(b.id)._adminAudit.length, 2); assert.equal(s.mail.calls.at(-1).to, owner.user.email);
});

test('arrival is a separate once-only fact, locks customer changes, and survives admin cancellation', async () => {
  const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com'), b = await s.create(owner), data = operation(1);
  const mailCount = s.mail.calls.length;
  const arrived = await s.request(path(b) + '/arrival', { method: 'POST', account: admin, data });
  assert.equal(arrived.status, 200); assert.equal(arrived.data.booking.revision, 1); assert.equal(arrived.data.booking.status, 'confirmed');
  assert.deepEqual(arrived.data.booking.attendance, { status: 'arrived', arrivedAt: '2026-10-28T08:00:00.000Z' });
  assert.equal(s.mail.calls.length, mailCount);
  assert.equal((await s.request(path(b) + '/arrival', { method: 'POST', account: admin, data })).status, 200);
  assert.equal((await s.request(path(b) + '/arrival', { method: 'POST', account: admin, data: operation(1) })).status, 200);
  assert.equal(s.raw(b.id)._adminAudit.length, 1);
  for (const [method, endpoint, extra] of [['PATCH', '/api/bookings/' + b.id, { date: '2026-10-29', time: '12:00' }], ['DELETE', '/api/bookings/' + b.id, {}]]) {
    assertCode(await s.request(endpoint, { method, account: endpoint.startsWith('/api/admin') ? admin : owner, data: operation(1, extra) }), 409, 'ARRIVAL_LOCKED');
  }
  assert.equal((await s.request(path(b) + '/availability?date=2026-10-29', { account: admin })).status, 200);
  const ownerBooking = (await s.request('/api/me', { account: owner })).data.bookings[0];
  assert.deepEqual(ownerBooking.attendance, arrived.data.booking.attendance); assert.equal(ownerBooking._adminAudit, undefined);
  const cancelled = await s.request(path(b), { method: 'DELETE', account: admin, data: operation(1) });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.data.booking.revision, 2);
  assert.deepEqual(cancelled.data.booking.attendance, arrived.data.booking.attendance);
  assertCode(await s.request(path(b) + '/arrival', { method: 'POST', account: admin, data: operation(2) }), 409, 'REVISION_CONFLICT');
});

test('admin time changes preserve arrival, cross-date moves reset active arrival and retain only private history', async () => {
  const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com'), b = await s.create(owner);
  const arrival = await s.request(path(b) + '/arrival', { method: 'POST', account: admin, data: operation(1) });
  assert.equal(arrival.status, 200);
  const attendance = structuredClone(arrival.data.booking.attendance);
  const sameDay = await s.request(path(b), { method: 'PATCH', account: admin, data: operation(1, { date: b.date, time: '13:00' }) });
  assert.equal(sameDay.status, 200); assert.equal(sameDay.data.booking.revision, 2);
  assert.deepEqual(sameDay.data.booking.attendance, attendance);
  assert.deepEqual((await s.request('/api/me', { account: owner })).data.bookings[0].attendance, attendance);
  const moveInput = operation(2, { date: '2026-10-29', time: '14:00' });
  const nextDay = await s.request(path(b), { method: 'PATCH', account: admin, data: moveInput });
  assert.equal(nextDay.status, 200); assert.equal(nextDay.data.booking.revision, 3);
  assert.equal(nextDay.data.booking.attendance, undefined); assert.equal(s.raw(b.id).attendance, undefined);
  assert.deepEqual(s.raw(b.id)._adminAudit.at(-1).previousAttendance, attendance);
  for (const response of [nextDay.data, (await s.request('/api/admin/bookings', { account: admin })).data, (await s.request('/api/me', { account: owner })).data]) {
    assert.equal(JSON.stringify(response).includes('previousAttendance'), false);
    assert.equal(JSON.stringify(response).includes('_adminAudit'), false);
  }
  const ownerBooking = (await s.request('/api/me', { account: owner })).data.bookings[0];
  assert.equal(ownerBooking.date, '2026-10-29'); assert.equal(ownerBooking.attendance, undefined);
  const count = s.mail.calls.length;
  assert.equal((await s.request(path(b), { method: 'PATCH', account: admin, data: moveInput })).status, 200);
  assert.equal(s.raw(b.id)._adminAudit.length, 3); assert.equal(s.mail.calls.length, count);
  assert.equal((await s.request('/api/bookings/' + b.id, { method: 'PATCH', account: owner, data: operation(3, { date: '2026-10-29', time: '15:00' }) })).status, 200, 'owner can change the new visit before arrival');
});

test('arrival accepts future, current and past booking dates across the Riyadh UTC boundary', async t => {
  for (const [label, date, at] of [
    ['future date before midnight', '2026-10-29', '2026-10-28T08:00:00Z'],
    ['future date after Riyadh midnight', '2026-10-30', '2026-10-28T21:05:00Z'],
    ['current Riyadh date differs from UTC', '2026-10-29', '2026-10-28T21:05:00Z'],
    ['past Riyadh date is still current in UTC', '2026-10-28', '2026-10-28T21:05:00Z'],
  ]) await t.test(label, async () => {
    const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com'), b = await s.create(owner, { date, time: '12:00' });
    s.setTime(at);
    const input = operation(1), before = structuredClone(s.raw(b.id));
    const result = await s.request(path(b) + '/arrival', { method: 'POST', account: admin, data: input });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    const attendance = { status: 'arrived', arrivedAt: new Date(at).toISOString() };
    assert.deepEqual(result.data.booking.attendance, attendance);
    assert.equal(result.data.booking.date, date); assert.equal(result.data.booking.revision, before.revision);
    assert.deepEqual(s.raw(b.id).items, before.items); assert.equal(s.raw(b.id).status, 'confirmed');
    assert.equal(s.raw(b.id)._adminAudit[0].at, attendance.arrivedAt);
    assert.deepEqual((await s.request('/api/me', { account: owner })).data.bookings[0].attendance, attendance, 'customer sees arrival regardless of booking date');
    assertCode(await s.request('/api/bookings/' + b.id, { method: 'DELETE', account: owner, data: operation(1) }), 409, 'ARRIVAL_LOCKED');
    s.setTime(new Date(Date.parse(at) + 600000).toISOString());
    for (const data of [input, operation(1)]) {
      const repeat = await s.request(path(b) + '/arrival', { method: 'POST', account: admin, data });
      assert.equal(repeat.status, 200); assert.deepEqual(repeat.data.booking.attendance, attendance);
    }
    assert.equal(s.raw(b.id)._adminAudit.length, 1);
  });
});

test('arrival cannot create a new attendance fact after a visit starts or ends; recorded arrival stays idempotent', async t => {
  for (const stage of ['session', 'checkout', 'closed']) await t.test(stage, async () => {
    const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com'), b = await s.create(owner);
    s.raw(b.id)._staff = { stage };
    assertCode(await s.request(path(b) + '/arrival', { method: 'POST', account: admin, data: operation(1) }), 409, 'VISIT_LOCKED');
    assert.equal(s.raw(b.id).attendance, undefined); assert.equal(s.raw(b.id)._adminAudit, undefined);
    s.raw(b.id)._staff.stage = 'waiting';
    const input = operation(1), arrived = await s.request(path(b) + '/arrival', { method: 'POST', account: admin, data: input });
    assert.equal(arrived.status, 200);
    s.raw(b.id)._staff.stage = stage;
    for (const data of [input, operation(1)]) {
      const repeat = await s.request(path(b) + '/arrival', { method: 'POST', account: admin, data });
      assert.equal(repeat.status, 200); assert.deepEqual(repeat.data.booking.attendance, arrived.data.booking.attendance);
    }
    assert.equal(s.raw(b.id)._adminAudit.length, 1); assert.equal(s.raw(b.id)._staff.stage, stage);
  });
});

test('admin availability uses the immutable booked duration, excludes itself and respects other reservations', async () => {
  const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com');
  const b = await s.create(owner, { date: '2026-10-29', time: '10:00', items: [{ serviceId: 'basic' }, { serviceId: 'hydra', optionId: 'deluxe' }] });
  await s.create(owner, { date: '2026-10-29', time: '13:00' });
  const result = await s.request(path(b) + '/availability?date=2026-10-29&services=brow:', { account: admin });
  assert.equal(result.status, 200); assert.equal(result.data.slots.includes('10:00'), true);
  assert.equal(result.data.slots.includes('11:30'), false, '115 minute booked duration overlaps 13:00');
  assert.equal(result.data.slots.includes('16:30'), false, '115 minute booked duration extends past close');
  assert.equal(result.data.slots.includes('16:00'), true);
  assertCode(await s.request(path(b), { method: 'PATCH', account: admin, data: operation(1, { date: '2026-10-29', time: '11:30' }) }), 409, 'SLOT_UNAVAILABLE');
  assertCode(await s.request(path(b), { method: 'PATCH', account: admin, data: operation(1, { date: '2026-10-30', time: '25:00' }) }), 409, 'SLOT_UNAVAILABLE');
});

test('unknown acknowledgement retries the same admin operation once with stable frozen email and audit', async () => {
  const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com'), b = await s.create(owner);
  const input = operation(1, { date: '2026-10-29', time: '13:00' });
  s.store.unknownOnce = LEDGER;
  assertCode(await s.request(path(b), { method: 'PATCH', account: admin, data: input }), 503, 'STORE_UNAVAILABLE');
  const count = s.mail.calls.length;
  const recovered = await s.request(path(b), { method: 'PATCH', account: admin, data: input });
  assert.equal(recovered.status, 200); assert.equal(recovered.data.booking.revision, 2); assert.equal(s.raw(b.id)._adminAudit.length, 1);
  assert.equal(s.mail.calls.length, count + 1);
  const first = structuredClone(s.mail.calls.at(-1));
  assert.equal((await s.request(path(b), { method: 'PATCH', account: admin, data: input })).status, 200);
  assert.equal(s.mail.calls.length, count + 1);
  assertCode(await s.request(path(b), { method: 'PATCH', account: admin, data: { ...input, time: '14:00' } }), 409, 'IDEMPOTENCY_CONFLICT');
  assert.deepEqual(s.mail.calls.at(-1), first);
  const noOp = operation(2, { date: '2026-10-29', time: '13:00' });
  assert.equal((await s.request(path(b), { method: 'PATCH', account: admin, data: noOp })).status, 200);
  assert.equal(s.raw(b.id).revision, 2); assert.equal(s.raw(b.id)._adminAudit.length, 1); assert.equal(s.mail.calls.length, count + 1);
  assertCode(await s.request(path(b), { method: 'PATCH', account: admin, data: { ...noOp, time: '14:00' } }), 409, 'IDEMPOTENCY_CONFLICT');
});

test('arrival leaves pending confirmation payload, status, revision and provider key intact', async () => {
  const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com');
  s.mail.status = 'pending';
  const b = await s.create(owner), before = structuredClone(s.raw(b.id)), originalMessage = structuredClone(s.mail.calls.at(-1)), count = s.mail.calls.length;
  assert.equal((await s.request(path(b) + '/arrival', { method: 'POST', account: admin, data: operation(1) })).status, 200);
  assert.equal(s.mail.calls.length, count);
  for (const field of ['emailMessage', 'emailStatus', 'mailStartedAt', 'revision']) assert.deepEqual(s.raw(b.id)[field], before[field]);
  s.mail.status = 'sent';
  assert.equal((await s.request('/api/bookings/' + b.id + '/confirmation', { method: 'POST', account: owner, data: {} })).data.emailStatus, 'sent');
  assert.deepEqual(s.mail.calls.at(-1), originalMessage);
  assert.equal(s.raw(b.id).attendance.status, 'arrived');
});

test('CAS serializes arrival against client movement/cancellation and duplicate arrivals without lost state', async () => {
  for (const customerAction of ['PATCH', 'DELETE']) {
    const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com'), b = await s.create(owner);
    const responses = await Promise.all([
      s.request(path(b) + '/arrival', { method: 'POST', account: admin, data: operation(1) }),
      s.request('/api/bookings/' + b.id, { method: customerAction, account: owner, data: operation(1, { date: '2026-10-29', time: '13:00' }) }),
    ]);
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    const final = s.raw(b.id);
    if (final.attendance) { assert.equal(final.status, 'confirmed'); assert.equal(final.date, b.date); assert.equal(final.revision, 1); }
    else assert.equal(final.revision, 2);
  }
  const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com'), b = await s.create(owner);
  const duplicates = await Promise.all([1, 2].map(() => s.request(path(b) + '/arrival', { method: 'POST', account: admin, data: operation(1) })));
  assert.deepEqual(duplicates.map(r => r.status), [200, 200]); assert.equal(s.raw(b.id)._adminAudit.length, 1);
});

test('admin competing moves and stale revisions cannot overwrite bookings or reserve overlapping slots', async () => {
  const s = setup(), admin = await s.login(), owner = await s.login('owner@example.com');
  const one = await s.create(owner), two = await s.create(owner, { time: '14:00' });
  const results = await Promise.all([one, two].map(b => s.request(path(b), { method: 'PATCH', account: admin, data: operation(1, { date: '2026-10-29', time: '12:00' }) })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const moved = results.find(r => r.status === 200).data.booking;
  assertCode(await s.request(path(moved), { method: 'DELETE', account: admin, data: operation(1) }), 409, 'REVISION_CONFLICT');
  const arrived = await s.create(owner, { time: '16:00' });
  const race = await Promise.all([
    s.request(path(arrived) + '/arrival', { method: 'POST', account: admin, data: operation(1) }),
    s.request(path(arrived), { method: 'DELETE', account: admin, data: operation(1) }),
  ]);
  assert.equal(race[1].status, 200);
  assert.ok([200, 409].includes(race[0].status));
  assert.equal(s.raw(arrived.id).status, 'cancelled');
  if (race[0].status === 200) assert.equal(s.raw(arrived.id).attendance.status, 'arrived');
});
