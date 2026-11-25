import test from 'node:test';
import assert from 'node:assert/strict';
import { merge3, adoptPeople, mergePlan, alignDepartments, shared, createReverbSync } from '../src/reverb-sync.js';
import { defaultPlan, applyPlanOp, newToken } from '../src/plan.js';

const svc = (id, title, extra = {}) => ({ id, date: '2026-12-06T08:00:00.000Z', title, status: 'draft', items: [], assignments: {}, ...extra });

test('three-way merge keeps a change from each side', () => {
  const base = [svc('a', 'A'), svc('b', 'B'), svc('c', 'C')];
  const local = [svc('a', 'A aici'), svc('b', 'B'), /* c deleted here */ svc('d', 'nou aici')];
  const cloud = [svc('a', 'A'), svc('b', 'B pe telefon'), svc('c', 'C'), svc('e', 'nou pe telefon')];
  const m = Object.fromEntries(merge3(local, base, cloud).map(x => [x.id, x.title]));
  assert.deepEqual(m, { a: 'A aici', b: 'B pe telefon', d: 'nou aici', e: 'nou pe telefon' });
});

test('both sides changed the same service: the cloud wins, except the program on the screens', () => {
  const base = [svc('a', 'A'), svc('live', 'L')];
  const m = merge3([svc('a', 'A1'), svc('live', 'L aici')], base, [svc('a', 'A2'), svc('live', 'L online')], id => (id === 'live' ? 'local' : 'cloud'));
  assert.deepEqual(m.map(x => x.title), ['A2', 'L aici']);
});

test('people with a link take over the local volunteer with the same name (and his places); phones never travel', () => {
  const plan = defaultPlan();
  applyPlanOp(plan, { op: 'saveVolunteer', volunteer: { name: 'Ioana Popescu', phone: '0712 000 000', positions: [] } });
  applyPlanOp(plan, { op: 'addService', date: '2026-12-06T08:00:00Z', title: 'Duminică' });
  const old = plan.volunteers[0].id, pos = plan.departments[0].positions[0].id;
  applyPlanOp(plan, { op: 'assign', id: plan.services[0].id, position: pos, slot: 0, volunteer: old });
  const changed = adoptPeople(plan, [{ id: 'p-ioana', name: 'Ioana  Popescu', departments: [] }, { id: 'p-dan', name: 'Dan', departments: ['Media'] }], newToken);
  assert.equal(changed, true);
  assert.equal(plan.volunteers.find(v => v.name === 'Ioana Popescu').id, 'p-ioana');
  assert.equal(plan.services[0].assignments[`${pos}#0`].volunteer, 'p-ioana');
  const dan = plan.volunteers.find(v => v.id === 'p-dan');
  assert.ok(dan.token && dan.positions.length === plan.departments.find(d => d.name === 'Media').positions.length);
  const sh = JSON.stringify(shared(plan));
  // (not a plain "0712" search: a random id can contain those digits)
  assert.ok(!sh.includes('0712 000 000') && !sh.includes('"token"') && !sh.includes('"phone"'));
});

test('a merge from the cloud keeps the local phones and links', () => {
  const plan = defaultPlan();
  applyPlanOp(plan, { op: 'saveVolunteer', volunteer: { id: 'p1', name: 'Ana', phone: '0700', positions: [] } });
  const tok = plan.volunteers[0].token, base = shared(plan);
  const cloud = structuredClone(base); cloud.volunteers[0].away = ['2026-12-25'];
  mergePlan(plan, base, cloud, { liveId: null, newToken });
  assert.deepEqual(plan.volunteers[0].away, ['2026-12-25']);
  assert.equal(plan.volunteers[0].phone, '0700'); assert.equal(plan.volunteers[0].token, tok);
});

test('first link: a department made online with the same name is the same department', () => {
  const plan = defaultPlan(), local = plan.departments.find(d => d.name === 'Media');
  const cloud = { departments: [{ id: 'cd', name: 'Media', color: '#000000', positions: [{ id: 'cp', name: 'Sunet', needed: 1 }] }],
    services: [svc('s', 'Online', { assignments: { 'cp#0': { volunteer: 'p', status: 'pending' } } })], volunteers: [{ id: 'p', name: 'P', positions: ['cp'] }] };
  alignDepartments(plan, cloud);
  const sunet = local.positions.find(p => p.name === 'Sunet').id;
  assert.equal(cloud.departments.length, 0);
  assert.ok(cloud.services[0].assignments[`${sunet}#0`]);
  assert.deepEqual(cloud.volunteers[0].positions, [sunet]);
});

