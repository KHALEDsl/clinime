import { visitWallet, recordStamp, transferReward, quoteVisitBenefit, reserveVisitBenefit, releaseVisitBenefit, settleReferralCredit, consumeVisitReward } from './visit-rewards.mjs';
import { enqueueWalletEvent } from './wallet-events.mjs';
import { giftWalletMessage } from './wallet-copy.mjs';
import { ApiError, invalid, uuid, text, email, mac, canonical, update, read } from './core.mjs';

export const LOYALTY_LEDGER = 'clinic/booking-ledger-v1';
export const DEFAULT_LOYALTY_RULES = Object.freeze({
  welcomePoints: 200, pointsPerSar: 1, firstVisitPoints: 300, thirdVisitPoints: 500,
  referralPercent: 5, referralCap: 75, referrerPoints: 500, pointExpiryMonths: 12, couponExpiryDays: 90,
  eligibleServiceIds: [], rewards: [
    { id: 'reward-5', points: 5000, percent: 5, cap: 75 },
    { id: 'reward-10', points: 12000, percent: 10, cap: 150 },
    { id: 'reward-15', points: 20000, percent: 15, cap: 200 },
  ],
});
const own = (object, key) => Object.hasOwn(object, key) ? object[key] : null;
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message, status = 409) => { throw new ApiError(status, code, message); };
const integer = (value, min, max) => { if (!Number.isSafeInteger(value) || value < min || value > max) throw invalid(); return value; };
const cents = value => Math.round(value * 100);
const iso = now => new Date(now).toISOString();
const emptyLedger = () => ({ schema: 1, bookings: {}, requests: {} });
const stateOf = ledger => ledger?.loyalty || null;
function state(ledger, now) {
  return ledger.loyalty ||= { schema: 1, revision: 0, initializedAt: iso(now), rules: structuredClone(DEFAULT_LOYALTY_RULES), customers: {}, coupons: {}, referrals: {}, entries: [], requests: {}, audit: [] };
}
export function validateLoyaltyRules(value) {
  if (!isObject(value)) throw invalid();
  const result = {};
  for (const key of ['welcomePoints', 'firstVisitPoints', 'thirdVisitPoints', 'referrerPoints']) result[key] = integer(value[key], 0, 1000000);
  result.pointsPerSar = integer(value.pointsPerSar, 0, 1000);
  result.referralPercent = integer(value.referralPercent, 1, 100);
  if (typeof value.referralCap !== 'number' || !Number.isFinite(value.referralCap) || value.referralCap <= 0 || value.referralCap > 100000 || Math.abs(value.referralCap * 100 - cents(value.referralCap)) > .000001) throw invalid();
  result.referralCap = value.referralCap;
  result.pointExpiryMonths = integer(value.pointExpiryMonths, 1, 60);
  result.couponExpiryDays = integer(value.couponExpiryDays, 1, 730);
  if (!Array.isArray(value.eligibleServiceIds) || value.eligibleServiceIds.length > 100 || value.eligibleServiceIds.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id))) throw invalid();
  result.eligibleServiceIds = [...new Set(value.eligibleServiceIds)];
  if (!Array.isArray(value.rewards) || !value.rewards.length || value.rewards.length > 10) throw invalid();
  const seen = new Set();
  result.rewards = value.rewards.map(reward => {
    if (!isObject(reward) || typeof reward.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(reward.id) || seen.has(reward.id)) throw invalid();
    seen.add(reward.id);
    if (typeof reward.cap !== 'number' || !Number.isFinite(reward.cap) || reward.cap <= 0 || reward.cap > 100000 || Math.abs(reward.cap * 100 - cents(reward.cap)) > .000001) throw invalid();
    return { id: reward.id, points: integer(reward.points, 1, 10000000), percent: integer(reward.percent, 1, 100), cap: reward.cap };
  });
  return result;
}
// UTC calendar-month arithmetic clips month ends rather than turning Feb 28
// into a March expiry. Every credit freezes its expiry when it is awarded.
export function pointExpiry(now, months) {
  const date = new Date(now), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last)); return date.toISOString();
}
function customer(s, user, secret, now) {
  let record = own(s.customers, user.id);
  if (!record) {
    record = { userId: user.id, name: user.name || '', email: user.email || '', referralCode: 'REF-' + mac(secret, 'referral:' + user.id).slice(0, 12).toUpperCase(), enrolledAt: iso(now), verifiedEmailAt: null, welcomed: false, paidVisitCount: 0, settledBookingIds: [] };
    s.customers[user.id] = record;
  }
  return record;
}
function append(s, value) { if (s.entries.some(entry => entry.id === value.id)) return false; s.entries.push(value); return true; }
function credit(s, userId, type, points, id, now, extra = {}) {
  if (points <= 0) return;
  append(s, { id, userId, type, points, status: 'earned', createdAt: iso(now), expiresAt: pointExpiry(now, s.rules.pointExpiryMonths), ...extra });
}
function debitedPoints(s) {
  const debited = new Map();
  for (const entry of s?.entries || []) for (const allocation of entry.allocations || []) debited.set(allocation.entryId, (debited.get(allocation.entryId) || 0) + allocation.points);
  return debited;
}
function lots(s, userId, now) {
  const debited = debitedPoints(s);
  return (s?.entries || []).filter(entry => entry.userId === userId && entry.points > 0 && entry.status !== 'pending').map(entry => ({ entry, remaining: entry.points - (debited.get(entry.id) || 0) })).filter(lot => lot.remaining > 0 && Date.parse(lot.entry.expiresAt) > now).sort((a, b) => a.entry.expiresAt.localeCompare(b.entry.expiresAt) || a.entry.createdAt.localeCompare(b.entry.createdAt) || a.entry.id.localeCompare(b.entry.id));
}
function balance(s, userId, now) { return lots(s, userId, now).reduce((sum, lot) => sum + lot.remaining, 0); }
function debit(s, userId, amount, id, type, now, extra = {}) {
  let remaining = amount;
  const allocations = [];
  for (const lot of lots(s, userId, now)) { const points = Math.min(remaining, lot.remaining); if (points) allocations.push({ entryId: lot.entry.id, points }); remaining -= points; if (!remaining) break; }
  if (remaining) fail('INSUFFICIENT_POINTS', 'رصيد النقاط المتاح غير كافٍ. حدّثي المحفظة.');
  append(s, { id, userId, type, points: -amount, status: 'spent', createdAt: iso(now), expiresAt: null, allocations, ...extra });
}
function couponView(coupon, now) {
  return { id: coupon.id, code: coupon.code, percent: coupon.percent, cap: coupon.cap, points: coupon.points, status: coupon.status === 'used' ? 'used' : Date.parse(coupon.expiresAt) <= now ? 'expired' : 'available', createdAt: coupon.createdAt, expiresAt: coupon.expiresAt, eligibleServiceIds: structuredClone(coupon.eligibleServiceIds), singleUse: true, stackable: false };
}
function entryView(s, entry, now, administrative = false, debited = debitedPoints(s)) {
  let status = entry.status;
  const referral = entry.referralId && s.referrals[entry.referralId];
  if (status === 'pending') status = referral?.status === 'pending' ? 'pending' : referral?.status === 'earned' ? 'confirmed' : referral?.status === 'disqualified' ? 'disqualified' : 'cancelled';
  else if (entry.points > 0 && (debited.get(entry.id) || 0) >= entry.points) status = 'spent';
  else if (entry.points > 0 && Date.parse(entry.expiresAt) <= now) status = 'expired';
  const value = { id: entry.id, type: entry.type, points: entry.points, status, createdAt: entry.createdAt, expiresAt: entry.expiresAt, ...(entry.reason ? { description: entry.reason } : {}), ...(referral?.reason ? { reason: referral.reason } : {}) };
  if (administrative) Object.assign(value, { userId: entry.userId, ...(entry.actorId ? { actorId: entry.actorId } : {}) });
  return value;
}
export function walletSnapshot(ledger, userId, now) {
  const s = stateOf(ledger), rules = s?.rules || DEFAULT_LOYALTY_RULES, available = balance(s, userId, now), record = s && own(s.customers, userId), debited = debitedPoints(s);
  const pendingPoints = Object.values(s?.referrals || {}).filter(referral => referral.referrerId === userId && referral.status === 'pending').reduce((sum, referral) => sum + referral.referrerPoints, 0);
  return { ...visitWallet(ledger, userId), revision: s?.revision || 0, balance: available, pendingPoints, referralCode: record?.referralCode || '', rewards: rules.rewards.map(reward => ({ ...reward, eligible: available >= reward.points, remainingPoints: Math.max(0, reward.points - available) })), coupons: Object.values(s?.coupons || {}).filter(coupon => coupon.userId === userId).map(coupon => couponView(coupon, now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), entries: (s?.entries || []).filter(entry => entry.userId === userId).map(entry => entryView(s, entry, now, false, debited)).reverse(), rules: structuredClone(rules), paidVisitCount: record?.paidVisitCount || 0, asOf: iso(now), terms: { singleUse: true, stackable: false, earningRequires: 'completed-and-fully-paid', pointExpiry: 'calendar-months', referralRequires: 'first-eligible-booking', couponExpiryDays: rules.couponExpiryDays } };
}
export function safePricing(pricing) {
  if (!pricing) return null;
  return Object.fromEntries(['subtotal', 'eligibleSubtotal', 'discount', 'total', 'code', 'kind', 'percent', 'cap'].filter(key => Object.hasOwn(pricing, key)).map(key => [key, pricing[key]]));
}
function promotionCode(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || value.length > 64 || !/^[A-Z0-9-]+$/i.test(value.trim())) fail('PROMOTION_INVALID', 'أدخلي رمز خصم واحدًا صالحًا.', 400);
  return value.trim().toUpperCase();
}
function eligibleSubtotal(items, eligibleIds) { return items.reduce((sum, item) => sum + (!eligibleIds.length || eligibleIds.includes(item.serviceId) ? cents(item.price) : 0), 0); }
// Allocate the frozen booking discount proportionally across its original
// discount-eligible lines. Later earning rules can intersect these allocations
// without moving a discount onto a different service or a session addition.
function allocateDiscount(items, eligibleIds, discount) {
  if (!discount) return [];
  const gross = eligibleSubtotal(items, eligibleIds);
  if (!gross) return [];
  const allocations = items.map((item, itemIndex) => ({ itemIndex, price: !eligibleIds.length || eligibleIds.includes(item.serviceId) ? cents(item.price) : 0 })).filter(line => line.price > 0).map(line => ({ itemIndex: line.itemIndex, discountCents: Math.floor(discount * line.price / gross), remainder: discount * line.price % gross }));
  let remaining = discount - allocations.reduce((sum, line) => sum + line.discountCents, 0);
  for (const line of [...allocations].sort((a, b) => b.remainder - a.remainder || a.itemIndex - b.itemIndex)) if (remaining > 0) { line.discountCents += 1; remaining -= 1; }
  return allocations.map(({ itemIndex, discountCents }) => ({ itemIndex, discountCents }));
}
function eligiblePaidCents(ledger, booking, eligibleIds) {
  const gross = eligibleSubtotal([...booking.items, ...(booking._staff?.additions || [])], eligibleIds);
  let allocations = booking._loyalty?.discountAllocations;
  if (!allocations) {
    // Compatibility for bookings predating allocation snapshots. Issued coupon
    // eligibility is already frozen; historical unpromoted bookings owe no cut.
    const coupon = booking._loyalty?.couponId && ledger.loyalty?.coupons[booking._loyalty.couponId];
    const ids = coupon?.eligibleServiceIds || booking._loyalty?.discountEligibleServiceIds || [];
    allocations = allocateDiscount(booking.items, ids, cents(booking.pricing?.discount || 0));
  }
  const matchingDiscount = allocations.reduce((sum, line) => { const item = booking.items[line.itemIndex]; return sum + (item && (!eligibleIds.length || eligibleIds.includes(item.serviceId)) ? line.discountCents : 0); }, 0);
  return Math.max(0, Math.min(cents(bookingPayable(booking)), gross - matchingDiscount));
}
function countsAsEligible(ledger, booking, eligibleIds) {
  return booking._loyalty?.settlement ? booking._loyalty.settlement.countsAsEligibleVisit : eligiblePaidCents(ledger, booking, eligibleIds) > 0;
}
function completedPaid(ledger, booking) {
  const total = cents(bookingPayable(booking));
  return booking.status === 'confirmed' && booking._staff?.stage === 'closed' && Boolean(booking._staff.finishedAt) && total > 0 && (ledger.staff?.receipts || []).filter(receipt => receipt.bookingId === booking.id).reduce((sum, receipt) => sum + cents(receipt.amount), 0) === total;
}
export function quotePromotion(ledger, userId, items, codeInput, now) {
  const code = promotionCode(codeInput), s = stateOf(ledger), rules = s?.rules || DEFAULT_LOYALTY_RULES;
  const subtotal = items.reduce((sum, item) => sum + cents(item.price), 0);
  const base = { subtotal: subtotal / 100, eligibleSubtotal: eligibleSubtotal(items, rules.eligibleServiceIds) / 100, discount: 0, total: subtotal / 100, code, kind: null, percent: 0, cap: 0 };
  if (!code) return { pricing: base };
  if (ledger?.visitProgram) {
    const quote = quoteVisitBenefit(ledger.visitProgram, userId, items, base);
    if (quote) return quote;
  }
  const coupon = Object.values(s?.coupons || {}).find(candidate => candidate.code === code && candidate.userId === userId);
  let percent, cap, eligibleIds, kind, referral;
  if (coupon) {
    if (coupon.status === 'used') fail('PROMOTION_USED', 'استُخدم هذا الرمز في حجز آخر.');
    if (Date.parse(coupon.expiresAt) <= now) fail('PROMOTION_EXPIRED', 'انتهت صلاحية رمز الخصم.');
    ({ percent, cap, eligibleServiceIds: eligibleIds } = coupon); kind = 'coupon';
  } else {
    const referrer = Object.values(s?.customers || {}).find(candidate => candidate.referralCode === code && candidate.verifiedEmailAt);
    if (!referrer) fail('PROMOTION_INVALID', 'رمز الخصم غير صالح أو غير متاح لحسابك.', 400);
    if (referrer.userId === userId) fail('SELF_REFERRAL', 'لا يمكنك استخدام رمز دعوتك على حسابك.');
    if (Object.values(ledger?.bookings || {}).some(booking => booking.ownerId === userId && booking.status !== 'cancelled' && (!ledger.visitProgram || (booking.attendee?.kind !== 'other' && completedPaid(ledger, booking))) && countsAsEligible(ledger, booking, rules.eligibleServiceIds)) || Object.values(s.referrals).some(record => record.referredId === userId && record.status !== 'cancelled')) fail('REFERRAL_INELIGIBLE', 'رمز الدعوة متاح لأول حجز مؤهل فقط.');
    if (ledger.visitProgram) return { pricing: { ...base, kind: 'referral' }, referrer, eligibleServiceIds: [] };
    percent = rules.referralPercent; cap = rules.referralCap; eligibleIds = rules.eligibleServiceIds; kind = 'referral'; referral = referrer;
  }
  const eligible = eligibleSubtotal(items, eligibleIds);
  if (eligible <= 0) fail('PROMOTION_NOT_ELIGIBLE', 'الخدمات المختارة غير مؤهلة لهذا الخصم.');
  const discount = Math.min(eligible, Math.floor(eligible * percent / 100), cents(cap));
  if (discount <= 0) fail('PROMOTION_NOT_ELIGIBLE', 'الخدمات المختارة غير مؤهلة لهذا الخصم.');
  return { pricing: { ...base, eligibleSubtotal: eligible / 100, discount: discount / 100, total: (subtotal - discount) / 100, kind, percent, cap }, coupon, referrer: referral, eligibleServiceIds: structuredClone(eligibleIds) };
}
// Called within the booking ledger CAS: quoting, consuming a coupon and reserving
// a referral cannot race with another booking or reward redemption.
export function applyBookingPromotion(ledger, booking, owner, code, secret, now) {
  let quote;
  const walletSpend = Boolean(ledger.visitProgram && code === 'WALLET');
  const quoteChanged = () => new ApiError(409, 'WALLET_QUOTE_CHANGED', 'تغيّر رصيد الإحالات. أعيدي تطبيق الرصيد وراجعي الإجمالي قبل تأكيد الحجز.');
  try {
    quote = quotePromotion(ledger, owner.id, booking.items, code, now);
  } catch (error) {
    if (walletSpend && error.code === 'WALLET_EMPTY') throw quoteChanged();
    throw error;
  }
  if (walletSpend) {
    const expected = booking.expectedWalletPricing;
    if (!expected || cents(expected.discount) !== cents(quote.pricing.discount) || cents(expected.total) !== cents(quote.pricing.total)) throw quoteChanged();
  }
  const s = state(ledger, now);
  if (ledger.visitProgram && booking.attendee?.kind === 'other' && ['referral', 'facial'].includes(quote.pricing.kind)) {
    fail('PERSONAL_VISIT_REQUIRED', quote.reward ? 'لاستخدام الجلسة لشخص آخر، أهديها لبريده من محفظتك أولًا.' : 'رمز الإحالة مخصص لأول زيارة لصاحبة الحساب نفسها.');
  }
  customer(s, owner, secret, now);
  booking.pricing = quote.pricing;
  booking._loyalty = { discountEligibleServiceIds: quote.eligibleServiceIds || [], discountAllocations: allocateDiscount(booking.items, quote.eligibleServiceIds || [], cents(quote.pricing.discount)) };
  if (ledger.visitProgram) reserveVisitBenefit(ledger.visitProgram, booking, quote, now);
  if (quote.coupon) {
    quote.coupon.status = 'used'; quote.coupon.bookingId = booking.id; quote.coupon.usedAt = iso(now);
    booking._loyalty.couponId = quote.coupon.id;
    s.audit.push({ action: 'coupon-used', bookingId: booking.id, couponId: quote.coupon.id, userId: owner.id, at: iso(now) });
  } else if (quote.referrer) {
    const id = 'RF-' + mac(secret, 'referral-booking:' + booking.id).slice(0, 24).toUpperCase();
    const referral = { id, bookingId: booking.id, referrerId: quote.referrer.userId, referredId: owner.id, status: 'pending', referrerPoints: ledger.visitProgram ? 0 : s.rules.referrerPoints, ...(ledger.visitProgram ? {program: 'visits', amountSar: ledger.visitProgram.referralCreditSar} : {}), percent: quote.pricing.percent, cap: quote.pricing.cap, createdAt: iso(now) };
    s.referrals[id] = referral; booking._loyalty.referralId = id;
    append(s, { id: id + ':pending', userId: referral.referrerId, type: 'referral-pending', points: referral.referrerPoints, status: 'pending', createdAt: iso(now), expiresAt: null, referralId: id });
    s.audit.push({ action: 'referral-reserved', bookingId: booking.id, referralId: id, userId: owner.id, at: iso(now) });
  }
  s.revision += 1;
}
export function releaseBookingPromotion(ledger, booking, now) {
  const s = stateOf(ledger), link = booking._loyalty;
  if (!s || !link || booking._staff?.stage === 'closed') return;
  if (ledger.visitProgram) releaseVisitBenefit(ledger.visitProgram, booking, now);
  const coupon = link.couponId && own(s.coupons, link.couponId);
  if (coupon?.bookingId === booking.id && coupon.status === 'used') { coupon.status = 'available'; delete coupon.bookingId; delete coupon.usedAt; s.audit.push({ action: 'coupon-released', bookingId: booking.id, couponId: coupon.id, userId: booking.ownerId, at: iso(now) }); }
  const referral = link.referralId && own(s.referrals, link.referralId);
  if (referral?.bookingId === booking.id && referral.status === 'pending') { referral.status = 'cancelled'; referral.cancelledAt = iso(now); s.audit.push({ action: 'referral-cancelled', bookingId: booking.id, referralId: referral.id, userId: booking.ownerId, at: iso(now) }); }
  s.revision += 1;
}
export function bookingPayable(booking) {
  const initial = booking.pricing ? cents(booking.pricing.total) : booking.items.reduce((sum, item) => sum + cents(item.price), 0);
  return (initial + (booking._staff?.additions || []).reduce((sum, item) => sum + cents(item.price), 0)) / 100;
}
export function bookingPaymentTotals(booking, receipts = []) {
  const total = cents(bookingPayable(booking));
  const paid = receipts.reduce((sum, receipt) => receipt.bookingId === booking.id ? sum + cents(receipt.amount) : sum, 0);
  return { total: total / 100, paid: paid / 100, balance: (total - paid) / 100 };
}
// Only a newly accepted admin arrival calls this, inside the same ledger CAS.
// Replayed/historical attendance is never scanned for retroactive grants.
export function awardArrivalVisit(ledger, booking, secret, now) {
  const stamped = recordStamp(ledger, booking, secret, now);
  if (stamped) enqueueWalletEvent(ledger, { id: `stamp:${booking.id}`, kind: 'stamp', userId: booking.ownerId, ...(booking.contact?.email ? { email: booking.contact.email } : {}), stamps: 1 }, now);
}

