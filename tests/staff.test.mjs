import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createStaff } from '../server/staff.mjs';
import { createAPI } from '../server/api.mjs';
import { createBookings, configuredSchedule } from '../server/bookings.mjs';
import { CATALOG } from '../server/catalog.mjs';
import { configuredProfessionals, LOCAL_PROFESSIONALS } from '../server/professionals.mjs';

const LEDGER = 'clinic/booking-ledger-v1', SECRET = 'staff-unit-test-secret-at-least-thirty-two-characters';
class FakeStore {
  records = new Map(); version = 0; writes = 0; unknownOnce = null;
  async getWithMetadata(key, options) { assert.equal(options.consistency, 'strong'); return structuredClone(this.records.get(key) || null); }
  async setJSON(key, value, options) {
    const row = this.records.get(key);
    if (options.onlyIfNew && row || options.onlyIfMatch && row?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++this.version); this.records.set(key, { data: structuredClone(value), etag }); this.writes++;
    if (this.unknownOnce === key) { this.unknownOnce = null; throw Error('lost acknowledgement after durable commit'); }
    return { modified: true, etag };
  }
}
function setup(overrides = {}) {
  const store = new FakeStore(), mail = { calls: [], async send(message) { this.calls.push(structuredClone(message)); return { status: 'sent' }; } };
  let clock = Date.parse('2026-11-01T07:00:00Z');
  const schedule = configuredSchedule({ timeZone: 'Asia/Riyadh', weekdays: [0, 1, 2, 3, 4, 5, 6], open: '10:00', close: '18:00', stepMinutes: 30, horizonDays: 60 });
  const env = { APP_SECRET: SECRET, PUBLIC_ORIGIN: 'https://clinic.example', RESEND_API_KEY: 'test-only', EMAIL_FROM: 'bookings@clinic.example', CLINIME_ADMIN_EMAILS: 'admin@example.com', CLINIC_SCHEDULE_JSON: JSON.stringify(schedule), ...overrides };
  const professionals = configuredProfessionals(env.CLINIME_SPECIALISTS_JSON);
  const bookings = createBookings({ store, mail, secret: SECRET, origin: env.PUBLIC_ORIGIN, schedule, professionals, now: () => clock });
  const staff = createStaff({ store, now: () => clock, secret: SECRET, bookings, schedule, professionals });
  const api = createAPI({ store, mail, env, now: () => clock });
  const active = { user: { id: 'verified-server-admin-id', email: 'admin@example.com' } };
  const owner = { id: 'server-owner-id', email: 'owner@example.com' };
  const raw = id => store.records.get(LEDGER).data.bookings[id];
  async function create(extra = {}, account = owner) {
    const result = await bookings.mutate('create', account, { requestId: randomUUID(), items: [{ serviceId: 'basic' }], date: '2026-11-01', time: '11:00', professional: 'any', contactName: 'Real fixture visitor', attendee: { kind: 'self' }, ...extra });
    return result.booking;
  }
  async function input(action, extra = {}) {
    const snapshot = await staff.snapshot(active);
    return { requestId: randomUUID(), revision: snapshot.revision, action, ...(extra.bookingId ? { bookingRevision: raw(extra.bookingId).revision } : {}), ...extra };
  }
  async function change(action, extra = {}) { return staff.mutate(active, await input(action, extra)); }
  async function ready(booking) {
    await bookings.mutate('arrival', active.user, { requestId: randomUUID(), revision: raw(booking.id).revision }, booking.id, { admin: true });
    await change('medical-save', { bookingId: booking.id, fields: { allergies: '', notes: 'Line one\nLine two' }, flags: { consultation: true, assessment: true, consent: true } });
    await change('decision-save', { bookingId: booking.id, decision: 'proceed', note: '' });
    return change('session-start', { bookingId: booking.id });
  }
  async function request(path, { method = 'GET', data, cookie, csrf, origin = env.PUBLIC_ORIGIN } = {}) {
    const response = await api(new Request(env.PUBLIC_ORIGIN + path, { method, headers: { Origin: origin, ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }), { ip: '192.0.2.1' });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  async function login(email = 'customer@example.com') {
    const challenge = await request('/api/auth/request', { method: 'POST', data: { requestId: randomUUID(), email, locale: 'en', mode: 'code' } });
    assert.equal(challenge.status, 200);
    const code = mail.calls.at(-1).text.match(/Sign-in code: (\d{6})/)[1];
    const verified = await request('/api/auth/verify', { method: 'POST', data: { challengeId: challenge.data.challengeId, code } });
    assert.equal(verified.status, 200);
    return { user: verified.data.user, cookie: verified.cookie.split(';')[0], csrf: verified.data.csrfToken };
  }
  return { store, mail, staff, bookings, active, owner, raw, create, input, change, ready, request, login, advance: ms => clock += ms };
}
const errorCode = code => error => { assert.equal(error.code, code); return true; };

test('empty workspace uses only real catalog and no prototype seeds or writes; requires a server actor', async () => {
  const s = setup(), result = await s.staff.snapshot(s.active);
  assert.deepEqual(result.catalog, CATALOG); assert.equal(result.revision, 0);
  for (const key of ['visits', 'medical', 'stock', 'products']) assert.deepEqual(result[key], {});
  assert.deepEqual(result.receipts, []); assert.equal(s.store.writes, 0);
  await assert.rejects(s.staff.snapshot(null), errorCode('AUTH_REQUIRED'));
  await assert.rejects(s.staff.mutate({ role: 'admin' }, { action: 'stock-save' }), errorCode('AUTH_REQUIRED'));
});

test('patient identity derives from authoritative owner and attendee, never client patient ID', async () => {
  const s = setup(), one = await s.create(), two = await s.create({ time: '12:00' }), other = await s.create({ time: '13:00', attendee: { kind: 'other', name: 'Other visitor', relationship: 'sister' } });
  const snapshot = await s.staff.snapshot(s.active);
  assert.equal(snapshot.visits[one.id].patientId, snapshot.visits[two.id].patientId);
  assert.notEqual(snapshot.visits[one.id].patientId, snapshot.visits[other.id].patientId);
  const saved = await s.change('medical-save', { bookingId: one.id, patientId: 'injected', fields: { dob: '1995-01-01', identifier: 'fixture-id', email: 'record-only@example.com', notes: 'first\nsecond' }, flags: { consultation: true, assessment: false, consent: false } });
  const patient = snapshot.visits[one.id].patientId;
  assert.equal(saved.medical.injected, undefined); assert.equal(saved.medical[patient].fields.notes, 'first\nsecond');
  assert.equal(s.raw(one.id).contact.email, s.owner.email);
  assert.equal(JSON.stringify(saved).includes('actorId'), false); assert.equal(JSON.stringify(saved).includes('server-owner-id'), false);
  assert.equal(s.store.records.get(LEDGER).data.staff.audit.at(-1).actorId, s.active.user.id);
});

test('session start needs arrival, all three reviews and explicit resolved proceed decision', async () => {
  const s = setup(), b = await s.create();
  await assert.rejects(s.change('session-start', { bookingId: b.id }), errorCode('ARRIVAL_REQUIRED'));
  await s.bookings.mutate('arrival', s.active.user, { requestId: randomUUID(), revision: 1 }, b.id, { admin: true });
  await assert.rejects(s.change('session-start', { bookingId: b.id }), errorCode('MEDICAL_REVIEW_REQUIRED'));
  await s.change('medical-save', { bookingId: b.id, fields: {}, flags: { consultation: true, assessment: false, consent: true } });
  await assert.rejects(s.change('session-start', { bookingId: b.id }), errorCode('MEDICAL_REVIEW_REQUIRED'));
  await s.change('medical-save', { bookingId: b.id, fields: {}, flags: { consultation: true, assessment: true, consent: true } });
  await assert.rejects(s.change('session-start', { bookingId: b.id }), errorCode('DECISION_REQUIRED'));
  await s.change('decision-save', { bookingId: b.id, decision: 'cancel-requested', note: 'Requested only' });
  assert.equal(s.raw(b.id).status, 'confirmed');
  await assert.rejects(s.change('session-start', { bookingId: b.id }), errorCode('DECISION_REQUIRED'));
  await s.change('decision-save', { bookingId: b.id, decision: 'proceed', note: '' });
  const started = await s.change('session-start', { bookingId: b.id });
  assert.equal(started.visits[b.id].stage, 'session'); assert.equal(s.raw(b.id).revision, 1);
  await assert.rejects(s.change('session-start', { bookingId: b.id }), errorCode('VISIT_STAGE_CONFLICT'));
});

test('finish is checkout, partial manual payments stay open and fully paid visits close with frozen receipts', async () => {
  const s = setup(), b = await s.create(); await s.ready(b);
  const mailCount = s.mail.calls.length;
  await s.change('session-notes', { bookingId: b.id, notes: 'Clinical notes\nSecond line' });
  const finished = await s.change('session-finish', { bookingId: b.id, aftercare: 'Aftercare\nSecond line', followup: 'In two weeks' });
  assert.equal(finished.visits[b.id].stage, 'checkout'); assert.equal(finished.visits[b.id].paid, 0); assert.deepEqual(finished.receipts, []);
  assert.equal(finished.visits[b.id].followup, true);
  await assert.rejects(s.change('visit-close', { bookingId: b.id }), errorCode('BALANCE_DUE'));
  await assert.rejects(s.change('payment-record', { bookingId: b.id, amount: 251, method: 'cash' }), errorCode('PAYMENT_OVER_BALANCE'));
  const partial = await s.change('payment-record', { bookingId: b.id, amount: 100, method: 'cash' });
  assert.equal(partial.visits[b.id].stage, 'checkout'); assert.equal(partial.visits[b.id].balance, 150);
  const paid = await s.change('payment-record', { bookingId: b.id, amount: 150, method: 'card' });
  assert.equal(paid.visits[b.id].stage, 'closed'); assert.equal(paid.visits[b.id].balance, 0); assert.equal(paid.receipts.length, 2);
  assert.equal(paid.receipts[0].kind, 'manual'); assert.equal(paid.receipts[0].total, 250); assert.equal(paid.receipts[0].lines[0].price, 250);
  assert.equal(s.mail.calls.length, mailCount, 'staff records never trigger customer emails');
  assert.equal(s.raw(b.id).status, 'confirmed', 'visit closure does not replace the booking status');
  await assert.rejects(s.change('payment-record', { bookingId: b.id, amount: 1, method: 'cash' }), errorCode('VISIT_STAGE_CONFLICT'));
});

test('catalog updates preserve historic booked prices; service additions resolve server price and effective occupancy', async () => {
  const s = setup(), b = await s.create(), originalItems = structuredClone(s.raw(b.id).items); await s.ready(b);
  const service = { ...structuredClone(CATALOG[0]), price: 999, active: true, prep: 5, buffer: 10, aftercare: 'Line 1\nLine 2', followup: 14, availability: 'available', imageURL: '/api/media/' + 'a'.repeat(64) };
  await s.change('service-save', { service });
  assert.deepEqual(s.raw(b.id).items, originalItems);
  const addition = await s.change('session-add-service', { bookingId: b.id, serviceId: 'basic', price: 1 });
  assert.equal(addition.visits[b.id].additions[0].price, 999); assert.equal(addition.visits[b.id].total, 1249);
  await s.change('service-save', { service: { ...service, price: 555, active: false } });
  assert.equal((await s.staff.snapshot(s.active)).visits[b.id].additions[0].price, 999);
  await assert.rejects(s.change('session-add-service', { bookingId: b.id, serviceId: 'basic' }), errorCode('INVALID_REQUEST'));
  await assert.rejects(s.change('service-save', { service: { ...service, imageURL: 'https://evil.example/photo.png' } }), errorCode('INVALID_REQUEST'));
});

test('extensions and additions reject overlapping appointments and closing-hour overflow atomically', async () => {
  const s = setup(), b = await s.create(); await s.create({ time: '12:00' }); await s.ready(b);
  const added = await s.change('session-extend', { bookingId: b.id, minutes: 15 });
  assert.equal(added.visits[b.id].extensionMinutes, 15);
  const revision = added.revision;
  await assert.rejects(s.change('session-extend', { bookingId: b.id, minutes: 30 }), errorCode('SLOT_UNAVAILABLE'));
  await assert.rejects(s.change('session-add-service', { bookingId: b.id, serviceId: 'brow' }), errorCode('SLOT_UNAVAILABLE'));
  const after = await s.staff.snapshot(s.active);
  assert.equal(after.revision, revision); assert.equal(after.visits[b.id].extensionMinutes, 15); assert.deepEqual(after.visits[b.id].additions, []);
  await s.change('session-finish', { bookingId: b.id });
  const late = await s.create({ time: '17:00' }); await s.ready(late);
  await s.change('session-extend', { bookingId: late.id, minutes: 15 });
  await assert.rejects(s.change('session-extend', { bookingId: late.id, minutes: 15 }), errorCode('SLOT_UNAVAILABLE'));
});

test('stock and variants are persisted with edit guards; product quantity is derived from linked stock', async () => {
  const s = setup();
  const item = { id: 'stock-one', name: 'Real stock item', quantity: 4, sku: 'REAL-01', type: 'consumable', kind: 'item', min: 2, expiry: '2027-01-01', condition: 'new', reason: 'Physical count', unit: 'piece', variants: [{ id: 'small', name: 'Small', quantity: 1 }, { id: 'large', name: 'Large', quantity: 3 }] };
  const saved = await s.change('stock-save', { item });
  assert.equal(saved.stock[item.id].quantity, 4); assert.equal(saved.stock[item.id].revision, 1);
  await s.change('product-save', { product: { id: 'product-one', name: 'Real product', price: 99.5, description: 'Description', category: 'care', active: true, stockId: item.id, quantity: 4 } });
  assert.equal((await s.staff.snapshot(s.active)).products['product-one'].quantity, 4);
  await s.change('stock-save', { item: { ...item, revision: 1, quantity: 6, variants: [] } });
  assert.equal((await s.staff.snapshot(s.active)).products['product-one'].quantity, 6);
  await assert.rejects(s.change('stock-save', { item: { ...item, revision: 1 } }), errorCode('STOCK_CONFLICT'));
  await assert.rejects(s.change('product-save', { product: { id: 'x', name: 'x', price: 1, active: true, stockId: 'missing' } }), errorCode('STOCK_NOT_FOUND'));
  await assert.rejects(s.change('product-save', { product: { id: 'x', name: 'x', price: 1, active: true, stockId: 'toString' } }), errorCode('STOCK_NOT_FOUND'));
});

test('same receipt retry after an unknown durable commit creates no second payment, receipt, or audit record', async () => {
  const s = setup(), b = await s.create(); await s.ready(b); await s.change('session-finish', { bookingId: b.id, aftercare: '', followup: '' });
  const input = await s.input('payment-record', { bookingId: b.id, amount: 100, method: 'bank' });
  s.store.unknownOnce = LEDGER;
  await assert.rejects(s.staff.mutate(s.active, input), /lost acknowledgement/);
  const first = await s.staff.snapshot(s.active), auditCount = s.store.records.get(LEDGER).data.staff.audit.length;
  assert.equal(first.receipts.length, 1); assert.equal(first.visits[b.id].paid, 100);
  const retried = await s.staff.mutate(s.active, input);
  assert.equal(retried.receipts.length, 1); assert.equal(retried.receipts[0].id, first.receipts[0].id); assert.equal(retried.revision, first.revision);
  assert.equal(s.store.records.get(LEDGER).data.staff.audit.length, auditCount);
  await assert.rejects(s.staff.mutate(s.active, { ...input, amount: 101 }), errorCode('IDEMPOTENCY_CONFLICT'));
});

test('CAS rejects stale workspace and booking revisions without lost updates and preserves shared booking state', async () => {
  const s = setup(), b = await s.create();
  const one = await s.input('note-save', { bookingId: b.id, note: 'one' }), two = { ...one, requestId: randomUUID(), note: 'two' };
  const concurrent = await Promise.allSettled([s.staff.mutate(s.active, one), s.staff.mutate(s.active, two)]);
  assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.find(result => result.status === 'rejected').reason.code, 'WORKSPACE_CONFLICT');
  const stale = await s.input('note-save', { bookingId: b.id, note: 'stale' });
  await s.bookings.mutate('update', s.owner, { requestId: randomUUID(), revision: 1, date: '2026-11-02', time: '12:00' }, b.id);
  await assert.rejects(s.staff.mutate(s.active, stale), errorCode('BOOKING_REVISION_CONFLICT'));
  assert.equal(s.raw(b.id)._staff.notes, concurrent.find(result => result.status === 'fulfilled').value.visits[b.id].notes);
  assert.equal((await s.staff.snapshot(s.active)).revision, 1);
  assert.equal(s.raw(b.id).date, '2026-11-02');
});

test('unsafe values, unknown actions, cancelled visits and unsupported payment methods are rejected without writes', async () => {
  const s = setup(), b = await s.create();
  for (const [action, extra] of [['unknown', {}], ['medical-save', { fields: { notes: '\u0000secret' }, flags: { consultation: true, assessment: true, consent: true } }], ['decision-save', { decision: 'cancelled' }], ['stock-save', { item: { id: '__proto__', name: 'x', quantity: 1 } }], ['stock-save', { item: { id: 'x', name: 'x', quantity: -1 } }]]) {
    await assert.rejects(s.change(action, { bookingId: b.id, ...extra }), errorCode('INVALID_REQUEST'));
  }
  await s.ready(b); await s.change('session-finish', { bookingId: b.id });
  await assert.rejects(s.change('payment-record', { bookingId: b.id, amount: 1, method: 'external-charge' }), errorCode('INVALID_REQUEST'));
  await assert.rejects(s.change('payment-record', { bookingId: b.id, amount: 0.001, method: 'cash' }), errorCode('INVALID_REQUEST'));
  const cancelled = await s.create({ time: '14:00' });
  await s.bookings.mutate('cancel', s.active.user, { requestId: randomUUID(), revision: 1 }, cancelled.id, { admin: true });
  await assert.rejects(s.change('note-save', { bookingId: cancelled.id, note: 'x' }), errorCode('BOOKING_CANCELLED'));
});

test('real OTP/customer API booking shares staff data while customer response excludes private clinical and visit records', async () => {
  const s = setup(), customer = await s.login();
  const created = await s.request('/api/bookings', { method: 'POST', ...customer, data: { requestId: randomUUID(), items: [{ serviceId: 'basic' }], date: '2026-11-01', time: '11:00', professional: 'any', contactName: 'API visitor', attendee: { kind: 'self' } } });
  assert.equal(created.status, 200); const booking = created.data.booking;
  await s.change('medical-save', { bookingId: booking.id, fields: { notes: 'private-clinical-marker' }, flags: { consultation: true, assessment: true, consent: true } });
  await s.change('note-save', { bookingId: booking.id, note: 'private-staff-marker' });
  const me = await s.request('/api/me', customer);
  assert.equal(me.status, 200); assert.equal(me.data.bookings[0].id, booking.id);
  for (const marker of ['private-clinical-marker', 'private-staff-marker', '_staff', 'patientId', 'medical', 'actorId']) assert.equal(JSON.stringify(me.data).includes(marker), false, marker);
});

test('workspace API enforces verified session, configured admin policy, origin and CSRF and attributes real session actor', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com');
  const input = { requestId: randomUUID(), revision: 0, action: 'stock-save', item: { id: 'zero', name: 'Actual empty stock', quantity: 0 }, actorId: 'forged-actor', role: 'admin' };
  assert.equal((await s.request('/api/admin/workspace')).status, 401);
  assert.equal((await s.request('/api/admin/workspace', customer)).status, 403);
  assert.equal((await s.request('/api/admin/workspace', { method: 'POST', ...customer, data: input })).status, 403);
  assert.equal((await s.request('/api/admin/workspace', { method: 'POST', ...admin, csrf: 'bad', data: input })).status, 403);
  assert.equal((await s.request('/api/admin/workspace', { method: 'POST', ...admin, origin: 'https://evil.example', data: input })).status, 403);
  assert.equal(s.store.records.has(LEDGER), false);
  const saved = await s.request('/api/admin/workspace', { method: 'POST', ...admin, data: input });
  assert.equal(saved.status, 200); assert.equal(saved.data.stock.zero.quantity, 0); assert.equal(saved.data.revision, 1);
  assert.equal(s.store.records.get(LEDGER).data.staff.audit[0].actorId, admin.user.id);
  assert.equal(JSON.stringify(saved.data).includes('forged-actor'), false);
  const open = setup({ CLINIME_ADMIN_ACCESS: 'verified-email' }), verified = await open.login('verified@example.com');
  assert.equal((await open.request('/api/admin/workspace', verified)).status, 200, 'explicit approved verified-email policy is respected');
});

