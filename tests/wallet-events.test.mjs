import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { activateWalletProgram, enqueueWalletEvent, listWalletEvents, readWalletEvent, claimWalletEvent, finishWalletEvent, WALLET_LEDGER } from '../server/wallet-events.mjs';
import { createBookings } from '../server/bookings.mjs';
import { awardArrivalVisit, awardCompletedVisit, createLoyalty } from '../server/loyalty.mjs';
import { newVisitProgram, recordStamp, reserveVisitBenefit, releaseVisitBenefit } from '../server/visit-rewards.mjs';
import { mac, read, update } from '../server/core.mjs';
import { bookingWalletMessage, WALLET_PROVIDER_COPY } from '../server/wallet-copy.mjs';

// Every external boundary is fake. No real enrollment, message, or stamp calls.
class Store {
  records = new Map(); version = 0; unknownOnce = false;
  async getWithMetadata(key) { return structuredClone(this.records.get(key) || null); }
  async setJSON(key, data, options) {
    const prior = this.records.get(key);
    if (options.onlyIfNew && prior || options.onlyIfMatch && prior?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++this.version); this.records.set(key, { data: structuredClone(data), etag });
    if (this.unknownOnce) { this.unknownOnce = false; throw Error('lost acknowledgement after commit'); }
    return { modified: true, etag };
  }
}
const NOW = Date.parse('2026-11-04T07:00:00Z');
const SECRET = 'fake-test-secret-at-least-thirty-two-characters';
const USER = { id: 'member-1', name: 'Local Test', email: 'member@example.invalid' };
const ledger = () => ({ schema: 1, bookings: {}, requests: {} });
async function save(store, value) { await update(store, WALLET_LEDGER, () => ({ value, result: true })); }
const paidVisit = (id, patch = {}) => ({ id, ownerId: USER.id, revision: 1, status: 'confirmed', contact: { name: USER.name, email: USER.email }, attendee: { kind: 'self', name: USER.name }, items: [{ serviceId: 'basic', price: 100, duration: 60 }], _staff: { stage: 'closed', finishedAt: new Date(NOW).toISOString(), additions: [] }, ...patch });
function complete(value, booking, paid = 100) {
  value.bookings[booking.id] = booking;
  value.staff ||= { receipts: [] };
  if (paid) value.staff.receipts.push({ bookingId: booking.id, amount: paid });
  awardCompletedVisit(value, booking, SECRET, NOW);
}

test('activation is idempotent and preserves live ledger without historical grants', async () => {
  const store = new Store(), value = ledger();
  value.bookings.old = paidVisit('old'); value.staff = { receipts: [{ bookingId: 'old', amount: 100 }] };
  value.loyalty = { customers: { legacy: { balance: 500 } }, coupons: { OLD: { status: 'available' } }, referrals: { ref: { status: 'pending' } } };
  await save(store, value);
  const original = structuredClone(value.loyalty);
  const [a, b] = await Promise.all([activateWalletProgram(store, NOW), activateWalletProgram(store, NOW)]);
  assert.deepEqual(a, b); assert.equal(a.enabled, true); assert.equal(a.activatedAt, new Date(NOW).toISOString());
  const after = await read(store, WALLET_LEDGER);
  assert.deepEqual(after.loyalty, original); assert.deepEqual(after.bookings, value.bookings);
  assert.deepEqual(after.visitProgram, newVisitProgram()); assert.equal(after.walletOutbox, undefined);
  const versions = store.version; await activateWalletProgram(store, NOW + 1000); assert.equal(store.version, versions);
  await assert.rejects(activateWalletProgram(store, NOW, { campaignId: 'another' }), e => e.code === 'WALLET_CAMPAIGN_CONFLICT');
});

test('activation preserves an existing visit program and recovers a lost commit acknowledgement', async () => {
  const store = new Store(), value = ledger(); value.visitProgram = newVisitProgram(); value.visitProgram.visits[USER.id] = [{ bookingId: 'existing' }];
  await save(store, value); store.unknownOnce = true;
  await assert.rejects(activateWalletProgram(store, NOW)); await activateWalletProgram(store, NOW);
  assert.deepEqual((await read(store, WALLET_LEDGER)).visitProgram, value.visitProgram);
});

