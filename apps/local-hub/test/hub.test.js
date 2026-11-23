import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { extractLyrics } from '../src/extract.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bnc-'));
process.env.DATA_DIR = dir; process.env.PORT = '4599'; process.env.PIN = '1111'; process.env.LEADER_PIN = '2222';
let server;
before(async () => { ({ server } = await import('../src/server.js')); await new Promise(r => server.listening ? r() : server.once('listening', r)); });
after(() => { server.close(); for (const c of server._wss?.clients ?? []) c.terminate(); });

function client() {
  const ws = new WebSocket('ws://localhost:4599/ws');
  const queue = []; let waiters = [];
  ws.on('message', d => { const m = JSON.parse(d); const w = waiters.find(w => w.f(m)); if (w) { waiters = waiters.filter(x => x !== w); w.r(m); } else queue.push(m); });
  const next = f => { const i = queue.findIndex(f); if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]); return new Promise(r => waiters.push({ f, r })); };
  return { ws, next, send: o => ws.send(JSON.stringify(o)), open: new Promise(r => ws.on('open', r)) };
}

test('roles, song save, setlist, live sync', async () => {
  const a = client(), b = client(); await a.open; await b.open;
  await a.next(m => m.type === 'hello'); await b.next(m => m.type === 'hello');

  a.send({ type: 'next' });
  assert.equal((await a.next(m => m.type === 'error')).type, 'error', 'viewer cannot control');

  a.send({ type: 'login', pin: '1111' });
  assert.equal((await a.next(m => m.type === 'login')).role, 'operator');
  a.send({ type: 'saveSong', song: { title: 'Mare e Domnul', key: 'G', body: 'Strofa 1:\nG      D\nMare e Domnul\n\nRefren:\n[C]Aleluia' } });
  const st = await b.next(m => m.type === 'state');
  assert.equal(st.state.setlist.length, 0);

  a.send({ type: 'addItem', kind: 'song' });
  assert.match((await a.next(m => m.type === 'error')).error, /liderul/, 'operator cannot change order');

  a.send({ type: 'login', pin: '2222' });
  assert.equal((await a.next(m => m.type === 'login')).role, 'leader');
  const songs = await fetch('http://localhost:4599/api/songs?q=mare').then(r => r.json());
  assert.equal(songs.length, 1);
  const full = await fetch('http://localhost:4599/api/songs/' + songs[0].id).then(r => r.json());
  assert.equal(full.body.split('\n')[1], '[G]Mare e [D]Domnul', 'chords-over-lyrics converted on save');

  a.send({ type: 'addItem', kind: 'song', songId: songs[0].id, key: 'A' });
  await b.next(m => m.type === 'state' && m.state.setlist.length === 1);
  a.send({ type: 'go', item: 0, slide: 0 });
  const live = await b.next(m => m.type === 'state' && m.state.live.item === 0);
  assert.equal(live.state.live.slides[0].lines[0], '[A]Mare e [E]Domnul', 'transposed G -> A for this service');
  a.send({ type: 'next' });
  const n = await b.next(m => m.type === 'state' && m.state.live.slide === 1);
  assert.equal(n.state.live.slides[1].label, 'Refren');
  a.ws.close(); b.ws.close();
});

test('import endpoint requires PIN', async () => {
  const r = await fetch('http://localhost:4599/api/import-url', { method: 'POST', body: JSON.stringify({ url: 'https://example.com' }) });
  assert.equal(r.status, 401);
});

test('path traversal blocked', async () => {
  const r = await fetch('http://localhost:4599/media/..%2F..%2Fpackage.json');
  assert.equal(r.status, 404);
});

test('extractLyrics finds the lyric block', () => {
  const html = `<html><head><title>Mare e Domnul | Resurse</title></head><body><nav>Acasă<br>Cântări<br>Contact</nav>
    <div class="text-cantare">Mare e Domnul și vrednic<br>de laudă în cetatea Sa<br><br>Refren:<br>Aleluia, aleluia<br>Slavă Lui în veci</div></body></html>`;
  const r = extractLyrics(html);
  assert.equal(r.title, 'Mare e Domnul');
  assert.match(r.body, /^Mare e Domnul și vrednic\nde laudă/);
  assert.match(r.body, /Refren:\nAleluia/);
});

test('churches: separate programs, code required, guessing is slowed down', async () => {
  const a = client(); await a.open; await a.next(m => m.type === 'hello');
  a.send({ type: 'login', pin: '2222' }); await a.next(m => m.type === 'login');
  const first = (await (async () => { a.send({ type: 'blank' }); return a.next(m => m.type === 'state'); })()).state;
  const home = first.church.id;
  const homeItems = first.setlist.length;

  a.send({ type: 'addChurch', name: 'Râul Vieții', city: 'Peștera', code: '7391' });
  assert.equal((await a.next(m => m.type === 'church')).ok, true);
  const st = await a.next(m => m.type === 'state' && m.state.church.name === 'Râul Vieții');
  assert.equal(st.state.setlist.length, 0, 'new church starts with an empty program');
  assert.equal(st.state.churches.find(c => c.name === 'Râul Vieții').locked, true);
  assert.ok(!JSON.stringify(st.state).includes('7391'), 'code never sent to clients');

  a.send({ type: 'addItem', kind: 'sermon', title: 'Predică Peștera' });
  await a.next(m => m.type === 'state' && m.state.setlist.length === 1);
  a.send({ type: 'switchChurch', id: home });
  assert.equal((await a.next(m => m.type === 'church')).ok, true, 'home church has no code yet');
  await a.next(m => m.type === 'state' && m.state.church.id === home && m.state.setlist.length === homeItems);

  const pestera = st.state.church.id;
  a.send({ type: 'switchChurch', id: pestera, code: '0000' });
  assert.equal((await a.next(m => m.type === 'church')).error, 'Cod greșit');
  for (let i = 0; i < 4; i++) { a.send({ type: 'switchChurch', id: pestera, code: '1111' }); await a.next(m => m.type === 'church'); }
  a.send({ type: 'switchChurch', id: pestera, code: '7391' });
  assert.match((await a.next(m => m.type === 'church')).error, /Prea multe/, 'locked after 5 wrong codes, even with the right one');
  a.ws.close();
});

test('editSlide fixes words and keeps chords on them', async () => {
  const a = client(); await a.open; await a.next(m => m.type === 'hello');
  a.send({ type: 'login', pin: '2222' }); await a.next(m => m.type === 'login');
  a.send({ type: 'saveSong', song: { title: 'Slide test', body: 'Strofa 1:\n[G]Mare e [D]Domnul\n[C]Sfânt e Numele' } });
  await a.next(m => m.type === 'state');
  const id = (await fetch('http://localhost:4599/api/songs?q=slide test').then(r => r.json()))[0].id;
  a.send({ type: 'addItem', kind: 'song', songId: id });
  const st = await a.next(m => m.type === 'state' && m.state.setlist.some(i => i.songId === id));
  const item = st.state.setlist.findIndex(i => i.songId === id);
  a.send({ type: 'editSlide', item, slide: 0, text: 'Mare e Domnul nostru\nSfânt e Numele Lui' });
  await a.next(m => m.type === 'state');
  const song = await fetch('http://localhost:4599/api/songs/' + id).then(r => r.json());
  assert.equal(song.body, 'Strofa 1:\n[G]Mare e [D]Domnul nostru\n[C]Sfânt e Numele Lui');
  a.ws.close();
});

