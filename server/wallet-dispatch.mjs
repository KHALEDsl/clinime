// Durable Wallet delivery. Domain operations enqueue within the booking-ledger
// CAS; provider work never changes a booking/payment's accepted result.
import { read } from './core.mjs';
import { WALLET_LEDGER, listWalletEvents, claimWalletEvent, finishWalletEvent } from './wallet-events.mjs';

function statusFrom(ledger, booking, now) {
  const event=ledger?.walletOutbox?.events?.[`booking:${booking.id}:${booking.revision}`];
  if(!event)return null;
  const stale=event.status==='processing'&&now-Date.parse(event.startedAt)>60_000;
  const status=event.status==='sent'?'synced':event.status==='failed'?'failed':event.status==='unknown'||stale?'unknown':event.code==='LOOPY_CARD_REQUIRED'?'waiting-for-card':'pending';
  return {status,...(event.status==='sent'&&event.finishedAt?{lastSyncedAt:event.finishedAt}:{})};
}
export async function projectWalletBookings(store, bookings, now=Date.now()) {
  const ledger=await read(store,WALLET_LEDGER);
  if(!ledger?.walletIntegration?.enabled)return bookings;
  return bookings.map(booking=>{const sync=statusFrom(ledger,booking,now);return sync?{...booking,walletSync:sync}:booking;});
}
export async function projectWalletBooking(store, booking, now=Date.now()) {
  if(!booking)return booking;
  return (await projectWalletBookings(store,[booking],now))[0];
}
const safeBeforeWrite=new Set(['LOOPY_NOT_CONFIGURED','LOOPY_LOOKUP_UNAVAILABLE','LOOPY_ACCESS_DENIED','LOOPY_CAMPAIGN_UNAVAILABLE']);
const configFailure=new Set(['LOOPY_REWARD_CHANGED','LOOPY_FORM_CHANGED','LOOPY_INVALID_CAMPAIGN','LOOPY_DUPLICATE_CARDS','LOOPY_INVALID_BINDING','LOOPY_INVALID_CARD','LOOPY_IDENTITY_CONFLICT','LOOPY_EVENT_CONFLICT']);
export async function flushWalletEvents({store,loopy,now=Date.now,userId,limit=6,budgetMs=25_000,force=false}={}) {
  if(!loopy?.configured)return {enabled:false,sent:0,pending:0,unknown:0,failed:0,skipped:0};
  const report={enabled:true,sent:0,pending:0,unknown:0,failed:0,skipped:0},began=Date.now();
  const initial=await read(store,WALLET_LEDGER);
  if(!initial?.walletIntegration?.enabled)return report;
  // Expiration is a visibility transition, never permission to repeat a write.
  for(const event of Object.values(initial.walletOutbox?.events||{})) {
    if((!userId||event.userId===userId)&&event.status==='processing'&&now()-Date.parse(event.startedAt)>60_000)await finishWalletEvent(store,event.id,{status:'unknown',code:'LOOPY_WORKER_UNCONFIRMED'},now);
  }
  // A timed-out stamp may already exist on the card. Verify the per-attempt
  // provider receipt; never resend an uncertain mutation or guess from totals.
  let attempts=0;
  if(typeof loopy.reconcileDelivery==='function') {
    const current=await read(store,WALLET_LEDGER);
    const uncertain=Object.values(current?.walletOutbox?.events||{}).sort((a,b)=>(a.updatedAt||a.createdAt).localeCompare(b.updatedAt||b.createdAt));
    for(const event of uncertain) {
      if(attempts>=Math.max(1,Math.floor(limit/2))||Date.now()-began>=budgetMs)break;
      if(event.kind!=='stamp'||event.status!=='unknown'||!event.reconciliationAvailable||(userId&&event.userId!==userId))continue;
      attempts++;
      try {
        const user=await read(store,'user/'+event.userId);
        if(!user?.email)continue;
        const receipt=await loopy.reconcileDelivery(user,event);
        if(receipt.status==='delivered'){await finishWalletEvent(store,event.id,{status:'sent'},now);report.sent++;}
        else await finishWalletEvent(store,event.id,{status:'unknown',code:event.code||'LOOPY_WRITE_UNCONFIRMED'},now);
      }catch{
        // Rotate uncertain accounts too; an absent receipt must not monopolize
        // scheduled batches or prevent other members' acknowledged pending work.
        await finishWalletEvent(store,event.id,{status:'unknown',code:event.code||'LOOPY_WRITE_UNCONFIRMED'},now);
      }
    }
  }
  // Rotate waiting accounts rather than letting an old, uninstalled card
  // consume every scheduled batch. Member-level ordering remains CAS guarded.
  const candidates=(await listWalletEvents(store,{userId,limit:Number.MAX_SAFE_INTEGER})).sort((a,b)=>(a.updatedAt||a.createdAt).localeCompare(b.updatedAt||b.createdAt)||a.sequence-b.sequence);
  for(const candidate of candidates) {
    if(attempts>=limit||Date.now()-began>=budgetMs)break;
    if(!force&&candidate.updatedAt&&now()-Date.parse(candidate.updatedAt)<60_000)continue;
    const event=await claimWalletEvent(store,candidate.id,now);
    if(!event)continue;
    attempts++;
    // A pending confirmation from an earlier revision must never follow a move
    // or cancellation and announce stale appointment information.
    if(event.kind==='booking-message'&&event.id.startsWith('booking:')) {
      const [,id,revision]=event.id.split(':');
      const ledger=await read(store,WALLET_LEDGER),booking=ledger?.bookings?.[id];
      if(!booking||booking.revision!==Number(revision)){await finishWalletEvent(store,event.id,{status:'skipped'},now);report.skipped++;continue;}
    }
    let outcome;
    try {
      const user=await read(store,'user/'+event.userId);
      if(!user?.email)outcome={status:'pending',code:'WALLET_ACCOUNT_MISSING'};
      else {
        const result=await loopy.deliver(user,event);
        outcome=result.status==='delivered'?{status:'sent'}
          :result.status==='blocked'&&['LOOPY_CARD_REQUIRED','LOOPY_PREVIOUS_UNCONFIRMED','LOOPY_DELIVERY_BUDGET'].includes(result.reason)?{status:'pending',code:result.reason}
          :result.status==='rejected'?{status:'failed',code:result.reason||'LOOPY_WRITE_REJECTED'}
          :{status:'unknown',code:result.reason||'LOOPY_WRITE_UNCONFIRMED'};
      }
    }catch(error){
      outcome=safeBeforeWrite.has(error.code)?{status:'pending',code:error.code}:configFailure.has(error.code)?{status:'failed',code:error.code}:{status:'unknown',code:'LOOPY_WRITE_UNCONFIRMED'};
    }
    // A failed receipt save leaves processing, preventing unsafe redispatch.
    await finishWalletEvent(store,event.id,outcome,now);
    report[outcome.status]++;
  }
  return report;
}
