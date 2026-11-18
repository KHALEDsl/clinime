import { safePricing } from './loyalty.mjs';
import { createHash, createHmac, randomBytes, timingSafeEqual, randomUUID, createCipheriv, createDecipheriv } from 'node:crypto';

export class ApiError extends Error { constructor(status, code, message = 'تعذّر إكمال الطلب. حاولي مرة أخرى.') { super(message); this.status = status; this.code = code; } }
export const invalid = () => new ApiError(400, 'INVALID_REQUEST', 'البيانات غير مكتملة أو غير صالحة.');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const mac = (secret, value) => createHmac('sha256', secret).update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export const equal = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string') return false; const left = Buffer.from(a), right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); };
export function canonical(value) { if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'; return JSON.stringify(value); }
export function uuid(value) { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw invalid(); return value.toLowerCase(); }
export function text(value, max = 100, optional = false) { if (optional && (value == null || value === '')) return ''; if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw invalid(); return value.trim(); }
export function email(value) { const result = text(value, 254).toLowerCase(); if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(result)) throw new ApiError(400, 'INVALID_EMAIL', 'أدخلي بريدًا إلكترونيًا صالحًا.'); return result; }
export function encrypt(secret, value) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv); const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]); return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64url')).join('.'); }
export function decrypt(secret, value) { const [iv, tag, data] = value.split('.').map(x => Buffer.from(x, 'base64url')); const cipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv); cipher.setAuthTag(tag); return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString()); }

// Store adapter is private and strongly consistent. Mutations are conditional,
// not read-then-write locks. A missing ETag fails closed (SDK/network ambiguity).
export async function update(store, key, change, attempts = 16) {
  for (let i = 0; i < attempts; i++) {
    const record = await store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
    if (record && !record.etag) throw new ApiError(503, 'STORE_UNAVAILABLE');
    const outcome = change(record?.data ?? null);
    if (outcome.write === false) return outcome.result;
    const value = { ...outcome.value, _version: randomUUID() };
    const result = await store.setJSON(key, value, record ? { onlyIfMatch: record.etag } : { onlyIfNew: true });
    if (result.modified) {
      if (!result.etag) throw new ApiError(503, 'STORE_UNAVAILABLE');
      return outcome.result;
    }
  }
  throw new ApiError(503, 'STORE_BUSY', 'الطلبات كثيرة الآن. أعيدي المحاولة بنفس الطلب.');
}
export async function read(store, key) { return (await store.getWithMetadata(key, { type: 'json', consistency: 'strong' }))?.data ?? null; }
export async function rate(store, key, id, { limit, window, gap = 0 }, now) {
  return update(store, 'rate/' + key, record => {
    const events = (record?.events || []).filter(x => x.at > now - window);
    if (events.some(x => x.id === id)) return { write: false, result: true };
    if (events.length >= limit || events.some(x => x.at > now - gap)) throw new ApiError(429, 'RATE_LIMITED', 'انتظري قليلًا قبل المحاولة مجددًا.');
    return { value: { events: [...events, { id, at: now }] }, result: true };
  });
}
export async function body(request, maxBytes = 16384) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new ApiError(415, 'INVALID_REQUEST');
  if (Number(request.headers.get('content-length')) > maxBytes) throw new ApiError(413, 'INVALID_REQUEST');
  const reader = request.body?.getReader(); if (!reader) throw invalid();
  const chunks = []; let length = 0;
  while (true) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > maxBytes) { await reader.cancel(); throw new ApiError(413, 'INVALID_REQUEST'); } chunks.push(Buffer.from(value)); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || Array.isArray(value) || typeof value !== 'object') throw invalid(); return value; } catch { throw invalid(); }
}
export const safeUser = user => ({ id: user.id, email: user.email, name: user.name });
export function safeBooking(booking) {
  const allowed=['id','gift','revision','status','date','time','professional','professionalNameAr','professionalNameEn','createdAt','updatedAt','cancelledAt','emailStatus'];
  const value=Object.fromEntries(allowed.filter(key=>Object.hasOwn(booking,key)).map(key=>[key,structuredClone(booking[key])]));
  value.items=(booking.items||[]).map(item=>Object.fromEntries(['serviceId','optionId','nameAr','nameEn','optionAr','optionEn','price','duration','image'].filter(key=>Object.hasOwn(item,key)).map(key=>[key,item[key]])));
  value.contact={name:booking.contact.name,email:booking.contact.email};
  value.attendee={kind:booking.attendee.kind,name:booking.attendee.name,relationship:booking.attendee.relationship||''};
  if(booking.pricing)value.pricing=safePricing(booking.pricing);
  if(booking.attendance)value.attendance={status:booking.attendance.status,arrivedAt:booking.attendance.arrivedAt};
  return value;
}
