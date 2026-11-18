import { configuredProfessionals, publicTeam } from './professionals.mjs';
import { createLoyalty } from './loyalty.mjs';
import { createLoopy, normalizeLoopyConfig } from './loopy.mjs';
import { activateWalletProgram } from './wallet-events.mjs';
import { projectWalletBooking, projectWalletBookings } from './wallet-dispatch.mjs';
import { createStaff } from './staff.mjs';
import { createMedia } from './media.mjs';
import { read } from './core.mjs';
import { configuredGift, createGiftMail } from './gifts.mjs';
import { ApiError, invalid, body, mac, equal, token, uuid, update, rate, safeUser, hash, canonical } from './core.mjs';
import { createAuth } from './auth.mjs';
import { createBookings, configuredSchedule, ledgerCatalog, snapshotItems } from './bookings.mjs';
import { createAdmin, configuredAdminEmails } from './admin.mjs';
import { createCarePoint } from './care-point.mjs';

export function normalizeEnv(env = process.env) {
  let origin = ''; try { const url = new URL(env.PUBLIC_ORIGIN); if (url.protocol === 'https:' && url.origin === env.PUBLIC_ORIGIN) origin = url.origin; } catch {}
  const secret = env.APP_SECRET || '';
  const loopyConfig = normalizeLoopyConfig(env);
  const walletEnabled = env.CLINIME_WALLET_ENABLED === 'true' && Boolean(loopyConfig.apiKey && loopyConfig.apiSecret && loopyConfig.username);
  return { origin, secret, walletEnabled, loopyConfig, mailKey: env.RESEND_API_KEY || '', from: env.EMAIL_FROM || '', schedule: configuredSchedule(env.CLINIC_SCHEDULE_JSON), gift: configuredGift(env.CLINIME_GIFT_JSON), adminEmails: configuredAdminEmails(env.CLINIME_ADMIN_EMAILS), professionals: configuredProfessionals(env.CLINIME_SPECIALISTS_JSON), rosterIsSample: env.CLINIME_ROSTER_SAMPLE === 'true', adminAccess: env.CLINIME_ADMIN_ACCESS === 'verified-email' ? 'verified-email' : 'allowlist', enabled: Boolean(origin && secret.length >= 32 && env.RESEND_API_KEY && env.EMAIL_FROM) };
}
export function createAPI({ store, mail, env = process.env, now = Date.now, loopyFetch = globalThis.fetch }) {
  const config = normalizeEnv(env), auth = createAuth({ store, mail, secret: config.secret, origin: config.origin, now }), bookings = createBookings({ store, mail, secret: config.secret, origin: config.origin, schedule: config.schedule, gift: config.gift, professionals: config.professionals, now }), giftMail = createGiftMail({ store, mail, secret: config.secret, origin: config.origin, now });
  const staff=createStaff({store,now,secret:config.secret,bookings,schedule:config.schedule,professionals:config.professionals,rosterIsSample:config.rosterIsSample}),media=createMedia({store});
  const loyalty=createLoyalty({store,secret:config.secret,now,resolveItems:(items,ledger)=>snapshotItems(items,ledgerCatalog(ledger))});
  const carePoint=createCarePoint({store,secret:config.secret,now,mail,origin:config.origin});
  const careOwner=active=>{if(!active?.user||!config.adminEmails.includes(active.user.email?.toLowerCase()))throw new ApiError(403,'ADMIN_REQUIRED','لا تملكين صلاحية إدارة المسابقة.');return active.user;};
  const carePage=params=>{const integer=(key,fallback,max)=>{const raw=params.get(key);if(raw===null)return fallback;if(!/^\d{1,6}$/.test(raw))throw invalid();return Math.min(Number(raw),max);};return {offset:integer('offset',0,2000),limit:Math.max(1,integer('limit',50,50))};};
  const loopy = createLoopy({ store, fetchImpl: loopyFetch, now, config: config.loopyConfig, deadlineAt: Date.now() + 40_000 });
  const activateWallet = () => config.enabled && config.walletEnabled ? activateWalletProgram(store, now, { campaignId: config.loopyConfig.campaignId }) : Promise.resolve();
  const bookingResult = async result => {
    if (!result.booking) return result;
    // Optional delivery status must never turn an accepted booking into a
    // failed response. Its durable booking receipt remains authoritative.
    try { return { ...result, booking: await projectWalletBooking(store, result.booking, now()) }; }
    catch { return result; }
  };
  const bookingList = async userId => {
    const list = await bookings.list(userId);
    try { return await projectWalletBookings(store, list, now()); }
    catch { return list; }
  };
  const walletAccount = user => {
    if (!config.walletEnabled || !loopy.configured) throw new ApiError(503, 'LOOPY_NOT_CONFIGURED', 'ربط البطاقة غير متاح الآن.');
    // Local fixture accounts must never reach the production provider.
    if (!user?.email || /@(?:[^@]*\.)?invalid$/i.test(user.email)) throw new ApiError(403, 'WALLET_ACCOUNT_INVALID', 'استخدمي حسابًا ببريد إلكتروني صالح لربط البطاقة.');
  };
  const admin = createAdmin({ store, emails: config.adminEmails, access: config.adminAccess, bookings, now });
  const versioned=value=>({...value,catalogVersion:hash(canonical(value.catalog))});
  const publicCatalog=catalog=>catalog.map(s=>Object.fromEntries(['id','key','nameAr','nameEn','category','price','duration','image','imageURL','options','active','availability'].filter(k=>Object.hasOwn(s,k)).map(k=>[k,k==='price'&&!s.options?.length&&s.discount!=null?s.discount:s[k]])));
  const json = (value, status = 200, cookie) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
  return async function handle(request, context = {}) {
    try {
      const url = new URL(request.url), path = url.pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/, '').replace(/^\/api(?=\/|$)/, '') || '/';
      const method = request.method.toUpperCase(), mutation = !['GET', 'HEAD'].includes(method);
      if(path==='/config'&&method==='GET'){if(!config.enabled)return json({emailEnabled:false});await activateWallet();const catalog=ledgerCatalog(await read(store,'clinic/booking-ledger-v1'));return json({emailEnabled:true,catalog:publicCatalog(catalog),catalogVersion:hash(canonical(catalog)),...publicTeam(config.professionals,config.rosterIsSample),...(config.walletEnabled?{walletEnrollment:{kind:'public-loopy-campaign',url:'https://loyalty.is/qoq6ip',target:5,rewardKind:'complimentary-service',serviceId:'basic',giftable:true,customEnrollment:true}}:{})});}
      const image=path.match(/^\/media\/([a-f0-9]{64})$/);if(image&&method==='GET')return await media.get(image[1],request);
      if (!config.enabled) throw new ApiError(503, 'EMAIL_UNAVAILABLE', 'تسجيل الدخول غير متاح الآن. حاولي لاحقًا.');
      if (mutation && request.headers.get('origin') !== config.origin) throw new ApiError(403, 'ORIGIN_INVALID');
      const ip = context.ip || 'unknown'; // Netlify trusted context; never client-supplied forwarded headers.
      if(path==='/care-point/public'&&method==='GET'){await rate(store,mac(config.secret,'care-public:'+ip),token(),{limit:120,window:60000},now());return json(await carePoint.snapshot(undefined,carePage(url.searchParams)));}
      if (path === '/auth/request' && method === 'POST') return json(await auth.request(await body(request), ip));
      if (path === '/auth/verify' && method === 'POST') { const result = await auth.verify(await body(request), ip); return json(result.value, 200, result.cookie); }
      if (path === '/availability' && method === 'GET') {
        await rate(store, mac(config.secret, 'availability:' + ip), String(now()) + ':' + Math.random(), { limit: 90, window: 60000 }, now());
        const spec = url.searchParams.get('services'); if (!spec || spec.length > 2048) throw invalid();
        const items = spec.split(',').map(s => { const parts = s.split(':'); if (parts.length > 2) throw invalid(); return { serviceId: parts[0], optionId: parts[1] || null }; });
        const bookingId = url.searchParams.get('bookingId') || url.searchParams.get('excludeBookingId');
        const active = bookingId ? await auth.session(request) : null;
        return json(await bookings.availability(url.searchParams.get('date'), items, bookingId, active?.user.id, url.searchParams.get('professional') || 'any'));
      }
      if (path === '/me' && method === 'GET') {
        const active = await auth.session(request, false); if (!active) return json({ user: null });
        return json({ user: safeUser(active.user), csrfToken: active.csrfToken, bookings: await bookingList(active.user.id), preferences: active.user.preferences, favorite: active.user.favorite });
      }
      const active = await auth.session(request);
      if(path==='/care-point'&&method==='GET'){await rate(store,mac(config.secret,'care-read:'+active.user.id),token(),{limit:120,window:60000},now());return json(await carePoint.snapshot(active.user,carePage(url.searchParams)));}
      if(path==='/admin/care-point'&&method==='GET'){careOwner(active);await rate(store,mac(config.secret,'care-admin-read:'+active.user.id),token(),{limit:120,window:60000},now());return json(await carePoint.adminSnapshot());}
      if (path === '/wallet/campaign' && method === 'GET') {
        walletAccount(active.user);
        await rate(store, mac(config.secret, 'wallet-read:' + active.user.id), token(), { limit: 60, window: 60000 }, now());
        let enrollment = await loopy.read(active.user);
        if (enrollment.status === 'none') enrollment = (await loopy.linkExisting(active.user)).enrollment;
        else if (enrollment.status === 'unknown') enrollment = (await loopy.reconcile(active.user)).enrollment;
        await activateWallet();
        try { return json({ campaign: await loopy.campaign(), enrollment, canEnroll: true }); }
        catch (error) {
          // Provider campaign downtime must not hide a durable issued receipt.
          if (enrollment.status !== 'issued') throw error;
          return json({ campaign: null, enrollment, canEnroll: true, campaignError: { code: error instanceof ApiError ? error.code : 'LOOPY_CAMPAIGN_UNAVAILABLE', message: 'تعذّر تحميل شروط البطاقة الآن. بطاقتك الحالية متاحة.' } });
        }
      }
      if (path === '/loyalty' && method === 'GET') { await rate(store,mac(config.secret,'loyalty-read:'+active.user.id),token(),{limit:120,window:60000},now()); await activateWallet(); return json(await loyalty.wallet(active.user)); }
      if (path === '/admin/loyalty' && method === 'GET') { admin.authorize(active); await rate(store,mac(config.secret,'loyalty-admin-read:'+active.user.id),token(),{limit:120,window:60000},now()); await activateWallet(); return json(await loyalty.adminSnapshot()); }
      if (path === '/admin/me' && method === 'GET') return json(admin.me(active));
      if(path==='/admin/workspace'&&method==='GET'){admin.authorize(active);await activateWallet();return json(versioned(await staff.snapshot(active)));}
      if (path === '/admin/bookings' && method === 'GET') return json(await admin.list(active, url.searchParams));
      if (mutation && !equal(request.headers.get('x-csrf-token'), active.csrfToken)) throw new ApiError(403, 'CSRF_INVALID', 'انتهت صلاحية الصفحة. أعيدي تحميلها ثم حاولي مجددًا.');
      if(path==='/care-point/name'&&method==='POST'){const input=await body(request);uuid(input.requestId);await rate(store,mac(config.secret,'care-name:'+active.user.id),token(),{limit:20,window:3600000},now());return json(await carePoint.saveName(active.user,input));}
      if(['/care-point/start','/care-point/complete'].includes(path)&&method==='POST'){const input=await body(request);uuid(input.requestId);await rate(store,mac(config.secret,'care-play:'+active.user.id),token(),{limit:180,window:3600000},now());return json(path.endsWith('/start')?await carePoint.start(active.user,input):await carePoint.complete(active.user,input));}
      if(path==='/admin/care-point'&&method==='POST'){const actor=careOwner(active),input=await body(request);await rate(store,mac(config.secret,'care-admin:'+actor.id),uuid(input.requestId),{limit:120,window:3600000},now());return json(await carePoint.adminMutate(actor,input));}
      if (path === '/wallet/enroll' && method === 'POST') {
        walletAccount(active.user);
        const input = await body(request);
        await rate(store, mac(config.secret, 'wallet-enroll:' + active.user.id), uuid(input.requestId), { limit: 10, window: 3600000 }, now());
        const result = await loopy.submit(active.user, input);
        await activateWallet();
        return json(result);
      }
      if (path === '/loyalty/quote' && method === 'POST') { const input=await body(request); await rate(store,mac(config.secret,'loyalty-quote:'+active.user.id),token(),{limit:90,window:60000},now()); await activateWallet(); return json(await loyalty.quote(active.user,input)); }
      if (path === '/loyalty/gift' && method === 'POST') { const input = await body(request); await rate(store, mac(config.secret, 'loyalty-gift:' + active.user.id), uuid(input.requestId), {limit:30, window:3600000}, now()); await activateWallet(); return json(await loyalty.gift(active.user, input)); }
      if (path === '/loyalty/redeem' && method === 'POST') { const input=await body(request); await rate(store,mac(config.secret,'loyalty-redeem:'+active.user.id),uuid(input.requestId),{limit:30,window:3600000},now()); await activateWallet(); return json(await loyalty.redeem(active.user,input)); }
      if (path === '/admin/loyalty' && method === 'POST') { const actor=admin.authorize(active),input=await body(request); await rate(store,mac(config.secret,'loyalty-admin:'+actor.id),uuid(input.requestId),{limit:120,window:3600000},now()); await activateWallet(); return json(await loyalty.adminMutate(actor,input)); }
      if(path==='/admin/assets'&&method==='POST'){admin.authorize(active);await rate(store,mac(config.secret,'staff-image:'+active.user.id),token(),{limit:12,window:3600000},now());return json(await media.save(await body(request,1450000)));}
      if(path==='/admin/workspace'&&method==='POST'){admin.authorize(active);const input=await body(request);await rate(store,mac(config.secret,'staff-write:'+active.user.id),uuid(input.requestId),{limit:180,window:3600000},now());await activateWallet();return json(versioned(await staff.mutate(active,input)));}
      if(path==='/admin/bookings'&&method==='POST'){const actor=admin.authorize(active),input=await body(request);await rate(store,mac(config.secret,'staff-create:'+actor.id),uuid(input.requestId),{limit:60,window:3600000},now());await activateWallet();return json(await bookingResult(await bookings.staffCreate(actor,input)));}
      const adminRoute = path.match(/^\/admin\/bookings\/(CL-[A-F0-9]{24})(\/(?:arrival|availability))?$/);
      if (adminRoute) {
        admin.authorize(active);
        const [, id, suffix] = adminRoute;
        if (suffix === '/availability' && method === 'GET') {
          await rate(store, mac(config.secret, 'admin-availability:' + active.user.id), token(), { limit: 90, window: 60000 }, now());
          return json(await admin.availability(active, id, url.searchParams.get('date')));
        }
        const action = suffix === '/arrival' && method === 'POST' ? 'arrival' : !suffix && method === 'PATCH' ? 'update' : !suffix && method === 'DELETE' ? 'cancel' : null;
        if (action) {
          const input = await body(request), requestId = uuid(input.requestId);
          await rate(store, mac(config.secret, 'admin-booking:' + active.user.id), requestId, { limit: 120, window: 3600000 }, now());
          await activateWallet();
          return json(await bookingResult(await admin.mutate(active, action, input, id)));
        }
      }
      if (path === '/auth/logout' && method === 'POST') { if (request.body) await body(request); return json({ ok: true }, 200, await auth.logout(active)); }
      if (['/profile', '/preferences', '/favorite'].includes(path) && method === 'PATCH') {
        const input = await body(request);
        if (path === '/profile' && (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.length > 100 || /[\u0000-\u001f\u007f]/.test(input.name))) throw invalid();
        if (path === '/preferences' && typeof input.email !== 'boolean' || path === '/favorite' && typeof input.favorite !== 'boolean') throw invalid();
        const user = await update(store, 'user/' + active.user.id, current => {
          if (!current) throw new ApiError(401, 'AUTH_REQUIRED');
          const value = path === '/profile' ? { ...current, name: input.name.trim() } : path === '/preferences' ? { ...current, preferences: { email: input.email } } : { ...current, favorite: input.favorite };
          return { value, result: value };
        });
        return json(path === '/profile' ? { user: safeUser(user) } : path === '/preferences' ? { preferences: user.preferences } : { favorite: user.favorite });
      }
      const giftRoute = path.match(/^\/bookings\/(CL-[A-F0-9]{24})\/gift-email$/);
      if (giftRoute && method === 'POST') { if (request.body) await body(request); await rate(store, mac(config.secret, 'giftmail:' + active.user.id), token(), { limit: 5, window: 60000 }, now()); return json(await giftMail(await bookings.getOwned(giftRoute[1], active.user.id), active.user.id)); }
      const found = path.match(/^\/bookings(?:\/(CL-[A-F0-9]{24}))?(\/confirmation)?$/);
      if (found) {
        const [, id, confirmation] = found;
        if (confirmation && id && method === 'POST') { if (request.body) await body(request); await rate(store, mac(config.secret, 'confirmation:' + active.user.id), token(), { limit: 10, window: 60000 }, now()); const result = await bookings.confirmation(id, active.user.id); return json({ emailStatus: result.emailStatus }); }
        const action = !id && method === 'POST' ? 'create' : id && method === 'PATCH' ? 'update' : id && method === 'DELETE' ? 'cancel' : null;
        if (action && !confirmation) { const input = await body(request), requestId = uuid(input.requestId); await rate(store, mac(config.secret, 'booking:' + active.user.id), requestId, { limit: 60, window: 3600000 }, now()); await activateWallet(); return json(await bookingResult(await bookings.mutate(action, active.user, input, id))); }
      }
      throw new ApiError(404, 'NOT_FOUND', 'الطلب غير موجود.');
    } catch (error) {
      const known = error instanceof ApiError;
      return json({ error: { code: known ? error.code : 'STORE_UNAVAILABLE', message: known ? error.message : 'الخدمة غير متاحة مؤقتًا. أعيدي المحاولة بنفس الطلب.' } }, known ? error.status : 503);
    }
  };
}
