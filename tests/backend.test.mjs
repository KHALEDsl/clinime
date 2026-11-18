import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAPI } from '../server/api.mjs';
import { createResendMail } from '../server/mail.mjs';

const clone = value => structuredClone(value);
class FakeStore {
  records = new Map(); version = 0; unknownOnce = null;
  async getWithMetadata(key) { const row = this.records.get(key); return row ? clone(row) : null; }
  async setJSON(key, value, options) {
    const row = this.records.get(key);
    if (options.onlyIfNew && row || options.onlyIfMatch && row?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++this.version); this.records.set(key, { data: clone(value), etag, metadata: {} });
    if (this.unknownOnce === key) { this.unknownOnce = null; throw new Error('response lost after durable commit'); }
    return { modified: true, etag };
  }
}
class FakeMail {
  messages = new Map(); calls = []; status = 'sent'; throwOnce = false;
  async send(message) { this.calls.push(clone(message)); if (this.throwOnce) { this.throwOnce = false; throw Error('timeout'); } if (this.status === 'sent') this.messages.set(message.key, clone(message)); return { status: this.status }; }
}
function setup(overrides = {}) {
  const store = new FakeStore(), mail = new FakeMail(); let clock = Date.parse('2026-10-28T08:00:00Z');
  const env = { APP_SECRET: 'unit-test-secret-with-at-least-thirty-two-characters', PUBLIC_ORIGIN: 'https://clinic.example', RESEND_API_KEY: 'test-only', EMAIL_FROM: 'Clinic <bookings@clinic.example>', CLINIC_SCHEDULE_JSON: JSON.stringify({ timeZone: 'Asia/Riyadh', weekdays: [0, 1, 2, 3, 4, 5, 6], open: '10:00', close: '18:00', stepMinutes: 30, horizonDays: 60 }), ...overrides };
  const app = createAPI({ store, mail, env, now: () => clock });
  async function request(path, { method = 'GET', data, account, origin = env.PUBLIC_ORIGIN, ip = '192.0.2.1', headers = {} } = {}) {
    const h = { ...headers }; if (method !== 'GET') h.Origin = origin;
    if (data !== undefined) h['Content-Type'] = 'application/json';
    if (account) { h.Cookie = account.cookie; h['X-CSRF-Token'] = account.csrfToken; }
    const response = await app(new Request('https://clinic.example' + path, { method, headers: h, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }), { ip });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  async function challenge(address = 'one@example.com') {
    const id = randomUUID(), result = await request('/api/auth/request', { method: 'POST', data: { requestId: id, email: address, locale: 'en', mode: 'code' } });
    assert.equal(result.status, 200, JSON.stringify(result));
    const message = [...mail.messages.values()].find(m => m.to === address); const code = message.text.match(/Sign-in code: (\d{6})/)[1], token = message.text.match(/token=([\w-]+)/)[1];
    return { ...result.data, code, token, requestId: id, address };
  }
  async function login(address = 'one@example.com') {
    const c = await challenge(address), result = await request('/api/auth/verify', { method: 'POST', data: { challengeId: c.challengeId, code: c.code } });
    assert.equal(result.status, 200, JSON.stringify(result)); return { ...result.data, cookie: result.cookie.split(';')[0] };
  }
  return { store, mail, request, challenge, login, env, advance: ms => clock += ms };
}
const bookingInput = (extra = {}) => ({ requestId: randomUUID(), items: [{ serviceId: 'basic', optionId: null }, { serviceId: 'hydra', optionId: 'deluxe' }], date: '2026-10-29', time: '10:00', professional: 'any', contactName: 'Sample visitor', attendee: { kind: 'self' }, ...extra });

test('config fails closed; exact origin and16KiB body limit', async () => {
  const off = setup({ APP_SECRET: '' }); assert.deepEqual((await off.request('/api/config')).data, { emailEnabled: false });
  assert.equal((await off.request('/api/auth/request', { method: 'POST', data: {} })).status, 503);
  const s = setup(); assert.equal((await s.request('/api/auth/request', { method: 'POST', origin: 'https://evil.example', data: {} })).status, 403);
  assert.equal((await s.request('/api/auth/request', { method: 'POST', data: { huge: 'x'.repeat(17000) } })).status, 413);
  const config=(await s.request('/.netlify/functions/api/config')).data;assert.equal(config.emailEnabled,true);assert.equal(config.catalog[0].id,'basic');
});
test('auth request replay preserves challenge/mail key; resend gate and identity payload conflicts', async () => {
  const s = setup(), c = await s.challenge();
  const result = await s.request('/api/auth/request', { method: 'POST', data: { requestId: c.requestId, email: c.address, locale: 'en', mode: 'code' } });
  assert.equal(result.data.challengeId, c.challengeId); assert.equal(s.mail.messages.size, 1); assert.equal(s.mail.calls.length, 1);
  assert.deepEqual(Object.keys(result.data).sort(), ['challengeId', 'expiresAt', 'resendAfter']);
  const storedChallenge = s.store.records.get('auth/' + c.challengeId).data;
  assert.equal(storedChallenge.code, undefined); assert.equal(storedChallenge.token, undefined);
  assert.match(storedChallenge.codeHash, /^[a-f0-9]{64}$/); assert.equal(storedChallenge.envelope.split('.').length, 3);
  assert.equal((await s.request('/api/auth/request', { method: 'POST', data: { requestId: c.requestId, email: 'different@example.com', locale: 'en', mode: 'code' } })).status, 409);
  assert.equal((await s.request('/api/auth/request', { method: 'POST', data: { requestId: randomUUID(), email: c.address, locale: 'en', mode: 'code' } })).status, 429);
});
test('five incorrect attempts lock; expiry rejects; concurrent correct OTP is single use', async () => {
  const s = setup(), c = await s.challenge(); const wrong = c.code === '000000' ? '999999' : '000000';
  for (let i = 0; i < 5; i++) assert.equal((await s.request('/api/auth/verify', { method: 'POST', data: { challengeId: c.challengeId, code: wrong } })).status, 400);
  assert.equal((await s.request('/api/auth/verify', { method: 'POST', data: { challengeId: c.challengeId, code: c.code } })).status, 429);
  const other = await s.challenge('other@example.com'); const responses = await Promise.all([1, 2].map(() => s.request('/api/auth/verify', { method: 'POST', data: { challengeId: other.challengeId, code: other.code } })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 410]);
  const expired = await s.challenge('expired@example.com'); s.advance(600001); assert.equal((await s.request('/api/auth/verify', { method: 'POST', data: { challengeId: expired.challengeId, token: expired.token } })).status, 410);
});
test('magic link and code consume the same challenge; cookie CSRF and logout revocation', async () => {
  const s = setup(), c = await s.challenge(); const verified = await s.request('/api/auth/verify', { method: 'POST', data: { challengeId: c.challengeId, token: c.token } });
  assert.equal(verified.status, 200); assert.match(verified.cookie, /HttpOnly; Secure; SameSite=Lax; Path=\//);
  assert.equal((await s.request('/api/auth/verify', { method: 'POST', data: { challengeId: c.challengeId, code: c.code } })).status, 410);
  const account = { cookie: verified.cookie.split(';')[0], csrfToken: verified.data.csrfToken };
  const me = await s.request('/api/me', { account }); assert.equal(me.data.user.email, c.address); assert.equal(me.data.csrfToken, account.csrfToken);
  assert.equal((await s.request('/api/profile', { method: 'PATCH', account: { ...account, csrfToken: 'bad' }, data: { name: 'Example' } })).status, 403);
  const profile = await s.request('/api/profile', { method: 'PATCH', account, data: { name: 'Example', email: 'attacker@example.com' } }); assert.equal(profile.data.user.email, c.address);
  assert.equal((await s.request('/api/auth/logout', { method: 'POST', account })).status, 200); assert.deepEqual((await s.request('/api/me', { account })).data, { user: null });
});
test('authoritative multi-item price/snapshot, idempotency and owner isolation', async () => {
  const s = setup(), one = await s.login(), two = await s.login('two@example.com'), input = bookingInput(); input.items[0].price = 1; input.contactEmail = 'attacker@example.com';
  const first = await s.request('/api/bookings', { method: 'POST', account: one, data: input }); assert.equal(first.status, 200, JSON.stringify(first));
  const b = first.data.booking; assert.equal(b.items.length, 2); assert.equal(b.items.reduce((n, i) => n + i.price, 0), 1100); assert.equal(b.items.reduce((n, i) => n + i.duration, 0), 115); assert.equal(b.contact.email, one.user.email); assert.equal(b.ownerId, undefined);
  const replay = await s.request('/api/bookings', { method: 'POST', account: one, data: input }); assert.equal(replay.data.booking.id, b.id);
  assert.equal((await s.request('/api/bookings', { method: 'POST', account: one, data: { ...input, time: '12:00' } })).status, 409);
  assert.equal((await s.request('/api/me', { account: two })).data.bookings.length, 0);
  assert.equal((await s.request('/api/bookings/' + b.id, { method: 'DELETE', account: two, data: { requestId: randomUUID(), revision: 1 } })).status, 404);
  assert.equal((await s.request('/api/bookings/' + b.id + '/confirmation', { method: 'POST', account: two })).status, 404);
  assert.equal((await s.request('/api/availability?date=2026-10-29&services=basic:&bookingId=' + b.id, { account: two })).status, 404);
});
test('concurrent reservations cannot overlap; availability accounts for duration and owner edit exclusion', async () => {
  const s = setup(), one = await s.login(), two = await s.login('two@example.com');
  const results = await Promise.all([s.request('/api/bookings', { method: 'POST', account: one, data: bookingInput() }), s.request('/api/bookings', { method: 'POST', account: two, data: bookingInput({ time: '10:30' }) })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); const booked = results.find(r => r.status === 200).data.booking, owner = booked.contact.email === one.user.email ? one : two;
  const publicSlots = (await s.request('/api/availability?date=2026-10-29&services=basic:,hydra:deluxe')).data; assert.equal(publicSlots.slots.includes(booked.time), false); assert.equal('bookings' in publicSlots, false);
  const ownSlots = await s.request('/api/availability?date=2026-10-29&services=basic:,hydra:deluxe&bookingId=' + booked.id, { account: owner }); assert.equal(ownSlots.data.slots.includes(booked.time), true);
});
test('lost store acknowledgement recovers the same committed booking without duplicate', async () => {
  const s = setup(), account = await s.login(), input = bookingInput(); s.store.unknownOnce = 'clinic/booking-ledger-v1';
  const unknown = await s.request('/api/bookings', { method: 'POST', account, data: input }); assert.equal(unknown.status, 503);
  const recovered = await s.request('/api/bookings', { method: 'POST', account, data: input }); assert.equal(recovered.status, 200);
  assert.equal((await s.request('/api/me', { account })).data.bookings.length, 1); assert.equal(s.mail.calls.filter(m => m.key.startsWith('booking/')).length, 1);
});
test('mail failure remains a saved booking; owner retry uses identical key and body', async () => {
  const s = setup(), account = await s.login(); s.mail.status = 'failed';
  const result = await s.request('/api/bookings', { method: 'POST', account, data: bookingInput() }); assert.equal(result.status, 200); assert.equal(result.data.emailStatus, 'failed');
  const first = s.mail.calls.at(-1); assert.match(first.text, /عرض مواعيدي: https:\/\/clinic\.example\/#\/appointments$/); s.mail.status = 'sent'; const retry = await s.request('/api/bookings/' + result.data.booking.id + '/confirmation', { method: 'POST', account }); assert.equal(retry.data.emailStatus, 'sent'); assert.deepEqual(s.mail.calls.at(-1), first);
  const before = s.mail.calls.length; await s.request('/api/bookings/' + result.data.booking.id + '/confirmation', { method: 'POST', account }); assert.equal(s.mail.calls.length, before);
  s.mail.throwOnce = true; const pending = await s.request('/api/bookings', { method: 'POST', account, data: bookingInput({ date: '2026-10-30' }) }); assert.equal(pending.status, 200); assert.equal(pending.data.emailStatus, 'pending');
});
test('reschedule is atomic cross-day; failed move retains original and revision conflict is enforced', async () => {
  const s = setup(), account = await s.login(), other = await s.login('other@example.com');
  const original = (await s.request('/api/bookings', { method: 'POST', account, data: bookingInput() })).data.booking;
  await s.request('/api/bookings', { method: 'POST', account: other, data: bookingInput({ date: '2026-10-30' }) });
  const blocked = await s.request('/api/bookings/' + original.id, { method: 'PATCH', account, data: { requestId: randomUUID(), revision: 1, date: '2026-10-30', time: '10:00' } }); assert.equal(blocked.status, 409);
  assert.equal((await s.request('/api/me', { account })).data.bookings[0].date, '2026-10-29');
  const input = { requestId: randomUUID(), revision: 1, date: '2026-10-30', time: '12:00' };
  const moved = await s.request('/api/bookings/' + original.id, { method: 'PATCH', account, data: input }); assert.equal(moved.status, 200); assert.equal(moved.data.booking.revision, 2);
  assert.equal((await s.request('/api/availability?date=2026-10-29&services=basic:,hydra:deluxe')).data.slots.includes('10:00'), true);
  assert.equal((await s.request('/api/bookings/' + original.id, { method: 'PATCH', account, data: { ...input, requestId: randomUUID() } })).status, 409);
  const cancelled = await s.request('/api/bookings/' + original.id, { method: 'DELETE', account, data: { requestId: randomUUID(), revision: 2 } }); assert.equal(cancelled.data.booking.status, 'cancelled'); assert.equal(cancelled.data.booking.items.length, 2);
});
test('mail uncertainty older than provider idempotency window is not blindly resent; missing schedule fails closed', async () => {
  const s = setup(), account = await s.login(); s.mail.status = 'pending'; const b = (await s.request('/api/bookings', { method: 'POST', account, data: bookingInput() })).data.booking;
  const count = s.mail.calls.length; s.advance(23 * 3600000); const retry = await s.request('/api/bookings/' + b.id + '/confirmation', { method: 'POST', account }); assert.equal(retry.data.emailStatus, 'pending'); assert.equal(s.mail.calls.length, count);
  const off = setup({ CLINIC_SCHEDULE_JSON: '' }); assert.equal((await off.request('/api/availability?date=2026-10-29&services=basic:')).status, 503);
});
test('Resend adapter classifies accepted, rejected and unknown results without exposing provider payloads', async () => {
  const message = { to: 'test@example.com', subject: 'test', text: 'test', key: 'stable-key' }; let captured;
  const accepted = createResendMail({ apiKey: 'test-only', from: 'from@example.com', fetcher: async (url, options) => { captured = options; return Response.json({ id: 'mail-id' }); } });
  assert.equal((await accepted.send(message)).status, 'sent'); assert.equal(captured.headers['Idempotency-Key'], message.key);
  assert.equal((await createResendMail({ fetcher: async () => new Response('', { status: 422 }) }).send(message)).status, 'failed');
  assert.equal((await createResendMail({ fetcher: async () => { throw Error('network'); } }).send(message)).status, 'pending');
});

test('gift is a server snapshot; unconfigured thank-you invents no reward and client payment/gift fields are ignored', async () => {
  const s = setup(), account = await s.login(), input = bookingInput({ gift: { kind: 'discount', code: 'INJECTED' }, payment: { status: 'verified' } });
  const result = await s.request('/api/bookings', { method: 'POST', account, data: input });
  assert.equal(result.status, 200); assert.equal(result.data.booking.gift.kind, 'thankyou'); assert.equal(result.data.booking.gift.code, undefined); assert.equal(result.data.booking.payment, undefined);
  assert.equal(result.data.booking.emailMessage, undefined); assert.equal(result.data.booking.emailTemplateVersion, undefined);
  const sent = [...s.mail.messages.values()].find(m => m.key.startsWith('booking/'));
  assert.match(sent.html, /Your self-care moment is booked|Your appointment|تم تأكيد/); assert.doesNotMatch(sent.html, /INJECTED|NM20/);
});

test('gift mail is owner-only, CSRF protected, frozen across retries, and does not mutate booking or duplicate mail', async () => {
  const s = setup(), account = await s.login(), other = await s.login('other@example.com');
  const created = await s.request('/api/bookings', { method: 'POST', account, data: bookingInput() }); const b = created.data.booking, path = '/api/bookings/' + b.id + '/gift-email';
  assert.equal((await s.request(path, { method: 'POST', account: other, data: {} })).status, 404);
  assert.equal((await s.request(path, { method: 'POST', account: { ...account, csrfToken: 'bad' }, data: {} })).status, 403);
  const before = clone((await s.request('/api/me', { account })).data.bookings); s.mail.status = 'pending';
  assert.equal((await s.request(path, { method: 'POST', account, data: {} })).data.emailStatus, 'pending');
  const first = clone(s.mail.calls.at(-1)); s.mail.status = 'sent';
  assert.equal((await s.request(path, { method: 'POST', account, data: {} })).data.emailStatus, 'sent'); assert.deepEqual(s.mail.calls.at(-1), first);
  const calls = s.mail.calls.length; assert.equal((await s.request(path, { method: 'POST', account, data: {} })).data.emailStatus, 'sent'); assert.equal(s.mail.calls.length, calls);
  assert.deepEqual((await s.request('/api/me', { account })).data.bookings, before);
  await s.request('/api/bookings/' + b.id, { method: 'DELETE', account, data: { requestId: randomUUID(), revision: b.revision } });
  assert.equal((await s.request(path, { method: 'POST', account, data: {} })).status, 409);
});

test('payment and disabled gift policies fail closed; configured rewards never grant a paid status', async () => {
  for (const trigger of ['payment_verified', 'disabled']) {
    const s = setup({ CLINIME_GIFT_JSON: JSON.stringify({ kind: 'discount', trigger, code: 'FIXTURE10', titleAr: 'هدية مهيأة للفحص', titleEn: 'Configured fixture reward' }) }), a = await s.login();
    const r = await s.request('/api/bookings', { method: 'POST', account: a, data: bookingInput({ payment: { status: 'verified' } }) });
    assert.equal(r.data.booking.payment, undefined);
    assert.equal((await s.request('/api/bookings/' + r.data.booking.id + '/gift-email', { method: 'POST', account: a, data: {} })).status, 409);
    const m = [...s.mail.messages.values()].find(m => m.key.startsWith('booking/')); assert.doesNotMatch(m.text, /FIXTURE10/);
  }
});

test('gift pending uncertainty outside provider idempotency window never creates a new mail attempt', async () => {
  const s = setup(), a = await s.login(), r = await s.request('/api/bookings', { method: 'POST', account: a, data: bookingInput() });
  const path = '/api/bookings/' + r.data.booking.id + '/gift-email'; s.mail.status = 'pending'; await s.request(path, { method: 'POST', account: a, data: {} });
  const count = s.mail.calls.length; s.advance(24 * 3600000); assert.equal((await s.request(path, { method: 'POST', account: a, data: {} })).data.emailStatus, 'pending'); assert.equal(s.mail.calls.length, count);
});
