import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAPI } from '../server/api.mjs';
import { pointExpiry, DEFAULT_LOYALTY_RULES } from '../server/loyalty.mjs';

const LEDGER = 'clinic/booking-ledger-v1';
class Store {
  records = new Map(); version = 0; unknownOnce = null;
  async getWithMetadata(key, options) { assert.equal(options.consistency, 'strong'); return structuredClone(this.records.get(key) || null); }
  async setJSON(key, data, conditions) {
    const current = this.records.get(key);
    if (conditions.onlyIfNew && current || conditions.onlyIfMatch && current?.etag !== conditions.onlyIfMatch) return { modified: false };
    const etag = String(++this.version); this.records.set(key, { data: structuredClone(data), etag });
    if (this.unknownOnce === key) { this.unknownOnce = null; throw Error('lost acknowledgement after committed write'); }
    return { modified: true, etag };
  }
}
function setup(overrides = {}) {
  const store = new Store(), mail = { calls: [], async send(message) { this.calls.push(structuredClone(message)); return { status: 'sent' }; } };
  let now = Date.parse('2026-11-04T07:00:00Z');
  const env = { PUBLIC_ORIGIN: 'https://clinic.example', APP_SECRET: 'loyalty-local-test-secret-longer-than-thirty-two-characters', RESEND_API_KEY: 'local-test', EMAIL_FROM: 'local@clinic.example', CLINIME_ADMIN_EMAILS: 'admin@example.com', CLINIC_SCHEDULE_JSON: JSON.stringify({ timeZone: 'Asia/Riyadh', weekdays: [0, 1, 2, 3, 4, 5, 6], open: '10:00', close: '18:00', stepMinutes: 30, horizonDays: 60 }), ...overrides };
  const api = createAPI({ store, mail, env, now: () => now });
  async function call(path, { account, method = 'GET', data, origin = env.PUBLIC_ORIGIN } = {}) {
    const result = await api(new Request(env.PUBLIC_ORIGIN + '/api' + path, { method, headers: { Origin: origin, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(account ? { Cookie: account.cookie, 'X-CSRF-Token': account.csrfToken } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }), { ip: '192.0.2.3' });
    return { status: result.status, data: await result.json(), cookie: result.headers.get('set-cookie') };
  }
  function ok(result) { assert.equal(result.status, 200, JSON.stringify(result)); return result.data; }
  async function login(email = 'customer@example.com') {
    const request = ok(await call('/auth/request', { method: 'POST', data: { requestId: randomUUID(), email, mode: 'code', locale: 'en' } }));
    const code = mail.calls.at(-1).text.match(/Sign-in code: (\d{6})/)[1];
    const result = await call('/auth/verify', { method: 'POST', data: { challengeId: request.challengeId, code } });
    return { ...ok(result), cookie: result.cookie.split(';')[0] };
  }
  const wallet = async account => ok(await call('/loyalty', { account }));
  const adminSnapshot = async admin => ok(await call('/admin/loyalty', { account: admin }));
  async function adjust(admin, customer, points, reason = 'Documented local correction') {
    const snapshot = await adminSnapshot(admin);
    return ok(await call('/admin/loyalty', { account: admin, method: 'POST', data: { requestId: randomUUID(), revision: snapshot.revision, action: 'adjust', userId: customer.user.id, points, reason } }));
  }
  async function saveRules(admin, patch) {
    const snapshot = await adminSnapshot(admin);
    return ok(await call('/admin/loyalty', { account: admin, method: 'POST', data: { requestId: randomUUID(), revision: snapshot.revision, action: 'rules-save', rules: { ...snapshot.rules, ...patch } } }));
  }
  async function redeem(account, rewardId = 'reward-5', extra = {}) {
    const snapshot = await wallet(account);
    return call('/loyalty/redeem', { account, method: 'POST', data: { requestId: randomUUID(), revision: snapshot.revision, rewardId, ...extra } });
  }
  const day = () => new Date(now + 3 * 3600000).toISOString().slice(0, 10);
  const input = extra => ({ requestId: randomUUID(), items: [{ serviceId: 'basic' }], date: day(), time: '11:00', professional: 'any', contactName: 'Local test customer', attendee: { kind: 'self' }, locale: 'en', ...extra });
  async function create(account, extra = {}) { return ok(await call('/bookings', { account, method: 'POST', data: input(extra) })).booking; }
  async function workspace(admin) { return ok(await call('/admin/workspace', { account: admin })); }
  async function staffInput(admin, action, booking, extra = {}) {
    const snapshot = await workspace(admin), row = snapshot.bookings.find(row => row.id === booking.id);
    return { requestId: randomUUID(), revision: snapshot.revision, action, bookingId: booking.id, bookingRevision: row.revision, ...extra };
  }
  async function staff(admin, action, booking, extra = {}) { return ok(await call('/admin/workspace', { account: admin, method: 'POST', data: await staffInput(admin, action, booking, extra) })); }
  async function finish(admin, booking, additions = []) {
    ok(await call('/admin/bookings/' + booking.id + '/arrival', { account: admin, method: 'POST', data: { requestId: randomUUID(), revision: booking.revision } }));
    await staff(admin, 'medical-save', booking, { fields: {}, flags: { consultation: true, assessment: true, consent: true } });
    await staff(admin, 'session-start', booking, { confirmProceed: true });
    for (const serviceId of additions) await staff(admin, 'session-add-service', booking, { serviceId });
    return staff(admin, 'session-finish', booking, { followup: false });
  }
  async function cancel(account, booking) { return ok(await call('/bookings/' + booking.id, { account, method: 'DELETE', data: { requestId: randomUUID(), revision: booking.revision } })); }
  return { store, mail, call, ok, login, wallet, adminSnapshot, adjust, saveRules, redeem, create, input, workspace, staffInput, staff, finish, cancel, advance: milliseconds => now += milliseconds };
}
const error = (result, status, code) => { assert.equal(result.status, status, JSON.stringify(result)); assert.equal(result.data.error.code, code); };

test('verified-session enrollment grants welcome once; staff-created customers and challenges do not; later wallet reads do not mutate ledger', async () => {
  const s = setup(), admin = await s.login('admin@example.com');
  s.ok(await s.call('/admin/bookings', { account: admin, method: 'POST', data: s.input({ customerEmail: 'future@example.com' }) }));
  const unverified = (await s.adminSnapshot(admin)).customers.find(row => row.email === 'future@example.com');
  assert.equal(unverified.balance, 0); assert.equal(unverified.verifiedEmail, false);
  error(await s.call('/loyalty'), 401, 'AUTH_REQUIRED');
  const customer = await s.login('future@example.com');
  const concurrent = await Promise.all([s.wallet(customer), s.wallet(customer)]);
  assert.equal(concurrent[0].balance, 200); assert.equal(concurrent[1].balance, 200);
  const initialVersion = s.store.records.get(LEDGER).etag;
  const one = await s.wallet(customer), two = await s.wallet(customer);
  assert.equal(one.entries.filter(entry => entry.type === 'welcome').length, 1); assert.equal(two.balance, 200);
  assert.equal(s.store.records.get(LEDGER).etag, initialVersion);
  assert.match(one.referralCode, /^REF-[A-F0-9]{12}$/);
});

test('wallet, redemption, quote and admin writes retain existing session, origin, CSRF and admin authorization', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'); await s.wallet(customer);
  error(await s.call('/admin/loyalty', { account: customer }), 403, 'ADMIN_REQUIRED');
  const input = { requestId: randomUUID(), revision: 1, rewardId: 'reward-5' };
  error(await s.call('/loyalty/redeem', { method: 'POST', data: input }), 401, 'AUTH_REQUIRED');
  error(await s.call('/loyalty/redeem', { method: 'POST', account: { ...customer, csrfToken: 'bad' }, data: input }), 403, 'CSRF_INVALID');
  error(await s.call('/loyalty/quote', { method: 'POST', account: customer, origin: 'https://foreign.example', data: { items: [{ serviceId: 'basic' }] } }), 403, 'ORIGIN_INVALID');
  error(await s.call('/admin/loyalty', { account: customer, method: 'POST', data: { requestId: randomUUID(), revision: 1, action: 'adjust', userId: customer.user.id, points: 9000, reason: 'role claim', role: 'admin' } }), 403, 'ADMIN_REQUIRED');
  assert.equal((await s.adminSnapshot(admin)).customers[0].balance, 200);
  const open = setup({ CLINIME_ADMIN_EMAILS: '', CLINIME_ADMIN_ACCESS: 'verified-email' }), account = await open.login();
  assert.equal((await open.call('/admin/loyalty', { account })).status, 200);
});

test('concurrent redeem has one debit/coupon; same request survives a lost commit response and conflicts on tampering', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'); await s.wallet(customer); await s.adjust(admin, customer, 5000);
  const wallet = await s.wallet(customer), input = { requestId: randomUUID(), revision: wallet.revision, rewardId: 'reward-5' };
  s.store.unknownOnce = LEDGER;
  const first = await s.call('/loyalty/redeem', { account: customer, method: 'POST', data: input }); error(first, 503, 'STORE_UNAVAILABLE');
  const replay = s.ok(await s.call('/loyalty/redeem', { account: customer, method: 'POST', data: input }));
  assert.equal(replay.wallet.balance, 200); assert.equal(replay.wallet.coupons.length, 1);
  const duplicates = await Promise.all([1, 2].map(() => s.call('/loyalty/redeem', { account: customer, method: 'POST', data: input })));
  duplicates.forEach(result => assert.equal(result.data.coupon.id, replay.coupon.id));
  error(await s.call('/loyalty/redeem', { account: customer, method: 'POST', data: { ...input, rewardId: 'reward-10' } }), 409, 'IDEMPOTENCY_CONFLICT');
  assert.equal((await s.wallet(customer)).entries.filter(entry => entry.type === 'redeem').length, 1);
  await s.adjust(admin, customer, 5000);
  const current = await s.wallet(customer);
  const competing = await Promise.all([1, 2].map(() => s.call('/loyalty/redeem', { account: customer, method: 'POST', data: { requestId: randomUUID(), revision: current.revision, rewardId: 'reward-5' } })));
  assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
});

