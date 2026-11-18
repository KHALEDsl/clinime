import { ApiError, mac } from './core.mjs';

const requiredVisits = 5;
const serviceId = 'basic';
const iso = time => new Date(time).toISOString();
const amountInCents = value => Math.round(value * 100);
const fail = (code, message) => { throw new ApiError(409, code, message); };

export function newVisitProgram() {
  return { schema: 1, referralCreditSar: null, visits: {}, rewards: {}, transactions: {} };
}

function creditBalance(program, userId) {
  return Object.values(program.transactions).reduce((sum, entry) => sum + (entry.userId === userId ? entry.cents : 0), 0);
}

export function visitWallet(ledger, userId) {
  const program = ledger?.visitProgram;
  if (!program) return {};
  const visits = (program.visits[userId] || []);
  const rewards = Object.values(program.rewards).filter(reward => reward.earnerId === userId || reward.ownerId === userId).map(reward => {
    const mine = reward.ownerId === userId;
    return { id: reward.id, serviceId, ...(mine && !reward.bookingId ? { code: reward.code } : {}), earnedAt: reward.earnedAt, giftedAt: reward.giftedAt, usedAt: reward.usedAt, status: !mine ? 'gifted' : reward.bookingId ? 'booked' : 'available', receivedGift: mine && reward.earnerId !== userId };
  }).reverse();
  const referrals = Object.values(ledger.loyalty?.referrals || {}).filter(ref => ref.referrerId === userId && ref.program === 'visits').map(ref => ({
    id: ref.id, amountSar: ref.amountSar, status: ref.status, createdAt: ref.createdAt, completedAt: ref.completedAt
  }));
  const redemptions = Object.values(program.transactions).filter(entry => entry.userId === userId && entry.kind !== 'referral').map(entry => ({
    id: entry.id, amountSar: entry.cents / 100, status: entry.kind, createdAt: entry.createdAt
  }));
  return {
    stampCard: { target: requiredVisits, totalVisits: visits.length, stamps: visits.length ? ((visits.length - 1) % requiredVisits) + 1 : 0, rewardServiceId: serviceId, visits: [...visits].reverse(), rewards },
    referralWallet: { balanceSar: creditBalance(program, userId) / 100, creditPerReferralSar: program.referralCreditSar, entries: [...referrals, ...redemptions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) }
  };
}

export function recordStamp(ledger, booking, secret, now) {
  const program = ledger.visitProgram;
  if (!program || booking.attendee?.kind === 'other' || booking.status !== 'confirmed' || booking.attendance?.status !== 'arrived') return;
  const total = amountInCents(booking.pricing?.total ?? booking.items.reduce((sum, item) => sum + item.price, 0)) + (booking._staff?.additions || []).reduce((sum, item) => sum + amountInCents(item.price), 0);
  // Arrival earns the stamp before payment. A fully complimentary visit still
  // earns none; subsequent cancellation/movement does not revoke earned stamps.
  if (total <= 0) return;
  const visits = program.visits[booking.ownerId] ||= [];
  if (visits.some(visit => visit.bookingId === booking.id)) return;
  visits.push({ bookingId: booking.id, at: iso(now) });
  if (!(visits.length % requiredVisits)) {
    const id = 'FAC-' + mac(secret, 'visit-benefit:' + booking.id).slice(0, 20).toUpperCase();
    program.rewards[id] = { id, code: id, ownerId: booking.ownerId, earnerId: booking.ownerId, earnedAt: iso(now) };
  }
  return { bookingId: booking.id, totalVisits: visits.length };
}

// Reserving a facial holds it locally. The provider reward is consumed only
// when this particular booked visit is actually complete and fully settled.
export function consumeVisitReward(ledger, booking, now) {
  const reward = ledger.visitProgram?.rewards?.[booking._loyalty?.facialId];
  if (!reward || reward.bookingId !== booking.id || reward.consumedAt || booking.status !== 'confirmed' || booking._staff?.stage !== 'closed' || !booking._staff.finishedAt) return null;
  const total = amountInCents(booking.pricing?.total ?? booking.items.reduce((sum, item) => sum + item.price, 0)) + (booking._staff.additions || []).reduce((sum, item) => sum + amountInCents(item.price), 0);
  const paid = (ledger.staff?.receipts || []).filter(receipt => receipt.bookingId === booking.id).reduce((sum, receipt) => sum + amountInCents(receipt.amount), 0);
  if (total !== paid) return null;
  reward.consumedAt = iso(now);
  return reward;
}

export function transferReward(program, userId, rewardId, recipientId, now) {
  const reward = program?.rewards[rewardId];
  if (!reward || reward.ownerId !== userId || reward.bookingId || reward.giftedAt) fail('REWARD_UNAVAILABLE', 'هذه المكافأة غير متاحة للإهداء.');
  if (recipientId === userId) fail('GIFT_SELF', 'أدخلي بريد الشخص الذي تهدينه الجلسة.');
  reward.ownerId = recipientId;
  reward.giftedAt = iso(now);
}

export function quoteVisitBenefit(program, userId, items, base) {
  const code = base.code;
  if (code === 'WALLET') {
    const remaining = creditBalance(program, userId);
    if (remaining <= 0) fail('WALLET_EMPTY', 'لا يتوفر رصيد إحالات للاستخدام.');
    const discount = Math.min(remaining, amountInCents(base.subtotal));
    return { pricing: { ...base, eligibleSubtotal: base.subtotal, discount: discount / 100, total: (amountInCents(base.subtotal) - discount) / 100, kind: 'wallet' }, walletCents: discount };
  }
  if (!code.startsWith('FAC-')) return null;
  const reward = program.rewards[code];
  if (!reward || reward.ownerId !== userId || reward.bookingId) fail('REWARD_UNAVAILABLE', 'جلسة المكافأة غير متاحة لهذا الحساب.');
  const item = items.find(item => item.serviceId === serviceId);
  if (!item) fail('REWARD_NOT_ELIGIBLE', 'أضيفي خدمة تنظيف البشرة الأساسي لاستخدام جلستك المجانية.');
  return { pricing: { ...base, kind: 'facial', percent: 100, cap: item.price, eligibleSubtotal: item.price, discount: item.price, total: (amountInCents(base.subtotal) - amountInCents(item.price)) / 100 }, reward, eligibleServiceIds: [serviceId] };
}

function addTransaction(program, id, userId, cents, kind, now) {
  program.transactions[id] ||= { id, userId, cents, kind, createdAt: iso(now) };
}

export function reserveVisitBenefit(program, booking, quote, now) {
  if (quote.reward) {
    quote.reward.bookingId = booking.id;
    quote.reward.usedAt = iso(now);
    booking._loyalty.facialId = quote.reward.id;
  } else if (quote.walletCents) {
    addTransaction(program, 'use:' + booking.id, booking.ownerId, -quote.walletCents, 'spent', now);
    booking._loyalty.walletCents = quote.walletCents;
  }
}

export function releaseVisitBenefit(program, booking, now) {
  const { facialId, walletCents } = booking._loyalty;
  const reward = facialId && program.rewards[facialId];
  if (reward?.bookingId === booking.id && !reward.consumedAt) { delete reward.bookingId; delete reward.usedAt; }
  if (walletCents) addTransaction(program, 'return:' + booking.id, booking.ownerId, walletCents, 'restored', now);
}

export function settleReferralCredit(program, referral, now) {
  if (referral.amountSar > 0) addTransaction(program, 'referral:' + referral.id, referral.referrerId, amountInCents(referral.amountSar), 'referral', now);
}