test('outbox is opt in; frozen payloads dedupe and member delivery is serialized', async () => {
  const value = ledger(); assert.equal(enqueueWalletEvent(value, { id: 'disabled', userId: USER.id }, NOW), null);
  const store = new Store(); await activateWalletProgram(store, NOW);
  const input = { id: 'first', userId: USER.id, kind: 'stamp', stamps: 1, email: USER.email };
  await update(store, WALLET_LEDGER, current => { enqueueWalletEvent(current, input, NOW); enqueueWalletEvent(current, { id: 'second', userId: USER.id, kind: 'booking-message', message: 'Later' }, NOW); return { value: current }; });
  input.stamps = 99; assert.equal((await readWalletEvent(store, 'first')).stamps, 1);
  assert.equal(await claimWalletEvent(store, 'second', NOW), null);
  const claims = await Promise.all([claimWalletEvent(store, 'first', NOW), claimWalletEvent(store, 'first', NOW)]);
  assert.equal(claims.filter(Boolean).length, 1);
  await finishWalletEvent(store, 'first', { status: 'unknown', code: 'TIMEOUT' }, NOW);
  assert.equal(await claimWalletEvent(store, 'first', NOW), null); assert.equal(await claimWalletEvent(store, 'second', NOW), null);
  await finishWalletEvent(store, 'first', { status: 'sent' }, NOW);
  assert.equal((await claimWalletEvent(store, 'second', NOW)).sequence, 2);
  const sent = await readWalletEvent(store, 'first'); assert.equal(sent.email, undefined); assert.equal(sent.stamps, undefined);
  await update(store, WALLET_LEDGER, current => { enqueueWalletEvent(current, { ...input, stamps: 1 }, NOW); return { value: current }; });
  assert.deepEqual(await readWalletEvent(store, 'first'), sent); assert.equal((await listWalletEvents(store)).length, 0);
});

test('booking creation, rescheduling and cancellation enqueue in the same CAS; replay cannot double send', async () => {
  const store = new Store(); await activateWalletProgram(store, NOW);
  const bookings = createBookings({ store, mail: { send: async () => ({ status: 'sent' }) }, secret: SECRET, origin: 'https://example.invalid', now: () => NOW, schedule: { timeZone: 'Asia/Riyadh', weekdays: [0, 1, 2, 3, 4, 5, 6], open: '10:00', close: '22:00', stepMinutes: 30, horizonDays: 60 } });
  const input = { requestId: randomUUID(), date: '2026-11-04', time: '11:00', professional: 'any', contactName: USER.name, attendee: { kind: 'self' }, items: [{ serviceId: 'basic' }], locale: 'en' };
  store.unknownOnce = true;
  await assert.rejects(bookings.mutate('create', USER, input));
  const created = await bookings.mutate('create', USER, input), id = created.booking.id;
  assert.equal((await listWalletEvents(store)).length, 1);
  await bookings.mutate('update', USER, { requestId: randomUUID(), revision: 1, date: input.date, time: '12:00' }, id);
  await bookings.mutate('cancel', USER, { requestId: randomUUID(), revision: 2 }, id);
  const events = await listWalletEvents(store);
  assert.deepEqual(events.map(event => event.id), [1, 2, 3].map(revision => `booking:${id}:${revision}`));
  assert.match(events[0].message, /11:00/); assert.match(events[1].message, /12:00/); assert.match(events[2].message, /cancelled/);
  assert.ok(events.every(event => !event.message.includes(USER.name) && !/[\n\r]/.test(event.message)));
  assert.ok(events.every(event => !event.message.includes(id) && !event.message.includes(input.date)));
  assert.equal(events[0].message.includes(created.booking.items[0].nameEn), false);
});

test('financial claims bypass notification states while retaining financial sequence and semantic deduplication', async () => {
  for (const status of ['pending', 'processing', 'unknown', 'failed']) {
    const store = new Store(); await activateWalletProgram(store, NOW);
    await update(store, WALLET_LEDGER, value => {
      enqueueWalletEvent(value, { id: 'message', userId: USER.id, kind: 'booking-message', message: 'Update' }, NOW);
      value.walletOutbox.events.message.status = status;
      enqueueWalletEvent(value, { id: 'stamp', userId: USER.id, kind: 'stamp', stamps: 1 }, NOW);
      enqueueWalletEvent(value, { id: 'redeem', userId: USER.id, kind: 'redeem', rewardType: 1, rewards: 1 }, NOW);
      return { value };
    });
    assert.equal(await claimWalletEvent(store, 'redeem', NOW), null, status);
    const claims = await Promise.all([claimWalletEvent(store, 'stamp', NOW), claimWalletEvent(store, 'stamp', NOW)]);
    assert.equal(claims.filter(Boolean).length, 1, status);
    assert.equal(await claimWalletEvent(store, 'redeem', NOW), null, status);
    await finishWalletEvent(store, 'stamp', { status: 'sent' }, NOW);
    assert.equal((await claimWalletEvent(store, 'redeem', NOW)).kind, 'redeem', status);
    assert.equal((await readWalletEvent(store, 'message')).status, status);
    assert.equal(await claimWalletEvent(store, 'stamp', NOW), null, status);
  }
});