test('coupon quote and final booking resolve authoritative prices, cap discount, isolate owners, preserve snapshots and never stack codes', async () => {
  const s = setup(), customer = await s.login(), other = await s.login('other@example.com'), admin = await s.login('admin@example.com');
  await s.wallet(customer); await s.adjust(admin, customer, 5000);
  const { coupon } = s.ok(await s.redeem(customer));
  const items = [{ serviceId: 'basic', price: 1 }, { serviceId: 'deep' }, { serviceId: 'hydra', optionId: 'deluxe' }, { serviceId: 'brow' }];
  const quote = s.ok(await s.call('/loyalty/quote', { account: customer, method: 'POST', data: { items, code: coupon.code, percent: 100, cap: 9000, total: 1 } }));
  assert.equal(quote.subtotal, 1570); assert.equal(quote.discount, 75); assert.equal(quote.total, 1495);
  error(await s.call('/loyalty/quote', { account: other, method: 'POST', data: { items, code: coupon.code } }), 400, 'PROMOTION_INVALID');
  error(await s.call('/loyalty/quote', { account: customer, method: 'POST', data: { items, code: [coupon.code, 'OTHER'] } }), 400, 'PROMOTION_INVALID');
  error(await s.call('/loyalty/quote', { account: customer, method: 'POST', data: { items, code: coupon.code + ',OTHER' } }), 400, 'PROMOTION_INVALID');
  const createInput = s.input({ items, promotionCode: coupon.code, pricing: { discount: 1570, total: 0 } });
  const booking = s.ok(await s.call('/bookings', { account: customer, method: 'POST', data: createInput })).booking;
  assert.deepEqual(booking.pricing, quote); assert.equal(booking.items.reduce((sum, item) => sum + item.price, 0), 1570);
  assert.equal(booking._loyalty, undefined); assert.equal(booking.ownerId, undefined);
  const message = s.mail.calls.find(message => message.key.startsWith('booking/'));
  assert.match(message.text, /SAR 1570/); assert.match(message.text, /SAR 75/); assert.match(message.text, /SAR 1495/);
  const replay = s.ok(await s.call('/bookings', { account: customer, method: 'POST', data: createInput }));
  assert.equal(replay.booking.id, booking.id);
  error(await s.call('/loyalty/quote', { account: customer, method: 'POST', data: { items, code: coupon.code } }), 409, 'PROMOTION_USED');
  const staff = await s.workspace(admin); assert.equal(staff.visits[booking.id].total, 1495); assert.equal(staff.bookings[0].pricing.total, 1495);
});

