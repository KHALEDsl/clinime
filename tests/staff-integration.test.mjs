import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFixture } from '../scripts/staff-local-server.mjs';

const ok = result => { assert.equal(result.status, 200, JSON.stringify(result.data)); return result.data; };
const bookingInput = extra => ({ requestId: randomUUID(), items: [{ serviceId: 'basic' }], date: '2026-11-01', time: '12:00', professional: 'any', contactName: 'Manual customer fixture', attendee: { kind: 'self' }, ...extra });
async function workspace(fixture, action, extra = {}, account = fixture.sessions.reception) {
  const current = ok(await fixture.request('/api/admin/workspace', { account }));
  return fixture.request('/api/admin/workspace', { method: 'POST', account, data: { requestId: randomUUID(), revision: current.revision, action, ...(extra.bookingId ? { bookingRevision: current.bookings.find(booking => booking.id === extra.bookingId).revision } : {}), ...extra } });
}

test('manual API booking uses customer ownership and server actor, stable retry creates one booking and one email', async () => {
  const s = await createFixture(), staff = s.sessions.reception, customer = s.sessions.customer;
  const input = bookingInput({ customerEmail: customer.user.email, ownerId: staff.user.id, role: 'doctor', contactEmail: staff.user.email });
  const before = s.mail.calls.length;
  const created = ok(await s.request('/api/admin/bookings', { method: 'POST', account: staff, data: input }));
  const id = created.booking.id;
  assert.equal(created.booking.contact.email, customer.user.email);
  assert.equal(s.ledger().bookings[id].ownerId, customer.user.id);
  assert.equal(s.ledger().bookings[id]._adminAudit.at(-1).actorId, staff.user.id);
  assert.equal(created.booking.ownerId, undefined); assert.equal(created.booking._adminAudit, undefined);
  assert.equal(s.mail.calls.length, before + 1); assert.equal(s.mail.calls.at(-1).to, customer.user.email);
  const retried = ok(await s.request('/api/admin/bookings', { method: 'POST', account: staff, data: input }));
  assert.equal(retried.booking.id, id); assert.equal(Object.keys(s.ledger().bookings).length, 5); assert.equal(s.mail.calls.length, before + 1);
  const changed = await s.request('/api/admin/bookings', { method: 'POST', account: staff, data: { ...input, time: '12:30' } });
  assert.equal(changed.status, 409); assert.equal(changed.data.error.code, 'IDEMPOTENCY_CONFLICT');
  const customerMe = ok(await s.request('/api/me', { account: customer })), staffMe = ok(await s.request('/api/me', { account: staff })), otherMe = ok(await s.request('/api/me', { account: s.sessions.other }));
  assert.equal(customerMe.bookings.some(booking => booking.id === id), true);
  assert.equal(staffMe.bookings.length, 0); assert.equal(otherMe.bookings.some(booking => booking.id === id), false);
  assert.equal((await s.request('/api/bookings/' + id, { method: 'DELETE', account: s.sessions.other, data: { requestId: randomUUID(), revision: 1 } })).status, 404);
});

