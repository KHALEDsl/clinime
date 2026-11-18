import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const bridge=await readFile(new URL('../client/admin/staff/bridge.js',import.meta.url),'utf8');
const start=bridge.split('\n').find(line=>line.startsWith('startSession='));
const appSource=await readFile(new URL('../client/admin/staff/app.js',import.meta.url),'utf8');
const teamSource=await readFile(new URL('../client/admin/staff/team.js',import.meta.url),'utf8');
const baseDetail=appSource.split('\n').find(line=>line.startsWith('function detail('));
const teamDetail=teamSource.split('\n').find(line=>line.startsWith('detail=function('));
const bridgeDetail=bridge.split('\n').find(line=>line.startsWith('detail=function('));
function harness(patch={},view='doctor'){
  const appointment={id:'local-booking',name:'Local fixture',status:'waiting',date:'2026-11-06',time:'14:00',professional:'noura',patientId:'local-patient',...patch};
  const booking={attendance:{status:'arrived'}},flags={consultation:true,assessment:true,consent:true},calls=[];
  const user={id:'verified-staff',email:'local@example.test'},S={pending:null,dirty:false,user};
  const context=vm.createContext({S,role:view,admin:view==='manager',openKpi:'waiting',sessionStorage:{setItem:(key,value)=>calls.push({type:'storage',key,value})},closeChat:()=>calls.push({type:'closeChat'}),paintStatus:()=>calls.push({type:'status'}),today:'2026-11-05',startIntent:null,app:()=>appointment,raw:()=>booking,db:{appointments:[appointment,{id:'other-specialist',status:'session',professional:'layla',date:'2026-11-05'}],receipts:[]},location:{hash:'#appointment/local-booking'},E:String,fmt:String,medicalFor:()=>flags,missingReviews:values=>Object.keys(values).filter(key=>!values[key]),modal:(title,body)=>calls.push({type:'modal',title,body}),feedback:message=>calls.push({type:'feedback',message}),resolveDecision:id=>calls.push({type:'decision',id}),command:(action,id,payload,success)=>{calls.push({type:'command',action,id,payload});success();},closeModal:()=>calls.push({type:'close'}),render:()=>calls.push({type:'render'})});
  vm.runInContext(start,context);return{appointment,booking,flags,calls,context,run:()=>vm.runInContext("startSession('local-booking')",context)};
}
test('client starts an eligible appointment immediately across booked dates and times, despite another specialist session',()=>{
  for(const date of ['2026-11-04','2026-11-05','2026-11-06'])for(const time of ['11:30','14:00','21:30']){
    const h=harness({date,time});h.run();const commands=h.calls.filter(c=>c.type==='command');assert.equal(commands.length,1);assert.equal(commands[0].action,'session-start');assert.equal(commands[0].payload.confirmProceed,true);assert.equal(h.context.location.hash,'session/local-booking');assert.equal(h.context.startIntent,null);assert.equal(h.appointment.date,date);assert.equal(h.appointment.time,time);assert.ok(!h.calls.some(c=>c.type==='modal'));
  }
});
test('actual appointment detail exposes one primary start or continue button in its main toolbar in every work view',()=>{
  for(const view of ['reception','manager','doctor'])for(const status of ['expected','waiting','session','checkout','closed','cancelled']){
    const h=harness({status,items:[],serviceName:'Fixture service',duration:45,price:250,paid:0},view);
    Object.assign(h.context,{esc:String,head:()=>'',money:String,payment:()=>'',services:[],staffPricingBreakdown:()=>'',btn:(text,action,cls='')=>`<button class="${cls}" data-staff-click="${action}">${text}</button>`});
    vm.runInContext(baseDetail+'\nconst priorDetail=detail;\n'+teamDetail+'\nconst approvedDetail=detail;\n'+bridgeDetail,h.context);
    const html=vm.runInContext("detail('local-booking')",h.context),buttons=[...html.matchAll(/<button class="primary" data-staff-click="startSession\('local-booking'\)">([^<]+)<\/button>/g)];
    const eligible=['expected','waiting','session'].includes(status);
    assert.equal(buttons.length,eligible?1:0,`${view}/${status}`);
    if(eligible){assert.equal(buttons[0][1],status==='session'?'متابعة الجلسة':'بدء الجلسة');assert.ok(html.includes('<div class="toolbar" style="margin-top:24px">'+buttons[0][0]));}
  }
});
test('reception and manager entry preserve identity and appointment while continuing real prerequisites',()=>{
  for(const view of ['reception','manager']){
    const h=harness({},view),user=h.context.S.user;delete h.booking.attendance;h.run();
    assert.equal(h.context.role,'doctor');assert.equal(h.context.admin,false);assert.equal(h.context.S.user,user);
    assert.equal(h.context.location.hash,'#appointment/local-booking');assert.equal(h.context.startIntent.phase,'arrival');
    assert.equal(h.booking.attendance,undefined);assert.ok(!h.calls.some(c=>c.type==='command'));
    assert.deepEqual(h.calls.find(c=>c.type==='storage'),{type:'storage',key:'clinime-role',value:'doctor'});
    h.booking.attendance={status:'arrived'};h.flags.consent=false;h.run();
    assert.equal(h.context.location.hash,'medical/local-booking');assert.equal(h.context.startIntent.phase,'medical');assert.equal(h.flags.consent,false);assert.equal(h.context.S.user,user);
    assert.ok(!h.calls.some(c=>c.type==='command'));
  }
});
test('pending or unsaved cross-view entry preserves work and submits no start',()=>{
  for(const view of ['reception','manager'])for(const blocked of ['pending','dirty']){
    const h=harness({},view);h.context.S[blocked]=blocked==='pending'?{phase:'unknown'}:true;h.run();
    assert.equal(h.context.role,view);assert.equal(h.context.location.hash,'#appointment/local-booking');assert.equal(h.context.startIntent,null);assert.ok(!h.calls.some(c=>c.type==='command'||c.type==='storage'));
    assert.ok(h.calls.some(c=>c.type===(blocked==='pending'?'status':'feedback')));
  }
});
test('client still requires real arrival and never invents it',()=>{
  const h=harness();delete h.booking.attendance;h.run();assert.equal(h.context.startIntent.phase,'arrival');assert.ok(h.calls.find(c=>c.type==='modal').body.includes('حضورها الفعلي'));assert.ok(!h.calls.some(c=>c.type==='command'));assert.equal(h.booking.attendance,undefined);
});
test('client preserves start intent through clinical review without auto-attesting missing fields',()=>{
  const h=harness();h.flags.consent=false;h.run();assert.equal(h.context.location.hash,'medical/local-booking');assert.equal(h.context.startIntent.phase,'medical');assert.equal(h.flags.consent,false);assert.ok(!h.calls.some(c=>c.type==='command'));
});
test('client preserves explicit hold/reschedule/cancel decisions before starting',()=>{
  for(const doctorDecision of ['hold','reschedule-requested','cancel-requested']){const h=harness({doctorDecision});h.run();assert.equal(h.context.startIntent.phase,'decision');assert.ok(h.calls.some(c=>c.type==='decision'));assert.ok(!h.calls.some(c=>c.type==='command'));}
});
test('terminal or already running sessions never submit another start',()=>{
  for(const status of ['cancelled','checkout','closed','session']){const h=harness({status});h.run();assert.ok(!h.calls.some(c=>c.type==='command'));assert.equal(h.context.startIntent,null);if(status==='session')assert.equal(h.context.location.hash,'session/local-booking');}
});
