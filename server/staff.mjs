import { publicTeam } from './professionals.mjs';
import { awardCompletedVisit, bookingPaymentTotals as totals, safePricing } from './loyalty.mjs';
import { CATALOG } from './catalog.mjs';
import { bookingIntervals, snapshotItems } from './bookings.mjs';
import { safeAdminBooking } from './admin.mjs';
import { REFERENCE_MATERIALS, REFERENCE_PRODUCTS } from './staff-reference-catalog.mjs';
import { ApiError, invalid, uuid, mac, canonical, update, read } from './core.mjs';

const LEDGER = 'clinic/booking-ledger-v1', RETENTION = 72 * 3600000;
const ACTIONS = new Set(['medical-save', 'decision-save', 'attendance-save', 'session-start', 'session-notes', 'session-finish', 'session-add-service', 'session-extend', 'payment-record', 'visit-close', 'note-save', 'stock-save', 'product-save', 'service-save', 'catalog-import-reference']);
const BOOKING_ACTIONS = new Set([...ACTIONS].filter(action => !['stock-save', 'product-save', 'service-save', 'catalog-import-reference'].includes(action)));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (map, key) => Object.hasOwn(map, key) ? map[key] : null;
const fail = (code, message) => { throw new ApiError(409, code, message); };
const isoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
function string(value, max = 2000, required = false) {
  if (!required && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || required && !value.trim()) throw invalid();
  return value.trim();
}
function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value) || ['constructor', 'prototype', '__proto__'].includes(value)) throw invalid();
  return value;
}
function integer(value, min = 0, max = 1000000) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw invalid();
  return value;
}
function cents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) throw invalid();
  return Math.round(value * 100);
}
function serviceValue(input) {
  if (!object(input)) throw invalid();
  const service = { id: identifier(input.id), key: string(input.key, 100), nameAr: string(input.nameAr, 160, true), nameEn: string(input.nameEn, 160, true), category: string(input.category, 80, true), price: cents(input.price) / 100, duration: integer(input.duration, 5, 480), image: string(input.image, 2048), options: [] };
  if (service.image && !/^[a-zA-Z0-9_-]+$/.test(service.image)) throw invalid();
  if (input.imageURL !== undefined) { const imageURL = string(input.imageURL, 100); if (imageURL && !/^\/api\/media\/[a-f0-9]{64}$/.test(imageURL)) throw invalid(); service.imageURL = imageURL; }
  if (!Array.isArray(input.options) || input.options.length > 30) throw invalid();
  const seen = new Set();
  service.options = input.options.map(option => {
    if (!object(option)) throw invalid();
    const id = identifier(option.id); if (seen.has(id)) throw invalid(); seen.add(id);
    return { id, key: string(option.key, 100), nameAr: string(option.nameAr, 160, true), nameEn: string(option.nameEn, 160, true), price: cents(option.price) / 100, duration: integer(option.duration, 5, 480) };
  });
  service.discount = input.discount == null ? null : cents(input.discount) / 100;
  if (service.discount !== null && service.options.length) throw new ApiError(400, 'OPTION_DISCOUNT', 'للخدمة ذات الخيارات، عدّلي أسعار الخيارات مباشرة.');
  if (service.discount !== null && service.discount > service.price) throw invalid();
  for (const key of ['prep', 'buffer']) if (input[key] !== undefined) service[key] = integer(input[key], 0, 180);
  service.description = string(input.description, 4000);
  if (input.aftercare !== undefined) service.aftercare = string(input.aftercare, 2000);
  service.followup = integer(input.followup ?? 14, 0, 365);
  if (input.availability !== undefined) { if (!['available', 'review', 'unavailable'].includes(input.availability)) throw invalid(); service.availability = input.availability; }
  if (input.active !== undefined) { if (typeof input.active !== 'boolean') throw invalid(); service.active = input.active; }
  return service;
}
function itemSnapshot(catalog, serviceId, optionId) {
  return snapshotItems([{ serviceId, optionId }], catalog)[0];
}
const initial = () => ({ revision: 0, catalog: structuredClone(CATALOG), medical: {}, stock: {}, products: {}, receipts: [], audit: [], requests: {} });
const initialVisit = () => ({ stage: 'waiting', additions: [], extensionMinutes: 0 });
// This service is called only after the API's existing admin authorization.
// It still requires the server session actor; client-supplied IDs and roles are
// never used for identity, patient lookup, payment ownership, or audit authorship.
export function createStaff({ store, now, secret, bookings, schedule = null, professionals = null, rosterIsSample = false }) {
  // Historical/unassigned bookings share a conservative fallback resource.
  // A booking's scheduled date never releases an unfinished actual session.
  const specialistIds = new Set((professionals || []).map(person => person.id));
  const sessionResource = booking => specialistIds.has(booking.professional) ? 'specialist:' + booking.professional : 'legacy-shared';
  const actor = active => {
    if (!active?.user || typeof active.user.id !== 'string' || !active.user.id) throw new ApiError(401, 'AUTH_REQUIRED');
    return active.user.id;
  };
  const patientId = booking => mac(secret, canonical({ ownerId: booking.ownerId, kind: booking.attendee.kind, name: booking.attendee.name.normalize('NFKC').trim().toLowerCase() }));
  function project(ledger) {
    const staff = ledger?.staff || initial(), visits = {};
    for (const booking of Object.values(ledger?.bookings || {})) {
      const visit = booking._staff || initialVisit();
      visits[booking.id] = { patientId: patientId(booking), stage: visit.stage, additions: structuredClone(visit.additions || []), extensionMinutes: visit.extensionMinutes || 0, ...totals(booking, staff.receipts) };
      for (const key of ['decision', 'attendanceResponse', 'notes', 'sessionNotes', 'aftercare', 'followup', 'startedAt', 'finishedAt', 'closedAt']) if (visit[key] !== undefined) visits[booking.id][key] = structuredClone(visit[key]);
    }
    const stock = Object.fromEntries(Object.entries(staff.stock).map(([id, item]) => [id, { ...item, quantityVerified: item.quantityVerified !== false }]));
    const products = Object.fromEntries(Object.entries(staff.products).map(([id, product]) => { const linked = own(staff.stock, product.stockId); return [id, { ...product, priceVerified: product.priceVerified !== false, quantity: linked?.quantity || 0, quantityVerified: Boolean(linked) && linked.quantityVerified !== false }]; }));
    const stockLog = staff.audit.flatMap(entry => (entry.stockChanges || []).map((change, index) => ({ id: entry.requestId + ':' + index, at: entry.at, ...change })));
    return { ...publicTeam(professionals, rosterIsSample), revision: staff.revision, referenceImported: staff.referenceImported === true, bookings: Object.values(ledger?.bookings || {}).map(safeAdminBooking), catalog: structuredClone(staff.catalog), visits, medical: structuredClone(staff.medical), stock: structuredClone(stock), stockLog, products, receipts: structuredClone(staff.receipts), asOf: new Date(now()).toISOString() };
  }
  async function snapshot(active) { actor(active); return project(await read(store, LEDGER)); }
  function assertSpace(ledger, booking) {
    if (!schedule) throw new ApiError(503, 'SCHEDULE_UNAVAILABLE');
    const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const intervals = bookingIntervals(booking);
    if (intervals.some(([start, end]) => start < minutes(schedule.open) || end > minutes(schedule.close))) fail('SLOT_UNAVAILABLE', 'المدة الجديدة تتجاوز ساعات العمل.');
    if (Object.values(ledger.bookings).some(other => other.id !== booking.id && other.status === 'confirmed' && other.date === booking.date && intervals.some(([start, end]) => bookingIntervals(other).some(([otherStart, otherEnd]) => start < otherEnd && end > otherStart)))) fail('SLOT_UNAVAILABLE', 'المدة الجديدة تتداخل مع موعد آخر.');
  }
  async function mutate(active, input) {
    const actorId = actor(active);
    if (!object(input) || !ACTIONS.has(input.action)) throw invalid();
    const requestId = uuid(input.requestId), revision = integer(input.revision), requestKey = actorId + ':' + requestId;
    const fingerprint = mac(secret, canonical(input));
    return update(store, LEDGER, current => {
      const ledger = current || { schema: 1, bookings: {}, requests: {} }, staff = ledger.staff || initial();
      const replay = staff.requests[requestKey];
      if (replay) {
        if (replay.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'تغيّر محتوى الطلب. حدّثي البيانات قبل المحاولة.');
        return { write: false, result: project(ledger) };
      }
      if (staff.revision !== revision) fail('WORKSPACE_CONFLICT', 'تغيّرت بيانات مساحة العمل. حدّثي الصفحة ثم حاولي مجددًا.');
      let booking, visit, id;
      if (BOOKING_ACTIONS.has(input.action)) {
        if (typeof input.bookingId !== 'string' || !/^CL-[A-F0-9]{24}$/.test(input.bookingId)) throw invalid();
        booking = ledger.bookings[input.bookingId];
        if (!booking) throw new ApiError(404, 'NOT_FOUND');
        if (integer(input.bookingRevision, 1) !== booking.revision) fail('BOOKING_REVISION_CONFLICT', 'تغيّرت بيانات الموعد. حدّثي الصفحة ثم حاولي مجددًا.');
        if (booking.status !== 'confirmed') fail('BOOKING_CANCELLED', 'الموعد ملغى ولا يقبل هذا الإجراء.');
        id = patientId(booking); visit = structuredClone(booking._staff || initialVisit());
      }
      const timestamp = new Date(now()).toISOString(), stockChanges = [];
      let startConfirmation = null;
      const stage = expected => { if (visit.stage !== expected) fail('VISIT_STAGE_CONFLICT', 'تغيّرت مرحلة الزيارة. حدّثي الصفحة قبل المتابعة.'); };
      switch (input.action) {
        case 'medical-save': {
          if (!object(input.fields) || !object(input.flags) || Object.keys(input.fields).length > 40) throw invalid();
          const fields = Object.fromEntries(Object.entries(input.fields).map(([key, value]) => {
            if (!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key) || ['constructor', 'prototype'].includes(key)) throw invalid();
            if (typeof value === 'boolean') return [key, value];
            if (typeof value === 'number') return [key, integer(value, 0, 1000000000)];
            return [key, string(value, 3000)];
          }));
          const flags = {};
          for (const key of ['consultation', 'assessment', 'consent']) { if (typeof input.flags[key] !== 'boolean') throw invalid(); flags[key] = input.flags[key]; }
          staff.medical[id] = { fields, flags, updatedAt: timestamp };
          break;
        }
        case 'decision-save':
          if (!['proceed', 'hold', 'cancel-requested', 'reschedule-requested'].includes(input.decision)) throw invalid();
          if (visit.stage === 'closed') fail('VISIT_STAGE_CONFLICT', 'الزيارة مغلقة.');
          visit.decision = { value: input.decision, note: string(input.note), at: timestamp };
          break;
        case 'attendance-save':
          if (!['ستحضر', 'ستتأخر', 'تطلب إعادة الجدولة', 'لا رد'].includes(input.answer)) throw invalid();
          visit.attendanceResponse = { answer: input.answer, at: timestamp };
          break;
        case 'session-start': {
          for (const key of ['confirmProceed', 'confirmTimeConflict']) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw invalid();
          stage('waiting');
          if (booking.attendance?.status !== 'arrived') fail('ARRIVAL_REQUIRED', 'سجّلي الوصول أولًا.');
          if (Object.values(ledger.bookings).some(other => other.id !== booking.id && other.status === 'confirmed' && other._staff?.stage === 'session' && sessionResource(other) === sessionResource(booking))) fail('SESSION_IN_PROGRESS', 'توجد جلسة جارية لهذه الأخصائية. أنهيها قبل بدء الجلسة التالية.');
          const flags = staff.medical[id]?.flags;
          if (!flags || !flags.consultation || !flags.assessment || !flags.consent) fail('MEDICAL_REVIEW_REQUIRED', 'أكملي مراجعة الاستشارة والتقييم والموافقة أولًا.');
          if (!visit.decision && input.confirmProceed === true) visit.decision = { value: 'proceed', note: '', at: timestamp, source: 'session-start' };
          if (visit.decision?.value !== 'proceed') fail('DECISION_REQUIRED', 'يلزم قرار المتابعة قبل بدء الجلسة.');
          visit.stage = 'session'; visit.startedAt = timestamp;
          startConfirmation = { confirmProceed: input.confirmProceed === true, scheduledDate: booking.date, scheduledTime: booking.time, professional: booking.professional || null, startedAt: timestamp };
          break;
        }
        case 'session-notes': stage('session'); visit.sessionNotes = string(input.notes, 6000); break;
        case 'session-finish':
          stage('session'); visit.aftercare = string(input.aftercare, 4000);
          visit.followup = typeof input.followup === 'boolean' ? input.followup : Boolean(string(input.followup, 2000));
          visit.stage = 'checkout'; visit.finishedAt = timestamp;
          break;
        case 'session-add-service':
          stage('session');
          if (visit.additions.length >= 30) throw new ApiError(503, 'WORKSPACE_CAPACITY');
          visit.additions.push(itemSnapshot(staff.catalog, input.serviceId, input.optionId));
          booking._staff = visit; assertSpace(ledger, booking);
          break;
        case 'session-extend':
          stage('session'); if (![15, 30, 45].includes(input.minutes) || visit.extensionMinutes + input.minutes > 180) throw invalid();
          visit.extensionMinutes += input.minutes; booking._staff = visit; assertSpace(ledger, booking);
          break;
        case 'payment-record': {
          stage('checkout');
          if (!['cash', 'card', 'bank'].includes(input.method)) throw invalid();
          const amount = cents(input.amount), balance = Math.round(totals(booking, staff.receipts).balance * 100);
          if (amount === 0) throw invalid();
          if (amount > balance) fail('PAYMENT_OVER_BALANCE', 'المبلغ أكبر من المتبقي على الزيارة.');
          const receipt = { id: 'RC-' + mac(secret, 'receipt:' + requestKey).slice(0, 24).toUpperCase(), bookingId: booking.id, kind: 'manual', amount: amount / 100, method: input.method, total: totals(booking, staff.receipts).total, ...(booking.pricing ? { pricing: safePricing(booking.pricing) } : {}), lines: structuredClone([...booking.items, ...visit.additions]), recordedAt: timestamp };
          staff.receipts.push(receipt);
          if (amount === balance) { visit.stage = 'closed'; visit.closedAt = timestamp; }
          break;
        }
        case 'visit-close':
          stage('checkout'); if (totals(booking, staff.receipts).balance !== 0) fail('BALANCE_DUE', 'يوجد مبلغ متبقٍ على الزيارة.');
          visit.stage = 'closed'; visit.closedAt = timestamp;
          break;
        case 'note-save': visit.notes = string(input.note, 4000); break;
        case 'stock-save': {
          const values = input.items === undefined ? [input.item] : input.items;
          if (!Array.isArray(values) || !values.length || values.length > 100 || input.items !== undefined && input.item !== undefined) throw invalid();
          const changedIds = new Set();
          for (const value of values) {
          if (!object(value)) throw invalid(); const stockId = identifier(value.id), existing = own(staff.stock, stockId);
          if (changedIds.has(stockId)) throw invalid(); changedIds.add(stockId);
          if (value.revision !== undefined && integer(value.revision) !== (existing?.revision || 0) || value.version !== undefined && integer(value.version) !== (existing?.revision || 0)) fail('STOCK_CONFLICT', 'تغيّرت بيانات المخزون. حدّثيها قبل الحفظ.');
          const explicitQuantity = value.quantity !== undefined;
          const item = { id: stockId, name: string(value.name, 160, true), quantity: explicitQuantity ? integer(value.quantity) : existing?.quantity || 0, quantityVerified: explicitQuantity ? true : Boolean(existing) && existing.quantityVerified !== false, unit: string(value.unit, 40), min: integer(value.min ?? 0), variants: [] };
          for (const key of ['sku', 'type', 'kind', 'condition']) item[key] = string(value[key], 100);
          item.reason = string(value.reason, 1000); item.expiry = string(value.expiry, 10);
          if (item.expiry && !isoDate(item.expiry)) throw invalid();
          if (value.variants !== undefined && (!Array.isArray(value.variants) || value.variants.length > 50)) throw invalid();
          const seen = new Set(); item.variants = (value.variants || []).map(variant => {
            if (!object(variant)) throw invalid(); const variantId = identifier(variant.id); if (seen.has(variantId)) throw invalid(); seen.add(variantId);
            return { id: variantId, name: string(variant.name, 100, true), quantity: integer(variant.quantity) };
          });
          if (item.variants.length) item.quantity = integer(item.variants.reduce((sum, variant) => sum + variant.quantity, 0));
          item.revision = (existing?.revision || 0) + 1; item.version = item.revision; item.updatedAt = timestamp;
          staff.stock[stockId] = item;
          stockChanges.push({ itemId: stockId, name: item.name, quantityBefore: existing?.quantity || 0, quantityBeforeVerified: Boolean(existing) && existing.quantityVerified !== false, quantityAfter: item.quantity, quantityAfterVerified: item.quantityVerified, reason: item.reason });
          }
          break;
        }
        case 'product-save': {
          const value = input.product; if (!object(value)) throw invalid();
          const productId = identifier(value.id), previousProduct = own(staff.products, productId), stockId = value.stockId === null ? 'PS-' + mac(secret, 'product-stock:' + productId).slice(0, 24).toUpperCase() : identifier(value.stockId);
          const existing = own(staff.stock, stockId);
          if (!existing && value.stockId !== null) throw new ApiError(404, 'STOCK_NOT_FOUND');
          if (typeof value.active !== 'boolean') throw invalid();
          if (value.stockRevision !== undefined && integer(value.stockRevision) !== (existing?.revision || 0)) fail('STOCK_CONFLICT', 'تغيّرت بيانات المخزون. حدّثيها قبل الحفظ.');
          const quantity = value.quantity === undefined ? existing?.quantity || 0 : integer(value.quantity);
          if (existing?.variants?.length && quantity !== existing.variants.reduce((sum, variant) => sum + variant.quantity, 0)) fail('VARIANT_STOCK_REQUIRED', 'عدّلي كميات الأصناف من شاشة المخزون.');
          const stockSKU = value.stockSKU === undefined ? existing?.sku || '' : string(value.stockSKU, 100);
          const quantityVerified = value.quantity !== undefined ? true : Boolean(existing) && existing.quantityVerified !== false;
          if (!existing || quantity !== existing.quantity || stockSKU !== existing.sku || quantityVerified !== (existing.quantityVerified !== false)) {
            const stockRevision = (existing?.revision || 0) + 1;
            staff.stock[stockId] = { ...(existing || { id: stockId, name: string(value.name, 160, true), min: 0, unit: 'piece', variants: [] }), quantity, quantityVerified, sku: stockSKU, revision: stockRevision, version: stockRevision, updatedAt: timestamp };
            stockChanges.push({ itemId: stockId, name: staff.stock[stockId].name, quantityBefore: existing?.quantity || 0, quantityBeforeVerified: Boolean(existing) && existing.quantityVerified !== false, quantityAfter: quantity, quantityAfterVerified: quantityVerified, reason: string(value.reason, 1000) });
          }
          staff.products[productId] = { id: productId, name: string(value.name, 160, true), description: string(value.description), category: string(value.category, 100), price: value.price !== undefined ? cents(value.price) / 100 : previousProduct?.price || 0, priceVerified: value.price !== undefined ? true : Boolean(previousProduct) && previousProduct.priceVerified !== false, stockId, active: value.active, updatedAt: timestamp };
          break;
        }
        case 'catalog-import-reference': {
          const unknownStock = metadata => ({ ...metadata, quantity: 0, quantityVerified: false, min: 0, unit: 'piece', expiry: '', variants: [], revision: 1, version: 1, updatedAt: timestamp });
          for (const material of REFERENCE_MATERIALS) if (!own(staff.stock, material.id)) staff.stock[material.id] = unknownStock(material);
          for (const product of REFERENCE_PRODUCTS) {
            if (own(staff.products, product.id)) continue;
            const stockId = product.id + '-stock';
            if (!own(staff.stock, stockId)) staff.stock[stockId] = unknownStock({ id: stockId, name: product.name, sku: '', type: 'مواد استهلاكية', kind: 'مستهلك' });
            staff.products[product.id] = { ...product, price: 0, priceVerified: false, stockId, active: true, updatedAt: timestamp };
          }
          staff.referenceImported = true;
          staff.referenceImportedAt ||= timestamp;
          break;
        }
        case 'service-save': {
          const service = serviceValue(input.service), index = staff.catalog.findIndex(value => value.id === service.id);
          if (index >= 0) staff.catalog[index] = service; else staff.catalog.push(service);
          break;
        }
      }
      if (booking) booking._staff = visit;
      staff.revision += 1;
      staff.requests = Object.fromEntries(Object.entries(staff.requests).filter(([, value]) => value.at > now() - RETENTION));
      staff.requests[requestKey] = { fingerprint, at: now() };
      staff.audit.push({ action: input.action, actorId, bookingId: booking?.id || null, at: timestamp, revision: staff.revision, requestId, ...(stockChanges.length ? { stockChanges } : {}), ...(startConfirmation ? { startConfirmation } : {}) });
      ledger.staff = staff;
      if (booking && visit.stage === 'closed' && ['payment-record', 'visit-close'].includes(input.action)) awardCompletedVisit(ledger, booking, secret, now());
      if (staff.catalog.length > 100 || Object.keys(staff.medical).length > 5000 || Object.keys(staff.stock).length > 1000 || Object.keys(staff.products).length > 1000 || staff.receipts.length > 10000 || staff.audit.length > 20000 || Object.keys(staff.requests).length > 10000 || Buffer.byteLength(JSON.stringify(ledger)) > 8 * 1024 * 1024) throw new ApiError(503, 'WORKSPACE_CAPACITY');
      return { value: ledger, result: project(ledger) };
    });
  }
  return { snapshot, mutate };
}