test('bulk stock counts commit atomically and safe stock history reflects persisted changes only', async () => {
  const s = setup();
  const result = await s.change('stock-save', { items: [{ id: 'a', name: 'A', quantity: 0, reason: 'Initial physical count' }, { id: 'b', name: 'B', quantity: 4 }] });
  assert.equal(result.revision, 1); assert.equal(result.stockLog.length, 2);
  assert.equal(result.stockLog[0].quantityBefore, 0); assert.equal(result.stockLog[0].quantityAfter, 0);
  const before = structuredClone(result.stock);
  await assert.rejects(s.change('stock-save', { items: [{ id: 'a', name: 'A', quantity: 8, revision: 1 }, { id: 'b', name: 'B', quantity: -1, revision: 1 }] }), errorCode('INVALID_REQUEST'));
  const after = await s.staff.snapshot(s.active);
  assert.deepEqual(after.stock, before); assert.equal(after.revision, 1); assert.equal(after.stockLog.length, 2);
  assert.equal(JSON.stringify(after.stockLog).includes('actorId'), false);
});

test('contact attendance response and requested clinical decision never invent arrival or cancellation', async () => {
  const s = setup(), b = await s.create();
  const result = await s.change('attendance-save', { bookingId: b.id, answer: 'تطلب إعادة الجدولة' });
  assert.equal(result.visits[b.id].attendanceResponse.answer, 'تطلب إعادة الجدولة');
  assert.equal(s.raw(b.id).attendance, undefined); assert.equal(s.raw(b.id).status, 'confirmed');
  await s.change('decision-save', { bookingId: b.id, decision: 'reschedule-requested', note: 'Staff request only\nNeeds booking action' });
  assert.equal(s.raw(b.id).date, '2026-11-01'); assert.equal(s.raw(b.id).status, 'confirmed');
  await assert.rejects(s.change('attendance-save', { bookingId: b.id, answer: 'arrived' }), errorCode('INVALID_REQUEST'));
});

