// Loopback-only local review harness. Not built, deployed, or imported by Netlify.
// Uses the actual application API with fake mail and a private local CAS store.
import http from 'node:http';
import { newVisitProgram, recordStamp } from '../server/visit-rewards.mjs';
import { CATALOG } from '../server/catalog.mjs';
import { update, equal, ApiError } from '../server/core.mjs';
import { createLoopyEnrollment } from './loopy-local-enrollment.mjs';
import os from 'node:os';
import { openDraftStore } from './maeen-draft-store.mjs';
import { openVisualJobs, supportsVisual } from './maeen-visuals.mjs';
import { runDraftTurn, imageRequest } from './maeen-draft-tools.mjs';
import { maeenReply } from './maeen-dialogue.mjs';
import path from 'node:path';
import { readFile, writeFile, rename, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createFixture } from './staff-local-server.mjs';

if (!process.argv.includes('--external-development-only')) throw new Error('Legacy external-development harness is disabled by default. Run npm start for the isolated, no-login demo.');

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = path.join(ROOT, 'dist');
const REVIEW = path.join(ROOT, 'evidence/loyalty-local-review');
const PORT = Number(process.env.CLINIME_LOCAL_PREVIEW_PORT || 8996), ORIGIN = `http://127.0.0.1:${PORT}`, API_ORIGIN = 'https://clinime-local.invalid';
const STATE = process.env.CLINIME_LOCAL_FIXTURE_FILE || path.join(REVIEW, 'fixture-state-stamps-v1.json');
const BASELINE = process.argv.includes('--baseline');
const COOKIE = 'clinime-local-session';
const LEDGER = 'clinic/booking-ledger-v1';
const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ttf':'font/ttf','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
const HEADERS = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
let fixture, walletEnrollmentService, pendingFriend, fifthVisit, walletWrites=0, saveQueue = Promise.resolve();
const ok = r => {if (r.status !== 200) throw Error(`Local request failed (${r.status}): ${JSON.stringify(r.data)}`);return r.data;};
async function save() {
  if (BASELINE) return;
  const data = JSON.stringify({localFixtureOnly:true, savedAt:new Date().toISOString(), clockAt:new Date(fixture.now()).toISOString(), records:[...fixture.store.records],version:fixture.store.version,sessions:fixture.sessions,pendingFriend,fifthVisit,mail:fixture.mail.calls}, null, 2);
  saveQueue = saveQueue.then(async()=>{await mkdir(path.dirname(STATE),{recursive:true});await writeFile(STATE+'.tmp',data);await rename(STATE+'.tmp',STATE);});
  await saveQueue;
}
async function ensureLocalReferenceCatalog() {
  if (BASELINE) return false;
  let account = fixture.sessions.customer;
  let snapshot = await fixture.request('/api/admin/workspace', { account });
  if (snapshot.status === 401) {
    account = await fixture.login('sara@example.invalid');
    fixture.sessions.customer = account;
    fixture.sessions.reception = account;
    fixture.sessions.doctor = account;
    snapshot = await fixture.request('/api/admin/workspace', { account });
  }
  const workspace = ok(snapshot);
  if (workspace.referenceImported) return false;
  const data = { requestId: randomUUID(), revision: workspace.revision, action: 'catalog-import-reference' };
  let result = await fixture.request('/api/admin/workspace', { method: 'POST', account, data });
  // Preserve the import request when its committed response is uncertain.
  if (result.status >= 500) result = await fixture.request('/api/admin/workspace', { method: 'POST', account, data });
  ok(result);
  return true;
}
async function buildFixture(reset=false) {
  // These receipts describe real external writes, unlike resettable scenario
  // data. Keep their claims even when the booking fixture is reset.
  const externalReceipts=reset&&fixture?structuredClone([...fixture.store.records].filter(([key])=>key.startsWith('local/loopy-enrollment/'))):[];
  const previousVersion=reset&&fixture?fixture.store.version:0;
  let retained=null;
  if (!reset && !BASELINE) {
    try { const state=JSON.parse(await readFile(STATE,'utf8'));if(state.localFixtureOnly)retained=state; } catch(error){if(error.code!=='ENOENT')throw error;}
  }
  const lastRateAt=retained?Math.max(0,...retained.records.filter(([key])=>key.startsWith('rate/')).flatMap(([,record])=>record.data.events||[]).map(event=>Number(event.at)||0)):0;
  const epoch=new Date(Math.max(Date.parse('2026-11-04T07:00:00Z'),Date.parse(retained?.clockAt||'')||0,lastRateAt)+1).toISOString();
  fixture = await createFixture({origin:API_ORIGIN, seed:false, elapsed:true, adminEmails:['sara@example.invalid','owner@example.invalid'], specialistRoster:true, epoch});
  if(externalReceipts.length){for(const [key,record] of externalReceipts)fixture.store.records.set(key,record);fixture.store.version=Math.max(fixture.store.version,previousVersion);}
  walletEnrollmentService = createLoopyEnrollment({store:fixture.store,persist:save});
  if(retained){
    // Keep durable scenario data; ephemeral throttles start fresh with each
    // local process. Otherwise rewinding a saved fixture clock can retain a
    // future rate window indefinitely. Production storage is never touched.
    fixture.store.records=new Map(retained.records.filter(([key])=>!key.startsWith('rate/')));fixture.store.version=retained.version;Object.assign(fixture.sessions,retained.sessions);fixture.mail.calls.push(...retained.mail);pendingFriend=retained.pendingFriend;fifthVisit=retained.fifthVisit;
    if (await ensureLocalReferenceCatalog()) await save();
    return;
  }
  for(const [who,email,name] of [['customer','sara@example.invalid','سارة'],['friend','reem@example.invalid','ريم'],['new','new@example.invalid','عميلة جديدة']]){
    const account=await fixture.login(email);fixture.sessions[who]=account;
    ok(await fixture.request('/api/profile',{method:'PATCH',account,data:{name}}));
  }
  fixture.sessions.reception=fixture.sessions.customer;fixture.sessions.doctor=fixture.sessions.customer;
  const customer=fixture.sessions.customer;
  const book=async(account,details)=>ok(await fixture.request('/api/bookings',{method:'POST',account,data:{requestId:randomUUID(),professional:'layla',attendee:{kind:'self'},date:'2026-11-04',...details}})).booking;
  fifthVisit=await book(customer,{items:[{serviceId:'hydra',optionId:'basic'}],time:'14:00',contactName:'سارة'});
  if(!BASELINE){
    await update(fixture.store, LEDGER, ledger => {
      ledger.visitProgram = newVisitProgram();
      // Four historical visits in the isolated local scenario. The fifth uses the staff flow.
      const template = ledger.bookings[fifthVisit.id];
      for (let index = 0; index < 4; index++) {
        const date = ['2026-09-02', '2026-09-17', '2026-10-03', '2026-10-21'][index];
        const at = date + 'T11:45:00.000Z', id = 'CL-' + String(index + 1).padStart(24, '0');
        const past = { ...structuredClone(template), id, date, createdAt: at, updatedAt: at, attendance:{status:'arrived',arrivedAt:at}, _staff:{stage:'closed',finishedAt:at,closedAt:at,additions:[]}, _loyalty:{settlement:{countsAsEligibleVisit:true,eligiblePaidCents:Math.round(template.pricing.total*100)}} };
        ledger.bookings[id] = past;
        ledger.staff ||= {revision:0, catalog:structuredClone(CATALOG), medical:{}, stock:{}, products:{}, receipts:[], audit:[], requests:{}};
        ledger.staff.receipts.push({id:'RC-LOCAL-'+index,bookingId:id,kind:'manual',method:'card',amount:past.pricing.total,total:past.pricing.total,recordedAt:at,lines:past.items});
        recordStamp(ledger, past, 'local-fixture', Date.parse(at));
      }
      return {value:ledger,result:true};
    });
    const wallet=ok(await fixture.request('/api/loyalty',{account:customer}));
    const admin=ok(await fixture.request('/api/admin/loyalty',{account:customer}));
    ok(await fixture.request('/api/admin/loyalty',{method:'POST',account:customer,data:{requestId:randomUUID(),revision:admin.revision,action:'referral-credit-save',amountSar:25}}));
    pendingFriend=await book(fixture.sessions.friend,{items:[{serviceId:'basic'}],time:'16:00',contactName:'ريم',promotionCode:wallet.referralCode});
  }
  await ensureLocalReferenceCatalog();
  await save();
}
function localCookie(value){return value?.replace('__Host-clinime-session=',COOKIE+'=').replace(/;\s*Secure/ig,'');}
function launch(){
return `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مراجعة الولاء محليًا</title><style>body{font:16px/1.7 system-ui;background:#f5f4f4;color:#30252c;margin:0;padding:32px}main{max-width:960px;margin:auto}h1{font-size:32px;font-weight:500;margin:0}p{color:#655b61}section{background:white;border:1px solid #e5dfe2;padding:24px;border-radius:16px;margin:24px 0}nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}a,button{display:block;border-radius:10px;padding:16px;background:#6c304d;color:white;text-decoration:none;border:0;font:inherit;text-align:center;cursor:pointer}small{display:block;color:#655b61;margin-top:8px}label{display:block}button.secondary{background:#ece7e9;color:#412837}form{margin-top:16px}code{direction:ltr;display:inline-block}ul{padding-inline-start:24px}</style><main><h1>مراجعة الولاء والإحالات</h1><p>نسخة محلية مستقلة ببيانات تمثيلية. لا تتصل بحساب نتليفاي أو Resend ولا ترسل بريدًا خارجيًا.</p><section><h2>ابدأ التجربة</h2><nav><a href="/__local/signin?as=customer&next=rewards">مكافآتي · سارة</a><a href="/__local/signin?as=customer&next=account">حساب العميلة</a><a href="/__local/signin?as=customer&next=admin">إدارة الولاء والإحالات</a><a href="/__local/signin?as=friend&next=appointments">حجز الصديقة · ريم</a><a href="/__local/signin?as=new&next=rewards">محفظة جديدة خالية</a><a href="/#/auth">تجربة الدخول بالإيميل</a></nav><small>تبديل الحساب هنا يغيّر جلسة المتصفح كلها. لاختبار حسابين معًا، افتح أحدهما في نافذة خاصة.</small></section><section><h2>تجربة بطاقة الزيارات ورصيد الإحالات</h2><ol><li>افتحي مكافآتي بحساب سارة لرؤية زياراتها الأربع.</li><li>أتمي زيارتها الخامسة، ثم احجزي جلسة تنظيف البشرة الأساسي مجانًا أو أهديها إلى reem@example.invalid.</li><li>لرؤية الهدية من جهة المستلمة، افتحي <a href="/__local/signin?as=friend&next=rewards">مكافآت ريم</a>.</li><li>إحالة ريم من سارة معلّقة حتى إتمام زيارتها الأولى وسدادها. المبلغ المحدد لهذا المثال المحلي ٢٥ ريالًا.</li></ol><form method="post" action="/__local/complete-fifth"><button>إتمام زيارة سارة الخامسة وعرض مكافأتها</button></form><form method="post" action="/__local/complete-referral"><button>إتمام زيارة ريم وقيد رصيد الإحالة لسارة</button></form><small>تستخدم أزرار المراجعة إجراءات الاستقبال والجلسة والسداد المحلية، دون إرسال أي بريد خارجي.</small></section><section><h2>بريد الدخول المحلي</h2><p>إذا طلبتِ رمزًا من واجهة الدخول، يظهر هنا بدل إرساله إلى بريد حقيقي.</p><a href="/__local/mail">فتح صندوق البريد المحلي</a></section><section><h2>إعادة التجربة</h2><p>الحالة محفوظة محليًا بين مرات تشغيل الخادم.</p><form method="post" action="/__local/reset"><button class="secondary">إعادة البيانات المحلية إلى البداية</button></form></section></main></html>`;
}
async function completeVisit(id){
  const account=fixture.sessions.customer;
  if(!id)throw Error('لا توجد زيارة محلية');
  const mutate=async(action,data={})=>{const w=ok(await fixture.request('/api/admin/workspace',{account}));const b=w.bookings.find(x=>x.id===id);return ok(await fixture.request('/api/admin/workspace',{method:'POST',account,data:{requestId:randomUUID(),revision:w.revision,bookingRevision:b.revision,bookingId:id,action,...data}}));};
  let w=ok(await fixture.request('/api/admin/workspace',{account})), b=w.bookings.find(x=>x.id===id);
  if(w.visits[id]?.stage==='closed')return;
  if(!b.attendance){ok(await fixture.request('/api/admin/bookings/'+id+'/arrival',{method:'POST',account,data:{requestId:randomUUID(),revision:b.revision}}));}
  w=ok(await fixture.request('/api/admin/workspace',{account}));
  let stage=w.visits[id]?.stage||'waiting';
  if(stage==='waiting'){
    await mutate('medical-save',{fields:{notes:'بيانات محلية تمثيلية لمراجعة دورة الولاء'},flags:{consultation:true,assessment:true,consent:true}});
    await mutate('session-start',{confirmProceed:true,confirmTimeConflict:true});stage='session';
  }
  if(stage==='session'){await mutate('session-finish',{aftercare:'عناية تمثيلية محلية',followup:false});}
  w=ok(await fixture.request('/api/admin/workspace',{account}));
  const due=w.visits[id].balance;
  if(due>0)await mutate('payment-record',{method:'cash',amount:due});else await mutate('visit-close');
  await save();
}
await buildFixture();
const draftStore=openDraftStore(path.join(ROOT,'evidence','maeen-local','drafts.sqlite'));
const imageKey=()=>readFile(path.join(process.env.CLINIME_MAEEN_CACHE||path.join(os.homedir(),'Library/Caches/ClinimeMaeen'),'local.key'),'utf8').then(value=>value.trim());
const visuals=openVisualJobs(path.join(ROOT,'evidence','maeen-local','images'),{
  render:async options=>(await import('./maeen-image-engine.mjs')).generateImage(options),
  compose:async options=>(await import('./maeen-compose.mjs')).composeStory(options)
});
visuals.resume(await imageKey().catch(()=>null));
async function staffOwner(cookie){
  const me=await fixture.api(new Request(API_ORIGIN+'/api/admin/me',{headers:{cookie}}),{ip:'127.0.0.1'});
  if(!me.ok)return null;
  return (await me.json()).user?.email?.trim().toLowerCase();
}
const server=http.createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${PORT}`){res.writeHead(400,HEADERS);res.end('Loopback host only');return;}
  const url=new URL(req.url,ORIGIN);
  const respond=(value,status=200,type='text/html; charset=utf-8')=>{res.writeHead(status,{...HEADERS,'Content-Type':type});res.end(value);};
  const redirect=(location,cookie)=>{res.writeHead(303,{...HEADERS,Location:location,...(cookie?{'Set-Cookie':localCookie(cookie)}:{})});res.end();};
  if (['/api/wallet/campaign','/api/wallet/enroll'].includes(url.pathname) && !BASELINE) {
    const json=(value,status=200)=>respond(JSON.stringify(value),status,'application/json; charset=utf-8');
    try {
      const method=url.pathname.endsWith('/campaign')?'GET':'POST';
      if(req.method!==method)throw new ApiError(405,'METHOD_NOT_ALLOWED','الطلب غير متاح.');
      const cookie=(req.headers.cookie||'').replace(new RegExp('(?:^|;\\s*)'+COOKIE+'='),match=>match.replace(COOKIE,'__Host-clinime-session'));
      const session=await fixture.api(new Request(API_ORIGIN+'/api/me',{headers:{cookie}}),{ip:'127.0.0.1'});
      const active=await session.json();
      if(!session.ok||!active.user)throw new ApiError(401,'AUTH_REQUIRED','سجّلي دخولك للمتابعة.');
      const canEnroll=!/\.(?:invalid|test|localhost)$/i.test(active.user.email.split('@')[1]||'')&&!/@localhost$/i.test(active.user.email);
      if(method==='GET'){
        const enrollment=await walletEnrollmentService.read(active.user);
        let campaign, campaignError;
        try{campaign=await walletEnrollmentService.campaign();}
        catch(error){if(enrollment.status==='none')throw error;campaign=null;campaignError={code:error.code||'WALLET_UNAVAILABLE',message:error.message};}
        json({campaign,enrollment,canEnroll:canEnroll&&!campaignError,...(campaignError?{campaignError}:{})});return;
      }
      if(req.headers.origin!==ORIGIN)throw new ApiError(403,'ORIGIN_INVALID','تعذّر التحقق من الطلب.');
      if(!equal(req.headers['x-csrf-token'],active.csrfToken))throw new ApiError(403,'CSRF_INVALID','أعيدي تحميل الصفحة ثم حاولي مجددًا.');
      if(!canEnroll)throw new ApiError(400,'WALLET_EMAIL_REQUIRED','سجّلي الدخول ببريدك لإصدار بطاقتك.');
      if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new ApiError(400,'INVALID_INPUT','تعذّر قراءة بيانات التسجيل.');
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)throw new ApiError(413,'INVALID_INPUT','بيانات التسجيل طويلة.');}
      let input;try{input=JSON.parse(raw);}catch{throw new ApiError(400,'INVALID_INPUT','تعذّر قراءة بيانات التسجيل.');}
      walletWrites++;
      try{json(await walletEnrollmentService.submit(active.user,input));}
      finally{walletWrites--;}
      return;
    }catch(error){json({error:{code:error instanceof ApiError?error.code:'WALLET_UNAVAILABLE',message:error instanceof ApiError?error.message:'تعذّر فتح تسجيل البطاقة. حاولي لاحقًا.'}},error instanceof ApiError?error.status:503);return;}
  }
  if (url.pathname === '/__local/wallet-enrollment.png' && ['GET','HEAD'].includes(req.method)) {
    respond(req.method === 'HEAD' ? undefined : await readFile(path.join(ROOT,'scripts/loyalty-art/loopy-enrollment.png')),200,'image/png');
    return;
  }
  if(url.pathname.startsWith('/__local/maeen/visual/') && ['GET','HEAD'].includes(req.method)){
    const owner=await staffOwner((req.headers.cookie||'').replace(COOKIE+'=','__Host-clinime-session='));
    if(!owner){respond('Unauthorized',401);return;}
    const id=url.pathname.match(/^\/__local\/maeen\/visual\/([a-f0-9-]{36})\.png$/)?.[1];
    const file=id&&visuals.file(owner,id);
    if(!file){respond('Missing image',404);return;}
    res.writeHead(200,{...HEADERS,'Content-Type':'image/png','Content-Disposition':'inline; filename="clinime-'+id+'.png"'});
    res.end(req.method==='HEAD'?undefined:await readFile(file));return;
  }
  if(url.pathname==='/__local/'||url.pathname==='/__local'){
    // Same-origin form navigations need a real Origin for the QA mutations below.
    res.writeHead(200,{...HEADERS,'Referrer-Policy':'same-origin','Content-Type':'text/html; charset=utf-8'});res.end(launch());return;
  }
  if(url.pathname==='/__local/signin'&&req.method==='GET'){
    const as=url.searchParams.get('as'),session=fixture.sessions[as];
    if(!['customer','friend','new'].includes(as)||!session){respond('الحساب غير موجود',400);return;}
    const next=url.searchParams.get('next'), routes={reviews:'/admin#reviews',dashboard:'/admin#home',team:'/admin#specialists',services:'/#/services',marketing:'/admin#marketing',maeen:'/admin#marketing/maeen','staff-visit-card':'/admin#marketing/loyalty','staff-referrals':'/admin#marketing/referrals',admin:'/admin#marketing/loyalty','wallet-start':'/#/wallet-start','visit-card':'/#/visit-card',referrals:'/#/referrals',rewards:'/#/loyalty',account:'/#/account',appointments:'/#/appointments'};
    const draftId=url.searchParams.get('draft');
    const destination=next==='maeen'&&/^[0-9a-f-]{36}$/.test(draftId||'')?'/admin?draft='+draftId+'#marketing/maeen':routes[next];
    redirect(destination||'/#/home',session.setCookie);return;
  }
  if(url.pathname==='/__local/mail'&&req.method==='GET'){
    respond('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>البريد المحلي</title><body style="font:16px/1.8 system-ui;max-width:800px;margin:40px auto;padding:24px"><h1>البريد المحلي فقط</h1><a href="/__local/">العودة للمراجعة</a>'+fixture.mail.calls.slice(-12).reverse().map(m=>`<article style="border-bottom:1px solid #ddd;padding:24px 0"><strong>${E(m.to)}</strong><h2>${E(m.subject)}</h2><pre style="white-space:pre-wrap;direction:ltr;text-align:left">${E(m.text)}</pre></article>`).join('')+'</body></html>');return;
  }
  if(url.pathname.startsWith('/__local/')&&req.method==='POST'){
    if(req.headers.origin!==ORIGIN){respond('Origin rejected',403);return;}
    if(['/__local/maeen','/__local/maeen/drafts','/__local/maeen/image'].includes(url.pathname)){
      const cookie=(req.headers.cookie||'').replace(COOKIE+'=','__Host-clinime-session=');
      const adminRead=route=>fixture.api(new Request(API_ORIGIN+route,{headers:{cookie}}),{ip:'127.0.0.1'});
      const me=await adminRead('/api/admin/me');
      const json=(data,status=200)=>respond(JSON.stringify(data),status,'application/json');
      if(!me.ok){json({error:'سجّل الدخول لمساحة الفريق.'},me.status);return;}
      const owner=(await me.json()).user?.email?.trim().toLowerCase();
      if(!owner){json({error:'تعذّر تحديد حساب الموظف.'},403);return;}
      let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000){json({error:'الرسالة طويلة.'},413);return;}}
      let body;
      try{body=JSON.parse(raw);}catch{json({error:'طلب غير صالح.'},400);return;}
      if(!body||typeof body!=='object'){json({error:'طلب غير صالح.'},400);return;}
      if(url.pathname.endsWith('/drafts')){
        if(body.action!=='list'){json({error:'طلب غير صالح.'},400);return;}
        json({drafts:draftStore.list(owner).map(d=>({...d,image:visuals.status(owner,d)}))});return;
      }
      if(url.pathname.endsWith('/image')){
        try{
          const draft=draftStore.get(owner,body.id);
          if(draft.revision!==body.revision){json({error:'افتح أحدث نسخة من المسودة.'},409);return;}
          if(body.action==='status'){json({image:visuals.status(owner,draft)});return;}
          if(body.action!=='generate'){json({error:'طلب غير صالح.'},400);return;}
          json({image:visuals.start(owner,draft,{requestId:body.requestId,regenerate:body.regenerate===true,key:await imageKey()})});return;
        }catch(e){json({error:e.status?e.message:'تعذّر تشغيل أداة الصور.'},e.status||503);return;}
      }
      const thread=(Array.isArray(body.messages)?body.messages:[]).slice(-40)
        .filter(m=>m&&['assistant','user'].includes(m.role)&&typeof m.content==='string')
        .map(m=>({role:m.role,content:m.content.slice(0,m.role==='user'?13000:2000)}));
      if(!thread.length||thread.at(-1).role!=='user'||!thread.at(-1).content.trim()){json({error:'اكتب رسالتك لمعين.'},400);return;}
      const workspace=await adminRead('/api/admin/workspace');
      if(!workspace.ok){json({error:'تعذّر فتح الكتالوج.'},workspace.status);return;}
      const catalog=(await workspace.json()).catalog||[];
      try{
        const key=await imageKey();
        const generate=(chat,services)=>maeenReply(chat,services,key);
        const last=thread.at(-1).content;
        if(body.draftId && !body.pending && imageRequest(last) && !/(?:ستوري جديد|مسودة جديدة|منشور جديد)/.test(last)){
          const draft=draftStore.get(owner,body.draftId);
          if(draft.revision!==body.revision){json({error:'افتح أحدث نسخة من المسودة.'},409);return;}
          const viewOnly=/^(?:ورني|وريني|اعرض|أعرض|ابي اشوف|أبي أشوف|وين)\s+(?:لي\s+)?(?:ال)?صور[ةه](?: المسودة| الستوري| الجاهزة)?[؟!. ]*$/.test(last.trim());
          const regenerate=!viewOnly;
          const image=visuals.start(owner,draft,{requestId:body.requestId,regenerate,brief:last,key});
          json({draft:{...draft,image},answer:image.status==='ready'?'هذي صورة المسودة الجاهزة.':'بدأت تجهيز صورة المسودة.'});return;
        }
        const result=await runDraftTurn({owner,body,thread,catalog,store:draftStore,key,generate});
        if(result){
          if(result.draft && supportsVisual(result.draft) && !/(?:بدون صور|نص فقط|نص بس|لا تولد)/.test(result.visualBrief||last)){
            const current=draftStore.get(owner,result.draft.id);
            if(current.revision===result.draft.revision) result.draft.image=visuals.start(owner,current,{requestId:'draft-'+current.id+'-'+current.revision,brief:result.visualBrief||last,key});
          }
          delete result.visualBrief;
          json(result);return;
        }
        const draft=body.draftId?draftStore.get(owner,body.draftId):null;
        const chat=draft?[{role:'assistant',content:'المسودة المفتوحة: '+draft.serviceName+'، '+draft.format+'، '+(draft.targetDate||'بدون تاريخ')+'\n'+draft.text},...thread]:thread;
        json({answer:await generate(chat,catalog)});
      }catch(error){
        json({error:error.status?error.message:'تعذّر إكمال الطلب. افتح مسوداتي للتحقق قبل إعادة المحاولة.'},error.status||503);
      }
      return;
    }
    if(url.pathname==='/__local/reset'){
      if(walletWrites){respond('انتظري اكتمال طلب البطاقة قبل إعادة التجربة المحلية.',409);return;}
      await buildFixture(true);redirect('/__local/');return;
    }
    if(url.pathname==='/__local/complete-fifth'){await completeVisit(fifthVisit?.id);redirect('/__local/signin?as=customer&next=rewards');return;}
    if(url.pathname==='/__local/complete-referral'){await completeVisit(pendingFriend?.id);redirect('/__local/');return;}
  }
  if(url.pathname==='/__local/state'&&req.method==='GET'){
    respond(JSON.stringify({localFixtureOnly:true,asOf:new Date(fixture.now()).toISOString(),pendingFriend:pendingFriend?.id,ledger:fixture.ledger()}),200,'application/json');return;
  }
  if(url.pathname.startsWith('/api/')){
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1500000){respond('Too large',413);return;}chunks.push(chunk);}
    const bytes=Buffer.concat(chunks),headers={...req.headers};
    if(headers.cookie)headers.cookie=headers.cookie.replace(new RegExp('(?:^|;\\s*)'+COOKIE+'='),m=>m.replace(COOKIE,'__Host-clinime-session'));
    // The loopback harness adapts its HTTP origin/cookie only; production remains
    // HTTPS-only with the unchanged __Host secure cookie and original checks.
    if(headers.origin===ORIGIN)headers.origin=API_ORIGIN;
    const result=await fixture.api(new Request(API_ORIGIN+url.pathname+url.search,{method:req.method,headers,...(bytes.length?{body:bytes}:{})}),{ip:'127.0.0.1'});
    if (url.pathname === '/api/config' && req.method === 'GET' && result.ok && !BASELINE) {
      // Public campaign link only; private member receipts remain account-bound.
      const walletEnrollment = {kind:'public-loopy-campaign',url:'https://loyalty.is/qoq6ip',qr:'/__local/wallet-enrollment.png',target:5,rewardKind:'complimentary-service',serviceId:'basic',giftable:true,localEnrollment:true};
      respond(JSON.stringify({...await result.json(),walletEnrollment}),200,'application/json');
      return;
    }
    const outgoing=Object.fromEntries(result.headers);if(outgoing['set-cookie'])outgoing['set-cookie']=localCookie(outgoing['set-cookie']);
    res.writeHead(result.status,outgoing);res.end(Buffer.from(await result.arrayBuffer()));await save();return;
  }
  if(!['GET','HEAD'].includes(req.method)){respond('Method not allowed',405);return;}
  let file=path.resolve(DIST,decodeURIComponent(url.pathname).replace(/^\/+/,''));
  if(file!==DIST&&!file.startsWith(DIST+path.sep)){respond('Forbidden',403);return;}
  try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');}catch{if(path.extname(url.pathname)){respond('Missing file',404);return;}file=path.join(DIST,url.pathname.startsWith('/admin')?'admin/index.html':'index.html');}
  const content=await readFile(file);res.writeHead(200,{...HEADERS,'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:content);
 }catch(error){if(!res.headersSent)res.writeHead(500,{...HEADERS,'Content-Type':'text/plain; charset=utf-8'});res.end('Local review: '+error.message);console.error(error.message);}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,'127.0.0.1',resolve);});
console.log(`Local-only Clinime review: ${ORIGIN}/__local/`);
