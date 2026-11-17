// Bethlehem Network Churches — Local Hub
// Runs on the church Mac Mini. Serves the operator control, the main screen,
// the stage screen and the phone "live" view, and keeps them all in sync
// over the church Wi-Fi with WebSockets. Works fully offline on Sunday.
//
//   PIN=1234 PORT=4545 npm start

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as nodeModule from 'node:module';
import { WebSocketServer } from 'ws';
import { extractLyrics } from './extract.js';
import { searchLyrics } from './websearch.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_FILE = path.join(DATA_DIR, 'library.json');
const PORT = Number(process.env.PORT || 4545);
const PIN = String(process.env.PIN || '');          // operator PIN; empty = no PIN (only for testing)
const LEADER_PIN = String(process.env.LEADER_PIN || PIN);
// Desktop app: windows on this same computer are trusted as leader (phones still need a PIN)
const TRUST_LOCALHOST = process.env.TRUST_LOCALHOST === '1';
const isLocal = addr => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(addr));

fs.mkdirSync(MEDIA_DIR, { recursive: true });

// --- Shared song engine: the same TypeScript file the desktop app uses -------
// Packaged app ships a pre-built core-dist/song.js; in the repo we strip types from song.ts on start.
const CORE_DIST = path.join(ROOT, 'core-dist', 'song.js');
const CORE_JS = fs.existsSync(CORE_DIST)
  ? fs.readFileSync(CORE_DIST, 'utf8')
  : nodeModule.stripTypeScriptTypes(fs.readFileSync(path.resolve(ROOT, '../../packages/core/src/song.ts'), 'utf8'));
const core = await import('data:text/javascript;base64,' + Buffer.from(CORE_JS).toString('base64'));

// --- Storage (simple JSON file, written atomically) -------------------------
const EMPTY = { songs: [], setlist: [], service: { title: 'Serviciu duminică', startsAt: null } };
function load() {
  try { return { ...EMPTY, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; }
  catch { return structuredClone(EMPTY); }
}
let db = load();

// --- Churches --------------------------------------------------------------------
// Each church has its own program (setlist + service); the song library is shared.
// db.setlist / db.service always hold the ACTIVE church; the others wait in db.churchData.
if (!Array.isArray(db.churches) || !db.churches.length) {
  const id = crypto.randomUUID();
  db.churches = [{ id, name: 'Betleem', city: '', code: null }];
  db.activeChurch = id;
}
db.churchData ||= {};
const activeChurch = () => db.churches.find(c => c.id === db.activeChurch) || db.churches[0];

function hashCode(code, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(code), salt, 32).toString('hex') };
}
function codeOk(church, code) {
  if (!church.code) return true;
  const h = Buffer.from(hashCode(code ?? '', church.code.salt).hash, 'hex');
  return crypto.timingSafeEqual(h, Buffer.from(church.code.hash, 'hex'));
}
// slow down guessing: 5 wrong codes per church -> locked for 1 minute
const failures = new Map();
function guard(church, code) {
  const f = failures.get(church.id) || { n: 0, until: 0 };
  if (Date.now() < f.until) return `Prea multe încercări. Mai încearcă peste ${Math.ceil((f.until - Date.now()) / 1000)} secunde.`;
  if (codeOk(church, code)) { failures.delete(church.id); return null; }
  f.n++; if (f.n >= 5) { f.n = 0; f.until = Date.now() + 60_000; }
  failures.set(church.id, f);
  return 'Cod greșit';
}
function switchChurch(id) {
  const cur = activeChurch();
  db.churchData[cur.id] = { setlist: db.setlist, service: db.service };
  const next = db.churchData[id] || { setlist: [], service: { title: 'Serviciu duminică', startsAt: null } };
  delete db.churchData[id];
  db.setlist = next.setlist; db.service = next.service; db.activeChurch = id;
  Object.assign(live, { item: -1, slide: 0, blank: false, logo: false, background: '', message: '' });
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, DB_FILE);
  }, 200);
}

// --- Live state (what is on the screens right now) ---------------------------
const live = { item: -1, slide: 0, blank: false, logo: false, background: '', message: '' };

function slidesFor(index) {
  const it = db.setlist[index];
  if (!it || it.kind !== 'song') return [];
  const song = db.songs.find(s => s.id === it.songId);
  if (!song) return [];
  const steps = it.key && song.key ? core.keyDistance(song.key, it.key) : 0;
  const body = core.transpose(song.body, steps, core.prefersFlats(it.key || song.key || 'C'));
  return core.toSlides(core.arrange(core.parseSong(body), it.arrangement || song.arrangement), it.maxLines || 4);
}