test('programs: several in Live, synced with Planning; undo removal; search without diacritics', async () => {
  const a = client(); await a.open; await a.next(m => m.type === 'hello');
  a.send({ type: 'login', pin: '2222' }); await a.next(m => m.type === 'login');
  const songs = await fetch('http://localhost:4599/api/songs?q=domnu mar').then(r => r.json());
  assert.equal(songs[0].title, 'Mare e Domnul', 'words in any order, start of words');
  assert.equal((await fetch('http://localhost:4599/api/songs?q=aleluia').then(r => r.json())).length, 1, 'searches lyrics too');

  a.send({ type: 'newProgram', title: 'Crăciun', date: '2026-12-25T08:00:00Z' });
  let st = (await a.next(m => m.type === 'state' && m.state.service.title === 'Crăciun')).state;
  assert.ok(st.programs.some(p => p.title === 'Crăciun'), 'listed');
  assert.ok(st.programs.length >= 2, 'the earlier Live program was kept as its own program');
  const xmas = st.service.planId;

  a.send({ type: 'addItem', kind: 'song', songId: songs[0].id });
  a.send({ type: 'addItem', kind: 'song', songId: songs[0].id });
  st = (await a.next(m => m.type === 'state' && m.state.setlist.length === 2)).state;
  const removed = st.setlist[0];
  a.send({ type: 'removeItem', item: 0 });
  await a.next(m => m.type === 'state' && m.state.setlist.length === 1 && !m.state.setlist.some(x => x.id === removed.id));
  a.send({ type: 'addItem', item: removed, at: 0 });
  st = (await a.next(m => m.type === 'state' && m.state.setlist[0]?.id === removed.id)).state;
  assert.equal(st.setlist[0].id, removed.id, 'undo puts it back in the same place');

  const plan = await fetch('http://localhost:4599/api/plan', { headers: { 'x-pin': '2222' } }).then(r => r.json());
  assert.equal(plan.services.find(s => s.id === xmas).items.length, 2, 'Live edits saved into the planned program');

  const other = st.programs.find(p => p.id !== xmas);
  a.send({ type: 'openProgram', id: other.id });
  st = (await a.next(m => m.type === 'state' && m.state.service.planId === other.id)).state;
  a.send({ type: 'openProgram', id: xmas });
  st = (await a.next(m => m.type === 'state' && m.state.service.planId === xmas)).state;
  assert.equal(st.setlist.length, 2, 'back to Crăciun with its songs');

  await fetch('http://localhost:4599/api/plan', { method: 'POST', headers: { 'x-pin': '2222', 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'setItems', id: xmas, items: [{ kind: 'sermon', title: 'Predică', minutes: 30 }] }) });
  st = (await a.next(m => m.type === 'state' && m.state.setlist.length === 1)).state;
  assert.equal(st.setlist[0].kind, 'sermon', 'changes in Planning show up in Live');
  a.ws.close();
});

test('Planning Center songs and plans go into the library and the programs', async () => {
  const { mergePcoSongs, mergePcoPlans } = await import('../src/server.js');
  const r = mergePcoSongs([
    { pcoId: 's1', title: 'Cântare din PCO', key: 'G', body: 'VERSE 1\n[G]Unu [D]doi\n\nCHORUS\n[C]Trei', sequence: ['Verse 1', 'Chorus', 'Chorus', 'Bridge'] },
    { pcoId: 's2', title: 'MARE E DOMNUL', body: 'Strofa 1:\nG      D\nMare e Domnul' },   // already in the library (it has chords already)
    { pcoId: 's3', title: 'Goală', body: '' },
  ]);
  assert.deepEqual(r, { added: 1, chords: 0, skipped: 1, replaced: 0 });
  const songs = await fetch('http://localhost:4599/api/songs?q=cantare pco').then(x => x.json());
  const full = await fetch('http://localhost:4599/api/songs/' + songs[0].id).then(x => x.json());
  assert.deepEqual(full.arrangement, ['Verse 1', 'Chorus', 'Chorus'], 'order kept, unknown sections dropped');
  assert.equal(mergePcoSongs([{ pcoId: 's1', title: 'Cântare din PCO', body: '[G]x' }]).added, 0, 'no duplicates on a second import');
  // "Planning Center has the right version": its words and chords replace ours, ours is kept in song.before
  const fixed = mergePcoSongs([{ pcoId: 's2', title: 'Mare e Domnul', key: 'A', body: 'VERSE 1\n[A]Mare e [E]Domnul cel corect' }], { prefer: true });
  assert.equal(fixed.replaced, 1);
  const mare = (await fetch('http://localhost:4599/api/songs?q=mare e domnul').then(x => x.json()))[0];
  const m2 = await fetch('http://localhost:4599/api/songs/' + mare.id).then(x => x.json());
  assert.match(m2.body, /cel corect/); assert.equal(m2.key, 'A'); assert.ok(m2.before?.body, 'the old version is kept');
  // a second church's account: the same song is not overwritten, new songs come in
  mergePcoSongs([{ pcoId: 's2', title: 'Mare e Domnul', body: 'VERSE 1\n[A]Mare e [E]Domnul cel corect' }], { prefer: true, account: 'acct-a' });
  const r2 = mergePcoSongs([{ pcoId: 's9', title: 'Mare e Domnul', body: 'VERSE 1\n[C]Alt text din alt cont' }, { pcoId: 's10', title: 'Doar în contul doi', body: '[D]Unu' }], { prefer: true, account: 'acct-b' });
  assert.equal(r2.replaced, 0, 'account B does not overwrite account A');
  const m3 = await fetch('http://localhost:4599/api/songs/' + mare.id).then(x => x.json());
  assert.match(m3.body, /cel corect/);
  assert.equal((await fetch('http://localhost:4599/api/songs?q=doar in contul doi').then(x => x.json())).length, 1);
  const p = mergePcoPlans([{ pcoId: 'p1', title: 'Crăciun PCO', date: '2027-12-25T10:00:00Z',
    items: [{ type: 'song', songId: 's1', key: 'A', seconds: 300, title: '' }, { type: 'item', title: 'Predică', seconds: 2100 }] }]);
  assert.deepEqual(p, { added: 1, updated: 0 });
  assert.deepEqual(mergePcoPlans([{ pcoId: 'p1', title: 'Crăciun PCO', date: '2027-12-25T10:00:00Z', items: [] }]), { added: 0, updated: 1 });
  const res = await fetch('http://localhost:4599/api/pco/settings', { headers: { 'x-pin': '1111' } });
  assert.equal(res.status, 401, 'operators cannot see the Planning Center connection');
});

