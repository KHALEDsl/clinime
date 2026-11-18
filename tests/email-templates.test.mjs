import test from 'node:test';
import assert from 'node:assert/strict';
import { loginEmail, bookingEmail, giftEmail, carePrizeEmail } from '../server/email-templates.mjs';
import { createResendMail } from '../server/mail.mjs';

const origin = 'https://clinic.example';
const booking = (overrides = {}) => ({
  id: 'CL-0123456789ABCDEF01234567', revision: 1, status: 'confirmed', locale: 'en',
  date: '2026-10-29', time: '17:00', attendee: { name: 'Maha' }, contact: { name: 'Maha' },
  items: [{ nameAr: 'تنظيف البشرة', nameEn: 'Facial cleanse', optionAr: 'عميق', optionEn: 'Deep', price: 450, duration: 60 }, { nameAr: 'عناية', nameEn: 'Care', price: 150, duration: 30 }], ...overrides
});

test('login is bilingual, readable without images, and keeps code LTR and one-use expiry', () => {
  for (const locale of ['ar', 'en']) {
    const message = loginEmail({ code: '012345', link: origin + '/#/auth-link?challenge=abc&token=xyz', locale, origin });
    assert.match(message.text, /012345/); assert.match(message.text, /10/);
    assert.match(message.html, /dir="ltr"[^>]*>012345<\/div>/);
    assert.match(message.html, new RegExp(`<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`));
    assert.match(message.html, /href="https:\/\/clinic.example\/#\/auth-link\?challenge=abc&amp;token=xyz"/);
    assert.doesNotMatch(message.html, /<script|onclick|<svg|<form|<button/i);
  }
  assert.match(loginEmail({ code: '012345', link: origin, locale: 'en', origin }).text, /Sign-in code: 012345/);
});

test('unsafe origin or login destination cannot create an injected or off-site CTA', () => {
  for (const invalid of ['http://clinic.example', 'javascript:alert(1)', 'https://user:pass@clinic.example', 'https://clinic.example/a', 'https://clinic.example?evil=1', 'https://clinic.example\n']) {
    assert.throws(() => loginEmail({ code: '123456', link: origin, origin: invalid }));
  }
  for (const link of ['javascript:alert(1)', 'https://attacker.example', 'https://user@clinic.example/', origin + '/\npath']) {
    assert.throws(() => loginEmail({ code: '123456', link, origin }));
  }
  assert.throws(() => loginEmail({ code: '<img/>', link: origin, origin }));
});

