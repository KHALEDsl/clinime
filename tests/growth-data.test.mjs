import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../client/admin/staff/growth-data.js', import.meta.url), 'utf8');
const nodeContext = vm.createContext({ module: { exports: {} } });
vm.runInContext(source, nodeContext);
const engine = nodeContext.module.exports;
const analyze = (workspace, options) => structuredClone(engine.analyze(workspace, options));
const TODAY = '2026-11-12', AS_OF = '2026-11-12T10:00:00.000Z';
const shift = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const booking = (id, date, extra = {}) => ({ id, date, status: 'confirmed', revision: 1, time: '11:00', attendee: { kind: 'self' }, contact: { email: id + '@example.invalid', name: 'PRIVATE-NAME' }, items: [{ serviceId: 'basic', price: 250, duration: 40 }], ...extra });
const workspace = extra => ({ asOf: AS_OF, bookings: [], catalog: [], visits: {}, stock: {}, receipts: [], ...extra });
function deepFreeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
function history(days = 70) {
  const rows = [];
  for (let age = days; age >= 1; age--) {
    const date = shift(TODAY, -age), count = 1 + age % 3;
    for (let index = 0; index < count; index++) rows.push(booking('past-' + age + '-' + index, date));
  }
  return rows;
}
const recommendation = (analysis, type) => analysis.recommendations.find(entry => entry.type === type);
const closedVisits = rows => Object.fromEntries(rows.filter(row => row.date < TODAY).map(row => [row.id, { stage: 'closed' }]));

test('UMD exposes a browser global and CommonJS engine without IO, and analysis never mutates input', () => {
  const browser = vm.createContext({}); vm.runInContext(source, browser);
  assert.equal(typeof browser.StaffGrowthData.analyze, 'function'); assert.equal(typeof engine.analyze, 'function');
  const data = deepFreeze(workspace({ bookings: [booking('one', TODAY)], visits: { one: { stage: 'waiting' } } }));
  const before = JSON.stringify(data), output = analyze(data);
  assert.equal(JSON.stringify(data), before); assert.equal(output.summary.todayBooked, 1);
  assert.equal(source.includes('fetch('), false); assert.equal(source.includes('localStorage'), false); assert.equal(source.includes('sessionStorage'), false);
});

test('insufficient history stays explicit and unrecorded zero days never manufacture four comparable observations', () => {
  const output = analyze(workspace({ bookings: [booking('oldest', shift(TODAY, -90)), booking('recent', shift(TODAY, -1))] }));
  assert.equal(output.forecast.status, 'insufficient'); assert.equal(output.forecast.days.length, 7);
  assert.equal(output.source.coverageStart, shift(TODAY, -90)); assert.equal(output.source.historyDays, 90);
  assert.equal(output.forecast.days.every(day => day.estimate === null && day.comparableDays < 4), true);
  assert.equal(recommendation(output, 'quieter-day'), undefined);
  const unknownClock = analyze({ bookings: [booking('old', '2026-09-01')] });
  assert.equal(unknownClock.today, null); assert.equal(unknownClock.forecast.status, 'insufficient'); assert.deepEqual(unknownClock.forecast.days, []);
});

test('forecasts use the last eight completed matching weekdays and separate future bookings from estimates', () => {
  const bookings = history(84), tomorrow = shift(TODAY, 1);
  for (let i = 0; i < 20; i++) bookings.push(booking('future-' + i, tomorrow));
  bookings.push(booking('today-does-not-train', TODAY));
  const output = analyze(workspace({ bookings, visits: closedVisits(bookings) })), day = output.forecast.days[0];
  assert.equal(output.forecast.status, 'ready'); assert.equal(day.date, tomorrow); assert.equal(day.booked, 20);
  assert.equal(day.comparableDays, 8); assert.equal(day.observedCounts.every(sample => sample.date < TODAY && new Date(sample.date).getUTCDay() === new Date(tomorrow).getUTCDay()), true);
  assert.equal(day.observedCounts.every(sample => sample.count <= 3), true, 'future bookings do not train the baseline');
  assert.equal(day.estimate.low, 1); assert.equal(day.estimate.high, 3); assert.equal(day.estimate.typical <= 3, true);
  assert.equal(output.summary.next7Booked, 20); assert.equal(output.summary.todayBooked, 1);
  assert.equal(output.forecast.days.every(entry => entry.estimate.high >= entry.estimate.low), true);
  assert.equal(day.estimate.high < day.booked, true, 'booked appointments do not guarantee completed visits');
});

