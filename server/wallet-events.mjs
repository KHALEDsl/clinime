import { ApiError, read, update } from './core.mjs';
import { newVisitProgram } from './visit-rewards.mjs';
import { bookingWalletMessage } from './wallet-copy.mjs';

export const WALLET_LEDGER = 'clinic/booking-ledger-v1';
const DEFAULT_CAMPAIGN = 'ns7PFhWeahPi5kVt67394';
const iso = now => new Date(typeof now === 'function' ? now() : now).toISOString();

// Activation is explicitly called only by the configured production integration.
// It never copies fixtures, scans past visits, or alters the legacy loyalty state.
export async function activateWalletProgram(store, now, { campaignId = DEFAULT_CAMPAIGN } = {}) {
  return update(store, WALLET_LEDGER, current => {
    const ledger = current || { schema: 1, bookings: {}, requests: {} };
    if (ledger.walletIntegration?.enabled) {
      if (ledger.walletIntegration.campaignId !== campaignId) throw new ApiError(409, 'WALLET_CAMPAIGN_CONFLICT');
      if (ledger.visitProgram) return { write: false, result: structuredClone(ledger.walletIntegration) };
    }
    ledger.visitProgram ||= newVisitProgram();
    ledger.walletIntegration = { schema: 1, enabled: true, campaignId, activatedAt: ledger.walletIntegration?.activatedAt || iso(now) };
    return { value: ledger, result: structuredClone(ledger.walletIntegration) };
  });
}

// Synchronous and side-effect free outside the supplied ledger: callers must
// enqueue inside the exact CAS that accepts the underlying business mutation.
export function enqueueWalletEvent(ledger, event, now) {
  if (!ledger.walletIntegration?.enabled) return null;
  const outbox = ledger.walletOutbox ||= { schema: 1, sequences: {}, events: {} };
  if (Object.hasOwn(outbox.events, event.id)) return outbox.events[event.id];
  const sequence = (outbox.sequences[event.userId] || 0) + 1;
  outbox.sequences[event.userId] = sequence;
  const value = { ...structuredClone(event), sequence, createdAt: iso(now), status: 'pending' };
  outbox.events[value.id] = value;
  return value;
}

export function queueBookingWalletEvent(ledger, booking, action, now) {
  // Wallet messages may appear on a lock screen. Exclude names, services,
  // clinical notes, prices, and all other medical or payment information.
  const message = bookingWalletMessage(booking, action);
  return enqueueWalletEvent(ledger, { id: `booking:${booking.id}:${booking.revision}`, kind: 'booking-message', userId: booking.ownerId, ...(booking.contact?.email ? { email: booking.contact.email } : {}), message }, now);
}

export async function listWalletEvents(store, { userId, limit = 100 } = {}) {
  const ledger = await read(store, WALLET_LEDGER);
  return Object.values(ledger?.walletOutbox?.events || {}).filter(event => event.status === 'pending' && (!userId || event.userId === userId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.sequence - b.sequence || a.id.localeCompare(b.id)).slice(0, limit).map(event => structuredClone(event));
}

export async function readWalletEvent(store, id) {
  const ledger = await read(store, WALLET_LEDGER);
  const event = ledger?.walletOutbox?.events?.[id];
  return event ? structuredClone(event) : null;
}

export async function claimWalletEvent(store, id, now) {
  return update(store, WALLET_LEDGER, ledger => {
    const events = ledger?.walletOutbox?.events || {}, event = events[id];
    if (!event || event.status !== 'pending' || Object.values(events).some(other => {
      if (other.userId !== event.userId || other.sequence >= event.sequence || ['sent', 'skipped'].includes(other.status)) return false;
      // A notification has no balance effect. A lost notification receipt must
      // not hold an earned stamp hostage; retain its intent without replaying it.
      // Financial events still serialize across stamps and reward redemptions.
      if (other.kind !== 'booking-message') return true;
      if (['stamp', 'redeem'].includes(event.kind)) return false;
      return !['unknown', 'failed'].includes(other.status);
    })) return { write: false, result: null };
    event.status = 'processing'; event.startedAt = iso(now);
    // New stamp workers can verify their uniquely tagged provider receipt by
    // read-only lookup after a crash. Legacy uncertain events stay untouched.
    if (event.kind === 'stamp') event.reconciliationAvailable = true;
    // A crash or ambiguous provider result must never silently replay a stamp.
    return { value: ledger, result: structuredClone(event) };
  });
}

export async function finishWalletEvent(store, id, outcome, now) {
  if (!['sent', 'pending', 'unknown', 'failed', 'skipped'].includes(outcome?.status)) throw new ApiError(400, 'INVALID_WALLET_OUTCOME');
  return update(store, WALLET_LEDGER, ledger => {
    const event = ledger?.walletOutbox?.events?.[id];
    if (!event || ['sent', 'skipped'].includes(event.status)) return { write: false, result: event ? structuredClone(event) : null };
    if (event.status !== 'processing' && event.status !== 'unknown') return { write: false, result: structuredClone(event) };
    event.status = outcome.status;
    if (outcome.code) event.code = String(outcome.code).slice(0, 80); else delete event.code;
    if (['sent', 'skipped'].includes(event.status)) {
      // Keep the semantic-ID tombstone and member sequence forever; discard
      // delivered PII/content. Domain retries cannot recreate the event.
      const compact = { id: event.id, userId: event.userId, kind: event.kind, sequence: event.sequence, status: event.status, createdAt: event.createdAt, finishedAt: iso(now) };
      ledger.walletOutbox.events[id] = compact;
      return { value: ledger, result: structuredClone(compact) };
    }
    event.updatedAt = iso(now);
    return { value: ledger, result: structuredClone(event) };
  });
}