test('coupon consumption is atomic across competing bookings and cancellation restores unexpired coupon without refunding points', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'); await s.wallet(customer); await s.adjust(admin, customer, 5000);
  const { coupon } = s.ok(await s.redeem(customer));
  const requests = await Promise.all(['11:00', '13:00'].map(time => s.call('/bookings', { account: customer, method: 'POST', data: s.input({ time, promotionCode: coupon.code }) })));
  assert.deepEqual(requests.map(result => result.status).sort(), [200, 409]);
  const booking = requests.find(result => result.status === 200).data.booking;
  assert.equal((await s.wallet(customer)).balance, 200);
  await s.cancel(customer, booking);
  assert.equal((await s.wallet(customer)).coupons[0].status, 'available');
  // Replaying the original creation after cancellation returns the cancelled
  // booking and must not reserve its released coupon a second time.
  const original = s.store.records.get(LEDGER).data.bookings[booking.id];
  assert.equal(original.status, 'cancelled');
  const rebooked = await s.create(customer, { promotionCode: coupon.code }); assert.equal(rebooked.pricing.total, 237.5);
  assert.equal((await s.wallet(customer)).balance, 200);
});

test('referral refuses self and returning customers; pending award cancels cleanly and commits only after actual completed fully paid visit', async () => {
  const s = setup(), referrer = await s.login('friend@example.com'), referred = await s.login(), admin = await s.login('admin@example.com');
  const code = (await s.wallet(referrer)).referralCode; await s.wallet(referred);
  error(await s.call('/loyalty/quote', { account: referrer, method: 'POST', data: { items: [{ serviceId: 'basic' }], code } }), 409, 'SELF_REFERRAL');
  const draft = await s.create(referred, { promotionCode: code });
  let friendWallet = await s.wallet(referrer); assert.equal(friendWallet.balance, 200); assert.equal(friendWallet.pendingPoints, 500);
  error(await s.call('/loyalty/quote', { account: referred, method: 'POST', data: { items: [{ serviceId: 'basic' }], code } }), 409, 'REFERRAL_INELIGIBLE');
  await s.cancel(referred, draft); assert.equal((await s.wallet(referrer)).pendingPoints, 0);
  const booking = await s.create(referred, { promotionCode: code }); assert.equal(booking.pricing.discount, 12.5);
  assert.equal((await s.wallet(referred)).balance, 200);
  await s.finish(admin, booking); assert.equal((await s.wallet(referred)).balance, 200); assert.equal((await s.wallet(referrer)).pendingPoints, 500);
  await s.staff(admin, 'payment-record', booking, { amount: 100, method: 'cash' });
  assert.equal((await s.wallet(referrer)).balance, 200); assert.equal((await s.wallet(referred)).balance, 200);
  error(await s.call('/admin/workspace', { account: admin, method: 'POST', data: await s.staffInput(admin, 'visit-close', booking) }), 409, 'BALANCE_DUE');
  const payment = await s.staffInput(admin, 'payment-record', booking, { amount: 137.5, method: 'card' });
  s.store.unknownOnce = LEDGER;
  error(await s.call('/admin/workspace', { account: admin, method: 'POST', data: payment }), 503, 'STORE_UNAVAILABLE');
  s.ok(await s.call('/admin/workspace', { account: admin, method: 'POST', data: payment }));
  friendWallet = await s.wallet(referrer); assert.equal(friendWallet.balance, 700); assert.equal(friendWallet.pendingPoints, 0);
  const customerWallet = await s.wallet(referred); assert.equal(customerWallet.balance, 737); assert.equal(customerWallet.paidVisitCount, 1);
  assert.equal(friendWallet.entries.filter(entry => entry.type === 'referral').length, 1);
  assert.equal(customerWallet.entries.filter(entry => entry.type === 'purchase').length, 1);
  assert.equal(JSON.stringify(friendWallet).includes(referred.user.email), false); assert.equal(JSON.stringify(friendWallet).includes(referred.user.id), false);
  error(await s.call('/loyalty/quote', { account: referred, method: 'POST', data: { items: [{ serviceId: 'basic' }], code } }), 409, 'REFERRAL_INELIGIBLE');
});

