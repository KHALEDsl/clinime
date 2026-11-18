import { bookingEmail } from './email-templates.mjs';
import { applyBookingPromotion, releaseBookingPromotion, bookingPaymentTotals, awardArrivalVisit } from './loyalty.mjs';
import { CATALOG } from './catalog.mjs';
import { queueBookingWalletEvent } from './wallet-events.mjs';
import { ApiError, invalid, uuid, text, mac, canonical, update, read, safeBooking, email, hash } from './core.mjs';

const LEDGER = 'clinic/booking-ledger-v1', RETENTION = 72 * 3600000;
const mins = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const timeString = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
const dateString = date => new Date(date).toISOString().slice(0, 10);
const validDate = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && dateString(date) === date;
export function configuredSchedule(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || value.timeZone !== 'Asia/Riyadh' || !Array.isArray(value.weekdays) || !value.weekdays.length || value.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return null;
    if (!/^\d{2}:\d{2}$/.test(value.open) || !/^\d{2}:\d{2}$/.test(value.close) || mins(value.open) < 0 || mins(value.close) > 1440 || mins(value.open) >= mins(value.close) || +value.open.slice(3) > 59 || +value.close.slice(3) > 59) return null;
    if (!Number.isInteger(value.stepMinutes) || value.stepMinutes < 5 || value.stepMinutes > 60 || !Number.isInteger(value.horizonDays) || value.horizonDays < 1 || value.horizonDays > 180) return null;
    return value;
  } catch { return null; }
}
export function bookingDuration(booking) { return booking.items.reduce((n,item)=>n+item.duration,0)+(booking._staff?.additions||[]).reduce((n,item)=>n+item.duration,0)+(booking._staff?.extensionMinutes||0); }
export function bookingIntervals(booking) {
  const duration = bookingDuration(booking), plannedStart = mins(booking.time), intervals = [[plannedStart, plannedStart + duration]];
  if (booking._staff?.stage === 'session' && typeof booking._staff.startedAt === 'string') {
    const started = Date.parse(booking._staff.startedAt);
    if (Number.isFinite(started)) {
      const local = new Date(started + 3 * 3600000).toISOString();
      if (local.slice(0, 10) === booking.date) {
        const actualStart = mins(local.slice(11, 16)) + Number(local.slice(17, 19)) / 60;
        if (actualStart !== plannedStart) intervals.push([actualStart, actualStart + duration]);
      }
    }
  }
  return intervals;
}
export function ledgerCatalog(ledger) { return Array.isArray(ledger?.staff?.catalog)&&ledger.staff.catalog.length ? ledger.staff.catalog : CATALOG; }
export function snapshotItems(items, catalog = CATALOG) {
  if (!Array.isArray(items) || !items.length || items.length > 14) throw invalid();
  const seen = new Set();
  return items.map(entry => {
    if (!entry || typeof entry !== 'object' || typeof entry.serviceId !== 'string' || seen.has(entry.serviceId)) throw invalid(); seen.add(entry.serviceId);
    const service = catalog.find(s => s.id === entry.serviceId); if (!service || service.active===false || service.availability==='unavailable') throw invalid();
    const option = service.options.length ? service.options.find(o => o.id === entry.optionId) : null;
    if (service.options.length && !option || !service.options.length && entry.optionId != null && entry.optionId !== '') throw invalid();
    const actual = option || service;
    return { serviceId: service.id, optionId: option?.id ?? null, nameAr: service.nameAr, nameEn: service.nameEn, optionAr: option?.nameAr || '', optionEn: option?.nameEn || '', price: !option&&service.discount!=null?service.discount:actual.price, duration: actual.duration, image: service.image };
  });
}
export function createBookings({ store, mail, secret, origin, schedule, gift = null, professionals = null, now }) {
  function assertDate(date) {
    if (!schedule) throw new ApiError(503, 'SCHEDULE_UNAVAILABLE', 'المواعيد غير متاحة الآن. حاولي لاحقًا.');
    if (!validDate(date)) throw invalid();
    const today = dateString(now() + 3 * 3600000), last = dateString(Date.parse(today) + schedule.horizonDays * 86400000);
    if (date < today || date > last || !schedule.weekdays.includes(new Date(date + 'T12:00:00Z').getUTCDay())) throw new ApiError(409, 'SLOT_UNAVAILABLE', 'هذا اليوم غير متاح للحجز.');
  }
  function canBook(ledger, date, time, duration, excludeId) {
    assertDate(date);
    if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time) || +time.slice(3) > 59) return false;
    const start = mins(time), end = start + duration;
    if (start < mins(schedule.open) || end > mins(schedule.close) || (start - mins(schedule.open)) % schedule.stepMinutes !== 0 || Date.parse(date + 'T' + time + ':00+03:00') <= now()) return false;
    return !Object.values(ledger.bookings).some(b => b.id !== excludeId && b.status === 'confirmed' && b.date === date && bookingIntervals(b).some(([otherStart, otherEnd]) => start < otherEnd && end > otherStart));
  }
  const bookableProfessionals = professionals === null ? ['any', 'gigi'] : ['any', ...professionals.filter(person => person.active).map(person => person.id)];
  function specialistFor(ledger, selected, date) {
    if (professionals === null) return null;
    const available = professionals.filter(person => person.active);
    if (selected !== 'any') return available.find(person => person.id === selected);
    const count = person => Object.values(ledger.bookings).filter(booking => booking.status === 'confirmed' && booking.date === date && booking.professional === person.id).length;
    return available.sort((a, b) => count(a) - count(b) || a.id.localeCompare(b.id))[0];
  }
  const empty = () => ({ schema: 1, bookings: {}, requests: {} });
  async function list(ownerId) { const ledger = await read(store, LEDGER); return Object.values(ledger?.bookings || {}).filter(b => b.ownerId === ownerId).map(b => ({ ...safeBooking(b), paymentSummary: bookingPaymentTotals(b, ledger.staff?.receipts) })); }
  async function availability(date, requestedItems, bookingId, ownerId, professional = 'any') {
    assertDate(date);
    if (!bookingId && !bookableProfessionals.includes(professional)) throw invalid();
    if (!bookingId && professionals !== null && !professionals.some(person => person.active)) throw new ApiError(503, 'SPECIALISTS_UNAVAILABLE', 'الأخصائيات غير متاحات للحجز الآن. حاولي لاحقًا.');
    const ledger = await read(store, LEDGER) || empty();
    const duration=bookingId&&ledger.bookings[bookingId]?bookingDuration(ledger.bookings[bookingId]):snapshotItems(requestedItems,ledgerCatalog(ledger)).reduce((n,s)=>n+s.duration,0);
    if (bookingId && ledger.bookings[bookingId]?.ownerId !== ownerId) throw new ApiError(404, 'NOT_FOUND');
    return { ...availableSlots(ledger, date, duration, bookingId), professional, ...(professionals ? { schedulingMode: 'shared-room' } : {}) };
  }
  function availableSlots(ledger, date, duration, bookingId) {
    const slots = []; for (let minute = mins(schedule.open); minute + duration <= mins(schedule.close); minute += schedule.stepMinutes) { const time = timeString(minute); if (canBook(ledger, date, time, duration, bookingId)) slots.push(time); }
    const today = dateString(now() + 3 * 3600000), dates = []; for (let i = 0; i <= schedule.horizonDays; i++) { const d = dateString(Date.parse(today) + i * 86400000); if (schedule.weekdays.includes(new Date(d + 'T12:00:00Z').getUTCDay())) dates.push(d); }
    return { date, slots, dates };
  }
  async function adminAvailability(id, date) {
    const ledger = await read(store, LEDGER), booking = ledger?.bookings[id];
    if (!booking) throw new ApiError(404, 'NOT_FOUND');
    if (booking.status !== 'confirmed') throw new ApiError(409, 'REVISION_CONFLICT');
    assertDate(date);
    return availableSlots(ledger, date, bookingDuration(booking), id);
  }
  const arrivalLocked = () => new ApiError(409, 'ARRIVAL_LOCKED', 'تم تسجيل الوصول. لا يمكن تغيير الموعد؛ تواصلي مع الاستقبال.');
  async function mutate(action, owner, input, id, { admin = false, actor = owner } = {}) {
    if (!['create', 'update', 'cancel', 'arrival'].includes(action) || action === 'arrival' && !admin) throw invalid();
    const requestId = uuid(input.requestId); let normalized;
    if (action === 'create') {
      if(!Array.isArray(input.items)||!input.items.length||input.items.length>14)throw invalid();
      const seen=new Set();const items=input.items.map(item=>{if(!item||typeof item.serviceId!=='string'||item.serviceId.length>64||seen.has(item.serviceId)||item.optionId!=null&&(typeof item.optionId!=='string'||item.optionId.length>64))throw invalid();seen.add(item.serviceId);return{serviceId:item.serviceId,optionId:item.optionId||null};}),contactName = text(input.contactName), attendee = input.attendee;
      if (!bookableProfessionals.includes(input.professional) || !attendee || !['self', 'other'].includes(attendee.kind)) throw invalid();
      if(input.promotionCode != null && (typeof input.promotionCode !== 'string' || input.promotionCode.length > 64)) throw invalid();
      normalized = { items, promotionCode: (input.promotionCode || '').trim().toUpperCase(), date: input.date, time: input.time, professional: input.professional, contactName, attendee: { kind: attendee.kind, name: attendee.kind === 'self' ? contactName : text(attendee.name), relationship: attendee.kind === 'other' ? text(attendee.relationship, 80, true) : '' } };
      if (normalized.promotionCode === 'WALLET' && input.expectedWalletPricing != null) {
        const { discount, total } = input.expectedWalletPricing;
        const validMoney = amount => typeof amount === 'number' && amount >= 0 && Number.isSafeInteger(Math.round(amount * 100)) && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001;
        if (!validMoney(discount) || !validMoney(total)) throw invalid();
        normalized.expectedWalletPricing = {discount, total};
      }
      id = 'CL-' + mac(secret, (admin?'staff:'+actor.id+':':'')+owner.id + ':' + requestId).slice(0, 24).toUpperCase();
    } else {
      if (typeof id !== 'string' || !/^CL-[A-F0-9]{24}$/.test(id) || !Number.isInteger(input.revision) || input.revision < 1) throw invalid();
      normalized = action === 'update' ? { revision: input.revision, date: input.date, time: input.time } : { revision: input.revision };
    }
    const fingerprint = mac(secret, canonical({ action, id, input: normalized,...(action==='create'?{catalogVersion:input.catalogVersion||null}:{}) })), requestKey = admin&&action==='create'?'admin:create:'+actor.id+':'+requestId:(admin?'admin:'+actor.id+':':'')+owner.id+':'+requestId;
    const outcome = await update(store, LEDGER, current => {
      const ledger = current || empty(), replay = ledger.requests[requestKey], existing = ledger.bookings[id];
      if (replay) { if (replay.fingerprint !== fingerprint) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT'); return { write: false, result: { booking: ledger.bookings[replay.bookingId], send: replay.send !== false } }; }
      if (action === 'create' && existing) { if (existing.ownerId !== owner.id || existing.fingerprint !== fingerprint) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT'); return { write: false, result: { booking: existing, send: true } }; }
      if (action !== 'create' && (!existing || !admin && existing.ownerId !== owner.id)) throw new ApiError(404, 'NOT_FOUND');
      if (action !== 'create' && (existing.revision !== normalized.revision || existing.status !== 'confirmed')) throw new ApiError(409, 'REVISION_CONFLICT', 'تغيّرت تفاصيل الموعد. اعرضي آخر نسخة قبل المتابعة.');
      if (admin&&['update','cancel'].includes(action)&&['session','checkout','closed'].includes(existing?._staff?.stage)) throw new ApiError(409,'VISIT_LOCKED','بدأت الجلسة أو اكتملت. راجعي حالة الزيارة قبل تغيير الموعد.');
      if (existing?.attendance?.status === 'arrived' && !admin && ['update', 'cancel'].includes(action)) throw arrivalLocked();
      let value, send = true, changed = true;
      if (action === 'arrival') {
        if (existing.attendance?.status === 'arrived') { value = existing; changed = false; }
        else {
          if (['session', 'checkout', 'closed'].includes(existing._staff?.stage)) throw new ApiError(409, 'VISIT_LOCKED', 'بدأت الجلسة أو اكتملت. راجعي حالة الزيارة قبل تسجيل الوصول.');
          value = { ...existing, attendance: { status: 'arrived', arrivedAt: new Date(now()).toISOString() }, updatedAt: new Date(now()).toISOString() };
          awardArrivalVisit(ledger, value, secret, now());
        }
        send = false;
      }
      else if (action === 'update' && existing.date === normalized.date && existing.time === normalized.time) { value = existing; send = false; changed = false; }
      else if (action === 'cancel') value = { ...existing, revision: existing.revision + 1, status: 'cancelled', cancelledAt: new Date(now()).toISOString() };
      else {
        if(action==='create'&&input.catalogVersion&&input.catalogVersion!==hash(canonical(ledgerCatalog(ledger))))throw new ApiError(409,'CATALOG_CHANGED','تغيّرت قائمة الخدمات أو أسعارها. راجعي الاختيار قبل تأكيد الحجز.');
        const items = action === 'create' ? snapshotItems(input.items,ledgerCatalog(ledger)) : existing.items;
        if (!canBook(ledger, normalized.date, normalized.time, action==='create'?items.reduce((n,s)=>n+s.duration,0):bookingDuration(existing), action === 'update' ? id : null)) throw new ApiError(409, 'SLOT_UNAVAILABLE', 'هذا الوقت لم يعد متاحًا. اختاري وقتًا آخر.');
        value = action === 'create' ? { id, ownerId: owner.id, gift: gift ? structuredClone(gift) : null, revision: 1, status: 'confirmed', ...normalized, items, contact: { name: contactNameOf(normalized), email: owner.email }, createdAt: new Date(now()).toISOString(), locale: input.locale === 'en' ? 'en' : 'ar', fingerprint } : { ...existing, revision: existing.revision + 1, date: normalized.date, time: normalized.time };
        if (action === 'create' && professionals !== null) {
          const specialist = specialistFor(ledger, normalized.professional, normalized.date);
          if (!specialist) throw new ApiError(409, 'SPECIALIST_UNAVAILABLE', 'الأخصائية غير متاحة للحجز. اختاري أخصائية أخرى.');
          value.professional = specialist.id;
          value.professionalNameAr = specialist.nameAr;
          value.professionalNameEn = specialist.nameEn;
        }
        delete value.contactName;
      }
      if (action === 'create' && admin && ledger.visitProgram && /^(WALLET$|FAC-)/.test(normalized.promotionCode)) throw new ApiError(403, 'BENEFIT_OWNER_REQUIRED', 'تستخدم صاحبة المحفظة مكافآتها من حسابها.');
      if (action === 'create') { applyBookingPromotion(ledger, value, owner, normalized.promotionCode, secret, now()); delete value.promotionCode; delete value.expectedWalletPricing; }
      if (action === 'cancel') releaseBookingPromotion(ledger, value, now());
      if (send) {
        value.emailTemplateVersion = 2; value.updatedAt = new Date(now()).toISOString(); value.emailStatus = 'pending'; value.mailStartedAt = now();
        value.emailMessage = bookingEmail({ booking: value, origin });
      }
      const resetAttendance = admin && action === 'update' && changed && existing.attendance?.status === 'arrived' && existing.date !== value.date;
      if (resetAttendance) { delete value.attendance; if(value._staff)value._staff={...value._staff,stage:'waiting',decisionRequested:false,decision:null}; }
      if (admin && changed) value._adminAudit = [...(existing?._adminAudit || []), { action, actorId: actor.id, requestId, revision: value.revision, at: new Date(now()).toISOString(), ...(resetAttendance ? { previousAttendance: structuredClone(existing.attendance) } : {}) }];
      ledger.bookings[id] = value;
      if (changed && ['create', 'update', 'cancel'].includes(action)) queueBookingWalletEvent(ledger, value, action, now());
      ledger.requests = Object.fromEntries(Object.entries(ledger.requests).filter(([, r]) => r.at > now() - RETENTION));
      if (Object.keys(ledger.bookings).length > 5000 || Object.keys(ledger.requests).length >= 10000) throw new ApiError(503, 'SCHEDULE_CAPACITY', 'الحجز غير متاح مؤقتًا. حاولي لاحقًا.');
      ledger.requests[requestKey] = { fingerprint, bookingId: id, at: now(), send };
      if (Buffer.byteLength(JSON.stringify(ledger)) > 8 * 1024 * 1024) throw new ApiError(503, 'SCHEDULE_CAPACITY');
      return { value: ledger, result: { booking: value, send } };
    });
    const { booking, send } = outcome;
    if (!send) return { booking: safeBooking(booking), emailStatus: booking.emailStatus };
    try { return await confirmation(booking.id, booking.ownerId); } catch { return { booking: safeBooking({ ...booking, emailStatus: 'pending' }), emailStatus: 'pending' }; }
  }
  async function confirmation(id, ownerId) {
    const ledger = await read(store, LEDGER), booking = ledger?.bookings[id];
    if (!booking || booking.ownerId !== ownerId) throw new ApiError(404, 'NOT_FOUND');
    const paymentSummary = bookingPaymentTotals(booking, ledger.staff?.receipts);
    if (booking.emailStatus === 'sent') return { booking: { ...safeBooking(booking), paymentSummary }, emailStatus: 'sent' };
    // Provider keys expire after24h. Never blindly resend an uncertain message
    // outside that window. Keep pending for explicit provider reconciliation.
    if (now() - booking.mailStartedAt >= 23 * 3600000) return { booking: safeBooking(booking), emailStatus: booking.emailStatus };
    const ar = booking.locale !== 'en', price = booking.pricing?.total ?? booking.items.reduce((n, s) => n + s.price, 0);
    const mailText = ar ? `كلينيمي\n${booking.status === 'cancelled' ? 'أُلغي موعدك' : 'تم تأكيد موعدك'}\nرقم الحجز: ${booking.id}\nالتاريخ: ${booking.date}\nالوقت: ${booking.time} (بتوقيت الرياض)\n${booking.items.map(i => `${i.nameAr}${i.optionAr ? ' — ' + i.optionAr : ''}: ${i.duration} دقيقة، ${i.price} ر.س.`).join('\n')}\nالإجمالي: ${price} ر.س.\nصاحبة الموعد: ${booking.attendee.name}\nالتواصل: ${booking.contact.name}` : `Clinime\n${booking.status === 'cancelled' ? 'Your appointment is cancelled' : 'Your appointment is confirmed'}\nReference: ${booking.id}\nDate: ${booking.date}\nTime: ${booking.time} (Riyadh time)\n${booking.items.map(i => `${i.nameEn}${i.optionEn ? ' — ' + i.optionEn : ''}: ${i.duration} min, SAR ${i.price}`).join('\n')}\nTotal: SAR ${price}\nAttendee: ${booking.attendee.name}\nContact: ${booking.contact.name}`;
    const messageText = mailText + `\n\n${ar ? 'عرض مواعيدي' : 'View appointments'}: ${origin}/#/appointments`;
    const designed = booking.emailTemplateVersion === 2 ? booking.emailMessage || bookingEmail({ booking, origin }) : null;
    let result; try { result = await mail.send({ ...(designed || {}), key: `booking/${booking.id}/${booking.revision}`, to: booking.contact.email, subject: designed?.subject || (ar ? 'تحديث موعدك في كلينيمي' : 'Your Clinime appointment'), text: designed?.text || messageText }); } catch { result = { status: 'pending' }; }
    let updated;
    try {
      updated = await update(store, LEDGER, current => {
        const value = current.bookings[id]; if (value.revision !== booking.revision) return { write: false, result: value };
        // A concurrent accepted send must not be downgraded by another timeout.
        value.emailStatus = value.emailStatus === 'sent' ? 'sent' : result.status;
        return { value: current, result: value };
      });
    } catch { updated = { ...booking, emailStatus: 'pending' }; }
    return { booking: { ...safeBooking(updated), paymentSummary }, emailStatus: updated.emailStatus };
  }
  async function staffCreate(actor,input) {
    const requestId=uuid(input.requestId),address=email(input.customerEmail),id=mac(secret,'user:'+address);
    const ledger=await read(store,LEDGER),replay=ledger?.requests?.['admin:create:'+actor.id+':'+requestId];if(replay&&ledger.bookings[replay.bookingId]?.ownerId!==id)throw new ApiError(409,'IDEMPOTENCY_CONFLICT');
    const customer=await update(store,'user/'+id,current=>current?{write:false,result:current}:{value:{id,email:address,name:'',preferences:{email:true},favorite:false},result:{id,email:address,name:''}});
    return mutate('create',customer,input,null,{admin:true,actor});
  }
  async function getOwned(id, ownerId) { const ledger = await read(store, LEDGER), b = ledger?.bookings[id]; if (!b || b.ownerId !== ownerId) throw new ApiError(404, 'NOT_FOUND'); return b; }
  return { list, availability, adminAvailability, mutate, confirmation, getOwned, staffCreate };
}
function contactNameOf(value) { return value.contactName; }
