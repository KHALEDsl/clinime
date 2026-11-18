import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const sources = await Promise.all(['data', 'copy', 'engine', 'journey'].map(name => readFile(new URL(`../client/${name}.js`, import.meta.url), 'utf8')));
const booking = (extra = {}) => ({ id: 'booking-1', status: 'confirmed', revision: 1, date: '2026-12-01', time: '10:00', professional: 'any', emailStatus: 'sent', contact: { name: 'Visitor', email: 'visitor@example.com' }, attendee: { kind: 'self' }, items: [{ serviceId: 'basic', optionId: null, nameAr: 'خدمة', nameEn: 'Service', image: 'skin', price: 250, duration: 40 }], ...extra });
const user = { id: 'visitor-1', email: 'visitor@example.com', name: 'Visitor' };
const session = bookings => ({ user, bookings, csrfToken: 'test-token', preferences: { email: false } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function setup(api = {}) {
  const events = {}, windowEvents = {}, timers = [], writes = [], elements = new Map(['app', 'overlay', 'announce'].map(id => [id, { innerHTML: '', textContent: '', prepend() {} }]));
  const document = { createElement: () => ({ setAttribute() {}, innerHTML: '', className: '' }), visibilityState: 'visible', activeElement: null, documentElement: {}, getElementById: id => elements.get(id) || null, querySelectorAll: () => [], querySelector: () => null, addEventListener: (name, fn) => { events[name] = fn; } };
  let reads = 0, renders = 0;
  const context = vm.createContext({ console, document, Intl, Date, URLSearchParams, location: { hash: '#/booking/booking-1', origin: 'https://clinic.example' }, history: { replaceState() {}, pushState() {} }, localStorage: { getItem: () => '{}', setItem: (key, value) => writes.push([key, value]) }, sessionStorage: { getItem: () => '1' }, scrollY: 0, scrollTo() {}, requestAnimationFrame: fn => fn(), setInterval: (fn, ms) => timers.push({ fn, ms }), setTimeout: () => {}, matchMedia: () => ({ matches: true }), ASSETS: { clinic: '/clinic.webp', skin: '/skin.webp' }, renderApp: () => { renders++; }, renderModal: () => '', addEventListener: (name, fn) => { windowEvents[name] = fn; }, ClinimeAPI: { uuid: () => 'request-1', setCSRF() {}, ...api, me: async () => { reads++; return (api.me || (() => session([booking()])))(); } } });
  context.window = context;
  for (const source of sources) vm.runInContext(source, context);
  Object.assign(context.App.state, { auth: user, bookings: [booking()], route: 'booking', routeId: 'booking-1', sessionStatus: 'ready', locale: 'en' });
  return { context, state: context.App.state, events, windowEvents, writes, reads: () => reads, renders: () => renders, tick: () => timers.find(timer => timer.ms === 60000).fn(), click(action) { const button = { dataset: { action }, disabled: false }; events.click({ target: { closest: selector => selector === '[data-action]' ? button : null }, preventDefault() {} }); } };
}

test('arrival is shown on details, confirmation and list in both languages; cancellation takes precedence', () => {
  const h = setup(), { App, MobileJourney } = h.context;
  h.state.bookings = [booking({ attendance: { status: 'arrived', arrivedAt: '2026-12-01T07:00:00Z' } })];
  for (const [locale, status, help] of [['en', 'Arrival recorded', 'contact reception'], ['ar', 'تم تسجيل وصولك', 'تواصلي مع الاستقبال']]) {
    h.state.locale = locale;
    for (const view of ['booking', 'confirmed', 'appointments']) {
      const html = MobileJourney[view]();
      assert.ok(html.includes(status), `${view}: ${locale}`);
      assert.ok(!html.includes('data-action="reschedule"'));
      assert.ok(!html.includes('data-action="cancel-booking"'));
      if (view !== 'appointments') assert.ok(html.includes(help));
    }
  }
  h.state.locale = 'en';
  h.state.bookings[0].status = 'cancelled';
  assert.equal(App.hasArrived(App.currentBooking()), false);
  assert.equal(App.bookingStatus(App.currentBooking()), App.t('bookingCancelled'));
  assert.ok(!MobileJourney.confirmed().includes('Arrival recorded'));
  h.state.bookings = [booking()];
  assert.ok(MobileJourney.booking().includes('data-action="reschedule"'));
  assert.ok(MobileJourney.booking().includes('data-action="cancel-booking"'));
});

test('visible appointment refresh reflects reschedule, arrival and confirmed-screen cancellation', async () => {
  let latest = booking({ date: '2026-12-02', time: '12:30', revision: 2 });
  const h = setup({ me: () => session([latest]) });
  h.tick(); await settle();
  assert.equal(h.state.bookings[0].time, '12:30');
  latest = booking({ attendance: { status: 'arrived' }, revision: 3 });
  h.windowEvents.focus(); await settle();
  assert.equal(h.context.App.hasArrived(h.state.bookings[0]), true);
  h.state.route = 'confirmed';
  latest = booking({ status: 'cancelled', attendance: { status: 'arrived' }, revision: 4 });
  h.events.visibilitychange(); await settle();
  assert.equal(h.state.route, 'booking');
  assert.equal(h.state.bookings[0].status, 'cancelled');
  assert.equal(h.state.draft, null);
  for (const [, value] of h.writes) assert.deepEqual(Object.keys(JSON.parse(value)).sort(), ['category', 'locale']);
});

test('quiet refresh leaves drafts, dialogs, pending mutations, hidden pages and unknown receipts alone', async () => {
  const h = setup();
  for (const [key, value] of [['pending', true], ['modal', { type: 'cancel' }], ['recovery', { kind: 'cancel', owner: user.id }], ['draft', { contact: { name: 'Unsaved' } }], ['cart', [{ serviceId: 'basic' }]], ['route', 'attendee']]) {
    const before = h.state[key]; h.state[key] = value;
    h.tick(); h.windowEvents.focus(); await settle();
    assert.equal(h.reads(), 0, key);
    assert.equal(h.state[key], value, key);
    h.state[key] = before;
  }
  h.context.document.visibilityState = 'hidden';
  h.tick(); await settle(); assert.equal(h.reads(), 0);
});

test('an in-flight appointment read cannot overwrite a completed cancellation or a new scheduling draft', async () => {
  const read = deferred(), h = setup({ me: () => read.promise, cancel: async () => ({ booking: booking({ status: 'cancelled', revision: 2 }), emailStatus: 'sent' }) });
  h.tick();
  h.click('cancel-confirm'); await settle();
  assert.equal(h.state.bookings[0].status, 'cancelled');
  read.resolve(session([booking()])); await settle();
  assert.equal(h.state.bookings[0].status, 'cancelled');

  const secondRead = deferred(), d = setup({ me: () => secondRead.promise, availability: async () => ({ dates: [], slots: [] }) });
  d.tick(); d.click('reschedule'); await settle();
  const draft = d.state.draft;
  secondRead.resolve(session([booking({ status: 'cancelled' })])); await settle();
  assert.equal(d.state.route, 'availability');
  assert.equal(d.state.draft, draft);
  assert.equal(d.state.bookings[0].status, 'confirmed');
});

test('background errors preserve the current notice and receipt state; overlapping refreshes are coalesced', async () => {
  const read = deferred(), h = setup({ me: () => read.promise });
  h.state.notice = 'Existing message'; h.tick(); h.windowEvents.focus();
  assert.equal(h.reads(), 1);
  read.reject(Object.assign(new Error('Offline'), { code: 'NETWORK_UNCERTAIN' })); await settle();
  assert.equal(h.state.notice, 'Existing message');
  assert.equal(h.state.sessionStatus, 'ready');
  assert.equal(h.renders(), 0);
});

test('arrival locks an edit already in progress using the authoritative refreshed appointment', async () => {
  const h = setup({ reschedule: async () => { throw Object.assign(new Error('Arrived'), { code: 'ARRIVAL_LOCKED' }); }, me: () => session([booking({ attendance: { status: 'arrived' }, revision: 2 })]) });
  h.state.route = 'review';
  h.state.cart = [{ serviceId: 'basic' }];
  h.state.draft = { mode: 'edit', bookingId: 'booking-1', baseRevision: 1, date: '2026-12-01', time: '12:00', contact: { name: 'Visitor' }, attendee: { kind: 'self' } };
  h.click('confirm'); await settle();
  assert.equal(h.state.route, 'booking');
  assert.equal(h.state.draft, null);
  assert.equal(h.state.recovery, null);
  assert.equal(h.state.cart.length, 0);
  assert.ok(h.state.notice.includes('Contact reception'));
});


test('identical appointment snapshots do not rebuild the focused view', async () => {
  const h = setup();
  h.tick(); await settle();
  assert.equal(h.reads(), 1);
  assert.equal(h.renders(), 0);
});