test('newly completed first and third paid sessions award milestones exactly once', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'); await s.wallet(customer);
  for (let visit = 1; visit <= 3; visit++) {
    const booking = await s.create(customer); await s.finish(admin, booking);
    const payment = await s.staffInput(admin, 'payment-record', booking, { amount: 250, method: 'cash' });
    const both = await Promise.all([1, 2].map(() => s.call('/admin/workspace', { account: admin, method: 'POST', data: payment })));
    both.forEach(result => s.ok(result));
    const wallet = await s.wallet(customer); assert.equal(wallet.paidVisitCount, visit);
    if (visit < 3) s.advance(86400000);
  }
  const wallet = await s.wallet(customer); assert.equal(wallet.balance, 1750);
  assert.equal(wallet.entries.filter(entry => entry.type === 'first-visit').length, 1); assert.equal(wallet.entries.filter(entry => entry.type === 'third-visit').length, 1);
  assert.equal(wallet.entries.filter(entry => entry.type === 'purchase').length, 3);
});

test('point expiry is calendar-based, debits use FIFO, manual adjustments are audited and cannot overdraw or accept missing reasons', async () => {
  assert.equal(pointExpiry(Date.parse('2024-02-29T12:00:00Z'), 12), '2025-02-28T12:00:00.000Z');
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'); await s.wallet(customer);
  await s.adjust(admin, customer, 100);
  const creditsBefore = structuredClone(s.store.records.get(LEDGER).data.loyalty.entries);
  await s.adjust(admin, customer, -250, 'Correct documented duplicate');
  const raw = s.store.records.get(LEDGER).data.loyalty;
  const debit = raw.entries.at(-1); assert.equal(debit.allocations.reduce((sum, item) => sum + item.points, 0), 250);
  assert.equal(debit.allocations.some(item => item.entryId.endsWith(':welcome') && item.points === 200), true);
  assert.deepEqual(raw.entries.slice(0, creditsBefore.length), creditsBefore, 'credits remain immutable');
  assert.equal((await s.wallet(customer)).balance, 50);
  const snapshot = await s.adminSnapshot(admin);
  error(await s.call('/admin/loyalty', { account: admin, method: 'POST', data: { requestId: randomUUID(), revision: snapshot.revision, action: 'adjust', userId: customer.user.id, points: -51, reason: 'Too much' } }), 409, 'INSUFFICIENT_POINTS');
  for (const patch of [{ points: 0, reason: 'Zero' }, { points: 1.5, reason: 'Fraction' }, { points: 10, reason: '' }, { points: 1000001, reason: 'Limit' }]) error(await s.call('/admin/loyalty', { account: admin, method: 'POST', data: { requestId: randomUUID(), revision: snapshot.revision, action: 'adjust', userId: customer.user.id, ...patch } }), 400, 'INVALID_REQUEST');
  assert.equal(snapshot.audit.filter(entry => entry.action === 'adjust').length, 2);
  s.advance(366 * 86400000); const renewed = await s.login();
  const expired = await s.wallet(renewed); assert.equal(expired.balance, 0); assert.equal(expired.entries.filter(entry => entry.type === 'welcome').length, 1); assert.equal(expired.entries.find(entry => entry.type === 'welcome').status, 'spent');
});

