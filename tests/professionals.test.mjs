import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFixture } from '../scripts/staff-local-server.mjs';
import { configuredProfessionals, LOCAL_PROFESSIONALS } from '../server/professionals.mjs';

const input = professional => ({ requestId: randomUUID(), professional, items: [{ serviceId: 'basic' }], date: '2026-11-01', time: '11:00', contactName: 'عميلة محلية', attendee: {kind:'self'} });
const expectOK = result => { assert.equal(result.status,200,JSON.stringify(result.data));return result.data; };

test('the explicit local roster is shared by customer config and staff, with managers excluded from bookable specialists', async () => {
  const fixture = await createFixture({ seed:false, specialistRoster:true });
  const account = await fixture.login('staff@example.invalid');
  const config = expectOK(await fixture.request('/api/config'));
  const workspace = expectOK(await fixture.request('/api/admin/workspace',{account}));
  assert.equal(config.professionals.length,7);
  assert.deepEqual(config.professionals,workspace.professionals);
  assert.equal(config.rosterIsSample,true);
  assert.equal(config.schedulingMode,'shared-room');
  assert.equal(workspace.clinicTeam.find(person=>person.id==='gigi').role,'manager');
  assert.equal(workspace.clinicTeam.find(person=>person.id==='kender').role,'reception');
  assert.equal(workspace.clinicTeam.find(person=>person.id==='gigi').bookable,false);
  assert.ok(config.professionals.every(person=>person.image==='/assets/specialists/'+person.id+'.jpg'));
  for(const professional of ['gigi','kender','unknown']) {
    assert.equal((await fixture.request('/api/bookings',{account,method:'POST',data:input(professional)})).status,400);
  }
});

test('chosen specialist and automatic assignment persist to customer and staff snapshots without changing shared-room capacity', async () => {
  const fixture = await createFixture({seed:false,specialistRoster:true});
  const account = await fixture.login('customer@example.invalid');
  const data = input('noura');
  const chosen = expectOK(await fixture.request('/api/bookings',{account,method:'POST',data})).booking;
  assert.equal(chosen.professional,'noura');assert.equal(chosen.professionalNameAr,'نورة');
  const replay = expectOK(await fixture.request('/api/bookings',{account,method:'POST',data})).booking;
  assert.equal(replay.id,chosen.id);
  const workspace = expectOK(await fixture.request('/api/admin/workspace',{account}));
  assert.equal(workspace.bookings[0].professionalNameAr,chosen.professionalNameAr);
  const me = expectOK(await fixture.request('/api/me',{account}));
  assert.equal(me.bookings[0].professionalNameAr,chosen.professionalNameAr);
  const conflict = await fixture.request('/api/bookings',{account,method:'POST',data:input('layla')});
  assert.equal(conflict.status,409);assert.equal(conflict.data.error.code,'SLOT_UNAVAILABLE');
  const services = 'basic';
  const availability = expectOK(await fixture.request('/api/availability?date=2026-11-01&services='+services+'&professional=layla'));
  assert.ok(!availability.slots.includes('11:00'));assert.equal(availability.professional,'layla');
  const automatic = expectOK(await fixture.request('/api/bookings',{account,method:'POST',data:{...input('any'),time:'12:00'}})).booking;
  assert.notEqual(automatic.professional,'any');assert.notEqual(automatic.professional,'gigi');
  assert.ok(LOCAL_PROFESSIONALS.some(person=>person.id===automatic.professional));
  assert.ok(automatic.professionalNameAr);
});

test('existing Gigi bookings remain readable and reschedulable, and an unconfigured deployment retains its existing booking contract', async () => {
  const legacy = await createFixture({seed:false});
  const account = await legacy.login('customer@example.invalid');
  const old = expectOK(await legacy.request('/api/bookings',{account,method:'POST',data:input('gigi')})).booking;
  assert.equal(old.professional,'gigi');
  assert.equal(expectOK(await legacy.request('/api/config')).professionals,undefined);
  const enabled = await createFixture({seed:false,specialistRoster:true});
  enabled.store.records = new Map(legacy.store.records);enabled.store.version=legacy.store.version;
  const me = expectOK(await enabled.request('/api/me',{account}));
  assert.equal(me.bookings[0].id,old.id);assert.equal(me.bookings[0].professional,'gigi');
  const moved = expectOK(await enabled.request('/api/bookings/'+old.id,{account,method:'PATCH',data:{requestId:randomUUID(),revision:old.revision,date:old.date,time:'12:00'}})).booking;
  assert.equal(moved.professional,'gigi');assert.equal(moved.time,'12:00');
  assert.equal(Object.keys(enabled.ledger().bookings).length,1);
});

test('invalid roster configuration is closed to new booking choices', () => {
  assert.equal(configuredProfessionals(undefined),null);
  assert.deepEqual(configuredProfessionals('invalid'),[]);
  assert.deepEqual(configuredProfessionals(JSON.stringify([LOCAL_PROFESSIONALS[0],LOCAL_PROFESSIONALS[0]])),[]);
  assert.deepEqual(configuredProfessionals(JSON.stringify([{...LOCAL_PROFESSIONALS[0],image:'https://external.invalid/portrait.jpg'}])),[]);
});