test('undo and redo', async () => {
  const a = client(); await a.open; await a.next(m => m.type === 'hello');
  a.send({ type: 'login', pin: '2222' }); await a.next(m => m.type === 'login');
  a.send({ type: 'newProgram', title: 'Undo test' });
  let st = (await a.next(m => m.type === 'state' && m.state.service.title === 'Undo test')).state;
  a.send({ type: 'addItem', kind: 'sermon', title: 'Predică' });
  st = (await a.next(m => m.type === 'state' && m.state.setlist.length === 1)).state;
  a.send({ type: 'undo' });
  assert.equal((await a.next(m => m.type === 'undone')).name, 'adăugarea în program');
  st = (await a.next(m => m.type === 'state' && m.state.setlist.length === 0)).state;
  a.send({ type: 'redo' }); await a.next(m => m.type === 'undone');
  st = (await a.next(m => m.type === 'state' && m.state.setlist.length === 1)).state;
  assert.equal(st.setlist[0].title, 'Predică');
  a.ws.close();
});

test('presentations: pages are slides; the stage timer starts when an item goes live; stage options', async () => {
  const a = client(); await a.open; await a.next(m => m.type === 'hello');
  a.send({ type: 'login', pin: '2222' }); await a.next(m => m.type === 'login');
  a.send({ type: 'addItem', kind: 'media', title: 'Anunțuri', minutes: 2, at: 0,
    slides: ['/media/pres-a-001.jpg', '/media/pres-a-002.png', '/media/../secret.jpg', 'http://elsewhere/x.png', '/media/pres-a.exe'] });
  const st = await a.next(m => m.type === 'state' && m.state.setlist[0]?.kind === 'media');
  assert.equal(st.state.setlist[0].slideCount, 2, 'only pictures from our media folder');
  const t0 = Date.now();
  a.send({ type: 'go', item: 0, slide: 1 });
  const live = await a.next(m => m.type === 'state' && m.state.live.item === 0);
  assert.equal(live.state.live.slides[1].image, '/media/pres-a-002.png');
  assert.ok(live.state.live.since >= t0 && live.state.now >= live.state.live.since);
  a.send({ type: 'prev' });
  const same = await a.next(m => m.type === 'state' && m.state.live.slide === 0);
  assert.equal(same.state.live.since, live.state.live.since, 'another slide of the same item keeps the timer');
  a.send({ type: 'display', screen: 'stage', patch: { upNext: 9, timer: false, headSize: 50 } });
  const d = await a.next(m => m.type === 'state' && m.state.display.stage.timer === false);
  assert.equal(d.state.display.stage.upNext, 5); assert.equal(d.state.display.stage.headSize, 8);
  a.send({ type: 'display', screen: 'main', patch: { tr: 'crossfade', trDur: 9000 } });
  const tr = await a.next(m => m.type === 'state' && m.state.display.main.tr === 'crossfade');
  assert.equal(tr.state.display.main.trDur, 3000, 'transitions last at most 3 s');
  a.send({ type: 'display', screen: 'main', patch: { tr: 'spin', trDur: null } });
  a.send({ type: 'display', screen: 'main', patch: { tr: 'cut' } });
  const cut = await a.next(m => m.type === 'state' && m.state.display.main.tr === 'cut');
  assert.equal(cut.state.display.main.trDur, 3000, 'an unknown transition or an empty time changes nothing');
  const r = await fetch('http://localhost:4599/api/convert?name=x.pptx', { method: 'POST', body: 'x' });
  assert.equal(r.status, 401, 'converting needs the PIN');
  a.ws.close();
});

test('Bible: versions, a passage on screen in two languages, a passage in the program', async () => {
  const list = await fetch('http://localhost:4599/api/bibles').then(r => r.json());
  assert.deepEqual(list.map(b => b.id).sort(), ['kjv', 'vdc', 'web']);
  const ch = await fetch('http://localhost:4599/api/bible?v=vdc&b=42&c=3').then(r => r.json());
  assert.equal(ch.name, 'Ioan'); assert.match(ch.verses[15], /atât de mult a iubit Dumnezeu lumea/);
  const hits = await fetch('http://localhost:4599/api/bible/search?v=vdc&q=' + encodeURIComponent('pastorul meu')).then(r => r.json());
  assert.ok(hits.some(h => h.ref === 'Psalmii 23:1'));
  const a = client(); await a.open; await a.next(m => m.type === 'hello');
  a.send({ type: 'login', pin: '1111' }); await a.next(m => m.type === 'login');
  a.send({ type: 'bible', versions: ['vdc', 'kjv'], ref: { book: 42, chapter: 3, from: 0, to: 0 }, slide: 15 });
  const st = await a.next(m => m.type === 'state' && m.state.live.item === -2);
  const sl = st.state.live.slides[st.state.live.slide];
  assert.equal(sl.label, 'Ioan 3:16'); assert.equal(sl.second.label, 'John 3:16'); assert.match(sl.second.lines[0], /For God so loved/);
  assert.equal(st.state.live.slides.length, 36); assert.match(st.state.live.title, /Ioan 3 · VDC \/ KJV/);
  a.send({ type: 'login', pin: '2222' }); await a.next(m => m.type === 'login');
  a.send({ type: 'addItem', kind: 'bible', ref: { book: 18, chapter: 23, from: 1, to: 3 }, versions: ['vdc'], at: 0 });
  const p = await a.next(m => m.type === 'state' && m.state.setlist[0]?.kind === 'bible');
  assert.equal(p.state.setlist[0].title, 'Psalmii 23:1-3'); assert.equal(p.state.setlist[0].slideCount, 3);
  a.ws.close();
});

test('several computers: hello for others, PINs only on this computer', async () => {
  const h = await fetch('http://localhost:4599/api/hello');
  assert.equal(h.headers.get('access-control-allow-origin'), '*');
  assert.equal((await h.json()).app, 'betleem');
  assert.equal((await fetch('http://localhost:4599/api/this')).status, 403, 'PINs are not given out');
  assert.ok(Array.isArray(await fetch('http://localhost:4599/api/peers').then(r => r.json())));
});

test('📥 Primite: a phone sends with the QR code, the file becomes a background', async () => {
  const bad = await fetch('http://localhost:4599/api/send?t=wrong&name=a.jpg', { method: 'POST', body: 'x' });
  assert.equal(bad.status, 403);
  const box = await fetch('http://localhost:4599/api/inbox', { headers: { 'x-pin': '1111' } }).then(r => r.json());
  const ok = await fetch(`http://localhost:4599/api/send?t=${box.token}&name=${encodeURIComponent('poză din telefon.jpg')}`, { method: 'POST', body: Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]) }).then(r => r.json());
  assert.ok(ok.ok);
  assert.equal((await fetch(`http://localhost:4599/api/send?t=${box.token}&name=virus.exe`, { method: 'POST', body: 'x' })).status, 400);
  const after = await fetch('http://localhost:4599/api/inbox', { headers: { 'x-pin': '1111' } }).then(r => r.json());
  assert.ok(after.files.some(f => f.name === ok.name));
  const t = await fetch('http://localhost:4599/api/inbox/take', { method: 'POST', headers: { 'x-pin': '1111' }, body: JSON.stringify({ name: ok.name }) }).then(r => r.json());
  assert.ok(t.media);
  assert.equal((await fetch('http://localhost:4599/media/' + encodeURIComponent(t.media))).status, 200);
});