test('zero-priced configured services retain zero, close without invented receipts, and changed catalog reaches new customer bookings', async () => {
  const s = setup();
  await s.change('service-save', { service: { ...structuredClone(CATALOG[0]), price: 0 } });
  const config = await s.request('/api/config');
  assert.equal(config.data.catalog.find(service => service.id === 'basic').price, 0);
  const b = await s.create(); assert.equal(b.items[0].price, 0); await s.ready(b);
  await s.change('session-finish', { bookingId: b.id });
  const closed = await s.change('visit-close', { bookingId: b.id });
  assert.equal(closed.visits[b.id].stage, 'closed'); assert.equal(closed.visits[b.id].total, 0); assert.deepEqual(closed.receipts, []);
});

test('one doctor cannot start simultaneous sessions, and checkout keeps payment separate from doctor availability', async () => {
  const s = setup(), one = await s.create(), two = await s.create({ time: '13:00' });
  await s.ready(one);
  await assert.rejects(s.ready(two), errorCode('SESSION_IN_PROGRESS'));
  assert.equal(s.raw(one.id)._staff.stage, 'session'); assert.equal(s.raw(two.id)._staff.stage, 'waiting');
  await s.change('session-finish', { bookingId: one.id });
  const next = await s.change('session-start', { bookingId: two.id });
  assert.equal(next.visits[one.id].stage, 'checkout'); assert.equal(next.visits[one.id].balance, 250);
  assert.equal(next.visits[two.id].stage, 'session'); assert.deepEqual(next.receipts, []);
});

