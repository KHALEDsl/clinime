// Loopback-only, login-free demo. Serves built dist plus explicitly named demo
// helpers. No .env loading, disk persistence, live mail, Wallet or AI adapters.
import http from 'node:http';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createDemoFixture, DEMO_ORIGIN, DEMO_SCENARIOS } from './demo-fixture.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url)), DIST = path.join(ROOT, 'dist');
const ACTORS = ['customer', 'admin', 'friend', 'guest'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'";
const HEADERS = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Clinime-Demo': 'synthetic-local-only', 'Content-Security-Policy': CSP };
const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const choose = (value, options, fallback) => options.includes(value) ? value : fallback;
const cardURL = (actor, scenario) => '/demo/card?' + new URLSearchParams({ actor, scenario });
const campaign = { version: 'portable-demo-v1', name: 'بطاقة كلينيمي · تجربة محلية', terms: 'هذه بطاقة توضيحية محلية ببيانات تجريبية. لا يصدر هذا العرض بطاقة Apple Wallet أو Google Wallet ولا يشارك اسمك أو بريدك مع أي جهة خارجية. بعد خمسة أختام تجريبية تظهر مكافأة تنظيف البشرة الأساسي في هذه النسخة.', rewards: [{ stampsRequired: 5, rewardName: 'عناية بشرة مجانية', rewardText: 'مكافأة تجريبية بعد خمس زيارات · لنفسك أو هدية' }] };

function shell(title, content) {
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + E(title) + '</title><style>body{margin:0;padding:32px 20px;background:#f4f3f6;color:#2d3e5b;font:16px/1.7 system-ui}main{max-width:1040px;margin:auto}h1{font-size:32px;font-weight:550}h2{font-size:22px}section{padding:24px;margin:24px 0;background:#fff;border:1px solid #dce0e6;border-radius:16px}nav,.grid{display:flex;flex-wrap:wrap;gap:10px}a,button{color:#2d3e5b}nav a,.button,button{display:inline-block;padding:10px 16px;min-height:24px;border:1px solid #c1c8d2;border-radius:9px;background:#fff;text-decoration:none;font:inherit;cursor:pointer}.primary{background:#2d3e5b;color:#fff}small{display:block;color:#5f6979}code,pre{direction:ltr;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}details{padding:12px 0}summary{cursor:pointer}li{margin:8px 0}img{max-width:180px}form{display:inline-block;margin:8px}article{padding:16px 0;border-block-end:1px solid #e1e4e9}.card{max-width:350px;background:#2d3e5b;color:white;border-radius:22px;padding:30px;margin:auto}.stamps{font-size:26px;letter-spacing:8px;direction:ltr}</style></head><body><main><nav><a href="/demo">دليل التجربة · Demo launcher</a></nav><h1>' + E(title) + '</h1>' + content + '</main></body></html>';
}

function launcher() {
  const link = (label, href, primary = false) => '<a class="button ' + (primary ? 'primary' : '') + '" href="' + href + '">' + label + '</a>';
  return shell('كلينيمي · جميع الواجهات', '<p>نسخة محلية مستقلة ببيانات تجريبية. افتح الواجهات مباشرة دون حساب أو بريد أو كلمة مرور. تتشارك الإدارة والعميلة سجلًا واحدًا لكل حالة، ويمكن فتحهما معًا في تبويبين.</p><section><h2>ابدأ التجربة</h2><nav>' + link('واجهة العميلة', '/customer', true) + link('لوحة الإدارة', '/admin', true) + link('دخول بالبريد التجريبي · اختياري', '/customer?actor=guest#/auth') + link('بريد تجريبي', '/demo/mail') + '</nav><small>كل التعديلات في الذاكرة فقط، وتُصفّر عند إعادة تشغيل الخادم. لا يوجد اتصال بحسابات الإنتاج.</small></section><section><h2>واجهات العميلة</h2><nav>' + [['الرئيسية', 'home'], ['الخدمات', 'services'], ['حجوزاتي', 'appointments'], ['حسابي', 'account'], ['مكافآتي', 'loyalty'], ['بطاقة الزيارات', 'visit-card'], ['الإحالات', 'referrals'], ['تجهيز البطاقة', 'wallet-start'], ['نقطة عناية', 'care-point'], ['المساعدة', 'help']].map(([name, route]) => link(name, '/customer#/' + route)).join('') + '</nav><p>سارة لديها زيارات سابقة ومواعيد قادمة، ٤ أختام حاليّة، مكافأة مكتسبة، ورصيد إحالات ٢٥ ريالًا. للإهداء استخدم <code>friend@example.invalid</code> ثم افتح المستفيدة.</p><nav>' + link('مكافآت المستفيدة · ريم', '/customer?actor=friend#/loyalty') + '</nav></section><section><h2>واجهات الإدارة</h2><nav>' + [['الرئيسية', 'home'], ['المواعيد', 'appointments'], ['الخدمات', 'services'], ['الأخصائيات', 'specialists'], ['التقييمات', 'reviews'], ['التسويق', 'marketing'], ['الولاء', 'marketing/loyalty'], ['الإحالات', 'marketing/referrals'], ['المسابقة والجوائز', 'marketing/contest'], ['معين', 'marketing/maeen'], ['المخزون', 'inventory/stock'], ['الجرد', 'inventory/count'], ['المواد', 'supplies'], ['المنتجات', 'products']].map(([name, route]) => link(name, '/admin#' + route)).join('') + '</nav><p>بدّل بين الاستقبال والأخصائية والمديرة من الواجهة الحالية لتجربة المهام المختلفة. يوجد موعد للتحصيل الجزئي وحالات انتظار وجلسة جارية ومواعيد مكتملة.</p></section><section><h2>الحالات والاستعادة</h2><nav>' + DEMO_SCENARIOS.map(scenario => link(E(scenario), '/admin?scenario=' + scenario)).join('') + '</nav><p>Ready: بيانات مكتملة · Empty: سجل فارغ · Slow: استجابة بعد ١٫٢ ثانية · Error: خطأ متعمد في تحميل البيانات · Insufficient: سجل قصير للتحليلات.</p><p>توجد أداة «تجربة محلية · Demo» في كل واجهة لتبديل الحالة أو استعادة الحالة الجاهزة أو إعادة بياناتها. كل حالة مستقلة وتحتفظ بتعديلاتك حتى إعادة ضبطها أو إيقاف الخادم.</p></section><section><h2>ما الذي يحدث محليًا؟</h2><ul><li>الحجز والتعديل والإلغاء والملف والمخزون والمكافآت والمسابقة تستخدم واجهة API الفعلية مع مخزن تجريبي في الذاكرة.</li><li>رسائل التأكيد والرموز والجوائز تُحفظ في البريد التجريبي ولا تُرسل خارجيًا.</li><li>تجهيز البطاقة يفتح معاينة محلية فقط، ولا يصدر بطاقة هاتف أو يتصل بـ Loopy.</li><li>المدفوعات سجلات تجريبية؛ لا يحدث خصم مالي. بيانات الإعلانات والتقييمات أمثلة الواجهة الحالية، ومعين يظهر حالته الحالية «قيد التطوير».</li><li>الروابط الخارجية والبريد والهاتف تفتح صفحة توضيحية محلية، لتبقى التجربة مستقلة.</li></ul><nav>' + link('تفاصيل الحالة', '/demo/health') + '</nav></section>');
}

function transformDemoBundle(source) {
  // The accepted production sources stay byte-for-byte intact. The local demo
  // alone accepts its own card preview and describes the fake adapter truthfully.
  return source.replace('function safeWalletPassURL(value){', "function safeWalletPassURL(value){if(typeof value==='string'&&/^\\/demo\\/card\\?/.test(value))return true;")
    .replace("if (info?.kind === 'public-loopy-campaign'", "if ((info?.kind === 'local-demo-campaign' && info.url === '/demo/card') || info?.kind === 'public-loopy-campaign'")
    .replaceAll('نشارك اسمك وبريدك مع Loopy Loyalty لإصدار البطاقة.', 'معاينة محلية فقط. لا نشارك اسمك أو بريدك ولا نصدر بطاقة محفظة حقيقية.')
    .replaceAll('Your name and email are shared with Loopy Loyalty to issue your card.', 'Local preview only. Your name and email stay here; no real wallet pass is issued.')
    .replaceAll('باقي خطوة: افتحي بطاقتك واختاري إضافتها إلى محفظة الجوال.', 'افتحي المعاينة المحلية لبطاقتك التجريبية. لا تُضاف بطاقة إلى محفظة الجوال.')
    .replaceAll('One step left: open your card and choose to add it to your phone wallet.', 'Open the local preview of your sample card. No mobile wallet pass is issued.')
    .replaceAll('فتح بطاقتك وإضافتها للمحفظة', 'فتح معاينة البطاقة المحلية')
    .replaceAll('Open your card and add it to your wallet', 'Open the local card preview')
    .replaceAll('بطاقتك جاهزة. افتحي الرابط لإضافتها للمحفظة.', 'معاينتك جاهزة. افتحي رابط البطاقة التجريبية المحلية.')
    .replaceAll('Your card is ready. Open the link to add it to your wallet.', 'Your preview is ready. Open the local sample card link.');
}

export async function startDemoServer({ port = 4173, epoch = new Date().toISOString(), slowMs = 1200, quiet = false } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid demo port');
  await stat(path.join(DIST, 'index.html'));
  const fixtures = new Map(), pending = new Map();
  async function getFixture(scenario) {
    if (fixtures.has(scenario)) return fixtures.get(scenario);
    if (!pending.has(scenario)) pending.set(scenario, createDemoFixture({ scenario, epoch }).then(value => { fixtures.set(scenario, value); pending.delete(scenario); return value; }, error => { pending.delete(scenario); throw error; }));
    return pending.get(scenario);
  }
  await getFixture('ready');
  let activePort;
  const server = http.createServer(async (req, res) => {
    const send = (status, body = '', type = 'text/html; charset=utf-8', extra = {}) => { res.writeHead(status, { ...HEADERS, 'Content-Type': type, ...extra }); res.end(req.method === 'HEAD' ? undefined : body); };
    const json = (value, status = 200) => send(status, JSON.stringify(value), 'application/json; charset=utf-8');
    try {
      const origin = 'http://127.0.0.1:' + activePort;
      if (req.headers.host !== '127.0.0.1:' + activePort) return send(400, 'This demo accepts the loopback host only.');
      const url = new URL(req.url, origin);
      let referer; try { referer = new URL(req.headers.referer); } catch {}
      const sameReferer = referer?.origin === origin ? referer : null;
      const actor = choose(req.headers['x-clinime-demo-actor'] || url.searchParams.get('actor') || (url.pathname.startsWith('/game/') ? sameReferer?.searchParams.get('actor') : null), ACTORS, url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin/') ? 'admin' : 'customer');
      const scenario = choose(req.headers['x-clinime-demo-scenario'] || url.searchParams.get('scenario') || (url.pathname.startsWith('/game/') ? sameReferer?.searchParams.get('scenario') : null), DEMO_SCENARIOS, 'ready');
      if (url.pathname === '/' || url.pathname === '/demo' || url.pathname === '/demo/') return send(200, launcher());
      if (url.pathname === '/demo/client.js' && req.method === 'GET') return send(200, await readFile(path.join(ROOT, 'scripts/demo-client.js')), TYPES['.js']);
      if (url.pathname === '/demo/health' && req.method === 'GET') {
        const demo = await getFixture(scenario);
        return json({ ...demo.summary, origin, scenarios: DEMO_SCENARIOS, actors: ACTORS, routes: { launcher: '/demo', admin: '/admin', customer: '/customer', mail: '/demo/mail', guest: '/customer?actor=guest#/auth' }, statePersistence: 'process memory only', servingBuiltDist: true, auth: 'automatic synthetic identity per tab; guest OTP optional', providers: { mail: 'local capture', wallet: 'local preview', payments: 'local records only', ai: 'not connected' }, externalProviderCalls: 0 });
      }
      if (url.pathname === '/demo/reset' && req.method === 'POST') {
        if (req.headers.origin !== origin) return json({ error: { code: 'ORIGIN_INVALID' } }, 403);
        await getFixture(scenario); fixtures.delete(scenario); await getFixture(scenario);
        return send(303, '', 'text/plain', { Location: (actor === 'admin' ? '/admin' : '/customer') + '?' + new URLSearchParams({ actor, scenario }) });
      }
      if (url.pathname === '/__local/scenario' && req.method === 'GET') return send(303, '', 'text/plain', { Location: '/admin?scenario=' + choose(url.searchParams.get('value'), DEMO_SCENARIOS, 'ready') });
      if (url.pathname === '/demo/mail' && req.method === 'GET') {
        const demo = await getFixture(scenario), calls = demo.fixture.mail.calls;
        if (url.searchParams.get('format') === 'json') return json({ fakeMailOnly: true, scenario, messages: calls });
        return send(200, shell('البريد التجريبي · Local mail', '<p>هذه الرسائل محفوظة في ذاكرة الخادم فقط. لم يُرسل أي بريد إلى الخارج. الحالة: <code>' + E(scenario) + '</code>.</p><a class="button" href="/demo/mail?scenario=' + scenario + '">تحديث الرسائل</a><section>' + (calls.length ? [...calls].reverse().map(message => '<article><h2>' + E(message.subject || message.kind || 'رسالة تجريبية') + '</h2><p dir="ltr">' + E(Array.isArray(message.to) ? message.to.join(', ') : message.to) + '</p><pre>' + E(message.text || '') + '</pre></article>').join('') : '<p>لا توجد رسائل بعد. أنشئ حجزًا أو اطلب رمز الدخول من حساب الضيف ثم حدّث الصفحة.</p>') + '</section>'));
      }
      if (url.pathname === '/demo/card' && req.method === 'GET') {
        const demo = await getFixture(scenario), account = demo.accounts[actor] || demo.accounts.customer;
        const result = await demo.api(new Request(DEMO_ORIGIN + '/api/loyalty', { headers: { cookie: account.cookie } }));
        const wallet = await result.json();
        return send(200, shell('معاينة البطاقة · Local card preview', '<p>بطاقة تجريبية فقط. لا يوجد اتصال بـ Loopy ولا إضافة إلى Apple Wallet أو Google Wallet.</p><section><div class="card"><img src="/assets/clinime-logo-white.svg" alt="Clinime"><h2>' + E(demo.enrollment.get(account.user.id)?.name || account.user.email) + '</h2><div class="stamps" aria-label="' + Number(wallet.stampCard?.stamps || 0) + ' stamps">' + '●'.repeat(wallet.stampCard?.stamps || 0) + '○'.repeat(5 - (wallet.stampCard?.stamps || 0)) + '</div><p>' + E(wallet.stampCard?.stamps || 0) + ' / 5 أختام · بيانات تجريبية</p><small style="color:inherit">LOCAL DEMO · NO REAL PASS</small></div></section><nav><a href="/customer?' + new URLSearchParams({ actor, scenario }) + '#/loyalty">العودة لمكافآتي</a></nav>'));
      }
      if (url.pathname === '/demo/external' && req.method === 'GET') return send(200, shell('إجراء خارجي غير متصل', '<section><p>هذه الوجهة جزء من الواجهة الحالية. العرض المحلي لا يفتح اتصالًا أو يرسل رسالة أو يجري مكالمة.</p><pre>' + E(url.searchParams.get('destination') || '') + '</pre><p>يمكنك متابعة بقية الواجهات من دليل التجربة.</p></section>'));
      if (url.pathname.startsWith('/demo/') || url.pathname.startsWith('/__local/')) return send(404, 'Unknown local demo route');
      if (url.pathname.startsWith('/api/')) {
        const demo = await getFixture(scenario), account = demo.accounts[actor];
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 1500000) return send(413, 'Request too large'); chunks.push(chunk); }
        const bytes = Buffer.concat(chunks), mutation = !['GET', 'HEAD'].includes(req.method);
        if (mutation && req.headers.origin !== origin) return json({ error: { code: 'ORIGIN_INVALID', message: 'Local demo requests must be same-origin.' } }, 403);
        if (scenario === 'slow') await new Promise(resolve => setTimeout(resolve, slowMs));
        const failures = ['/api/config', '/api/admin/workspace', '/api/loyalty', '/api/care-point', '/api/care-point/public', '/api/availability'];
        if (scenario === 'error' && failures.includes(url.pathname)) return json({ error: { code: 'DEMO_SIMULATED_ERROR', message: 'خطأ تجريبي متعمد. اختاري «استعادة الحالة الجاهزة» من أداة التجربة المحلية.' } }, 503);
        const headers = new Headers(req.headers); headers.delete('cookie');
        if (account) headers.set('cookie', account.cookie);
        else {
          const guest = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('clinime-demo-guest-session='));
          if (guest) headers.set('cookie', guest.replace('clinime-demo-guest-session=', '__Host-clinime-session='));
        }
        if (mutation) headers.set('origin', DEMO_ORIGIN);
        if (account && url.pathname === '/api/auth/logout' && req.method === 'POST') {
          if (req.headers['x-csrf-token'] !== account.csrfToken) return json({ error: { code: 'CSRF_INVALID' } }, 403);
          return json({ ok: true, demo: 'Automatic sample identity resumes when the interface is opened again.' });
        }
        if (account && ['/api/wallet/campaign', '/api/wallet/enroll'].includes(url.pathname)) {
          if (url.pathname.endsWith('/campaign') && req.method === 'GET') return json({ campaign, enrollment: demo.enrollment.get(account.user.id) || { status: 'none' }, canEnroll: true, demoOnly: true });
          if (url.pathname.endsWith('/enroll') && req.method === 'POST') {
            if (req.headers['x-csrf-token'] !== account.csrfToken) return json({ error: { code: 'CSRF_INVALID' } }, 403);
            let input; try { input = JSON.parse(bytes); } catch { return json({ error: { code: 'INVALID_REQUEST' } }, 400); }
            if (!input.name?.trim() || input.name.trim().length > 100) return json({ error: { code: 'INVALID_REQUEST' } }, 400);
            if (input.acceptTerms !== true) return json({ error: { code: 'LOOPY_TERMS_REQUIRED' } }, 400);
            if (input.campaignVersion !== campaign.version) return json({ error: { code: 'LOOPY_CAMPAIGN_CHANGED' } }, 409);
            const enrollment = demo.enrollment.get(account.user.id) || { status: 'issued', name: input.name.trim(), url: cardURL(actor, scenario), demoOnly: true, createdAt: new Date(demo.fixture.now()).toISOString() };
            demo.enrollment.set(account.user.id, enrollment); return json({ enrollment, demoOnly: true });
          }
          return json({ error: { code: 'METHOD_NOT_ALLOWED' } }, 405);
        }
        const response = await demo.api(new Request(DEMO_ORIGIN + url.pathname + url.search, { method: req.method, headers, ...(bytes.length ? { body: bytes } : {}) }), { ip: '127.0.0.1' });
        const outgoing = Object.fromEntries(response.headers); delete outgoing['content-length'];
        if (outgoing['set-cookie']) {
          if (actor === 'guest') outgoing['set-cookie'] = outgoing['set-cookie'].replace('__Host-clinime-session=', 'clinime-demo-guest-session=').replace(/;\s*Secure/ig, '');
          else delete outgoing['set-cookie'];
        }
        let content = Buffer.from(await response.arrayBuffer());
        if (response.ok && url.pathname === '/api/config') {
          content = Buffer.from(JSON.stringify({ ...JSON.parse(content), walletEnrollment: { kind: 'local-demo-campaign', url: '/demo/card', target: 5, rewardKind: 'complimentary-service', serviceId: 'basic', giftable: true, customEnrollment: true, localEnrollment: true, demoOnly: true } }));
        }
        if (response.ok && url.pathname === '/api/admin/workspace') content = Buffer.from(JSON.stringify({ ...JSON.parse(content), growthPreview: { isSample: true, label: 'بيانات تجريبية محلية', scenario } }));
        return send(response.status, content, outgoing['content-type'] || 'application/json', outgoing);
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, 'Method not allowed');
      let relative; try { relative = decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch { return send(400, 'Invalid path'); }
      // No SPA fallback for source files, secrets or unexpected directories.
      if (relative.split('/').some(part => part.startsWith('.') || ['server', 'scripts', 'tests', 'client', 'netlify', 'node_modules', 'assets-source'].includes(part))) return send(404, 'Not a public demo asset');
      let target = path.resolve(DIST, relative);
      if (target !== DIST && !target.startsWith(DIST + path.sep)) return send(403, 'Invalid path');
      if (url.pathname === '/customer' || url.pathname === '/customer/') target = path.join(DIST, 'index.html');
      if (url.pathname === '/admin' || url.pathname === '/admin/') target = path.join(DIST, 'admin/index.html');
      try { if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html'); } catch { return send(404, 'Not a built demo asset'); }
      let content = await readFile(target);
      if (path.extname(target) === '.html') content = Buffer.from(content.toString().replace('</head>', '<script src="/demo/client.js?' + new URLSearchParams({ actor, scenario }) + '"></script></head>'));
      if (/^app-[a-f0-9]+\.js$/.test(path.basename(target))) content = Buffer.from(transformDemoBundle(content.toString()));
      return send(200, content, TYPES[path.extname(target)] || 'application/octet-stream');
    } catch (error) {
      if (!res.headersSent) send(500, 'The local demo could not load. Restart it and try again.');
      else res.end();
      if (!quiet) console.error('Local demo: ' + error.message);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  activePort = server.address().port;
  const origin = 'http://127.0.0.1:' + activePort;
  if (!quiet) console.log('Clinime local demo: ' + origin + '/demo\nAdmin: ' + origin + '/admin\nCustomer: ' + origin + '/customer\nSynthetic data; memory only; no external providers.');
  return { server, origin, fixtures, getFixture, port: activePort };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  // Only an explicit command argument controls the local listener; live env
  // variables are intentionally ignored by the portable demo.
  const argument = process.argv.slice(2).find(value => value.startsWith('--port='));
  startDemoServer({ port: argument ? Number(argument.split('=')[1]) : 4173 }).catch(error => { console.error('Demo startup failed: ' + error.message + (error.code === 'EADDRINUSE' ? '\nUse: npm run demo -- --port=4174' : '')); process.exitCode = 1; });
}
