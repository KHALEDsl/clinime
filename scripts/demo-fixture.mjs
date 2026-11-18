// Portable demo only: actual API, synthetic identities, volatile CAS storage,
// fake mail and an explicit environment. Never imported by a deployment adapter.
import { randomUUID } from 'node:crypto';
import { createGrowthFixture } from './growth-local-server.mjs';
import { createAPI } from '../server/api.mjs';
import { LOCAL_PROFESSIONALS } from '../server/professionals.mjs';
import { newVisitProgram, recordStamp } from '../server/visit-rewards.mjs';
import { careWeek, CARE_LEDGER } from '../server/care-point.mjs';

export const DEMO_ORIGIN = 'https://clinime-growth-local.invalid';
export const DEMO_SCENARIOS = ['ready', 'empty', 'slow', 'error', 'insufficient'];
export const DEMO_SECRET = 'local-QA-fixture-secret-never-a-live-production-secret-2026';
const LEDGER = 'clinic/booking-ledger-v1';
const DAY = 86400000;
const ok = result => { if (result.status !== 200) throw Error('Demo seed: ' + JSON.stringify(result.data)); return result.data; };

export async function createDemoFixture({ scenario = 'ready', epoch = new Date().toISOString() } = {}) {
  if (!DEMO_SCENARIOS.includes(scenario)) throw Error('Unknown demo scenario');
  const base = await createGrowthFixture({ scenario: ['slow', 'error'].includes(scenario) ? 'ready' : scenario, epoch });
  const { fixture, account: admin } = base;
  const customer = await fixture.login('customer@example.invalid');
  const friend = await fixture.login('friend@example.invalid');
  ok(await fixture.request('/api/profile', { method: 'PATCH', account: customer, data: { name: 'سارة · بيانات تجريبية' } }));
  ok(await fixture.request('/api/profile', { method: 'PATCH', account: friend, data: { name: 'ريم · بيانات تجريبية' } }));
  ok(await fixture.request('/api/profile', { method: 'PATCH', account: admin, data: { name: 'إدارة كلينيمي · تجربة' } }));
  let ledger = fixture.ledger();
  ledger.visitProgram = newVisitProgram();
  ledger.visitProgram.referralCreditSar = 25;
  if (scenario !== 'empty') {
    const rows = Object.values(ledger.bookings);
    const closed = rows.filter(b => b.status === 'confirmed' && b._staff?.stage === 'closed').sort((a, b) => a.date.localeCompare(b.date)).slice(-9);
    const selected = [...closed, ...rows.filter(b => b.date === base.summary.today && b._staff?.stage === 'waiting' && !b.attendance).slice(0, 1), ...rows.filter(b => b.date > base.summary.today).slice(0, 2), ...rows.filter(b => b.status === 'cancelled').slice(-1)];
    for (const booking of selected) {
      booking.ownerId = customer.user.id;
      booking.contact = { name: 'سارة · بيانات تجريبية', email: customer.user.email };
      booking.attendee = { kind: 'self', name: 'سارة · بيانات تجريبية', relationship: '' };
    }
    for (const booking of closed) recordStamp(ledger, booking, DEMO_SECRET, Date.parse(booking._staff.closedAt || booking.updatedAt));
    // Nine paid example visits yield one earned reward and four current stamps.
    // The sparse-history scenario intentionally contains fewer visits.
    ledger.visitProgram.transactions['demo-referral-credit'] = { id: 'demo-referral-credit', userId: customer.user.id, cents: 2500, kind: 'referral', createdAt: new Date(fixture.now() - DAY).toISOString() };
  }
  await fixture.store.setJSON(LEDGER, ledger, { onlyIfMatch: fixture.store.records.get(LEDGER).etag });
  const wallet = ok(await fixture.request('/api/loyalty', { account: customer }));
  ok(await fixture.request('/api/loyalty', { account: friend }));
  if (scenario !== 'empty') {
    const future = new Date(Date.parse(base.summary.today + 'T12:00:00Z') + 3 * DAY).toISOString().slice(0, 10);
    ok(await fixture.request('/api/bookings', { method: 'POST', account: friend, data: { requestId: randomUUID(), professional: 'any', date: future, time: '20:30', items: [{ serviceId: 'basic' }], contactName: 'ريم · بيانات تجريبية', attendee: { kind: 'self' }, promotionCode: wallet.referralCode } }));
    ledger = fixture.ledger();
    ledger.loyalty.referrals['demo-earned-referral'] = { id: 'demo-earned-referral', program: 'visits', referrerId: customer.user.id, referredId: friend.user.id, bookingId: 'demo-historical-referral', status: 'earned', amountSar: 25, createdAt: new Date(fixture.now() - 5 * DAY).toISOString(), completedAt: new Date(fixture.now() - DAY).toISOString() };
    await fixture.store.setJSON(LEDGER, ledger, { onlyIfMatch: fixture.store.records.get(LEDGER).etag });
    const current = careWeek(fixture.now()), previous = careWeek(fixture.now() - 7 * DAY);
    const players = (pointsA, pointsB) => ({ [customer.user.id]: { points: pointsA, roundsCompleted: pointsA / 100 }, [friend.user.id]: { points: pointsB, roundsCompleted: pointsB / 100 } });
    await fixture.store.setJSON(CARE_LEDGER, { schema: 1, enabled: true, revision: 1, weeks: { [current.key]: { ...current, players: players(300, 500), rounds: {}, frozenAt: null, winnerId: null, tie: null, prize: null }, [previous.key]: { ...previous, players: players(200, 400), rounds: {}, frozenAt: null, winnerId: null, tie: null, prize: null } }, requests: {}, profiles: { [customer.user.id]: { firstName: 'سارة', chosenAt: current.startsAt, updatedAt: current.startsAt }, [friend.user.id]: { firstName: 'ريم', chosenAt: current.startsAt, updatedAt: current.startsAt } } }, { onlyIfNew: true });
  }
  // Reassigned example histories now share the sample customer's patient key.
  // Retain the coherent completed-visit flags from the original growth fixture.
  const workspace = ok(await fixture.request('/api/admin/workspace', { account: admin }));
  ledger = fixture.ledger();
  // Workspace deliberately omits ownerId, so use the authoritative local ledger.
  for (const booking of Object.values(ledger.bookings)) {
    const visit = workspace.visits[booking.id];
    if (booking.ownerId === customer.user.id && ['session', 'checkout', 'closed'].includes(visit?.stage)) ledger.staff.medical[visit.patientId] = { fields: {}, flags: { consultation: true, assessment: true, consent: true }, updatedAt: booking.updatedAt };
  }
  await fixture.store.setJSON(LEDGER, ledger, { onlyIfMatch: fixture.store.records.get(LEDGER).etag });
  // Re-create the runtime API with a closed environment and a rejecting network
  // adapter. A caller's .env / process.env can never configure live integrations.
  const api = createAPI({ store: fixture.store, mail: fixture.mail, now: fixture.now, env: {
    APP_SECRET: DEMO_SECRET, PUBLIC_ORIGIN: DEMO_ORIGIN,
    RESEND_API_KEY: 'demo-fake-mail-only', EMAIL_FROM: 'Demo <demo@example.invalid>',
    CLINIME_ADMIN_ACCESS: 'allowlist', CLINIME_ADMIN_EMAILS: admin.user.email,
    CLINIME_SPECIALISTS_JSON: JSON.stringify(LOCAL_PROFESSIONALS), CLINIME_ROSTER_SAMPLE: 'true',
    CLINIC_SCHEDULE_JSON: JSON.stringify({ timeZone: 'Asia/Riyadh', weekdays: [0, 1, 2, 3, 4, 5, 6], open: '08:00', close: '22:00', stepMinutes: 30, horizonDays: 60 }),
  }, loopyFetch: async () => { throw Error('External network is disabled in the portable demo'); } });
  // Seed-only authentication codes are not useful in the public mail viewer.
  fixture.mail.calls.length = 0;
  return { fixture, api, accounts: { admin, customer, friend }, enrollment: new Map(), summary: { ...base.summary, scenario, bookings: Object.keys(ledger.bookings).length, fakeMailCount: 0, syntheticDataOnly: true, externalProviderCalls: 0 } };
}
