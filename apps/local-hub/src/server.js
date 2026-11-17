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
import { addChordsToSongs } from './chords.js';
import { runAssistant } from './ai.js';
import { defaultPlan, applyPlanOp, serviceWarnings } from './plan.js';

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
db.plan ||= defaultPlan();          // planning of the ACTIVE church (others wait in churchData)
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
  db.churchData[cur.id] = { setlist: db.setlist, service: db.service, plan: db.plan };
  const next = db.churchData[id] || { setlist: [], service: { title: 'Serviciu duminică', startsAt: null } };
  delete db.churchData[id];
  db.setlist = next.setlist; db.service = next.service; db.plan = next.plan || defaultPlan(); db.activeChurch = id;
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

// --- How text looks on the screens (operators can change it) --------------------
const DISPLAY_DEFAULTS = {
  main:  { font: 'Segoe UI', size: 6.2, color: '#ffffff', align: 'center', valign: 'middle', weight: 700, upper: false, shadow: true, dim: 35 },
  stage: { font: 'Segoe UI', size: 5.4, color: '#f2f2f2', chordColor: '#f5b301', align: 'left', next: true,
           nextSize: 3.4, nextColor: '#8a8f95', nextShare: 30, labels: true },
};
db.display = { main: { ...DISPLAY_DEFAULTS.main, ...(db.display?.main || {}) }, stage: { ...DISPLAY_DEFAULTS.stage, ...(db.display?.stage || {}) } };
function cleanDisplay(screen, patch) {
  const d = {}, p = patch || {};
  if (typeof p.font === 'string') d.font = p.font.slice(0, 60).replace(/[^\w\s-]/g, '');
  if (Number.isFinite(+p.size)) d.size = Math.min(16, Math.max(2, +p.size));
  if (/^#[0-9a-f]{6}$/i.test(p.color || '')) d.color = p.color;
  if (/^#[0-9a-f]{6}$/i.test(p.chordColor || '')) d.chordColor = p.chordColor;
  if (['left', 'center', 'right'].includes(p.align)) d.align = p.align;
  if (['top', 'middle', 'bottom'].includes(p.valign)) d.valign = p.valign;
  if ([400, 500, 600, 700, 800].includes(+p.weight)) d.weight = +p.weight;
  for (const k of ['upper', 'shadow', 'next', 'italic', 'labels']) if (typeof p[k] === 'boolean') d[k] = p[k];
  if (Number.isFinite(+p.dim)) d.dim = Math.min(90, Math.max(0, +p.dim));
  if (Number.isFinite(+p.lineHeight)) d.lineHeight = Math.min(2.2, Math.max(0.8, +p.lineHeight));
  if (Number.isFinite(+p.nextSize)) d.nextSize = Math.min(10, Math.max(1.5, +p.nextSize));
  if (/^#[0-9a-f]{6}$/i.test(p.nextColor || '')) d.nextColor = p.nextColor;
  if (Number.isFinite(+p.nextShare)) d.nextShare = Math.min(70, Math.max(10, +p.nextShare));
  // text area on the screen, in % of width/height (null = whole screen with margins)
  if (p.box === null) d.box = null;
  else if (p.box && ['x', 'y', 'w', 'h'].every(k => Number.isFinite(+p.box[k]))) {
    const c = v => Math.round(Math.min(100, Math.max(0, +v)) * 10) / 10;
    const x = c(p.box.x), y = c(p.box.y);
    d.box = { x, y, w: Math.max(5, Math.min(100 - x, c(p.box.w))), h: Math.max(5, Math.min(100 - y, c(p.box.h))) };
  }
  return d;
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

/** Which section of the song (and which lines of it) a slide comes from — same split as toSlides. */
function slideSource(it, song, slide) {
  const sections = core.arrange(core.parseSong(song.body), it.arrangement || song.arrangement);
  const max = it.maxLines || 4;
  let n = 0;
  for (const sec of sections) {
    const parts = Math.max(1, Math.ceil(sec.lines.length / max)), size = Math.ceil(sec.lines.length / parts);
    for (let i = 0; i < sec.lines.length; i += size) { if (n === Number(slide)) return { sec, from: i, to: Math.min(i + size, sec.lines.length) }; n++; }
  }
  return null;
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
    display: db.display,
    church: (({ id, name, city }) => ({ id, name, city }))(activeChurch()),
    churches: db.churches.map(c => ({ id: c.id, name: c.name, city: c.city, locked: !!c.code })),
    setlist: db.setlist.map((it, i) => ({
      ...it,
      title: it.kind === 'song' ? (db.songs.find(s => s.id === it.songId)?.title ?? '(cântare ștearsă)') : it.title,
      slideCount: slidesFor(i).length,
    })),
    live: { ...live, slides: slidesFor(live.item) },
    // the planned programs of this church (titles and dates only — teams and phone numbers stay out)
    programs: (db.plan?.services || []).slice().sort((a, b) => a.date.localeCompare(b.date))
      .map(s => ({ id: s.id, title: s.title, date: s.date, count: s.items.length })),
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
  ws.on('message', raw => { let m; try { m = JSON.parse(raw); } catch { return; } handleMessage(ws, m); });
});

/** One command from a screen, a phone or the AI assistant. `ws` only needs send(); its role is in `sessions`. */
function handleMessage(ws, m) {
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
      case 'display': {                              // look of the main / stage screen
        const screen = m.screen === 'stage' ? 'stage' : 'main';
        Object.assign(db.display[screen], cleanDisplay(screen, m.patch));
        save(); break;
      }
      case 'itemDisplay': {                          // a song's own look on the main screen (null = use the general one)
        const it = db.setlist[m.item]; if (!it) break;
        it.display = m.patch ? cleanDisplay('main', m.patch) : undefined;
        save(); break;
      }
      case 'itemBackground': {                       // pin a background to one song in the plan
        const it = db.setlist[m.item]; if (!it) break;
        it.background = String(m.value || '');
        if (m.item === live.item) live.background = it.background;
        save(); break;
      }
      case 'slideStyle': {                           // look of one slide, the whole song, or every song
        const it = db.setlist[m.item]; if (!it) break;
        if (m.scope === 'all') { Object.assign(db.display.main, cleanDisplay('main', m.patch)); for (const x of db.setlist) { delete x.display; delete x.slideStyles; } }
        else if (m.scope === 'song') { it.display = m.patch ? cleanDisplay('main', m.patch) : undefined; delete it.slideStyles; }
        else {
          const n = Number(m.slide); if (!Number.isInteger(n) || n < 0 || n > 500) break;
          it.slideStyles ||= {};
          if (m.patch) it.slideStyles[n] = cleanDisplay('main', m.patch); else delete it.slideStyles[n];
        }
        save(); break;
      }
      case 'slideSection': {                         // Strofa / Refren / Bridge… for the section this slide belongs to
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') break;
        const song = db.songs.find(x => x.id === it.songId); if (!song) break;
        const hit = slideSource(it, song, m.slide); if (!hit) break;
        const label = String(m.label || '').trim().slice(0, 30);
        if (!label) return reply({ type: 'error', error: 'Alege un nume pentru secțiune' });
        const body = core.setSlideLabel(song.body, hit.sec.lines, hit.from, hit.to, label, hit.sec.label);   // only this slide, even inside a long section
        if (body === song.body && hit.sec.label !== label) return reply({ type: 'error', error: 'Nu am găsit secțiunea în cântare. Schimb-o din Editor.' });
        song.body = body; song.updatedAt = new Date().toISOString();
        save(); break;
      }
      case 'editSlide': {                            // fix the words of one slide; chords stay on their words
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') break;
        const song = db.songs.find(x => x.id === it.songId); if (!song) break;
        const hit = slideSource(it, song, m.slide);
        if (!hit) break;
        const oldLines = hit.sec.lines.slice(hit.from, hit.to);
        const newText = String(m.text || '').replace(/\r/g, '').split('\n').map(l => l.trimEnd()).filter(l => l.trim()).join('\n');
        if (!newText) return reply({ type: 'error', error: 'Slide-ul nu poate fi gol' });
        const withChords = /\[[A-G]/.test(newText) ? newText : core.applyChords(newText, oldLines.join('\n')).body;
        const oldBlock = hit.sec.lines.join('\n');
        const newBlock = [...hit.sec.lines.slice(0, hit.from), ...withChords.split('\n'), ...hit.sec.lines.slice(hit.to)].join('\n');
        if (!song.body.includes(oldBlock)) return reply({ type: 'error', error: 'Nu am găsit slide-ul în cântare. Editează-l din Editor.' });
        song.body = song.body.replace(oldBlock, newBlock);
        song.updatedAt = new Date().toISOString();
        save(); break;
      }
      case 'saveSong': {                             // operators fix lyrics
        const s = m.song || {};
        if (!s.title || !s.body) return reply({ type: 'error', error: 'Titlu și versuri obligatorii' });
        const body = core.normalizeImported(String(s.body));
        const meta = core.readMeta(body);
        const existing = s.id && db.songs.find(x => x.id === s.id);
        const tags = Array.isArray(s.tags) ? [...new Set(s.tags.map(t => String(t).trim()).filter(Boolean))].slice(0, 12) : undefined;
        const data = { title: String(s.title).trim(), author: s.author || '', key: s.key || meta.key || '', body, source: s.source || '',
          ...(tags ? { tags } : {}), updatedAt: new Date().toISOString() };
        if (existing) Object.assign(existing, data);
        else {
          const created = { id: crypto.randomUUID(), ...data, createdAt: new Date().toISOString() };
          db.songs.push(created);
          if (m.addToProgram && need(ws, 'leader')) db.setlist.push({ id: crypto.randomUUID(), kind: 'song', songId: created.id, title: '', key: created.key || '', minutes: 5, notes: [] });
        }
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
      case 'openProgram': case 'newProgram': {        // pick which program is on the Live screen
        if (!need(ws, 'leader')) return reply({ type: 'error', error: 'Doar liderul poate schimba programul.' });
        // a program made only in Live (not planned) is kept, so nothing is lost when switching
        if (!db.service.planId && (db.setlist.length || db.service.title)) {
          db.plan.services.push({ id: crypto.randomUUID(), date: db.service.startsAt || new Date().toISOString(),
            title: db.service.title || 'Program fără nume', status: 'draft', items: db.setlist.map(({ notes, ...it }) => structuredClone(it)), assignments: {} });
        }
        let target;
        if (m.type === 'newProgram') {
          const before = new Set(db.plan.services.map(x => x.id));
          const err = applyPlanOp(db.plan, { op: 'addService', title: m.title, date: m.date || new Date().toISOString() });
          if (err) return reply({ type: 'error', error: err });
          target = db.plan.services.find(x => !before.has(x.id));
        } else target = db.plan.services.find(x => x.id === m.id);
        if (!target) return reply({ type: 'error', error: 'Programul nu există' });
        db.setlist = target.items.map(it => ({ ...structuredClone(it), notes: [] }));
        db.service = { title: target.title, startsAt: target.date, planId: target.id };
        Object.assign(live, { item: -1, slide: 0, blank: false, logo: false });
        save(); break;
      }
      case 'addItem': case 'removeItem': case 'moveItem': case 'updateItem': case 'deleteSong': case 'service': {
        if (!need(ws, 'leader')) return reply({ type: 'error', error: 'Doar liderul poate schimba programul.' });
        if (m.type === 'addItem') {
          const kind = ['song', 'sermon', 'prayer', 'announcement', 'other'].includes(m.kind) ? m.kind : 'other';
          const item = m.item && typeof m.item === 'object'                                 // undo of a removal
            ? { notes: [], ...pick(m.item, ['id', 'kind', 'songId', 'title', 'key', 'minutes', 'leader', 'arrangement', 'maxLines', 'background', 'display', 'slideStyles', 'notes']), id: m.item.id || crypto.randomUUID() }
            : { id: crypto.randomUUID(), kind, songId: m.songId, title: m.title || '', key: m.key || '', minutes: Number(m.minutes) || 5, notes: [] };
          const at = Number.isInteger(m.at) ? Math.min(Math.max(0, m.at), db.setlist.length) : db.setlist.length;
          db.setlist.splice(at, 0, item);
          if (live.item >= at && live.item >= 0 && Number.isInteger(m.at)) live.item++;
        }
        if (m.type === 'removeItem') {
          db.setlist.splice(m.item, 1);
          if (m.item < live.item) live.item--; else if (m.item === live.item) { live.item = -1; live.slide = 0; }
          if (live.item >= db.setlist.length) live.item = db.setlist.length - 1;
        }
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
    syncLiveToPlan();
    broadcast();
}

/** A change made in Planning to the program that is on Live shows up in Live too. */
function planToLive() {
  if (!db.service.planId) return;
  const s = db.plan.services.find(x => x.id === db.service.planId);
  if (!s) { db.service = { ...db.service, planId: undefined }; return; }
  db.service = { ...db.service, title: s.title, startsAt: s.date };
  const strip = list => JSON.stringify(list.map(({ notes, ...it }) => it));
  if (strip(s.items) !== strip(db.setlist)) {
    const liveId = db.setlist[live.item]?.id;
    db.setlist = s.items.map(it => ({ ...structuredClone(it), notes: db.setlist.find(x => x.id === it.id)?.notes || [] }));
    live.item = liveId ? db.setlist.findIndex(x => x.id === liveId) : -1;
    if (live.item < 0) live.slide = 0;
  }
}

/** When the Live program came from a planned service, keep that service up to date. */
function syncLiveToPlan() {
  const s = db.service.planId && db.plan?.services.find(x => x.id === db.service.planId);
  if (!s) return;
  s.items = db.setlist.map(({ notes, ...it }) => structuredClone(it));
  s.title = db.service.title || s.title;
  if (db.service.startsAt) s.date = db.service.startsAt;
}

// Musician notes can be posted by anyone logged in as operator+ (musicians use operator PIN or
// the future Supabase login). Kept separate so it is easy to open up later.
function searchSongs(query, tag) {
  const list = db.songs.filter(s => !tag || (s.tags || []).includes(tag));
  const ranked = query && String(query).trim()
    ? core.rankSongs(list, query)
    : list.sort((a, b) => a.title.localeCompare(b.title, 'ro'));
  return ranked.map(({ id, title, key, author, tags, body }) => ({ id, title, key, author, tags: tags || [], chords: /\[[A-G]/.test(body) })).slice(0, 300);
}
const mediaList = () => fs.readdirSync(MEDIA_DIR).filter(f => TYPES[path.extname(f).toLowerCase()] && !f.startsWith('.') && f !== 'logo.png');

// --- AI assistant -------------------------------------------------------------------
const AI_FILE = path.join(DATA_DIR, 'ai.json');
let aiSettings = { provider: 'auto', claudeModel: 'claude-sonnet-5-5', ollamaUrl: 'http://localhost:11434', ollamaModel: 'qwen2.5:7b' };
try { aiSettings = { ...aiSettings, ...JSON.parse(fs.readFileSync(AI_FILE, 'utf8')) }; } catch {}
const aiPublic = () => ({ ...aiSettings, claudeKey: undefined, hasKey: !!aiSettings.claudeKey, keyHint: aiSettings.claudeKey ? '…' + aiSettings.claudeKey.slice(-4) : '' });
const aiSocket = { send(t) { try { const o = JSON.parse(t); if (o.type === 'error' || (o.type === 'church' && !o.ok)) this.last = o.error; } catch {} } };
sessions.set(aiSocket, { role: 'leader' });
const aiHub = {
  state: () => ({
    church: activeChurch().name, service: db.service,
    program: db.setlist.map((it, i) => ({ position: i + 1, kind: it.kind,
      title: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.title : it.title, key: it.key || '', minutes: it.minutes, display: it.display, background: it.background })),
    live: { position: live.item + 1, slide: live.slide + 1, blank: live.blank, background: live.background },
    display: db.display,
  }),
  run(m) { aiSocket.last = null; handleMessage(aiSocket, m); return aiSocket.last; },
  searchSongs, media: mediaList,
  song: id => db.songs.find(s => s.id === id),
};

// --- Add chords from resursecrestine.ro (runs in the background) ---------------------
const chordsJob = { running: false, stop: false };
function chordsEvent(o) {
  const msg = JSON.stringify({ type: 'chords', ...o });
  for (const ws of wss.clients) if (ws.readyState === 1) ws.send(msg);
}
async function runChordsJob(list) {
  Object.assign(chordsJob, { running: true, stop: false });
  try {
    const result = await addChordsToSongs(list, core, {
      shouldStop: () => chordsJob.stop,
      onProgress: p => chordsEvent({ ...p, running: true }),
      onSong: (song, r) => {
        song.body = r.body;
        if (!song.key) song.key = r.key;
        song.chordsSource = r.url;
        song.updatedAt = new Date().toISOString();
        save();
      },
    });
    chordsEvent({ running: false, finished: true, added: result.added.length, missed: result.missed });
    broadcast();
  } catch (e) {
    chordsEvent({ running: false, finished: true, error: e.message });
  } finally { chordsJob.running = false; }
}

// --- HTTP ----------------------------------------------------------------------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webm': 'video/webm', '.mov': 'video/quicktime', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/core/song.js') return send(res, 200, CORE_JS, TYPES['.js']);
    if (p === '/api/songs' && req.method === 'GET') {
      const list = searchSongs(url.searchParams.get('q'), url.searchParams.get('tag'));
      return json(res, 200, list);
    }
    if (p === '/api/tags' && req.method === 'GET') {
      const count = {};
      for (const s of db.songs) for (const t of s.tags || []) count[t] = (count[t] || 0) + 1;
      return json(res, 200, Object.entries(count).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })));
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
    if (p === '/api/songs' && req.method === 'POST') {         // save a song found on the internet (phone planning)
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const s = JSON.parse((await body(req, 300_000)) || '{}');
      if (!s.title || !s.body) return json(res, 400, { error: 'Titlu și versuri obligatorii' });
      const bodyText = core.normalizeImported(String(s.body));
      const same = db.songs.find(x => x.title.trim().toLowerCase() === String(s.title).trim().toLowerCase() && x.source && x.source === s.source);
      const song = same || { id: crypto.randomUUID(), title: String(s.title).trim().slice(0, 120), author: '', key: core.readMeta(bodyText).key || '',
        body: bodyText, source: String(s.source || ''), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      if (!same) { db.songs.push(song); save(); broadcast(); }
      return json(res, 200, { id: song.id, title: song.title, key: song.key });
    }
    if (p === '/api/search-lyrics' && req.method === 'GET') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const results = await searchLyrics(url.searchParams.get('q'), {
        chords: url.searchParams.get('chords') === '1', normalize: core.normalizeImported,
      });
      return json(res, 200, results);
    }
    if (p === '/api/add-chords' && req.method === 'POST') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      if (chordsJob.running) return json(res, 409, { error: 'Căutarea acordurilor rulează deja' });
      const { ids } = JSON.parse((await body(req, 100_000)) || '{}');
      const list = Array.isArray(ids) && ids.length ? db.songs.filter(s => ids.includes(s.id)) : db.songs;
      // safety copy of the library before changing many songs
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      if (list.length > 1) fs.writeFileSync(path.join(DATA_DIR, `library.backup-${stamp}.json`), JSON.stringify(db, null, 2));
      runChordsJob(list);
      return json(res, 200, { ok: true });
    }
    if (p === '/api/add-chords/stop' && req.method === 'POST') { chordsJob.stop = true; return json(res, 200, { ok: true }); }
    if (p === '/api/plan') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      if (req.method === 'POST') {
        const op = JSON.parse(await body(req, 500_000));
        if (op.op === 'goLive') {                       // make this service the program on the screens
          const s = db.plan.services.find(x => x.id === op.id); if (!s) return json(res, 404, { error: 'Serviciul nu există' });
          db.setlist = s.items.map(it => ({ ...structuredClone(it), notes: [] }));
          db.service = { title: s.title, startsAt: s.date, planId: s.id };
          Object.assign(live, { item: -1, slide: 0, blank: false, logo: false });
          save(); broadcast();
        } else {
          const err = applyPlanOp(db.plan, op);
          if (err) return json(res, 400, { error: err });
          planToLive();
          save(); broadcast();
        }
        const msg = JSON.stringify({ type: 'planChanged' });
        for (const ws of wss.clients) if (ws.readyState === 1 && sessions.get(ws)?.role === 'leader') ws.send(msg);
      }
      const plan = db.plan;
      return json(res, 200, { ...plan, currentPlanId: db.service.planId || null,
        services: plan.services.map(s => ({ ...s, warnings: serviceWarnings(plan, s),
          items: s.items.map(it => it.kind === 'song' ? { ...it, title: db.songs.find(x => x.id === it.songId)?.title || it.title || '(cântare ștearsă)' } : it) })) });
    }
    if (p === '/api/ai/settings') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      if (req.method === 'POST') {
        const v = JSON.parse(await body(req, 10_000));
        for (const k of ['provider', 'claudeModel', 'ollamaUrl', 'ollamaModel']) if (typeof v[k] === 'string' && v[k].length < 200) aiSettings[k] = v[k].trim();
        if (typeof v.claudeKey === 'string' && v.claudeKey.trim()) aiSettings.claudeKey = v.claudeKey.trim();
        if (v.clearKey) delete aiSettings.claudeKey;
        fs.writeFileSync(AI_FILE, JSON.stringify(aiSettings, null, 2));
      }
      return json(res, 200, aiPublic());
    }
    if (p === '/api/ai/chat' && req.method === 'POST') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const { history } = JSON.parse(await body(req, 200_000));
      const clean = (Array.isArray(history) ? history : []).slice(-16)
        .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
      if (!clean.length || clean.at(-1).role !== 'user') return json(res, 400, { error: 'Scrie un mesaj' });
      try { return json(res, 200, await runAssistant(aiSettings, clean, aiHub)); }
      catch (e) { return json(res, 200, { error: e.message }); }
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
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', ...(/\.(html|js|css)$/.test(full) ? { 'cache-control': 'no-cache' } : {}) });
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