test('coupon expiry is fixed at issuance; rule edits preserve old terms and eligibility, reject invalid bounds, and enforce current final quote', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'); await s.wallet(customer); await s.adjust(admin, customer, 5000);
  const { coupon } = s.ok(await s.redeem(customer));
  await s.saveRules(admin, { referralPercent: 10, couponExpiryDays: 1, eligibleServiceIds: ['deep'], rewards: [{ id: 'new-reward', points: 100, percent: 20, cap: 10 }] });
  const oldQuote = s.ok(await s.call('/loyalty/quote', { account: customer, method: 'POST', data: { items: [{ serviceId: 'basic' }], code: coupon.code } }));
  assert.equal(oldQuote.discount, 12.5);
  const oldCoupon = (await s.wallet(customer)).coupons[0]; assert.equal(oldCoupon.expiresAt, coupon.expiresAt); assert.equal(oldCoupon.percent, 5);
  const next = s.ok(await s.redeem(customer, 'new-reward')).coupon;
  error(await s.call('/loyalty/quote', { account: customer, method: 'POST', data: { items: [{ serviceId: 'basic' }], code: next.code } }), 409, 'PROMOTION_NOT_ELIGIBLE');
  const quote = s.ok(await s.call('/loyalty/quote', { account: customer, method: 'POST', data: { items: [{ serviceId: 'deep' }], code: next.code } })); assert.equal(quote.discount, 10);
  const snapshot = await s.adminSnapshot(admin);
  error(await s.call('/admin/loyalty', { account: admin, method: 'POST', data: { requestId: randomUUID(), revision: snapshot.revision, action: 'rules-save', rules: { ...snapshot.rules, referralPercent: 101 } } }), 400, 'INVALID_REQUEST');
  s.advance(86400001);
  error(await s.call('/loyalty/quote', { account: customer, method: 'POST', data: { items: [{ serviceId: 'deep' }], code: next.code } }), 409, 'PROMOTION_EXPIRED');
  error(await s.call('/bookings', { account: customer, method: 'POST', data: s.input({ promotionCode: next.code, items: [{ serviceId: 'deep' }] }) }), 409, 'PROMOTION_EXPIRED');
  assert.equal((await s.wallet(customer)).coupons.find(row => row.id === next.id).status, 'expired');
});

test('redemption replay remains durable after coupon spending and booking request retention passes', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'); await s.wallet(customer); await s.adjust(admin, customer, 5000);
  const wallet = await s.wallet(customer), request = { requestId: randomUUID(), revision: wallet.revision, rewardId: 'reward-5' };
  const first = s.ok(await s.call('/loyalty/redeem', { account: customer, method: 'POST', data: request }));
  const input = s.input({ promotionCode: first.coupon.code });
  const booking = s.ok(await s.call('/bookings', { account: customer, method: 'POST', data: input })).booking;
  s.advance(4 * 86400000);
  const replay = s.ok(await s.call('/loyalty/redeem', { account: customer, method: 'POST', data: request }));
  assert.equal(replay.coupon.id, first.coupon.id); assert.equal(replay.coupon.status, 'used');
  const recoveredBooking = s.ok(await s.call('/bookings', { account: customer, method: 'POST', data: input })).booking; assert.equal(recoveredBooking.id, booking.id);
  assert.equal(replay.wallet.entries.filter(row => row.type === 'redeem').length, 1);
});

test('mixed eligibility rounds discounts down to halalas; normalized code fingerprints replay safely after cancellation', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'); await s.wallet(customer); await s.adjust(admin, customer, 5000);
  await s.saveRules(admin, { eligibleServiceIds: ['deep'] });
  const snapshot = await s.workspace(admin), service = snapshot.catalog.find(service => service.id === 'deep');
  s.ok(await s.call('/admin/workspace', { account: admin, method: 'POST', data: { requestId: randomUUID(), revision: snapshot.revision, action: 'service-save', service: { ...service, price: 350.99, discount: null } } }));
  const { coupon } = s.ok(await s.redeem(customer));
  const items = [{ serviceId: 'basic' }, { serviceId: 'deep' }];
  const quote = s.ok(await s.call('/loyalty/quote', { account: customer, method: 'POST', data: { items, code: coupon.code } }));
  assert.equal(quote.subtotal, 600.99); assert.equal(quote.eligibleSubtotal, 350.99); assert.equal(quote.discount, 17.54); assert.equal(quote.total, 583.45);
  const input = s.input({ promotionCode: coupon.code.toLowerCase(), items });
  const booking = s.ok(await s.call('/bookings', { account: customer, method: 'POST', data: input })).booking;
  const normalizedReplay = s.ok(await s.call('/bookings', { account: customer, method: 'POST', data: { ...input, promotionCode: ' ' + coupon.code + ' ' } }));
  assert.equal(normalizedReplay.booking.id, booking.id);
  error(await s.call('/bookings', { account: customer, method: 'POST', data: { ...input, promotionCode: '' } }), 409, 'IDEMPOTENCY_CONFLICT');
  await s.cancel(customer, booking);
  const cancelledReplay = s.ok(await s.call('/bookings', { account: customer, method: 'POST', data: input }));
  assert.equal(cancelledReplay.booking.status, 'cancelled'); assert.equal((await s.wallet(customer)).coupons[0].status, 'available');
  error(await s.call('/admin/workspace', { account: admin, method: 'POST', data: await s.staffInput(admin, 'payment-record', booking, { amount: 583.45, method: 'cash' }) }), 409, 'BOOKING_CANCELLED');
  assert.equal((await s.wallet(customer)).entries.some(entry => entry.type === 'purchase'), false);
});

