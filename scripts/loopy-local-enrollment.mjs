// Local review adapter only. Never imported by production or bundled into dist.
// Public API contract: https://developer.loopyloyalty.com/loopyloyalty.swagger.json
// The provider has no documented idempotency key and this campaign does not
// enforce unique email addresses. A durable claim MUST precede each POST.
import { randomUUID } from 'node:crypto';
import { ApiError, canonical, email, hash, read, text, update, uuid } from '../server/core.mjs';

export const LOOPY_CAMPAIGN_ID = 'ns7PFhWeahPi5kVt67394';
const API = 'https://api.loopyloyalty.com/v1/';
const NAME_FIELD = 'الاسم', EMAIL_FIELD = 'البريد الإلكتروني';
// Current official app environment.js identifies q.passkit.net/p- as passLinkURL
// and loyalty.is as shortLinkURL. Keep exact hosts AND path shapes restricted.
const INSTALL_PATHS = { 'loyalty.is': /^\/[A-Za-z0-9_-]+\/?$/, 'q.passkit.net': /^\/p-[A-Za-z0-9_-]+\/?$/ };
const WAIT_MESSAGE = 'جاري إصدار بطاقتك. لا تعيدي إرسال الطلب؛ يمكنك تحديث الحالة هنا.';
const UNKNOWN_MESSAGE = 'ما قدرنا نتأكد من نتيجة إصدار البطاقة. لا تعيدي التسجيل حتى نراجع الطلب، حتى ما تصدر لكِ بطاقتان.';
const PROVIDER_ERROR = () => new ApiError(503, 'LOOPY_CAMPAIGN_UNAVAILABLE', 'تعذّر تحميل شروط البطاقة الآن. حاولي تحديث الصفحة لاحقًا.');

function identity(user) {
  if (!user || typeof user.id !== 'string' || !user.id || !user.email) throw new ApiError(401, 'AUTH_REQUIRED', 'سجّلي دخولك أولًا لإضافة بطاقتك.');
  return { id: text(user.id, 128), email: email(user.email) };
}
function keyFor(account) { return `local/loopy-enrollment/${LOOPY_CAMPAIGN_ID}/${hash(account.id)}`; }

function publicCampaign(raw) {
  if (!raw || raw.id !== LOOPY_CAMPAIGN_ID || typeof raw.terms !== 'string' || typeof raw.disableTerms !== 'boolean' || !Array.isArray(raw.fieldsToCollect)) throw PROVIDER_ERROR();
  // A changed campaign needs a reviewed form rather than dropping required data
  // or silently opting a member into marketing consent.
  const fields = raw.fieldsToCollect;
  if (fields.length !== 2 || !fields.some(f => f.name === NAME_FIELD && f.type === 'text' && f.required === true) || !fields.some(f => f.name === EMAIL_FIELD && f.type === 'email' && f.required === true) || raw.consentEnabled === true) throw new ApiError(503, 'LOOPY_FORM_CHANGED', 'تغيّرت متطلبات البطاقة. نحتاج نراجع النموذج قبل التسجيل.');
  const campaign = {
    id: raw.id,
    description: typeof raw.description === 'string' ? raw.description : 'بطاقة كلينيمي',
    business: { name: raw.business?.name || 'clinime', website: raw.business?.website || '' },
    design: { backgroundColor: raw.design?.backgroundColor || '#FCE8F0', textColor: raw.design?.textColor || '#2D3E5B' },
    terms: raw.terms,
    disableTerms: raw.disableTerms,
    fieldsToCollect: fields.map(({name, type, required}) => ({name, type, required})),
    consentEnabled: false,
    rewards: Array.isArray(raw.rewards) ? raw.rewards.map(r => ({ rewardName: r.rewardName, rewardText: r.rewardText, stampsRequired: r.stampsRequired })) : [],
  };
  return { ...campaign, version: hash(canonical(campaign)) };
}

function installURL(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('unsupported-provider-url'); }
  if (typeof value !== 'string' || value.length > 2048 || url.protocol !== 'https:' || !INSTALL_PATHS[url.hostname]?.test(url.pathname) || url.username || url.password || url.port || url.search || url.hash) throw Error('unsupported-provider-url');
  return url.href;
}

function visible(record, now) {
  if (!record) return { status: 'none' };
  if (record.status === 'issued') return { status: 'issued', url: record.url, issuedAt: record.issuedAt, message: 'بطاقتك جاهزة للإضافة إلى محفظة الجوال.' };
  if (record.status === 'rejected') return { status: 'none', errorCode: 'LOOPY_ENROLLMENT_REJECTED', message: 'لم تقبل خدمة البطاقة البيانات. راجعي اسمك وشروط التسجيل قبل المحاولة مجددًا.' };
  if (record.status === 'pending' && now - record.startedAt < 60_000) return { status: 'pending', message: WAIT_MESSAGE, requestId: record.requestId, retryAllowed: false };
  return { status: 'unknown', message: UNKNOWN_MESSAGE, recovery: 'contact-clinic', retryAllowed: false, requestId: record.requestId };
}

