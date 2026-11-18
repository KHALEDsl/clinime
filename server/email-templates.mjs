// Transactional content stays readable when external images or custom fonts are blocked.
// Raster illustrations are decorative; never put booking details, rewards or codes in them.
const FONT = "'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif";
const BLUE = '#315F85', INK = '#17334D', MUTED = '#53677B';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const language = locale => locale === 'en' ? 'en' : 'ar';

function secureOrigin(value) {
  let url; try { url = new URL(value); } catch { throw new TypeError('Email origin must be an HTTPS origin'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || /[\u0000-\u0020\u007f]/.test(value)) throw new TypeError('Email origin must be an HTTPS origin');
  return url.origin;
}
function safeLink(value, origin) {
  let url; try { url = new URL(value); } catch { throw new TypeError('Email link must be an HTTPS URL'); }
  if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || /[\u0000-\u0020\u007f]/.test(value)) throw new TypeError('Email link must use the configured HTTPS origin');
  return url.href;
}
function route(origin, path, id) { return `${origin}/#/${path}/${encodeURIComponent(String(id))}`; }
const paragraph = (content, style = '') => `<p style="margin:0 0 16px;font-size:16px;line-height:1.85;color:${MUTED};${style}">${content}</p>`;
const isolated = value => `<span dir="ltr" style="direction:ltr;unicode-bidi:isolate;display:inline-block;max-width:100%;overflow-wrap:anywhere;word-break:break-word">${escape(value)}</span>`;
function button(label, href, pink = false) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:26px auto 18px"><tr><td align="center" bgcolor="${pink ? '#F3B6C8' : BLUE}" style="border-radius:12px;background:${pink ? '#F3B6C8' : BLUE}"><a href="${escape(href)}" style="display:inline-block;padding:15px 30px;border:1px solid ${pink ? '#F3B6C8' : BLUE};border-radius:12px;color:${pink ? INK : '#FFFFFF'};font-family:${FONT};font-size:16px;font-weight:600;line-height:1.5;text-decoration:none">${escape(label)}</a></td></tr></table>`;
}
function details(rows, ar) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border:1px solid #DFE8F2;border-radius:16px;background:#F9FBFF;table-layout:fixed">${rows.map(([label, value, ltr]) => ['Reference','رقم الحجز'].includes(label) ? `<tr><td colspan="2" style="padding:14px 18px;color:${MUTED};font-size:13px;line-height:1.8">${escape(label)}<div dir="ltr" style="margin-top:6px;font-size:12px;line-height:1.8;color:${INK};overflow-wrap:anywhere;word-break:break-word;text-align:${ar?'right':'left'}">${escape(value)}</div></td></tr>` : `<tr><td style="padding:14px 18px;vertical-align:top;width:32%;border-bottom:1px solid #E7EDF5;font-size:13px;line-height:1.8;color:${MUTED};text-align:${ar ? 'right' : 'left'}">${escape(label)}</td><td style="padding:14px 18px;vertical-align:top;border-bottom:1px solid #E7EDF5;font-size:15px;line-height:1.8;color:${INK};font-weight:500;overflow-wrap:anywhere;word-break:break-word;text-align:${ar ? 'right' : 'left'}">${ltr ? isolated(value) : escape(value)}</td></tr>`).join('')}</table>`;
}
function layout({ locale, origin, subject, preheader, eyebrow, title, body, asset }) {
  const ar = locale === 'ar', dir = ar ? 'rtl' : 'ltr';
  return `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(subject)}</title><style>@media(prefers-reduced-motion:reduce){.email-motion{display:none!important}.email-static{display:block!important}}</style></head><body dir="${dir}" style="margin:0;padding:0;background:#F0F4FA;color:${INK};font-family:${FONT};-webkit-text-size-adjust:100%"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escape(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#F0F4FA" style="width:100%;background:#F0F4FA"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border:1px solid #DEE7F1;border-radius:24px;background:#FFFFFF;overflow:hidden"><tr><td align="center" style="padding:30px 24px 24px;border-bottom:1px solid #E9EEF6"><a href="${escape(origin)}" dir="ltr" style="text-decoration:none;color:${INK}"><img src="${escape(origin + '/assets/email/logo.png')}" width="110" height="35" alt="Clinime" style="display:block;border:0;width:110px;max-width:100%;height:35px"></a></td></tr>${asset ? `<tr><td align="center" bgcolor="#F5F7FC" style="padding:0;background:#F5F7FC"><img class="email-motion" src="${escape(origin + '/assets/email/' + asset)}" alt="" width="598" height="250" style="display:block;width:100%;max-width:598px;height:auto;border:0;color:transparent">${asset.endsWith('.gif') ? `<img class="email-static" src="${escape(origin + '/assets/email/' + asset.replace('.gif','.png'))}" alt="" width="598" height="250" style="display:none;width:100%;max-width:598px;height:auto;border:0">` : ''}</td></tr>` : ''}<tr><td dir="${dir}" style="padding:32px 24px 28px;text-align:${ar ? 'right' : 'left'}"><p style="margin:0 0 10px;text-align:center;font-size:12px;line-height:1.6;letter-spacing:0;color:${BLUE};font-weight:600">${escape(eyebrow)}</p><h1 style="margin:0 0 22px;text-align:center;font-family:${ar ? FONT : "Georgia,'Times New Roman',serif"};font-size:${ar ? '28' : '32'}px;line-height:1.45;font-weight:${ar ? '600' : '400'};color:${INK}">${escape(title)}</h1>${body}</td></tr><tr><td align="center" style="padding:23px 24px;background:#F9FBFF;border-top:1px solid #E9EEF6"><p style="margin:0;font-size:12px;line-height:1.8;color:${MUTED}">${ar ? 'كلينيمي · Nothing Major' : 'Clinime · Nothing Major'}</p></td></tr></table></td></tr></table></body></html>`;
}
function fallback(label, href) { return paragraph(`${escape(label)}<br><a href="${escape(href)}" dir="ltr" style="font-size:11px;line-height:1.7;color:${BLUE};overflow-wrap:anywhere;word-break:break-all">${escape(href)}</a>`, 'font-size:12px;text-align:center;margin-bottom:0'); }
export function loginEmail({ code, link, locale, origin }) {
  const loc = language(locale), ar = loc === 'ar', base = secureOrigin(origin), href = safeLink(link, base);
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new TypeError('Sign-in code must contain six digits');
  const subject = ar ? 'رمز الدخول إلى كلينيمي' : 'Your Clinime sign-in code';
  const title = ar ? 'أهلًا بك في كلينيمي' : 'A moment for yourself.';
  const intro = ar ? 'أدخلي الرمز التالي لإكمال تسجيل الدخول.' : 'Enter this code to finish signing in.';
  const expiry = ar ? 'الرمز ورابط الدخول صالحان لمدة 10 دقائق ويُستخدمان مرة واحدة.' : 'The code and sign-in link are valid for 10 minutes and one use.';
  const safety = ar ? 'إن لم تطلبي تسجيل الدخول، تجاهلي هذه الرسالة. لا تشاركي الرمز أو الرابط مع أي شخص.' : 'If you did not request this, ignore this email. Do not share the code or link.';
  const cta = ar ? 'سجّلي الدخول' : 'Sign in';
  const body = paragraph(escape(intro), 'text-align:center') + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;background:#EDF4FA;border:1px solid #DFE8F2;border-radius:16px"><tr><td align="center" style="padding:23px 12px"><p style="margin:0 0 7px;font-size:12px;color:${MUTED}">${ar ? 'رمز الدخول' : 'Sign-in code'}</p><div dir="ltr" style="direction:ltr;font-family:Tahoma,Arial,sans-serif;font-size:38px;line-height:1.6;letter-spacing:9px;font-weight:600;color:${INK}">${escape(code)}</div></td></tr></table>` + paragraph(escape(expiry), 'font-size:14px;text-align:center') + button(cta, href) + paragraph(escape(safety), 'font-size:13px;text-align:center') + fallback(ar ? 'إذا لم يفتح الزر، استخدمي هذا الرابط:' : 'If the button does not open, use this link:', href);
  return { subject, text: `Clinime · Nothing Major\n${intro}\n${ar ? 'رمز الدخول' : 'Sign-in code'}: ${code}\n${expiry}\n${cta}: ${href}\n${safety}`, html: layout({ locale: loc, origin: base, subject, preheader: expiry, eyebrow: ar ? 'تسجيل الدخول' : 'Sign in', title, body }) };
}