function applyItemBackground(index) {
  const it = db.setlist[index];
  if (it && it.background) live.background = it.background;
}

/** Add songs from an importer (FreeShow etc.). Skips titles already in the library. */
export function addSongs(list) {
  const have = new Set(db.songs.map(s => s.title.toLowerCase()));
  let added = 0;
  for (const s of list) {
    if (!s || !s.title || !s.body || have.has(s.title.toLowerCase())) continue;
    db.songs.push({ id: crypto.randomUUID(), ...s, body: core.normalizeImported(s.body), createdAt: new Date().toISOString() });
    have.add(s.title.toLowerCase()); added++;
  }
  if (added) { save(); broadcast(); }
  return added;
}

export { core, extractLyrics };

function snapshot() {
  return {
    service: db.service,
    church: (({ id, name, city }) => ({ id, name, city }))(activeChurch()),
    churches: db.churches.map(c => ({ id: c.id, name: c.name, city: c.city, locked: !!c.code })),
    setlist: db.setlist.map((it, i) => ({
      ...it,
      title: it.kind === 'song' ? (db.songs.find(s => s.id === it.songId)?.title ?? '(cântare ștearsă)') : it.title,
      slideCount: slidesFor(i).length,
    })),
    live: { ...live, slides: slidesFor(live.item) },
  };
}

// --- WebSocket sync -----------------------------------------------------------
const server = http.createServer(handle);
const wss = new WebSocketServer({ server, path: '/ws' });
const sessions = new Map(); // ws -> { role }

function broadcast() {
  const msg = JSON.stringify({ type: 'state', state: snapshot() });
  for (const ws of wss.clients) if (ws.readyState === 1) ws.send(msg);
}

const ROLE_RANK = { viewer: 0, operator: 1, leader: 2 };
const need = (ws, role) => ROLE_RANK[sessions.get(ws)?.role ?? 'viewer'] >= ROLE_RANK[role];

