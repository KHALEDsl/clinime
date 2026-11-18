import { randomUUID } from 'node:crypto';
import { mac, read, update } from './core.mjs';
import { carePrizeEmail } from './email-templates.mjs';

const WINDOW = 23 * 3600000, LEASE = 120000;
const keyFor = (weekKey, prizeId) => 'care-prize-mail:' + (prizeId ? prizeId.slice('care-prize:'.length) : weekKey);
export function createCarePrizeMail({ store, mail, secret, origin, now = Date.now }) {
  function view(record) {
    if (!record) return { status: 'not-sent', retryAllowed: true };
    const expired = record.firstAttemptAt != null && now() - record.firstAttemptAt >= WINDOW;
    return { status: record.status, retryAllowed: record.status !== 'sent' && !expired && !(record.leaseUntil > now()), ...(expired && record.status !== 'sent' ? { reason: 'manual-review-required' } : {}), ...(record.reason ? { reason: record.reason } : {}) };
  }
  async function status(weekKey, prizeId) { return view(await read(store, keyFor(weekKey, prizeId))); }
  async function send({ weekKey, winnerId, firstName, prize }) {
    if (prize?.status !== 'credited' || ![ 'care-prize:' + weekKey, 'care-prize:' + weekKey + ':' + winnerId ].includes(prize.id)) return;
    const key = keyFor(weekKey, prize.id), leaseId = randomUUID();
    // Only a verified game participant can be a frozen winner. Resolve its
    // immutable auth identity; never use booking contacts or caller recipients.
    const account = await read(store, 'user/' + winnerId);
    const address = account?.email;
    const valid = typeof address === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address) && mac(secret, 'user:' + address) === winnerId && account.id === winnerId;
    const claim = await update(store, key, current => {
      if (current?.status === 'sent' || current?.leaseUntil > now() || current?.firstAttemptAt != null && now() - current.firstAttemptAt >= WINDOW) return { write: false, result: null };
      if (!current?.message && !valid) return { value: { status: 'failed', reason: 'recipient-unavailable' }, result: null };
      const record = current?.message ? current : { status: 'pending', message: { ...carePrizeEmail({ firstName, amountSar: 100, weekKey, origin }), to: address, key }, winnerId, createdAt: now(), firstAttemptAt: null };
      record.status = 'pending'; delete record.reason;
      record.firstAttemptAt ??= now(); record.leaseId = leaseId; record.leaseUntil = now() + LEASE;
      record.attempts = (record.attempts || 0) + 1;
      return { value: record, result: record.message };
    });
    if (!claim) return;
    let delivery;
    try { delivery = await mail?.send(claim); } catch { delivery = { status: 'pending' }; }
    const delivered = ['sent', 'failed'].includes(delivery?.status) ? delivery.status : 'pending';
    await update(store, key, current => {
      if (!current || current.leaseId !== leaseId || current.status === 'sent') return { write: false, result: null };
      current.status = delivered; current.leaseUntil = 0; delete current.leaseId;
      if (delivered === 'sent') current.sentAt = now();
      return { value: current, result: null };
    });
  }
  return { send, status };
}