export function bookingEmail({ booking, origin }) {
  const loc = language(booking.locale), ar = loc === 'ar', base = secureOrigin(origin);
  if (!['confirmed', 'cancelled'].includes(booking.status)) throw new TypeError('Unsupported booking status');
  const cancelled = booking.status === 'cancelled', changed = !cancelled && booking.revision > 1;
  const subject = cancelled ? (ar ? 'أُلغي موعدك في كلينيمي' : 'Your Clinime appointment is cancelled') : changed ? (ar ? 'تغيّر موعدك في كلينيمي' : 'Your Clinime appointment has changed') : (ar ? 'تم تأكيد موعدك في كلينيمي' : 'Your Clinime appointment is confirmed');
  const title = cancelled ? (ar ? 'أُلغي موعدك' : 'Your appointment is cancelled.') : changed ? (ar ? 'تم تحديث موعدك' : 'Your new appointment is ready.') : (ar ? 'تم تأكيد موعدك' : 'Your self-care moment is booked.');
  const intro = cancelled ? (ar ? 'هذا الموعد ملغى. يمكنك مراجعة تفاصيله من صفحة الحجز.' : 'This appointment is cancelled. You can review its details on the booking page.') : changed ? (ar ? 'هذه أحدث تفاصيل موعدك. نتطلع للعناية بك.' : 'These are your latest appointment details. We look forward to caring for you.') : (ar ? 'نتطلع للعناية بك. إليك تفاصيل موعدك.' : 'We look forward to caring for you. Here are your appointment details.');
  const services = booking.items.map(i => `${ar ? i.nameAr : i.nameEn}${(ar ? i.optionAr : i.optionEn) ? '، ' + (ar ? i.optionAr : i.optionEn) : ''} · ${i.duration} ${ar ? 'دقيقة' : 'min'} · ${ar ? i.price + ' ر.س.' : 'SAR ' + i.price}`).join('\n');
  const total = booking.pricing?.total ?? booking.items.reduce((sum, item) => sum + item.price, 0);
  const rows = [[ar ? 'التاريخ' : 'Date', booking.date, true], [ar ? 'الوقت' : 'Time', booking.time, true], [ar ? 'التوقيت' : 'Time zone', ar ? 'الرياض (UTC+03:00)' : 'Riyadh (UTC+03:00)', false], [ar ? 'الخدمات' : 'Services', services, false], ...(booking.pricing?.discount ? [[ar ? 'قبل الخصم' : 'Subtotal', ar ? `${booking.pricing.subtotal} ر.س.` : `SAR ${booking.pricing.subtotal}`, false], [ar ? 'الخصم' : 'Discount', ar ? `${booking.pricing.discount} ر.س.` : `SAR ${booking.pricing.discount}`, false]] : []), [ar ? 'الإجمالي' : 'Total', ar ? `${total} ر.س.` : `SAR ${total}`, false], [ar ? 'صاحبة الموعد' : 'Attendee', booking.attendee.name, false], [ar ? 'التواصل' : 'Contact', booking.contact.name, false], [ar ? 'رقم الحجز' : 'Reference', booking.id, true]];
  const href = route(base, 'booking', booking.id), cta = ar ? 'اعرضي تفاصيل الحجز' : 'View booking details';
  const body = paragraph(escape(intro), 'text-align:center') + details(rows, ar).replaceAll('\n', '<br>') + button(cta, href) + fallback(ar ? 'رابط تفاصيل الحجز:' : 'Booking details link:', href);
  return { subject, text: `Clinime · Nothing Major\n${title}\n${intro}\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n${cta}: ${href}\n\n${ar ? 'عرض مواعيدي' : 'View appointments'}: ${base}/#/appointments`, html: layout({ locale: loc, origin: base, subject, preheader: intro, eyebrow: ar ? 'موعدك في كلينيمي' : 'Your Clinime appointment', title, body, asset: cancelled ? null : 'bloom.gif' }) };
}