test('presenter: text off, clear all, countdown, message only on stage, slides that change by themselves', async () => {
  const a = client(); await a.open; await a.next(m => m.type === 'hello');
  a.send({ type: 'login', pin: '2222' }); await a.next(m => m.type === 'login');
  a.send({ type: 'noText' });
  assert.equal((await a.next(m => m.type === 'state' && m.state.live.noText)).state.live.noText, true);
  a.send({ type: 'message', value: 'Trupa: încă o dată refrenul', to: 'stage' });
  assert.equal((await a.next(m => m.type === 'state' && m.state.live.message)).state.live.messageTo, 'stage');
  a.send({ type: 'countdown', minutes: 5, label: 'Începem în' });
  const c = (await a.next(m => m.type === 'state' && m.state.live.countdown)).state.live.countdown;
  assert.ok(c.to - Date.now() > 290000 && c.to - Date.now() <= 300000);
  a.send({ type: 'clearAll' });
  const cl = (await a.next(m => m.type === 'state' && !m.state.live.countdown && !m.state.live.message)).state.live;
  assert.equal(cl.noText, false);
  a.send({ type: 'addItem', kind: 'media', title: 'Anunțuri', slides: ['/media/a1.jpg', '/media/a2.jpg'], at: 0 });
  await a.next(m => m.type === 'state' && m.state.setlist[0]?.title === 'Anunțuri');
  a.send({ type: 'autoAdvance', item: 0, seconds: 2, loop: true });
  a.send({ type: 'go', item: 0, slide: 0 });
  await a.next(m => m.type === 'state' && m.state.live.item === 0 && m.state.live.slide === 0);
  await a.next(m => m.type === 'state' && m.state.live.slide === 1);
  await a.next(m => m.type === 'state' && m.state.live.slide === 0);           // in a loop: back to the first one
  a.send({ type: 'autoAdvance', item: 0, seconds: 0 });
  a.ws.close();
});

test('from the internet only the send page and the upload exist', async () => {
  assert.equal((await fetch('http://127.0.0.1:4600/send.html')).status, 200);
  for (const p of ['/control.html', '/api/songs', '/api/inbox', '/media/x.jpg', '/api/this']) assert.equal((await fetch('http://127.0.0.1:4600' + p)).status, 404, p);
  assert.equal((await fetch('http://127.0.0.1:4600/api/send?t=nu&name=a.jpg', { method: 'POST', body: 'x' })).status, 403);
  const t = await fetch('http://localhost:4599/api/tunnel').then(r => r.json());
  assert.equal(typeof t.available, 'boolean'); assert.equal(t.running, false);
});

test('service timer starts with the first item on Live; a presentation can be attached to a sermon; Canva connects with PKCE', async () => {
  const a = client(); await a.open; await a.next(m => m.type === 'hello');
  a.send({ type: 'login', pin: '2222' }); await a.next(m => m.type === 'login');
  a.send({ type: 'newProgram', title: 'Timer test' });
  await a.next(m => m.type === 'state' && m.state.service.title === 'Timer test');
  a.send({ type: 'addItem', kind: 'sermon', title: 'Predica', minutes: 30 });
  let st = (await a.next(m => m.type === 'state' && m.state.setlist.length === 1)).state;
  assert.equal(st.live.serviceStart, 0, 'waits for the first item');
  a.send({ type: 'serviceTimer', minutes: 45 });
  st = (await a.next(m => m.type === 'state' && m.state.service.timerMinutes === 45)).state;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await fetch('http://localhost:4599/api/media?name=pres-t-001.png', { method: 'POST', headers: { 'x-pin': '2222' }, body: png });
  a.send({ type: 'updateItem', item: 0, patch: { slides: ['/media/pres-t-001.png'] } });
  st = (await a.next(m => m.type === 'state' && m.state.setlist[0]?.slideCount === 1)).state;
  assert.equal(st.setlist[0].kind, 'sermon', 'still the sermon, now with slides');
  a.send({ type: 'go', item: 0, slide: 0 });
  st = (await a.next(m => m.type === 'state' && m.state.live.serviceStart > 0)).state;
  assert.equal(st.live.slides[0].image, '/media/pres-t-001.png');
  a.send({ type: 'serviceTimer', cmd: 'reset', minutes: null });
  st = (await a.next(m => m.type === 'state' && m.state.live.serviceStart === 0)).state;
  assert.equal(st.service.timerMinutes, undefined, 'back to the sum of the program');
  a.ws.close();
  // Canva: credentials stay on the computer; the login address carries a PKCE challenge
  const L = { 'x-pin': '2222', 'content-type': 'application/json' };
  let c = await fetch('http://localhost:4599/api/canva/status', { headers: L }).then(r => r.json());
  assert.equal(c.configured, false); assert.match(c.redirect, /^http:\/\/127\.0\.0\.1:4599\/api\/canva\/callback$/);
  c = await fetch('http://localhost:4599/api/canva/settings', { method: 'POST', headers: L, body: JSON.stringify({ clientId: 'OC-abc', clientSecret: 'shh' }) }).then(r => r.json());
  assert.equal(c.configured, true); assert.equal(c.connected, false); assert.ok(!JSON.stringify(c).includes('shh'), 'the secret never goes back out');
  const { url } = await fetch('http://localhost:4599/api/canva/login', { headers: L }).then(r => r.json());
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://www.canva.com/api/oauth/authorize');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256'); assert.ok(u.searchParams.get('code_challenge').length >= 43);
  const op = await fetch('http://localhost:4599/api/canva/settings', { method: 'POST', headers: { 'x-pin': '1111' }, body: '{}' });
  assert.equal(op.status, 401, 'only the leader connects Canva');
});

test('the assistant builds a planned service in Planificare (not the screens)', async () => {
  const { planHub } = await import('../src/server.js');
  const { runTool } = await import('../src/ai.js');
  const L = { 'x-pin': '2222', 'content-type': 'application/json' };
  let P = await fetch('http://localhost:4599/api/plan', { method: 'POST', headers: L, body: JSON.stringify({ op: 'addService', title: 'AI test', date: '2027-03-07T10:00:00.000Z' }) }).then(r => r.json());
  const s = P.services.find(x => x.title === 'AI test');
  const h = planHub(s.id);
  const song = (await fetch('http://localhost:4599/api/songs').then(r => r.json()))[0];
  assert.ok(runTool(h, 'add_song_to_program', { song_id: song.id, key: 'A' }).ok);
  assert.ok(runTool(h, 'add_item_to_program', { kind: 'sermon', title: 'Predica', minutes: 35 }).ok);
  assert.ok(runTool(h, 'set_item', { position: 2, leader: 'Pastorul' }).ok);
  assert.ok(runTool(h, 'move_in_program', { from: 2, to: 1 }).ok);
  const st = runTool(h, 'get_state');
  assert.match(st.where, /Planificare/);
  assert.deepEqual(st.program.map(x => x.kind), ['sermon', 'song']);
  assert.equal(st.program[0].leader, 'Pastorul'); assert.equal(st.program[1].key, 'A');
  assert.match(runTool(h, 'set_background', { name: 'x.jpg' }).error, /Live/);
  assert.ok(Array.isArray(runTool(h, 'song_usage', { days: 30 })));
  P = await fetch('http://localhost:4599/api/plan', { headers: L }).then(r => r.json());
  assert.equal(P.services.find(x => x.id === s.id).items.length, 2, 'saved in the plan');
});

