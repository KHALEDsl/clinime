import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import E from '../server/care-point-engine.cjs';
import { careWeek, CARE_LEDGER, createCarePoint } from '../server/care-point.mjs';
import { createAPI } from '../server/api.mjs';

const BOOKING = 'clinic/booking-ledger-v1';
class Store {
  records = new Map(); version = 0; unknownOnce = null; failOnce = null; failAfterBooking = false;
  async getWithMetadata(key, options) { assert.equal(options.consistency, 'strong'); return structuredClone(this.records.get(key) || null); }
  async setJSON(key, data, conditions) {
    if (this.failOnce === key) { this.failOnce = null; throw Error('write unavailable'); }
    const current = this.records.get(key);
    if (conditions.onlyIfNew && current || conditions.onlyIfMatch && current?.etag !== conditions.onlyIfMatch) return { modified: false };
    const etag = String(++this.version); this.records.set(key, { data: structuredClone(data), etag });
    if (key === BOOKING && this.failAfterBooking) { this.failAfterBooking = false; this.failOnce = CARE_LEDGER; }
    if (this.unknownOnce === key) { this.unknownOnce = null; throw Error('lost acknowledgement'); }
    return { modified: true, etag };
  }
  value(key) { return structuredClone(this.records.get(key)?.data || null); }
}
function setup(overrides = {}) {
  const store = new Store(), mail = { calls: [], async send(message) { this.calls.push(structuredClone(message)); return { status: 'sent' }; } };
  let time = Date.parse('2026-11-04T07:00:00Z');
  const env = { PUBLIC_ORIGIN: 'https://clinic.example', APP_SECRET: 'care-point-tests-secret-with-more-than-32-characters', RESEND_API_KEY: 'local', EMAIL_FROM: 'local@clinic.example', CLINIME_ADMIN_EMAILS: 'owner@example.com', ...overrides };
  const api = createAPI({ store, mail, env, now: () => time }), care = createCarePoint({ store, secret: env.APP_SECRET, now: () => time });
  async function call(path, { account, method = 'GET', data, origin = env.PUBLIC_ORIGIN, csrf = account?.csrfToken } = {}) {
    const result = await api(new Request(env.PUBLIC_ORIGIN + '/api' + path, { method, headers: { Origin: origin, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(account ? { Cookie: account.cookie, 'X-CSRF-Token': csrf } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) }), { ip: '192.0.2.48' });
    return { status: result.status, data: await result.json(), cookie: result.headers.get('set-cookie') };
  }
  const ok = result => { assert.equal(result.status, 200, JSON.stringify(result)); return result.data; };
  async function login(email = 'player@example.com') {
    const request = ok(await call('/auth/request', { method: 'POST', data: { requestId: randomUUID(), email, mode: 'code', locale: 'en' } }));
    const code = mail.calls.at(-1).text.match(/Sign-in code: (\d{6})/)[1];
    const result = await call('/auth/verify', { method: 'POST', data: { challengeId: request.challengeId, code } });
    return { ...ok(result), cookie: result.cookie.split(';')[0] };
  }
  const named = new Set();
  const chooseName = async (account, firstName = 'خالد', requestId = randomUUID()) => { const result = await call('/care-point/name', { account, method: 'POST', data: { requestId, firstName } }); if (result.status === 200) named.add(account.user.id); return result; };
  const start = async account => { if (!named.has(account.user.id)) ok(await chooseName(account)); return ok(await call('/care-point/start', { account, method: 'POST', data: { requestId: randomUUID() } })); };
  const solution = round => E.makeChallenge(round.seed).solution;
  const complete = async (account, round, extra = {}) => call('/care-point/complete', { account, method: 'POST', data: { requestId: randomUUID(), roundId: round.id, rotations: solution(round), ...extra } });
  const admin = async owner => ok(await call('/admin/care-point', { account: owner }));
  async function command(owner, action, extra = {}) { const snapshot = await admin(owner); return call('/admin/care-point', { account: owner, method: 'POST', data: { requestId: randomUUID(), revision: snapshot.revision, action, ...extra } }); }
  const advance = milliseconds => time += milliseconds;
  return { store, mail, care, call, ok, login, chooseName, start, complete, admin, command, advance, solution, setTime: value => time = Date.parse(value) };
}
function error(result, status, code) { assert.equal(result.status, status, JSON.stringify(result)); assert.equal(result.data.error.code, code); }

test('Riyadh week cuts off exactly on Sunday midnight, independently of UTC date', () => {
  const before = careWeek(Date.parse('2026-11-07T20:59:59.999Z'));
  assert.deepEqual(before, { key: '2026-11-01', startsAt: '2026-10-31T21:00:00.000Z', endsAt: '2026-11-07T21:00:00.000Z' });
  assert.equal(careWeek(Date.parse(before.endsAt)).key, '2026-11-08');
});

test('first name is explicitly chosen; trusted account suggestion stays private and validation rejects PII, markup, controls and numbers', async () => {
  const s = setup(), player = await s.login(), owner = await s.login('owner@example.com');
  s.ok(await s.call('/profile', { account: player, method: 'PATCH', data: { name: 'خالد النافع' } }));
  const before = s.ok(await s.call('/care-point', { account: player }));
  assert.equal(before.player.alias, null); assert.equal(before.player.needsName, true); assert.equal(before.player.suggestedName, 'خالد');
  assert.equal(s.store.value(CARE_LEDGER), null);
  error(await s.call('/care-point/start', { account: player, method: 'POST', data: { requestId: randomUUID() } }), 409, 'NAME_REQUIRED');
  error(await s.call('/care-point/name', { method: 'POST', data: { requestId: randomUUID(), firstName: 'خالد' } }), 401, 'AUTH_REQUIRED');
  error(await s.call('/care-point/name', { account: player, csrf: 'wrong', method: 'POST', data: { requestId: randomUUID(), firstName: 'خالد' } }), 403, 'CSRF_INVALID');
  error(await s.call('/care-point/name', { account: player, origin: 'https://foreign.example', method: 'POST', data: { requestId: randomUUID(), firstName: 'خالد' } }), 403, 'ORIGIN_INVALID');
  for (const firstName of ['person@example.com', 'خالد person@example.com', '<b>خالد</b>', 'خالد\nالنافع', 'خالد\u202E', 'خالد123', 'خالد١٢', 'A'.repeat(31), '', null, ['خالد']]) {
    error(await s.chooseName(player, firstName), 400, 'NAME_INVALID');
  }
  const named = s.ok(await s.chooseName(player, '  خالد   النافع  '));
  assert.equal(named.player.alias, 'خالد'); assert.equal(named.player.needsName, false);
  assert.deepEqual(s.store.value(CARE_LEDGER).profiles[player.user.id].firstName, 'خالد');
  assert.equal((await s.admin(owner)).joinedCount, 0);
  const anonymous = s.ok(await s.call('/care-point/public'));
  assert.equal(Object.hasOwn(anonymous, 'player'), false); assert.equal(JSON.stringify(anonymous).includes('النافع'), false);
});

test('named starter appears in owner admin before scoring; public ranking requires actual solve and duplicate first names have no suffix', async () => {
  const s = setup(), player = await s.login(), second = await s.login('second@example.com'), owner = await s.login('owner@example.com');
  s.ok(await s.chooseName(player, 'خالد')); const round = (await s.start(player)).round;
  const joined = await s.admin(owner);
  assert.equal(joined.joinedCount, 1); assert.equal(joined.participantCount, 0);
  assert.deepEqual(joined.participants, { rows: [{ userId: player.user.id, account: { name: '', email: player.user.email }, alias: 'خالد', needsName: false, points: 0, roundsCompleted: 0, rank: null, award: null }], total: 1 });
  assert.deepEqual(s.ok(await s.call('/care-point/public')).leaderboard, { rows: [], total: 0, visibleTotal: 0 });
  s.ok(await s.complete(player, round));
  const scored = await s.admin(owner);
  assert.equal(scored.participants.rows[0].alias, 'خالد'); assert.equal(scored.participants.rows[0].points, 100); assert.equal(scored.participants.rows[0].rank, 1);
  s.ok(await s.chooseName(second, 'خالد')); s.ok(await s.complete(second, (await s.start(second)).round));
  const rows = s.ok(await s.call('/care-point/public')).leaderboard.rows;
  assert.deepEqual(rows.map(row => row.alias), ['خالد', 'خالد']);
  await s.start(owner); assert.equal((await s.admin(owner)).joinedCount, 3);
});

test('name receipts recover lost acknowledgement without rewinding later name; chosen name survives weeks and frozen winner updates only display', async () => {
  const s = setup(), player = await s.login(), owner = await s.login('owner@example.com'), requestId = randomUUID();
  s.store.unknownOnce = CARE_LEDGER;
  error(await s.chooseName(player, 'خالد', requestId), 503, 'STORE_UNAVAILABLE');
  s.ok(await s.chooseName(player, 'خالد', requestId));
  const afterRetry = s.store.value(CARE_LEDGER);
  s.ok(await s.chooseName(player, 'خالد', requestId)); assert.deepEqual(s.store.value(CARE_LEDGER), afterRetry);
  error(await s.chooseName(player, 'سارة', requestId), 409, 'REQUEST_CONFLICT');
  s.ok(await s.complete(player, (await s.start(player)).round)); s.setTime('2026-11-07T21:00:00Z');
  s.ok(await s.command(owner, 'finalize', { weekKey: '2026-11-01' }));
  const frozen = s.store.value(CARE_LEDGER).weeks['2026-11-01'], financialBefore = s.store.value(BOOKING);
  const renamed = s.ok(await s.chooseName(player, 'سارة')); assert.equal(renamed.player.alias, 'سارة'); assert.equal(renamed.player.points, 0);
  assert.deepEqual(s.store.value(CARE_LEDGER).weeks['2026-11-01'], frozen); assert.deepEqual(s.store.value(BOOKING), financialBefore);
  const history = await s.admin(owner); assert.equal(history.weeks[0].winner.alias, 'سارة'); assert.equal(history.weeks[0].winner.userId, player.user.id); assert.equal(history.weeks[0].leaderPoints, 100);
  assert.equal(s.ok(await s.chooseName(player, 'خالد', requestId)).player.alias, 'سارة');
  const next = await s.start(player); assert.equal(next.player.alias, 'سارة'); assert.equal(next.player.needsName, false);
});

test('legacy generated aliases never leak, legacy issued round can complete before name choice, and name choice preserves actual points and receipts', async () => {
  const s = setup(), player = await s.login(), owner = await s.login('owner@example.com');
  const first = (await s.start(player)).round; s.ok(await s.complete(player, first));
  const second = (await s.start(player)).round, legacy = s.store.value(CARE_LEDGER), week = legacy.weeks['2026-11-01'];
  delete legacy.profiles; week.players[player.user.id].alias = 'لاعبة DEADBEEF1234';
  await s.store.setJSON(CARE_LEDGER, legacy, { onlyIfMatch: s.store.records.get(CARE_LEDGER).etag });
  const publicLegacy = s.ok(await s.call('/care-point/public')), privateLegacy = s.ok(await s.call('/care-point', { account: player }));
  assert.deepEqual(publicLegacy.leaderboard, { rows: [], total: 1, visibleTotal: 0 }); assert.equal(privateLegacy.player.alias, null); assert.equal(privateLegacy.player.points, 100); assert.equal(privateLegacy.player.needsName, true);
  assert.equal(JSON.stringify(await s.admin(owner)).includes('DEADBEEF1234'), false);
  const completed = s.ok(await s.complete(player, second)); assert.equal(completed.awarded, 100); assert.equal(completed.player.points, 200); assert.equal(completed.player.needsName, true);
  const scoring = s.store.value(CARE_LEDGER).weeks, receipts = s.store.value(CARE_LEDGER).requests;
  const named = s.ok(await s.chooseName(player, 'خالد')); assert.equal(named.player.points, 200); assert.equal(named.player.rank, 1); assert.equal(named.leaderboard.rows[0].alias, 'خالد');
  assert.deepEqual(s.store.value(CARE_LEDGER).weeks, scoring);
  for (const [key, receipt] of Object.entries(receipts)) assert.deepEqual(s.store.value(CARE_LEDGER).requests[key], receipt);
});

test('anonymous empty standings are real; GET does not enroll or write; privacy projection and auth/CSRF boundaries', async () => {
  const s = setup({ CLINIME_ADMIN_ACCESS: 'verified-email' });
  const empty = s.ok(await s.call('/care-point/public'));
  assert.deepEqual(empty.leaderboard, { rows: [], total: 0, visibleTotal: 0 }); assert.equal(s.store.value(CARE_LEDGER), null);
  error(await s.call('/care-point'), 401, 'AUTH_REQUIRED');
  error(await s.call('/care-point/start', { method: 'POST', data: { requestId: randomUUID() } }), 401, 'AUTH_REQUIRED');
  const player = await s.login(), owner = await s.login('owner@example.com');
  s.ok(await s.call('/care-point', { account: player })); assert.equal(s.store.value(CARE_LEDGER), null);
  error(await s.call('/admin/care-point', { account: player }), 403, 'ADMIN_REQUIRED');
  error(await s.call('/admin/care-point', { account: player, method: 'POST', data: { requestId: randomUUID(), revision: 0, action: 'settings-save', enabled: false } }), 403, 'ADMIN_REQUIRED');
  error(await s.call('/care-point/start', { account: player, method: 'POST', csrf: 'wrong', data: { requestId: randomUUID() } }), 403, 'CSRF_INVALID');
  error(await s.call('/care-point/start', { account: player, method: 'POST', origin: 'https://foreign.example', data: { requestId: randomUUID() } }), 403, 'ORIGIN_INVALID');
  const round = (await s.start(player)).round;
  assert.equal((await s.call('/care-point/public')).data.leaderboard.total, 0);
  assert.equal(s.ok(await s.complete(player, round)).awarded, 100);
  const publicData = s.ok(await s.call('/care-point/public')), mine = s.ok(await s.call('/care-point', { account: player }));
  assert.equal(publicData.leaderboard.rows[0].isYou, false); assert.equal(mine.leaderboard.rows[0].isYou, true);
  assert.equal(mine.player.points, 100); assert.equal(mine.player.rank, 1); assert.equal(mine.lastCompletion.roundId, round.id);
  const serialized = JSON.stringify(publicData);
  for (const privateValue of [player.user.id, player.user.email, player.user.name, round.id, round.seed]) if (privateValue) assert.equal(serialized.includes(privateValue), false);
  assert.equal((await s.admin(owner)).participantCount, 1);
});

test('one issued round per user; forged/fixed/invalid rotations and cross-owner cannot score; completed replay awards once', async () => {
  const s = setup(), player = await s.login(), other = await s.login('second@example.com');
  const starts = await Promise.all([s.start(player), s.start(player), s.start(player)]);
  assert.equal(new Set(starts.map(x => x.round.id)).size, 1);
  const round = starts[0].round, level = E.makeChallenge(round.seed);
  error(await s.complete(other, round), 404, 'ROUND_NOT_FOUND');
  error(await s.complete(player, round, { rotations: Array(16).fill(4) }), 400, 'INVALID_REQUEST');
  error(await s.complete(player, round, { rotations: level.tiles.map(t => t.rotation) }), 409, 'ROUND_UNSOLVED');
  const fixed = s.solution(round).slice(), index = level.tiles.findIndex(t => t.fixed); fixed[index] = (fixed[index] + 1) % 4;
  error(await s.complete(player, round, { rotations: fixed }), 409, 'ROUND_UNSOLVED');
  const requestId = randomUUID(), results = await Promise.all(Array.from({ length: 4 }, () => s.complete(player, round, { requestId })));
  assert.equal(results.reduce((sum, result) => sum + s.ok(result).awarded, 0), 100);
  const duplicateId = randomUUID();
  assert.equal(s.ok(await s.complete(player, round, { requestId: duplicateId })).awarded, 0);
  const second = (await s.start(player)).round;
  error(await s.complete(player, second, { requestId }), 409, 'REQUEST_CONFLICT');
  error(await s.complete(player, second, { requestId: duplicateId }), 409, 'REQUEST_CONFLICT');
  const current = s.ok(await s.call('/care-point', { account: player })); assert.equal(current.player.points, 100); assert.equal(current.player.roundsCompleted, 1);
  assert.equal(s.store.value(BOOKING)?.visitProgram, undefined);
});

test('pagination keeps aliases public and own standing available outside the selected page; starts are rate limited even with reused request IDs', async () => {
  const s = setup(), first = await s.login(), second = await s.login('two@example.com'), third = await s.login('three@example.com');
  for (const account of [first, first, second, third]) s.ok(await s.complete(account, (await s.start(account)).round));
  const page = s.ok(await s.call('/care-point?offset=1&limit=1', { account: first }));
  assert.equal(page.leaderboard.rows.length, 1); assert.equal(page.leaderboard.total, 3); assert.equal(page.player.rank, 1); assert.equal(page.player.points, 200);
  assert.equal(page.leaderboard.rows[0].rank, 2); assert.equal(page.leaderboard.rows[0].isYou, false);
  error(await s.call('/care-point/public?limit=-1'), 400, 'INVALID_REQUEST');
  const requestId = randomUUID();
  for (let i = 0; i < 176; i++) s.ok(await s.call('/care-point/start', { account: first, method: 'POST', data: { requestId } }));
  error(await s.call('/care-point/start', { account: first, method: 'POST', data: { requestId } }), 429, 'RATE_LIMITED');
});

test('request receipts survive week transitions and an old start cannot silently issue another round', async () => {
  const s = setup(), player = await s.login(), requestId = randomUUID();
  s.ok(await s.chooseName(player));
  const old = s.ok(await s.call('/care-point/start', { account: player, method: 'POST', data: { requestId } }));
  s.setTime('2026-11-07T21:00:00Z');
  const retry = s.ok(await s.call('/care-point/start', { account: player, method: 'POST', data: { requestId } }));
  assert.equal(retry.round.id, old.round.id); assert.equal(s.store.value(CARE_LEDGER).weeks['2026-11-08'], undefined);
  const current = await s.start(player);
  error(await s.complete(player, current.round, { requestId }), 409, 'REQUEST_CONFLICT');
});

test('approved prize appears as actual monetary wallet credit usable by existing checkout without changing loyalty points', async () => {
  const s = setup(), player = await s.login(), owner = await s.login('owner@example.com');
  const before = s.ok(await s.call('/loyalty', { account: player }));
  s.ok(await s.complete(player, (await s.start(player)).round)); s.setTime('2026-11-07T21:00:00Z');
  s.ok(await s.command(owner, 'finalize', { weekKey: '2026-11-01' }));
  s.ok(await s.command(owner, 'approve-prize', { weekKey: '2026-11-01' }));
  const wallet = s.ok(await s.call('/loyalty', { account: player }));
  assert.equal(wallet.balance, before.balance); assert.equal(wallet.referralWallet.balanceSar, 100); assert.equal(wallet.stampCard.totalVisits, 0);
  const quote = s.ok(await s.call('/loyalty/quote', { account: player, method: 'POST', data: { items: [{ serviceId: 'basic' }], code: 'WALLET' } }));
  assert.equal(quote.kind, 'wallet'); assert.equal(quote.discount, 100);
});

test('first-ever owner GET allows normal competition without enrolling or changing competition state', async () => {
  const s = setup({ CLINIME_ADMIN_ACCESS: 'verified-email' }), owner = await s.login('owner@example.com'), customer = await s.login('ordinary@example.com');
  assert.equal(s.store.value(CARE_LEDGER), null);
  const first = s.ok(await s.call('/care-point', { account: owner }));
  assert.deepEqual(first.player, { points: 0, rank: null, totalCompetitors: 0, roundsCompleted: 0, alias: null, eligible: true, needsName: true, suggestedName: null });
  assert.equal(first.round, null); assert.deepEqual(first.leaderboard, { rows: [], total: 0, visibleTotal: 0 });
  assert.equal(s.store.value(CARE_LEDGER), null);
  const ordinary = s.ok(await s.call('/care-point', { account: customer }));
  assert.equal(ordinary.player.eligible, true); assert.equal(s.store.value(CARE_LEDGER), null);
  assert.equal(Object.hasOwn(s.ok(await s.call('/care-point/public')), 'player'), false);
});

test('owner participates normally in ranking and prizes while owner-only admin authorization remains strict', async () => {
  const s = setup({ CLINIME_ADMIN_ACCESS: 'verified-email' }), player = await s.login(), owner = await s.login('owner@example.com');
  assert.equal(s.ok(await s.call('/care-point', { account: owner })).player.eligible, true);
  for (const account of [owner, owner, player]) s.ok(await s.complete(account, (await s.start(account)).round));
  const mine = s.ok(await s.call('/care-point', { account: owner }));
  assert.equal(mine.player.points, 200); assert.equal(mine.player.rank, 1); assert.equal(mine.player.totalCompetitors, 2);
  const customer = s.ok(await s.call('/care-point', { account: player }));
  assert.equal(customer.player.rank, 2); assert.equal(customer.leaderboard.total, 2);
  error(await s.call('/admin/care-point', { account: player }), 403, 'ADMIN_REQUIRED');
  s.setTime('2026-11-07T21:00:00Z');
  const ended = s.ok(await s.command(owner, 'finalize', { weekKey: '2026-11-01' }));
  assert.equal(ended.weeks[0].winner.userId, owner.user.id); assert.equal(ended.weeks[0].leaderPoints, 200); assert.equal(ended.weeks[0].participantCount, 2); assert.equal(ended.weeks[0].totalRounds, 3);
  s.ok(await s.command(owner, 'approve-prize', { weekKey: '2026-11-01' }));
  assert.equal(s.store.value(BOOKING).visitProgram.transactions['care-prize:2026-11-01'].userId, owner.user.id);
});

test('existing 400-point owner is included immediately without score writes; unnamed rows stay private without changing rank math or frozen history', async () => {
  const s = setup(), owner = await s.login('owner@example.com'), customer = await s.login();
  s.ok(await s.chooseName(owner, 'خالد')); s.ok(await s.chooseName(customer, 'سارة'));
  for (let i = 0; i < 4; i++) s.ok(await s.complete(owner, (await s.start(owner)).round));
  for (let i = 0; i < 5; i++) s.ok(await s.complete(customer, (await s.start(customer)).round));
  const legacy = s.store.value(CARE_LEDGER), current = legacy.weeks['2026-11-01'];
  current.players[owner.user.id].eligible = false; current.players[owner.user.id].alias = 'لاعبة DEADBEEF1234'; delete legacy.profiles[owner.user.id];
  const historical = structuredClone(current);
  Object.assign(historical, { key: '2026-10-25', startsAt: '2026-10-24T21:00:00.000Z', endsAt: '2026-10-31T21:00:00.000Z', frozenAt: '2026-10-31T21:00:00.000Z', leaderIds: [customer.user.id], leaderPoints: 500, winnerId: customer.user.id, tie: { status: 'none' }, prize: { id: 'care-prize:2026-10-25', amountSar: 100, status: 'credited', approvedAt: '2026-11-01T00:00:00.000Z', creditedAt: '2026-11-01T00:00:01.000Z' } });
  legacy.weeks[historical.key] = historical;
  await s.store.setJSON(CARE_LEDGER, legacy, { onlyIfMatch: s.store.records.get(CARE_LEDGER).etag });
  const before = s.store.value(CARE_LEDGER), mine = s.ok(await s.call('/care-point', { account: owner }));
  assert.equal(mine.player.points, 400); assert.equal(mine.player.rank, 2); assert.equal(mine.player.totalCompetitors, 2); assert.equal(mine.player.eligible, true); assert.equal(mine.player.alias, null); assert.equal(mine.player.needsName, true);
  const publicData = s.ok(await s.call('/care-point/public'));
  assert.deepEqual(publicData.leaderboard, { rows: [{ alias: 'سارة', points: 500, rank: 1, isYou: false }], total: 2, visibleTotal: 1 });
  assert.equal(/مشاركة|لاعبة|DEADBEEF/.test(JSON.stringify(publicData)), false);
  const admin = await s.admin(owner), missing = admin.participants.rows.find(row => row.points === 400);
  assert.equal(missing.alias, null); assert.equal(missing.needsName, true); assert.equal(missing.rank, 2); assert.equal(admin.joinedCount, 2);
  assert.deepEqual(s.store.value(CARE_LEDGER), before);
  s.ok(await s.chooseName(owner, 'خالد'));
  assert.deepEqual(s.store.value(CARE_LEDGER).weeks, before.weeks);
  const named = s.ok(await s.call('/care-point', { account: owner }));
  assert.equal(named.player.rank, 2); assert.equal(named.leaderboard.rows[1].alias, 'خالد'); assert.equal(named.leaderboard.rows[1].points, 400);
  s.setTime('2026-11-07T21:00:00Z'); await s.care.sweep();
  const frozen = s.store.value(CARE_LEDGER);
  assert.equal(frozen.weeks['2026-11-01'].players[owner.user.id].eligible, true);
  assert.deepEqual(frozen.weeks['2026-10-25'], historical);
  const ended = (await s.admin(owner)).weeks.find(row => row.key === '2026-11-01');
  assert.equal(ended.participantCount, 2); assert.equal(ended.winner.userId, customer.user.id);
});

test('unnamed highest-score holder retains prize eligibility while public responses publish no invented name', async () => {
  const s = setup(), player = await s.login(), owner = await s.login('owner@example.com');
  s.ok(await s.complete(player, (await s.start(player)).round));
  const saved = s.store.value(CARE_LEDGER); delete saved.profiles;
  await s.store.setJSON(CARE_LEDGER, saved, { onlyIfMatch: s.store.records.get(CARE_LEDGER).etag });
  assert.deepEqual(s.ok(await s.call('/care-point/public')).leaderboard, { rows: [], total: 1, visibleTotal: 0 });
  s.setTime('2026-11-07T21:00:00Z');
  const ended = s.ok(await s.command(owner, 'finalize', { weekKey: '2026-11-01' }));
  assert.deepEqual(ended.weeks[0].winner, { userId: player.user.id, alias: null, needsName: true });
  s.ok(await s.command(owner, 'approve-prize', { weekKey: '2026-11-01' }));
  assert.equal(s.store.value(BOOKING).visitProgram.transactions['care-prize:2026-11-01'].userId, player.user.id);
});

test('bounded cardinality fails closed without evicting accepted receipts or other accounts', async () => {
  const s = setup(), player = await s.login(); await s.start(player);
  const saved = s.store.value(CARE_LEDGER), week = saved.weeks['2026-11-01'];
  for (let i = 0; i < 2000; i++) week.players['local-capacity-fixture-' + i] = { alias: 'local fixture', points: 0, roundsCompleted: 0 };
  await s.store.setJSON(CARE_LEDGER, saved, { onlyIfMatch: s.store.records.get(CARE_LEDGER).etag });
  const prior = s.store.value(CARE_LEDGER);
  error(await s.call('/care-point/start', { account: player, method: 'POST', data: { requestId: randomUUID() } }), 503, 'CARE_CAPACITY');
  assert.deepEqual(s.store.value(CARE_LEDGER), prior);
});

test('lost completion/start acknowledgement recovers issued round and receipt after reload without increment', async () => {
  const s = setup(), player = await s.login(), requestId = randomUUID();
  s.ok(await s.chooseName(player));
  s.store.unknownOnce = CARE_LEDGER;
  error(await s.call('/care-point/start', { account: player, method: 'POST', data: { requestId } }), 503, 'STORE_UNAVAILABLE');
  const round = s.ok(await s.call('/care-point/start', { account: player, method: 'POST', data: { requestId } })).round;
  const completeId = randomUUID(); s.store.unknownOnce = CARE_LEDGER;
  error(await s.complete(player, round, { requestId: completeId }), 503, 'STORE_UNAVAILABLE');
  const reloaded = s.ok(await s.call('/care-point', { account: player }));
  assert.equal(reloaded.player.points, 100); assert.equal(reloaded.lastCompletion.requestId, completeId);
  assert.equal(s.ok(await s.complete(player, round, { requestId: completeId })).awarded, 0);
  assert.equal(s.ok(await s.call('/care-point', { account: player })).player.points, 100);
});

test('expiry, pause and Saudi cutoff prevent scores; new week opens without deleting history; scheduled sweep never chooses ties or credits', async () => {
  const s = setup(), player = await s.login(), other = await s.login('second@example.com'), owner = await s.login('owner@example.com');
  let round = (await s.start(player)).round; s.advance(2 * 3600000);
  error(await s.complete(player, round), 409, 'ROUND_EXPIRED');
  round = (await s.start(player)).round;
  s.ok(await s.command(owner, 'settings-save', { enabled: false }));
  error(await s.complete(player, round), 409, 'CARE_PAUSED'); error(await s.call('/care-point/start', { account: player, method: 'POST', data: { requestId: randomUUID() } }), 409, 'CARE_PAUSED');
  s.ok(await s.command(owner, 'settings-save', { enabled: true })); s.ok(await s.complete(player, round)); s.ok(await s.complete(other, (await s.start(other)).round));
  s.setTime('2026-11-07T20:59:59Z'); const cutoffRound = (await s.start(player)).round;
  assert.equal(cutoffRound.expiresAt, '2026-11-07T21:00:00.000Z');
  s.advance(1000); error(await s.complete(player, cutoffRound), 409, 'CARE_CLOSED');
  await s.care.sweep();
  const snapshot = await s.admin(owner), old = snapshot.weeks.find(week => week.key === '2026-11-01');
  assert.equal(old.leaderCount, 2); assert.equal(old.tie.status, 'pending'); assert.equal(old.winner, null); assert.equal(old.prize.status, 'unapproved');
  assert.equal(snapshot.week.key, '2026-11-08'); assert.equal(snapshot.week.status, 'active'); assert.equal(snapshot.leaderboard.total, 0);
  assert.equal(s.store.value(BOOKING)?.visitProgram, undefined);
  const replay = s.ok(await s.complete(player, round)); assert.equal(replay.awarded, 0);
});

test('owner actions require exact receipt and revision; active week cannot finalize; tied frozen week cannot award until one immutable random draw', async () => {
  const s = setup(), player = await s.login(), other = await s.login('other@example.com'), owner = await s.login('owner@example.com');
  s.ok(await s.complete(player, (await s.start(player)).round)); s.ok(await s.complete(other, (await s.start(other)).round));
  error(await s.command(owner, 'finalize', { weekKey: '2026-11-01' }), 409, 'CARE_WEEK_ACTIVE');
  s.setTime('2026-11-07T21:00:00Z');
  error(await s.command(owner, 'resolve-tie', { weekKey: '2026-11-01' }), 409, 'CARE_WEEK_NOT_FROZEN');
  s.ok(await s.command(owner, 'finalize', { weekKey: '2026-11-01' }));
  error(await s.command(owner, 'approve-prize', { weekKey: '2026-11-01' }), 409, 'PRIZE_WINNER_REQUIRED');
  const before = await s.admin(owner), input = { requestId: randomUUID(), revision: before.revision, action: 'resolve-tie', weekKey: '2026-11-01' };
  const drawn = s.ok(await s.call('/admin/care-point', { account: owner, method: 'POST', data: input }));
  const winner = drawn.weeks[0].winner.userId; assert.ok([player.user.id, other.user.id].includes(winner));
  assert.equal(s.ok(await s.call('/admin/care-point', { account: owner, method: 'POST', data: input })).weeks[0].winner.userId, winner);
  error(await s.call('/admin/care-point', { account: owner, method: 'POST', data: { ...input, weekKey: '2026-11-08' } }), 409, 'REQUEST_CONFLICT');
  error(await s.command(owner, 'resolve-tie', { weekKey: '2026-11-01' }), 409, 'TIE_NOT_PENDING');
  error(await s.call('/admin/care-point', { account: owner, method: 'POST', data: { requestId: randomUUID(), revision: before.revision, action: 'settings-save', enabled: false } }), 409, 'REVISION_CONFLICT');
});

for (const fault of ['none', 'booking-lost-ack', 'approval-lost-ack', 'second-write-failure']) test('single 100 SAR prize, concurrent approvals and preserved balances: ' + fault, async () => {
  const s = setup(), player = await s.login(), owner = await s.login('owner@example.com');
  const old = s.store.value(BOOKING) || { schema: 1, bookings: {}, requests: {}, loyalty: { pointsPreserved: 975 } };
  old.visitProgram = { schema: 1, referralCreditSar: 25, visits: { [player.user.id]: [{ bookingId: 'kept', at: '2026-10-01' }] }, rewards: { kept: { id: 'kept' } }, transactions: { referral: { id: 'referral', userId: player.user.id, cents: 2500, kind: 'referral' } } };
  await s.store.setJSON(BOOKING, old, s.store.records.has(BOOKING) ? { onlyIfMatch: s.store.records.get(BOOKING).etag } : { onlyIfNew: true });
  s.ok(await s.complete(player, (await s.start(player)).round)); s.setTime('2026-11-07T21:00:00Z');
  s.ok(await s.command(owner, 'finalize', { weekKey: '2026-11-01' }));
  const before = await s.admin(owner), input = { requestId: randomUUID(), revision: before.revision, action: 'approve-prize', weekKey: '2026-11-01' };
  if (fault === 'booking-lost-ack') s.store.unknownOnce = BOOKING;
  if (fault === 'approval-lost-ack') s.store.unknownOnce = CARE_LEDGER;
  if (fault === 'second-write-failure') s.store.failAfterBooking = true;
  const submit = () => s.call('/admin/care-point', { account: owner, method: 'POST', data: input });
  if (fault !== 'none') error(await submit(), 503, 'STORE_UNAVAILABLE');
  const results = await Promise.all([submit(), submit(), submit()]); results.forEach(s.ok);
  const ledger = s.store.value(BOOKING), transactions = Object.values(ledger.visitProgram.transactions);
  assert.equal(transactions.filter(row => row.kind === 'care-prize').length, 1);
  assert.equal(transactions.reduce((sum, row) => sum + row.cents, 0), 12500);
  assert.deepEqual(ledger.visitProgram.visits, old.visitProgram.visits); assert.deepEqual(ledger.visitProgram.rewards, old.visitProgram.rewards); assert.deepEqual(ledger.loyalty, old.loyalty);
  assert.equal((await s.admin(owner)).weeks[0].prize.status, 'credited');
  s.ok(await s.command(owner, 'approve-prize', { weekKey: '2026-11-01' }));
  assert.equal(Object.values(s.store.value(BOOKING).visitProgram.transactions).filter(row => row.kind === 'care-prize').length, 1);
});

test('manual current-week selection credits real starter once, preserves play, emails actual identity and locks recipient award', async () => {
  const s=setup(),player=await s.login(),owner=await s.login('owner@example.com'),other=await s.login('other@example.com');
  const round=(await s.start(player)).round;await s.start(other);
  const before=await s.admin(owner),input={requestId:randomUUID(),revision:before.revision,action:'select-winner',weekKey:before.week.key,winnerId:player.user.id,to:'attacker@example.com'};
  const selected=s.ok(await s.call('/admin/care-point',{account:owner,method:'POST',data:input}));
  assert.equal(selected.week.status,'active');assert.equal(selected.weeks[0].selectionMode,'manual');assert.equal(selected.weeks[0].winner.userId,player.user.id);
  assert.equal(selected.weeks[0].prize.status,'credited');assert.equal(selected.weeks[0].prize.email.status,'sent');
  const messages=s.mail.calls.filter(x=>x.key?.startsWith('care-prize-mail:'));
  assert.equal(messages.length,1);assert.equal(messages[0].to,player.user.email);
  s.ok(await s.call('/admin/care-point',{account:owner,method:'POST',data:input}));
  assert.equal(s.mail.calls.filter(x=>x.key?.startsWith('care-prize-mail:')).length,1);
  error(await s.command(owner,'select-winner',{weekKey:before.week.key,winnerId:player.user.id}),409,'AWARD_ALREADY_SELECTED');
  assert.equal(s.ok(await s.complete(player,round)).awarded,100);
  error(await s.call('/admin/care-point',{account:player,method:'POST',data:{...input,requestId:randomUUID()}}),403,'ADMIN_REQUIRED');
  assert.equal(Object.values(s.store.value(BOOKING).visitProgram.transactions).filter(x=>x.kind==='care-prize').length,1);
});

test('email uncertainty retries one frozen provider payload without another credit; expiry never blindly resends', async () => {
  const s=setup(),player=await s.login(),owner=await s.login('owner@example.com');await s.start(player);
  const accepted=new Set(),attempts=[];
  s.mail.send=async message=>{attempts.push(structuredClone(message));accepted.add(message.key);return {status:attempts.length===1?'pending':'sent'};};
  const selected=s.ok(await s.command(owner,'select-winner',{weekKey:'2026-11-01',winnerId:player.user.id}));
  assert.equal(selected.weeks[0].prize.status,'credited');assert.equal(selected.weeks[0].prize.email.status,'pending');
  s.ok(await s.chooseName(player,'سارة'));
  const retried=s.ok(await s.command(owner,'retry-prize-email',{weekKey:'2026-11-01'}));
  assert.equal(retried.weeks[0].prize.email.status,'sent');assert.deepEqual(attempts[0],attempts[1]);assert.equal(accepted.size,1);
  assert.equal(Object.values(s.store.value(BOOKING).visitProgram.transactions).filter(x=>x.kind==='care-prize').length,1);
  const other=setup(),p=await other.login(),a=await other.login('owner@example.com');await other.start(p);let calls=0;
  other.mail.send=async()=>{calls++;return {status:'pending'};};
  other.ok(await other.command(a,'select-winner',{weekKey:'2026-11-01',winnerId:p.user.id}));other.advance(23*3600000);
  const old=other.ok(await other.command(a,'retry-prize-email',{weekKey:'2026-11-01'}));
  assert.equal(calls,1);assert.equal(old.weeks[0].prize.status,'credited');assert.equal(old.weeks[0].prize.email.reason,'manual-review-required');assert.equal(old.weeks[0].prize.email.retryAllowed,false);
});

test('provider failure and email receipt lost acknowledgement cannot turn credited prize into a failed financial response', async()=>{
 const s=setup(),p=await s.login(),a=await s.login('owner@example.com');await s.start(p);
 s.mail.send=async()=>({status:'failed'});
 const value=s.ok(await s.command(a,'select-winner',{weekKey:'2026-11-01',winnerId:p.user.id}));
 assert.equal(value.weeks[0].prize.status,'credited');assert.equal(value.weeks[0].prize.email.status,'failed');
 s.mail.send=async()=>({status:'sent'});
 s.ok(await s.command(a,'retry-prize-email',{weekKey:'2026-11-01'}));
 assert.equal(Object.values(s.store.value(BOOKING).visitProgram.transactions).filter(x=>x.kind==='care-prize').length,1);
 const b=setup(),bp=await b.login(),ba=await b.login('owner@example.com');await b.start(bp);let sends=0;
 b.mail.send=async()=>{sends++;return {status:'sent'};};b.store.unknownOnce='care-prize-mail:2026-11-01';
 const pending=b.ok(await b.command(ba,'select-winner',{weekKey:'2026-11-01',winnerId:bp.user.id}));
 assert.equal(pending.weeks[0].prize.status,'credited');assert.equal(sends,0);
 b.advance(120001);b.ok(await b.command(ba,'retry-prize-email',{weekKey:'2026-11-01'}));assert.equal(sends,1);
 assert.equal(Object.values(b.store.value(BOOKING).visitProgram.transactions).filter(x=>x.kind==='care-prize').length,1);
});

test('reload can resume an already selected zero-point manual prize before week end using a new UUID', async()=>{
 const s=setup(),p=await s.login(),a=await s.login('owner@example.com');await s.start(p);
 s.store.failOnce=BOOKING;
 error(await s.command(a,'select-winner',{weekKey:'2026-11-01',winnerId:p.user.id}),503,'STORE_UNAVAILABLE');
 const reloaded=await s.admin(a),selected=reloaded.weeks[0];
 assert.equal(selected.status,'active');assert.equal(selected.selectionMode,'manual');assert.equal(selected.participantCount,0);assert.equal(selected.prize.status,'approved');
 const frozen=s.store.value(CARE_LEDGER).weeks['2026-11-01'];
 const recovered=s.ok(await s.command(a,'approve-prize',{weekKey:'2026-11-01'}));
 assert.equal(recovered.weeks[0].prize.status,'credited');assert.equal(recovered.weeks[0].prize.email.status,'sent');assert.equal(recovered.weeks[0].winner.userId,p.user.id);
 assert.equal(recovered.weeks[0].selectedAt,frozen.selectedAt);
 assert.equal(Object.values(s.store.value(BOOKING).visitProgram.transactions).filter(x=>x.kind==='care-prize').length,1);
});

test('Jory then Khaled receive separate weekly awards while legacy primary credit and mail receipt stay exact', async()=>{
 const s=setup(),jory=await s.login('jory@example.com'),khaled=await s.login('khaled@example.com'),a=await s.login('owner@example.com');
 s.ok(await s.chooseName(jory,'جوري'));s.ok(await s.chooseName(khaled,'خالد'));await s.start(jory);await s.start(khaled);
 s.ok(await s.command(a,'select-winner',{weekKey:'2026-11-01',winnerId:jory.user.id}));
 const legacy=s.store.value(CARE_LEDGER).weeks['2026-11-01'],firstPrize=structuredClone(legacy.prize),firstTx=s.store.value(BOOKING).visitProgram.transactions['care-prize:2026-11-01'],firstMail=s.store.value('care-prize-mail:2026-11-01');
 const snap=await s.admin(a),input={requestId:randomUUID(),revision:snap.revision,action:'select-winner',weekKey:'2026-11-01',winnerId:khaled.user.id};
 const selected=s.ok(await s.call('/admin/care-point',{account:a,method:'POST',data:input}));
 assert.equal(selected.week.status,'active');assert.equal(selected.weeks[0].awards.length,2);assert.ok(selected.weeks[0].awards.every(row=>row.prize.status==='credited'&&row.prize.email.status==='sent'));
 const week=s.store.value(CARE_LEDGER).weeks['2026-11-01'];assert.equal(week.winnerId,jory.user.id);assert.deepEqual(week.prize,firstPrize);
 assert.deepEqual(s.store.value(BOOKING).visitProgram.transactions['care-prize:2026-11-01'],firstTx);assert.deepEqual(s.store.value('care-prize-mail:2026-11-01'),firstMail);
 const extraId='care-prize:2026-11-01:'+khaled.user.id;assert.equal(week.awards[khaled.user.id].prize.id,extraId);
 s.ok(await s.call('/admin/care-point',{account:a,method:'POST',data:input}));
 error(await s.command(a,'select-winner',{weekKey:'2026-11-01',winnerId:jory.user.id}),409,'AWARD_ALREADY_SELECTED');
 error(await s.command(a,'select-winner',{weekKey:'2026-11-01',winnerId:khaled.user.id}),409,'AWARD_ALREADY_SELECTED');
 const tx=Object.values(s.store.value(BOOKING).visitProgram.transactions).filter(row=>row.kind==='care-prize');assert.equal(tx.length,2);assert.equal(tx.reduce((sum,row)=>sum+row.cents,0),20000);
 const messages=s.mail.calls.filter(row=>row.key?.startsWith('care-prize-mail:'));assert.equal(messages.length,2);assert.deepEqual(new Set(messages.map(row=>row.to)),new Set([jory.user.email,khaled.user.email]));
 assert.equal(selected.participants.rows.find(row=>row.userId===khaled.user.id).award.prize.id,extraId);
});

test('extra award partial credit recovers after reload with its recipient target and does not retry legacy email',async()=>{
 const s=setup(),first=await s.login(),extra=await s.login('extra@example.com'),a=await s.login('owner@example.com');await s.start(first);await s.start(extra);
 s.ok(await s.command(a,'select-winner',{weekKey:'2026-11-01',winnerId:first.user.id}));
 const original=s.store.value('care-prize-mail:2026-11-01');s.store.unknownOnce=BOOKING;
 error(await s.command(a,'select-winner',{weekKey:'2026-11-01',winnerId:extra.user.id}),503,'STORE_UNAVAILABLE');
 const pending=await s.admin(a);assert.equal(pending.weeks[0].awards.find(row=>row.winner.userId===extra.user.id).prize.status,'approved');
 const recovered=s.ok(await s.command(a,'approve-prize',{weekKey:'2026-11-01',winnerId:extra.user.id}));
 assert.equal(recovered.weeks[0].awards.find(row=>row.winner.userId===extra.user.id).prize.status,'credited');
 s.ok(await s.command(a,'retry-prize-email',{weekKey:'2026-11-01',winnerId:extra.user.id}));
 assert.deepEqual(s.store.value('care-prize-mail:2026-11-01'),original);
 assert.equal(Object.values(s.store.value(BOOKING).visitProgram.transactions).filter(row=>row.kind==='care-prize').length,2);
 error(await s.command(a,'approve-prize',{weekKey:'2026-11-01',winnerId:'a'.repeat(64)}),409,'AWARD_NOT_FOUND');
});

test('existing financial freeze projects active read-only, allows continued rounds, and preserves credits, email and boundary audit',async()=>{
 const s=setup(),p=await s.login(),other=await s.login('another@example.com'),a=await s.login('owner@example.com');
 const issued=(await s.start(p)).round;
 s.ok(await s.command(a,'select-winner',{weekKey:'2026-11-01',winnerId:p.user.id}));
 const before=s.store.value(CARE_LEDGER),financial=s.store.value(BOOKING),mail=s.store.value('care-prize-mail:2026-11-01'),calls=s.mail.calls.length;
 assert.ok(before.weeks['2026-11-01'].frozenAt);
 const restored=s.ok(await s.call('/care-point',{account:p}));assert.equal(restored.week.status,'active');assert.equal(restored.round.id,issued.id);
 assert.deepEqual(s.store.value(CARE_LEDGER),before);
 assert.equal(s.ok(await s.complete(p,issued)).player.points,100);
 assert.equal(s.ok(await s.complete(p,(await s.start(p)).round)).player.points,200);
 s.ok(await s.command(a,'settings-save',{enabled:false}));
 assert.equal(s.ok(await s.call('/care-point',{account:p})).week.status,'paused');
 error(await s.call('/care-point/start',{account:p,method:'POST',data:{requestId:randomUUID()}}),409,'CARE_PAUSED');
 s.ok(await s.command(a,'settings-save',{enabled:true}));
 await s.start(other);
 assert.deepEqual(s.store.value(BOOKING),financial);assert.deepEqual(s.store.value('care-prize-mail:2026-11-01'),mail);assert.equal(s.mail.calls.length,calls);
 s.setTime('2026-11-07T20:59:59Z');const cutoff=(await s.start(p)).round;
 s.advance(1000);error(await s.complete(p,cutoff),409,'CARE_CLOSED');await s.care.sweep();
 const closed=s.store.value(CARE_LEDGER).weeks['2026-11-01'];
 for(const key of ['winnerId','prize','frozenAt','selectionMode','selectedBy','selectedAt','leaderIds','leaderPoints','tie'])assert.deepEqual(closed[key],before.weeks['2026-11-01'][key]);
 assert.deepEqual(s.store.value(BOOKING),financial);assert.deepEqual(s.store.value('care-prize-mail:2026-11-01'),mail);
});