export function giftEmail({ booking, gift = { kind: 'thankyou' }, origin, locale }) {
  if (booking && booking.status !== 'confirmed') throw new TypeError('A booking-linked gift email requires a confirmed booking');
  const loc = language(locale ?? booking?.locale), ar = loc === 'ar', base = secureOrigin(origin);
  if (!gift || !['thankyou', 'discount', 'benefit'].includes(gift.kind)) throw new TypeError('Unsupported gift kind');
  if (gift.kind === 'discount' && (typeof gift.code !== 'string' || !gift.code.trim())) throw new TypeError('A discount gift requires its configured code');
  const reward = gift.kind !== 'thankyou', code = reward && typeof gift.code === 'string' ? gift.code.trim() : '';
  const subject = ar ? (reward ? 'هدية خاصة لك من كلينيمي' : 'شكرًا لاختيارك كلينيمي') : (reward ? 'A little something from Clinime' : 'Thank you for choosing Clinime');
  const title = (ar ? gift.titleAr : gift.titleEn) || (ar ? (reward ? 'هدية خاصة لك' : 'شكرًا لثقتك بنا') : (reward ? 'A little something for you.' : 'Thank you for trusting us.'));
  const intro = ar ? (reward ? 'لأن العناية بنفسك تستحق لمسة إضافية. هذه هديتك من كلينيمي · Nothing Major.' : 'يسعدنا أن نكون جزءًا من وقتك للعناية بنفسك. نتطلع للقائك في كلينيمي · Nothing Major.') : (reward ? 'Your self-care deserves a little extra. A gift from Clinime · Nothing Major.' : 'We are glad to be part of your time for self-care. We look forward to seeing you at Clinime · Nothing Major.');
  const terms = (ar ? gift.termsAr : gift.termsEn) || '', href = booking ? route(base, 'booking', booking.id) : base + '/#/home', cta = booking ? (ar ? 'عرض تفاصيل موعدي' : 'View my appointment') : (ar ? 'اكتشفي خدماتنا' : 'Explore our services');
  const codeLabel = ar ? (gift.kind === 'discount' ? 'كود الخصم' : 'كود الهدية') : (gift.kind === 'discount' ? 'Discount code' : 'Gift code');
  const body = paragraph(escape(intro), 'text-align:center') + (code ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;background:#FCEFF4;border:1px solid #F3DAE4;border-radius:16px"><tr><td align="center" style="padding:20px"><p style="margin:0 0 6px;font-size:13px;color:${MUTED}">${codeLabel}</p><p dir="ltr" style="margin:0;direction:ltr;font-size:27px;line-height:1.7;letter-spacing:3px;overflow-wrap:anywhere;word-break:break-word;font-weight:600;color:${INK}">${escape(code)}</p></td></tr></table>` : '') + (terms ? paragraph(escape(terms), 'font-size:13px;text-align:center;white-space:pre-line') : '') + button(cta, href, true) + fallback(booking ? (ar ? 'رابط الموعد:' : 'Appointment link:') : (ar ? 'رابط الخدمات:' : 'Services link:'), href);
  return { subject, text: `Clinime · Nothing Major\n${title}\n${intro}${code ? `\n${codeLabel}: ${code}` : ''}${terms ? `\n${terms}` : ''}\n${cta}: ${href}`, html: layout({ locale: loc, origin: base, subject, preheader: title, eyebrow: ar ? 'لك من كلينيمي' : 'From Clinime, with care', title, body, asset: 'gift.gif' }) };
}

// Called only after the weekly prize is confirmed in the wallet ledger.
export function carePrizeEmail({ firstName, amountSar = 100, weekKey, origin, locale = 'ar' }) {
  const loc = language(locale), ar = loc === 'ar', base = secureOrigin(origin);
  if (amountSar !== 100) throw new TypeError('Care Point prize must be 100 SAR');
  const date = typeof weekKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekKey) ? new Date(weekKey + 'T12:00:00Z') : null;
  if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== weekKey) throw new TypeError('Care Point week must be a calendar date');
  const week = new Intl.DateTimeFormat(ar ? 'ar-SA-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(date);
  const name = String(firstName ?? '').trim(), amount = new Intl.NumberFormat(ar ? 'ar-SA' : 'en-GB').format(amountSar);
  const subject = ar ? 'مبروك! جائزة نقطة عناية في محفظتك' : 'You won! Your Care Point prize is in your wallet';
  const title = ar ? 'مبروك، جائزة نقطة عناية لك.' : 'Your Care Point prize is here.';
  const greeting = ar ? (name ? `أهلًا ${name}،` : 'أهلًا بك،') : (name ? `Hello ${name},` : 'Hello,');
  const intro = ar ? 'مبروك فوزك بجائزة نقطة عناية! أُضيفت الجائزة إلى رصيد محفظتك في كلينيمي.' : 'Congratulations on your Care Point prize! It has been added to your Clinime wallet balance.';
  const note = ar ? 'رصيدك متاح للاستخدام عند حجز خدماتك. نقاط التحدّي منفصلة عن رصيد المحفظة.' : 'Your credit is available when booking treatments. Challenge points are separate from your wallet balance.';
  const href = base + '/#/referrals', cta = ar ? 'عرض رصيدي' : 'View my balance';
  const body = paragraph(escape(greeting), 'text-align:center;font-weight:600;color:' + INK) + paragraph(escape(intro), 'text-align:center') + `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;background:#FCEFF4;border:1px solid #F3DAE4;border-radius:18px"><tr><td align="center" style="padding:24px 16px"><p style="margin:0 0 7px;font-size:13px;line-height:1.8;color:${MUTED}">${ar ? 'جائزة نقطة عناية' : 'Care Point prize'}</p><p style="margin:0;font-family:${FONT};font-size:46px;line-height:1.5;font-weight:600;color:${INK}"><span dir="ltr" style="display:inline-block;unicode-bidi:isolate">${escape(amount)}</span> <span style="font-size:18px;font-weight:400">${ar ? 'ريال سعودي' : 'SAR'}</span></p><p style="margin:8px 0 0;font-size:12px;line-height:1.8;color:${MUTED}">${ar ? 'أسبوع' : 'Week of'} ${escape(week)}</p></td></tr></table>` + paragraph(escape(note), 'font-size:14px;text-align:center') + button(cta, href, true) + fallback(ar ? 'رابط رصيدك في كلينيمي:' : 'Your Clinime balance link:', href);
  return {
    subject,
    text: `Clinime · Nothing Major\n${greeting}\n${intro}\n${ar ? 'جائزة نقطة عناية: 100 ريال سعودي' : 'Care Point prize: SAR 100'}\n${ar ? 'أسبوع' : 'Week of'} ${week}\n${note}\n${cta}: ${href}`,
    html: layout({ locale: loc, origin: base, subject, preheader: intro, eyebrow: ar ? 'نقطة عناية · جائزة الأسبوع' : 'Care Point · Weekly prize', title, body, asset: 'care-victory.gif' })
  };
}