test('terminal uncertain or failed notifications do not fence newer messages; active notifications do', async () => {
  for (const status of ['pending', 'processing', 'unknown', 'failed']) {
    const store = new Store(); await activateWalletProgram(store, NOW);
    await update(store, WALLET_LEDGER, value => {
      enqueueWalletEvent(value, { id: 'old', userId: USER.id, kind: 'booking-message', message: 'Old' }, NOW);
      value.walletOutbox.events.old.status = status;
      enqueueWalletEvent(value, { id: 'new', userId: USER.id, kind: 'booking-message', message: 'New' }, NOW);
      return { value };
    });
    const claimed = await claimWalletEvent(store, 'new', NOW);
    assert.equal(Boolean(claimed), ['unknown', 'failed'].includes(status), status);
  }
});

test('unresolved or failed financial events continue fencing all subsequent member events', async () => {
  for (const kind of ['stamp', 'redeem']) for (const status of ['pending', 'processing', 'unknown', 'failed']) {
    const store = new Store(); await activateWalletProgram(store, NOW);
    await update(store, WALLET_LEDGER, value => {
      enqueueWalletEvent(value, { id: 'financial', userId: USER.id, kind }, NOW);
      value.walletOutbox.events.financial.status = status;
      enqueueWalletEvent(value, { id: 'later-stamp', userId: USER.id, kind: 'stamp', stamps: 1 }, NOW);
      enqueueWalletEvent(value, { id: 'later-message', userId: USER.id, kind: 'booking-message', message: 'Update' }, NOW);
      return { value };
    });
    assert.equal(await claimWalletEvent(store, 'later-stamp', NOW), null, `${kind}:${status}`);
    assert.equal(await claimWalletEvent(store, 'later-message', NOW), null, `${kind}:${status}`);
  }
});