test('manual booking request identity cannot be reused for a different customer or after unknown durable acknowledgement', async () => {
  const s = await createFixture(), account = s.sessions.reception;
  const input = bookingInput({ customerEmail: s.sessions.customer.user.email });
  s.store.unknownOnce = 'clinic/booking-ledger-v1';
  assert.equal((await s.request('/api/admin/bookings', { method: 'POST', account, data: input })).status, 503);
  const recovered = ok(await s.request('/api/admin/bookings', { method: 'POST', account, data: input }));
  assert.equal(Object.keys(s.ledger().bookings).length, 5);
  const crossed = await s.request('/api/admin/bookings', { method: 'POST', account, data: { ...input, customerEmail: s.sessions.other.user.email, time: '13:00' } });
  assert.equal(crossed.status, 409); assert.equal(crossed.data.error.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(s.ledger().bookings[recovered.booking.id]._adminAudit.length, 1);
});

test('unverified challenges and client claims never grant manual booking or workspace access', async () => {
  const s = await createFixture({ seed: false });
  const challenge = ok(await s.request('/api/auth/request', { method: 'POST', data: { requestId: randomUUID(), email: 'unverified@example.invalid', locale: 'en', mode: 'code' } }));
  assert.match(challenge.challengeId, /^[a-f0-9]{64}$/);
  for (const route of ['/api/admin/workspace', '/api/admin/bookings']) assert.equal((await s.request(route, { headers: { 'X-Role': 'doctor', 'X-Admin-Email': 'unverified@example.invalid' } })).status, 401);
  assert.equal((await s.request('/api/admin/bookings', { method: 'POST', data: bookingInput({ customerEmail: 'unverified@example.invalid', role: 'admin' }) })).status, 401);
  assert.equal(s.ledger(), null);
});

test('catalog API reflects saved description and follow-up internally, publishes current prices, preserves historical snapshots and stale-version guard', async () => {
  const s = await createFixture(), account = s.sessions.reception;
  const previous = ok(await s.request('/api/config'));
  const raw = structuredClone(previous.catalog.find(service => service.id === 'basic'));
  const saved = ok(await workspace(s, 'service-save', { service: { ...raw, price: 400, discount: 199.5, duration: 45, description: 'Actual editable description', followup: 21, aftercare: 'Internal care notes', active: true, availability: 'available' } }));
  assert.equal(saved.catalog.find(service => service.id === 'basic').description, 'Actual editable description');
  assert.equal(saved.catalog.find(service => service.id === 'basic').followup, 21);
  const current = ok(await s.request('/api/config')), publicService = current.catalog.find(service => service.id === 'basic');
  assert.notEqual(current.catalogVersion, previous.catalogVersion);
  assert.equal(publicService.price, 199.5);
  assert.equal(publicService.aftercare, undefined);
  const old = s.ledger().bookings[s.bookings[0].id]; assert.equal(old.items[0].price, 250); assert.equal(old.items[0].duration, 40);
  const input = bookingInput({ customerEmail: s.sessions.customer.user.email, catalogVersion: previous.catalogVersion });
  const stale = await s.request('/api/admin/bookings', { method: 'POST', account, data: input });
  assert.equal(stale.status, 409); assert.equal(stale.data.error.code, 'CATALOG_CHANGED');
  const created = ok(await s.request('/api/admin/bookings', { method: 'POST', account, data: { ...input, requestId: randomUUID(), catalogVersion: current.catalogVersion } }));
  assert.equal(created.booking.items[0].price, 199.5); assert.equal(created.booking.items[0].duration, 45);
  assert.equal(s.ledger().bookings[s.bookings[0].id].items[0].price, 250);
});

test('service media API requires authenticated CSRF-protected uploads, rejects SVG and invalid signatures, serves valid content and handles missing media', async () => {
  const s = await createFixture(), account = s.sessions.reception;
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=';
  const data = { dataUrl: 'data:image/png;base64,' + png };
  assert.equal((await s.request('/api/admin/assets', { method: 'POST', data })).status, 401);
  assert.equal((await s.request('/api/admin/assets', { method: 'POST', account: { ...account, csrfToken: 'bad' }, data })).status, 403);
  assert.equal((await s.request('/api/admin/assets', { method: 'POST', account, originHeader: 'https://evil.example', data })).status, 403);
  assert.equal((await s.request('/api/admin/assets', { method: 'POST', account, data: { dataUrl: 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64') } })).status, 400);
  assert.equal((await s.request('/api/admin/assets', { method: 'POST', account, data: { dataUrl: 'data:image/png;base64,' + Buffer.from('not a PNG').toString('base64') } })).status, 400);
  const uploaded = ok(await s.request('/api/admin/assets', { method: 'POST', account, data }));
  assert.match(uploaded.url, /^\/api\/media\/[a-f0-9]{64}$/);
  const fetched = await s.request(uploaded.url);
  assert.equal(fetched.status, 200); assert.equal(fetched.headers.get('content-type'), 'image/png'); assert.deepEqual(fetched.bytes, Buffer.from(png, 'base64'));
  assert.equal((await s.request(uploaded.url, { headers: { 'If-None-Match': fetched.headers.get('etag') } })).status, 304);
  const missing = await s.request('/api/media/' + '0'.repeat(64)); assert.equal(missing.status, 404); assert.equal(missing.data.error.code, 'NOT_FOUND');
});

test('reception and doctor API lifecycle shares real booking while clinical fields and manual receipts stay out of customer projections', async () => {
  const s = await createFixture(), b = s.bookings[0], reception = s.sessions.reception, doctor = s.sessions.doctor;
  const before = s.mail.calls.length;
  ok(await s.request('/api/admin/bookings/' + b.id + '/arrival', { method: 'POST', account: reception, data: { requestId: randomUUID(), revision: 1 } }));
  ok(await workspace(s, 'medical-save', { bookingId: b.id, fields: { notes: 'PRIVATE-MEDICAL-INTEGRATION\nSecond line', allergies: 'PRIVATE-ALLERGY' }, flags: { consultation: true, assessment: true, consent: true } }, doctor));
  ok(await workspace(s, 'decision-save', { bookingId: b.id, decision: 'proceed', note: 'PRIVATE-DECISION' }, doctor));
  ok(await workspace(s, 'session-start', { bookingId: b.id }, doctor));
  ok(await workspace(s, 'session-notes', { bookingId: b.id, notes: 'PRIVATE-SESSION\nSecond line' }, doctor));
  ok(await workspace(s, 'session-add-service', { bookingId: b.id, serviceId: 'brow', price: 1 }, doctor));
  const finish = ok(await workspace(s, 'session-finish', { bookingId: b.id, aftercare: 'PRIVATE-AFTERCARE', followup: true }, doctor));
  assert.equal(finish.visits[b.id].stage, 'checkout'); assert.equal(finish.visits[b.id].total, 370); assert.equal(finish.visits[b.id].followup, true);
  const partial = ok(await workspace(s, 'payment-record', { bookingId: b.id, amount: 125, method: 'cash' }, reception));
  const myTotals = async () => ok(await s.request('/api/me', { account: s.sessions.customer })).bookings.find(row => row.id === b.id).paymentSummary;
  assert.deepEqual(await myTotals(), { total: 370, paid: 125, balance: 245 });
  assert.equal(partial.visits[b.id].balance, 245); assert.equal(partial.visits[b.id].stage, 'checkout');
  const paid = ok(await workspace(s, 'payment-record', { bookingId: b.id, amount: 245, method: 'bank' }, reception));
  assert.deepEqual(await myTotals(), { total: 370, paid: 370, balance: 0 });
  assert.equal(paid.visits[b.id].stage, 'closed'); assert.equal(paid.receipts.length, 2); assert.equal(paid.receipts[0].kind, 'manual');
  assert.equal(s.mail.calls.length, before, 'clinical/manual payment operations send no additional email');
  const me = ok(await s.request('/api/me', { account: s.sessions.customer }));
  assert.equal(me.bookings.find(booking => booking.id === b.id).attendance.status, 'arrived');
  for (const marker of ['PRIVATE-MEDICAL', 'PRIVATE-ALLERGY', 'PRIVATE-SESSION', 'PRIVATE-DECISION', 'PRIVATE-AFTERCARE', '_staff', 'patientId', 'receipts', 'actorId']) assert.equal(JSON.stringify(me).includes(marker), false, marker);
  const audit = s.ledger().staff.audit;
  assert.equal(audit.find(entry => entry.action === 'medical-save').actorId, doctor.user.id);
  assert.equal(audit.find(entry => entry.action === 'payment-record').actorId, reception.user.id);
  assert.equal(paid.bookings[0]._staff, undefined); assert.equal(paid.bookings[0].ownerId, undefined);
});
