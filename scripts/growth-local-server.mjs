// Local review only. This script is never bundled, deployed, or imported by Netlify.
// Real API + in-memory CAS storage + fake mail. It does not load environment files,
// read live credentials, call Wallet providers, or send any external messages.
//
// Fixture schema is the actual clinic/booking-ledger-v1 record: bookings use
// snapshotItems(CATALOG), visits live in booking._staff, receipts in staff.receipts,
// materials/products in staff.stock/products. Only workspace.growthPreview is an
// extra local response field; no production contracts or stored schemas change.
import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createFixture } from './staff-local-server.mjs';
import { CATALOG } from '../server/catalog.mjs';
import { snapshotItems } from '../server/bookings.mjs';
import { LOCAL_PROFESSIONALS } from '../server/professionals.mjs';
import { REFERENCE_MATERIALS, REFERENCE_PRODUCTS } from '../server/staff-reference-catalog.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = path.join(ROOT, 'dist');
const API_ORIGIN = 'https://clinime-growth-local.invalid';
const LEDGER = 'clinic/booking-ledger-v1';
const SESSION_COOKIE = 'clinime-growth-local-session';
const SCENARIO_COOKIE = 'clinime-growth-scenario';
const SCENARIOS = ['ready', 'empty', 'insufficient', 'error'];
const OWNER_EMAIL = 'owner@growth-preview.invalid';
const DAY = 86400000;
const HASH = value => createHash('sha256').update(value).digest('hex');
const localDate = timestamp => new Date(timestamp + 3 * 3600000).toISOString().slice(0, 10);
const offsetDate = (today, offset) => new Date(Date.parse(today + 'T12:00:00Z') + offset * DAY).toISOString().slice(0, 10);
const timestamp = (date, time) => new Date(date + 'T' + time + ':00+03:00').toISOString();
const checked = (response, step) => { if (response.status !== 200) throw Error(step + ': ' + JSON.stringify(response.data)); return response.data; };
const preview = scenario => ({ isSample: true, label: 'بيانات توضيحية للمعاينة المحلية', scenario });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Clinime-Local-Preview': 'growth-sample-only', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };
const NAMES = ['سارة العتيبي', 'نورة القحطاني', 'ريم الحربي', 'لينا الغامدي', 'هند الشهري', 'مها الزهراني', 'جود الدوسري', 'رنا المالكي', 'روان السالم', 'لما العبدالله', 'دلال المطيري', 'عهود العنزي', 'نجلاء الحارثي', 'أمل الشمري', 'هديل الناصر', 'غادة الهاجري', 'ميساء البقمي', 'دانة الخالد', 'عبير السبيعي', 'أروى الفهد', 'جنى الصالح', 'تالا العمري', 'شهد المحمد', 'هيا آل سعد', 'منيرة العلي', 'رغد العسيري', 'سمر النافع', 'لطيفة الراجحي', 'بشاير الكندري', 'ربى التركي', 'ريما النجار', 'وداد الحمد', 'شوق الحسن', 'نور البدر', 'مريم اليوسف', 'سندس الشريف', 'أسماء الراشد', 'ديما الشعلان', 'بسمة الماجد', 'حنين القصيبي', 'منال الحسين', 'أماني الجبر', 'هدى المرشد', 'رزان المقبل', 'فاطمة البراهيم', 'وفاء السلمان', 'ثريا الموسى', 'عائشة القاسم'];
const TIMES = ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00', '18:30'];
const SERVICE_ROTATION = ['basic', 'hydra', 'laser', 'deep', 'botox', 'filler', 'micro', 'brow', 'lashes', 'lips', 'brightening', 'botox-consult', 'filler-consult', 'face'];