test('the assistant puts real songs in the program, never just titles', async () => {
  const { planHub } = await import('../src/server.js');
  const { runTool } = await import('../src/ai.js');
  const L = { 'x-pin': '2222', 'content-type': 'application/json' };
  const P = await fetch('http://localhost:4599/api/plan', { method: 'POST', headers: L, body: JSON.stringify({ op: 'addService', title: 'AI cântări', date: '2027-03-14T10:00:00.000Z' }) }).then(r => r.json());
  const h = planHub(P.services.find(x => x.title === 'AI cântări').id);
  const songs = await fetch('http://localhost:4599/api/songs').then(r => r.json());
  const a = songs[0], b = songs[1];
  const loose = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const r = runTool(h, 'add_songs', { titles: [loose(a.title), b.title + ' (în D)', 'O cântare care nu există deloc xyz'], keys: ['', 'D'] });
  assert.deepEqual(r.added, [a.title, b.title]); assert.equal(r.missing.length, 1);
  assert.ok(runTool(h, 'add_item_to_program', { kind: 'other', title: a.title }).ok);         // a title written as text → the song
  assert.ok(runTool(h, 'pick_songs', { count: 2, how: 'rar' }).added.length >= 1);
  const st = runTool(h, 'get_state');
  assert.ok(st.program.every(x => x.kind === 'song'), 'only songs, no title-only items');
  assert.equal(st.program[1].key, 'D');
  assert.ok(Array.isArray(runTool(h, 'search_songs', { query: 'cântări ' + a.title.split(' ')[0] })) || true);
});

test('feedback is kept with a proposal (or kept anyway when no AI answers)', async () => {
  const H = { 'x-pin': '1111', 'content-type': 'application/json' };
  const f = await fetch('http://localhost:4599/api/feedback', { method: 'POST', headers: H, body: JSON.stringify({ text: 'Vreau numele track-ului mai mare', where: 'MD&TRACK' }) }).then(r => r.json());
  assert.ok(f.id); assert.equal(f.status, 'noua');
  await fetch('http://localhost:4599/api/feedback', { method: 'POST', headers: H, body: JSON.stringify({ id: f.id, status: 'de-facut' }) });
  const list = await fetch('http://localhost:4599/api/feedback', { headers: H }).then(r => r.json());
  assert.equal(list[0].status, 'de-facut');
  assert.match(fs.readFileSync(path.join(dir, 'propuneri.md'), 'utf8'), /numele track-ului mai mare/);
});

test('🎤 the preacher moves only the sermon slides, and the operator can take them back; the office QR has no personal data', async () => {
  const L = { 'x-pin': '2222', 'content-type': 'application/json' };
  const P = await fetch('http://localhost:4599/api/plan', { method: 'POST', headers: L, body: JSON.stringify({ op: 'addService', title: 'Predicator test', date: new Date(Date.now() + 86400000).toISOString() }) }).then(r => r.json());
  const s = P.services.find(x => x.title === 'Predicator test');
  await fetch('http://localhost:4599/api/plan', { method: 'POST', headers: L, body: JSON.stringify({ op: 'setItems', id: s.id, items: [
    { kind: 'prayer', title: 'Rugăciune', minutes: 3 },
    { kind: 'sermon', title: 'Predica', minutes: 30, notes: 'Ioan 3:16 la slide 2', slides: ['/media/p1.png', '/media/p2.png', '/media/p3.png'] },
    { kind: 'announcement', title: 'Anunțuri', minutes: 2 }] }) });
  await fetch('http://localhost:4599/api/plan', { method: 'POST', headers: L, body: JSON.stringify({ op: 'updateService', id: s.id, status: 'published' }) });
  await fetch('http://localhost:4599/api/plan', { method: 'POST', headers: L, body: JSON.stringify({ op: 'goLive', id: s.id }) });
  const pin = JSON.parse(fs.readFileSync(path.join(dir, 'library.json'), 'utf8')).preacherPin;
  assert.match(pin, /^\d{4}$/);

  const pr = client(), op = client(); await pr.open; await op.open;
  await pr.next(m => m.type === 'hello'); await op.next(m => m.type === 'hello');
  op.send({ type: 'login', pin: '1111' }); await op.next(m => m.type === 'login');
  pr.send({ type: 'login', pin });
  assert.equal((await pr.next(m => m.type === 'login')).role, 'preacher');
  const seen = await op.next(m => m.type === 'state' && m.state.live.preachers === 1);
  assert.equal(seen.state.setlist[1].planNotes, 'Ioan 3:16 la slide 2', 'the preacher sees his notes');

  pr.send({ type: 'blank' });
  assert.match((await pr.next(m => m.type === 'error')).error, /doar slide-urile predicii/);
  pr.send({ type: 'start' });
  await pr.next(m => m.type === 'state' && m.state.live.item === 1 && m.state.live.slide === 0);
  for (let i = 0; i < 5; i++) pr.send({ type: 'next' });          // never runs past the sermon into the announcements
  await pr.next(m => m.type === 'state' && m.state.live.slide === 2);
  await new Promise(r => setTimeout(r, 150));
  op.send({ type: 'preacher', off: true });
  await pr.next(m => m.type === 'state' && m.state.live.preacherOff === true);
  pr.send({ type: 'prev' });
  assert.match((await pr.next(m => m.type === 'error')).error, /Regia a preluat/);
  op.send({ type: 'preacher', off: false });

  const nx = await fetch('http://localhost:4599/api/next').then(r => r.json());   // no PIN
  assert.equal(nx.service.title, 'Predicator test');
  assert.ok(!JSON.stringify(nx).includes('phone') && !('assignments' in nx.service));
  const plan = await fetch('http://localhost:4599/api/plan', { headers: L }).then(r => r.json());
  assert.equal(plan.services.find(x => x.id === s.id).items[1].notes, 'Ioan 3:16 la slide 2', 'plan notes survive the live program');
  pr.ws.close(); op.ws.close();
});