// This hook is invoked only on the actual staff transition into closed, in the
// same CAS as the final receipt. A saved reservation or session-finish is not a
// paid visit. No read path scans history to grant retroactive credit.
export function awardCompletedVisit(ledger, booking, secret, now) {
  const consumed = consumeVisitReward(ledger, booking, now);
  if (consumed) {
    const earner = ledger.loyalty?.customers?.[consumed.earnerId];
    enqueueWalletEvent(ledger, { id: `redeem:${consumed.id}`, kind: 'redeem', userId: consumed.earnerId, ...(earner?.email ? { email: earner.email } : consumed.earnerId === booking.ownerId && booking.contact?.email ? { email: booking.contact.email } : {}), rewardType: 1, rewards: 1 }, now);
  }
  if (!completedPaid(ledger, booking)) return;
  const s = state(ledger, now), record = customer(s, { id: booking.ownerId, name: booking.contact.name, email: booking.contact.email }, secret, now);
  if (record.settledBookingIds.includes(booking.id)) return;
  // Even an ineligible paid closure is settled once, so later rule edits or
  // retries cannot retroactively award it.
  record.settledBookingIds.push(booking.id);
  const eligiblePaid = eligiblePaidCents(ledger, booking, s.rules.eligibleServiceIds);
  booking._loyalty ||= {};
  booking._loyalty.settlement = { at: iso(now), eligiblePaidCents: eligiblePaid, countsAsEligibleVisit: eligiblePaid > 0 };
  // Existing settled visits retain their eligibility decision. Pre-feature
  // history is counted under current earning eligibility, without retrocredit.
  record.paidVisitCount = Object.values(ledger.bookings).filter(other => other.ownerId === booking.ownerId && (!ledger.visitProgram || other.attendee?.kind !== 'other') && completedPaid(ledger, other) && countsAsEligible(ledger, other, s.rules.eligibleServiceIds)).length;
  const points = ledger.visitProgram ? 0 : Math.floor(eligiblePaid * s.rules.pointsPerSar / 100);
  if (eligiblePaid > 0) {
    if (!ledger.visitProgram) credit(s, booking.ownerId, 'purchase', points, booking.id + ':purchase', now);
    if (!ledger.visitProgram && record.paidVisitCount === 1) credit(s, booking.ownerId, 'first-visit', s.rules.firstVisitPoints, booking.ownerId + ':first-visit', now);
    if (!ledger.visitProgram && record.paidVisitCount === 3) credit(s, booking.ownerId, 'third-visit', s.rules.thirdVisitPoints, booking.ownerId + ':third-visit', now);
    // A reservation is not the first completed paid visit. If another eligible
    // visit settles first, close all its outstanding referral promises now.
    for (const referral of Object.values(s.referrals)) if (referral.referredId === booking.ownerId && referral.status === 'pending' && (referral.program !== 'visits' || booking.attendee?.kind !== 'other')) {
      if (referral.bookingId === booking.id && record.paidVisitCount === 1) {
        referral.status = 'earned'; referral.completedAt = iso(now);
        if (referral.program === 'visits') settleReferralCredit(ledger.visitProgram, referral, now);
        else credit(s, referral.referrerId, 'referral', referral.referrerPoints, referral.id + ':earned', now);
      } else {
        referral.status = 'disqualified'; referral.reason = 'another-eligible-visit-completed-first'; referral.closedAt = iso(now);
        s.audit.push({ action: 'referral-disqualified', referralId: referral.id, bookingId: referral.bookingId, userId: booking.ownerId, reason: referral.reason, at: iso(now) });
      }
    }
  }
  s.audit.push({ action: 'paid-visit-awarded', bookingId: booking.id, userId: booking.ownerId, at: iso(now), points, paidVisitCount: record.paidVisitCount, eligiblePaidCents: eligiblePaid });
  s.revision += 1;
}

