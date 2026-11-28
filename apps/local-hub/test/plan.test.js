import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlan, applyPlanOp, serviceWarnings, nextSundays, needFor, placesOf, urgency, timeLevel } from '../src/plan.js';

test('nextSundays gives Sundays at the chosen hour', () => {
  const d = nextSundays(new Date('2026-11-17T12:00:00'), 3, '10:30');
  assert.deepEqual(d.map(x => [x.getDay(), x.getHours(), x.getMinutes(), x.getDate()]), [[0, 10, 30, 22], [0, 10, 30, 29], [0, 10, 30, 6]]);
});

test('plan: services, program, volunteers, assignments, warnings', () => {
  const p = defaultPlan();
  assert.equal(applyPlanOp(p, { op: 'addSundays', count: 4 }), null);
  assert.equal(p.services.length, 4);
  applyPlanOp(p, { op: 'addSundays', count: 4 });
  assert.equal(p.services.length, 4, 'no duplicates for the same Sunday');
  const s = p.services[0];
  applyPlanOp(p, { op: 'setItems', id: s.id, items: [{ kind: 'song', songId: 'x', key: 'G', minutes: 5 }, { kind: 'sermon', title: 'Predică', minutes: 35 }, { kind: 'hack', title: '<b>' }] });
  assert.equal(s.items.length, 3); assert.equal(s.items[2].kind, 'other');
  const vocal = p.departments[0].positions.find(x => x.name === 'Vocal');
  applyPlanOp(p, { op: 'saveVolunteer', volunteer: { name: 'Ana', phone: '0722', positions: [vocal.id], away: [s.date.slice(0, 10)] } });
  const ana = p.volunteers[0];
  assert.match(applyPlanOp(p, { op: 'assign', id: s.id, position: vocal.id, slot: 0, volunteer: ana.id }), /a blocat ziua/, 'a blocked day cannot be scheduled');
  applyPlanOp(p, { op: 'saveVolunteer', volunteer: { ...ana, away: [] } });
  applyPlanOp(p, { op: 'assign', id: s.id, position: vocal.id, slot: 0, volunteer: ana.id });
  applyPlanOp(p, { op: 'assign', id: s.id, position: vocal.id, slot: 1, volunteer: ana.id, status: 'confirmed' });
  applyPlanOp(p, { op: 'saveVolunteer', volunteer: { ...ana, away: [s.date.slice(0, 10)] } });   // blocked after being put: a warning
  const w = serviceWarnings(p, s);
  assert.ok(w.includes('Ana e pus de două ori'));
  assert.ok(w.includes('Ana a spus că lipsește în ziua asta'));
  assert.ok(w.some(x => /poziții neocupate/.test(x)));
  applyPlanOp(p, { op: 'copyItems', id: p.services[1].id, from: s.id });
  assert.equal(p.services[1].items.length, 3); assert.notEqual(p.services[1].items[0].id, s.items[0].id);
  applyPlanOp(p, { op: 'deleteVolunteer', id: ana.id });
  assert.equal(Object.keys(s.assignments).length, 0, 'removing a volunteer clears their slots');
  assert.equal(applyPlanOp(p, { op: 'nope' }), 'Operație necunoscută');
});

test('✕ / ＋ posts per service: the standard stays, one service needs only some posts; optional posts are added when needed', () => {
  const plan = defaultPlan();
  applyPlanOp(plan, { op: 'addService', date: '2030-01-06T08:00:00Z', title: 'Seară de închinare' });
  const s = plan.services[0], wor = plan.departments.find(d => d.name === 'Închinare');
  const tobe = wor.positions.find(p => p.name === 'Tobe'), ch2 = wor.positions.find(p => p.name === 'Chitară 2');
  assert.equal(needFor(s, ch2), 0); assert.equal(needFor(s, tobe), 1);
  const before = placesOf(plan, s).length;
  assert.equal(applyPlanOp(plan, { op: 'assign', id: s.id, position: tobe.id, slot: 0, volunteer: null }), null);
  applyPlanOp(plan, { op: 'setNeed', id: s.id, position: tobe.id, needed: 0 });
  applyPlanOp(plan, { op: 'setNeed', id: s.id, position: ch2.id, needed: 1 });
  assert.equal(placesOf(plan, s).length, before);
  assert.ok(!placesOf(plan, s).some(x => x.p.id === tobe.id)); assert.ok(placesOf(plan, s).some(x => x.p.id === ch2.id));
  applyPlanOp(plan, { op: 'setNeed', id: s.id, department: wor.id, name: 'Saxofon', needed: 1 });
  assert.ok(wor.positions.find(p => p.name === 'Saxofon').optional);
  applyPlanOp(plan, { op: 'addService', date: '2030-01-13T08:00:00Z', title: 'Duminică' });
  assert.equal(needFor(plan.services[1], tobe), 1);                       // the other services keep the standard
  applyPlanOp(plan, { op: 'setNeed', id: s.id, position: tobe.id, needed: 1 });
  assert.equal(s.need[tobe.id], undefined);                                 // back to the standard: nothing stored
  assert.equal(urgency('2030-01-06T08:00:00Z', new Date('2030-01-02T12:00:00Z')), 0);
  assert.equal(urgency('2030-01-06T08:00:00Z', new Date('2030-01-03T12:00:00Z')), 1);
  assert.equal(urgency('2030-01-06T08:00:00Z', new Date('2030-01-04T12:00:00Z')), 2);
  assert.equal(urgency('2030-01-06T08:00:00Z', new Date('2030-01-05T12:00:00Z')), 3);
  assert.equal(timeLevel(100, 600), 0); assert.equal(timeLevel(460, 600), 1); assert.equal(timeLevel(550, 600), 2); assert.equal(timeLevel(610, 600), 3);
});
