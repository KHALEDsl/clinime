/* Pure workspace analysis. No storage, network access, or mutations. */
(function (root, factory) {
  'use strict';
  var engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.StaffGrowthData = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var DAY = 86400000, RIYADH = 10800000;
  var WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function date(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null;
  }
  function stamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null; }
  function localDate(value) { var time = stamp(value); return time === null ? null : new Date(time + RIYADH).toISOString().slice(0, 10); }
  function shift(value, days) { return new Date(Date.parse(value + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10); }
  function weekday(value) { return new Date(value + 'T12:00:00Z').getUTCDay(); }
  function id(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : null; }
  function number(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null; }
  function money(value) { return number(value) === null || value > 1000000000 ? null : Math.round(value * 100); }
  function values(value) { return Array.isArray(value) ? value : value && typeof value === 'object' ? Object.values(value) : []; }
  function own(value, key) { return value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined; }
  function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
  function dedupe(rows, timeKey) {
    var map = new Map(), invalid = 0, duplicate = 0;
    rows.forEach(function (row) {
      if (!row || typeof row !== 'object' || !id(row.id)) { invalid++; return; }
      var previous = map.get(row.id);
      if (!previous) { map.set(row.id, row); return; }
      duplicate++;
      var revision = number(row.revision) || 0, oldRevision = number(previous.revision) || 0;
      var time = stamp(row[timeKey]) || 0, oldTime = stamp(previous[timeKey]) || 0;
      if (revision > oldRevision || revision === oldRevision && (time > oldTime || time === oldTime && row.status === 'cancelled')) map.set(row.id, row);
    });
    return { rows: Array.from(map.values()).sort(function (a, b) { return a.id.localeCompare(b.id); }), invalid: invalid, duplicate: duplicate };
  }
  function accountKey(booking, visit) {
    // A buyer's gift is not evidence of their own treatment or future visit.
    // Unknown attendee kinds also cannot establish personal retention history.
    if (!booking.attendee || booking.attendee.kind !== 'self') return null;
    var address = booking.contact && booking.contact.email;
    if (typeof address === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address.trim())) return address.trim().toLowerCase();
    return id(visit && visit.patientId);
  }
  function catalogMissing(service) {
    var missing = [];
    if (!nonempty(service.nameAr) || !nonempty(service.nameEn)) missing.push('names');
    if (!nonempty(service.description) && !nonempty(service.descriptionAr)) missing.push('description');
    if (money(service.price) === null || service.priceVerified === false) missing.push('price');
    if (!Number.isFinite(service.duration) || service.duration <= 0) missing.push('duration');
    if (!nonempty(service.category)) missing.push('category');
    if (!Array.isArray(service.options) || service.options.some(function (option) { return !option || !nonempty(option.nameAr) || !nonempty(option.nameEn) || money(option.price) === null || !Number.isFinite(option.duration) || option.duration <= 0; })) missing.push('options');
    return missing;
  }
  function analyze(input, options) {
    var workspace = input && typeof input === 'object' ? input : {}, opts = options || {};
    var asOfTime = stamp(workspace.asOf), asOf = asOfTime === null ? null : new Date(asOfTime).toISOString();
    var today = date(opts.today) || localDate(asOf);
    var cutoff = today && asOf ? (today < localDate(asOf) ? today : localDate(asOf)) : today;
    var raw = dedupe(values(workspace.bookings), 'updatedAt'), excludedCancelled = 0, excludedInvalid = raw.invalid, excludedOtherStatuses = 0, excludedFutureRecords = 0;
    var coverageDates = [], bookings = [];
    raw.rows.forEach(function (booking) {
      if (!date(booking.date)) { excludedInvalid++; return; }
      var created = stamp(booking.createdAt);
      if (created !== null && (asOfTime !== null && created > asOfTime || cutoff && localDate(booking.createdAt) > cutoff)) { excludedFutureRecords++; return; }
      if (cutoff && booking.date < cutoff) coverageDates.push(booking.date);
      if (booking.status === 'cancelled') { excludedCancelled++; return; }
      if (booking.status !== 'confirmed') { excludedOtherStatuses++; return; }
      bookings.push(booking);
    });
    var coverageStart = coverageDates.sort()[0] || null, coverageEnd = cutoff ? shift(cutoff, -1) : null;
    var historyDays = coverageStart && coverageEnd >= coverageStart ? Math.round((Date.parse(coverageEnd) - Date.parse(coverageStart)) / DAY) + 1 : 0;
    var visits = workspace.visits && typeof workspace.visits === 'object' ? workspace.visits : {};
    var receiptRows = dedupe(values(workspace.receipts), 'recordedAt'), collected = 0, collectedToday = 0, includedReceipts = 0, excludedReceipts = receiptRows.invalid;
    receiptRows.rows.forEach(function (receipt) {
      var amount = money(receipt.amount), recorded = stamp(receipt.recordedAt), day = localDate(receipt.recordedAt);
      if (amount === null || recorded === null || !cutoff || day > cutoff || asOfTime !== null && recorded > asOfTime || receipt.currency && receipt.currency !== 'SAR' || ['refund', 'credit', 'reversal'].includes(receipt.kind) || ['pending', 'failed', 'cancelled', 'void', 'voided', 'refunded'].includes(receipt.status)) { excludedReceipts++; return; }
      collected += amount; includedReceipts++;
      if (day === today) collectedToday += amount;
    });
    function closedEvidence(visit) {
      if (!visit || visit.stage !== 'closed') return false;
      var ended = stamp(visit.closedAt);
      return ended === null || (asOfTime === null || ended <= asOfTime) && (!cutoff || localDate(visit.closedAt) <= cutoff);
    }
    var daily = new Map(), closedDaily = new Map();
    bookings.forEach(function (booking) { daily.set(booking.date, (daily.get(booking.date) || 0) + 1); });
    bookings.forEach(function (booking) { if (cutoff && booking.date < cutoff && closedEvidence(own(visits, booking.id))) closedDaily.set(booking.date, (closedDaily.get(booking.date) || 0) + 1); });
    var forecastDays = [], eligible = 0;
    if (today) for (var offset = 1; offset <= 7; offset++) {
      var target = shift(today, offset), targetWeekday = weekday(target), samples = [];
      if (coverageStart && coverageEnd) {
        var cursor = coverageEnd, searched = 0;
        while (cursor >= coverageStart && samples.length < 8 && searched < 3660) {
          if (weekday(cursor) === targetWeekday && closedDaily.has(cursor)) samples.push({ date: cursor, count: closedDaily.get(cursor) });
          cursor = shift(cursor, -1); searched++;
        }
      }
      var counts = samples.map(function (sample) { return sample.count; }), booked = daily.get(target) || 0, estimate = null;
      if (samples.length >= 4) {
        eligible++;
        estimate = { low: Math.min.apply(Math, counts), high: Math.max.apply(Math, counts), typical: Math.round(counts.reduce(function (sum, count) { return sum + count; }, 0) / counts.length * 10) / 10 };
      }
      forecastDays.push({ date: target, weekday: WEEKDAYS[targetWeekday], booked: booked, estimate: estimate, comparableDays: samples.length, observedCounts: samples });
    }
    var recommendations = [];
    function recommend(type, priority, title, reason, count, actionLabel, targetIds, evidence, suffix) {
      if (!Number.isFinite(count) || count < 0) return;
      recommendations.push({ id: type + (suffix ? ':' + suffix : ''), type: type, priority: priority, title: title, reason: reason, count: count, actionLabel: actionLabel, targetIds: targetIds.filter(function (target) { return Boolean(id(target)); }).sort(), evidence: evidence });
    }
    var closed = [], upcomingAccounts = new Set(), lastClosed = new Map(), unpaid = [], unresolved = [], unpaidAmount = 0;
    bookings.forEach(function (booking) {
      var visit = own(visits, booking.id) || {}, account = accountKey(booking, visit);
      if (today && booking.date >= today && !['closed', 'checkout'].includes(visit.stage) && account) upcomingAccounts.add(account);
      if (today && booking.date < today && closedEvidence(visit)) {
        closed.push(booking);
        if (account && (!lastClosed.has(account) || booking.date > lastClosed.get(account).date)) lastClosed.set(account, booking);
      }
      if (today && booking.date <= today && visit.stage === 'checkout' && money(visit.balance) > 0) { unpaid.push(booking.id); unpaidAmount += money(visit.balance); }
      else if (today && booking.date < today && visit.stage !== 'closed') unresolved.push(booking.id);
    });
    var retention = Array.from(lastClosed.entries()).filter(function (entry) { return !upcomingAccounts.has(entry[0]); }).map(function (entry) { return entry[1].id; });
    if (unpaid.length) recommend('checkout-unpaid', 1, 'راجعي الزيارات التي تنتظر التحصيل', 'توجد زيارات في مرحلة التحصيل وبها رصيد مسجّل متبقٍ.', unpaid.length, 'مراجعة التحصيل', unpaid, { balance: unpaidAmount / 100, currency: 'SAR', basis: 'workspace-checkout-balances' });
    if (unresolved.length) recommend('visit-unresolved', 1, 'راجعي زيارات الأيام السابقة', 'مواعيد سابقة مؤكدة لم تُسجّل زياراتها مغلقة؛ حالتها تحتاج مراجعة قبل استنتاج نتيجتها.', unresolved.length, 'مراجعة الزيارات', unresolved, { before: today, basis: 'past-not-closed' });
    var stockRows = dedupe(values(workspace.stock), 'updatedAt').rows, lowStock = stockRows.filter(function (item) { return item.quantityVerified === true && number(item.quantity) !== null && number(item.min) !== null && item.quantity <= item.min && item.kind !== 'جهاز'; });
    if (lowStock.length) recommend('stock-low', 1, 'راجعي المواد عند حد التنبيه', 'الكميات الموثّقة لهذه المواد عند حد التنبيه المسجّل أو دونه.', lowStock.length, 'مراجعة المخزون', lowStock.map(function (item) { return item.id; }), { items: lowStock.map(function (item) { return { id: item.id, quantity: item.quantity, minimum: item.min }; }), basis: 'verified-counts' });
    if (retention.length) recommend('retention', 2, 'راجعي فرص عودة العميلات السابقات', 'حسابات لها زيارات سابقة مغلقة ولا يظهر لها حجز مؤكد قادم. المراجعة لا تفترض موافقة على التواصل.', retention.length, 'مراجعة العميلات', retention, { accounts: retention.length, closedVisits: closed.length, before: today, basis: 'past-closed-without-upcoming' });
    var incomplete = dedupe(values(workspace.catalog), 'updatedAt').rows.filter(function (service) { return service.active !== false && service.availability !== 'unavailable'; }).map(function (service) { return { id: service.id, missing: catalogMissing(service) }; }).filter(function (entry) { return entry.missing.length; });
    if (incomplete.length) recommend('catalog-incomplete', 2, 'أكملي بيانات الخدمات المنشورة', 'توجد خدمات فعّالة ينقصها وصف أو بيانات أساسية في الكتالوج الحالي.', incomplete.length, 'مراجعة الخدمات', incomplete.map(function (service) { return service.id; }), { services: incomplete, basis: 'current-catalog-fields' });
    var quieter = forecastDays.filter(function (day) { return day.estimate && day.estimate.typical > day.booked; }).sort(function (a, b) { return a.booked - b.booked || b.estimate.typical - a.estimate.typical || a.date.localeCompare(b.date); })[0];
    if (quieter) recommend('quieter-day', 3, 'راجعي حجوزات ' + quieter.weekday, 'الحجوزات المسجّلة لهذا اليوم أقل من متوسط الزيارات المكتملة في أيام الأسبوع المقارنة. المقاييس مختلفة وهذا لا يثبت وجود طاقة متاحة أو ضعف أداء.', quieter.booked, 'مراجعة اليوم', bookings.filter(function (booking) { return booking.date === quieter.date; }).map(function (booking) { return booking.id; }), { date: quieter.date, booked: quieter.booked, historicalMean: Math.round(quieter.observedCounts.reduce(function (sum, sample) { return sum + sample.count; }, 0) / quieter.comparableDays * 10) / 10, comparableDays: quieter.comparableDays, basis: 'booked-versus-closed-weekday-comparison' }, quieter.date);
    return {
      asOf: asOf, today: today,
      source: { kind: 'workspace', coverageStart: coverageStart, coverageEnd: coverageEnd, inferredCoverage: true, historyDays: historyDays, nonCancelledBookings: bookings.length, closedTrainingVisits: Array.from(closedDaily.values()).reduce(function (sum, count) { return sum + count; }, 0), excludedCancelled: excludedCancelled, excludedOtherStatuses: excludedOtherStatuses, excludedInvalid: excludedInvalid, excludedFutureRecords: excludedFutureRecords, duplicateBookings: raw.duplicate, forecastEligibleDays: eligible, includedReceipts: includedReceipts, excludedReceipts: excludedReceipts, duplicateReceipts: receiptRows.duplicate, collectionBasis: 'recorded-receipts', coverageNote: 'تُستنتج فترة التغطية من أقدم موعد محفوظ؛ الأيام الخالية داخلها ليست إثباتًا لاكتمال التسجيل.' },
      summary: { todayBooked: today ? daily.get(today) || 0 : 0, next7Booked: forecastDays.reduce(function (sum, day) { return sum + day.booked; }, 0), pastClosedVisits: closed.length, retentionCandidates: retention.length, unpaidCheckoutCount: unpaid.length, unpaidCheckoutAmount: unpaidAmount / 100, collectedAmount: collected / 100, collectedTodayAmount: collectedToday / 100, currency: 'SAR' },
      forecast: { status: eligible === 7 ? 'ready' : eligible ? 'partial' : 'insufficient', basis: 'closed-visit-weekday-history', minimumComparableDays: 4, days: forecastDays, note: 'نطاق تاريخي للزيارات المكتملة من آخر 4 إلى 8 تواريخ سابقة لها زيارات مغلقة في يوم الأسبوع نفسه. المواعيد غير المحسومة والملغاة لا تدخل العيّنة، والأيام بلا زيارات مغلقة موثّقة لا تُفترض أصفارًا. الحجوزات القادمة معروضة منفصلة ولا تضمن اكتمال زياراتها. لا يقدّر المبيعات أو الأرباح أو السعة المتاحة.' },
      recommendations: recommendations.sort(function (a, b) { return a.priority - b.priority || a.id.localeCompare(b.id); })
    };
  }
  return Object.freeze({ analyze: analyze });
});