test('discounted checkout adds full-price services, records exact payable and awards only the net fully paid amount', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'); await s.wallet(customer); await s.adjust(admin, customer, 5000);
  const { coupon } = s.ok(await s.redeem(customer)), booking = await s.create(customer, { promotionCode: coupon.code });
  const checkout = await s.finish(admin, booking, ['deep']);
  assert.equal(checkout.visits[booking.id].total, 587.5); assert.equal(checkout.visits[booking.id].balance, 587.5);
  await s.staff(admin, 'payment-record', booking, { amount: 100, method: 'cash' });
  assert.equal((await s.wallet(customer)).balance, 200);
  const paid = await s.staff(admin, 'payment-record', booking, { amount: 487.5, method: 'card' });
  assert.equal(paid.visits[booking.id].balance, 0); assert.equal(paid.receipts.at(-1).total, 587.5); assert.equal(paid.receipts.at(-1).pricing.discount, 12.5);
  assert.equal((await s.wallet(customer)).balance, 1087); assert.equal((await s.wallet(customer)).entries.find(entry => entry.type === 'purchase').points, 587);
});

test('historical paid closures set milestone position without retroactive points or a mistaken first-visit bonus', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com');
  const historic = await s.create(customer); await s.finish(admin, historic); await s.staff(admin, 'payment-record', historic, { amount: 250, method: 'cash' });
  // Model a pre-feature ledger containing the real completed visit and receipt.
  // Only the newly installed loyalty extension is absent.
  delete s.store.records.get(LEDGER).data.loyalty;
  assert.equal((await s.wallet(customer)).balance, 200);
  s.advance(86400000);
  const second = await s.create(customer); await s.finish(admin, second); await s.staff(admin, 'payment-record', second, { amount: 250, method: 'cash' });
  let wallet = await s.wallet(customer); assert.equal(wallet.paidVisitCount, 2); assert.equal(wallet.balance, 450); assert.equal(wallet.entries.some(entry => entry.type === 'first-visit'), false);
  s.advance(86400000);
  const third = await s.create(customer); await s.finish(admin, third); await s.staff(admin, 'payment-record', third, { amount: 250, method: 'cash' });
  wallet = await s.wallet(customer); assert.equal(wallet.paidVisitCount, 3); assert.equal(wallet.balance, 1200); assert.equal(wallet.entries.filter(entry => entry.type === 'purchase').length, 2); assert.equal(wallet.entries.filter(entry => entry.type === 'third-visit').length, 1);
});

test('pending referral is disqualified when a different eligible paid visit completes first and never earns on a later closure', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'), friend = await s.login('friend@example.com');
  await s.wallet(customer); const code = (await s.wallet(friend)).referralCode;
  const reserved = await s.create(customer, { time: '15:00', promotionCode: code });
  const first = await s.create(customer, { time: '11:00' }); await s.finish(admin, first);
  await s.staff(admin, 'payment-record', first, { amount: 250, method: 'cash' });
  let wallet = await s.wallet(friend); assert.equal(wallet.pendingPoints, 0); assert.equal(wallet.balance, 200);
  const pending = wallet.entries.find(entry => entry.type === 'referral-pending');
  assert.equal(pending.status, 'disqualified'); assert.equal(pending.reason, 'another-eligible-visit-completed-first');
  const referral = (await s.adminSnapshot(admin)).referrals[0]; assert.equal(referral.status, 'disqualified'); assert.equal(referral.reason, pending.reason); assert.ok(referral.closedAt);
  await s.finish(admin, reserved); await s.staff(admin, 'payment-record', reserved, { amount: 237.5, method: 'cash' });
  wallet = await s.wallet(friend); assert.equal(wallet.balance, 200); assert.equal(wallet.pendingPoints, 0); assert.equal(wallet.entries.some(entry => entry.type === 'referral'), false);
  assert.equal(JSON.stringify(wallet).includes(customer.user.email), false);
});

test('wholly ineligible paid visits settle once without consuming purchase, first or third visit eligibility', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'); await s.wallet(customer);
  await s.saveRules(admin, { eligibleServiceIds: ['deep'] });
  const basic = await s.create(customer); await s.finish(admin, basic); await s.staff(admin, 'payment-record', basic, { amount: 250, method: 'cash' });
  let wallet = await s.wallet(customer); assert.equal(wallet.balance, 200); assert.equal(wallet.paidVisitCount, 0); assert.equal(wallet.entries.length, 1);
  assert.equal(s.store.records.get(LEDGER).data.loyalty.customers[customer.user.id].settledBookingIds.includes(basic.id), true);
  assert.equal(s.store.records.get(LEDGER).data.bookings[basic.id]._loyalty.settlement.countsAsEligibleVisit, false);
  for (let visit = 1; visit <= 3; visit++) {
    s.advance(86400000);
    const deep = await s.create(customer, { items: [{ serviceId: 'deep' }] }); await s.finish(admin, deep); await s.staff(admin, 'payment-record', deep, { amount: 350, method: 'cash' });
    wallet = await s.wallet(customer); assert.equal(wallet.paidVisitCount, visit);
  }
  assert.equal(wallet.balance, 2050); assert.equal(wallet.entries.filter(entry => entry.type === 'first-visit').length, 1); assert.equal(wallet.entries.filter(entry => entry.type === 'third-visit').length, 1);
  await s.saveRules(admin, { eligibleServiceIds: [] }); assert.equal((await s.wallet(customer)).balance, 2050, 'rule edit grants no retrocredit');
});

