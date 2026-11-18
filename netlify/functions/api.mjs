import { getStore } from '@netlify/blobs';
import { createAPI, normalizeEnv } from '../../server/api.mjs';
import { createResendMail } from '../../server/mail.mjs';
import { createLoopy } from '../../server/loopy.mjs';
import { read } from '../../server/core.mjs';
import { WALLET_LEDGER } from '../../server/wallet-events.mjs';
import { flushWalletEvents } from '../../server/wallet-dispatch.mjs';

// Netlify's Request/Context handler; private Blobs and provider credentials stay
// server-side. Wallet delivery extends the invocation without delaying booking.
export default async function handler(request, context) {
  const requestDeadline=Date.now()+50_000;
  const config=normalizeEnv();
  if(!config.enabled)return createAPI({store:null,mail:null})(request,context);
  try {
    const store=getStore({name:'clinime-private-v1',consistency:'strong'});
    const mail=createResendMail({apiKey:config.mailKey,from:config.from});
    const api=createAPI({store,mail});
    const pathname=new URL(request.url).pathname.replace(/^\/\.netlify\/functions\/api(?=\/|$)/,'').replace(/^\/api(?=\/|$)/,'');
    const mutation=!['GET','HEAD'].includes(request.method);
    const capture=config.walletEnabled&&mutation&&['/admin/workspace','/loyalty/gift'].includes(pathname)?request.clone():null;
    const result=await api(request,context);
    try { if(config.walletEnabled&&result.ok&&((mutation&&/^(?:\/bookings|\/admin\/bookings|\/admin\/workspace|\/loyalty\/gift|\/wallet\/enroll)/.test(pathname))||['/me','/wallet/campaign'].includes(pathname))) {
      const payload=await result.clone().json();
      const targets=new Set();
      if(payload.user?.id)targets.add(payload.user.id);
      let input={};if(capture)try{input=await capture.json();}catch{/* The successful API already validated its request. */}
      const bookingId=payload.booking?.id||input.bookingId;
      if(bookingId||input.rewardId){
        const ledger=await read(store,WALLET_LEDGER);
        if(bookingId&&ledger?.bookings?.[bookingId])targets.add(ledger.bookings[bookingId].ownerId);
        const reward=input.rewardId&&ledger?.visitProgram?.rewards?.[input.rewardId];
        if(reward){targets.add(reward.ownerId);targets.add(reward.earnerId);}
      }
      if(!targets.size&&['/wallet/enroll','/wallet/campaign'].includes(pathname)) {
        const identity=await api(new Request(config.origin+'/api/me',{headers:{cookie:request.headers.get('cookie')||''}}),context);
        if(identity.ok){const active=await identity.json();if(active.user?.id)targets.add(active.user.id);}
      }
      if(targets.size){
        const loopy=createLoopy({store,config:config.loopyConfig,timeoutMs:8000,writeTimeoutMs:35_000,deadlineAt:requestDeadline});
        const work=(async()=>{for(const userId of targets)await flushWalletEvents({store,loopy,userId,limit:6,budgetMs:20_000,force:pathname==='/wallet/enroll'});})().catch(()=>{/* The durable queue remains; never alter booking/mail success. */});
        if(typeof context?.waitUntil==='function')context.waitUntil(work);else await work;
      }
    }}catch{/* Optional Wallet dispatch must never downgrade an accepted booking. */}
    return result;
  }catch {
    return Response.json({error:{code:'STORE_UNAVAILABLE',message:'الخدمة غير متاحة مؤقتًا. أعيدي المحاولة بنفس الطلب.'}},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
}
