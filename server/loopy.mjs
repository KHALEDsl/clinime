// Loopy Loyalty API v1, verified against the official Swagger on 2026-11-04.
// https://developer.loopyloyalty.com/loopyloyalty.swagger.json
// The official app uses the unversioned authenticated API (including numeric
// DataTable parameters not represented accurately in Swagger). The API has no
// documented mutation idempotency key or absolute stamp setter. App-private
// customer updates exist, but their configured field contract is unverified;
// this adapter therefore projects booking updates only as single-card messages.
// Never retry an uncertain mutation. A strong-CAS intent precedes every write.
import { createHmac, randomUUID } from 'node:crypto';
import { ApiError, canonical, email, hash, read, text, update, uuid } from './core.mjs';

export const LOOPY_CAMPAIGN_ID = 'ns7PFhWeahPi5kVt67394';
const API = 'https://api.loopyloyalty.com/v1/';
const AUTH_API = 'https://api.loopyloyalty.com/';
const REWARD_TEXT = 'بعد الزيارة الخامسة، لكِ جلسة تنظيف البشرة الأساسي مجانًا. احجزيها لنفسك أو أهديها.';
const NAME_FIELD = 'الاسم', EMAIL_FIELD = 'البريد الإلكتروني';
const INSTALL_PATHS = { 'loyalty.is': /^\/[A-Za-z0-9_-]+\/?$/, 'q.passkit.net': /^\/p-[A-Za-z0-9_-]+\/?$/ };
const error = (code, message = 'تعذّر الاتصال بخدمة البطاقة الآن.') => new ApiError(503, code, message);
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
function identity(user) {
  if (!user || typeof user.id !== 'string' || !user.id || !user.email) throw new ApiError(401, 'AUTH_REQUIRED', 'سجّلي دخولك أولًا.');
  // Callers MUST supply the server-authenticated account, never a body contact
  // or gifted booking recipient. Authentication owns verified email identity.
  return { id: text(user.id, 128), email: email(user.email) };
}
function installURL(value) {
  let u; try { u = new URL(value); } catch { throw error('LOOPY_INVALID_RECEIPT'); }
  if (typeof value !== 'string' || value.length > 2048 || u.protocol !== 'https:' || !INSTALL_PATHS[u.hostname]?.test(u.pathname) || u.username || u.password || u.port || u.search || u.hash) throw error('LOOPY_INVALID_RECEIPT');
  return u.href;
}
function publicCampaign(raw, id) {
  if (!raw || raw.id !== id || typeof raw.terms !== 'string' || typeof raw.disableTerms !== 'boolean' || !Array.isArray(raw.fieldsToCollect) || !Array.isArray(raw.rewards)) throw error('LOOPY_INVALID_CAMPAIGN');
  const fields = raw.fieldsToCollect;
  if (fields.length !== 2 || !fields.some(f => f.name === NAME_FIELD && f.type === 'text' && f.required === true) || !fields.some(f => f.name === EMAIL_FIELD && f.type === 'email' && f.required === true) || raw.consentEnabled === true) throw error('LOOPY_FORM_CHANGED', 'تغيّرت متطلبات البطاقة؛ نحتاج نراجعها قبل التسجيل.');
  if (raw.rewards.length !== 1 || Number(raw.rewards[0].stampsRequired) !== 5 || raw.rewards[0].rewardName !== 'عناية بشرة مجانية' || raw.rewards[0].rewardText !== REWARD_TEXT) throw error('LOOPY_REWARD_CHANGED');
  const value = {
    id, description: typeof raw.description === 'string' ? raw.description : 'بطاقة كلينيمي',
    business: { name: raw.business?.name || 'clinime', website: raw.business?.website || '' },
    design: { backgroundColor: raw.design?.backgroundColor || '#FCE8F0', textColor: raw.design?.textColor || '#2D3E5B' },
    terms: raw.terms, disableTerms: raw.disableTerms, consentEnabled: false,
    fieldsToCollect: fields.map(({ name, type, required }) => ({ name, type, required })),
    rewards: raw.rewards.map(({ rewardName, rewardText, stampsRequired }) => ({ rewardName, rewardText: rewardText || '', stampsRequired: Number(stampsRequired) })),
  };
  return { ...value, version: hash(canonical(value)) };
}
function enrollmentView(record, now, timeoutMs) {
  const e = record?.enrollment;
  if (!e) return { status: 'none' };
  if (e.status === 'issued') return { status: 'issued', url: e.url, issuedAt: e.issuedAt, message: 'بطاقتك جاهزة للإضافة إلى محفظة الجوال.' };
  if (e.status === 'rejected') return { status: 'none', errorCode: e.reason, retryAllowed: true, message: 'لم تقبل خدمة البطاقة الطلب. تواصلي مع كلينيمي قبل المحاولة مجددًا.' };
  if (e.status === 'pending' && now - e.startedAt <= timeoutMs + 5000) return { status: 'pending', retryAllowed: false, message: 'جاري التحقق من بطاقتك. يمكنك تحديث الحالة هنا.' };
  return { status: 'unknown', retryAllowed: false, recovery: 'contact-clinic', message: 'ما قدرنا نتأكد من نتيجة طلب البطاقة. لا تعيدي التسجيل حتى نراجعه.' };
}
const deliveryView = (intent, at = 0, timeoutMs = Infinity) => ({ status: intent.status === 'pending' && at - intent.startedAt > timeoutMs + 5000 ? 'unknown' : intent.status, ...(intent.reason ? { reason: intent.reason } : {}), ...(intent.deliveredAt ? { deliveredAt: intent.deliveredAt } : {}), ...(intent.kind === 'stamp' && intent.providerMarker && ['pending', 'unknown'].includes(intent.status) ? { reconciliationAvailable: true } : {}) });
function deliveryInput(event) {
  const id = text(event.id, 256), kind = event.kind;
  if (!['stamp', 'booking-message', 'redeem'].includes(kind)) throw new ApiError(400, 'INVALID_LOOPY_EVENT');
  const payload = kind === 'stamp' ? { stamps: 1 } : kind === 'redeem' ? { rewardType: 1, rewards: 1 } : { message: text(event.message, 500) };
  if (kind === 'stamp' && event.stamps !== 1) throw new ApiError(400, 'INVALID_LOOPY_EVENT');
  if (kind === 'redeem' && (event.rewardType !== 1 || event.rewards !== 1)) throw new ApiError(400, 'INVALID_LOOPY_EVENT');
  return { kind, payload, digest: hash(canonical({ kind, ...payload })), intentKey: hash(id) };
}

