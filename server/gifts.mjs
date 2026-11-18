import { createHash } from 'node:crypto';
import { ApiError, mac, update } from './core.mjs';
import { giftEmail } from './email-templates.mjs';

// Rewards are operator configuration, never generated or accepted from the client.
export function configuredGift(raw) {
  try {
    const value = raw ? JSON.parse(raw) : { kind: 'thankyou', trigger: 'booking_confirmed' };
    if (!['thankyou', 'discount', 'benefit'].includes(value.kind) || !['booking_confirmed', 'payment_verified', 'manual', 'disabled'].includes(value.trigger)) return null;
    const gift = { kind: value.kind, trigger: value.trigger };
    for (const field of ['titleAr', 'titleEn', 'termsAr', 'termsEn']) {
      if (value[field] !== undefined) {
        if (typeof value[field] !== 'string' || value[field].length > 1200 || /[\u0000-\u001f\u007f]/.test(value[field])) return null;
        gift[field] = value[field].trim();
      }
    }
    if (value.kind === 'discount') {
      if (typeof value.code !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.code) || !gift.titleAr || !gift.titleEn) return null;
      gift.code = value.code;
    }
    if (value.kind === 'benefit' && (!gift.titleAr || !gift.titleEn)) return null;
    gift.version = createHash('sha256').update(JSON.stringify(gift)).digest('hex').slice(0, 16);
    return gift;
  } catch { return null; }
}

export function eligibleGift(booking) {
  const gift = booking?.gift;
  if (!gift || booking.status !== 'confirmed' || gift.trigger === 'disabled') return null;
  if (gift.trigger === 'payment_verified' && booking.payment?.status !== 'verified') return null;
  return gift;
}

export function createGiftMail({ store, mail, secret, origin, now }) {
  return async function sendGift(booking, ownerId) {
    const gift = eligibleGift(booking);
    if (!gift) throw new ApiError(409, 'GIFT_UNAVAILABLE', 'هذه الهدية غير متاحة لهذا الموعد.');
    const key = 'giftmail/' + mac(secret, ownerId + ':' + booking.id + ':' + gift.version);
    // Freeze the first email snapshot so retries cannot change provider payload.
    const message = giftEmail({ booking, gift, origin, locale: booking.locale });
    const record = await update(store, key, current => current ? { write: false, result: current } : { value: { message, startedAt: now(), status: 'pending' }, result: { message, startedAt: now(), status: 'pending' } });
    if (record.status === 'sent' || now() - record.startedAt >= 23 * 3600000) return { emailStatus: record.status };
    let result;
    try { result = await mail.send({ ...record.message, to: booking.contact.email, key }); } catch { result = { status: 'pending' }; }
    const saved = await update(store, key, current => ({ value: { ...current, status: current.status === 'sent' ? 'sent' : result.status }, result: current.status === 'sent' ? 'sent' : result.status }));
    return { emailStatus: saved };
  };
}