test('lock-screen copy uses the booking Gregorian day and local twelve-hour time without private fields', () => {
  const input={id:'CL-PRIVATE-IDENTIFIER',date:'2027-01-01',time:'00:15',locale:'ar',contact:{name:'Private person'},items:[{nameAr:'Private service'}]};
  const message=bookingWalletMessage(input,'create');
  assert.match(message,/الجمعة ١ يناير/);assert.match(message,/١٢:١٥ ص/);assert.doesNotMatch(message,/١٤٤٨|2027-01-01|CL-PRIVATE|Private/);
  assert.match(bookingWalletMessage({...input,time:'12:15',locale:'en'},'cancel'),/Fri 1 Jan at 12:15 PM/);
  assert.match(WALLET_PROVIDER_COPY.stamp,/\{#\}/);
});

test('gift notifications keep each recipient language separate and remain frozen on replay', async () => {
  const store=new Store();await activateWalletProgram(store,NOW);
  const recipientEmail='language@example.invalid',recipientId=mac(SECRET,'user:'+recipientEmail),rewardId='FAC-LANGUAGE';
  await update(store,WALLET_LEDGER,value=>{value.bookings.prior={id:'prior',ownerId:recipientId,locale:'en',createdAt:new Date(NOW).toISOString()};value.visitProgram.rewards[rewardId]={id:rewardId,code:rewardId,earnerId:USER.id,ownerId:USER.id};return {value};});
  const loyalty=createLoyalty({store,secret:SECRET,now:()=>NOW}),input={requestId:randomUUID(),rewardId,recipientEmail,locale:'ar'};
  await loyalty.gift(USER,input);const before=(await read(store,WALLET_LEDGER)).walletOutbox.events;
  assert.doesNotMatch(before[`messagegift:${rewardId}:earner`].message,/[A-Za-z]/);
  assert.doesNotMatch(before[`messagegift:${rewardId}:owner`].message,/[\u0600-\u06ff]/);
  await loyalty.gift(USER,{...input,locale:'en'});assert.deepEqual((await read(store,WALLET_LEDGER)).walletOutbox.events,before);
});

test('only positive-priced personal arrivals stamp before payment, with one reward after five and no closure stamp', () => {
  const value = { ...ledger(), visitProgram: newVisitProgram(), walletIntegration: { enabled: true } };
  for (const [id, patch] of [['not-arrived', {}], ['other', { attendance: { status: 'arrived' }, attendee: { kind: 'other' } }], ['cancelled', { attendance: { status: 'arrived' }, status: 'cancelled' }], ['free', { attendance: { status: 'arrived' }, pricing: { total: 0 } }]]) awardArrivalVisit(value, paidVisit(id, patch), SECRET, NOW);
  complete(value, paidVisit('legacy-closed'));
  assert.equal(value.visitProgram.visits[USER.id], undefined);
  for (let n = 1; n <= 5; n++) {
    const booking = paidVisit(`arrived-${n}`, { attendance: { status: 'arrived' }, _staff: { stage: 'waiting', additions: [] } });
    awardArrivalVisit(value, booking, SECRET, NOW); awardArrivalVisit(value, booking, SECRET, NOW);
    assert.equal(value.visitProgram.visits[USER.id].length, n);
    booking._staff = { stage: 'closed', finishedAt: new Date(NOW).toISOString(), additions: [] };
    complete(value, booking); awardCompletedVisit(value, booking, SECRET, NOW);
  }
  assert.equal(value.visitProgram.visits[USER.id].length, 5); assert.equal(Object.keys(value.visitProgram.rewards).length, 1);
  const events = Object.values(value.walletOutbox.events); assert.equal(events.length, 5); assert.ok(events.every(event => event.kind === 'stamp' && event.stamps === 1));
  const free = paidVisit('direct-free', { pricing: { total: 0 } }); value.bookings[free.id] = free;
  assert.equal(recordStamp(value, free, SECRET, NOW), undefined); assert.equal(value.visitProgram.visits[USER.id].length, 5);
});

async function arrivalFixture() {
  const store = new Store(); await activateWalletProgram(store, NOW);
  const bookings = createBookings({ store, secret: SECRET, origin: 'https://clinic.example', now: () => NOW, mail: { async send() { return { status: 'sent' }; } }, schedule: { timeZone: 'Asia/Riyadh', weekdays: [0, 1, 2, 3, 4, 5, 6], open: '10:00', close: '18:00', stepMinutes: 30, horizonDays: 60 } });
  const create = async (extra = {}) => (await bookings.mutate('create', USER, { requestId: randomUUID(), items: [{ serviceId: 'basic' }], date: '2026-11-04', time: '11:00', professional: 'any', contactName: USER.name, attendee: { kind: 'self' }, ...extra })).booking;
  const arrival = (booking, requestId = randomUUID()) => bookings.mutate('arrival', USER, { requestId, revision: booking.revision }, booking.id, { admin: true, actor: { id: 'admin' } });
  return { store, bookings, create, arrival, value: () => read(store, WALLET_LEDGER) };
}

test('arrival CAS atomically grants once across duplicate requests, lost acknowledgements, later movement and cancellation', async () => {
  const s = await arrivalFixture(), booking = await s.create();
  assert.deepEqual((await s.value()).visitProgram.visits, {}, 'confirmation does not stamp');
  const requestId = randomUUID(); s.store.unknownOnce = true;
  await assert.rejects(s.arrival(booking, requestId));
  for (const result of await Promise.all([s.arrival(booking, requestId), s.arrival(booking), s.arrival(booking)])) assert.equal(result.booking.attendance.status, 'arrived');
  let value = await s.value();
  assert.equal(value.visitProgram.visits[USER.id].length, 1);
  assert.equal(Object.values(value.walletOutbox.events).filter(event => event.kind === 'stamp').length, 1);
  assert.equal(value.walletOutbox.events[`stamp:${booking.id}`].stamps, 1);
  assert.equal(value.staff?.receipts?.length || 0, 0, 'stamp precedes payment');
  const moved = (await s.bookings.mutate('update', USER, { requestId: randomUUID(), revision: 1, date: '2026-11-05', time: '11:00' }, booking.id, { admin: true, actor: { id: 'admin' } })).booking;
  assert.equal(moved.attendance, undefined); await s.arrival(moved);
  await s.bookings.mutate('cancel', USER, { requestId: randomUUID(), revision: 2 }, booking.id, { admin: true, actor: { id: 'admin' } });
  value = await s.value();
  assert.equal(value.visitProgram.visits[USER.id].length, 1, 'earned arrival survives cancellation/date move');
  assert.equal(Object.values(value.walletOutbox.events).filter(event => event.kind === 'stamp').length, 1);
});

test('old attendance replay never retrogrants; existing stamps are preserved; new fifth arrival creates only one reward', async () => {
  const s = await arrivalFixture(), old = await s.create();
  await update(s.store, WALLET_LEDGER, value => {
    value.bookings[old.id].attendance = { status: 'arrived', arrivedAt: new Date(NOW - 86400000).toISOString() };
    value.visitProgram.visits[USER.id] = Array.from({ length: 4 }, (_, n) => ({ bookingId: `existing-${n}`, at: new Date(NOW - 86400000).toISOString() }));
    return { value };
  });
  await s.arrival(old); assert.equal((await s.value()).visitProgram.visits[USER.id].length, 4);
  const fifth = await s.create({ time: '12:00' });
  await Promise.all([s.arrival(fifth), s.arrival(fifth)]);
  const value = await s.value();
  assert.equal(value.visitProgram.visits[USER.id].length, 5); assert.equal(Object.keys(value.visitProgram.rewards).length, 1);
  assert.equal(Object.values(value.walletOutbox.events).filter(event => event.kind === 'stamp').length, 1);
});

test('admin arrival excludes fully free/reward and other-attendee bookings while unpaid positive totals qualify', async () => {
  const s = await arrivalFixture();
  const free = await s.create(), reward = await s.create({ time: '12:00' }), other = await s.create({ time: '13:00', attendee: { kind: 'other', name: 'Relative' } }), positive = await s.create({ time: '14:00' });
  await update(s.store, WALLET_LEDGER, value => {
    value.bookings[free.id].pricing.total = 0;
    value.bookings[reward.id].pricing = { ...value.bookings[reward.id].pricing, total: 0, kind: 'facial' };
    return { value };
  });
  await Promise.all([free, reward, other, positive].map(booking => s.arrival(booking)));
  const value = await s.value();
  assert.deepEqual(value.visitProgram.visits[USER.id].map(visit => visit.bookingId), [positive.id]);
  assert.equal(Object.values(value.walletOutbox.events).filter(event => event.kind === 'stamp').length, 1);
});

test('facial reservations/cancellations do not redeem; final free use consumes once without a stamp', () => {
  const value = { ...ledger(), visitProgram: newVisitProgram(), walletIntegration: { enabled: true } }, id = 'FAC-EXAMPLE';
  const reward = value.visitProgram.rewards[id] = { id, code: id, ownerId: USER.id, earnerId: USER.id };
  const booking = paidVisit('reward-use', { pricing: { total: 0 }, _loyalty: {} });
  reserveVisitBenefit(value.visitProgram, booking, { reward }, NOW); assert.equal(value.walletOutbox, undefined);
  releaseVisitBenefit(value.visitProgram, booking, NOW); assert.equal(reward.bookingId, undefined);
  reserveVisitBenefit(value.visitProgram, booking, { reward }, NOW); complete(value, booking, 0); awardCompletedVisit(value, booking, SECRET, NOW);
  assert.ok(reward.consumedAt); assert.equal(value.visitProgram.visits[USER.id], undefined);
  const events = Object.values(value.walletOutbox.events); assert.equal(events.length, 1); assert.deepEqual([events[0].kind, events[0].rewardType, events[0].rewards], ['redeem', 1, 1]);
});

test('gift transfers once with two messages; recipient use redeems the original earner reward', async () => {
  const store = new Store(); await activateWalletProgram(store, NOW);
  const rewardId = 'FAC-GIFT', recipientEmail = 'gift@example.invalid', recipientId = mac(SECRET, 'user:' + recipientEmail);
  await update(store, WALLET_LEDGER, value => { value.visitProgram.rewards[rewardId] = { id: rewardId, code: rewardId, earnerId: USER.id, ownerId: USER.id }; return { value }; });
  const loyalty = createLoyalty({ store, secret: SECRET, now: () => NOW }), input = { requestId: randomUUID(), rewardId, recipientEmail };
  await loyalty.gift(USER, input); await loyalty.gift(USER, input);
  await assert.rejects(loyalty.gift({ id: recipientId, email: recipientEmail }, { ...input, requestId: randomUUID(), recipientEmail: 'third@example.invalid' }), e => e.code === 'REWARD_UNAVAILABLE');
  const value = await read(store, WALLET_LEDGER), reward = value.visitProgram.rewards[rewardId];
  assert.equal(reward.ownerId, recipientId);
  assert.equal(Object.values(value.walletOutbox.events).length, 2); assert.ok(Object.values(value.walletOutbox.events).every(event => event.kind === 'booking-message'));
  const booking = paidVisit('gift-use', { ownerId: recipientId, contact: { name: 'Recipient', email: recipientEmail }, pricing: { total: 0 }, _loyalty: {} });
  reserveVisitBenefit(value.visitProgram, booking, { reward }, NOW); complete(value, booking, 0);
  assert.equal(value.walletOutbox.events[`redeem:${rewardId}`].userId, USER.id);
  assert.equal(Object.keys(value.visitProgram.rewards).length, 1); assert.deepEqual(value.visitProgram.visits, {});
});