export function normalizeLoopyConfig(source = {}) {
  let raw = source.verifiedBindings || source.LOOPY_VERIFIED_BINDINGS_JSON || {};
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { throw new TypeError('Invalid private Loopy verified bindings.'); } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('Invalid private Loopy verified bindings.');
  const verifiedBindings = {};
  for (const [address, pid] of Object.entries(raw)) {
    const normalized = email(address);
    if (!validId(pid) || (verifiedBindings[normalized] && verifiedBindings[normalized] !== pid)) throw new TypeError('Invalid private Loopy verified bindings.');
    verifiedBindings[normalized] = pid;
  }
  return { apiKey: source.apiKey || source.LOOPY_API_KEY || '', apiSecret: source.apiSecret || source.LOOPY_API_SECRET || '', username: source.username || source.LOOPY_USERNAME || '', campaignId: source.campaignId || source.LOOPY_CAMPAIGN_ID || LOOPY_CAMPAIGN_ID, verifiedBindings };
}

// config.apiSecret is a server-only secret. Never expose config, provider card
// IDs, provider error bodies, JWTs, customerDetails, or another account's data.
export function createLoopy({ store, fetchImpl = globalThis.fetch, now = Date.now, config = {}, timeoutMs = 12_000, writeTimeoutMs = timeoutMs, cacheMs = 300_000, maxLookupPages = 100, deadlineAt = Infinity } = {}) {
  if (!store || typeof fetchImpl !== 'function') throw new TypeError('Loopy requires a durable strong-CAS store and fetch implementation.');
  if (typeof deadlineAt !== 'number' || Number.isNaN(deadlineAt)) throw new TypeError('Invalid Loopy request deadline.');
  if (!Number.isFinite(writeTimeoutMs) || writeTimeoutMs <= 0) throw new TypeError('Invalid Loopy mutation timeout.');
  config = normalizeLoopyConfig(config);
  const campaignId = config.campaignId;
  if (!validId(campaignId)) throw new TypeError('Invalid Loopy campaign ID.');
  const enabled = Boolean(config.apiKey && config.apiSecret && config.username);
  const keyFor = account => `loopy/v1/${campaignId}/${hash(account.email)}`;
  const own = (record, account) => { if (record && (record.accountId !== account.id || record.email !== account.email)) throw error('LOOPY_IDENTITY_CONFLICT'); return record; };
  const empty = account => ({ accountId: account.id, email: account.email, intents: {} });
  const requireEnabled = () => { if (!enabled) throw error('LOOPY_NOT_CONFIGURED', 'ربط البطاقة غير متاح الآن.'); };
  function authorization() {
    const iat = Math.floor(now() / 1000);
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ uid: config.apiKey, pid: config.apiKey, username: config.username, iat, exp: iat + 60 })).toString('base64url');
    return `${h}.${p}.${createHmac('sha256', config.apiSecret).update(`${h}.${p}`).digest('base64url')}`;
  }
  async function request(path, { method = 'GET', body, authenticated = false, mutation = false, providerMarker, receiptRead = false } = {}) {
    if (authenticated) requireEnabled();
    // One absolute wall-clock deadline spans pagination, preflight and writes.
    // Business-time injection must not extend a function's real execution cap.
    const remaining = deadlineAt - Date.now() - (mutation || receiptRead ? 2000 : 0);
    if (remaining <= 0) throw error('LOOPY_DEADLINE');
    const operationTimeout = mutation ? writeTimeoutMs : timeoutMs;
    const requestBudget = Math.min(operationTimeout, remaining);
    const controller = new AbortController(); let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(error(remaining <= operationTimeout ? 'LOOPY_DEADLINE' : 'LOOPY_TIMEOUT')); }, requestBudget); });
    const work = (async () => {
      const response = await fetchImpl((authenticated ? AUTH_API : API) + path, { method, redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(authenticated ? { Authorization: authorization() } : {}), ...(providerMarker ? { 'User-Agent': providerMarker } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { ok: response.ok, status: response.status, data: response.ok ? await response.json() : null };
    })();
    try { return await Promise.race([work, timeout]); } finally { clearTimeout(timer); }
  }
  async function lookupRequest(path, options) {
    // These calls only read provider data. A lost read response is safe to
    // retry and must not be confused with an uncertain stamp/redemption.
    try { return await request(path, options); }
    catch (cause) {
      if (cause instanceof ApiError && !['LOOPY_TIMEOUT', 'LOOPY_DEADLINE'].includes(cause.code)) throw cause;
      throw error('LOOPY_LOOKUP_UNAVAILABLE');
    }
  }
  let cached, cacheAt = 0;
  async function campaign({ fresh = false } = {}) {
    if (!fresh && cached && now() - cacheAt < cacheMs) return structuredClone(cached);
    let response; try { response = await request(`campaign/public/${campaignId}`); } catch { throw error('LOOPY_CAMPAIGN_UNAVAILABLE'); }
    if (!response.ok) throw error('LOOPY_CAMPAIGN_UNAVAILABLE');
    cached = publicCampaign(response.data, campaignId); cacheAt = now(); return structuredClone(cached);
  }
  // POST /card/cid/:campaign is a documented READ operation. Search is a
  // wildcard across every customer field, so inspect every page and compare
  // the exact configured email field. Never adopt a first/partial search hit.
  async function findCard(account) {
    requireEnabled();
    if (config.verifiedBindings[account.email]) return verifiedCard(account);
    const matches = new Map(); let start = 0;
    for (let page = 0; page < maxLookupPages; page++) {
      const response = await lookupRequest(`card/cid/${campaignId}?count=false`, { method: 'POST', authenticated: true, body: { dt: { draw: page + 1, start, length: 100, search: account.email, order: { column: 'created', dir: 'desc' } } } });
      if (!response.ok) throw error(response.status === 403 ? 'LOOPY_ACCESS_DENIED' : 'LOOPY_LOOKUP_UNAVAILABLE');
      const payload = response.data, total = Number(payload?.recordsFiltered);
      if (!payload || payload.error || !Array.isArray(payload.data) || !Number.isSafeInteger(total) || total < 0 || payload.data.length > 100 || total < start + payload.data.length || (payload.data.length === 0 && start < total)) throw error('LOOPY_INVALID_LOOKUP');
      for (const card of payload.data) {
        if (card.campaignId !== campaignId) throw error('LOOPY_INVALID_LOOKUP');
        const value = card.customerDetails?.[EMAIL_FIELD];
        if (typeof value === 'string' && value.trim().toLowerCase() === account.email) {
          if (!validId(card.id) || !['issued', 'installed', 'removed'].includes(card.status)) throw error('LOOPY_INVALID_CARD');
          matches.set(card.id, card);
        }
      }
      if (matches.size > 1) throw error('LOOPY_DUPLICATE_CARDS', 'يوجد أكثر من بطاقة لهذا البريد. تواصلي مع كلينيمي لربط البطاقة الصحيحة.');
      start += payload.data.length;
      if (start >= total) return [...matches.values()][0] || null;
    }
    throw error('LOOPY_LOOKUP_LIMIT');
  }
  async function verifiedCard(account) {
    const pid = config.verifiedBindings[account.email];
    if (!pid) throw error('LOOPY_VERIFIED_BINDING_REQUIRED');
    // A server-side binding is an explicit reconciliation decision, never a
    // customer-supplied PID or automatic preference for one duplicate card.
    const response = await lookupRequest(`card/${pid}?includeEvents=false&includeRewards=false`, { authenticated: true });
    if (!response.ok) throw error(response.status === 403 || response.status === 401 ? 'LOOPY_ACCESS_DENIED' : response.status >= 500 ? 'LOOPY_LOOKUP_UNAVAILABLE' : 'LOOPY_BINDING_UNVERIFIED');
    return checkedCard(response.data?.card, pid, account);
  }
  function checkedCard(card, pid, account) {
    const address = card?.customerDetails?.[EMAIL_FIELD];
    const status = card?.passStatus ?? card?.status;
    if (!card || card.id !== pid || card.campaignId !== campaignId || typeof address !== 'string' || address.trim().toLowerCase() !== account.email || status !== 'installed' || (card.status && card.passStatus && card.status !== card.passStatus)) throw error('LOOPY_BINDING_UNVERIFIED');
    return card;
  }
  async function bindExisting(user) {
    const account = identity(user); requireEnabled(); const card = await verifiedCard(account);
    await update(store, keyFor(account), previous => {
      own(previous, account);
      if (previous?.enrollment?.status === 'pending') throw error('LOOPY_ENROLLMENT_UNCONFIRMED');
      if (previous?.enrollment?.status === 'issued' && previous.enrollment.pid !== card.id) throw error('LOOPY_BINDING_CONFLICT');
      if (previous?.enrollment?.status === 'issued') return { write: false, result: true };
      return { value: { ...(previous || empty(account)), enrollment: { status: 'issued', pid: card.id, url: installURL(`https://q.passkit.net/p-${card.id}`), source: 'verified-binding', issuedAt: new Date(now()).toISOString() } }, result: true };
    });
    return { enrollment: await snapshot(account) };
  }
  async function recordFor(account) { return own(await read(store, keyFor(account)), account); }
  async function snapshot(user) { const account = identity(user); return { ...enrollmentView(await recordFor(account), now(), timeoutMs), configured: enabled }; }
  async function finishEnrollment(account, claim, outcome) {
    await update(store, keyFor(account), previous => {
      own(previous, account);
      if (!previous || previous.enrollment?.claim !== claim) throw error('LOOPY_RECEIPT_CONFLICT');
      return { value: { ...previous, enrollment: { ...previous.enrollment, ...outcome } }, result: true };
    });
    return { enrollment: await snapshot(account) };
  }
  async function submit(user, input = {}) {
    const account = identity(user); requireEnabled();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'INVALID_REQUEST');
    const requestId = uuid(input.requestId), name = text(input.name, 120);
    if (input.acceptTerms !== true) throw new ApiError(400, 'LOOPY_TERMS_REQUIRED', 'اطّلعي على شروط البطاقة ووافقي عليها قبل المتابعة.');
    const current = await recordFor(account);
    if (current?.enrollment && (current.enrollment.status !== 'rejected' || current.enrollment.requestId === requestId)) return { enrollment: await snapshot(account) };
    const offer = await campaign({ fresh: true });
    if (input.campaignVersion !== offer.version) throw new ApiError(409, 'LOOPY_CAMPAIGN_CHANGED', 'تغيّرت شروط البطاقة. حدّثي الصفحة وراجعيها من جديد.');
    const claim = randomUUID(), startedAt = now();
    const won = await update(store, keyFor(account), previous => {
      own(previous, account);
      if (previous?.enrollment && (previous.enrollment.status !== 'rejected' || previous.enrollment.requestId === requestId)) return { write: false, result: false };
      return { value: { ...(previous || empty(account)), enrollment: { status: 'pending', phase: 'lookup', claim, requestId, startedAt, campaignVersion: offer.version, terms: offer.terms, acceptedTermsAt: new Date(startedAt).toISOString() } }, result: true };
    });
    if (!won) return { enrollment: await snapshot(account) };
    let card;
    try { card = await findCard(account); }
    catch (e) { return finishEnrollment(account, claim, { status: 'rejected', reason: e.code || 'LOOPY_LOOKUP_UNAVAILABLE' }); }
    if (card) {
      // The provider's official app environment defines passLinkURL as
      // https://q.passkit.net/p-. IDs remain private server-side.
      return finishEnrollment(account, claim, { status: 'issued', pid: card.id, url: installURL(`https://q.passkit.net/p-${card.id}`), source: 'existing', issuedAt: new Date(now()).toISOString() });
    }
    // A second acknowledged CAS marks the potentially irreversible boundary.
    // A lost store acknowledgement stops here, before sending any enrolment.
    await update(store, keyFor(account), previous => {
      own(previous, account); if (previous?.enrollment?.claim !== claim) throw error('LOOPY_RECEIPT_CONFLICT');
      return { value: { ...previous, enrollment: { ...previous.enrollment, phase: 'enrol' } }, result: true };
    });
    let outcome;
    try {
      const response = await request(`enrol/${campaignId}`, { method: 'POST', body: { campaignId, customerData: { [NAME_FIELD]: name, [EMAIL_FIELD]: account.email }, dataConsentOptIn: false } });
      if ([400, 401, 403, 404].includes(response.status)) outcome = { status: 'rejected', reason: response.status === 403 ? 'LOOPY_ACCESS_DENIED' : 'LOOPY_ENROLLMENT_REJECTED' };
      else {
        if (!response.ok || !validId(response.data?.pid)) throw error('LOOPY_INVALID_RECEIPT');
        outcome = { status: 'issued', pid: response.data.pid, url: installURL(response.data.url), source: 'new', issuedAt: new Date(now()).toISOString() };
      }
    } catch { outcome = { status: 'unknown', reason: 'LOOPY_ENROLLMENT_UNCONFIRMED' }; }
    return finishEnrollment(account, claim, outcome);
  }
  // Read-only reconciliation can adopt one exact-email match after an uncertain
  // enrolment, but cannot prove a missing response failed or authorize a retry.
  async function reconcile(user) {
    const account = identity(user); requireEnabled(); const current = await recordFor(account);
    if (!current?.enrollment || current.enrollment.status === 'issued') return { enrollment: await snapshot(account) };
    const card = await findCard(account);
    if (!card) return { enrollment: await snapshot(account) };
    return finishEnrollment(account, current.enrollment.claim, { status: 'issued', pid: card.id, url: installURL(`https://q.passkit.net/p-${card.id}`), source: 'reconciled', issuedAt: new Date(now()).toISOString() });
  }
  async function lookup(user) {
    const account = identity(user); requireEnabled(); const current = await recordFor(account);
    if (current?.enrollment && !['rejected', 'unknown'].includes(current.enrollment.status)) return { enrollment: await snapshot(account) };
    const card = await findCard(account);
    if (!card) return { enrollment: await snapshot(account) };
    await update(store, keyFor(account), previous => {
      own(previous, account);
      if (previous?.enrollment && !['rejected', 'unknown'].includes(previous.enrollment.status)) return { write: false, result: false };
      return { value: { ...(previous || empty(account)), enrollment: { status: 'issued', pid: card.id, url: installURL(`https://q.passkit.net/p-${card.id}`), source: 'existing', issuedAt: new Date(now()).toISOString() } }, result: true };
    });
    return { enrollment: await snapshot(account) };
  }
  // Internal server-to-server method. The booking ledger decides eligibility:
  // only a new admin arrival for a positive-priced PERSONAL visit emits
  // kind=stamp, stamps=1, before completion/payment. Booking
  // confirmation emits booking-message and never changes the stamp balance.
  async function reconcileDelivery(user, event = {}) {
    const account = identity(user); requireEnabled();
    const { kind, digest, intentKey } = deliveryInput(event), record = await recordFor(account), intent = record?.intents?.[intentKey];
    if (!intent) return { status: 'blocked', reason: 'LOOPY_DELIVERY_NOT_FOUND' };
    if (intent.digest !== digest || intent.kind !== kind) throw new ApiError(409, 'LOOPY_EVENT_CONFLICT');
    const unchanged = () => deliveryView(intent, now(), writeTimeoutMs);
    // Legacy writes have no unique provider evidence. Balances, timestamps,
    // and a shared API username alone never authorize adopting a receipt.
    if (kind !== 'stamp' || !['pending', 'unknown'].includes(intent.status) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(intent.claim || '') || intent.providerMarker !== `clinime-stamp/${intent.claim}` || !Number.isFinite(intent.startedAt)) return unchanged();
    const marker = intent.providerMarker, claim = intent.claim, pid = record.enrollment?.pid;
    if (record.enrollment?.status !== 'issued' || !validId(pid) || deadlineAt - Date.now() <= 2000 || Object.entries(record.intents).some(([key, other]) => key !== intentKey && other.providerMarker === marker)) return unchanged();
    let providerEvent;
    try {
      const response = await lookupRequest(`card/${pid}?includeEvents=true`, { authenticated: true, receiptRead: true });
      if (!response.ok) return unchanged();
      checkedCard(response.data?.card, pid, account);
      if (!Array.isArray(response.data?.events)) return unchanged();
      const matches = response.data.events.filter(entry => entry?.ua === marker);
      if (matches.length !== 1) return unchanged();
      const entry = matches[0], created = typeof entry.created === 'string' ? Date.parse(entry.created) : NaN;
      if (!Number.isSafeInteger(entry.id) || entry.id <= 0 || entry.card_id !== pid || entry.username !== config.username || entry.type !== 1 || entry.quantity !== 1 || !Number.isFinite(created) || created < intent.startedAt - 1000) return unchanged();
      providerEvent = entry;
    } catch { return unchanged(); }
    const result = await update(store, keyFor(account), previous => {
      own(previous, account); const current = previous?.intents?.[intentKey];
      if (!current || current.claim !== claim || current.providerMarker !== marker || current.digest !== digest || previous.enrollment?.status !== 'issued' || previous.enrollment.pid !== pid) throw error('LOOPY_RECEIPT_CONFLICT');
      if (current.status === 'delivered') return { write: false, result: current };
      if (!['pending', 'unknown'].includes(current.status) || Object.entries(previous.intents).some(([key, other]) => key !== intentKey && (other.providerMarker === marker || other.providerEventId === providerEvent.id))) return { write: false, result: current };
      const next = { ...current, status: 'delivered', deliveredAt: providerEvent.created, providerEventId: providerEvent.id, reconciledAt: new Date(now()).toISOString() };
      delete next.reason;
      return { value: { ...previous, intents: { ...previous.intents, [intentKey]: next } }, result: next };
    });
    return deliveryView(result, now(), writeTimeoutMs);
  }
  async function deliver(user, event = {}) {
    const account = identity(user); requireEnabled();
    const { kind, payload, digest, intentKey } = deliveryInput(event);
    // Existing wallet holders must be linked through authenticated exact-email
    // lookup. This never enrols a new card and needs no new terms consent.
    const linked = await recordFor(account);
    const claim = randomUUID(), providerMarker = kind === 'stamp' ? `clinime-stamp/${claim}` : undefined;
    const existing = linked?.intents?.[intentKey];
    if (existing) {
      if (existing.digest !== digest) throw new ApiError(409, 'LOOPY_EVENT_CONFLICT');
      return kind === 'stamp' && ['pending', 'unknown'].includes(existing.status) ? reconcileDelivery(account, event) : deliveryView(existing, now(), writeTimeoutMs);
    }
    if (!linked?.enrollment || linked.enrollment.status === 'rejected') await lookup(account);
    // A changed provider reward must not silently diverge from the clinic's
    // five-visit Basic Facial program. This is a read, before any new intent.
    if (kind === 'stamp' || kind === 'redeem') await campaign({ fresh: true });
    const decision = await update(store, keyFor(account), previous => {
      own(previous, account); const record = previous || empty(account), existing = record.intents?.[intentKey];
      if (existing) {
        if (existing.digest !== digest) throw new ApiError(409, 'LOOPY_EVENT_CONFLICT');
        return { write: false, result: { receipt: deliveryView(existing, now(), writeTimeoutMs) } };
      }
      if (record.enrollment?.status !== 'issued') return { write: false, result: { receipt: { status: 'blocked', reason: 'LOOPY_CARD_REQUIRED' } } };
      // Loopy may apply a stamp quickly but acknowledge only after Wallet push
      // work finishes. Reserve a full response window and durable-receipt time
      // before creating an intent; a late batch item remains safely pending.
      if (deadlineAt - Date.now() < writeTimeoutMs + 2000) return { write: false, result: { receipt: { status: 'blocked', reason: 'LOOPY_DELIVERY_BUDGET' } } };
      if (Object.values(record.intents || {}).some(i => {
        if (['stamp', 'redeem'].includes(i.kind)) return ['pending', 'unknown'].includes(i.status);
        // Push requests carry no stamp/reward mutation. They keep their own
        // no-replay receipt, independently of the serialized financial lane.
        return i.status === 'pending' && kind === 'booking-message';
      })) return { write: false, result: { receipt: { status: 'blocked', reason: 'LOOPY_PREVIOUS_UNCONFIRMED' } } };
      if (Object.keys(record.intents || {}).length >= 4096) throw error('LOOPY_HISTORY_LIMIT');
      const intent = { kind, digest, claim, status: 'pending', startedAt: now(), ...(providerMarker ? { providerMarker } : {}) };
      return { value: { ...record, intents: { ...record.intents, [intentKey]: intent } }, result: { pid: record.enrollment.pid, providerMarker } };
    });
    if (decision.receipt) return kind === 'stamp' && ['pending', 'unknown'].includes(decision.receipt.status) ? reconcileDelivery(account, event) : decision.receipt;
    const pid = decision.pid; if (!validId(pid)) throw error('LOOPY_INVALID_CARD');
    let outcome;
    try {
      const response = kind === 'stamp'
        ? await request(`card/cid/${pid}/addStamps/1`, { method: 'POST', authenticated: true, mutation: true, providerMarker: decision.providerMarker })
        : kind === 'redeem'
        ? await request(`card/cid/${pid}/redeemReward/1/1`, { method: 'POST', authenticated: true, mutation: true })
        : await request('card/push', { method: 'POST', authenticated: true, mutation: true, body: { cardID: pid, message: payload.message } });
      if ([400, 401, 403, 404].includes(response.status)) outcome = { status: 'rejected', reason: response.status === 403 ? 'LOOPY_ACCESS_DENIED' : 'LOOPY_WRITE_REJECTED' };
      else if (!response.ok || response.data?.success !== true) outcome = { status: 'unknown', reason: 'LOOPY_WRITE_UNCONFIRMED' };
      else outcome = { status: 'delivered', deliveredAt: new Date(now()).toISOString() };
    } catch { outcome = { status: 'unknown', reason: 'LOOPY_WRITE_UNCONFIRMED' }; }
    const saved = await update(store, keyFor(account), previous => {
      own(previous, account); const intent = previous?.intents?.[intentKey];
      if (intent?.claim !== claim) throw error('LOOPY_RECEIPT_CONFLICT');
      // A concurrent read may already have established the exact receipt.
      if (intent.status === 'delivered') return { write: false, result: intent };
      const next = { ...intent, ...outcome };
      return { value: { ...previous, intents: { ...previous.intents, [intentKey]: next } }, result: next };
    });
    return kind === 'stamp' && saved.status === 'unknown' ? reconcileDelivery(account, event) : deliveryView(saved);
  }
  return { campaign, read: snapshot, submit, reconcile, reconcileDelivery, lookup, linkExisting: lookup, bindExisting, deliver, configured: enabled };
}