test('cancellations, duplicate IDs and records created after the snapshot cutoff cannot inflate booking evidence', () => {
  const tomorrow = shift(TODAY, 1), bookings = history(35);
  bookings.push(booking('duplicate', tomorrow, { revision: 1 }), booking('duplicate', tomorrow, { revision: 2, status: 'cancelled' }));
  bookings.push(booking('same-live', tomorrow), booking('same-live', tomorrow));
  bookings.push(booking('cancelled', tomorrow, { status: 'cancelled' }));
  bookings.push(booking('future-created', shift(TODAY, -7), { createdAt: '2026-11-13T00:00:00Z' }));
  bookings.push(booking('bad-date', '2026-02-30'), booking('<unsafe>', tomorrow), booking('pending', tomorrow, { status: 'pending' }));
  const output = analyze(workspace({ bookings, visits: closedVisits(bookings) }));
  assert.equal(output.summary.next7Booked, 1); assert.equal(output.source.excludedCancelled, 2);
  assert.equal(output.source.duplicateBookings, 2); assert.equal(output.source.excludedFutureRecords, 1);
  assert.equal(output.source.excludedInvalid, 2); assert.equal(output.source.excludedOtherStatuses, 1);
});

test('Riyadh dates and explicit date cutoffs prevent current or later observations entering historical samples', () => {
  const rows = history(35);
  const output = analyze(workspace({ asOf: '2026-11-11T22:30:00Z', bookings: rows, visits: closedVisits(rows) }));
  assert.equal(output.today, '2026-11-12'); assert.equal(output.source.coverageEnd, '2026-11-11');
  const cut = analyze(workspace({ bookings: rows, visits: closedVisits(rows) }), { today: '2026-11-08' });
  assert.equal(cut.today, '2026-11-08'); assert.equal(cut.forecast.days.every(day => day.observedCounts.every(sample => sample.date < '2026-11-08')), true);
});

test('retention candidates dedupe accounts, exclude upcoming confirmed clients and ignore cancelled future bookings', () => {
  const bookings = [
    booking('closed-a1', '2026-10-01', { contact: { email: 'a@example.invalid' } }), booking('closed-a2', '2026-10-15', { contact: { email: 'A@example.invalid' } }),
    booking('closed-b', '2026-10-01', { contact: { email: 'b@example.invalid' } }), booking('future-b', '2026-11-14', { contact: { email: 'B@example.invalid' } }),
    booking('cancelled-a', '2026-11-14', { status: 'cancelled', contact: { email: 'a@example.invalid' } }),
    booking('not-closed', '2026-10-01'), booking('future-closed', '2026-11-20'),
  ];
  const visits = Object.fromEntries(['closed-a1', 'closed-a2', 'closed-b', 'future-closed'].map(id => [id, { stage: 'closed' }]));
  const output = analyze(workspace({ bookings, visits })), retention = recommendation(output, 'retention');
  assert.equal(output.summary.pastClosedVisits, 3); assert.equal(output.summary.retentionCandidates, 1);
  assert.equal(retention.count, 1); assert.deepEqual(retention.targetIds, ['closed-a2']);
  assert.equal(JSON.stringify(retention).includes('a@example.invalid'), false);
});