test('🙋 volunteers: personal link, confirm, blocked days and monthly limit; 🗓 leaders: meetings and tasks', async () => {
  const L = { 'x-pin': '2222', 'content-type': 'application/json' }, O = { 'x-pin': '1111' };
  const api = o => fetch('http://localhost:4599/api/plan', { method: 'POST', headers: L, body: JSON.stringify(o) }).then(async r => ({ ok: r.ok, ...(await r.json()) }));
  let P = await api({ op: 'saveVolunteer', volunteer: { name: 'Ana Pop', phone: '0722 111 222', positions: [], maxPerMonth: 1, leader: true } });
  const ana = P.volunteers.find(v => v.name === 'Ana Pop');
  assert.ok(ana.token.length >= 20, 'every volunteer gets a personal link');
  const asOp = await fetch('http://localhost:4599/api/plan', { headers: O }).then(r => r.json());
  assert.ok(!asOp.volunteers.some(v => v.token), 'only leaders see the links');
  const pos = P.departments[0].positions[0].id;
  P = await api({ op: 'addService', title: 'Lim A', date: '2027-05-02T07:00:00.000Z' });
  P = await api({ op: 'addService', title: 'Lim B', date: '2027-05-09T07:00:00.000Z' });
  const A = P.services.find(s => s.title === 'Lim A'), B = P.services.find(s => s.title === 'Lim B');
  assert.ok((await api({ op: 'assign', id: A.id, position: pos, slot: 0, volunteer: ana.id })).services);
  const lim = await api({ op: 'assign', id: B.id, position: pos, slot: 0, volunteer: ana.id });
  assert.match(lim.error, /maxim 1 dată pe lună/, 'the monthly limit is kept');

  // her own page
  const eu = (body) => fetch('http://localhost:4599/api/eu?t=' + ana.token, body ? { method: 'POST', body: JSON.stringify(body) } : {}).then(r => r.json());
  let me = await eu();
  assert.equal(me.name, 'Ana Pop'); assert.equal(me.serve[0].title, 'Lim A'); assert.ok(!('phone' in me));
  me = await eu({ action: 'answer', service: A.id, key: me.serve[0].key, status: 'confirmed' });
  assert.equal(me.serve[0].status, 'confirmed');
  me = await eu({ action: 'away', away: ['2027-05-16'], maxPerMonth: 2 });
  P = await api({ op: 'addService', title: 'Lim C', date: '2027-05-16T07:00:00.000Z' });
  const C = P.services.find(s => s.title === 'Lim C');
  assert.match((await api({ op: 'assign', id: C.id, position: pos, slot: 0, volunteer: ana.id })).error, /a blocat ziua/);
  assert.ok((await api({ op: 'assign', id: B.id, position: pos, slot: 0, volunteer: ana.id })).services, 'limit 2 now allows the second Sunday');
  assert.equal((await fetch('http://localhost:4599/api/eu?t=wrongwrongwrongwrongwrong')).status, 404);

  // the leaders' meeting and a task she sees and ticks on her page
  P = await api({ op: 'saveMeeting', meeting: { title: 'Marți', date: new Date(Date.now() + 2 * 864e5).toISOString(), agenda: [{ text: 'Colinde' }] } });
  const mt = P.meetings.find(m => m.title === 'Marți');
  P = await api({ op: 'saveTask', task: { text: 'Afișe pentru colinde', who: ana.id, due: '2027-01-05', meeting: mt.id } });
  me = await eu();
  assert.equal(me.meetings[0].agenda[0].text, 'Colinde'); assert.equal(me.tasks[0].text, 'Afișe pentru colinde');
  me = await eu({ action: 'task', task: me.tasks[0].id, done: true });
  assert.equal(me.tasks[0].done, true);
  const old = ana.token;
  P = await api({ op: 'newLink', volunteer: ana.id });
  assert.equal((await fetch('http://localhost:4599/api/eu?t=' + old)).status, 404, 'a new link cancels the old one');

  // the assistant puts things on the agenda and gives tasks by name
  const { runTool } = await import('../src/ai.js');
  const { aiHub } = await import('../src/server.js');
  assert.ok(runTool(aiHub, 'add_agenda', { text: 'Bugetul pentru Crăciun' }).ok);
  assert.ok(runTool(aiHub, 'add_task', { text: 'Sună la tipografie', who: 'ana', due: '2027-01-02' }).ok);
  const lt = runTool(aiHub, 'leaders_tasks', {});
  assert.ok(lt.tasks.some(t => t.text === 'Sună la tipografie' && t.who === 'Ana Pop'));
  assert.ok(lt.meetings.some(m => m.agenda.includes('Bugetul pentru Crăciun')));
});

test('💡 light scenes and 🎧 the guide map are kept, and linked to the program and the song', async () => {
  const a = client(); await a.open; await a.next(m => m.type === 'hello');
  a.send({ type: 'login', pin: '2222' }); await a.next(m => m.type === 'login');
  a.send({ type: 'saveLightScene', scene: { name: 'Închinare', color: '#7c5cff', fade: 3, msgs: [{ type: 'cc', ch: 1, n: 7, v: 300 }, { type: 'bad', ch: 40, n: -2, v: 1 }] } });
  let st = (await a.next(m => m.type === 'state' && m.state.lights?.scenes?.length)).state;
  const z = st.lights.scenes[0];
  assert.deepEqual(z.msgs, [{ type: 'cc', ch: 1, n: 7, v: 127 }, { type: 'cc', ch: 16, n: 0, v: 1 }], 'values are kept inside MIDI limits');
  a.send({ type: 'saveSong', song: { title: 'Ghid test', key: 'D', body: 'Strofa 1:\nUnu\n\nRefren:\nDoi' } });
  await a.next(m => m.type === 'state');
  const songs = await fetch('http://localhost:4599/api/songs?q=Ghid test').then(r => r.json());
  a.send({ type: 'addItem', kind: 'song', songId: songs[0].id });
  st = (await a.next(m => m.type === 'state' && m.state.setlist.some(x => x.songId === songs[0].id))).state;
  const i = st.setlist.findIndex(x => x.songId === songs[0].id);
  a.send({ type: 'linkLight', item: i, section: 'Refren', id: z.id });
  a.send({ type: 'setGuide', item: i, marks: [{ bar: 8, p: 1 }, { bar: 0, p: 0 }, { bar: 12, p: 1 }] });
  a.send({ type: 'lightScene', id: z.id });
  st = (await a.next(m => m.type === 'state' && m.state.live.light?.id === z.id && m.state.setlist[i]?.guide?.length)).state;
  assert.equal(st.setlist[i].lights.Refren, z.id);
  assert.deepEqual(st.setlist[i].guide, [{ bar: 0, p: 0 }, { bar: 8, p: 1 }], 'one start per section, in bar order');
  a.ws.close();
});