wss.on('connection', (ws, req) => {
  sessions.set(ws, { role: !PIN || (TRUST_LOCALHOST && isLocal(req.socket.remoteAddress)) ? 'leader' : 'viewer' });
  ws.send(JSON.stringify({ type: 'hello', role: sessions.get(ws).role, state: snapshot() }));
  ws.on('close', () => sessions.delete(ws));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const reply = o => ws.send(JSON.stringify(o));

    if (m.type === 'login') {
      const role = safeEq(m.pin, LEADER_PIN) && LEADER_PIN ? 'leader' : safeEq(m.pin, PIN) && PIN ? 'operator' : null;
      if (role) sessions.get(ws).role = role;
      return reply({ type: 'login', ok: !!role, role: sessions.get(ws).role });
    }
    if (!need(ws, 'operator')) return reply({ type: 'error', error: 'Nu ai drept de control. Introdu PIN-ul.' });

    switch (m.type) {
      case 'go': {                                   // go to item + slide
        const item = clamp(m.item ?? live.item, -1, db.setlist.length - 1);
        if (item !== live.item) applyItemBackground(item);
        live.item = item;
        live.slide = clamp(m.slide ?? 0, 0, Math.max(0, slidesFor(item).length - 1));
        live.blank = false; live.logo = false;
        break;
      }
      case 'next': case 'prev': {
        const dir = m.type === 'next' ? 1 : -1;
        const n = slidesFor(live.item).length;
        const s = live.slide + dir;
        if (s >= 0 && s < n) live.slide = s;
        else {                                       // jump to neighbouring item
          const item = clamp(live.item + dir, 0, db.setlist.length - 1);
          if (item !== live.item) { applyItemBackground(item); live.item = item; live.slide = dir > 0 ? 0 : Math.max(0, slidesFor(item).length - 1); }
        }
        live.blank = false; live.logo = false;
        break;
      }
      case 'blank': live.blank = !live.blank; break;
      case 'logo': live.logo = !live.logo; break;
      case 'background': live.background = String(m.value || ''); break;
      case 'message': live.message = String(m.value || '').slice(0, 200); break;
      case 'arrangement': {                          // operators may change slide layout only
        const it = db.setlist[m.item]; if (!it) break;
        it.arrangement = Array.isArray(m.value) ? m.value.map(String) : undefined;
        if (m.maxLines) it.maxLines = clamp(Number(m.maxLines), 1, 8);
        if ('background' in m) it.background = String(m.background || '');
        save(); break;
      }
      case 'itemBackground': {                       // pin a background to one song in the plan
        const it = db.setlist[m.item]; if (!it) break;
        it.background = String(m.value || '');
        if (m.item === live.item) live.background = it.background;
        save(); break;
      }
      case 'saveSong': {                             // operators fix lyrics
        const s = m.song || {};
        if (!s.title || !s.body) return reply({ type: 'error', error: 'Titlu și versuri obligatorii' });
        const body = core.normalizeImported(String(s.body));
        const meta = core.readMeta(body);
        const existing = s.id && db.songs.find(x => x.id === s.id);
        const data = { title: String(s.title).trim(), author: s.author || '', key: s.key || meta.key || '', body, source: s.source || '' };
        if (existing) Object.assign(existing, data);
        else db.songs.push({ id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() });
        save(); break;
      }
      // --- leader only: the service order ---
      case 'switchChurch': case 'addChurch': case 'editChurch': {
        if (!need(ws, 'leader')) return reply({ type: 'error', error: 'Doar liderul poate schimba biserica.' });
        const clean = v => String(v || '').trim().slice(0, 60);
        if (m.type === 'switchChurch') {
          const c = db.churches.find(x => x.id === m.id);
          if (!c) return reply({ type: 'error', error: 'Biserica nu există' });
          if (c.id === db.activeChurch) return reply({ type: 'church', ok: true });
          const err = guard(c, m.code); if (err) return reply({ type: 'church', ok: false, error: err });
          switchChurch(c.id);
        }
        if (m.type === 'addChurch') {
          if (!clean(m.name)) return reply({ type: 'church', ok: false, error: 'Scrie numele bisericii' });
          if (String(m.code || '').length < 4) return reply({ type: 'church', ok: false, error: 'Codul trebuie să aibă cel puțin 4 caractere' });
          const c = { id: crypto.randomUUID(), name: clean(m.name), city: clean(m.city), code: hashCode(m.code) };
          db.churches.push(c); switchChurch(c.id);
        }
        if (m.type === 'editChurch') {
          const c = db.churches.find(x => x.id === m.id); if (!c) break;
          const err = guard(c, m.code); if (err) return reply({ type: 'church', ok: false, error: err });
          if (clean(m.name)) c.name = clean(m.name);
          if ('city' in m) c.city = clean(m.city);
          if (m.newCode) {
            if (String(m.newCode).length < 4) return reply({ type: 'church', ok: false, error: 'Codul nou trebuie să aibă cel puțin 4 caractere' });
            c.code = hashCode(m.newCode);
          }
        }
        save(); reply({ type: 'church', ok: true }); break;
      }
      case 'addItem': case 'removeItem': case 'moveItem': case 'updateItem': case 'deleteSong': case 'service': {
        if (!need(ws, 'leader')) return reply({ type: 'error', error: 'Doar liderul poate schimba programul.' });
        if (m.type === 'addItem') {
          const kind = ['song', 'sermon', 'prayer', 'announcement', 'other'].includes(m.kind) ? m.kind : 'other';
          db.setlist.push({ id: crypto.randomUUID(), kind, songId: m.songId, title: m.title || '', key: m.key || '', minutes: Number(m.minutes) || 5, notes: [] });
        }
        if (m.type === 'removeItem') { db.setlist.splice(m.item, 1); if (live.item >= db.setlist.length) live.item = db.setlist.length - 1; }
        if (m.type === 'moveItem') {
          const to = clamp('to' in m ? Number(m.to) : m.item + m.dir, 0, db.setlist.length - 1);
          const liveItem = db.setlist[live.item];
          const [it] = db.setlist.splice(m.item, 1); db.setlist.splice(to, 0, it);
          if (liveItem) live.item = db.setlist.indexOf(liveItem);
        }
        if (m.type === 'updateItem' && db.setlist[m.item]) {
          const allowed = ['title', 'key', 'minutes', 'leader'];
          for (const k of allowed) if (k in (m.patch || {})) db.setlist[m.item][k] = m.patch[k];
        }
        if (m.type === 'deleteSong') db.songs = db.songs.filter(s => s.id !== m.id);
        if (m.type === 'service') db.service = { ...db.service, ...pick(m.value, ['title', 'startsAt']) };
        save(); break;
      }
      default: return;
    }
    broadcast();
  });
});