test('booking contains authoritative service, date, time, reference, attendee and sum without payment claims', () => {
  const message = bookingEmail({ booking: booking(), origin });
  for (const value of ['2026-10-29', '17:00', 'Riyadh', 'Facial cleanse', 'Deep', 'SAR 600', 'Maha', booking().id]) {
    assert.ok(message.text.includes(value), value); assert.ok(message.html.includes(value), value);
  }
  assert.match(message.html, /href="https:\/\/clinic.example\/#\/booking\/CL-0123456789ABCDEF01234567"/);
  assert.doesNotMatch(message.text, /paid|payment received|branch|address|discount|NM20/i);
  assert.doesNotMatch(message.html, /#\/gift\//);
});

test('changed and cancelled confirmations state the right event and cancelled mail has no success or gift artwork', () => {
  for (const locale of ['ar', 'en']) {
    const changed = bookingEmail({ booking: booking({ locale, revision: 2 }), origin });
    assert.match(changed.subject, locale === 'ar' ? /تغيّر/ : /changed/);
    const cancelled = bookingEmail({ booking: booking({ locale, revision: 3, status: 'cancelled', gift: { kind: 'discount', code: 'REAL', trigger: 'booking_confirmed' } }), origin });
    assert.match(cancelled.subject, locale === 'ar' ? /أُلغي/ : /cancelled/);
    assert.doesNotMatch(cancelled.text + cancelled.html, /moment is booked|تم تأكيد|bloom\.png|gift\.png|#\/gift\//);
  }
  assert.throws(() => bookingEmail({ booking: booking({ status: 'pending' }), origin }));
});

test('dynamic booking and gift values are escaped in HTML, including codes and titles', () => {
  const injected = '<img src=x onerror="alert(1)"> & \'bad\'';
  const message = bookingEmail({ booking: booking({ attendee: { name: injected }, contact: { name: injected }, items: [{ nameAr: injected, nameEn: injected, price: 200, duration: 30 }] }), origin });
  assert.doesNotMatch(message.html, /<img src=x|onerror="alert/);
  assert.match(message.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;bad&#39;/);
  const gift = giftEmail({ booking: booking(), gift: { kind: 'discount', titleEn: injected, code: injected, termsEn: injected }, origin });
  assert.doesNotMatch(gift.html, /<img src=x|onerror="alert/);
  assert.ok(gift.text.includes(injected));
  assert.match(gift.html, /&lt;img src=x/);
});

test('thank-you gift has warm text and real link without inventing a promotion or copy action', () => {
  for (const locale of ['ar', 'en']) {
    const message = giftEmail({ booking: booking(), locale, origin });
    assert.match(message.html, /#\/booking\/CL-0123456789ABCDEF01234567/);
    assert.doesNotMatch(message.text + message.html, /NM20|Discount code|كود الخصم|clipboard|onclick|copy code/i);
    assert.doesNotMatch(message.text, /\d+%/);
    assert.ok(message.text.includes('Clinime') && message.text.includes('Nothing Major'));
  }
  assert.throws(() => giftEmail({ booking: booking({ status: 'cancelled' }), origin }));
  assert.throws(() => giftEmail({ booking: booking(), gift: { kind: 'discount' }, origin }));
});

test('configured reward shows supplied code, title and terms only', () => {
  const gift = { kind: 'discount', code: 'REAL-25', titleAr: 'هدية العناية', titleEn: 'Care gift', termsAr: 'صالحة لخدمة محددة.', termsEn: 'For one specified service.' };
  for (const locale of ['ar', 'en']) {
    const message = giftEmail({ booking: booking(), gift, locale, origin });
    assert.ok(message.text.includes(gift.code));
    assert.ok(message.text.includes(locale === 'ar' ? gift.titleAr : gift.titleEn));
    assert.ok(message.text.includes(locale === 'ar' ? gift.termsAr : gift.termsEn));
    assert.doesNotMatch(message.html, /NM20/);
  }
});

test('email-only presentation embeds motion with static fallback and never sends the reader to a gift webpage', () => {
  const confirmed = bookingEmail({ booking: booking({ gift:{ kind:'thankyou', trigger:'booking_confirmed' } }), origin });
  assert.match(confirmed.html, /bloom\.gif/); assert.match(confirmed.html, /bloom\.png/); assert.match(confirmed.html, /prefers-reduced-motion/); assert.doesNotMatch(confirmed.html+confirmed.text, /#\/gift\//);
  const gift = giftEmail({ booking: booking(), origin });assert.match(gift.html,/gift\.gif/);assert.match(gift.html,/gift\.png/);assert.doesNotMatch(gift.html+gift.text, /#\/gift\/|onclick|<script/);assert.match(gift.html, /View my appointment|عرض تفاصيل موعدي/);
  const cancelled=bookingEmail({booking:booking({status:'cancelled'}),origin});assert.doesNotMatch(cancelled.html,/bloom\.gif|gift\.gif/);
});

test('Resend submits HTML and text together while retaining idempotency and uncertainty classification', async () => {
  let captured;
  const message = { key: 'booking/test/1', to: 'test@example.com', ...bookingEmail({ booking: booking(), origin }) };
  const mail = createResendMail({ apiKey: 'test-key', from: 'clinic@example.com', fetcher: async (_url, options) => { captured = options; return Response.json({ id: 'accepted' }); } });
  assert.deepEqual(await mail.send(message), { status: 'sent' });
  const body = JSON.parse(captured.body); assert.equal(body.html, message.html); assert.equal(body.text, message.text); assert.equal(captured.headers['Idempotency-Key'], message.key);
  for (const [status, expected] of [[422, 'failed'], [408, 'pending'], [409, 'pending'], [429, 'pending'], [500, 'pending']]) {
    assert.equal((await createResendMail({ fetcher: async () => new Response('', { status }) }).send(message)).status, expected);
  }
  assert.equal((await createResendMail({ fetcher: async () => { throw Error('timeout'); } }).send(message)).status, 'pending');
  assert.equal((await createResendMail({ fetcher: async () => Response.json({}) }).send(message)).status, 'pending');
});

 test('standalone thank-you email needs no fabricated booking or reward',()=>{const m=giftEmail({origin,locale:'ar'});assert.match(m.html,/gift\.gif/);assert.match(m.html,/#\/home/);assert.match(m.html,/اكتشفي خدماتنا/);assert.doesNotMatch(m.html+m.text,/NM20|#\/gift\/|#\/booking\/|كود الخصم/);});

test('Care Point victory email is bilingual with live amount/name, balance CTA, decorative GIF and static fallback', () => {
  for (const locale of ['ar', 'en']) {
    const message = carePrizeEmail({ firstName: 'خالد', amountSar: 100, weekKey: '2026-11-08', origin, locale });
    assert.match(message.text, /خالد/); assert.match(message.text, /100/);
    assert.match(message.html, /خالد/); assert.match(message.html, locale === 'ar' ? /١٠٠/ : />100</);
    assert.match(message.html, /care-victory\.gif/); assert.match(message.html, /care-victory\.png/);
    assert.match(message.html, /prefers-reduced-motion/);
    assert.match(message.html, /href="https:\/\/clinic.example\/#\/referrals"/);
    assert.match(message.html, new RegExp(`<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}"`));
    assert.doesNotMatch(message.html, /<script|onclick|<svg|<form|<button/i);
    assert.doesNotMatch(message.html + message.text, /highest|أعلى مجموع|#\/care-point/);
  }
});

test('Care Point victory email escapes recipient HTML and rejects wrong amounts, invalid dates and unsafe origins', () => {
  const name = '<img src=x onerror="alert(1)"> & خالد';
  const message = carePrizeEmail({ firstName: name, weekKey: '2026-11-08', origin });
  assert.match(message.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; خالد/);
  assert.doesNotMatch(message.html, /<img src=x|onerror="alert/);
  assert.ok(message.text.includes(name));
  for (const amountSar of [0, 99, 101, '100', NaN]) assert.throws(() => carePrizeEmail({ firstName: 'خالد', amountSar, weekKey: '2026-11-08', origin }));
  for (const weekKey of ['2026-02-31', '2026-99-01', '<img>', null]) assert.throws(() => carePrizeEmail({ firstName: 'خالد', weekKey, origin }));
  assert.throws(() => carePrizeEmail({ firstName: 'خالد', weekKey: '2026-11-08', origin: 'javascript:alert(1)' }));
});