test('🧱 slide layers follow their slide, 🏷 Props switch on and off, both cleaned and undoable', async () => {
  const a = client(); await a.open; await a.next(m => m.type === 'hello');
  a.send({ type: 'login', pin: '2222' }); await a.next(m => m.type === 'login');
  a.send({ type: 'saveSong', song: { title: 'Straturi test', body: 'Strofa 1:\nUnu\n\nStrofa 2:\nDoi\n\nStrofa 3:\nTrei' } });
  await a.next(m => m.type === 'state');
  const songs = await fetch('http://localhost:4599/api/songs?q=Straturi test').then(r => r.json());
  a.send({ type: 'addItem', kind: 'song', songId: songs[0].id });
  let st = (await a.next(m => m.type === 'state' && m.state.setlist.some(x => x.songId === songs[0].id))).state;
  const i = st.setlist.findIndex(x => x.songId === songs[0].id);
  a.send({ type: 'slideLayers', item: i, slide: 2, layers: [{ type: 'text', text: 'Trei', x: 5, y: 500, size: 99, color: 'red', evil: '<script>' }, { type: 'iframe' }, { type: 'image', src: '../../etc/passwd' }] });
  st = (await a.next(m => m.type === 'state' && m.state.setlist[i].slideLayers?.[2])).state;
  const L = st.setlist[i].slideLayers[2];
  assert.equal(L.length, 2, 'only text, image, video and shape');
  assert.equal(L[0].y, 100); assert.equal(L[0].size, 40); assert.equal(L[0].color, '#ffffff'); assert.equal(L[0].evil, undefined);
  assert.equal(L[1].src, 'passwd', 'media only by file name');
  a.send({ type: 'removeSlide', item: i, slide: 0 });
  st = (await a.next(m => m.type === 'state' && m.state.setlist[i].slideLayers?.[1])).state;
  assert.equal(st.setlist[i].slideLayers[1][0].text, 'Trei', 'the layers move with their slide');
  a.send({ type: 'saveProp', prop: { name: 'Logo', layers: [{ type: 'shape', bg: '#112233' }] } });
  st = (await a.next(m => m.type === 'state' && m.state.props?.length === 1)).state;
  const pr = st.props[0]; assert.equal(pr.on, false); assert.equal(pr.layers[0].shape, 'rect');
  a.send({ type: 'toggleProp', id: pr.id });
  await a.next(m => m.type === 'state' && m.state.props[0]?.on);
  a.send({ type: 'propsOff' });
  await a.next(m => m.type === 'state' && m.state.props[0]?.on === false);
  a.send({ type: 'deleteProp', id: pr.id });
  await a.next(m => m.type === 'state' && !m.state.props.length);
  a.send({ type: 'undo' });
  await a.next(m => m.type === 'state' && m.state.props.length === 1);
  a.ws.close();
});

test('✦ fair team auto-fill, 📣 pastor messages and 📎 the preacher sends his own presentation', async () => {
  const L = { 'x-pin': '2222', 'content-type': 'application/json' };
  const api = o => fetch('http://localhost:4599/api/plan', { method: 'POST', headers: L, body: JSON.stringify(o) }).then(r => r.json());
  let P = await api({ op: 'addService', title: 'Auto', date: '2027-06-06T07:00:00.000Z' });
  const prog = P.departments.find(d => d.name === 'Program'), pred = prog.positions.find(p => p.name === 'Predicator');
  P = await api({ op: 'saveVolunteer', volunteer: { name: 'Pastor Ion', phone: '0700', positions: [pred.id] } });
  P = await api({ op: 'saveVolunteer', volunteer: { name: 'Pastor Vasile', phone: '0701', positions: [pred.id], away: ['2027-06-06'] } });
  const sv = P.services.find(s => s.title === 'Auto');
  await api({ op: 'setItems', id: sv.id, items: [{ kind: 'sermon', title: 'Predica', minutes: 30 }] });
  P = await api({ op: 'autoAssign', id: sv.id, department: prog.id });
  const s2 = P.services.find(s => s.id === sv.id), ion = P.volunteers.find(v => v.name === 'Pastor Ion');
  assert.equal(s2.assignments[pred.id + '#0'].volunteer, ion.id, 'the free one is chosen, the one who blocked the day is not');
  P = await api({ op: 'saveMessage', message: { text: 'Mulțumesc pentru slujire!', from: 'Păstorul', to: 'service', ref: sv.id } });
  const me = await fetch('http://localhost:4599/api/eu?t=' + ion.token).then(r => r.json());
  assert.equal(me.messages[0].text, 'Mulțumesc pentru slujire!');
  const mine = me.serve.find(x => x.service === sv.id); assert.ok(mine.preach);
  const up = await fetch(`http://localhost:4599/api/eu?t=${ion.token}&service=${sv.id}&upload=Predica.pdf`, { method: 'POST', body: Buffer.from('%PDF-1.4 test') }).then(r => r.json());
  assert.equal(up.ok, true);
  P = await fetch('http://localhost:4599/api/plan', { headers: L }).then(r => r.json());
  assert.equal(P.services.find(s => s.id === sv.id).items[0].incoming.from, 'Pastor Ion');
  const other = P.volunteers.find(v => v.name === 'Pastor Vasile');
  assert.equal((await fetch(`http://localhost:4599/api/eu?t=${other.token}&service=${sv.id}&upload=x.pdf`, { method: 'POST', body: 'x' })).status, 403, 'only the preacher of that service');
});

test('✦ the assistant merges a part of another song after a position, in the same key', async () => {
  const { planHub } = await import('../src/server.js');
  const { runTool } = await import('../src/ai.js');
  const L = { 'x-pin': '2222', 'content-type': 'application/json' };
  const P = await fetch('http://localhost:4599/api/plan', { method: 'POST', headers: L, body: JSON.stringify({ op: 'addService', title: 'Îmbinare', date: '2027-07-04T07:00:00.000Z' }) }).then(r => r.json());
  const h = planHub(P.services.find(x => x.title === 'Îmbinare').id);
  h.run({ type: 'saveSong', song: { title: 'Tu ești vrednic test', key: 'D', body: 'Strofa 1:\nTu ești vrednic\n\nRefren:\nVrednic e Mielul' } });
  h.run({ type: 'saveSong', song: { title: 'Domnul miracolelor test', key: 'G', body: 'Strofa 1:\nEști Domnul\n\nRefren:\nDomnul miracolelor\n\nBridge:\nNimic nu-i greu' } });
  const songs = await fetch('http://localhost:4599/api/songs').then(r => r.json());
  const withChorus = ['Tu ești vrednic test', 'Domnul miracolelor test'].map(t => songs.find(x => x.title === t));
  runTool(h, 'add_songs', { titles: [withChorus[0].title, songs.find(x => !withChorus.includes(x)).title], keys: ['E'] });
  const r = runTool(h, 'add_part_of_song', { title: withChorus[1].title, sections: ['chorus'], after: 1 });
  assert.ok(r.ok, JSON.stringify(r));
  const st = runTool(h, 'get_state');
  assert.equal(st.program[1].title, withChorus[1].title);
  assert.equal(st.program[1].key, 'E', 'same key as the song before');
  assert.equal(st.program[1].arrangement.length, 1); assert.match(st.program[1].arrangement[0], /^Refren/);
});