test('frozen discount allocations stay on original discounted lines and never reduce an eligible full-price addition after rule edits', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'); await s.wallet(customer); await s.adjust(admin, customer, 5000);
  await s.saveRules(admin, { eligibleServiceIds: ['basic'] });
  const { coupon } = s.ok(await s.redeem(customer)), booking = await s.create(customer, { promotionCode: coupon.code });
  const internal = s.store.records.get(LEDGER).data.bookings[booking.id]._loyalty;
  assert.deepEqual(internal.discountAllocations, [{ itemIndex: 0, discountCents: 1250 }]); assert.equal(booking._loyalty, undefined);
  await s.saveRules(admin, { eligibleServiceIds: ['deep'] });
  await s.finish(admin, booking, ['deep']); await s.staff(admin, 'payment-record', booking, { amount: 587.5, method: 'cash' });
  const wallet = await s.wallet(customer); assert.equal(wallet.entries.find(entry => entry.type === 'purchase').points, 350); assert.equal(wallet.paidVisitCount, 1);
  const customerBooking = s.ok(await s.call('/me', { account: customer })).bookings[0];
  assert.deepEqual(Object.keys(customerBooking.pricing).sort(), ['subtotal','eligibleSubtotal','discount','total','code','kind','percent','cap'].sort());
});

test('prior wholly ineligible booking does not block the first eligible referral and eligible history still blocks repeat referrals', async () => {
  const s = setup(), customer = await s.login(), admin = await s.login('admin@example.com'), friend = await s.login('friend@example.com');
  await s.wallet(customer); const code = (await s.wallet(friend)).referralCode;
  await s.saveRules(admin, { eligibleServiceIds: ['deep'] });
  const basic = await s.create(customer); await s.finish(admin, basic); await s.staff(admin, 'payment-record', basic, { amount: 250, method: 'cash' });
  const quote = s.ok(await s.call('/loyalty/quote', { account: customer, method: 'POST', data: { items: [{ serviceId: 'deep' }], code } })); assert.equal(quote.discount, 17.5);
  const deep = await s.create(customer, { time: '15:00', items: [{ serviceId: 'deep' }], promotionCode: code }); await s.finish(admin, deep); await s.staff(admin, 'payment-record', deep, { amount: 332.5, method: 'cash' });
  const wallet = await s.wallet(customer); assert.equal(wallet.paidVisitCount, 1); assert.equal(wallet.balance, 832); assert.equal((await s.wallet(friend)).balance, 700);
  error(await s.call('/loyalty/quote', { account: customer, method: 'POST', data: { items: [{ serviceId: 'deep' }], code } }), 409, 'REFERRAL_INELIGIBLE');
});

import { newVisitProgram } from '../server/visit-rewards.mjs';
import { update } from '../server/core.mjs';

async function enableVisits(s) {
  await update(s.store, LEDGER, current => {
    const ledger = current || {schema:1, bookings:{}, requests:{}};
    ledger.visitProgram = newVisitProgram();
    return {value:ledger, result:null};
  });
}

test('five distinct arrivals unlock one basic facial before payment; gifting transfers ownership once and cancellation restores only to recipient', async () => {
  const s = setup(), owner=await s.login(), staff=await s.login('admin@example.com');
  await enableVisits(s);
  await s.wallet(owner);
  const visitTimes = ['10:30','11:30','12:30','13:30','14:30'];
  for (const time of visitTimes) {
    const booking = await s.create(owner,{time});
    await s.finish(staff,booking);
    assert.equal((await s.wallet(owner)).stampCard.totalVisits,visitTimes.indexOf(time)+1);
    const settle = await s.staffInput(staff,'payment-record',booking,{method:'cash',amount:250});
    s.ok(await s.call('/admin/workspace',{account:staff,method:'POST',data:settle}));
    s.ok(await s.call('/admin/workspace',{account:staff,method:'POST',data:settle}));
  }
  const card = (await s.wallet(owner)).stampCard;
  assert.equal(card.stamps,5);assert.equal(card.rewards.length,1);
  const benefit=card.rewards[0];
  const quoted = async (account, serviceId) => s.call('/loyalty/quote',{account,method:'POST',data:{code:benefit.code,items:[{serviceId}]}});
  assert.equal(s.ok(await quoted(owner,'basic')).total,0);
  error(await quoted(owner,'deep'),409,'REWARD_NOT_ELIGIBLE');
  const data={requestId:randomUUID(),rewardId:benefit.id,recipientEmail:'future@example.com'};
  error(await s.call('/loyalty/gift',{account:owner,method:'POST',data:{...data,recipientEmail:owner.user.email}}),409,'GIFT_SELF');
  const gift = () => s.call('/loyalty/gift',{account:owner,method:'POST',data});
  for (const reply of await Promise.all([gift(),gift()])) assert.equal(s.ok(reply).wallet.stampCard.rewards[0].status,'gifted');
  error(await quoted(owner,'basic'),409,'REWARD_UNAVAILABLE');
  const recipient=await s.login('future@example.com');
  assert.equal((await s.wallet(recipient)).stampCard.rewards[0].receivedGift,true);
  const booking=await s.create(recipient,{time:'15:30',promotionCode:benefit.code});
  assert.equal(booking.pricing.total,0);error(await quoted(recipient,'basic'),409,'REWARD_UNAVAILABLE');
  await s.cancel(recipient,booking);
  assert.equal(s.ok(await quoted(recipient,'basic')).total,0);
  assert.equal((await s.wallet(owner)).stampCard.rewards[0].status,'gifted');
});

