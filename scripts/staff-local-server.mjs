import { LOCAL_PROFESSIONALS } from '../server/professionals.mjs';
// Local QA only. This file is never copied into dist or imported by Netlify.
// Every account/booking is created through the actual API, using in-memory CAS
// and a fake mail adapter. No environment files or live providers are read.
import https from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createAPI } from '../server/api.mjs';

export const LOCAL_ORIGIN = 'https://127.0.0.1:9444';
const LEDGER = 'clinic/booking-ledger-v1';
const DIST = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
export class MemoryStore {
  records = new Map(); version = 0; unknownOnce = null;
  async getWithMetadata(key, options) {
    if (options?.consistency !== 'strong') throw Error('Local fixture requires strong reads');
    return structuredClone(this.records.get(key) || null);
  }
  async setJSON(key, value, options) {
    const existing = this.records.get(key);
    if (options.onlyIfNew && existing || options.onlyIfMatch && existing?.etag !== options.onlyIfMatch) return { modified: false };
    const etag = String(++this.version);
    this.records.set(key, { data: structuredClone(value), etag });
    if (this.unknownOnce === key) { this.unknownOnce = null; throw Error('Local fixture: lost acknowledgement after commit'); }
    return { modified: true, etag };
  }
}
export async function createFixture({ origin = LOCAL_ORIGIN, elapsed = false, seed = true, adminEmails = null, specialistRoster = false, epoch: initialEpoch = '2026-11-01T07:00:00Z' } = {}) {
  const store = new MemoryStore(), launchedAt = Date.now(), epoch = Date.parse(initialEpoch);
  const now = () => epoch + (elapsed ? Date.now() - launchedAt : 0);
  const mail = { calls: [], async send(message) { this.calls.push(structuredClone(message)); return { status: 'sent' }; } };
  const env = {
    APP_SECRET: 'local-QA-fixture-secret-never-a-live-production-secret-2026', PUBLIC_ORIGIN: origin,
    RESEND_API_KEY: 'fake-local-adapter-only', EMAIL_FROM: 'Local QA <fixture@example.invalid>',
    CLINIME_ADMIN_ACCESS: adminEmails ? 'allowlist' : 'verified-email',
    CLINIME_ADMIN_EMAILS: adminEmails?.join(',') || '',
    ...(specialistRoster ? { CLINIME_SPECIALISTS_JSON: JSON.stringify(LOCAL_PROFESSIONALS), CLINIME_ROSTER_SAMPLE: 'true' } : {}),
    CLINIC_SCHEDULE_JSON: JSON.stringify({ timeZone: 'Asia/Riyadh', weekdays: [0, 1, 2, 3, 4, 5, 6], open: '08:00', close: '22:00', stepMinutes: 30, horizonDays: 60 }),
  };
  const api = createAPI({ store, mail, env, now });
  async function request(route, { method = 'GET', data, account, originHeader = origin, headers = {} } = {}) {
    const requestHeaders = { ...headers, ...(method !== 'GET' ? { Origin: originHeader } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(account ? { Cookie: account.cookie, 'X-CSRF-Token': account.csrfToken } : {}) };
    const response = await api(new Request(origin + route, { method, headers: requestHeaders, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) }), { ip: '127.0.0.1' });
    const isJSON = response.headers.get('content-type')?.includes('application/json');
    return { status: response.status, data: isJSON ? await response.json() : null, bytes: isJSON ? null : Buffer.from(await response.arrayBuffer()), cookie: response.headers.get('set-cookie'), headers: response.headers };
  }
  const checked = (result, step) => { if (result.status !== 200) throw Error('Local fixture failed at ' + step + ': ' + JSON.stringify(result.data)); return result; };
  async function login(email) {
    const challenge = checked(await request('/api/auth/request', { method: 'POST', data: { requestId: randomUUID(), email, locale: 'en', mode: 'code' } }), 'OTP request');
    const code = mail.calls.at(-1).text.match(/Sign-in code: (\d{6})/)[1];
    const verified = checked(await request('/api/auth/verify', { method: 'POST', data: { challengeId: challenge.data.challengeId, code } }), 'OTP verification');
    return { ...verified.data, cookie: verified.cookie.split(';')[0], setCookie: verified.cookie };
  }
  const sessions = {}, bookings = [];
  if (seed) {
    for (const who of ['reception', 'doctor', 'customer', 'other']) sessions[who] = await login(who === 'other' ? 'othercustomer@example.invalid' : who + '@example.invalid');
    const specifications = [
      { who: 'customer', date: '2026-11-01', time: '11:00', items: [{ serviceId: 'basic' }], contactName: 'عميلة الفحص المحلية' },
      { who: 'customer', date: '2026-11-01', time: '14:00', items: [{ serviceId: 'hydra', optionId: 'basic' }], contactName: 'عميلة الفحص المحلية' },
      { who: 'other', date: '2026-11-01', time: '17:00', items: [{ serviceId: 'deep' }], contactName: 'عميلة محلية أخرى' },
      { who: 'customer', date: '2026-11-02', time: '12:00', items: [{ serviceId: 'brow' }], contactName: 'عميلة الفحص المحلية' },
    ];
    for (const specification of specifications) {
      const { who, ...details } = specification;
      bookings.push(checked(await request('/api/bookings', { method: 'POST', account: sessions[who], data: { requestId: randomUUID(), professional: 'any', attendee: { kind: 'self' }, ...details } }), 'booking create').data.booking);
    }
  }
  return { api, store, mail, sessions, bookings, request, login, now, ledger: () => structuredClone(store.records.get(LEDGER)?.data || null) };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const LOCAL_HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };
