import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pcoGet, fetchSongs, fetchPlans, serviceTypes, cleanChordChart, itemKind } from '../src/pco.js';

// A tiny fake of the Planning Center API (shapes from the JSON:API responses of Services v2)
function fakeFetch(routes, seen = []) {
  return async (url, opt) => {
    seen.push({ url, auth: opt.headers.authorization });
    const path = url.replace('https://api.planningcenteronline.com/services/v2', '').replace(/[?&]per_page=100/, '');
    const body = routes[path];
    if (body === 401) return { ok: false, status: 401, headers: new Map(), json: async () => ({}) };
    if (!body) return { ok: false, status: 404, headers: new Map(), json: async () => ({}) };
    return { ok: true, status: 200, headers: new Map(), json: async () => body };
  };
}
const creds = { appId: 'app', secret: 'sec' };

test('pcoGet uses Basic auth and follows pages', async () => {
  const seen = [];
  const f = fakeFetch({
    '/service_types': { data: [{ id: '1', attributes: { name: 'Duminică' } }], links: { next: 'https://api.planningcenteronline.com/services/v2/service_types?offset=1' } },
    '/service_types?offset=1': { data: [{ id: '2', attributes: { name: 'Tineret' } }], links: {} },
  }, seen);
  assert.deepEqual(await serviceTypes(creds, { fetchImpl: f }), [{ id: '1', name: 'Duminică' }, { id: '2', name: 'Tineret' }]);
  assert.equal(seen[0].auth, 'Basic ' + Buffer.from('app:sec').toString('base64'));
  await assert.rejects(pcoGet({}, '/x', { fetchImpl: f }), /Client ID/);
  await assert.rejects(pcoGet(creds, '/bad', { fetchImpl: fakeFetch({ '/bad': 401 }) }), /nu acceptă cheia/);
});

test('songs come with their chord chart, key and order; plans with their items', async () => {
  const f = fakeFetch({
    '/songs?where[hidden]=false&order=title': { data: [{ id: 's1', attributes: { title: 'Mare e Domnul ', author: 'X', ccli_number: 123 } }] },
    '/songs/s1/arrangements': { data: [
      { id: 'a0', attributes: { name: 'Fără', lyrics: 'doar versuri' } },
      { id: 'a1', attributes: { name: 'Default', chord_chart: 'VERSE 1\n[G]Mare e [D]Domnul\nCOLUMN_BREAK\nCHORUS\n[C]Aleluia', chord_chart_key: 'G', sequence: ['Verse 1', 'Chorus', 'Chorus'] } }] },
    '/service_types/1/plans?filter=future&order=sort_date': { data: [{ id: 'p1', attributes: { title: 'Crăciun', sort_date: '2026-12-25T10:00:00Z' } }] },
    '/service_types/1/plans/p1/items?include=song,arrangement': { data: [
      { id: 'i0', attributes: { item_type: 'header', title: 'Închinare' } },
      { id: 'i1', attributes: { item_type: 'song', title: 'Mare e Domnul', key_name: 'A', length: 300 }, relationships: { song: { data: { id: 's1' } } } },
      { id: 'i2', attributes: { item_type: 'item', title: 'Predică', length: 2100 } }] },
  });
  const [s] = await fetchSongs(creds, { fetchImpl: f });
  assert.equal(s.title, 'Mare e Domnul'); assert.equal(s.key, 'G'); assert.equal(s.arrangementId, 'a1');
  assert.equal(s.body, 'VERSE 1\n[G]Mare e [D]Domnul\nCHORUS\n[C]Aleluia');
  assert.deepEqual(s.sequence, ['Verse 1', 'Chorus', 'Chorus']);
  const [p] = await fetchPlans(creds, ['1'], { fetchImpl: f });
  assert.equal(p.title, 'Crăciun');
  assert.deepEqual(p.items.map(i => [i.type, i.songId, i.key, i.seconds]), [['song', 's1', 'A', 300], ['item', '', '', 2100]]);
});

test('helpers', () => {
  assert.equal(cleanChordChart('A\r\nPAGE_BREAK\n\n\n\nB'), 'A\n\nB');
  assert.equal(itemKind('Predica - Pastor Ion'), 'sermon');
  assert.equal(itemKind('Rugăciune'), 'prayer');
  assert.equal(itemKind('Anunțuri'), 'announcement');
});

test('plans to choose from (upcoming and recent), and importing only the chosen one', async () => {
  const { listPlans } = await import('../src/pco.js');
  const f = fakeFetch({
    '/service_types/1/plans?filter=future&order=sort_date': { data: [{ id: 'p2', attributes: { title: 'Crăciun', sort_date: '2026-12-25T10:00:00Z', dates: 'December 25, 2026', items_count: 7 } }] },
    '/service_types/1/plans?filter=past&order=-sort_date&per_page=4': { data: [{ id: 'p1', attributes: { series_title: 'Advent', sort_date: '2026-11-15T10:00:00Z' } }] },
    '/service_types/1/plans/p2': { data: { id: 'p2', attributes: { title: 'Crăciun', sort_date: '2026-12-25T10:00:00Z' } } },
    '/service_types/1/plans/p2/items?include=song,arrangement': { data: [{ id: 'i1', attributes: { item_type: 'item', title: 'Predică', length: 1800 } }] },
  });
  const list = await listPlans(creds, '1', { fetchImpl: f });
  assert.deepEqual(list.map(p => [p.id, p.when, p.title || p.dates]), [['p2', 'future', 'Crăciun'], ['p1', 'past', 'Advent']]);
  const [p] = await fetchPlans(creds, [], { only: [{ typeId: '1', id: 'p2' }], fetchImpl: f });
  assert.equal(p.title, 'Crăciun'); assert.equal(p.items[0].seconds, 1800);
});
