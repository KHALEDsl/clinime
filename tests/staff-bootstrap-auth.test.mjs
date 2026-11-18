import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../client/admin/staff/bootstrap.js', import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
class Fields {
  constructor(form) { this.values = form.fields; }
  get(name) { return this.values[name] ?? null; }
}
function harness() {
  const pending = [], calls = [], auth = { innerHTML: '', remove() {} }, dialog = { open: false, close() { this.open = false; } };
  const events = {}, windowEvents = {}, intervals = [], authCalls = [];
  const context = vm.createContext({
    console, Intl, Date, JSON, URL, FormData: Fields, location: { hash: '#home' },
    document: { hidden: false, querySelectorAll: () => [], getElementById: () => auth, querySelector: selector => selector === '#dialog' ? dialog : null, addEventListener: (name, handler) => { events[name] = handler; } },
    ClinimeAPI: {
      setCSRF() {}, uuid: () => 'local-request-id',
      authRequest: async payload => { authCalls.push(payload); return { challengeId: 'local-challenge' }; },
      verify: async () => ({ csrfToken: 'local-csrf' }),
      request: path => { calls.push(path); const request = deferred(); pending.push(request); return request.promise; },
    },
    StaffBridge: { clear() {}, apply() {}, render() {}, feedback() {} },
    setInterval: (handler, milliseconds) => { intervals.push({ handler, milliseconds }); },
    addEventListener: (name, handler) => { windowEvents[name] = handler; },
  });
  context.window = context;
  vm.runInContext(source, context);
  return {
    runtime: context.StaffRuntime, pending, calls, auth, authCalls, events, windowEvents, intervals,
    async signedOut() { pending[0].reject({ status: 401 }); await settle(); },
    submit(mode, values) {
      const form = { dataset: { authForm: mode }, fields: values };
      return events.submit({ target: { closest: () => form }, preventDefault() {} });
    },
    backgroundEvents() {
      windowEvents.focus();
      events.visibilitychange();
      intervals.find(timer => timer.milliseconds === 60000).handler();
    },
  };
}

for (const status of [401, 403]) test(`auth ${status} releases the read latch and permits a fresh session request`, async () => {
  const h = harness();
  assert.equal(h.runtime.state.read, true);
  h.pending[0].reject({ status }); await settle();
  assert.equal(h.runtime.state.read, false);
  assert.equal(h.runtime.state.user, null);
  const retry = h.runtime.refresh({ session: true });
  assert.equal(h.calls.length, 2);
  h.pending[1].reject({ status }); await retry;
  assert.equal(h.runtime.state.read, false);
});

test('a stale read finishing after clear cannot overwrite or release a newer session read', async () => {
  const h = harness(), old = h.pending[0];
  h.runtime.clear();
  const next = h.runtime.refresh({ session: true });
  old.resolve({ user: { email: 'stale@example.invalid' }, csrfToken: 'stale' }); await settle();
  assert.equal(h.runtime.state.user, null);
  assert.equal(h.runtime.state.read, true);
  assert.equal(h.calls.length, 2);
  h.pending[1].reject({ status: 401 }); await next;
  assert.equal(h.runtime.state.read, false);
});

test('auth loss on a workspace read clears private state and allows recovery', async () => {
  const h = harness(); h.runtime.state.loaded = true;
  h.pending[0].resolve({ user: { email: 'staff@example.invalid' }, csrfToken: 'csrf' }); await settle();
  assert.equal(h.calls[1], '/api/admin/workspace');
  h.pending[1].reject({ status: 401 }); await settle();
  assert.equal(h.runtime.state.user, null);
  assert.equal(h.runtime.state.workspace, null);
  assert.equal(h.runtime.state.bookings.length, 0);
  assert.equal(h.runtime.state.read, false);
  const retry = h.runtime.refresh({ session: true });
  assert.equal(h.calls.length, 3);
  h.pending[2].reject({ status: 403 }); await retry;
});

test('signed-out focus, visibility and timer events preserve the pending OTP form without workspace requests', async () => {
  const h = harness(); await h.signedOut();
  await h.submit('request', { email: 'staff@example.invalid' });
  assert.equal(h.authCalls.length, 1);
  assert.match(h.auth.innerHTML, /name="code"/);
  const codeForm = h.auth.innerHTML;
  h.backgroundEvents(); await settle();
  assert.deepEqual(h.calls, ['/api/admin/me']);
  assert.equal(h.auth.innerHTML, codeForm);
  assert.equal(h.runtime.state.read, false);
});

test('post-logout background events stay idle while explicit session recovery remains allowed', async () => {
  const h = harness(); await h.signedOut();
  h.runtime.state.user = { email: 'previous@example.invalid' };
  h.runtime.clear(); h.runtime.state.lastRead = 0;
  const loginForm = h.auth.innerHTML;
  h.backgroundEvents(); await settle();
  assert.equal(h.calls.length, 1);
  assert.equal(h.auth.innerHTML, loginForm);
  const retry = h.runtime.refresh({ session: true });
  assert.equal(h.calls[1], '/api/admin/me');
  h.pending[1].reject({ status: 401 }); await retry;
});

test('OTP verification still starts the explicit verified session and loads its workspace', async () => {
  const h = harness(); await h.signedOut();
  await h.submit('request', { email: 'staff@example.invalid' });
  h.runtime.state.loaded = true;
  const verified = h.submit('verify', { code: '654321' }); await settle();
  assert.equal(h.calls[1], '/api/admin/me');
  h.pending[1].resolve({ user: { email: 'staff@example.invalid' }, csrfToken: 'verified' }); await settle();
  assert.equal(h.calls[2], '/api/admin/workspace');
  h.pending[2].resolve({ revision: 1, catalog: [], bookings: [], asOf: '2026-11-01T10:00:00Z' }); await verified;
  assert.equal(h.runtime.state.user.email, 'staff@example.invalid');
  assert.equal(h.runtime.state.workspace.revision, 1);
  assert.equal(h.runtime.state.read, false);
});

test('unverified inventory projection preserves unknown flags and never invents a missing SKU', async () => {
  const h = harness(); await h.signedOut();
  const projected = h.runtime.project({
    catalog: [], bookings: [], revision: 1,
    stock: { sample: { id: 'sample', name: 'Reference label', sku: '', quantity: 0, quantityVerified: false } },
    products: { sample: { id: 'sample', name: 'Reference product', stockId: 'sample', price: 0, priceVerified: false, quantityVerified: false } },
  });
  assert.equal(projected.db.stock[0].sku, '');
  assert.equal(projected.db.stock[0].quantityVerified, false);
  assert.equal(projected.db.products[0].priceVerified, false);
  assert.equal(projected.db.products[0].quantityVerified, false);
});
