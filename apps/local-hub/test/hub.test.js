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