test('verified low-stock recommendations exclude unknown counts, malformed thresholds and equipment', () => {
  const stock = {
    low: { id: 'low', quantity: 2, min: 3, quantityVerified: true }, zero: { id: 'zero', quantity: 0, min: 0, quantityVerified: true },
    unknown: { id: 'unknown', quantity: 0, min: 100, quantityVerified: false }, missingFlag: { id: 'missingFlag', quantity: 0, min: 10 },
    invalid: { id: 'invalid', quantity: Infinity, min: 10, quantityVerified: true }, missingMin: { id: 'missingMin', quantity: 0, quantityVerified: true },
    equipment: { id: 'equipment', quantity: 0, min: 1, quantityVerified: true, kind: 'جهاز' }, enough: { id: 'enough', quantity: 11, min: 10, quantityVerified: true },
  };
  const output = analyze(workspace({ stock })), low = recommendation(output, 'stock-low');
  assert.equal(low.count, 2); assert.deepEqual(low.targetIds, ['low', 'zero']); assert.equal(low.evidence.basis, 'verified-counts');
});

test('actual recorded collection is deduplicated and separate from checkout balances, with future/refund/failed receipts excluded', () => {
  const receipts = [
    { id: 'r1', amount: 100.1, recordedAt: '2026-11-12T09:00:00Z', kind: 'manual' }, { id: 'r1', amount: 100.1, recordedAt: '2026-11-12T09:00:00Z', kind: 'manual' },
    { id: 'r2', amount: 25.2, recordedAt: '2026-11-11T09:00:00Z' }, { id: 'future', amount: 999, recordedAt: '2026-11-13T09:00:00Z' },
    { id: 'failed', amount: 999, status: 'failed', recordedAt: '2026-11-12T09:00:00Z' }, { id: 'refund', amount: 100, kind: 'refund', recordedAt: '2026-11-12T09:00:00Z' },
    { id: 'other-currency', amount: 999, currency: 'USD', recordedAt: '2026-11-12T09:00:00Z' }, { id: 'bad', amount: -1, recordedAt: '2026-11-12T09:00:00Z' },
  ];
  const bookings = [booking('checkout', TODAY), booking('past-open', '2026-11-10'), booking('cancelled-checkout', TODAY, { status: 'cancelled' })];
  const visits = { checkout: { stage: 'checkout', balance: 74.7 }, 'past-open': { stage: 'waiting', balance: 10000 }, 'cancelled-checkout': { stage: 'checkout', balance: 1000 } };
  const output = analyze(workspace({ receipts, bookings, visits }));
  assert.equal(output.summary.collectedAmount, 125.3); assert.equal(output.summary.collectedTodayAmount, 100.1);
  assert.equal(output.summary.unpaidCheckoutAmount, 74.7); assert.equal(output.summary.unpaidCheckoutCount, 1);
  assert.equal(output.source.duplicateReceipts, 1); assert.equal(output.source.includedReceipts, 2);
  assert.deepEqual(recommendation(output, 'visit-unresolved').targetIds, ['past-open']);
});

test('catalog recommendations describe missing fields without publishing clinical content or inactive drafts', () => {
  const catalog = [
    { id: 'complete', nameAr: 'خدمة', nameEn: 'Service', description: 'Description', category: 'skin', price: 0, duration: 40, options: [] },
    { id: 'missing', nameAr: 'اسم', nameEn: '', description: '', category: 'skin', price: NaN, duration: 0, options: [] },
    { id: 'option-missing', nameAr: 'اسم', nameEn: 'Name', description: 'Description', category: 'skin', price: 1, duration: 1, options: [{ price: 1, duration: 1 }] },
    { id: 'inactive', active: false }, { id: 'unavailable', availability: 'unavailable' },
  ];
  const output = analyze(workspace({ catalog })), incomplete = recommendation(output, 'catalog-incomplete');
  assert.equal(incomplete.count, 2); assert.deepEqual(incomplete.targetIds, ['missing', 'option-missing']);
  assert.deepEqual(incomplete.evidence.services[0].missing, ['names', 'description', 'price', 'duration']);
});