export async function createGrowthFixture({ scenario = 'ready', epoch = new Date().toISOString() } = {}) {
  if (!SCENARIOS.includes(scenario)) throw Error('Unknown local scenario');
  const fixture = await createFixture({ origin: API_ORIGIN, seed: false, elapsed: true, specialistRoster: true, adminEmails: [OWNER_EMAIL], epoch });
  const account = await fixture.login(OWNER_EMAIL);
  fixture.sessions.owner = account;
  checked(await fixture.request('/api/profile', { method: 'PATCH', account, data: { name: 'جيجي · معاينة محلية' } }), 'Local owner profile');
  const today = localDate(fixture.now());
  // Obtain the booking shape from the real API once; all sample history is then
  // cloned in isolated memory, with stable identifiers and authoritative prices.
  const seed = checked(await fixture.request('/api/bookings', { method: 'POST', account, data: { requestId: randomUUID(), professional: 'layla', date: offsetDate(today, 1), time: '20:00', items: [{ serviceId: 'basic' }], contactName: NAMES[0], attendee: { kind: 'self' } } }), 'Booking schema').booking;
  const template = structuredClone(fixture.ledger().bookings[seed.id]);
  for (const key of ['emailMessage', 'mailStartedAt', 'fingerprint', '_loyalty']) delete template[key];
  const asOf = new Date(fixture.now()).toISOString();
  const staff = { revision: 1, referenceImported: true, referenceImportedAt: asOf, catalog: structuredClone(CATALOG).map(service => ({ ...service, active: true, availability: 'available', description: service.id === 'micro' && scenario !== 'empty' ? '' : `${service.nameAr} · ${service.duration} دقيقة.`, followup: 14, aftercare: '' })), medical: {}, stock: {}, products: {}, receipts: [], audit: [], requests: {} };
  const ledger = { schema: 1, bookings: {}, requests: {}, staff };
  const illustrativeUserIds = NAMES.map((_, index) => HASH('growth-local-only-patient-' + index));
  let sequence = 0;
  const add = ({ date, slot, customer = 0, serviceId = 'basic', stage = 'closed', cancelled = false, professionalIndex = 0 }) => {
    const id = 'CL-' + HASH('growth-local:' + date + ':' + slot).slice(0, 24).toUpperCase();
    const service = CATALOG.find(item => item.id === serviceId);
    const items = snapshotItems([{ serviceId, ...(service.options.length ? { optionId: service.options[0].id } : {}) }]);
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const time = TIMES[slot], start = timestamp(date, time), finish = new Date(Date.parse(start) + items[0].duration * 60000).toISOString();
    const professional = LOCAL_PROFESSIONALS[professionalIndex % LOCAL_PROFESSIONALS.length];
    const createdAt = new Date(Math.min(Date.parse(start) - (2 + sequence % 6) * DAY, fixture.now() - 3600000)).toISOString();
    const updatedAt = new Date(Math.min(Date.parse(finish), fixture.now())).toISOString();
    const booking = { ...structuredClone(template), id, ownerId: illustrativeUserIds[customer], revision: 1, status: cancelled ? 'cancelled' : 'confirmed', date, time, items, professional: professional.id, professionalNameAr: professional.nameAr, professionalNameEn: professional.nameEn, attendee: { kind: 'self', name: NAMES[customer], relationship: '' }, contact: { name: NAMES[customer], email: `client${customer + 1}@growth-preview.invalid` }, createdAt, updatedAt, pricing: { subtotal: total, eligibleSubtotal: total, discount: 0, total, code: '', kind: null, percent: 0, cap: 0 }, emailStatus: 'sent', _staff: { stage: cancelled || stage === 'expected' ? 'waiting' : stage, additions: [], extensionMinutes: 0, notes: '' } };
    if (cancelled) booking.cancelledAt = new Date(Date.parse(start) - DAY).toISOString();
    else if (['waiting', 'session', 'checkout', 'closed'].includes(stage)) booking.attendance = { status: 'arrived', arrivedAt: new Date(Date.parse(start) - 8 * 60000).toISOString() };
    if (!cancelled && ['session', 'checkout', 'closed'].includes(stage)) booking._staff.startedAt = start;
    if (!cancelled && ['session', 'checkout', 'closed'].includes(stage)) booking._staff.decision = { value: 'proceed', note: 'قرار توضيحي للمعاينة المحلية', at: start };
    if (!cancelled && ['checkout', 'closed'].includes(stage)) booking._staff.finishedAt = finish;
    if (!cancelled && stage === 'closed') {
      booking._staff.closedAt = finish;
      staff.receipts.push({ id: 'RC-GROWTH-' + String(sequence + 1).padStart(4, '0'), number: 'G-' + String(sequence + 1).padStart(4, '0'), bookingId: id, kind: 'manual', method: sequence % 5 === 0 ? 'cash' : 'card', amount: total, total, previous: 0, recordedAt: finish, lines: structuredClone(items) });
    }
    if (!cancelled && stage === 'checkout') {
      // One honest partial receipt leaves a positive, API-computed balance.
      // It is not a paid/closed visit and must remain actionable in checkout.
      staff.receipts.push({ id: 'RC-GROWTH-PARTIAL-' + String(sequence + 1).padStart(4, '0'), number: 'GP-' + String(sequence + 1).padStart(4, '0'), bookingId: id, kind: 'manual', method: 'card', amount: Math.min(100, total / 2), total, previous: 0, recordedAt: finish, lines: structuredClone(items) });
    }
    ledger.bookings[id] = booking;
    sequence++;
    return booking;
  };
  if (scenario !== 'empty') {
    const days = scenario === 'insufficient' ? 3 : 63;
    for (let ago = days; ago >= 1; ago--) {
      const date = offsetDate(today, -ago), weekday = new Date(date + 'T12:00:00Z').getUTCDay();
      const count = scenario === 'insufficient' ? 2 : [5, 4, 6, 5, 7, 4, 6][weekday] + (ago % 11 === 0 ? 1 : 0);
      for (let slot = 0; slot < count; slot++) {
        // Twelve recurring clients stop visiting 35+ days ago, while 36 other
        // illustrative clients remain active. This enables retention review.
        const customer = ago >= 35 && ago <= 58 && slot < 2 ? 36 + ((ago - 35) * 2 + slot) % 12 : (ago * 5 + slot * 3) % 36;
        let serviceId = SERVICE_ROTATION[(ago + slot * 3) % SERVICE_ROTATION.length];
        // A realistic service-mix change, not a fabricated financial metric.
        if (ago <= 14 && serviceId === 'hydra') serviceId = 'basic';
        add({ date, slot, customer, serviceId, stage: ago === 1 && slot === count - 1 ? 'waiting' : 'closed', cancelled: (ago + slot * 7) % 19 === 0, professionalIndex: ago + slot });
      }
    }
    const todayStages = ['closed', 'checkout', 'session', 'waiting', 'expected', 'expected'];
    todayStages.forEach((stage, slot) => add({ date: today, slot, customer: slot + 2, serviceId: ['basic', 'deep', 'hydra', 'laser', 'filler', 'micro'][slot], stage, professionalIndex: slot }));
    for (let ahead = 1; ahead <= 7; ahead++) {
      const count = ahead === 2 ? 1 : [0, 4, 1, 5, 3, 4, 4, 3][ahead];
      for (let slot = 0; slot < count; slot++) add({ date: offsetDate(today, ahead), slot, customer: (ahead * 3 + slot) % 36, serviceId: ['basic', 'deep', 'hydra', 'laser'][slot % 4], stage: 'expected', professionalIndex: ahead + slot });
    }
    // Names/SKUs match the approved reference. Every quantity and retail price
    // below is intentionally illustrative and is never a production inventory.
    for (const [index, material] of REFERENCE_MATERIALS.entries()) staff.stock[material.id] = { ...material, quantity: index === 2 ? 2 : index === 8 ? 3 : 24 + index * 3, quantityVerified: true, min: index === 2 || index === 8 ? 8 : 10, unit: 'وحدة', expiry: offsetDate(today, 200 + index), condition: 'متاح', reason: 'رصيد توضيحي للمعاينة المحلية', variants: [], revision: 1, version: 1, updatedAt: asOf };
    for (const [index, product] of REFERENCE_PRODUCTS.entries()) {
      const stockId = product.id + '-stock';
      staff.stock[stockId] = { id: stockId, name: product.name, sku: 'LOCAL-P-' + (index + 1), type: 'منتجات العناية', kind: 'منتج', quantity: 18 + index * 4, quantityVerified: true, min: 5, unit: 'قطعة', expiry: '', variants: [], revision: 1, version: 1, updatedAt: asOf };
      staff.products[product.id] = { ...product, stockId, price: index === 0 ? 85 : 140, priceVerified: true, active: true, updatedAt: asOf };
    }
  }
  await fixture.store.setJSON(LEDGER, ledger, { onlyIfMatch: fixture.store.records.get(LEDGER).etag });
  // Profile records support the existing clients/details views without fake
  // OTP requests for every illustrative person. Only the owner has a session.
  for (const [index, id] of illustrativeUserIds.entries()) await fixture.store.setJSON('user/' + id, { id, name: NAMES[index], email: `client${index + 1}@growth-preview.invalid`, preferences: { email: true }, favorite: false }, { onlyIfNew: true });
  let workspace = checked(await fixture.request('/api/admin/workspace', { account }), 'Workspace projection');
  // Keep seeded completed/in-progress clinical states coherent with the actual
  // workflow. No real medical findings are invented; all fields stay empty.
  for (const [bookingId, visit] of Object.entries(workspace.visits)) {
    const booking = ledger.bookings[bookingId];
    if (booking.status === 'confirmed' && (['session', 'checkout', 'closed'].includes(visit.stage) || booking.date === today && booking.attendance?.status === 'arrived')) staff.medical[visit.patientId] = { fields: {}, flags: { consultation: true, assessment: true, consent: true }, updatedAt: booking.updatedAt };
  }
  await fixture.store.setJSON(LEDGER, ledger, { onlyIfMatch: fixture.store.records.get(LEDGER).etag });
  workspace = checked(await fixture.request('/api/admin/workspace', { account }), 'Coherent workspace projection');
  const unpaidCheckout = workspace.bookings.filter(booking => booking.status === 'confirmed' && booking.date <= today && workspace.visits[booking.id].stage === 'checkout' && workspace.visits[booking.id].balance > 0);
  const unresolvedPast = workspace.bookings.filter(booking => booking.status === 'confirmed' && booking.date < today && !['closed', 'checkout'].includes(workspace.visits[booking.id].stage));
  const summary = { localOnly: true, scenario, today, asOf, historyDays: scenario === 'empty' ? 0 : scenario === 'insufficient' ? 3 : 63, firstDate: workspace.bookings.map(booking => booking.date).sort()[0] || null, bookings: workspace.bookings.length, receiptCount: workspace.receipts.length, completedReceipts: workspace.receipts.filter(receipt => workspace.visits[receipt.bookingId].stage === 'closed').length, unpaidCheckoutCount: unpaidCheckout.length, unpaidCheckoutBalance: unpaidCheckout.reduce((sum, booking) => sum + workspace.visits[booking.id].balance, 0), unresolvedPastCount: unresolvedPast.length, professionals: workspace.professionals.length, verifiedLowStock: Object.values(workspace.stock).filter(item => item.quantityVerified && item.quantity < item.min).length, sparseDate: scenario === 'empty' ? null : offsetDate(today, 2), missingDescriptionService: scenario === 'empty' ? null : 'micro', fakeMailOnly: true, fakeMailCount: fixture.mail.calls.length };
  return { fixture, account, summary };
}