export function createLoopyEnrollment({ store, persist, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 12_000, cacheMs = 300_000 } = {}) {
  if (!store || typeof persist !== 'function' || typeof fetchImpl !== 'function') throw new TypeError('Local enrollment requires a store, durable persist hook and fetch implementation.');
  let cached, cacheAt = 0, loading, loadingFresh = false;
  async function request(url, options = {}) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(Error('provider-timeout')); }, timeoutMs); });
    const work = (async () => {
      const response = await fetchImpl(url, { ...options, redirect: 'error', signal: controller.signal });
      // The same timeout covers the body; receiving headers alone does not
      // establish a complete provider receipt.
      return { ok: response.ok, status: response.status, data: response.ok ? await response.json() : undefined };
    })();
    try { return await Promise.race([work, timeout]); }
    finally { clearTimeout(timer); }
  }
  async function campaign({ fresh = false } = {}) {
    if (!fresh && cached && now() - cacheAt < cacheMs) return structuredClone(cached);
    if (fresh && loading && !loadingFresh) {
      // A display GET that started before the submit may have fetched old terms.
      // Wait for it, then establish a fresh validation request for this submit.
      try { await loading; } catch { /* The fresh request has its own result. */ }
      return campaign({ fresh: true });
    }
    if (!loading) {
      loadingFresh = fresh;
      loading = (async () => {
      try {
        const response = await request(API + 'campaign/public/' + LOOPY_CAMPAIGN_ID, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw PROVIDER_ERROR();
        cached = publicCampaign(response.data); cacheAt = now();
        return cached;
      } catch (error) { cached = undefined; if (error instanceof ApiError) throw error; throw PROVIDER_ERROR(); }
      finally { loading = null; loadingFresh = false; }
      })();
    }
    return structuredClone(await loading);
  }
  async function snapshot(user) { return visible(await read(store, keyFor(identity(user))), now()); }
  async function submit(user, input = {}) {
    const account = identity(user), key = keyFor(account);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'INVALID_REQUEST', 'البيانات غير مكتملة أو غير صالحة.');
    const requestId = uuid(input.requestId), name = text(input.name, 120);
    if (input.acceptTerms !== true) throw new ApiError(400, 'LOOPY_TERMS_REQUIRED', 'اطّلعي على شروط البطاقة ووافقي عليها قبل المتابعة.');
    // Never trust an email supplied in the request body; the authenticated
    // Clinime account is the only source for the external member identity.
    const current = await read(store, key);
    if (current && current.status !== 'rejected') return { enrollment: visible(current, now()) };
    if (current?.requestId === requestId) return { enrollment: visible(current, now()) };
    // Display caching is useful, but accepting stale terms before an external
    // write is not. Revalidate the provider campaign for every NEW issuance.
    const offer = await campaign({ fresh: true });
    if (input.campaignVersion !== offer.version) throw new ApiError(409, 'LOOPY_CAMPAIGN_CHANGED', 'تغيّرت شروط البطاقة. حدّثي الصفحة وراجعي الشروط من جديد.');
    const claim = randomUUID(), startedAt = now();
    const won = await update(store, key, previous => {
      if (previous && (previous.status !== 'rejected' || previous.requestId === requestId)) return { write: false, result: false };
      return { value: { status: 'pending', userId: account.id, email: account.email, requestId, name, claim, startedAt, campaignVersion: offer.version, terms: offer.terms, acceptedTermsAt: new Date(startedAt).toISOString() }, result: true };
    });
    if (!won) return { enrollment: await snapshot(account) };
    // No provider write happens unless this claim is on disk. In particular,
    // saving at the END of the HTTP handler would leave a duplicate window.
    try { await persist(); }
    catch { throw new ApiError(503, 'LOOPY_STORE_UNAVAILABLE', 'تعذّر حفظ طلب البطاقة. لم نرسل طلب إصدار جديد.'); }
    let outcome;
    try {
      const response = await request(API + 'enrol/' + LOOPY_CAMPAIGN_ID, {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: LOOPY_CAMPAIGN_ID, customerData: { [NAME_FIELD]: name, [EMAIL_FIELD]: account.email } }),
      });
      if (response.status === 400) outcome = { status: 'rejected', rejectedAt: now() };
      else {
        if (!response.ok) throw Error('provider-unconfirmed');
        const receipt = response.data;
        if (typeof receipt.pid !== 'string' || !receipt.pid.trim() || receipt.pid.length > 512) throw Error('malformed-provider-receipt');
        outcome = { status: 'issued', pid: receipt.pid, url: installURL(receipt.url), issuedAt: new Date(now()).toISOString() };
      }
    } catch (error) {
      // A lost/invalid response is NOT proof of a failed issuance. Save the
      // uncertainty and prohibit further POSTs, including a fresh request ID.
      outcome = { status: 'unknown', reason: error.message === 'unsupported-provider-url' ? 'unsupported-provider-url' : 'unconfirmed-provider-response', uncertainAt: now() };
    }
    await update(store, key, previous => {
      if (!previous || previous.claim !== claim) throw new ApiError(503, 'LOOPY_RECEIPT_CONFLICT');
      return { value: { ...previous, ...outcome }, result: true };
    });
    try { await persist(); }
    catch { throw new ApiError(503, 'LOOPY_RECEIPT_UNSAVED', 'وصل رد خدمة البطاقة، لكن تعذّر حفظه. لا تعيدي التسجيل؛ حدّثي الحالة أو تواصلي معنا.'); }
    return { enrollment: await snapshot(account) };
  }
  return { campaign, read: snapshot, submit };
}
