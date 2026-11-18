import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startDemoServer } from '../scripts/demo-server.mjs';
import { createDemoFixture } from '../scripts/demo-fixture.mjs';

let runtime;
before(async () => { runtime = await startDemoServer({ port: 0, slowMs: 100, quiet: true }); });
after(async () => { await new Promise(resolve => runtime.server.close(resolve)); });
async function call(route, { actor = 'customer', scenario = 'ready', method = 'GET', data, csrf, cookie, origin = true } = {}) {
  const response = await fetch(runtime.origin + route, { method, headers: { 'X-Clinime-Demo-Actor': actor, 'X-Clinime-Demo-Scenario': scenario, ...(origin && method !== 'GET' ? { Origin: runtime.origin } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}), redirect: 'manual' });
  return { status: response.status, data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text(), headers: response.headers };
}
const me = actor => call('/api/me', { actor });

test('direct Customer/Admin routes boot with separate sample identities without credentials', async () => {
  for (const [route, actor] of [['/customer', 'customer'], ['/admin', 'admin']]) {
    const page = await call(route, { actor }); assert.equal(page.status, 200);
    assert.match(page.data, new RegExp('/demo/client.js\\?actor=' + actor + '&scenario=ready'));
  }
  const customer = await me('customer'), admin = await call('/api/admin/me', { actor: 'admin' });
  assert.equal(customer.status, 200); assert.equal(customer.data.user.email, 'customer@example.invalid');
  assert.equal(admin.status, 200); assert.notEqual(customer.data.user.email, admin.data.user.email);
  assert.ok(customer.data.bookings.some(b => b.status === 'cancelled'));
  assert.ok(customer.data.bookings.some(b => b.date > new Date().toISOString().slice(0, 10)));
  assert.equal((await call('/api/admin/workspace', { actor: 'customer' })).status, 403);
  assert.equal((await me('admin')).data.user.email, admin.data.user.email);
});

