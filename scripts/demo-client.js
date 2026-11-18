// This helper is injected by the loopback demo server, never by production builds.
(() => {
  'use strict';
  const context = new URL(document.currentScript.src).searchParams;
  const actor = context.get('actor') || 'customer', scenario = context.get('scenario') || 'ready';
  const nativeFetch = window.fetch.bind(window);
  window.ClinimeDemo = Object.freeze({ actor, scenario, localOnly: true });
  window.fetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
    if (url.origin !== location.origin) return Promise.reject(new Error('External requests are disabled in this local demo.'));
    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('X-Clinime-Demo-Actor', actor);
      headers.set('X-Clinime-Demo-Scenario', scenario);
      return nativeFetch(input, { ...init, headers }).then(response => {
        if (url.pathname === '/api/auth/logout' && actor !== 'guest' && response.ok) location.assign('/demo');
        return response;
      });
    }
    return nativeFetch(input, init);
  };
  const page = actor === 'admin' ? '/admin' : '/customer';
  document.addEventListener('DOMContentLoaded', () => {
    if (location.pathname.startsWith('/game/')) return;
    const style = document.createElement('style');
    style.textContent = '#clinime-demo-tools{position:fixed;z-index:10000;bottom:calc(100px + env(safe-area-inset-bottom, 0px));left:12px;font:13px/1.6 system-ui;direction:rtl;color:#2d3e5b;background:#fff;border:1px solid #cbd1d9;border-radius:12px;box-shadow:0 4px 18px #20304a18;max-width:min(320px,calc(100vw - 24px))}#clinime-demo-tools summary{cursor:pointer;padding:8px 12px;min-height:24px}#clinime-demo-tools>div{padding:0 14px 14px;max-height:65vh;overflow:auto}#clinime-demo-tools a{color:#2d3e5b;display:inline-block;padding:5px 8px}#clinime-demo-tools select,#clinime-demo-tools button{font:inherit;min-height:40px;border:1px solid #b8c0cc;border-radius:7px;background:#fff;padding:6px;color:#2d3e5b}#clinime-demo-tools p{margin:6px 0}';
    document.head.append(style);
    const tools = document.createElement('details'); tools.id = 'clinime-demo-tools';
    tools.innerHTML = '<summary>تجربة محلية · Demo</summary><div><p>بيانات تجريبية فقط. البريد والبطاقة محليان، ولا توجد مدفوعات أو رسائل خارجية.</p><label>حالة العرض <select aria-label="Demo state">' + ['ready', 'empty', 'slow', 'error', 'insufficient'].map(value => '<option ' + (value === scenario ? 'selected' : '') + ' value="' + value + '">' + ({ ready: 'جاهزة · Ready', empty: 'فارغة · Empty', slow: 'تحميل بطيء · Slow', error: 'خطأ قابل للاستعادة · Error', insufficient: 'سجل قصير · Insufficient' })[value] + '</option>').join('') + '</select></label><p><button type="button" data-demo-recover>استعادة الحالة الجاهزة</button></p><nav><a href="/demo">كل الواجهات</a><a href="/demo/mail?scenario=' + scenario + '" target="_blank" rel="noopener">البريد التجريبي</a><a href="/admin?scenario=' + scenario + '" target="_blank" rel="noopener">الإدارة</a><a href="/customer?scenario=' + scenario + '" target="_blank" rel="noopener">العميلة</a><a href="/customer?actor=friend&scenario=' + scenario + '#/loyalty" target="_blank" rel="noopener">المستفيدة من الهدية</a></nav><form method="post" action="/demo/reset?scenario=' + scenario + '&actor=' + actor + '"><button>إعادة بيانات هذه الحالة</button></form></div>';
    const switchState = value => { const url = new URL(location.href); url.searchParams.set('scenario', value); url.searchParams.set('actor', actor); location.assign(url); };
    tools.querySelector('select').addEventListener('change', event => switchState(event.target.value));
    tools.querySelector('[data-demo-recover]').addEventListener('click', () => switchState('ready'));
    document.body.append(tools);
    // Links to the same app retain the tab's actor/scenario (hash navigation is
    // untouched). External destinations are reviewable local explanations.
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]'); if (!link || link.closest('#clinime-demo-tools')) return;
      const url = new URL(link.href, location.href);
      if (['mailto:', 'tel:'].includes(url.protocol) || url.origin !== location.origin) { event.preventDefault(); location.assign('/demo/external?destination=' + encodeURIComponent(url.href)); return; }
      if (url.pathname === '/demo/card') return;
      if ((url.pathname === '/' || url.pathname === '/customer' || url.pathname === '/admin') && !link.getAttribute('href').startsWith('#')) {
        url.pathname = url.pathname === '/admin' ? '/admin' : page;
        url.searchParams.set('scenario', scenario); url.searchParams.set('actor', actor); link.href = url.href;
      }
    }, true);
  });
})();