test('referrals are monetary and owner-only, freeze configured amount, debit once at booking, restore on cancellation', async () => {
  const s=setup(), inviter=await s.login(), newClient=await s.login('new@example.com'), staff=await s.login('admin@example.com');
  await enableVisits(s);
  const change=async value=>s.ok(await s.call('/admin/loyalty',{account:staff,method:'POST',data:{action:'referral-credit-save',amountSar:value,revision:(await s.adminSnapshot(staff)).revision,requestId:randomUUID()}}));
  const owner=await s.wallet(inviter);assert.equal(owner.referralWallet.creditPerReferralSar,null);
  await change(25);
  const booking=await s.create(newClient,{promotionCode:owner.referralCode});
  assert.equal(booking.pricing.discount,0);assert.equal((await s.wallet(inviter)).referralWallet.balanceSar,0);
  await change(40);await s.finish(staff,booking);await s.staff(staff,'payment-record',booking,{method:'card',amount:250});
  const earned=(await s.wallet(inviter)).referralWallet;assert.equal(earned.balanceSar,25);assert.equal(earned.entries[0].amountSar,25);assert.equal(earned.creditPerReferralSar,40);
  assert.equal((await s.wallet(newClient)).referralWallet.balanceSar,0);
  const input=s.input({time:'14:00',promotionCode:'WALLET',expectedWalletPricing:{discount:25,total:225}});
  const create=()=>s.call('/bookings',{account:inviter,data:input,method:'POST'});
  const [a,b]=await Promise.all([create(),create()]);assert.equal(s.ok(a).booking.id,s.ok(b).booking.id);
  assert.equal(a.data.booking.pricing.total,225);assert.equal((await s.wallet(inviter)).referralWallet.balanceSar,0);
  await s.cancel(inviter,a.data.booking);assert.equal((await s.wallet(inviter)).referralWallet.balanceSar,25);
  error(await s.call('/loyalty/quote',{account:inviter,method:'POST',data:{items:[{serviceId:'basic'}],code:owner.referralCode}}),409,'SELF_REFERRAL');
});

test('a booking for a relative cannot claim a referral or earn personal stamps for the booking account', async () => {
  const s=setup(), inviter=await s.login(), member=await s.login('guest@example.com'), staff=await s.login('admin@example.com');
  await enableVisits(s);
  const code=(await s.wallet(inviter)).referralCode, attendee={kind:'other',name:'Relative',relationship:'Family'};
  error(await s.call('/bookings',{account:member,method:'POST',data:s.input({attendee,promotionCode:code})}),409,'PERSONAL_VISIT_REQUIRED');
  const relative=await s.create(member,{attendee});await s.finish(staff,relative);
  await s.staff(staff,'payment-record',relative,{method:'cash',amount:250});
  assert.equal((await s.wallet(member)).stampCard.totalVisits,0);
  assert.equal((await s.create(member,{time:'15:30',promotionCode:code})).pricing.kind,'referral');
});

test('wallet spend cannot increase the accepted total after a second reservation spends some or all credit', async () => {
  const s=setup(), member=await s.login(), staff=await s.login('admin@example.com'), friend=await s.login('friend@example.com');
  await enableVisits(s);
  const referralCode=(await s.wallet(member)).referralCode;
  const rules=await s.adminSnapshot(staff);
  s.ok(await s.call('/admin/loyalty',{account:staff,method:'POST',data:{requestId:randomUUID(),revision:rules.revision,action:'referral-credit-save',amountSar:300}}));
  const visit=await s.create(friend,{promotionCode:referralCode});
  await s.finish(staff,visit);
  await s.staff(staff,'payment-record',visit,{method:'card',amount:250});
  const quote=async serviceId=>{
    const {discount,total}=s.ok(await s.call('/loyalty/quote',{account:member,method:'POST',data:{code:'WALLET',items:[{serviceId}]}}));
    return {discount,total};
  };
  const oldQuote=await quote('basic');
  assert.deepEqual(oldQuote,{discount:250,total:0});
  const draft=s.input({time:'15:00',promotionCode:'WALLET',expectedWalletPricing:oldQuote});
  const book=(data)=>s.call('/bookings',{account:member,method:'POST',data});
  const input=s.input({time:'13:00',items:[{serviceId:'brow'}],promotionCode:'WALLET',expectedWalletPricing:await quote('brow')});
  s.ok(await book(input));
  error(await book(draft),409,'WALLET_QUOTE_CHANGED');
  error(await book({...draft,expectedWalletPricing:undefined}),409,'WALLET_QUOTE_CHANGED');
  assert.equal((await s.wallet(member)).referralWallet.balanceSar,180);
  assert.equal(s.ok(await s.call('/me',{account:member})).bookings.length,1);
  error(await book({...input,expectedWalletPricing:{discount:20,total:100}}),409,'IDEMPOTENCY_CONFLICT');
  const updated=await quote('basic');assert.deepEqual(updated,{discount:180,total:70});
  const accepted=s.ok(await book({...draft,expectedWalletPricing:updated}));
  assert.equal(accepted.booking.pricing.total,70);
  error(await book({...draft,requestId:randomUUID(),time:'16:30'}),409,'WALLET_QUOTE_CHANGED');
  assert.equal((await s.wallet(member)).referralWallet.balanceSar,0);
});