// Musician notes can be posted by anyone logged in as operator+ (musicians use operator PIN or
// the future Supabase login). Kept separate so it is easy to open up later.
// --- HTTP ----------------------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.json': 'application/json' };

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/core/song.js') return send(res, 200, CORE_JS, TYPES['.js']);
    if (p === '/api/songs' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const list = db.songs.filter(s => !q || s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))
        .map(({ id, title, key, author }) => ({ id, title, key, author })).slice(0, 50);
      return json(res, 200, list);
    }
    if (p.startsWith('/api/songs/') && req.method === 'GET') {
      const s = db.songs.find(x => x.id === p.split('/')[3]);
      return s ? json(res, 200, s) : json(res, 404, { error: 'not found' });
    }
    if (p === '/api/import-url' && req.method === 'POST') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const { url: target } = JSON.parse(await body(req, 10_000));
      const u = new URL(target);
      if (!/^https?:$/.test(u.protocol)) throw new Error('Doar linkuri http/https');
      const r = await fetch(u, { headers: { 'user-agent': 'BethlehemNetwork/0.1 (+church presenter)' }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) throw new Error('Site-ul a răspuns cu ' + r.status);
      const html = await r.text();
      const found = extractLyrics(html, u.hostname);
      return json(res, 200, { ...found, body: core.normalizeImported(found.body), source: u.href });
    }
    if (p === '/api/search-lyrics' && req.method === 'GET') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const results = await searchLyrics(url.searchParams.get('q'), {
        chords: url.searchParams.get('chords') === '1', normalize: core.normalizeImported,
      });
      return json(res, 200, results);
    }
    if (p === '/api/media' && req.method === 'GET') {
      const files = fs.readdirSync(MEDIA_DIR).filter(f => TYPES[path.extname(f).toLowerCase()] && !f.startsWith('.'));
      return json(res, 200, files);
    }
    if (p === '/api/media' && req.method === 'POST') {      // upload background (raw body, ?name=)
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const name = path.basename(url.searchParams.get('name') || '').replace(/[^\w.\- ]/g, '_');
      if (!name || !TYPES[path.extname(name).toLowerCase()]) return json(res, 400, { error: 'Tip de fișier nepermis' });
      const buf = await body(req, 500 * 1024 * 1024, true);
      fs.writeFileSync(path.join(MEDIA_DIR, name), buf);
      return json(res, 200, { ok: true, name });
    }
    if (p.startsWith('/media/')) return file(res, MEDIA_DIR, decodeURIComponent(p.slice(7)), req);
    if (p === '/' ) return redirect(res, '/live.html');
    return file(res, PUBLIC, p.slice(1), req);
  } catch (e) {
    return json(res, 400, { error: e.message });
  }
}

function checkPin(req) { return !PIN || (TRUST_LOCALHOST && isLocal(req.socket.remoteAddress)) || safeEq(req.headers['x-pin'], PIN) || safeEq(req.headers['x-pin'], LEADER_PIN); }
function safeEq(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo)); }
function pick(o, keys) { const r = {}; for (const k of keys) if (o && k in o) r[k] = o[k]; return r; }
function send(res, code, data, type) { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-cache' }); res.end(data); }
function json(res, code, o) { send(res, code, JSON.stringify(o), 'application/json; charset=utf-8'); }
function redirect(res, to) { res.writeHead(302, { location: to }); res.end(); }
function body(req, limit, raw = false) {
  return new Promise((ok, bad) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { bad(new Error('Prea mare')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(raw ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
    req.on('error', bad);
  });
}
function file(res, dir, rel, req) {
  const full = path.resolve(dir, rel);
  if (!full.startsWith(dir + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) return send(res, 404, 'Not found', 'text/plain');
  const type = TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream';
  const { size } = fs.statSync(full);
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);   // video backgrounds need range requests
  if (range) {
    const start = Number(range[1] || 0), end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    return fs.createReadStream(full, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
  fs.createReadStream(full).pipe(res);
}

// Resolves when listening, rejects (e.g. EADDRINUSE) instead of crashing the desktop app.
export const ready = new Promise((ok, bad) => { server.once('listening', ok); server.once('error', bad); });
ready.catch(() => {});
server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
  console.log('\n  Bethlehem Network Churches — Local Hub\n');
  for (const ip of ['localhost', ...ips]) {
    console.log(`  http://${ip}:${PORT}/control.html   (operator)`);
  }
  console.log(`\n  Ecran principal:  /main.html     Ecran scenă: /stage.html     Telefoane: /live.html`);
  if (!PIN) console.log('\n  ATENȚIE: nu ai setat PIN. Oricine din rețea poate controla. Pornește cu PIN=1234 npm start\n');
});

export { server };