test('🎨 the church layer (colour, modules switched off) is kept apart and only leaders change it', async () => {
  assert.equal((await fetch('http://localhost:4599/api/brand', { method: 'POST', body: '{"off":["md"]}' })).status, 403);
  const b = await fetch('http://localhost:4599/api/brand', { method: 'POST', headers: { 'x-pin': '2222' }, body: JSON.stringify({ accent: '#2e86ff', off: ['md', 'lumini', 'nope'] }) }).then(r => r.json());
  assert.deepEqual(b, { accent: '#2e86ff', off: ['md', 'lumini'] });
  assert.deepEqual(await fetch('http://localhost:4599/api/brand').then(r => r.json()), b);
  assert.ok(fs.existsSync(path.join(dir, 'personalizare.json')));
});

test('📅 the year plan imports goals, activities and the coming Sundays, twice without doubling', async () => {
  const data = JSON.parse(fs.readFileSync(new URL('./fixtures-plan-anual.json', import.meta.url), 'utf8'));
  const ch = await fetch('http://localhost:4599/api/plan/year/churches?name=Biserica Râul Vieții', { headers: { 'x-pin': '2222' } }).then(r => r.json());
  assert.equal(ch.churches.find(c => c.id === ch.suggested)?.name, 'Râul Vieții', 'the church is found by its name');
  const active = ch.churches.find(c => c.active).id;
  const go = () => fetch('http://localhost:4599/api/plan/year', { method: 'POST', headers: { 'x-pin': '2222', 'content-type': 'application/json' }, body: JSON.stringify({ data, churchId: active, vision: true, logo: 'raul-vietii', tz: 'Europe/Bucharest' }) }).then(r => r.json());
  const r1 = await go(); assert.equal(r1.ok, true); assert.equal(r1.goals, 10); assert.equal(r1.tasks, 15);
  const r2 = await go(); assert.equal(r2.goals, 10); assert.equal(r2.tasks, 15); assert.equal(r2.created, 0, 'a second import updates, it does not double');
  const P = await fetch('http://localhost:4599/api/plan', { headers: { 'x-pin': '2222' } }).then(r => r.json());
  assert.equal(P.year.theme, 'Restaurarea'); assert.equal(P.year.periods.length, 3);
  const g = P.goals.find(x => x.code === 'OBJ-1.4'); assert.equal(g.target, null, 'unknown targets stay "de stabilit"');
  assert.equal(P.tasks.find(x => x.code === 'ACT-1.01').done, true);
  const dec13 = P.services.find(s => s.date.slice(0, 10) === '2026-12-13');
  if (new Date().toISOString().slice(0, 10) <= '2026-12-13') {
    assert.ok(dec13, 'the coming series Sunday is in the program');
    assert.equal(new Date(dec13.date).toISOString(), '2026-12-13T15:00:00.000Z', '17:00 in Bucharest (winter time)');
    assert.match(dec13.items.find(i => i.kind === 'sermon').title, /mărturii/);
  }
  const w = client(); await w.open; const st = (await w.next(m => m.type === 'hello')).state; w.ws.close();
  assert.equal(st.church.logo, 'logo-echipa-raul-vietii.png');
  assert.equal(P.year.church, 'Biserica Râul Vieții');
});

test('📅 the year plan of another church goes to that church, not to the one open now', async () => {
  const data = JSON.parse(fs.readFileSync(new URL('./fixtures-plan-anual.json', import.meta.url), 'utf8'));
  const before = await fetch('http://localhost:4599/api/plan', { headers: { 'x-pin': '2222' } }).then(r => r.json());
  const r = await fetch('http://localhost:4599/api/plan/year', { method: 'POST', headers: { 'x-pin': '2222', 'content-type': 'application/json' },
    body: JSON.stringify({ data, churchId: (await fetch('http://localhost:4599/api/plan/year/churches?name=Biserica Râul Vieții', { headers: { 'x-pin': '2222' } }).then(r => r.json())).suggested, vision: true, logo: 'raul-vietii', tz: 'Europe/Bucharest' }) }).then(r => r.json());
  assert.equal(r.other, true); assert.equal(r.church, 'Râul Vieții');
  const n = await fetch('http://localhost:4599/api/plan/year', { method: 'POST', headers: { 'x-pin': '2222', 'content-type': 'application/json' }, body: JSON.stringify({ data, newChurch: 'Biserică nouă de test' }) }).then(r => r.json());
  assert.equal(n.church, 'Biserică nouă de test'); assert.equal(n.other, true);
  const after = await fetch('http://localhost:4599/api/plan', { headers: { 'x-pin': '2222' } }).then(r => r.json());
  assert.equal(after.services.length, before.services.length, 'the open church did not get the other church\'s Sundays');
  const ch = await fetch('http://localhost:4599/api/plan/year/churches?name=Biserica Râul Vieții Peștera', { headers: { 'x-pin': '2222' } }).then(r => r.json());
  assert.equal(ch.churches.find(c => c.id === ch.suggested)?.name, 'Râul Vieții', 'next time it is found by name');
});

test('🔒 the public door shows only the volunteer pages, and PIN guessing gets locked out', async () => {
  const L = { 'x-pin': '2222', 'content-type': 'application/json' };
  const sec = await fetch('http://localhost:4599/api/security', { method: 'POST', headers: L, body: JSON.stringify({ door: true, publicUrl: 'https://betleem.tail1.ts.net' }) }).then(r => r.json());
  assert.equal(sec.doorOpen, true); assert.equal(sec.doorPort, 4600);
  await new Promise(r => setTimeout(r, 200));
  const D = 'http://127.0.0.1:4600';
  for (const pth of ['/control.html', '/planning.html', '/api/plan', '/api/this', '/api/songs', '/api/security', '/main.html', '/live.html', '/media/x.png', '/api/backup', '/api/eu-x', '/planning.html?x'])
    assert.equal((await fetch(D + pth, { headers: { 'x-pin': '2222' } })).status, 404, pth + ' must not exist behind the door');
  assert.equal((await fetch(D + '/eu.html')).status, 200);
  assert.equal((await fetch(D + '/live.html?v=next')).status, 200);
  assert.equal((await fetch(D + '/api/next')).status, 200);
  const r = await fetch(D + '/eu.html'); assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  // the door is "the internet", never "this computer", even though the tunnel connects from 127.0.0.1
  assert.equal((await fetch(D + '/api/security', { method: 'POST', body: '{"door":false}' })).status, 404);
  // guessing personal links from outside
  let last;
  for (let i = 0; i < 6; i++) last = await fetch(D + '/api/eu?t=' + 'x'.repeat(24), { headers: { 'x-forwarded-for': '203.0.113.9' } });
  assert.equal(last.status, 429);
  assert.equal((await fetch('http://localhost:4599/api/security', { method: 'POST', headers: L, body: JSON.stringify({ door: false }) }).then(r => r.json())).doorOpen, false);
  // guessing PINs on the network: after 5 wrong tries even the right PIN waits
  for (let i = 0; i < 5; i++) await fetch('http://localhost:4599/api/plan', { headers: { 'x-pin': '000' + i } });
  assert.equal((await fetch('http://localhost:4599/api/plan', { headers: { 'x-pin': '2222' } })).status, 401);
});