export async function startLocalServer() {
  const fixture = await createFixture({ elapsed: true });
  const server = https.createServer({ key: await readFile('/tmp/clinime-staff-local-key.pem'), cert: await readFile('/tmp/clinime-staff-local-cert.pem') }, async (req, res) => {
    try {
      if (req.headers.host !== '127.0.0.1:9444') { res.writeHead(400, LOCAL_HEADERS); res.end('Loopback host only'); return; }
      const url = new URL(req.url, LOCAL_ORIGIN);
      if (url.pathname === '/__qa/signin' && req.method === 'GET') {
        const who = url.searchParams.get('who');
        if (!['reception', 'doctor', 'customer'].includes(who)) { res.writeHead(400, LOCAL_HEADERS); res.end('Choose reception, doctor or customer'); return; }
        res.writeHead(303, { ...LOCAL_HEADERS, 'Set-Cookie': fixture.sessions[who].setCookie, Location: who === 'customer' ? '/#/appointments' : '/admin' }); res.end(); return;
      }
      if (url.pathname === '/__qa/state' && req.method === 'GET') {
        res.writeHead(200, { ...LOCAL_HEADERS, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ fixtureOnly: true, asOf: new Date(fixture.now()).toISOString(), accounts: Object.fromEntries(Object.entries(fixture.sessions).map(([who, session]) => [who, session.user.email])), ledger: fixture.ledger(), fakeMailCount: fixture.mail.calls.length })); return;
      }
      if (url.pathname.startsWith('/api/')) {
        const chunks = []; let length = 0;
        for await (const chunk of req) { length += chunk.length; if (length > 1500000) { res.writeHead(413, LOCAL_HEADERS); res.end(); return; } chunks.push(chunk); }
        const body = Buffer.concat(chunks), response = await fixture.api(new Request(url, { method: req.method, headers: req.headers, ...(body.length ? { body } : {}) }), { ip: '127.0.0.1' });
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, LOCAL_HEADERS); res.end(); return; }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, ''), resolved = path.resolve(DIST, relative);
      if (resolved !== DIST && !resolved.startsWith(DIST + path.sep)) { res.writeHead(403, LOCAL_HEADERS); res.end(); return; }
      let target = resolved;
      try { if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html'); }
      catch { if (path.extname(relative)) { res.writeHead(404, LOCAL_HEADERS); res.end(); return; } target = path.join(DIST, url.pathname.startsWith('/admin') ? 'admin/index.html' : 'index.html'); }
      const content = await readFile(target);
      res.writeHead(200, { ...LOCAL_HEADERS, 'Content-Type': MIME[path.extname(target)] || 'application/octet-stream' }); res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (!res.headersSent) res.writeHead(500, LOCAL_HEADERS);
      res.end('Local QA server error');
      console.error(error.message);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(9444, '127.0.0.1', resolve); });
  console.log('Local fixture only: ' + LOCAL_ORIGIN + '/admin');
  console.log('Sign in: /__qa/signin?who=reception | doctor | customer; assertions: /__qa/state');
  return { server, fixture };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startLocalServer().catch(error => { console.error('Local fixture startup failed: ' + error.message); process.exitCode = 1; });
}