test('quieter-day suggestions require comparable evidence and make no capacity, performance or private-note claims', () => {
  const rows = history(70);
  const data = workspace({ bookings: rows, medical: { secret: { notes: 'PRIVATE-CLINICAL-MARKER' } }, visits: { ...closedVisits(rows), 'past-1-0': { stage: 'closed', notes: 'PRIVATE-INTERNAL-NOTE', decision: { note: 'PRIVATE-DECISION-REASON' } } } });
  const output = analyze(data), suggestion = recommendation(output, 'quieter-day');
  assert.equal(suggestion.evidence.comparableDays, 8); assert.equal(suggestion.count, 0); assert.equal(suggestion.evidence.booked, 0);
  const encoded = JSON.stringify(output);
  for (const marker of ['PRIVATE-', '@example.invalid', 'PRIVATE-NAME', 'medical', 'profit', 'competitor', 'confidence', 'free capacity']) assert.equal(encoded.includes(marker), false, marker);
  for (const entry of output.recommendations) {
    assert.equal(Number.isFinite(entry.priority), true); assert.equal(Number.isFinite(entry.count), true);
    for (const key of ['id', 'type', 'title', 'reason', 'actionLabel']) assert.equal(typeof entry[key], 'string');
    assert.ok(entry.evidence && Array.isArray(entry.targetIds));
  }
  assert.deepEqual(analyze(data), output, 'the same snapshot produces stable recommendations');
});

test('forecast trains only known closed visits, never unresolved, no-show, cancelled or future-completed records', () => {
  const rows = [], visits = {}, tomorrow = shift(TODAY, 1);
  for (let week = 1; week <= 4; week++) {
    const day = shift(tomorrow, -7 * week), completed = booking('closed-' + week, day);
    rows.push(completed); visits[completed.id] = { stage: 'closed' };
    for (let i = 0; i < 10; i++) { const unresolved = booking('unresolved-' + week + '-' + i, day); rows.push(unresolved); visits[unresolved.id] = { stage: i % 2 ? 'waiting' : 'no-show' }; }
    const cancelled = booking('cancelled-' + week, day, { status: 'cancelled' }); rows.push(cancelled); visits[cancelled.id] = { stage: 'closed' };
  }
  rows.push(booking('closed-in-future', shift(tomorrow, -7))); visits['closed-in-future'] = { stage: 'closed', closedAt: '2026-11-13T10:00:00Z' };
  const output = analyze(workspace({ bookings: rows, visits })), day = output.forecast.days[0];
  assert.equal(output.forecast.basis, 'closed-visit-weekday-history'); assert.equal(output.forecast.status, 'partial');
  assert.equal(day.comparableDays, 4); assert.deepEqual(day.estimate, { low: 1, high: 1, typical: 1 });
  assert.equal(day.observedCounts.every(sample => sample.count === 1), true); assert.equal(output.source.closedTrainingVisits, 4);
  const noCompletions = analyze(workspace({ bookings: history(70), visits: {} }));
  assert.equal(noCompletions.forecast.status, 'insufficient'); assert.equal(noCompletions.source.closedTrainingVisits, 0);
});

test('gift recipients cannot create buyer retention history or suppress the buyer own follow-up candidate', () => {
  const account = { email: 'buyer@example.invalid' };
  const rows = [
    booking('gift-past', '2026-10-01', { contact: account, attendee: { kind: 'other', name: 'Gift recipient' } }),
    booking('self-past', '2026-10-02', { contact: account, attendee: { kind: 'self' } }),
    booking('gift-future', '2026-11-20', { contact: account, attendee: { kind: 'other', name: 'Another recipient' } }),
    booking('gift-only', '2026-10-03', { contact: { email: 'gift-only@example.invalid' }, attendee: { kind: 'other' } }),
    booking('unknown-attendee', '2026-10-04', { contact: { email: 'unknown@example.invalid' }, attendee: undefined }),
  ];
  const output = analyze(workspace({ bookings: rows, visits: closedVisits(rows) })), retention = recommendation(output, 'retention');
  assert.equal(output.summary.retentionCandidates, 1); assert.deepEqual(retention.targetIds, ['self-past']);
  rows.push(booking('self-future', '2026-11-21', { contact: account, attendee: { kind: 'self' } }));
  assert.equal(analyze(workspace({ bookings: rows, visits: closedVisits(rows) })).summary.retentionCandidates, 0);
});
