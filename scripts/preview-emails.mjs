import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loginEmail, bookingEmail, giftEmail } from '../server/email-templates.mjs';

// Local visual fixtures only. Never send these sample messages to a provider.
const output = resolve(process.argv[2] || 'outputs/email-preview');
await mkdir(output, { recursive: true });
const origin = process.env.EMAIL_PREVIEW_ORIGIN || 'https://clinic.example';
const booking = { id: 'CL-0123456789ABCDEF01234567', locale: 'ar', revision: 1, status: 'confirmed', date: '2026-10-29', time: '17:00', attendee: { name: 'مها أحمد' }, contact: { name: 'مها أحمد' }, gift: { kind: 'thankyou', trigger: 'booking_confirmed' }, items: [{ nameAr: 'تنظيف البشرة العميق', nameEn: 'Deep facial cleanse', optionAr: 'عناية متكاملة', optionEn: 'Complete care', price: 450, duration: 60 }] };
const previews = [];
for (const locale of ['ar', 'en']) {
  const fixture = { ...booking, locale, ...(locale === 'en' ? { attendee: { name: 'Maha Ahmed' }, contact: { name: 'Maha Ahmed' } } : {}) };
  const variants = {
    login: loginEmail({ code: '012345', link: origin + '/#/auth-link?challenge=preview&token=preview', locale, origin }),
    booking: bookingEmail({ booking: fixture, origin }),
    changed: bookingEmail({ booking: { ...fixture, revision: 2 }, origin }),
    cancelled: bookingEmail({ booking: { ...fixture, revision: 3, status: 'cancelled' }, origin }),
    thanks: giftEmail({ booking: fixture, origin, locale }),
    reward: giftEmail({ booking: fixture, origin, locale, gift: { kind: 'benefit', titleAr: 'معاينة هدية تجريبية', titleEn: 'Sample gift preview', termsAr: 'هذه بيانات معاينة فقط، وليست عرضًا صالحًا.', termsEn: 'Preview data only. This is not a valid offer.' } })
  };
  for (const [name, message] of Object.entries(variants)) {
    const file = `${name}-${locale}.html`; previews.push(file);
    await writeFile(resolve(output, file), message.html);
    await writeFile(resolve(output, `${name}-${locale}.txt`), message.text);
  }
}
await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Clinime email previews</title><body style="font:16px Arial;padding:32px"><h1>Clinime email previews</h1><p>Sample content. Links and codes are preview fixtures.</p><ul>${previews.map(file => `<li><a href="${file}">${file}</a></li>`).join('')}</ul></body></html>`);
console.log(output);