test('concurrent starts for the same assigned specialist serialize under CAS and retry stays blocked', async () => {
  const s = setup({ CLINIME_SPECIALISTS_JSON: JSON.stringify(LOCAL_PROFESSIONALS) }), one = await s.create({ professional: 'layla' }), two = await s.create({ time: '13:00', professional: 'layla' });
  for (const b of [one, two]) {
    await s.bookings.mutate('arrival', s.active.user, { requestId: randomUUID(), revision: 1 }, b.id, { admin: true });
    await s.change('medical-save', { bookingId: b.id, fields: {}, flags: { consultation: true, assessment: true, consent: true } });
    await s.change('decision-save', { bookingId: b.id, decision: 'proceed' });
  }
  const requests = await Promise.all([one, two].map(b => s.input('session-start', { bookingId: b.id })));
  const results = await Promise.allSettled(requests.map(input => s.staff.mutate(s.active, input)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.findIndex(result => result.status === 'rejected');
  assert.equal(results[rejected].reason.code, 'WORKSPACE_CONFLICT');
  await assert.rejects(s.change('session-start', { bookingId: requests[rejected].bookingId }), errorCode('SESSION_IN_PROGRESS'));
  assert.equal(Object.values((await s.staff.snapshot(s.active)).visits).filter(visit => visit.stage === 'session').length, 1);
});

test('different assigned specialists can start concurrently after CAS refresh without moving either booking', async () => {
  const s = setup({ CLINIME_SPECIALISTS_JSON: JSON.stringify(LOCAL_PROFESSIONALS) });
  const one = await s.create({ professional: 'layla' }), two = await s.create({ professional: 'noura', time: '14:00' });
  for (const b of [one, two]) await reviewForStart(s, b);
  const before = [one, two].map(b => structuredClone(s.raw(b.id)));
  const requests = await Promise.all([one, two].map(b => s.input('session-start', { bookingId: b.id, confirmProceed: true })));
  const results = await Promise.allSettled(requests.map(input => s.staff.mutate(s.active, input)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.findIndex(result => result.status === 'rejected');
  assert.equal(results[rejected].reason.code, 'WORKSPACE_CONFLICT');
  await s.change('session-start', { bookingId: requests[rejected].bookingId, confirmProceed: true });
  for (const [index, b] of [one, two].entries()) {
    const { _staff, ...booking } = s.raw(b.id), { _staff: prior, ...original } = before[index];
    assert.equal(_staff.stage, 'session'); assert.deepEqual(booking, original);
  }
});

test('unassigned and legacy bookings share one conservative active resource', async () => {
  const s = setup(), one = await s.create(), two = await s.create({ professional: 'gigi', time: '13:00' });
  await s.ready(one);
  await assert.rejects(s.ready(two), errorCode('SESSION_IN_PROGRESS'));
  delete s.raw(two.id).professional; // Historical fixture with no assignment.
  await assert.rejects(s.change('session-start', { bookingId: two.id }), errorCode('SESSION_IN_PROGRESS'));
  await s.change('session-finish', { bookingId: one.id });
  assert.equal((await s.change('session-start', { bookingId: two.id })).visits[two.id].stage, 'session');
});

test('arrived appointments start before or after their slot, on prior or future booked dates and before opening', async () => {
  for (const { date = '2026-11-01', elapsed = 0, expected } of [
    { expected: '2026-11-01T07:00:00.000Z' },
    { elapsed: 2 * 3600000, expected: '2026-11-01T09:00:00.000Z' },
    { elapsed: 24 * 3600000, expected: '2026-11-02T07:00:00.000Z' },
    { date: '2026-11-02', expected: '2026-11-01T07:00:00.000Z' },
    { elapsed: -2 * 3600000, expected: '2026-11-01T05:00:00.000Z' },
  ]) {
    const s = setup(), b = await s.create({ date }); await reviewForStart(s, b);
    const before = structuredClone(s.raw(b.id)); s.advance(elapsed);
    const started = await s.change('session-start', { bookingId: b.id, confirmProceed: true });
    assert.equal(started.visits[b.id].startedAt, expected); assert.equal(started.visits[b.id].stage, 'session');
    const { _staff, ...booking } = s.raw(b.id), { _staff: prior, ...original } = before;
    assert.deepEqual(booking, original); assert.deepEqual(booking.attendance, original.attendance);
    assert.equal((await s.change('session-finish', { bookingId: b.id })).visits[b.id].stage, 'checkout');
  }
});

test('an unfinished session from yesterday keeps its resource until actually finished', async () => {
  const s = setup(), yesterday = await s.create(); await s.ready(yesterday);
  s.advance(24 * 3600000);
  const today = await s.create({ date: '2026-11-02' });
  await assert.rejects(s.ready(today), errorCode('SESSION_IN_PROGRESS'));
  await s.change('session-finish', { bookingId: yesterday.id });
  const result = await s.change('session-start', { bookingId: today.id });
  assert.equal(result.visits[yesterday.id].stage, 'checkout');
  assert.equal(result.visits[today.id].stage, 'session');
  assert.equal(s.raw(yesterday.id).date, '2026-11-01'); assert.equal(s.raw(today.id).date, '2026-11-02');
});

test('actual product form can create stock and atomically edit its linked count with revision and variant guards', async () => {
  const s = setup();
  const product = { id: 'actual-product', name: 'Actual product form', description: 'Product description', category: 'care', price: 89, active: true, stockId: null, stockSKU: 'NEW-SKU', quantity: 0, reason: 'Actual initial count' };
  const created = await s.change('product-save', { product }), stockId = created.products[product.id].stockId;
  assert.equal(created.products[product.id].quantity, 0); assert.equal(created.stock[stockId].sku, 'NEW-SKU'); assert.equal(created.stockLog.length, 1);
  const changed = await s.change('product-save', { product: { ...product, stockId, stockRevision: 1, quantity: 7, reason: 'Physical recount' } });
  assert.equal(changed.stock[stockId].quantity, 7); assert.equal(changed.products[product.id].quantity, 7); assert.equal(changed.stockLog.at(-1).quantityBefore, 0);
  await assert.rejects(s.change('product-save', { product: { ...product, stockId, stockRevision: 1, quantity: 9 } }), errorCode('STOCK_CONFLICT'));
  await s.change('stock-save', { item: { ...changed.stock[stockId], variants: [{ id: 'variant', name: 'Variant', quantity: 7 }] } });
  await assert.rejects(s.change('product-save', { product: { ...product, stockId, quantity: 9 } }), errorCode('VARIANT_STOCK_REQUIRED'));
  assert.equal((await s.staff.snapshot(s.active)).products[product.id].quantity, 7);
});

test('actual service follow-up days and description persist, and session follow-up checkbox accepts boolean values', async () => {
  const s = setup(), service = { ...structuredClone(CATALOG[0]), description: 'Actual service description\nSecond line', followup: 21 };
  const saved = await s.change('service-save', { service });
  assert.equal(saved.catalog[0].followup, 21); assert.equal(saved.catalog[0].description, service.description);
  await assert.rejects(s.change('service-save', { service: { ...service, followup: true } }), errorCode('INVALID_REQUEST'));
  const b = await s.create(); await s.ready(b);
  const finished = await s.change('session-finish', { bookingId: b.id, followup: false });
  assert.equal(finished.visits[b.id].followup, false); assert.equal(finished.visits[b.id].stage, 'checkout');
});

test('sale price is nullable SAR including explicit zero, with option prices edited independently', async () => {
  const s = setup(), basic = structuredClone(CATALOG[0]);
  const sale = await s.change('service-save', { service: { ...basic, discount: 199.5 } });
  assert.equal(sale.catalog[0].price, 250); assert.equal(sale.catalog[0].discount, 199.5);
  const free = await s.change('service-save', { service: { ...basic, discount: 0 } });
  assert.equal(free.catalog[0].discount, 0);
  await assert.rejects(s.change('service-save', { service: { ...basic, discount: 251 } }), errorCode('INVALID_REQUEST'));
  await assert.rejects(s.change('service-save', { service: { ...structuredClone(CATALOG[2]), discount: 100 } }), errorCode('OPTION_DISCOUNT'));
  const cleared = await s.change('service-save', { service: { ...basic, discount: null } });
  assert.equal(cleared.catalog[0].discount, null);
});

test('late actual start rejects extensions and service additions overlapping a later reservation without changing saved duration', async () => {
  const s = setup(), late = await s.create({ time: '11:00' });
  const next = await s.create({ time: '15:00' }); s.advance(4 * 3600000);
  const started = await s.ready(late);
  assert.equal(started.visits[late.id].startedAt, '2026-11-01T11:00:00.000Z');
  const customerSlots = await s.bookings.availability('2026-11-01', [{ serviceId: 'brow' }]);
  assert.equal(customerSlots.slots.includes('14:00'), false); assert.equal(customerSlots.slots.includes('14:30'), false);
  assert.equal(customerSlots.slots.includes('16:00'), true);
  const adminSlots = await s.bookings.adminAvailability(next.id, '2026-11-01');
  assert.equal(adminSlots.slots.includes('14:30'), false); assert.equal(adminSlots.slots.includes('15:00'), true);
  await assert.rejects(s.create({ time: '14:30', items: [{ serviceId: 'brow' }] }), errorCode('SLOT_UNAVAILABLE'));
  await assert.rejects(s.change('session-extend', { bookingId: late.id, minutes: 45 }), errorCode('SLOT_UNAVAILABLE'));
  await assert.rejects(s.change('session-add-service', { bookingId: late.id, serviceId: 'deep' }), errorCode('SLOT_UNAVAILABLE'));
  const allowed = await s.change('session-extend', { bookingId: late.id, minutes: 15 });
  assert.equal(allowed.visits[late.id].extensionMinutes, 15);
  await assert.rejects(s.change('session-add-service', { bookingId: late.id, serviceId: 'brow' }), errorCode('SLOT_UNAVAILABLE'));
  const current = await s.staff.snapshot(s.active);
  assert.equal(current.visits[late.id].extensionMinutes, 15); assert.deepEqual(current.visits[late.id].additions, []);
});

test('initial session start accepts overlap and time after closing without moving reservations', async () => {
  const s = setup(), late = await s.create({ time: '11:00' });
  const reserved = await s.create({ time: '15:00' }), reservation = structuredClone(s.raw(reserved.id)); s.advance(4.5 * 3600000);
  await s.ready(late);
  const current = await s.staff.snapshot(s.active);
  assert.equal(current.visits[late.id].stage, 'session'); assert.equal(current.visits[late.id].startedAt, '2026-11-01T11:30:00.000Z');
  assert.deepEqual(s.raw(reserved.id), reservation);
  const closing = setup(), earlier = await closing.create({ time: '11:00' }); closing.advance(9 * 3600000);
  await closing.ready(earlier);
  assert.equal((await closing.staff.snapshot(closing.active)).visits[earlier.id].stage, 'session');
  assert.equal((await closing.change('session-finish', { bookingId: earlier.id })).visits[earlier.id].stage, 'checkout');
});

test('reference import creates fixed label metadata with unknown counts/prices and no prototype physical facts', async () => {
  const s = setup(), imported = await s.change('catalog-import-reference');
  assert.equal(imported.referenceImported, true); assert.equal(Object.keys(imported.stock).length, 18); assert.equal(Object.keys(imported.products).length, 2);
  assert.deepEqual(imported.catalog, CATALOG);
  assert.equal(imported.stock['ref-material-01'].name, 'قفازات نيتريل');
  assert.equal(imported.stock['ref-material-01'].sku, 'ESS-001');
  assert.equal(imported.products['ref-product-01'].name, 'غسول لطيف للبشرة');
  assert.equal(imported.products['ref-product-02'].name, 'سيروم الترطيب');
  for (const item of Object.values(imported.stock)) { assert.equal(item.quantity, 0); assert.equal(item.quantityVerified, false); assert.equal(item.expiry, ''); assert.deepEqual(item.variants, []); }
  for (const product of Object.values(imported.products)) { assert.equal(product.price, 0); assert.equal(product.priceVerified, false); assert.equal(product.quantityVerified, false); assert.equal(imported.stock[product.stockId].quantityVerified, false); }
  assert.equal(imported.stockLog.length, 0, 'import does not invent stock movements');
});

test('reference retries preserve existing edits and explicit count/price confirmation, including real zero', async () => {
  const s = setup(), request = await s.input('catalog-import-reference'); s.store.unknownOnce = LEDGER;
  await assert.rejects(s.staff.mutate(s.active, request), /lost acknowledgement/);
  const imported = await s.staff.mutate(s.active, request);
  assert.equal(Object.keys(imported.stock).length, 18); assert.equal(s.store.records.get(LEDGER).data.staff.audit.length, 1);
  const material = imported.stock['ref-material-01'];
  await s.change('stock-save', { item: { ...material, quantity: 12, reason: 'Actual physical count' } });
  const product = imported.products['ref-product-01'];
  const verified = await s.change('product-save', { product: { ...product, quantity: 0, price: 0, stockRevision: 1 } });
  assert.equal(verified.products[product.id].quantityVerified, true); assert.equal(verified.products[product.id].priceVerified, true);
  const currentStock = structuredClone(verified.stock), currentProducts = structuredClone(verified.products);
  const repeated = await s.change('catalog-import-reference');
  assert.deepEqual(repeated.stock, currentStock); assert.deepEqual(repeated.products, currentProducts);
  assert.equal(repeated.stock['ref-material-01'].quantity, 12); assert.equal(repeated.stock['ref-material-01'].quantityVerified, true);
  assert.equal(repeated.stockLog[0].quantityBeforeVerified, false); assert.equal(repeated.stockLog[0].quantityAfterVerified, true);
});

test('unrelated metadata edits cannot verify placeholder counts or prices, and legacy records remain compatible', async () => {
  const s = setup(), imported = await s.change('catalog-import-reference');
  const item = { ...imported.stock['ref-material-01'], name: 'Updated material label', quantityVerified: true }; delete item.quantity;
  const edited = await s.change('stock-save', { item }); assert.equal(edited.stock[item.id].quantityVerified, false);
  const product = imported.products['ref-product-01'];
  const editedProduct = await s.change('product-save', { product: { id: product.id, stockId: product.stockId, name: 'Updated product label', active: true, description: '', category: 'care', priceVerified: true, quantityVerified: true } });
  assert.equal(editedProduct.products[product.id].priceVerified, false); assert.equal(editedProduct.products[product.id].quantityVerified, false);
  const ledger = s.store.records.get(LEDGER).data;
  delete ledger.staff.stock[item.id].quantityVerified;
  delete ledger.staff.products[product.id].priceVerified;
  const legacy = await s.staff.snapshot(s.active);
  assert.equal(legacy.stock[item.id].quantityVerified, true); assert.equal(legacy.products[product.id].priceVerified, true);
});

test('reference import API uses existing verified-admin, origin and CSRF checks without booking identity', async () => {
  const s = setup(), admin = await s.login('admin@example.com'), customer = await s.login();
  const input = { requestId: randomUUID(), revision: 0, action: 'catalog-import-reference' };
  assert.equal((await s.request('/api/admin/workspace', { method: 'POST', data: input })).status, 401);
  assert.equal((await s.request('/api/admin/workspace', { method: 'POST', ...customer, data: input })).status, 403);
  assert.equal((await s.request('/api/admin/workspace', { method: 'POST', ...admin, csrf: 'bad', data: input })).status, 403);
  assert.equal((await s.request('/api/admin/workspace', { method: 'POST', ...admin, origin: 'https://evil.example', data: input })).status, 403);
  const imported = await s.request('/api/admin/workspace', { method: 'POST', ...admin, data: input });
  assert.equal(imported.status, 200); assert.equal(imported.data.referenceImported, true); assert.equal(imported.data.products['ref-product-01'].priceVerified, false);
  assert.match(imported.data.catalogVersion, /^[a-f0-9]{64}$/);
});

async function reviewForStart(s, booking) {
  await s.bookings.mutate('arrival', s.active.user, { requestId: randomUUID(), revision: s.raw(booking.id).revision }, booking.id, { admin: true });
  await s.change('medical-save', { bookingId: booking.id, fields: {}, flags: { consultation: true, assessment: true, consent: true } });
}

test('explicit start intent records proceed when absent, while prior pending decisions remain authoritative', async () => {
  const s = setup(), b = await s.create(); await reviewForStart(s, b);
  await assert.rejects(s.change('session-start', { bookingId: b.id }), errorCode('DECISION_REQUIRED'));
  await assert.rejects(s.change('session-start', { bookingId: b.id, confirmProceed: 'true' }), errorCode('INVALID_REQUEST'));
  const started = await s.change('session-start', { bookingId: b.id, confirmProceed: true });
  assert.equal(started.visits[b.id].stage, 'session'); assert.equal(started.visits[b.id].decision.value, 'proceed');
  assert.equal(started.visits[b.id].decision.source, 'session-start');
  for (const decision of ['hold', 'reschedule-requested', 'cancel-requested']) {
    const held = setup(), booking = await held.create(); await reviewForStart(held, booking);
    await held.change('decision-save', { bookingId: booking.id, decision });
    await assert.rejects(held.change('session-start', { bookingId: booking.id, confirmProceed: true, confirmTimeConflict: true }), errorCode('DECISION_REQUIRED'));
    assert.equal(held.raw(booking.id)._staff.decision.value, decision); assert.equal(held.raw(booking.id)._staff.stage, 'waiting');
  }
});

test('late start needs no schedule acknowledgement, changes no reservation and retries its actual timestamp once', async () => {
  const s = setup(), late = await s.create({ time: '12:00' });
  await s.create({ time: '13:00', items: [{ serviceId: 'basic' }, { serviceId: 'brow' }] });
  const future = await s.create({ time: '15:00', items: [{ serviceId: 'basic' }, { serviceId: 'lashes' }] });
  await reviewForStart(s, late); s.advance((4 * 60 + 43) * 60000);
  const before = structuredClone(s.raw(late.id)), futureBefore = structuredClone(s.raw(future.id)), first = await s.input('session-start', { bookingId: late.id, confirmProceed: true });
  s.store.unknownOnce = LEDGER;
  await assert.rejects(s.staff.mutate(s.active, first), /lost acknowledgement/);
  const committed = structuredClone(s.raw(late.id)), auditCount = s.store.records.get(LEDGER).data.staff.audit.length;
  s.advance(60000);
  const retried = await s.staff.mutate(s.active, first);
  assert.equal(retried.visits[late.id].stage, 'session'); assert.equal(committed._staff.startedAt, '2026-11-01T11:43:00.000Z');
  assert.equal(committed._staff.startTimeConflictOverride, undefined);
  assert.equal(s.store.records.get(LEDGER).data.staff.audit.length, auditCount);
  assert.equal(s.raw(late.id)._staff.startedAt, committed._staff.startedAt); assert.deepEqual(s.raw(future.id), futureBefore);
  assert.equal(JSON.stringify(retried).includes('startTimeConflictOverride'), false); assert.equal(JSON.stringify(retried).includes('actorId'), false);
  const audit = s.store.records.get(LEDGER).data.staff.audit.at(-1);
  assert.deepEqual(audit.startConfirmation, { confirmProceed: true, scheduledDate: before.date, scheduledTime: before.time, professional: before.professional, startedAt: committed._staff.startedAt });
  const { _staff, ...unchangedBooking } = committed;
  const { _staff: priorVisit, ...originalBooking } = before;
  assert.deepEqual(unchangedBooking, originalBooking, 'starting does not edit customer booking facts');
  assert.equal(_staff.decision.source, 'session-start'); assert.equal(priorVisit.decision, undefined);
  await assert.rejects(s.change('session-extend', { bookingId: late.id, minutes: 15 }), errorCode('SLOT_UNAVAILABLE'));
  await assert.rejects(s.change('session-add-service', { bookingId: late.id, serviceId: 'brow' }), errorCode('SLOT_UNAVAILABLE'));
  const slots = await s.bookings.availability('2026-11-01', [{ serviceId: 'brow' }]);
  assert.equal(slots.slots.includes('15:00'), false, 'accepted actual interval remains reserved');
});

test('start acknowledgements never bypass arrival, clinical reviews or active-resource guards', async () => {
  const s = setup(), b = await s.create();
  const flags = { confirmProceed: true, confirmTimeConflict: true };
  await assert.rejects(s.change('session-start', { bookingId: b.id, ...flags }), errorCode('ARRIVAL_REQUIRED'));
  await s.bookings.mutate('arrival', s.active.user, { requestId: randomUUID(), revision: 1 }, b.id, { admin: true });
  await assert.rejects(s.change('session-start', { bookingId: b.id, ...flags }), errorCode('MEDICAL_REVIEW_REQUIRED'));
  await s.change('medical-save', { bookingId: b.id, fields: {}, flags: { consultation: true, assessment: true, consent: false } });
  await assert.rejects(s.change('session-start', { bookingId: b.id, ...flags }), errorCode('MEDICAL_REVIEW_REQUIRED'));
  await s.change('medical-save', { bookingId: b.id, fields: {}, flags: { consultation: true, assessment: true, consent: true } });
  await s.change('session-start', { bookingId: b.id, ...flags });
  const next = await s.create({ time: '13:00' }); await reviewForStart(s, next);
  await assert.rejects(s.change('session-start', { bookingId: next.id, ...flags }), errorCode('SESSION_IN_PROGRESS'));
});

test('checkout and closed visits release their active session resource', async () => {
  for (const completedStage of ['checkout', 'closed']) {
    const s = setup(), completed = await s.create({ time: '11:00' }), waiting = await s.create({ time: '13:00' });
    await s.ready(completed); await s.change('session-finish', { bookingId: completed.id, followup: false });
    if (completedStage === 'closed') await s.change('payment-record', { bookingId: completed.id, amount: 250, method: 'cash' });
    s.advance(3600000); await reviewForStart(s, waiting);
    const started = await s.change('session-start', { bookingId: waiting.id, confirmProceed: true });
    assert.equal(started.visits[waiting.id].stage, 'session'); assert.equal(started.visits[completed.id].stage, completedStage);
    assert.equal(s.raw(waiting.id)._staff.startTimeConflictOverride, undefined);
  }
});
