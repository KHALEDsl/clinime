/* Booking moments consume server snapshots. They never create bookings or payments. */
(() => {
  'use strict';
  const phases = new Map(), bloomSeen = new Set();
  let freshBloom = null;
  const X = (ar, en) => App.x(ar, en), E = value => App.esc(value);
  const key = b => App.state.auth?.id + ':' + b.id;
  function eligible(b) {
    const g = b?.gift;
    return b?.status === 'confirmed' && g && g.trigger !== 'disabled' && (g.trigger !== 'payment_verified' || b.payment?.status === 'verified') ? g : null;
  }
  function confirmed(b) {
    if (b?.status !== 'confirmed') return;
    const id = key(b); let seen = bloomSeen.has(id);
    try { seen ||= localStorage.getItem('clinime-bloom:' + id) === '1'; localStorage.setItem('clinime-bloom:' + id, '1'); } catch (_) {}
    bloomSeen.add(id); if (!seen) freshBloom = b.id;
  }
  function bloom(b) {
    const animate = freshBloom === b.id; freshBloom = null;
    return window.ClinimeMoments?.bloom({ animate, id: b.id }) || App.icon('check');
  }
  function phase(b) {
    const started = phases.get(key(b));
    return started === 'revealed' || typeof started === 'number' && Date.now() - started >= 3000 ? 'revealed' : typeof started === 'number' ? 'opening' : 'closed';
  }
  function open(b, skip = false) { if (!eligible(b)) return; phases.set(key(b), skip || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'revealed' : Date.now()); }
  function reward(g) {
    if (g.kind === 'thankyou') return `<p>${E(X('شكرًا لثقتك في Nothing Major. نتمنى أن تكون تجربتك معنا مليئة بالراحة والعناية.', 'Thank you for choosing Nothing Major. We hope your experience is filled with comfort and care.'))}</p>`;
    const title = X(g.titleAr || g.titleEn, g.titleEn || g.titleAr), terms = X(g.termsAr || g.termsEn, g.termsEn || g.termsAr);
    return `<section class="moment-reward"><h2>${E(title)}</h2>${g.kind === 'discount' && g.code ? `<div class="moment-code"><div><span>${E(X('كود الهدية', 'Gift code'))}</span><strong dir="ltr" id="actual-gift-code">${E(g.code)}</strong></div><button type="button" class="journey-text" data-action="copy-gift" id="copy-gift-control" aria-describedby="actual-gift-code">${E(X('نسخ الكود', 'Copy code'))}</button></div>` : ''}${terms ? `<p>${E(terms)}</p>` : ''}</section>`;
  }
  function giftBody(b) {
    const g = eligible(b), p = phase(b);
    if (!g) return `<div class="moment-copy"><h1 class="view-heading" tabindex="-1">${E(X('الهدية غير متاحة', 'Gift unavailable'))}</h1><p>${E(X('يمكنك الرجوع إلى موعدك للاطلاع على آخر تفاصيله.', 'Return to your appointment to see its latest details.'))}</p></div>`;
    const art = window.ClinimeMoments?.gift({ phase: p, id: b.id }) || '';
    const artwork = `<div class="moment-artwork">${art}</div>`;
    if (p === 'closed') return `${artwork}<div class="moment-copy"><h1 class="view-heading" tabindex="-1">${E(X('هدية خاصة لكِ', 'A little something for you.'))}</h1><p>${E(X('لأنك تستحقين لحظة جميلة، حضّرنا لك هدية صغيرة.', 'Because you deserve a lovely moment, we have a little something for you.'))}</p></div><button type="button" class="pill-button moment-main-action" data-action="open-gift">${E(X('افتحي هديتك', 'Open your gift'))}</button>`;
    return `${artwork}<div class="moment-copy moment-gift-message ${p === 'opening' ? 'is-revealing' : ''}"><p class="moment-english" lang="en" dir="ltr">A little something for you.</p><h1 class="view-heading" tabindex="-1">${E(X('هدية صغيرة، لأنك تستحقين الاهتمام.', 'A little care, just for you.'))}</h1>${reward(g)}</div><p class="moment-copy-feedback" role="status">${E(App.state.giftFeedback || '')}</p><button type="button" class="pill-button moment-main-action" data-action="booking" data-id="${E(b.id)}">${E(X('عرض تفاصيل موعدي', 'View my appointment'))}</button><button type="button" class="journey-text moment-mail-action" data-action="gift-email" id="gift-email-control" ${App.state.pending ? 'disabled aria-busy="true"' : ''}>${E(App.state.giftEmailStatus === 'sent' ? X('أُرسلت الهدية إلى بريدك', 'Gift sent to your email') : App.state.pending ? X('جارٍ الإرسال…', 'Sending…') : X('أرسلي الهدية إلى بريدي', 'Email me this gift'))}</button>`;
  }
  window.ClinimeExperience = { eligible, confirmed, bloom, phase, open, giftBody };
})();