function capacity(ledger) {
  const s = stateOf(ledger);
  if (s && (Object.keys(s.customers).length > 5000 || s.entries.length > 30000 || Object.keys(s.requests).length > 20000 || Object.keys(s.coupons).length > 10000 || s.audit.length > 30000) || Buffer.byteLength(JSON.stringify(ledger)) > 8 * 1024 * 1024) throw new ApiError(503, 'LOYALTY_CAPACITY', 'برنامج المكافآت غير متاح مؤقتًا.');
}
export function createLoyalty({ store, secret, now, resolveItems }) {
  async function wallet(user) {
    const ledger = await read(store, LOYALTY_LEDGER), existing = stateOf(ledger)?.customers[user.id];
    // The API only calls this with a genuine verified-email server session.
    // Once enrolled, wallet polling is read-only, including point expiry.
    if (existing?.verifiedEmailAt && existing.welcomed) return walletSnapshot(ledger, user.id, now());
    return update(store, LOYALTY_LEDGER, current => {
      const value = current || emptyLedger(), s = state(value, now()), record = customer(s, user, secret, now());
      if (record.verifiedEmailAt && record.welcomed) return { write: false, result: walletSnapshot(value, user.id, now()) };
      record.verifiedEmailAt ||= iso(now()); record.name = user.name || record.name; record.email = user.email;
      if (!record.welcomed) { record.welcomed = true; if (!value.visitProgram) credit(s, user.id, 'welcome', s.rules.welcomePoints, user.id + ':welcome', now()); }
      s.revision += 1; capacity(value);
      return { value, result: walletSnapshot(value, user.id, now()) };
    });
  }
  async function quote(user, input) {
    if (!isObject(input)) throw invalid();
    const ledger = await read(store, LOYALTY_LEDGER) || emptyLedger(), items = resolveItems(input.items, ledger);
    return safePricing(quotePromotion(ledger, user.id, items, input.code, now()).pricing);
  }
  async function redeem(user, input) {
    if (!isObject(input)) throw invalid();
    const requestId = uuid(input.requestId), revision = integer(input.revision, 0, Number.MAX_SAFE_INTEGER), rewardId = text(input.rewardId, 40), fingerprint = mac(secret, canonical({ revision, rewardId })), requestKey = 'redeem:' + user.id + ':' + requestId;
    return update(store, LOYALTY_LEDGER, current => {
      const ledger = current || emptyLedger(), s = state(ledger, now()), replay = own(s.requests, requestKey);
      if (replay) { if (replay.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'تغيّر محتوى الطلب. أعيدي المحاولة بالطلب الأصلي.'); return { write: false, result: { wallet: walletSnapshot(ledger, user.id, now()), coupon: couponView(s.coupons[replay.couponId], now()) } }; }
      if (revision !== s.revision) fail('LOYALTY_CONFLICT', 'تغيّر رصيد المحفظة. حدّثيها قبل المتابعة.');
      const reward = s.rules.rewards.find(value => value.id === rewardId);
      if (!reward) throw invalid();
      if (!own(s.customers, user.id)?.verifiedEmailAt) fail('LOYALTY_ENROLL_REQUIRED', 'افتحي محفظة المكافآت أولًا.');
      const id = 'CP-' + mac(secret, requestKey).slice(0, 24).toUpperCase();
      debit(s, user.id, reward.points, id + ':redeem', 'redeem', now());
      const coupon = { id, userId: user.id, code: 'CLM-' + mac(secret, 'coupon:' + requestKey).slice(0, 16).toUpperCase(), points: reward.points, percent: reward.percent, cap: reward.cap, eligibleServiceIds: structuredClone(s.rules.eligibleServiceIds), createdAt: iso(now()), expiresAt: iso(now() + s.rules.couponExpiryDays * 86400000), status: 'available' };
      s.coupons[id] = coupon; s.requests[requestKey] = { fingerprint, couponId: id, at: iso(now()) }; s.revision += 1;
      s.audit.push({ action: 'redeem', userId: user.id, couponId: id, points: -reward.points, requestId, at: iso(now()) }); capacity(ledger);
      return { value: ledger, result: { wallet: walletSnapshot(ledger, user.id, now()), coupon: couponView(coupon, now()) } };
    });
  }
  function adminProject(ledger) {
    const s = stateOf(ledger), rules = s?.rules || DEFAULT_LOYALTY_RULES, debited = debitedPoints(s), known = new Map(Object.values(s?.customers || {}).map(record => [record.userId, record]));
    for (const booking of Object.values(ledger?.bookings || {})) if (!known.has(booking.ownerId)) known.set(booking.ownerId, { userId: booking.ownerId, name: booking.contact.name, email: booking.contact.email });
    return { referralCreditSar: ledger?.visitProgram?.referralCreditSar ?? null, revision: s?.revision || 0, rules: structuredClone(rules), rewards: structuredClone(rules.rewards), customers: [...known.values()].map(record => { const wallet = walletSnapshot(ledger, record.userId, now()); return { ...visitWallet(ledger, record.userId), userId: record.userId, name: record.name || '', email: record.email || '', balance: wallet.balance, pendingPoints: wallet.pendingPoints, referralCode: record.referralCode || '', verifiedEmail: Boolean(record.verifiedEmailAt), paidVisitCount: record.paidVisitCount || 0, coupons: wallet.coupons }; }), referrals: Object.values(s?.referrals || {}).map(record => ({ id: record.id, bookingId: record.bookingId, referrerId: record.referrerId, referredId: record.referredId, status: record.status, amountSar: record.amountSar ?? null, points: record.referrerPoints, percent: record.percent, cap: record.cap, createdAt: record.createdAt, ...(record.completedAt ? { completedAt: record.completedAt } : {}), ...(record.cancelledAt ? { cancelledAt: record.cancelledAt } : {}), ...(record.reason ? { reason: record.reason } : {}), ...(record.closedAt ? { closedAt: record.closedAt } : {}) })), entries: (s?.entries || []).map(entry => entryView(s, entry, now(), true, debited)).reverse(), audit: (s?.audit || []).map(entry => structuredClone(entry)).reverse(), asOf: iso(now()) };
  }
  async function adminSnapshot() { return adminProject(await read(store, LOYALTY_LEDGER)); }
  async function adminMutate(actor, input) {
    if (!isObject(input) || !['adjust', 'rules-save', 'referral-credit-save'].includes(input.action)) throw invalid();
    const requestId = uuid(input.requestId), revision = integer(input.revision, 0, Number.MAX_SAFE_INTEGER), requestKey = 'admin:' + actor.id + ':' + requestId;
    const normalized = { revision, action: input.action };
    if (input.action === 'adjust') { normalized.userId = text(input.userId, 128); normalized.points = integer(input.points, -1000000, 1000000); if (!normalized.points) throw invalid(); normalized.reason = text(input.reason, 500); }
    else if (input.action === 'referral-credit-save') {
      const amount = input.amountSar;
      if (amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 10000 || Math.abs(amount * 100 - cents(amount)) > 0.000001)) throw invalid();
      normalized.amountSar = amount;
    } else normalized.rules = validateLoyaltyRules(input.rules);
    const fingerprint = mac(secret, canonical(normalized));
    return update(store, LOYALTY_LEDGER, current => {
      const ledger = current || emptyLedger(), s = state(ledger, now()), replay = own(s.requests, requestKey);
      if (replay) { if (replay.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'تغيّر محتوى الطلب. أعيدي المحاولة بالطلب الأصلي.'); return { write: false, result: adminProject(ledger) }; }
      if (revision !== s.revision) fail('LOYALTY_CONFLICT', 'تغيّرت بيانات المكافآت. حدّثيها قبل الحفظ.');
      if (normalized.action === 'referral-credit-save') {
        if (!ledger.visitProgram) throw invalid();
        ledger.visitProgram.referralCreditSar = normalized.amountSar;
      } else if (normalized.action === 'rules-save') s.rules = normalized.rules;
      else {
        if (!own(s.customers, normalized.userId)) {
          const booking = Object.values(ledger.bookings).find(value => value.ownerId === normalized.userId);
          if (!booking) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', 'العميلة غير موجودة.');
          customer(s, { id: booking.ownerId, name: booking.contact.name, email: booking.contact.email }, secret, now());
        }
        const id = 'AD-' + mac(secret, requestKey).slice(0, 24).toUpperCase(), extra = { actorId: actor.id, reason: normalized.reason };
        if (normalized.points > 0) credit(s, normalized.userId, 'manual', normalized.points, id, now(), extra);
        else debit(s, normalized.userId, -normalized.points, id, 'manual', now(), extra);
      }
      s.revision += 1; s.requests[requestKey] = { fingerprint, at: iso(now()) };
      s.audit.push({ action: normalized.action, actorId: actor.id, requestId, at: iso(now()), ...(normalized.action === 'adjust' ? { userId: normalized.userId, points: normalized.points, reason: normalized.reason } : normalized.action === 'referral-credit-save' ? { amountSar: normalized.amountSar } : { rules: structuredClone(normalized.rules) }) }); capacity(ledger);
      return { value: ledger, result: adminProject(ledger) };
    });
  }
  async function gift(user, input) {
    const requestId = uuid(input.requestId), rewardId = text(input.rewardId, 64);
    const recipientEmail = email(input.recipientEmail), recipientId = mac(secret, 'user:' + recipientEmail);
    const key = 'facial-gift:' + user.id + ':' + requestId;
    const fingerprint = mac(secret, canonical({ rewardId, recipientId }));
    return update(store, LOYALTY_LEDGER, ledger => {
      if (!ledger?.visitProgram) throw invalid();
      const s = state(ledger, now()), prior = own(s.requests, key);
      if (prior) {
        if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'تغيّر طلب الإهداء.');
        return { write: false, result: { wallet: walletSnapshot(ledger, user.id, now()) } };
      }
      transferReward(ledger.visitProgram, user.id, rewardId, recipientId, now());
      // Use the recipient's most recent known booking language, otherwise
      // Arabic. The sender's language never sets the recipient's language.
      const lastBooking = Object.values(ledger.bookings || {}).filter(b => b.ownerId === recipientId).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0];
      enqueueWalletEvent(ledger, { id: `messagegift:${rewardId}:earner`, kind: 'booking-message', userId: user.id, email: user.email, message: giftWalletMessage('sender', input.locale) }, now());
      enqueueWalletEvent(ledger, { id: `messagegift:${rewardId}:owner`, kind: 'booking-message', userId: recipientId, email: recipientEmail, message: giftWalletMessage('recipient', lastBooking?.locale) }, now());
      s.requests[key] = { fingerprint, at: iso(now()) }; s.revision += 1;
      s.audit.push({ action: 'gift-facial', userId: user.id, rewardId, at: iso(now()) });
      capacity(ledger);
      return { value: ledger, result: { wallet: walletSnapshot(ledger, user.id, now()) } };
    });
  }
  return { wallet, quote, redeem, gift, adminSnapshot, adminMutate };
}
