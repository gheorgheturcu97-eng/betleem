import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPlan, applyPlanOp, serviceWarnings, nextSundays } from '../src/plan.js';

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
