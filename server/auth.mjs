import { randomInt } from 'node:crypto';
import { loginEmail } from './email-templates.mjs';
import { ApiError, invalid, uuid, email, mac, token, equal, canonical, encrypt, decrypt, update, read, rate, safeUser } from './core.mjs';

export const COOKIE = '__Host-clinime-session';
const TEN_MINUTES = 600000, WEEK = 604800000;
export function createAuth({ store, mail, secret, origin, now }) {
  const userId = address => mac(secret, 'user:' + address);
  async function user(address) {
    const id = userId(address);
    return update(store, 'user/' + id, existing => existing ? { write: false, result: existing } : { value: { id, email: address, name: '', preferences: { email: true }, favorite: false }, result: { id, email: address, name: '', preferences: { email: true }, favorite: false } });
  }
  const csrf = raw => mac(secret, 'csrf:' + raw);
  async function session(request, required = true) {
    const cookie = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    if (!cookie || !/^[a-f0-9]{64}\.[A-Za-z0-9_-]{43}$/.test(cookie)) { if (required) throw new ApiError(401, 'AUTH_REQUIRED', 'سجّلي دخولك للمتابعة.'); return null; }
    const [id, raw] = cookie.split('.'), record = await read(store, 'auth/' + id);
    if (!record?.session || record.session.revoked || record.session.expiresAt <= now() || !equal(record.session.hash, mac(secret, 'session:' + raw))) { if (required) throw new ApiError(401, 'AUTH_REQUIRED', 'انتهت جلسة الدخول. سجّلي دخولك مجددًا.'); return null; }
    const account = await read(store, 'user/' + userId(record.email));
    if (!account) throw new ApiError(401, 'AUTH_REQUIRED');
    return { id, raw, user: account, csrfToken: csrf(raw) };
  }
  async function request(input, ip) {
    const requestId = uuid(input.requestId), address = email(input.email), locale = input.locale === 'en' ? 'en' : 'ar';
    if (!['code', 'link'].includes(input.mode)) throw invalid();
    const id = mac(secret, 'challenge:' + requestId), key = 'auth/' + id;
    const fingerprint = mac(secret, canonical({ email: address, locale, mode: input.mode }));
    let challenge = await read(store, key);
    if (challenge && challenge.fingerprint !== fingerprint) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
    if (!challenge) {
      await rate(store, mac(secret, 'auth-email:' + address), requestId, { limit: 5, window: 3600000, gap: 60000 }, now());
      await rate(store, mac(secret, 'auth-ip:' + ip), requestId, { limit: 20, window: 3600000 }, now());
      const code = String(randomInt(0, 1000000)).padStart(6, '0'), magic = token(), createdAt = now();
      const proposed = { emailTemplateVersion: 2, email: address, locale, fingerprint, createdAt, expiresAt: createdAt + TEN_MINUTES, attempts: 0, used: false, mailStatus: 'pending', codeHash: mac(secret, id + ':code:' + code), tokenHash: mac(secret, id + ':token:' + magic), envelope: encrypt(secret, { code, token: magic, email: loginEmail({ code, link: origin + '/#/auth-link?challenge=' + id + '&token=' + magic, locale, origin }) }) };
      challenge = await update(store, key, existing => existing ? { write: false, result: existing } : { value: proposed, result: proposed });
      if (challenge.fingerprint !== fingerprint) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT');
    }
    if (challenge.used) throw new ApiError(410, 'AUTH_USED', 'استُخدم هذا الرمز. اطلبي رمزًا جديدًا.');
    if (challenge.expiresAt <= now()) throw new ApiError(410, 'AUTH_EXPIRED', 'انتهت صلاحية الرمز. اطلبي رمزًا جديدًا.');
    if (challenge.mailStatus !== 'sent') {
      const value = decrypt(secret, challenge.envelope);
      const link = origin + '/#/auth-link?challenge=' + id + '&token=' + value.token;
      let delivered; const designed = challenge.emailTemplateVersion === 2 ? value.email || loginEmail({ code: value.code, link, locale, origin }) : null; try { delivered = await mail.send({ ...(designed || {}), key: 'login/' + id, to: challenge.email, subject: designed?.subject || (locale === 'ar' ? 'رمز الدخول إلى كلينيمي' : 'Your Clinime sign-in code'), text: designed?.text || (locale === 'ar' ? `رمز الدخول: ${value.code}\nصالح لمدة 10 دقائق ويُستخدم مرة واحدة.\nرابط الدخول: ${link}\nإن لم تطلبي الدخول، تجاهلي هذه الرسالة.` : `Sign-in code: ${value.code}\nValid for 10 minutes and one use.\nSign-in link: ${link}\nIf you did not request this, ignore this email.`) }); } catch { delivered = { status: 'pending' }; }
      await update(store, key, current => ({ value: { ...current, mailStatus: current.mailStatus === 'sent' ? 'sent' : delivered.status }, result: null }));
      if (delivered.status !== 'sent') throw new ApiError(503, delivered.status === 'pending' ? 'AUTH_DELIVERY_PENDING' : 'EMAIL_UNAVAILABLE', 'تعذّر تأكيد إرسال البريد. أعيدي المحاولة بنفس الطلب.');
    }
    return { challengeId: id, expiresAt: challenge.expiresAt, resendAfter: 60 };
  }
  async function verify(input, ip) {
    if (typeof input.challengeId !== 'string' || !/^[a-f0-9]{64}$/.test(input.challengeId)) throw invalid();
    const id = input.challengeId;
    await rate(store, mac(secret, 'verify-ip:' + ip), token(), { limit: 30, window: 900000 }, now());
    const raw = token(), sessionRecord = { hash: mac(secret, 'session:' + raw), expiresAt: now() + WEEK, revoked: false };
    const result = await update(store, 'auth/' + id, current => {
      if (!current || current.expiresAt <= now()) throw new ApiError(410, 'AUTH_EXPIRED', 'انتهت صلاحية الرمز. اطلبي رمزًا جديدًا.');
      if (current.used) throw new ApiError(410, 'AUTH_USED', 'استُخدم هذا الرمز. اطلبي رمزًا جديدًا.');
      if (current.attempts >= 5) throw new ApiError(429, 'AUTH_LOCKED', 'انتهت المحاولات المتاحة. اطلبي رمزًا جديدًا.');
      const isCode = typeof input.code === 'string' && /^\d{6}$/.test(input.code) && !input.token;
      const isToken = typeof input.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(input.token) && !input.code;
      const valid = isCode ? equal(current.codeHash, mac(secret, id + ':code:' + input.code)) : isToken && equal(current.tokenHash, mac(secret, id + ':token:' + input.token));
      if (!valid) return { value: { ...current, attempts: current.attempts + 1 }, result: { invalid: true } };
      // One strong CAS consumes both code and link, and creates the session in
      // that same record. No separate session write can partially succeed.
      const value = { ...current, used: true, consumedAt: now(), envelope: null, codeHash: null, tokenHash: null, session: sessionRecord };
      return { value, result: { email: current.email } };
    });
    if (result.invalid) throw new ApiError(400, 'INVALID_CODE', 'الرمز غير صحيح. تحققي منه وحاولي مرة أخرى.');
    const account = await user(result.email);
    return { value: { user: safeUser(account), csrfToken: csrf(raw) }, cookie: `${COOKIE}=${id}.${raw}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${WEEK / 1000}` };
  }
  async function logout(active) { await update(store, 'auth/' + active.id, current => ({ value: { ...current, session: { ...current.session, revoked: true } }, result: null })); return `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`; }
  return { request, verify, session, logout };
}
