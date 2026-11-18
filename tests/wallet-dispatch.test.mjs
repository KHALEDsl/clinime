import test from 'node:test';
import assert from 'node:assert/strict';
import { read, update } from '../server/core.mjs';
import { activateWalletProgram, enqueueWalletEvent, queueBookingWalletEvent, claimWalletEvent, finishWalletEvent, WALLET_LEDGER } from '../server/wallet-events.mjs';
import { flushWalletEvents, projectWalletBookings } from '../server/wallet-dispatch.mjs';

// Tests use in-memory CAS and a fake provider. No card or financial writes.
class Store {
  records=new Map(); version=0;
  async getWithMetadata(key){return structuredClone(this.records.get(key)||null);}
  async setJSON(key,data,options={}){const prior=this.records.get(key);if(options.onlyIfNew&&prior||options.onlyIfMatch&&prior?.etag!==options.onlyIfMatch)return {modified:false};const etag=String(++this.version);this.records.set(key,{data:structuredClone(data),etag});return {modified:true,etag};}
}
const TIME=Date.parse('2026-11-04T09:00:00Z');
const user={id:'owner',email:'owner@example.invalid'};
async function setup(){const store=new Store();await activateWalletProgram(store,TIME);await store.setJSON('user/'+user.id,user);return store;}
async function queue(store,event,at=TIME){await update(store,WALLET_LEDGER,value=>{enqueueWalletEvent(value,{userId:user.id,...event},at);return {value};});}
const receipt=(store,id)=>read(store,WALLET_LEDGER).then(v=>v.walletOutbox.events[id]);

test('an uncertain tagged stamp is verified read-only before a later stamp can send',async()=>{
  const store=await setup();await queue(store,{id:'uncertain',kind:'stamp',stamps:1});await claimWalletEvent(store,'uncertain',TIME);await finishWalletEvent(store,'uncertain',{status:'unknown',code:'LOOPY_WRITE_UNCONFIRMED'},TIME);
  await queue(store,{id:'next',kind:'stamp',stamps:1});let found=false,checks=0;const writes=[];
  const loopy={configured:true,reconcileDelivery:async(_user,event)=>{assert.equal(event.id,'uncertain');checks++;return {status:found?'delivered':'unknown'};},deliver:async(_user,event)=>{writes.push(event.id);return {status:'delivered'};}};
  await flushWalletEvents({store,loopy,now:()=>TIME+1000});assert.deepEqual(writes,[]);assert.equal((await receipt(store,'uncertain')).status,'unknown');assert.equal((await receipt(store,'next')).status,'pending');
  found=true;await Promise.all([flushWalletEvents({store,loopy,now:()=>TIME+61000}),flushWalletEvents({store,loopy,now:()=>TIME+61000})]);
  assert.ok(checks>=2);assert.deepEqual(writes,['next']);assert.equal((await receipt(store,'uncertain')).status,'sent');assert.equal((await receipt(store,'next')).status,'sent');
  await flushWalletEvents({store,loopy,now:()=>TIME+122000});assert.deepEqual(writes,['next']);
});

test('a crashed tagged stamp worker recovers by receipt lookup without issuing the stamp again',async()=>{
  const store=await setup();await queue(store,{id:'crashed',kind:'stamp',stamps:1});await claimWalletEvent(store,'crashed',TIME);let checks=0,writes=0;
  const loopy={configured:true,reconcileDelivery:async()=>{checks++;return {status:'delivered'};},deliver:async()=>{writes++;return {status:'delivered'};}};
  await flushWalletEvents({store,loopy,now:()=>TIME+35000});assert.equal(checks,0);assert.equal((await receipt(store,'crashed')).status,'processing');
  await flushWalletEvents({store,loopy,now:()=>TIME+61000});assert.equal(checks,1);assert.equal(writes,0);assert.equal((await receipt(store,'crashed')).status,'sent');
});

test('legacy untagged uncertain stamps and messages are never resubmitted or automatically guessed',async()=>{
  const store=await setup();for(const [id,kind]of[['legacy','stamp'],['message','booking-message']])await queue(store,{id,kind,...(kind==='stamp'?{stamps:1}:{message:'Update'})});
  await update(store,WALLET_LEDGER,value=>{for(const event of Object.values(value.walletOutbox.events)){event.status='unknown';delete event.reconciliationAvailable;}return {value};});
  let calls=0;const loopy={configured:true,reconcileDelivery:async()=>{calls++;return {status:'delivered'};},deliver:async()=>{calls++;return {status:'delivered'};}};
  await flushWalletEvents({store,loopy,now:()=>TIME+61000});assert.equal(calls,0);assert.equal((await receipt(store,'legacy')).status,'unknown');
});