const parseCookies = raw => Object.fromEntries((raw || '').split(';').map(part => part.trim().split(/=(.*)/s)).filter(([key]) => key).map(([key, value]) => [key, value || '']));
const rewriteCookie = value => value.replace('__Host-clinime-session=', SESSION_COOKIE + '=').replace(/;\s*Secure/ig, '');

export async function startGrowthLocalServer({ port = Number(process.env.CLINIME_GROWTH_PORT || 8996), epoch = new Date().toISOString() } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Invalid loopback preview port');
  const fixtures = new Map();
  for (const scenario of SCENARIOS) fixtures.set(scenario, await createGrowthFixture({ scenario, epoch }));
  let activePort = port;
  const server = http.createServer(async (req, res) => {
    try {
      const origin = `http://127.0.0.1:${activePort}`;
      if (req.headers.host !== `127.0.0.1:${activePort}`) { res.writeHead(400, HEADERS); res.end('Loopback host only'); return; }
      const url = new URL(req.url, origin), cookies = parseCookies(req.headers.cookie);
      const requestedScenario = url.searchParams.get('scenario') || cookies[SCENARIO_COOKIE] || 'ready';
      const scenario = SCENARIOS.includes(requestedScenario) ? requestedScenario : 'ready';
      const { fixture, account, summary } = fixtures.get(scenario);
      if (url.pathname === '/__local/health' && req.method === 'GET') {
        res.writeHead(200, { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ...summary, origin, growthPreview: preview(scenario), scenarios: SCENARIOS, signin: '/__local/signin', servingBuiltDist: true, statePersistence: 'process memory only', externalProviderCalls: 0 })); return;
      }
      if (url.pathname === '/__local/scenario' && req.method === 'GET') {
        const value = url.searchParams.get('value');
        if (!SCENARIOS.includes(value)) { res.writeHead(400, HEADERS); res.end('Choose ready, empty, insufficient, or error'); return; }
        res.writeHead(303, { ...HEADERS, Location: '/__local/signin?scenario=' + value }); res.end(); return;
      }
      if (url.pathname === '/__local/signin' && req.method === 'GET') {
        // Explicit loopback-only bypass for this isolated fake-data review.
        // Session is produced by the real code-verification API with fake mail.
        res.writeHead(303, { ...HEADERS, 'Set-Cookie': [rewriteCookie(account.setCookie), `${SCENARIO_COOKIE}=${scenario}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`], Location: '/admin#home' }); res.end(); return;
      }
      if (url.pathname.startsWith('/__local/')) { res.writeHead(404, HEADERS); res.end(); return; }
      if (url.pathname.startsWith('/api/')) {
        const chunks = []; let length = 0;
        for await (const chunk of req) { length += chunk.length; if (length > 1500000) { res.writeHead(413, HEADERS); res.end(); return; } chunks.push(chunk); }
        const body = Buffer.concat(chunks), headers = new Headers(req.headers);
        if (cookies[SESSION_COOKIE]) headers.set('cookie', `__Host-clinime-session=${cookies[SESSION_COOKIE]}`);
        if (headers.get('origin') === origin) headers.set('origin', API_ORIGIN);
        const response = await fixture.api(new Request(API_ORIGIN + url.pathname + url.search, { method: req.method, headers, ...(body.length ? { body } : {}) }), { ip: '127.0.0.1' });
        const outgoing = Object.fromEntries(response.headers);
        if (outgoing['set-cookie']) outgoing['set-cookie'] = rewriteCookie(outgoing['set-cookie']);
        let content = Buffer.from(await response.arrayBuffer());
        if (url.pathname === '/api/admin/workspace' && response.status === 200) {
          content = Buffer.from(JSON.stringify({ ...JSON.parse(content.toString('utf8')), growthPreview: preview(scenario) }));
          delete outgoing['content-length'];
        }
        res.writeHead(response.status, { ...HEADERS, ...outgoing }); res.end(content); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, HEADERS); res.end(); return; }
      let relative;
      try { relative = decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch { res.writeHead(400, HEADERS); res.end(); return; }
      let target = path.resolve(DIST, relative);
      if (target !== DIST && !target.startsWith(DIST + path.sep)) { res.writeHead(403, HEADERS); res.end(); return; }
      try { if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html'); }
      catch { if (path.extname(relative)) { res.writeHead(404, HEADERS); res.end(); return; } target = path.join(DIST, url.pathname.startsWith('/admin') ? 'admin/index.html' : 'index.html'); }
      const content = await readFile(target);
      res.writeHead(200, { ...HEADERS, 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!res.headersSent) res.writeHead(500, HEADERS);
      res.end('Local preview unavailable');
      console.error('Local preview: ' + error.message);
    }
  });
  const listen = chosenPort => new Promise((resolve, reject) => { server.once('error', reject); server.listen(chosenPort, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); }); });
  try { await listen(activePort); }
  catch (error) { if (error.code !== 'EADDRINUSE' || activePort !== 8996) throw error; activePort = 9014; await listen(activePort); }
  const origin = `http://127.0.0.1:${activePort}`;
  console.log('Clinime growth LOCAL SAMPLE preview: ' + origin + '/__local/signin');
  console.log('Health/scenarios: ' + origin + '/__local/health');
  console.log('Scenarios: /__local/scenario?value=ready|empty|insufficient|error');
  console.log('Fake mail only; in-memory state resets on server restart. No production connections.');
  return { server, fixtures, origin, port: activePort };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startGrowthLocalServer().catch(error => { console.error('Local growth startup failed: ' + error.message); process.exitCode = 1; });
}
