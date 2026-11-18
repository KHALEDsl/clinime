import { safePricing } from './loyalty.mjs';
import { ApiError, invalid, read } from './core.mjs';

const LEDGER = 'clinic/booking-ledger-v1', MAX_BOOKINGS = 5000;
// Explicit addresses only: no display names, domains, patterns, or partial matches.
// A malformed entry disables the entire list rather than silently broadening it.
export function configuredAdminEmails(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 8192) return [];
  const addresses = raw.split(/[,\n\r]/).map(value => value.trim().toLowerCase());
  const valid = address => address.length <= 254 && /^[a-z0-9!#$%&'+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(address);
  if (addresses.length > 100 || addresses.some(address => !valid(address))) return [];
  return [...new Set(addresses)];
}

export function safeAdminBooking(booking) {
  // Project every nested object explicitly. New customer/private ledger fields
  // must never become administrative response fields by accidental spreading.
  return {
    id: booking.id, status: booking.status, revision: booking.revision,
    date: booking.date, time: booking.time, professional: booking.professional,
    ...(booking.professionalNameAr ? { professionalNameAr: booking.professionalNameAr, professionalNameEn: booking.professionalNameEn } : {}),
    items: booking.items.map(item => ({
      serviceId: item.serviceId, optionId: item.optionId,
      nameAr: item.nameAr, nameEn: item.nameEn, optionAr: item.optionAr, optionEn: item.optionEn,
      price: item.price, duration: item.duration, image: item.image,
    })),
    contact: { name: booking.contact.name, email: booking.contact.email },
    attendee: { kind: booking.attendee.kind, name: booking.attendee.name, relationship: booking.attendee.relationship },
    createdAt: booking.createdAt, updatedAt: booking.updatedAt,
    emailStatus: booking.emailStatus,
    ...(booking.pricing?.code ? { pricing: safePricing(booking.pricing) } : {}),
    ...(booking.attendance ? { attendance: { status: booking.attendance.status, arrivedAt: booking.attendance.arrivedAt } } : {}),
  };
}

export function createAdmin({ store, emails, bookings, now, access = 'allowlist' }) {
  const allowed = new Set(emails);
  function authorize(active) {
    // Both policies require the existing server-verified, unexpired session.
    // Open enrollment is an explicit server setting, never a client role claim.
    if (!active?.user || (access !== 'verified-email' && !allowed.has(active.user.email))) throw new ApiError(403, 'ADMIN_REQUIRED', 'لا تملكين صلاحية الوصول إلى لوحة الاستقبال.');
    return active.user;
  }
  function me(active) {
    const user = authorize(active);
    return { user: { email: user.email, name: user.name }, role: 'admin', csrfToken: active.csrfToken, asOf: new Date(now()).toISOString() };
  }
  async function list(active, params) {
    authorize(active);
    const date = params.get('date'), status = params.get('status');
    if (date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw invalid();
    if (status !== null && !['confirmed', 'cancelled'].includes(status)) throw invalid();
    const ledger = await read(store, LEDGER);
    const bookings = Object.values(ledger?.bookings || {});
    // Mirrors the customer's durable ledger capacity; never silently omit rows.
    if (bookings.length > MAX_BOOKINGS) throw new ApiError(503, 'SCHEDULE_CAPACITY');
    const visible = bookings.filter(booking => (date === null || booking.date === date) && (status === null || booking.status === status))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
    return { bookings: visible.map(safeAdminBooking), total: visible.length, asOf: new Date(now()).toISOString() };
  }
  async function mutate(active, action, input, id) {
    const actor = authorize(active), result = await bookings.mutate(action, actor, input, id, { admin: true });
    return { booking: safeAdminBooking(result.booking), emailStatus: result.emailStatus };
  }
  async function availability(active, id, date) {
    authorize(active);
    return bookings.adminAvailability(id, date);
  }
  return { me, list, authorize, mutate, availability };
}