test('the runner: first link sends the local program up, then brings back what was planned on a phone', async () => {
  const files = {}, fsx = { readFileSync: f => { if (!(f in files)) throw new Error('none'); return files[f]; }, writeFileSync: (f, d) => { files[f] = d; } };
  let cloud = null, version = 0; const calls = [];
  const fetchImpl = async (url, o) => {
    const m = JSON.parse(o.body); calls.push(m.action);
    const res = (status, body) => ({ status, ok: status < 300, json: async () => body });
    if (m.key !== 'K'.repeat(30)) return res(403, { error: 'cheie' });
    if (m.action === 'hello') return res(200, { ok: true });
    if (m.action === 'pull') return res(200, { church: { id: 'c', name: 'Betleem' }, doc: cloud, version, people: [] });
    if (m.action === 'push') { if (m.version !== version) return res(409, { conflict: true }); cloud = m.doc; version++; return res(200, { version }); }
  };
  const plan = defaultPlan(); applyPlanOp(plan, { op: 'addService', date: '2026-12-06T08:00:00Z', title: 'Duminică aici' });
  let applied = 0;
  const r = createReverbSync({ file: '/x', fs: fsx, getPlan: () => plan, liveId: () => null, applied: ch => { if (ch) applied++; }, newToken,
    hubUrl: () => 'http://192.168.1.5:4545', fetchImpl, every: 1e9 });
  const st = await r.link('K'.repeat(30), 'local');
  assert.equal(st.state, 'linked'); assert.equal(st.church.name, 'Betleem');
  assert.equal(cloud.services[0].title, 'Duminică aici');
  assert.ok(!files['/x'].includes('"phone"'), 'the private file keeps the key and the shared copy only');
  cloud = structuredClone(cloud); cloud.services.push(svc('web', 'Planificat pe telefon')); version++;
  await r.syncNow();
  assert.ok(plan.services.some(s => s.title === 'Planificat pe telefon'));
  assert.ok(calls.includes('hello'));
  r.unlink(); clearInterval();
});

test('songs: a chord fixed on a phone comes into the library; a song written here goes up', async () => {
  const files = {}, fsx = { readFileSync: f => { if (!(f in files)) throw new Error('none'); return files[f]; }, writeFileSync: (f, d) => { files[f] = d; } };
  const cloudSongs = [{ local_id: 's1', title: 'Cântare', key: 'G', body: '[G]Slavă [D]Ție', updated_at: '2026-11-24T10:00:00.000Z' }];
  const pushed = [];
  const fetchImpl = async (url, o) => {
    const m = JSON.parse(o.body), res = b => ({ status: 200, ok: true, json: async () => b });
    if (m.action === 'pull') return res({ church: { id: 'c', name: 'B' }, doc: { services: [], departments: [], volunteers: [] }, version: 1, people: [] });
    if (m.action === 'push') return res({ version: 2 });
    if (m.action === 'songsPull') return res({ songs: cloudSongs.filter(x => !m.since || x.updated_at > m.since) });
    if (m.action === 'songsPush') { pushed.push(...m.songs); return res({ saved: m.songs.length }); }
    return res({ ok: true });
  };
  const lib = [{ id: 's1', title: 'Cântare', key: 'G', body: '[G]Slavă [C]Ție', updatedAt: '2026-11-20T10:00:00.000Z' },
    { id: 's2', title: 'Nouă aici', body: 'text', updatedAt: '2026-11-24T09:00:00.000Z' }];
  let saved = 0;
  const songs = { list: () => lib, saved: () => saved++, apply: c => { const s = lib.find(x => x.id === c.local_id);
    if (s && Date.parse(c.updated_at) > Date.parse(s.updatedAt)) { s.body = c.body; s.updatedAt = c.updated_at; return true; } return false; } };
  const plan = defaultPlan();
  const r = createReverbSync({ file: '/y', fs: fsx, getPlan: () => plan, liveId: () => null, applied: () => {}, newToken, hubUrl: () => '', songs, fetchImpl, every: 1e9 });
  await r.link('K'.repeat(30), 'local');
  assert.equal(lib[0].body, '[G]Slavă [D]Ție');
  assert.ok(pushed.some(x => x.local_id === 's2'));
  assert.equal(saved, 1);
  pushed.length = 0; await r.syncNow();
  assert.ok(!pushed.length, 'nothing new: nothing sent again');
  r.unlink();
});
