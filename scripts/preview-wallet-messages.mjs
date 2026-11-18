import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Loopback-only, read-only preview. Never imports integrations or sends messages.
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const copyFile = resolve(project, 'server/wallet-copy.mjs');
const port = Number(process.env.WALLET_PREVIEW_PORT || 8997);
const assets = new Map([
  ['clinime-logo-light.svg', 'image/svg+xml'],
  ['IBMPlexSansArabic-Regular.ttf', 'font/ttf'],
  ['IBMPlexSansArabic-Medium.ttf', 'font/ttf'],
  ['IBMPlexSansArabic-SemiBold.ttf', 'font/ttf'],
]);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const pick = (value, locale) => typeof value === 'string' ? value : value?.[locale] || value?.ar || '';

async function render(locale) {
  const copy = await import(pathToFileURL(copyFile).href + '?v=' + (await stat(copyFile)).mtimeMs);
  const ar = locale === 'ar', x = (a, e) => ar ? a : e;
  const booking = { id:'PREVIEW-ONLY', date:'2026-11-05', time:'10:00', locale };
  const scenarios = [
    ['confirmed', x('تأكيد الموعد', 'Appointment confirmed'), copy.bookingWalletMessage(booking, 'create')],
    ['updated', x('تعديل الموعد', 'Appointment updated'), copy.bookingWalletMessage(booking, 'update')],
    ['cancelled', x('إلغاء الموعد', 'Appointment cancelled'), copy.bookingWalletMessage(booking, 'cancel')],
    ['sender', x('إهداء المكافأة', 'Gift sent'), copy.giftWalletMessage('sender', locale)],
    ['recipient', x('استلام الهدية', 'Gift received'), copy.giftWalletMessage('recipient', locale)],
    ['stamp', x('إضافة ختم (مثال: باقي ختمان)', 'Stamp added (sample: two stamps remaining)'), pick(copy.WALLET_PROVIDER_COPY.stamp, 'ar').replaceAll('{#}', '٢')],
    ['reward', x('اكتمال المكافأة', 'Reward earned'), pick(copy.WALLET_PROVIDER_COPY.reward, 'ar')],
  ];
  return `<!doctype html><html lang="${locale}" dir="${ar ? 'rtl':'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${x('معاينة إشعارات كلينيمي','Clinime notification preview')}</title><style>
  @font-face{font-family:PlexArabic;src:url('/assets/IBMPlexSansArabic-Regular.ttf')}@font-face{font-family:PlexArabic;src:url('/assets/IBMPlexSansArabic-Medium.ttf');font-weight:500}@font-face{font-family:PlexArabic;src:url('/assets/IBMPlexSansArabic-SemiBold.ttf');font-weight:600}
  :root{--navy:#2D3E5B;--plum:#6C304D;--ink:#412837;--muted:#765F6D;--paper:#FFF9F9;--soft:#F5E9ED;--line:#E5D7DE}*{box-sizing:border-box}html{background:var(--paper);color:var(--ink);font-family:PlexArabic,system-ui,sans-serif;font-size:16px}html:lang(en){font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif}body{margin:0}a{color:var(--plum);text-underline-offset:5px}a:focus-visible,summary:focus-visible{outline:2px solid var(--navy);outline-offset:5px}header,main,footer{max-width:1000px;margin-inline:auto;padding-inline:32px}header{display:flex;justify-content:space-between;align-items:center;gap:24px;min-height:110px}header img{width:112px;height:36px;object-fit:contain}header a{display:flex;align-items:center;min-height:44px;font-size:14px;font-family:system-ui,sans-serif}main{padding-block:28px 44px}h1{font-size:32px;font-weight:500;line-height:1.5;margin:0 0 12px}p{margin:0;line-height:1.9}.intro{max-width:640px;color:var(--muted);font-size:15px}.samples{margin-block:42px 0;display:grid;grid-template-columns:1fr 1fr;column-gap:42px;row-gap:34px}.sample{min-width:0}.sample-label{font-size:13px;font-weight:500;color:var(--muted);margin-block:0 12px}.notification{background:white;padding:22px 24px;border-radius:16px;box-shadow:0 4px 22px #35233308;min-height:158px}.notification[lang=ar]{font-family:PlexArabic,system-ui,sans-serif}.notification-brand{font-size:13px;color:var(--plum);font-weight:600;margin-block-end:8px}.message{font-size:16px;line-height:1.9;overflow-wrap:anywhere;unicode-bidi:plaintext}.provider-note{font-size:12px;line-height:1.8;color:var(--muted);margin-block-start:10px}.compare{margin-block:36px 0;font-size:13px;color:var(--muted)}summary{cursor:pointer;min-height:44px;display:list-item;align-content:center}.before{max-width:620px;margin-block:12px;overflow-wrap:anywhere;line-height:1.9}footer{border-block-start:1px solid var(--line);padding-block:22px 36px;color:var(--muted);font-size:13px}footer p+p{margin-block-start:6px}
  @media(max-width:640px){header,main,footer{padding-inline:24px}header{min-height:88px}main{padding-block-start:16px}h1{font-size:27px}.samples{grid-template-columns:1fr;gap:26px;margin-block-start:30px}.notification{min-height:0;padding:20px}.intro{font-size:14px}.sample-label{margin-block-end:10px}}
  </style></head><body><header><img src="/assets/clinime-logo-light.svg" alt="Clinime"><a href="?lang=${ar?'en':'ar'}" lang="${ar?'en':'ar'}">${ar?'English':'العربية'}</a></header><main><h1>${x('رسائل بطاقة كلينيمي','Clinime card messages')}</h1><p class="intro">${x('معاينة محلية للنصوص الجديدة. الموعد المعروض مثال فقط، ولم تُرسل أي إشعارات.','A local preview of the new messages. The appointment is a sample only. No notifications have been sent.')}</p><div class="samples">${scenarios.map(([id,label,message])=>`<section class="sample" aria-labelledby="label-${id}"><h2 class="sample-label" id="label-${id}">${label}</h2><div class="notification"${['stamp','reward'].includes(id)?' lang="ar" dir="rtl"':''}><p class="notification-brand">${['stamp','reward'].includes(id)?'كلينيمي':x('كلينيمي','Clinime')}</p><p class="message">${escape(message)}</p></div>${['stamp','reward'].includes(id)?`<p class="provider-note">${x('نص معتمد ومطبّق في Loopy. لغة الحملة المشتركة: العربية.','Approved and applied in Loopy. Shared campaign language: Arabic.')}</p>`:''}</section>`).join('')}</div><details class="compare"><summary>${x('مقارنة مع النص السابق','Compare with the previous message')}</summary><p class="before">${escape(ar?'تم تأكيد موعدك في كلينيمي · 2026-11-05 · 10:00 (بتوقيت الرياض) · رقم الحجز: PREVIEW-ONLY':'Your Clinime appointment is confirmed · 2026-11-05 · 10:00 (Riyadh time) · Reference: PREVIEW-ONLY')}</p></details></main><footer><p>${x('كل المعلومات المعروضة تجريبية. هذه معاينة للنص، وليست محاكاة لشاشة الجوال.','All displayed information is sample content. This previews the copy, rather than a phone screen.')}</p><p>${x('تم اعتماد النصوص ونشرها على الموقع وتطبيقها في Loopy.','These messages are approved, published on the site and applied in Loopy.')}</p></footer></body></html>`;
}

const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control','no-store');
  response.setHeader('X-Content-Type-Options','nosniff');
  response.setHeader('Content-Security-Policy',"default-src 'none'; img-src 'self'; font-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    const asset = url.pathname.startsWith('/assets/') ? url.pathname.slice(8) : '';
    if (assets.has(asset)) {
      const bytes = await readFile(resolve(project,'dist/assets',asset));
      response.writeHead(200, {'Content-Type':assets.get(asset)}); response.end(request.method === 'HEAD' ? undefined : bytes); return;
    }
    if (url.pathname !== '/') { response.writeHead(404); response.end('Not found'); return; }
    const html = await render(url.searchParams.get('lang') === 'en' ? 'en' : 'ar');
    response.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); response.end(request.method === 'HEAD' ? undefined : html);
  } catch (error) {
    console.error('Wallet copy preview:', error.message);
    response.writeHead(503, {'Content-Type':'text/plain; charset=utf-8'}); response.end('The local copy preview is not ready yet. Reload once wallet-copy.mjs is available.');
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`Local preview only: http://127.0.0.1:${port} — no provider calls or messages.`));