test('a receipt read failure keeps financial ordering and allows unrelated members to progress',async()=>{
  const store=await setup();await queue(store,{id:'unknown',kind:'stamp',stamps:1});await claimWalletEvent(store,'unknown',TIME);await finishWalletEvent(store,'unknown',{status:'unknown'},TIME);await queue(store,{id:'blocked',kind:'stamp',stamps:1});
  await store.setJSON('user/other',{id:'other',email:'other@example.invalid'});await queue(store,{id:'unrelated',userId:'other',kind:'stamp',stamps:1});const writes=[];
  await flushWalletEvents({store,now:()=>TIME+61000,limit:2,loopy:{configured:true,reconcileDelivery:async()=>{throw Error('Read unavailable');},deliver:async(_user,event)=>{writes.push(event.id);return {status:'delivered'};}}});
  assert.deepEqual(writes,['unrelated']);assert.equal((await receipt(store,'unknown')).status,'unknown');assert.equal((await receipt(store,'blocked')).status,'pending');
});

test('concurrent delivery and repeated sweeps send each semantic event once',async()=>{
  const store=await setup();await queue(store,{id:'stamp:paid-1',kind:'stamp',stamps:1});
  let calls=0;const loopy={configured:true,deliver:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return {status:'delivered'};}};
  await Promise.all([flushWalletEvents({store,loopy,now:()=>TIME}),flushWalletEvents({store,loopy,now:()=>TIME})]);
  await flushWalletEvents({store,loopy,now:()=>TIME+120000});
  assert.equal(calls,1);assert.equal((await receipt(store,'stamp:paid-1')).status,'sent');
});
test('superseded booking confirmations are discarded before sending the current cancellation',async()=>{
  const store=await setup(),booking={id:'CL-1',revision:1,ownerId:user.id,date:'2026-11-05',time:'12:00',locale:'en'};
  await update(store,WALLET_LEDGER,value=>{queueBookingWalletEvent(value,booking,'create',TIME);booking.revision=2;booking.status='cancelled';value.bookings[booking.id]=booking;queueBookingWalletEvent(value,booking,'cancel',TIME);return {value};});
  const delivered=[];await flushWalletEvents({store,now:()=>TIME,loopy:{configured:true,deliver:async(_user,event)=>{delivered.push(event);return {status:'delivered'};}}});
  assert.deepEqual(delivered.map(e=>e.id),['booking:CL-1:2']);assert.match(delivered[0].message,/cancelled/);assert.equal((await receipt(store,'booking:CL-1:1')).status,'skipped');
});
test('a missing card waits safely, and enrollment can immediately resume the queued message',async()=>{
  const store=await setup();await queue(store,{id:'message',kind:'booking-message',message:'An update'});
  let linked=false,calls=0;const loopy={configured:true,deliver:async()=>{calls++;return linked?{status:'delivered'}:{status:'blocked',reason:'LOOPY_CARD_REQUIRED'};}};
  await flushWalletEvents({store,loopy,now:()=>TIME});assert.equal((await receipt(store,'message')).code,'LOOPY_CARD_REQUIRED');
  linked=true;await flushWalletEvents({store,loopy,now:()=>TIME+1000});assert.equal(calls,1);
  await flushWalletEvents({store,loopy,now:()=>TIME+1000,force:true});assert.equal(calls,2);assert.equal((await receipt(store,'message')).status,'sent');
});
test('ambiguous writes block retry and all subsequent member events, while other members continue',async()=>{
  const store=await setup();await queue(store,{id:'first',kind:'stamp',stamps:1});await queue(store,{id:'later',kind:'stamp',stamps:1});
  await store.setJSON('user/other',{id:'other',email:'other@example.invalid'});await queue(store,{id:'separate',userId:'other',kind:'stamp',stamps:1});
  const calls=[];const loopy={configured:true,deliver:async(_user,event)=>{calls.push(event.id);return event.id==='first'?{status:'unknown'}:{status:'delivered'};}};
  await flushWalletEvents({store,loopy,now:()=>TIME});await flushWalletEvents({store,loopy,now:()=>TIME+120000});
  assert.deepEqual(calls,['first','separate']);assert.equal((await receipt(store,'first')).status,'unknown');assert.equal((await receipt(store,'later')).status,'pending');
});
test('an expired worker is marked uncertain without making a second provider write',async()=>{
  const store=await setup();await queue(store,{id:'crashed',kind:'stamp',stamps:1});await claimWalletEvent(store,'crashed',TIME);
  let calls=0;await flushWalletEvents({store,now:()=>TIME+61000,loopy:{configured:true,deliver:async()=>{calls++;return {status:'delivered'};}}});
  assert.equal(calls,0);assert.equal((await receipt(store,'crashed')).status,'unknown');
});
test('uncertain, failed and safely waiting notifications do not prevent once-only financial delivery',async()=>{
  for(const messageResult of [{status:'unknown'},{status:'rejected',reason:'LOOPY_WRITE_REJECTED'},{status:'blocked',reason:'LOOPY_CARD_REQUIRED'}]){
    const store=await setup();await queue(store,{id:'notification',kind:'booking-message',message:'Update'});await queue(store,{id:'stamp',kind:'stamp',stamps:1});await queue(store,{id:'redeem',kind:'redeem',rewardType:1,rewards:1});
    const calls=[];const loopy={configured:true,deliver:async(_user,event)=>{calls.push(event.id);return event.kind==='booking-message'?messageResult:{status:'delivered'};}};
    await flushWalletEvents({store,loopy,now:()=>TIME});await flushWalletEvents({store,loopy,now:()=>TIME+120000});
    assert.equal(calls.filter(id=>id==='stamp').length,1);assert.equal(calls.filter(id=>id==='redeem').length,1);
    assert.equal((await receipt(store,'stamp')).status,'sent');assert.equal((await receipt(store,'redeem')).status,'sent');
    if(messageResult.status!=='blocked')assert.equal(calls.filter(id=>id==='notification').length,1);
  }
});
test('an expired notification worker remains uncertain while subsequent financial work proceeds',async()=>{
  const store=await setup();await queue(store,{id:'notification',kind:'booking-message',message:'Update'});await claimWalletEvent(store,'notification',TIME);await queue(store,{id:'stamp',kind:'stamp',stamps:1});
  const calls=[];const loopy={configured:true,deliver:async(_user,event)=>{calls.push(event.id);return {status:'delivered'};}};
  await flushWalletEvents({store,loopy,now:()=>TIME+61000});await flushWalletEvents({store,loopy,now:()=>TIME+120000});
  assert.deepEqual(calls,['stamp']);assert.equal((await receipt(store,'notification')).status,'unknown');assert.equal((await receipt(store,'stamp')).status,'sent');
});
test('explicit blocking before a new provider intent remains pending and can resume safely',async()=>{
  for(const reason of ['LOOPY_PREVIOUS_UNCONFIRMED','LOOPY_DELIVERY_BUDGET']){
    const store=await setup();await queue(store,{id:'stamp',kind:'stamp',stamps:1});let blocked=true;const calls=[];
    const loopy={configured:true,deliver:async(_user,event)=>{calls.push(event.id);return blocked?{status:'blocked',reason}:{status:'delivered'};}};
    const first=await flushWalletEvents({store,loopy,now:()=>TIME});assert.equal(first.pending,1);assert.equal(first.unknown,0);assert.equal((await receipt(store,'stamp')).status,'pending');assert.equal((await receipt(store,'stamp')).code,reason);
    blocked=false;await flushWalletEvents({store,loopy,now:()=>TIME+1000});assert.equal(calls.length,1);
    await flushWalletEvents({store,loopy,now:()=>TIME+61000});await flushWalletEvents({store,loopy,now:()=>TIME+122000});assert.equal(calls.length,2);assert.equal((await receipt(store,'stamp')).status,'sent');
  }
});
test('a concurrent sweep preserves a financial worker still active after thirty seconds',async()=>{
  const store=await setup();await queue(store,{id:'slow-stamp',kind:'stamp',stamps:1});await queue(store,{id:'later-stamp',kind:'stamp',stamps:1});
  let release,started;const gate=new Promise(resolve=>{release=resolve;});const entered=new Promise(resolve=>{started=resolve;});const calls=[];
  const loopy={configured:true,deliver:async(_user,event)=>{calls.push(event.id);if(event.id==='slow-stamp'){started();await gate;}return {status:'delivered'};}};
  const first=flushWalletEvents({store,loopy,now:()=>TIME,limit:1});await entered;
  try{
    await flushWalletEvents({store,loopy,now:()=>TIME+35000});
    assert.equal((await receipt(store,'slow-stamp')).status,'processing');assert.equal((await receipt(store,'later-stamp')).status,'pending');assert.deepEqual(calls,['slow-stamp']);
  }finally{release();await first;}
  await flushWalletEvents({store,loopy,now:()=>TIME+36000});assert.deepEqual(calls,['slow-stamp','later-stamp']);assert.equal((await receipt(store,'slow-stamp')).status,'sent');
});
test('booking projection keeps a processing message pending until the full worker expiry',async()=>{
  const store=await setup(),booking={id:'CL-SLOW',revision:1};await queue(store,{id:'booking:CL-SLOW:1',kind:'booking-message',message:'Update'});await claimWalletEvent(store,'booking:CL-SLOW:1',TIME);
  assert.equal((await projectWalletBookings(store,[booking],TIME+35000))[0].walletSync.status,'pending');
  assert.equal((await projectWalletBookings(store,[booking],TIME+61000))[0].walletSync.status,'unknown');
});
test('safe pre-write outages are retryable but ambiguous exceptions are not',async()=>{
  const store=await setup();await queue(store,{id:'network',kind:'stamp',stamps:1});let safe=true,calls=0;
  const loopy={configured:true,deliver:async()=>{calls++;const error=Error('provider');if(safe)error.code='LOOPY_LOOKUP_UNAVAILABLE';throw error;}};
  await flushWalletEvents({store,loopy,now:()=>TIME});assert.equal((await receipt(store,'network')).status,'pending');
  safe=false;await flushWalletEvents({store,loopy,now:()=>TIME+61000});assert.equal((await receipt(store,'network')).status,'unknown');
  await flushWalletEvents({store,loopy,now:()=>TIME+122000});assert.equal(calls,2);
});
test('booking projection exposes only a safe delivery state for the current revision',async()=>{
  const store=await setup(),booking={id:'CL-2',revision:1};await update(store,WALLET_LEDGER,value=>{value.bookings[booking.id]=booking;return {value};});await queue(store,{id:'booking:CL-2:1',kind:'booking-message',message:'private'});
  const pending=(await projectWalletBookings(store,[booking],TIME))[0];assert.deepEqual(pending.walletSync,{status:'pending'});
  await flushWalletEvents({store,now:()=>TIME,loopy:{configured:true,deliver:async()=>({status:'delivered'})}});
  assert.deepEqual((await projectWalletBookings(store,[booking],TIME))[0].walletSync,{status:'synced',lastSyncedAt:new Date(TIME).toISOString()});
  assert.equal((await projectWalletBookings(store,[{...booking,revision:2}],TIME))[0].walletSync,undefined);
});
test('large waiting-card cohorts rotate instead of starving linked accounts outside the first batch',async()=>{
  const store=await setup();for(let n=0;n<105;n++){const id='member-'+n;await store.setJSON('user/'+id,{id,email:id+'@example.invalid'});await queue(store,{id:'event-'+n,userId:id,kind:'booking-message',message:'update'},TIME+n);}
  const delivered=[];const loopy={configured:true,deliver:async(member,event)=>{if(member.id==='member-104'){delivered.push(event.id);return {status:'delivered'};}return {status:'blocked',reason:'LOOPY_CARD_REQUIRED'};}};
  for(let batch=0;batch<14;batch++)await flushWalletEvents({store,loopy,now:()=>TIME+3600000*(batch+1),limit:8});
  assert.deepEqual(delivered,['event-104']);
});
test('gift messages for an unregistered recipient remain retryable after the recipient signs in',async()=>{
  const store=await setup();await queue(store,{id:'gift:first',userId:'new-recipient',kind:'booking-message',message:'A gift is waiting'});await queue(store,{id:'gift:later',userId:'new-recipient',kind:'booking-message',message:'Later update'});
  const calls=[];const loopy={configured:true,deliver:async(member,event)=>{assert.equal(member.email,'recipient@example.invalid');calls.push(event.id);return {status:'delivered'};}};
  await flushWalletEvents({store,loopy,now:()=>TIME});assert.equal((await receipt(store,'gift:first')).status,'pending');assert.equal(calls.length,0);
  await store.setJSON('user/new-recipient',{id:'new-recipient',email:'recipient@example.invalid'});await flushWalletEvents({store,loopy,now:()=>TIME+1000,force:true});
  assert.deepEqual(calls,['gift:first','gift:later']);
});