test('real booking mutation is visible to Admin; customer session does not overwrite Admin', async () => {
  const customer = (await me('customer')).data;
  const fixture = runtime.fixtures.get('ready');
  const date = new Date(Date.parse(fixture.summary.today + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  const created = await call('/api/bookings', { method: 'POST', csrf: customer.csrfToken, data: { requestId: randomUUID(), date, time: '20:00', professional: 'any', items: [{ serviceId: 'basic' }], contactName: 'سارة تجربة', attendee: { kind: 'self' } } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const workspace = await call('/api/admin/workspace', { actor: 'admin' });
  assert.ok(workspace.data.bookings.some(b => b.id === created.data.booking.id));
  assert.equal((await me('admin')).data.user.email, fixture.accounts.admin.user.email);
  const cancelled = await call('/api/bookings/' + created.data.booking.id, { method: 'DELETE', csrf: customer.csrfToken, data: { requestId: randomUUID(), revision: created.data.booking.revision } });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  assert.equal((await me('customer')).data.bookings.find(b => b.id === created.data.booking.id).status, 'cancelled');
  const mail = await call('/demo/mail?format=json');
  assert.equal(mail.data.fakeMailOnly, true); assert.ok(mail.data.messages.length >= 2);
});

test('sample reward, referral balance and gifting use the actual loyalty ledger', async () => {
  const customer = (await me('customer')).data, wallet = (await call('/api/loyalty')).data;
  assert.equal(wallet.stampCard.stamps, 4); assert.equal(wallet.stampCard.totalVisits, 9);
  assert.equal(wallet.referralWallet.balanceSar, 25);
  assert.ok(wallet.referralWallet.entries.some(entry => entry.status === 'pending'));
  const reward = wallet.stampCard.rewards.find(r => r.status === 'available'); assert.ok(reward);
  const gift = await call('/api/loyalty/gift', { method: 'POST', csrf: customer.csrfToken, data: { requestId: randomUUID(), rewardId: reward.id, recipientEmail: 'friend@example.invalid', locale: 'ar' } });
  assert.equal(gift.status, 200, JSON.stringify(gift.data));
  const received = (await call('/api/loyalty', { actor: 'friend' })).data.stampCard.rewards.find(r => r.id === reward.id);
  assert.equal(received.receivedGift, true); assert.equal(received.status, 'available');
});

test('local wallet enrollment validates consent/CSRF and issues only a local preview', async () => {
  const account = (await me('customer')).data, info = await call('/api/wallet/campaign');
  assert.equal(info.data.demoOnly, true);
  const body = { requestId: randomUUID(), name: 'سارة', acceptTerms: true, campaignVersion: info.data.campaign.version };
  assert.equal((await call('/api/wallet/enroll', { method: 'POST', data: body, csrf: 'wrong' })).status, 403);
  assert.equal((await call('/api/wallet/enroll', { method: 'POST', data: { ...body, acceptTerms: false }, csrf: account.csrfToken })).status, 400);
  const enrolled = await call('/api/wallet/enroll', { method: 'POST', data: body, csrf: account.csrfToken });
  assert.equal(enrolled.status, 200); assert.match(enrolled.data.enrollment.url, /^\/demo\/card\?/);
  assert.equal(enrolled.data.enrollment.demoOnly, true);
  assert.match((await call(enrolled.data.enrollment.url)).data, /LOCAL DEMO · NO REAL PASS/);
  const config = (await call('/api/config')).data;
  assert.equal(config.walletEnrollment.demoOnly, true); assert.equal(config.walletEnrollment.customEnrollment, true);
});

test('empty/error/slow/sparse states are deterministic and ready recovers independently', async () => {
  const empty = await call('/api/admin/workspace', { actor: 'admin', scenario: 'empty' });
  assert.equal(empty.status, 200); assert.deepEqual(empty.data.bookings, []);
  assert.equal((await call('/api/loyalty', { scenario: 'empty' })).data.stampCard.stamps, 0);
  assert.equal((await call('/api/admin/workspace', { actor: 'admin', scenario: 'error' })).status, 503);
  const ready = await call('/api/admin/workspace', { actor: 'admin' }); assert.equal(ready.status, 200); assert.ok(ready.data.bookings.length > 300);
  const sparse = await call('/api/admin/workspace', { actor: 'admin', scenario: 'insufficient' }); assert.equal(sparse.status, 200); assert.ok(sparse.data.bookings.length < ready.data.bookings.length);
  // Warm the independently seeded slow state before measuring its transport.
  await runtime.getFixture('slow'); const start = Date.now();
  assert.equal((await call('/api/me', { scenario: 'slow' })).status, 200); assert.ok(Date.now() - start >= 90);
  const retry = await call('/__local/scenario?value=ready'); assert.equal(retry.status, 303); assert.equal(retry.headers.get('location'), '/admin?scenario=ready');
});

test('guest OTP can be inspected using fake mail while automatic identities stay separate', async () => {
  assert.equal((await me('guest')).data.user, null);
  const challenge = await call('/api/auth/request', { actor: 'guest', method: 'POST', data: { requestId: randomUUID(), email: 'guest@example.invalid', locale: 'en', mode: 'code' } });
  assert.equal(challenge.status, 200);
  const mail = (await call('/demo/mail?format=json')).data.messages;
  const code = mail.at(-1).text.match(/Sign-in code: (\d{6})/)[1];
  const verified = await call('/api/auth/verify', { actor: 'guest', method: 'POST', data: { challengeId: challenge.data.challengeId, code } });
  assert.equal(verified.status, 200); const cookie = verified.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^clinime-demo-guest-session=/);
  assert.equal((await call('/api/me', { actor: 'guest', cookie })).data.user.email, 'guest@example.invalid');
  assert.equal((await call('/api/me', { cookie })).data.user.email, 'customer@example.invalid');
});

test('real CSRF/origin protections and private file boundaries remain enforced', async () => {
  const customer = (await me('customer')).data;
  assert.equal((await call('/api/profile', { method: 'PATCH', csrf: customer.csrfToken, data: { name: 'تجربة' }, origin: false })).status, 403);
  assert.equal((await call('/api/profile', { method: 'PATCH', csrf: 'wrong', data: { name: 'تجربة' } })).status, 403);
  assert.equal((await call('/api/profile', { method: 'PATCH', csrf: customer.csrfToken, data: { name: 'سارة تجربة' } })).status, 200);
  assert.equal((await me('customer')).data.user.name, 'سارة تجربة');
  for (const route of ['/.env', '/server/api.mjs', '/scripts/demo-fixture.mjs', '/client/api.js', '/netlify/functions/api.mjs', '/package.json', '/unknown']) assert.equal((await call(route)).status, 404, route);
  assert.equal((await call('/demo/reset?scenario=empty', { method: 'POST', origin: false })).status, 403);
});

test('Care Point sample leaderboard and real round start remain usable', async () => {
  const customer = (await me('customer')).data, game = await call('/api/care-point');
  assert.equal(game.status, 200); assert.equal(game.data.player.points, 300); assert.equal(game.data.leaderboard.total, 2);
  const started = await call('/api/care-point/start', { method: 'POST', csrf: customer.csrfToken, data: { requestId: randomUUID() } });
  assert.equal(started.status, 200, JSON.stringify(started.data)); assert.ok(started.data.round.id);
  const frame = await call('/game/?scenario=ready&actor=customer'); assert.equal(frame.status, 200); assert.match(frame.data, /demo\/client.js/);
  assert.equal((await call('/api/admin/care-point', { actor: 'admin' })).status, 200);
});

test('hostile live environment cannot alter demo providers or cause outbound fetch', async () => {
  const keys = ['APP_SECRET', 'PUBLIC_ORIGIN', 'CLINIME_WALLET_ENABLED', 'LOOPY_API_KEY', 'LOOPY_API_SECRET', 'LOOPY_USERNAME', 'RESEND_API_KEY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]])), originalFetch = globalThis.fetch; let calls = 0;
  try {
    for (const key of keys) process.env[key] = key === 'CLINIME_WALLET_ENABLED' ? 'true' : 'live-value-must-never-be-used';
    globalThis.fetch = async () => { calls++; throw Error('Outbound request attempted'); };
    const demo = await createDemoFixture({ scenario: 'empty' });
    const response = await demo.api(new Request('https://clinime-growth-local.invalid/api/config'));
    const config = await response.json(); assert.equal(response.status, 200); assert.equal(config.walletEnrollment, undefined); assert.equal(calls, 0);
    const wallet = await demo.api(new Request('https://clinime-growth-local.invalid/api/wallet/campaign', { headers: { cookie: demo.accounts.customer.cookie } }));
    assert.equal(wallet.status, 503); assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  }
});
