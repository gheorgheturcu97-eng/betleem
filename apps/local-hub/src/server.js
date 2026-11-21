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
import { feedbackProposal, runAssistant } from './ai.js';
import { defaultPlan, applyPlanOp, serviceWarnings } from './plan.js';
import * as pco from './pco.js';
import { createCanva } from './canva.js';
import { createUpdater, newer } from './updater.js';
import { bookName, formatRef, parseRef, BOOKS } from '../public/bibleref.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const INBOX_DIR = path.join(DATA_DIR, 'primite');                                     // files sent from phones / AirDrop, waiting
const BIBLE_DIRS = [path.join(ROOT, 'bibles'), path.join(DATA_DIR, 'bibles')];        // built in (public domain), then imported by the church
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
const canva = createCanva({ dataDir: DATA_DIR, port: PORT, mediaDir: MEDIA_DIR, log: (w, e) => logError(w, e) });
function broadcastCanva() { const msg = JSON.stringify({ type: 'canva', ...canva.status() }); for (const ws of wss?.clients || []) if (ws.readyState === 1) ws.send(msg); }

// --- What comes with the app --------------------------------------------------------
// Backgrounds made for Echipa Betleem (free, original): put in the media folder once; one you delete stays deleted.
function installBundled() {
  db.bundledBg ||= [];
  for (const dir of [path.join(ROOT, 'backgrounds'), process.env.BUILTIN_HUB && path.join(process.env.BUILTIN_HUB, 'backgrounds')].filter(Boolean)) {
    let files = []; try { files = fs.readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!/\.(jpg|png|mp4)$/i.test(f) || db.bundledBg.includes(f)) continue;
      try { if (!fs.existsSync(path.join(MEDIA_DIR, f))) fs.copyFileSync(path.join(dir, f), path.join(MEDIA_DIR, f)); db.bundledBg.push(f); } catch (e) { logError('fundaluri', e); }
    }
  }
  // the church's song library, only inside the installer (never in the public updates): used when this computer has no songs yet
  if (!db.songs?.length && !db.starterDone) {
    for (const f of [path.join(ROOT, 'starter', 'library.json'), process.env.BUILTIN_HUB && path.join(process.env.BUILTIN_HUB, 'starter', 'library.json')].filter(Boolean)) {
      try {
        const songs = JSON.parse(fs.readFileSync(f, 'utf8')).songs;
        if (Array.isArray(songs) && songs.length) { db.songs = songs.filter(x => x?.id && x.title && typeof x.body === 'string'); db.starterDone = true; console.log(`Biblioteca de început: ${db.songs.length} cântări`); break; }
      } catch {}
    }
  }
}
installBundled();

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
export function logError(where, err) {
  try { fs.appendFileSync(path.join(DATA_DIR, 'erori.log'), `[${new Date().toISOString()}] ${where}: ${err && err.stack || err}\n`); } catch {}
  console.error(where, err);
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
           nextSize: 3.4, nextColor: '#8a8f95', nextShare: 30, labels: true,
           title: true, clock: true, timer: true, service: true, upNext: 2, headSize: 3.2 },
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
  for (const k of ['upper', 'shadow', 'next', 'italic', 'labels', 'title', 'clock', 'timer', 'service']) if (typeof p[k] === 'boolean') d[k] = p[k];
  if (Number.isFinite(+p.upNext)) d.upNext = Math.min(5, Math.max(0, Math.round(+p.upNext)));        // how many program items the stage shows ahead
  if (Number.isFinite(+p.headSize)) d.headSize = Math.min(8, Math.max(2, +p.headSize));
  if (Number.isFinite(+p.dim)) d.dim = Math.min(90, Math.max(0, +p.dim));
  if (Number.isFinite(+p.lineHeight)) d.lineHeight = Math.min(2.2, Math.max(0.8, +p.lineHeight));
  if (Number.isFinite(+p.nextSize)) d.nextSize = Math.min(10, Math.max(1.5, +p.nextSize));
  if (/^#[0-9a-f]{6}$/i.test(p.nextColor || '')) d.nextColor = p.nextColor;
  if (Number.isFinite(+p.nextShare)) d.nextShare = Math.min(55, Math.max(10, +p.nextShare));
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
const live = { item: -1, slide: 0, blank: false, logo: false, background: '', message: '', since: 0, bible: null,
  noText: false,             // "Fără text": the words go away, the background stays
  messageTo: 'both',         // the message bar: on the audience screen, the stage, or both
  countdown: null,           // { to: ms, label, screens, bg } — "Începem în 4:59" on the screens, on its own background
  serviceStart: 0,           // the service timer: starts when the first item of the program goes live
  video: { cmd: 'play', at: 0, muted: false } };   // the video on the audience screen: play / pause / from the start / sound
let liveId = null;                                   // the timer on stage restarts when another program item goes live
function trackSince() {
  const id = live.item === -2 ? 'bible' : db.setlist[live.item]?.id || null;
  if (id !== liveId) { liveId = id; live.since = id ? Date.now() : 0; if (id && !live.serviceStart && live.item >= 0) live.serviceStart = Date.now(); }
}

// --- Bible: versions on disk, loaded when first used ----------------------------
const bibleCache = new Map();
function bibleList() {
  const out = [];
  for (const dir of BIBLE_DIRS) {
    let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch {}
    for (const f of files) {
      const id = f.slice(0, -5); if (out.some(b => b.id === id)) continue;
      const b = bible(id); if (b) out.push({ id, name: b.name, short: b.short, lang: b.lang, imported: dir !== BIBLE_DIRS[0] });
    }
  }
  return out.sort((a, b) => (a.lang === 'ro' ? 0 : 1) - (b.lang === 'ro' ? 0 : 1) || a.short.localeCompare(b.short));
}
function bible(id) {
  id = String(id || '').toLowerCase().replace(/[^a-z0-9_-]/g, ''); if (!id) return null;
  if (!bibleCache.has(id)) {
    let b = null;
    for (const dir of BIBLE_DIRS) { try { b = JSON.parse(fs.readFileSync(path.join(dir, id + '.json'), 'utf8')); break; } catch {} }
    if (b && !(Array.isArray(b.books) && b.books.length === 66)) b = null;
    bibleCache.set(id, b);
  }
  return bibleCache.get(id);
}
/** Slides for a passage: one verse per slide, a second version under it when chosen. ref = { book, chapter, from, to }, versions = [id, id?] */
function bibleSlides(ref, versions) {
  if (!ref) return [];
  const [a, b] = (versions || []).map(bible);
  const main = a || bible('vdc'); if (!main) return [];
  const verses = main.books[ref.book]?.[ref.chapter - 1] || [];
  const from = Math.max(1, ref.from || 1), to = Math.min(verses.length, ref.to || verses.length);
  const out = [];
  for (let v = from; v <= to; v++) {
    const r = { book: ref.book, chapter: ref.chapter, from: v, to: v };
    out.push({ label: formatRef(r, main.lang), lines: [verses[v - 1] || ''], bible: main.short, verse: v,
      ...(b ? { second: { lines: [b.books[ref.book]?.[ref.chapter - 1]?.[v - 1] || ''], label: formatRef(r, b.lang), bible: b.short } } : {}) });
  }
  return out;
}
function cleanRef(r) {
  if (!r) return null;
  const book = Math.round(+r.book), chapter = Math.round(+r.chapter);
  if (!(book >= 0 && book < 66 && chapter >= 1 && chapter <= 150)) return null;
  const from = Math.max(0, Math.round(+r.from || 0)), to = Math.max(from, Math.round(+r.to || from));
  return { book, chapter, from, to };
}
const cleanVersions = v => (Array.isArray(v) ? v : []).slice(0, 2).map(x => String(x).toLowerCase().replace(/[^a-z0-9_-]/g, '')).filter(x => x && bible(x));

function slidesFor(index) {
  if (index === -2) return live.bible ? bibleSlides(live.bible.ref, live.bible.versions) : [];   // a passage shown straight from the Bible tab
  const it = db.setlist[index];
  if (it?.kind === 'bible') return bibleSlides(it.ref, it.versions);
  if (it && it.kind !== 'song' && it.slides?.length) return it.slides.map((src, i) => ({ label: '', lines: [], image: src,
    ...(it.transitions?.[i] ? { transition: it.transitions[i] } : {}), ...(it.advance?.[i] ? { advance: it.advance[i] } : {}) }));   // PDF / PowerPoint pages, pictures, videos
  if (!it || it.kind !== 'song') return [];
  const song = db.songs.find(s => s.id === it.songId);
  if (!song) return [];
  const orig = core.originalKey(song.key, song.body);       // songs without a saved key still change key
  const steps = it.key && orig ? core.keyDistance(orig, it.key) : 0;
  const body = core.transpose(song.body, steps, core.prefersFlats(it.key || orig || 'C'));
  return core.toSlides(core.arrange(core.parseSong(body), it.arrangement || song.arrangement), it.maxLines || 4);
}

/** Which section of the song (and which lines of it) a slide comes from — same split as toSlides. */
function slideSource(it, song, slide) {
  const parsed = core.parseSong(song.body);
  const sections = core.arrange(parsed, it.arrangement || song.arrangement);
  const max = it.maxLines || 4;
  let n = 0;
  for (const [pos, sec] of sections.entries()) {
    const parts = Math.max(1, Math.ceil(sec.lines.length / max)), size = Math.ceil(sec.lines.length / parts);
    for (let i = 0; i < sec.lines.length; i += size) {
      if (n === Number(slide)) return { sec, from: i, to: Math.min(i + size, sec.lines.length), parsed, k: parsed.indexOf(sec), pos };
      n++;
    }
  }
  return null;
}

/**
 * Split the section a slide belongs to so the slide is a section of its own (for its own tag, or to repeat just it).
 * Every arrangement that uses the song is renumbered so nothing goes missing. Returns the new section number of the slide.
 */
function splitAtSlide(song, hit, label) {
  const n = 1 + (hit.from > 0 ? 1 : 0) + (hit.to < hit.sec.lines.length ? 1 : 0);
  const body = core.setSlideLabel(song.body, hit.sec.lines, hit.from, hit.to, label, hit.sec.label, core.occurrenceOf(hit.parsed, hit.k));
  if (body === song.body) return null;
  if (n > 1) {
    const fix = x => { if (x && x.arrangement?.length) x.arrangement = core.expandArrangement(core.arrangementIndexes(hit.parsed, x.arrangement), hit.k, n); };
    fix(song);
    for (const it of db.setlist) if (it.songId === song.id) fix(it);
    for (const svc of db.plan?.services || []) for (const it of svc.items) if (it.songId === song.id) fix(it);
  }
  song.body = body; song.updatedAt = new Date().toISOString();
  return hit.k + (hit.from > 0 ? 1 : 0);
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
    const body = core.normalizeImported(s.body), order = s.arrangement ? null : core.autoArrangement(body);
    db.songs.push({ id: crypto.randomUUID(), ...s, body, ...(order ? { arrangement: order } : {}), createdAt: new Date().toISOString() });
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
    church: (({ id, name, city, logo, vision }) => ({ id, name, city, logo: logo || '', vision: vision || '' }))(activeChurch()),
    churches: db.churches.map(c => ({ id: c.id, name: c.name, city: c.city, locked: !!c.code })),
    setlist: db.setlist.map((it, i) => ({
      ...it,
      title: it.kind === 'song' ? (db.songs.find(s => s.id === it.songId)?.title ?? '(cântare ștearsă)') : it.title,
      rev: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.updatedAt || '' : undefined,   // lets screens notice a changed song
      track: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.track || '' : undefined,
      stems: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.stems || [] : undefined,
      cues: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.cues || [] : undefined,
      origBpm: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.bpm || 0 : undefined,
      beatOffset: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.beatOffset || 0 : undefined,
      origKey: it.kind === 'song' ? (s => s ? core.originalKey(s.key, s.body) : '')(db.songs.find(s => s.id === it.songId)) : undefined,
      slideCount: slidesFor(i).length,
    })),
    live: { ...live, slides: slidesFor(live.item), title: live.item === -2 ? live.bible?.title || '' : undefined },
    now: Date.now(),                                 // screens on other devices correct their clock with this
    // the planned programs of this church (titles and dates only — teams and phone numbers stay out)
    inbox: inboxList().length,                       // files waiting in 📥 Primite
    programs: (db.plan?.services || []).slice().sort((a, b) => a.date.localeCompare(b.date))
      .map(s => ({ id: s.id, title: s.title, date: s.date, count: s.items.length })),
  };
}

// --- WebSocket sync -----------------------------------------------------------
const server = http.createServer(handle);
const wss = new WebSocketServer({ server, path: '/ws' });
const sessions = new Map(); // ws -> { role }

// Slides that change by themselves (announcements before the service): seconds per slide, again from the start if "în buclă".
let autoTimer = null, autoKey = '';
function scheduleAuto() {
  const it = db.setlist[live.item], own = it?.slides?.length ? it.advance?.[live.slide] : 0;   // PowerPoint's own timing wins
  const secs = own ? own / 1000 : Number(it?.autoAdvance) || 0;
  const key = secs && !live.blank ? `${it.id}:${live.slide}:${secs}:${it.loop ? 1 : 0}` : '';
  if (key === autoKey) return;
  autoKey = key; clearTimeout(autoTimer);
  if (!key) return;
  autoTimer = setTimeout(() => {
    if (db.setlist[live.item] !== it) return;
    const n = slidesFor(live.item).length;
    if (live.slide + 1 < n) live.slide++;
    else if (it.loop && n > 1) live.slide = 0;
    else return;
    broadcast();
  }, secs * 1000);
  autoTimer.unref?.();
}
function broadcast() {
  trackSince(); scheduleAuto();
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
    try { handleMessage(ws, m); }
    catch (e) {                                       // one bad command must not stop the screens
      logError('comanda ' + m.type, e);
      try { ws.send(JSON.stringify({ type: 'error', error: 'Ceva n-a mers (' + m.type + '). Am notat eroarea în erori.log.' })); } catch {}
    }
  });
});

/** One command from a screen, a phone or the AI assistant. `ws` only needs send(); its role is in `sessions`. */
// --- Undo / redo (Ctrl+Z / ⌘Z): a copy of what can change, before each change ----------------
const UNDOABLE = new Set(['setStems', 'setCues', 'setTrack', 'setBpm', 'setKey', 'addItem', 'removeItem', 'moveItem', 'updateItem', 'deleteSong', 'service', 'saveSong', 'editSlide', 'slideSection',
  'tagSlides', 'autoLabel', 'cleanLibrary', 'duplicateSlide', 'removeSlide', 'slideStyle', 'itemDisplay', 'itemBackground', 'arrangement', 'display', 'openProgram', 'newProgram']);
const history = { undo: [], redo: [], church: null, last: { key: '', at: 0 } };
function takeSnapshot() {
  return {
    setlist: structuredClone(db.setlist), service: structuredClone(db.service), display: structuredClone(db.display),
    plan: structuredClone(db.plan?.services || []),
    songs: db.songs.map(x => ({ ...x, ...(x.arrangement ? { arrangement: [...x.arrangement] } : {}), ...(x.tags ? { tags: [...x.tags] } : {}) })),
    liveItemId: db.setlist[live.item]?.id || null, slide: live.slide,
  };
}
function restoreSnapshot(sn) {
  db.setlist = sn.setlist; db.service = sn.service; db.display = sn.display; db.songs = sn.songs;
  if (db.plan) db.plan.services = sn.plan;
  live.item = sn.liveItemId ? db.setlist.findIndex(x => x.id === sn.liveItemId) : -1;
  live.slide = live.item >= 0 ? clamp(sn.slide, 0, Math.max(0, slidesFor(live.item).length - 1)) : 0;
}
const UNDO_NAMES = { setStems: 'track-urile', setCues: 'cue-urile', setTrack: 'track-ul', setBpm: 'tempo-ul', setKey: 'schimbarea tonului', addItem: 'adăugarea în program', removeItem: 'scoaterea din program', moveItem: 'mutarea în program', updateItem: 'modificarea din program',
  deleteSong: 'ștergerea cântării', service: 'schimbarea serviciului', saveSong: 'salvarea cântării', editSlide: 'textul slide-ului', slideSection: 'eticheta',
  tagSlides: 'eticheta', autoLabel: 'etichetele automate', cleanLibrary: 'curățarea bibliotecii', duplicateSlide: 'repetarea slide-ului', removeSlide: 'ștergerea slide-ului', slideStyle: 'aspectul slide-ului', itemDisplay: 'aspectul cântării',
  itemBackground: 'fundalul cântării', arrangement: 'ordinea', display: 'aspectul', openProgram: 'schimbarea programului', newProgram: 'programul nou' };

function handleMessage(ws, m) {
    const reply = o => ws.send(JSON.stringify(o));
    if (history.church !== db.activeChurch) { history.undo = []; history.redo = []; history.church = db.activeChurch; }
    if ((m.type === 'undo' || m.type === 'redo') && need(ws, 'operator')) {
      const from = history[m.type], to = history[m.type === 'undo' ? 'redo' : 'undo'];
      const step = from.pop();
      if (!step) return reply({ type: 'undone', ok: false, what: m.type });
      to.push({ snap: takeSnapshot(), name: step.name });
      restoreSnapshot(step.snap); history.last = { key: '', at: 0 };
      save(); syncLiveToPlan(); broadcast();
      return reply({ type: 'undone', ok: true, what: m.type, name: step.name });
    }
    // one step per change; a slider moved continuously (same setting, within 1.5 s) is one step
    let before = null;
    if (UNDOABLE.has(m.type)) {
      const key = m.type + ':' + (m.screen || '') + ':' + Object.keys(m.patch || {}).join(',') + ':' + (m.item ?? '') + ':' + (m.slide ?? '');
      const merge = ['display', 'itemDisplay', 'slideStyle'].includes(m.type) && history.last.key === key && Date.now() - history.last.at < 1500;
      history.last = { key, at: Date.now() };
      if (!merge) before = takeSnapshot();
    }

    if (m.type === 'login') {
      const role = safeEq(m.pin, LEADER_PIN) && LEADER_PIN ? 'leader' : safeEq(m.pin, PIN) && PIN ? 'operator' : null;
      if (role) sessions.get(ws).role = role;
      return reply({ type: 'login', ok: !!role, role: sessions.get(ws).role });
    }
    if (!need(ws, 'operator')) return reply({ type: 'error', error: 'Nu ai drept de control. Introdu PIN-ul.' });

    switch (m.type) {
      case 'go': {                                   // go to item + slide
        const item = clamp(m.item ?? live.item, -1, db.setlist.length - 1);
        if (item !== live.item) { applyItemBackground(item); live.video = { ...live.video, cmd: 'play', at: Date.now() }; }
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
        else if (live.item !== -2) {                 // jump to neighbouring item (a passage from the Bible tab stays alone)
          const item = clamp(live.item + dir, 0, db.setlist.length - 1);
          if (item !== live.item) { applyItemBackground(item); live.item = item; live.slide = dir > 0 ? 0 : Math.max(0, slidesFor(item).length - 1); }
        }
        live.blank = false; live.logo = false;
        break;
      }
      case 'bible': {                                // show a passage now, without putting it in the program
        const ref = cleanRef(m.ref), versions = cleanVersions(m.versions);
        if (!ref || !versions.length) return reply({ type: 'error', error: 'Alege o traducere și un pasaj' });
        live.bible = { ref, versions, title: formatRef(ref, bible(versions[0]).lang) + ' · ' + versions.map(v => bible(v).short).join(' / ') };
        live.item = -2; live.slide = clamp(Number(m.slide) || 0, 0, Math.max(0, slidesFor(-2).length - 1));
        live.blank = false; live.logo = false;
        break;
      }
      case 'blank': live.blank = !live.blank; break;
      case 'resetTimer': live.since = live.item >= 0 ? Date.now() : 0; break;
      case 'logo': live.logo = !live.logo; break;
      case 'background': live.background = String(m.value || ''); break;
      case 'message':
        live.message = String(m.value || '').slice(0, 200);
        if (['both', 'main', 'stage'].includes(m.to)) live.messageTo = m.to;
        break;
      case 'noText': live.noText = typeof m.value === 'boolean' ? m.value : !live.noText; break;
      case 'clearAll': Object.assign(live, { noText: false, blank: false, logo: false, background: '', message: '', countdown: null }); break;
      case 'countdown': {                            // { minutes } or { at: "10:00" } or { off: true }
        if (m.off) { live.countdown = null; break; }
        let to = 0;
        if (Number(m.minutes) > 0) to = Date.now() + Math.min(600, Number(m.minutes)) * 60000;
        else if (/^\d{1,2}:\d{2}$/.test(m.at || '')) {
          const [h, mm] = m.at.split(':').map(Number), d = new Date(); d.setHours(h, mm, 0, 0);
          if (d < Date.now() - 60000) d.setDate(d.getDate() + 1);
          to = d.getTime();
        }
        if (!to) return reply({ type: 'error', error: 'Scrie minutele sau ora' });
        const bg = typeof m.bg === 'string' && (!m.bg || fs.existsSync(path.join(MEDIA_DIR, path.basename(m.bg)))) ? path.basename(m.bg) : '';
        live.countdown = { to, label: String(m.label ?? 'Începem în').slice(0, 60), screens: ['both', 'main', 'stage'].includes(m.screens) ? m.screens : 'both', bg };
        break;
      }
      case 'serviceTimer': {                         // the whole service: planned minutes, counting down from the first song
        if (m.cmd === 'reset') live.serviceStart = 0;
        else if (m.cmd === 'start') live.serviceStart = Date.now();
        if ('minutes' in m) {
          const n = Number(m.minutes);
          if (m.minutes === null || m.minutes === '' || !(n > 0)) delete db.service.timerMinutes;   // back to the sum of the program
          else db.service = { ...db.service, timerMinutes: Math.min(600, Math.round(n)) };
          save();
        }
        break;
      }
      case 'video': {                                // the video playing on the audience screen
        if (['play', 'pause', 'restart'].includes(m.cmd)) live.video = { ...live.video, cmd: m.cmd, at: Date.now() };
        if (typeof m.muted === 'boolean') live.video = { ...live.video, muted: m.muted };
        break;
      }
      case 'autoAdvance': {                          // a presentation that changes by itself
        const it = db.setlist[m.item]; if (!it) break;
        const secs = Math.round(Number(m.seconds) || 0);
        if (secs > 0) { it.autoAdvance = Math.min(600, Math.max(2, secs)); it.loop = !!m.loop; } else { delete it.autoAdvance; delete it.loop; }
        save(); break;
      }
      case 'arrangement': {                          // operators may change slide layout only
        const it = db.setlist[m.item]; if (!it) break;
        it.arrangement = Array.isArray(m.value) ? m.value.map(v => String(v).slice(0, 40)).slice(0, 60) : undefined;
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
        if (hit.sec.label === label) break;
        if (splitAtSlide(song, hit, label) === null) return reply({ type: 'error', error: 'Nu am găsit secțiunea în cântare. Schimb-o din Editor.' });
        save(); break;
      }
      case 'tagSlides': {                            // drop a tag on a slide; with cascade it also goes on the slides after it
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') break;
        const song = db.songs.find(x => x.id === it.songId); if (!song) break;
        const label = String(m.label || '').trim().slice(0, 30); if (!label) break;
        const hit = slideSource(it, song, m.slide); if (!hit) break;
        const old = hit.sec.label;
        // the slides after it that still have the same tag (or none) get the new tag too, until a different tag starts
        const next = [];
        if (m.cascade) {
          for (let j = Number(m.slide) + 1; ; j++) {
            const h = slideSource(it, song, j); if (!h) break;
            if (h.sec === hit.sec) continue;                       // rest of the same section
            if (h.sec.label !== old && h.sec.label !== '') break;
            if (old !== '' && h.sec.label === '') break;
            if (!next.includes(h.sec)) next.push(h.sec);
          }
        }
        const parsedBefore = hit.parsed;
        const nextLines = next.map(sec => ({ lines: sec.lines, occ: core.occurrenceOf(parsedBefore, parsedBefore.indexOf(sec)) }));
        if (old !== label || hit.from > 0) {
          const k = splitAtSlide(song, m.cascade ? { ...hit, to: hit.sec.lines.length } : hit, label);
          if (k === null) return reply({ type: 'error', error: 'Nu am găsit slide-ul în cântare.' });
        }
        for (const { lines, occ } of nextLines) song.body = core.setSectionLabel(song.body, lines, label, occ);
        song.updatedAt = new Date().toISOString();
        save(); break;
      }
      case 'autoLabel': {                            // name the sections by itself: chorus = what comes back, the rest verses
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') break;
        const song = db.songs.find(x => x.id === it.songId); if (!song) break;
        const before = core.parseSong(song.body).filter(sec => !sec.label).length;
        const body = core.stripRepeatMarks(core.autoLabel(core.labelStanzas(song.body)));   // site marks ("1.", "R:", "/: :/") become tags
        if (body !== song.body) { song.body = body; song.updatedAt = new Date().toISOString(); }
        if (!song.arrangement?.length) { const order = core.autoArrangement(song.body); if (order) song.arrangement = order; }
        save();
        reply({ type: 'autoLabeled', named: before, title: song.title });
        break;
      }
      case 'cleanLibrary': {                         // every song: site marks -> tags, no "/: :/", names for blocks, chorus after each verse
        if (!need(ws, 'leader')) return reply({ type: 'error', error: 'Doar liderul poate curăța toată biblioteca.' });
        try { fs.writeFileSync(path.join(DATA_DIR, `library.backup-${Date.now()}.json`), JSON.stringify(db)); } catch {}
        let changed = 0, ordered = 0;
        for (const song of db.songs) {
          const body = core.normalizeImported(song.body);
          if (body !== song.body) { song.body = body; song.updatedAt = new Date().toISOString(); changed++; }
          if (!song.arrangement?.length) { const order = core.autoArrangement(song.body); if (order) { song.arrangement = order; ordered++; } }
        }
        save(); reply({ type: 'cleaned', changed, ordered, total: db.songs.length });
        break;
      }
      case 'setStems': case 'setCues': {             // multitrack: the stems of a song and the moments where each slide starts
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') break;
        const song = db.songs.find(x => x.id === it.songId); if (!song) break;
        if (m.type === 'setStems') {
          song.stems = (Array.isArray(m.stems) ? m.stems : []).slice(0, 24).map(x => ({
            file: path.basename(String(x.file || '')), name: String(x.name || '').slice(0, 30),
            vol: Math.min(1.5, Math.max(0, Number(x.vol ?? 1))), muted: !!x.muted, pan: Math.min(1, Math.max(-1, Number(x.pan) || 0)),
          })).filter(x => x.file && fs.existsSync(path.join(MEDIA_DIR, x.file)));
        } else {
          song.cues = (Array.isArray(m.cues) ? m.cues : []).slice(0, 300)
            .map(c => ({ t: Math.max(0, Math.round(Number(c.t) * 100) / 100), slide: Math.max(0, Math.floor(Number(c.slide) || 0)), ...(c.mark ? { mark: true } : {}) }))
            .filter(c => Number.isFinite(c.t)).sort((a, b) => a.t - b.t);
          song.cueOrder = it.arrangement || song.arrangement || null;   // the order the cues were made with
        }
        song.updatedAt = new Date().toISOString();
        save(); break;
      }
      case 'setTrack': {                             // a backing track (audio file in the media folder) for the song
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') break;
        const song = db.songs.find(x => x.id === it.songId); if (!song) break;
        const name = path.basename(String(m.track || ''));
        if (name && !fs.existsSync(path.join(MEDIA_DIR, name))) return reply({ type: 'error', error: 'Fișierul nu există' });
        song.track = name || undefined; song.updatedAt = new Date().toISOString();
        save(); break;
      }
      case 'setBpm': {                               // tempo for this program (the library keeps its own)
        const it = db.setlist[m.item]; if (!it) break;
        const song = it.kind === 'song' && db.songs.find(x => x.id === it.songId);
        if ('offset' in m && song) song.beatOffset = Math.max(0, Math.round(Number(m.offset) * 1000) / 1000) || 0;   // where the first beat falls in the tracks
        if ('bpm' in m) {
          const b = Math.round(Number(m.bpm));
          if (song && !song.bpm && b >= 30 && b <= 300) { song.bpm = b; it.bpm = undefined; }   // the first tempo given is the song's own
          else it.bpm = b >= 30 && b <= 300 && b !== song?.bpm ? b : undefined;
        }
        save(); break;
      }
      case 'setKey': {                               // key for this program; chords on the stage follow it
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') break;
        const k = String(m.key || '').trim();
        if (k && !core.KEYS.includes(k)) return reply({ type: 'error', error: 'Ton necunoscut: ' + k });
        it.key = k;
        save(); break;
      }
      case 'removeSlide': {                          // take one slide out of this program (the song in the library stays whole)
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') break;
        const song = db.songs.find(x => x.id === it.songId); if (!song) break;
        let hit = slideSource(it, song, m.slide); if (!hit) break;
        if (!(hit.from === 0 && hit.to === hit.sec.lines.length)) {      // part of a longer section: make it its own section first
          if (splitAtSlide(song, hit, hit.sec.label) === null) return reply({ type: 'error', error: 'Nu am putut scoate slide-ul.' });
          hit = slideSource(it, song, m.slide);
        }
        const order = core.arrangementIndexes(core.parseSong(song.body), it.arrangement || song.arrangement);
        order.splice(hit.pos, 1);
        it.arrangement = order;
        if (it.slideStyles) {
          const st = {};
          for (const [i, v] of Object.entries(it.slideStyles)) if (+i !== m.slide) st[+i > m.slide ? +i - 1 : i] = v;
          it.slideStyles = st;
        }
        if (live.item === m.item && live.slide >= slidesFor(m.item).length) live.slide = Math.max(0, slidesFor(m.item).length - 1);
        save(); break;
      }
      case 'duplicateSlide': {                       // play this slide once more, right after itself (only in this program)
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') break;
        const song = db.songs.find(x => x.id === it.songId); if (!song) break;
        let hit = slideSource(it, song, m.slide); if (!hit) break;
        let k = hit.k;
        const whole = hit.from === 0 && hit.to === hit.sec.lines.length;
        if (!whole) {                                // part of a longer section: make it a section of its own first
          k = splitAtSlide(song, hit, hit.sec.label);
          if (k === null) return reply({ type: 'error', error: 'Nu am putut copia slide-ul. Încearcă din Editor.' });
          hit = slideSource(it, song, m.slide);
        }
        const order = core.arrangementIndexes(core.parseSong(song.body), it.arrangement || song.arrangement);
        order.splice(hit.pos + 1, 0, '#' + k);
        it.arrangement = order;
        if (it.slideStyles) {                        // looks set on later slides move one place down; the copy gets the same look
          const st = {};
          for (const [i, v] of Object.entries(it.slideStyles)) st[+i > m.slide ? +i + 1 : i] = v;
          if (it.slideStyles[m.slide]) st[m.slide + 1] = it.slideStyles[m.slide];
          it.slideStyles = st;
        }
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
        const bpm = Math.round(Number(s.bpm ?? meta.tempo)); 
        const data = { title: String(s.title).trim(), author: s.author || '', key: s.key || meta.key || '', body, source: s.source || '',
          ...(bpm >= 30 && bpm <= 300 ? { bpm } : 'bpm' in s ? { bpm: undefined } : {}),
          ...(tags ? { tags } : {}), updatedAt: new Date().toISOString() };
        if (existing) Object.assign(existing, data);
        else {
          const order = core.autoArrangement(data.body);                 // chorus written once: sing it after every verse
          const created = { id: crypto.randomUUID(), ...data, ...(order ? { arrangement: order } : {}), createdAt: new Date().toISOString() };
          db.songs.push(created);
          if (m.addToProgram && need(ws, 'leader')) db.setlist.push({ id: crypto.randomUUID(), kind: 'song', songId: created.id, title: '', key: created.key || '', minutes: 5, notes: [] });
        }
        save(); break;
      }
      // --- leader only: the service order ---
      case 'churchProfile': {                        // the team's logo and vision, shown in Planificare and on the screens
        if (!need(ws, 'leader')) return reply({ type: 'error', error: 'Doar liderul poate schimba viziunea și logo-ul.' });
        const c = activeChurch();
        if (typeof m.vision === 'string') c.vision = m.vision.trim().slice(0, 2000);
        if (typeof m.logo === 'string') {
          const f = path.basename(m.logo);
          if (f && !(/^logo-echipa-/.test(f) && fs.existsSync(path.join(MEDIA_DIR, f)))) return reply({ type: 'error', error: 'Logo-ul nu s-a încărcat' });
          c.logo = f;
        }
        save(); break;
      }
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
        Object.assign(live, { item: -1, slide: 0, blank: false, logo: false, serviceStart: 0 });
        save(); break;
      }
      case 'addItem': case 'removeItem': case 'moveItem': case 'updateItem': case 'deleteSong': case 'service': {
        if (!need(ws, 'leader')) return reply({ type: 'error', error: 'Doar liderul poate schimba programul.' });
        if (m.type === 'addItem') {
          const kind = ['song', 'sermon', 'prayer', 'announcement', 'other', 'media', 'bible'].includes(m.kind) ? m.kind : 'other';
          const item = m.item && typeof m.item === 'object'                                 // undo of a removal
            ? { notes: [], ...pick(m.item, ['id', 'kind', 'songId', 'title', 'key', 'minutes', 'leader', 'arrangement', 'maxLines', 'background', 'display', 'slideStyles', 'notes', 'slides', 'ref', 'versions', 'autoAdvance', 'loop']), id: m.item.id || crypto.randomUUID() }
            : { id: crypto.randomUUID(), kind, songId: m.songId, title: m.title || '', key: m.key || '', minutes: Number(m.minutes) || 5, notes: [],
                ...(kind === 'media' ? { slides: mediaSlides(m.slides), ...cleanFx(m) } : {}),
                ...(kind === 'bible' ? { ref: cleanRef(m.ref), versions: cleanVersions(m.versions) } : {}) };
          if (kind === 'bible' && (!item.ref || !item.versions.length)) return reply({ type: 'error', error: 'Pasaj sau traducere greșită' });
          if (kind === 'bible' && !item.title) item.title = formatRef(item.ref, bible(item.versions[0]).lang);
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
          const it = db.setlist[m.item];
          if (Array.isArray(m.patch?.slides) && it.kind !== 'song' && it.kind !== 'bible') {   // a presentation attached to this moment
            delete it.transitions; delete it.advance;
            Object.assign(it, { slides: mediaSlides(m.patch.slides), ...cleanFx(m.patch) });
          }
        }
        if (m.type === 'deleteSong') db.songs = db.songs.filter(s => s.id !== m.id);
        if (m.type === 'service') db.service = { ...db.service, ...pick(m.value, ['title', 'startsAt']) };
        save(); break;
      }
      default: return;
    }
    if (before) { history.undo.push({ snap: before, name: UNDO_NAMES[m.type] || '' }); if (history.undo.length > 60) history.undo.shift(); history.redo = []; }
    syncLiveToPlan();
    broadcast();
}

/** A change made in Planning to the program that is on Live shows up in Live too. */
/** Every song with: times sung in the last `days` days, the last time, the next planned time. */
export function songUsage(days = 90, allChurches = false) {
  const now = Date.now(), from = now - days * 86400_000;
  const plans = [{ church: activeChurch().id, services: db.plan?.services || [] }];
  if (allChurches) for (const [id, d] of Object.entries(db.churchData || {})) if (d?.plan?.services) plans.push({ church: id, services: d.plan.services });
  const use = new Map();
  for (const { church, services } of plans) for (const svc of services) {
    const t = Date.parse(svc.date); if (!Number.isFinite(t)) continue;
    for (const songId of new Set((svc.items || []).filter(i => i.kind === 'song' && i.songId).map(i => i.songId))) {
      const u = use.get(songId) || { count: 0, total: 0, last: 0, next: 0, churches: new Set() };
      if (t <= now) { u.total++; if (t >= from) { u.count++; u.churches.add(church); } if (t > u.last) u.last = t; }
      else if (!u.next || t < u.next) u.next = t;
      use.set(songId, u);
    }
  }
  return db.songs.map(x => { const u = use.get(x.id) || {};
    return { id: x.id, title: x.title, key: x.key || '', tags: x.tags || [], count: u.count || 0, total: u.total || 0, last: u.last || 0, next: u.next || 0, churches: u.churches?.size || 0 }; });
}

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
const mediaList = () => fs.readdirSync(MEDIA_DIR).filter(f => /^(image|video)\//.test(TYPES[path.extname(f).toLowerCase()] || '') && !f.startsWith('.') && f !== 'logo.png');

// --- AI assistant -------------------------------------------------------------------
const AI_FILE = path.join(DATA_DIR, 'ai.json');
let aiSettings = { provider: 'auto', claudeModel: 'claude-sonnet-5-5', ollamaUrl: 'http://localhost:11434', ollamaModel: 'qwen2.5:7b', ollamaVisionModel: 'qwen2.5vl:7b' };
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
  usage: (days, tag) => songUsage(days || 60).filter(u => !tag || u.tags.some(t => t.toLowerCase() === String(tag).toLowerCase())),
  structure(i) { return songStructure(db.setlist[i]); },
};
function songStructure(it) {                         // sections, order and tracks of a song in a program
    if (!it || it.kind !== 'song') return { error: 'La poziția aceasta nu e o cântare' };
    const song = db.songs.find(s => s.id === it.songId); if (!song) return { error: 'Cântarea nu mai e în bibliotecă' };
    const parsed = core.parseSong(song.body);
    const sections = parsed.filter(x => x.label).map(x => ({ label: x.label, first_line: core.stripChords(x.lines[0] || '').slice(0, 60) }));
    const order = core.arrangementIndexes(parsed, it.arrangement || song.arrangement).map(t => parsed[+t.slice(1)]?.label || '');
    return { title: song.title, key: it.key || song.key || '', sections, order, stems: (song.stems || []).map(x => ({ ...x })) };
}
/** The assistant working on a planned service (Planificare) instead of the program on the screens. */
export function planHub(serviceId) {
  const svc = () => db.plan.services.find(x => x.id === serviceId);
  const commit = items => { const s = svc(); applyPlanOp(db.plan, { op: 'setItems', id: s.id, items }); planToLive(); save(); broadcast();
    const msg = JSON.stringify({ type: 'planChanged' }); for (const ws of wss.clients) if (ws.readyState === 1) ws.send(msg); };
  return {
    ...aiHub,
    state() {
      const s = svc(); if (!s) return { error: 'Serviciul nu mai există' };
      return { where: 'Planificare (serviciul ales, nu ecranele)', church: activeChurch().name, service: { title: s.title, date: s.date, status: s.status },
        program: s.items.map((it, i) => ({ position: i + 1, kind: it.kind, title: it.kind === 'song' ? db.songs.find(x => x.id === it.songId)?.title : it.title,
          key: it.key || '', minutes: it.minutes, leader: it.leader || '', arrangement: it.arrangement, slides: it.slides?.length || 0 })),
        team: serviceWarnings(db.plan, s) };
    },
    run(m) {
      const s = svc(); if (!s) return 'Serviciul nu mai există';
      const items = s.items.map(x => ({ ...x })), at = n => Number.isInteger(n) && items[n] ? items[n] : null;
      switch (m.type) {
        case 'addItem': {
          const it = m.kind === 'song' ? { kind: 'song', songId: m.songId, key: m.key || '', minutes: m.minutes || 5 } : { kind: m.kind, title: m.title || '', minutes: m.minutes || 5 };
          items.splice(Number.isInteger(m.at) ? m.at : items.length, 0, it); break;
        }
        case 'removeItem': if (!at(m.item)) return 'Nu există poziția'; items.splice(m.item, 1); break;
        case 'moveItem': { if (!at(m.item)) return 'Nu există poziția'; const to = Math.max(0, Math.min(items.length - 1, m.to)); const [x] = items.splice(m.item, 1); items.splice(to, 0, x); break; }
        case 'updateItem': if (!at(m.item)) return 'Nu există poziția'; for (const k of ['title', 'key', 'minutes', 'leader']) if (k in (m.patch || {})) items[m.item][k] = m.patch[k]; break;
        case 'setKey': if (!at(m.item)) return 'Nu există poziția'; items[m.item].key = m.key; break;
        case 'arrangement': if (!at(m.item)) return 'Nu există poziția'; if (Array.isArray(m.value)) items[m.item].arrangement = m.value; else delete items[m.item].arrangement; break;
        case 'setStems': { const it = at(m.item); const song = it && db.songs.find(x => x.id === it.songId); if (!song) return 'Nu e o cântare';
          song.stems = m.stems.map(x => ({ file: x.file, name: x.name, vol: Math.min(1.5, Math.max(0, +x.vol)), muted: !!x.muted, pan: +x.pan || 0 })); save(); return null; }
        case 'service': { const v = m.value || {}; if (v.title) s.title = String(v.title).slice(0, 120); if (v.startsAt) s.date = v.startsAt; save(); broadcast(); return null; }
        case 'saveSong': return aiHub.run(m);
        default: return 'Asta se face în Live, nu în Planificare';
      }
      commit(items); return null;
    },
    structure: i => songStructure(svc()?.items[i]),
  };
}

// --- Add chords from resursecrestine.ro (runs in the background) ---------------------
// --- Planning Center (read only): songs with chords and upcoming plans ------------------------
const PCO_FILE = path.join(DATA_DIR, 'planningcenter.json');      // the token stays on this computer
// one Planning Center account per church (a leader can serve in two churches with two accounts)
let pcoAll = { byChurch: {} };
try {
  const f = JSON.parse(fs.readFileSync(PCO_FILE, 'utf8'));
  pcoAll = f.byChurch ? f : { byChurch: { [db.activeChurch]: f } };          // the old single account belongs to the church that was open
} catch {}
const pcoS = () => (pcoAll.byChurch[db.activeChurch] ||= { appId: '', secret: '', typeIds: [] });
const savePco = () => fs.writeFileSync(PCO_FILE, JSON.stringify(pcoAll, null, 2), { mode: 0o600 });
// songs remember which account they came from, so a second account never overwrites the first one's versions
const pcoAccount = () => pcoS().appId ? crypto.createHash('sha256').update(pcoS().appId).digest('hex').slice(0, 10) : '';
const pcoPublic = () => ({ church: activeChurch().name, connected: !!(pcoS().appId && pcoS().secret), appIdHint: pcoS().appId ? pcoS().appId.slice(0, 6) + '…' : '',
  typeIds: pcoS().typeIds, lastImport: pcoS().lastImport || null });
const pcoJob = { running: false };
function pcoEvent(o) {
  const msg = JSON.stringify({ type: 'pco', ...o });
  for (const ws of wss.clients) if (ws.readyState === 1) ws.send(msg);
}
const foldTitle = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Put Planning Center songs into the library: new ones are added, existing ones only get chords if they had none. */
export function mergePcoSongs(list, { prefer = false, account = '' } = {}) {
  let added = 0, chords = 0, skipped = 0, replaced = 0;
  for (const x of list) {
    const body = core.normalizeImported(x.body || '');
    if (!x.title || !body.trim()) { skipped++; continue; }
    const have = db.songs.find(s => s.pcoId === x.pcoId) || db.songs.find(s => foldTitle(s.title) === foldTitle(x.title));
    if (have) {
      const other = have.pcoAccount && account && have.pcoAccount !== account;     // the same song, already brought from another account
      if (!other) { have.pcoId = x.pcoId; if (account) have.pcoAccount = account; }
      // "Planning Center has the right version": its words, chords, key and order replace ours (ours stays in song.before)
      if (prefer && !other && core.hasChords(body) && body.trim() !== have.body.trim()) {
        have.before = { body: have.body, key: have.key || '', arrangement: have.arrangement, savedAt: new Date().toISOString() };
        have.body = body; have.key = x.key || core.readMeta(body).key || have.key || '';
        if (x.bpm >= 30 && x.bpm <= 300) have.bpm = Math.round(x.bpm);
        const labels = core.parseSong(body).map(sec => sec.label.toLowerCase());
        const order = (x.sequence || []).map(l => String(l)).filter(l => labels.includes(l.toLowerCase()));
        const arr = order.length >= 2 ? order : core.autoArrangement(body);
        if (arr) have.arrangement = arr; else delete have.arrangement;
        have.source = 'planningcenter'; have.updatedAt = new Date().toISOString(); replaced++;
        continue;
      }
      if (!core.hasChords(have.body) && core.hasChords(body)) {
        const r = core.applyChords(have.body, body);
        if (r.match >= 0.6) { have.body = r.body; have.key ||= x.key || core.guessKey(r.body) || ''; have.updatedAt = new Date().toISOString(); chords++; }
      }
      continue;
    }
    const labels = core.parseSong(body).map(sec => sec.label.toLowerCase());
    const order = (x.sequence || []).map(l => String(l)).filter(l => labels.includes(l.toLowerCase()));
    db.songs.push({ id: crypto.randomUUID(), title: x.title.slice(0, 120), author: x.author || '', key: x.key || core.readMeta(body).key || '', body, ...(account ? { pcoAccount: account } : {}),
      ...(x.bpm >= 30 && x.bpm <= 300 ? { bpm: Math.round(x.bpm) } : {}),
      source: 'planningcenter', pcoId: x.pcoId, ccli: x.ccli || '', ...(order.length >= 2 ? { arrangement: order } : core.autoArrangement(body) ? { arrangement: core.autoArrangement(body) } : {}),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    added++;
  }
  return { added, chords, skipped, replaced };
}

/** Planning Center plans become programs of the selected church (the teams stay as they are in Betleem). */
export function mergePcoPlans(plans) {
  let added = 0, updated = 0;
  for (const p of plans) {
    if (!p.date) continue;
    let svc = db.plan.services.find(s => s.pcoId === p.pcoId);
    if (!svc) { svc = { id: crypto.randomUUID(), status: 'draft', items: [], assignments: {}, pcoId: p.pcoId }; db.plan.services.push(svc); added++; } else updated++;
    svc.title = String(p.title).slice(0, 80); svc.date = new Date(p.date).toISOString();
    svc.items = p.items.map(it => {
      const song = it.type === 'song' && db.songs.find(s => s.pcoId === it.songId);
      const minutes = Math.max(1, Math.round(it.seconds / 60)) || 5;
      return song ? { id: crypto.randomUUID(), kind: 'song', songId: song.id, key: it.key || '', minutes: it.seconds ? minutes : 5, title: '' }
        : { id: crypto.randomUUID(), kind: it.type === 'song' ? 'other' : pco.itemKind(it.title), title: it.title.slice(0, 80), minutes: it.seconds ? minutes : 5 };
    });
  }
  db.plan.services.sort((a, b) => a.date.localeCompare(b.date));
  return { added, updated };
}

async function runPcoImport({ songs, plans, only = null, openId = null, prefer = false }) {
  Object.assign(pcoJob, { running: true });
  const res = {};
  try {
    if (songs) {
      const list = await pco.fetchSongs(pcoS(), { onProgress: e => pcoEvent({ running: true, step: 'cântări', ...e }) });
      Object.assign(res, mergePcoSongs(list, { prefer, account: pcoAccount() })); save();
    }
    if (plans) {
      pcoEvent({ running: true, step: 'programe', done: 0, total: 0 });
      const list = await pco.fetchPlans(pcoS(), pcoS().typeIds || [], { only });
      // songs used in these plans but not imported yet come along too
      const missing = [...new Set(list.flatMap(p => p.items.filter(i => i.type === 'song' && i.songId && !db.songs.some(s => s.pcoId === i.songId)).map(i => i.songId)))];
      if (missing.length) {
        const extra = [];
        for (const id of missing) extra.push(...(await pco.fetchSongs(pcoS(), { onlyIds: [id] }).catch(() => [])));
        mergePcoSongs(extra, { prefer, account: pcoAccount() });
      }
      Object.assign(res, { plans: mergePcoPlans(list) });
      const open = openId && db.plan.services.find(x => x.pcoId === openId);
      if (open) {                                    // straight into Live
        db.setlist = open.items.map(it => ({ ...structuredClone(it), notes: [] }));
        db.service = { title: open.title, startsAt: open.date, planId: open.id };
        Object.assign(live, { item: -1, slide: 0, blank: false, logo: false });
        res.opened = open.title;
      }
      save();
    }
    pcoS().lastImport = new Date().toISOString(); savePco();
    pcoEvent({ finished: true, ...res }); broadcast();
    const msg = JSON.stringify({ type: 'planChanged' });
    for (const ws of wss.clients) if (ws.readyState === 1) ws.send(msg);
  } catch (e) { pcoEvent({ finished: true, error: e.message }); }
  finally { pcoJob.running = false; }
}

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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.pdf': 'application/pdf', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8', '.webm': 'video/webm', '.mov': 'video/quicktime', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.aac': 'audio/aac' };
const MEDIA_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.mov', '.mp3', '.wav', '.m4a', '.ogg', '.aac'];   // what may be uploaded
const SHOW_EXT = ['.pptx', '.ppt', '.key', '.odp', '.pps', '.ppsx'];                  // presentations turned into PDF by LibreOffice
/** PowerPoint's transition and timing for each page: { type, dir, dur } and milliseconds. */
const FX = ['fade', 'push', 'wipe', 'cover', 'uncover', 'split', 'zoom', 'cut'];
function cleanFx(m) {
  const n = Array.isArray(m.slides) ? m.slides.length : 0, out = {};
  if (Array.isArray(m.transitions) && m.transitions.length === n) out.transitions = m.transitions.map(t => t && FX.includes(t.type)
    ? { type: t.type, dir: /^(l|r|u|d|in|out)$/.test(t.dir) ? t.dir : '', dur: Math.min(5000, Math.max(0, Math.round(+t.dur || 700))) } : null);
  if (Array.isArray(m.advance) && m.advance.length === n) out.advance = m.advance.map(a => Number(a) > 0 ? Math.min(600000, Math.max(500, Math.round(+a))) : null);
  return out;
}
/** Only pictures and videos from our own media folder can be slides. */
function mediaSlides(list) {
  return (Array.isArray(list) ? list : []).slice(0, 400).map(x => String(x))
    .filter(x => /^\/media\/[^/]+$/.test(x) && ['.png', '.jpg', '.jpeg', '.webp', '.mp4', '.webm', '.mov'].includes(path.extname(x).toLowerCase()));
}
/** LibreOffice, if this computer has it: it opens PowerPoint, Keynote and Impress files exactly. */
function findOffice() {
  const c = ['/Applications/LibreOffice.app/Contents/MacOS/soffice', 'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe', '/usr/bin/soffice', '/usr/local/bin/soffice', '/opt/homebrew/bin/soffice'];
  return c.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}
// --- Fonts a presentation needs and this computer lacks: downloaded once from Google Fonts (free), kept in Documente/Betleem/fonts.
// Microsoft fonts are not free; their look-alikes with the same letter widths are used instead (Calibri → Carlito …).
const FONTS_DIR = path.join(DATA_DIR, 'fonts');
const LO_PROFILE = path.join(DATA_DIR, 'libreoffice');
const COMMON_FONTS = ['arial', 'helvetica', 'helvetica neue', 'times new roman', 'times', 'georgia', 'verdana', 'courier new', 'tahoma', 'trebuchet ms', 'impact', 'segoe ui', 'symbol', 'wingdings', 'webdings'];
const LOOKALIKE = { calibri: 'Carlito', 'calibri light': 'Carlito', cambria: 'Caladea', 'century gothic': 'Didact Gothic', 'gill sans': 'Lato', 'gill sans mt': 'Lato', 'franklin gothic': 'Libre Franklin',
  'franklin gothic medium': 'Libre Franklin', garamond: 'EB Garamond', 'book antiqua': 'Crimson Text', 'segoe print': 'Patrick Hand', 'comic sans ms': 'Comic Neue', 'avenir': 'Nunito Sans', 'avenir next': 'Nunito Sans', 'futura': 'Jost', 'myriad pro': 'PT Sans', 'proxima nova': 'Montserrat', 'sf pro': 'Inter', 'sf pro display': 'Inter' };
const fontSlug = f => f.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function fontIndex() { try { return JSON.parse(fs.readFileSync(path.join(FONTS_DIR, 'fonts.json'), 'utf8')); } catch { return {}; } }
function writeFontCss(idx) {
  const css = Object.entries(idx).flatMap(([family, f]) => (f.files || []).map(x =>
    `@font-face{font-family:"${family.replace(/"/g, '')}";src:url(/userfonts/${x.file}) format("truetype");font-weight:${x.weight};font-style:${x.style};font-display:swap}`)).join('\n');
  fs.writeFileSync(path.join(FONTS_DIR, 'fonts.css'), css);
  fs.writeFileSync(path.join(FONTS_DIR, 'fonts.json'), JSON.stringify(idx, null, 1));
  // LibreOffice reads the fonts in its profile: copy them there, so converted presentations look right too
  const lo = path.join(LO_PROFILE, 'user', 'fonts'); fs.mkdirSync(lo, { recursive: true });
  for (const f of Object.values(idx)) for (const x of f.files || []) { const d = path.join(lo, x.file); if (!fs.existsSync(d)) fs.copyFileSync(path.join(FONTS_DIR, x.file), d); }
}
async function ensureFonts(families) {
  fs.mkdirSync(FONTS_DIR, { recursive: true });
  const idx = fontIndex(), got = [], missing = [];
  for (const family of [...new Set(families.map(f => String(f).trim()).filter(Boolean))].slice(0, 20)) {
    const key = family.toLowerCase();
    if (COMMON_FONTS.includes(key)) continue;
    if (idx[family]?.files?.length) { got.push(family); continue; }
    if (idx[family]?.missing && Date.now() - idx[family].missing < 7 * 864e5) { missing.push(family); continue; }
    const source = LOOKALIKE[key] || family;
    try {
      // without a browser name Google gives plain .ttf files, which both the browser and LibreOffice read
      const css = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(source).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700`).then(r => r.ok ? r.text() : '');
      const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(m => ({
        style: /font-style:\s*italic/.test(m[1]) ? 'italic' : 'normal', weight: (m[1].match(/font-weight:\s*(\d+)/) || [])[1] || '400',
        url: (m[1].match(/url\((https:[^)]+)\)/) || [])[1] })).filter(x => x.url);
      if (!faces.length) { idx[family] = { missing: Date.now() }; missing.push(family); continue; }
      const files = [];
      for (const x of faces) {
        const file = `${fontSlug(family)}-${x.weight}${x.style === 'italic' ? 'i' : ''}.ttf`;
        const buf = Buffer.from(await fetch(x.url).then(r => r.arrayBuffer()));
        if (buf.length < 1000) continue;
        fs.writeFileSync(path.join(FONTS_DIR, file), buf); files.push({ file, weight: x.weight, style: x.style });
      }
      idx[family] = { source, files }; got.push(family);
    } catch { missing.push(family); }                      // offline: next time
  }
  writeFontCss(idx);
  return { css: '/userfonts/fonts.css?v=' + Date.now(), got, missing };
}

// Keynote (on every Mac) or PowerPoint draw the slides exactly as they look there; LibreOffice is next; our own drawing is the last resort.
const KEYNOTE_SCRIPT = `on run argv
  set inF to POSIX file (item 1 of argv)
  set outF to POSIX file (item 2 of argv)
  tell application "Keynote"
    set wasOpen to running
    set d to open inF
    try
      export d to outF as PDF with properties {PDF image quality:Best, skipped slides:false}
    on error
      export d to outF as PDF
    end try
    close d saving no
  end tell
end run`;
const PPT_SCRIPT = `param($in, $out)
$app = New-Object -ComObject PowerPoint.Application
$p = $app.Presentations.Open($in, $true, $false, $false)
$p.SaveAs($out, 32)
$p.Close()
if ($app.Presentations.Count -eq 0) { $app.Quit() }`;
async function nativePdf(file) {
  const { execFile } = await import('node:child_process');
  const work = path.join(DATA_DIR, 'conversie'); fs.mkdirSync(work, { recursive: true });
  const out = path.join(work, 'p-' + Date.now().toString(36) + '.pdf');
  const run = (cmd, args) => new Promise((ok, no) => execFile(cmd, args, { timeout: 240000, windowsHide: true }, e => e ? no(e) : ok()));
  try {
    if (process.platform === 'darwin' && fs.existsSync('/Applications/Keynote.app')) {
      // Keynote is sandboxed: give it a copy inside Documente/Betleem
      const src = path.join(work, 'p-' + Date.now().toString(36) + path.extname(file));
      fs.copyFileSync(file, src);
      try { await run('osascript', ['-e', KEYNOTE_SCRIPT, src, out]); } finally { fs.rmSync(src, { force: true }); }
    } else if (process.platform === 'win32') {
      const ps1 = path.join(work, 'ppt-pdf.ps1'); fs.writeFileSync(ps1, PPT_SCRIPT);
      await run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, path.resolve(file), out]);
    } else return null;
    return fs.existsSync(out) && fs.statSync(out).size > 0 ? out : null;
  } catch (e) { logError('convert', e); fs.rmSync(out, { force: true }); return null; }
}
async function toPdf(file) {
  if (/\.(pptx?|ppsx?|key|odp)$/i.test(file) && process.env.NATIVE_OFFICE !== '0') { const pdf = await nativePdf(file); if (pdf) return pdf; }
  const office = findOffice(); if (!office) return null;
  const { execFile } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'betleem-pdf-'));
  fs.mkdirSync(LO_PROFILE, { recursive: true });
  await new Promise((ok, no) => execFile(office, [`-env:UserInstallation=${pathToFileURL(LO_PROFILE).href}`, '--headless', '--convert-to', 'pdf', '--outdir', out, file], { timeout: 240000 }, e => e ? no(e) : ok()));
  const pdf = fs.readdirSync(out).find(f => f.endsWith('.pdf'));
  return pdf ? path.join(out, pdf) : null;
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p === '/core/song.js') return send(res, 200, CORE_JS, TYPES['.js']);
    if (p === '/api/songs' && req.method === 'GET') {
      const list = searchSongs(url.searchParams.get('q'), url.searchParams.get('tag'));
      return json(res, 200, list);
    }
    // 💡 feedback from the people who use the app → a development proposal, kept in Documente/Betleem/propuneri
    if (p === '/api/feedback') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const FB = path.join(DATA_DIR, 'propuneri.json');
      const all = (() => { try { return JSON.parse(fs.readFileSync(FB, 'utf8')); } catch { return []; } })();
      const write = () => {
        fs.writeFileSync(FB, JSON.stringify(all, null, 1));
        const md = ['# Propuneri pentru Echipa Betleem', '', ...all.map(f => `## ${f.status === 'facut' ? '✓' : f.status === 'de-facut' ? '→' : '•'} ${f.date.slice(0, 16).replace('T', ' ')} · ${f.where}\n**Părerea:** ${f.text}\n\n${f.proposal || ''}\n`)].join('\n');
        fs.writeFileSync(path.join(DATA_DIR, 'propuneri.md'), md);                  // easy to read, or to send to whoever develops the app
      };
      if (req.method === 'GET') return json(res, 200, all.slice().reverse());
      const v = JSON.parse(await body(req, 50_000));
      if (v.id && v.status) { const f = all.find(x => x.id === v.id); if (f && ['noua', 'de-facut', 'facut', 'nu'].includes(v.status)) { f.status = v.status; write(); } return json(res, 200, { ok: true }); }
      const text = String(v.text || '').trim().slice(0, 4000); if (!text) return json(res, 400, { error: 'Scrie părerea' });
      const where = String(v.where || '').slice(0, 120);
      let proposal = '', error = '';
      try { proposal = await feedbackProposal(aiSettings, text, where); } catch (e) { error = e.message; }
      const f = { id: crypto.randomUUID(), date: new Date().toISOString(), where, text, proposal, status: 'noua', version: VERSION, church: activeChurch().name };
      all.push(f); write();
      return json(res, 200, { ...f, error });
    }
    if (p === '/api/songs/usage' && req.method === 'GET') {   // how often each song was sung lately (from the planned services)
      const days = Math.min(3650, Math.max(7, Number(url.searchParams.get('days')) || 90));
      const all = url.searchParams.get('scope') === 'all';
      return json(res, 200, songUsage(days, all));
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
        if (op.op === 'songTags') {                     // categories: one song, or one tag added / removed on many
          const clean = t => String(t || '').trim().replace(/^#/, '').slice(0, 30);
          const ids = Array.isArray(op.songIds) ? op.songIds : [op.songId];
          for (const id of ids.slice(0, 1000)) {
            const song = db.songs.find(x => x.id === id); if (!song) continue;
            let tags = Array.isArray(op.tags) ? op.tags.map(clean) : [...(song.tags || [])];
            if (op.add) tags.push(clean(op.add));
            if (op.remove) tags = tags.filter(t => t.toLowerCase() !== clean(op.remove).toLowerCase());
            tags = [...new Map(tags.filter(Boolean).map(t => [t.toLowerCase(), t])).values()].slice(0, 12);
            if (tags.length) song.tags = tags; else delete song.tags;
            song.updatedAt = new Date().toISOString();
          }
          save(); broadcast();
        } else if (op.op === 'renameSong') {                   // the name of a song, fixed from the program
          const song = db.songs.find(x => x.id === op.songId), t = String(op.title || '').trim().slice(0, 120);
          if (!song || !t) return json(res, 400, { error: 'Cântarea nu există' });
          song.title = t; song.updatedAt = new Date().toISOString(); save(); broadcast();
        } else if (op.op === 'goLive') {                       // make this service the program on the screens
          const s = db.plan.services.find(x => x.id === op.id); if (!s) return json(res, 404, { error: 'Serviciul nu există' });
          db.setlist = s.items.map(it => ({ ...structuredClone(it), notes: [] }));
          db.service = { title: s.title, startsAt: s.date, planId: s.id };
          Object.assign(live, { item: -1, slide: 0, blank: false, logo: false, serviceStart: 0 });
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
    if (p.startsWith('/api/canva/')) {                   // Canva: the leader connects once, then operators bring designs in
      if (p === '/api/canva/callback') {                 // Canva sends the browser back here after "Allow"
        if (!isLocal(req.socket.remoteAddress)) return send(res, 403, 'Doar pe acest calculator');
        let msg = 'Canva e conectat. Poți închide această pagină și te întorci în Echipa Betleem.';
        try { if (url.searchParams.get('error')) throw new Error('Ai refuzat accesul în Canva.'); await canva.callback(url.searchParams.get('state'), url.searchParams.get('code')); }
        catch (e) { msg = e.message; }
        broadcastCanva();
        return send(res, 200, `<!doctype html><meta charset="utf-8"><title>Canva</title><body style="font:18px system-ui;background:#111;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><p>${msg.replace(/</g, '&lt;')}</p>`, 'text/html; charset=utf-8');
      }
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      if (p === '/api/canva/status') return json(res, 200, canva.status());
      if (p === '/api/canva/designs') return json(res, 200, await canva.designs(url.searchParams.get('q') || '', url.searchParams.get('c') || ''));
      if (p === '/api/canva/import' && req.method === 'POST') {
        const v = JSON.parse(await body(req, 10_000));
        return json(res, 200, await canva.importDesign(String(v.id || ''), String(v.title || 'Canva').slice(0, 80)));
      }
      if (!checkLeader(req)) return json(res, 401, { error: 'Doar liderul poate conecta Canva (PIN de lider).' });
      if (p === '/api/canva/settings' && req.method === 'POST') return json(res, 200, canva.setCredentials(JSON.parse(await body(req, 10_000))));
      if (p === '/api/canva/login') return json(res, 200, { url: canva.loginUrl() });
      if (p === '/api/canva/disconnect' && req.method === 'POST') return json(res, 200, canva.disconnect());
      return json(res, 404, { error: 'not found' });
    }
    if (p.startsWith('/api/pco/')) {                     // Planning Center: leaders only
      if (!checkLeader(req)) return json(res, 401, { error: 'Doar liderul poate conecta Planning Center (PIN de lider).' });
      if (p === '/api/pco/settings') {
        if (req.method === 'POST') {
          const v = JSON.parse(await body(req, 10_000));
          if (typeof v.appId === 'string' && v.appId.trim()) pcoS().appId = v.appId.trim().slice(0, 200);
          if (typeof v.secret === 'string' && v.secret.trim()) pcoS().secret = v.secret.trim().slice(0, 200);
          if (Array.isArray(v.typeIds)) pcoS().typeIds = v.typeIds.map(String).slice(0, 20);
          if (v.disconnect) pcoAll.byChurch[db.activeChurch] = { appId: '', secret: '', typeIds: [] };
          savePco();
        }
        return json(res, 200, pcoPublic());
      }
      if (p === '/api/pco/types') {
        try { return json(res, 200, await pco.serviceTypes(pcoS())); } catch (e) { return json(res, 400, { error: e.message }); }
      }
      if (p === '/api/pco/plans') {                       // plans to choose from, per service type
        try {
          const types = await pco.serviceTypes(pcoS());
          const want = types.filter(t => !pcoS().typeIds?.length || pcoS().typeIds.includes(t.id));
          const out = [];
          for (const t of want) for (const pl of await pco.listPlans(pcoS(), t.id))
            out.push({ ...pl, typeName: t.name, imported: db.plan.services.some(x => x.pcoId === pl.id) });
          return json(res, 200, { types, plans: out });
        } catch (e) { return json(res, 400, { error: e.message }); }
      }
      if (p === '/api/pco/import' && req.method === 'POST') {
        if (pcoJob.running) return json(res, 409, { error: 'Importul rulează deja' });
        const v = JSON.parse((await body(req, 10_000)) || '{}');
        const only = Array.isArray(v.only) ? v.only.slice(0, 40).map(r => ({ typeId: String(r.typeId), id: String(r.id) })).filter(r => /^\d+$/.test(r.typeId) && /^\d+$/.test(r.id)) : null;
        runPcoImport({ songs: !!v.songs, plans: !!v.plans || !!only?.length, only: only?.length ? only : null, openId: v.open ? String(v.open) : null, prefer: !!v.prefer });
        return json(res, 200, { started: true });
      }
      return json(res, 404, { error: 'Nu există' });
    }
    if (p === '/api/ai/settings') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      if (req.method === 'POST') {
        const v = JSON.parse(await body(req, 10_000));
        for (const k of ['provider', 'claudeModel', 'ollamaUrl', 'ollamaModel', 'ollamaVisionModel']) if (typeof v[k] === 'string' && v[k].length < 200) aiSettings[k] = v[k].trim();
        if (typeof v.claudeKey === 'string' && v.claudeKey.trim()) aiSettings.claudeKey = v.claudeKey.trim();
        if (v.clearKey) delete aiSettings.claudeKey;
        fs.writeFileSync(AI_FILE, JSON.stringify(aiSettings, null, 2));
      }
      return json(res, 200, aiPublic());
    }
    if (p === '/api/ai/chat' && req.method === 'POST') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const { history, images, serviceId } = JSON.parse(await body(req, 25_000_000));
      const hubFor = serviceId && db.plan.services.some(x => x.id === serviceId) ? planHub(serviceId) : aiHub;
      const pics = (Array.isArray(images) ? images : []).slice(0, 4).filter(im => /^image\/(png|jpeg|webp|gif)$/.test(im?.type) && typeof im.data === 'string' && im.data.length < 7_000_000);
      const clean = (Array.isArray(history) ? history : []).slice(-16)
        .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .map((m, k, all) => ({ role: m.role, content: m.content.slice(0, k === all.length - 1 ? 30000 : 4000) }));   // the last message may carry a whole file
      if (!clean.length || clean.at(-1).role !== 'user') return json(res, 400, { error: 'Scrie un mesaj' });
      try { return json(res, 200, await runAssistant(aiSettings, clean, hubFor, { images: pics })); }
      catch (e) { return json(res, 200, { error: e.message }); }
    }
    if (p === '/api/media' && req.method === 'GET') {
      const files = fs.readdirSync(MEDIA_DIR).filter(f => TYPES[path.extname(f).toLowerCase()] && !f.startsWith('.') && !f.startsWith('pres-') && !f.startsWith('logo-echipa-'));
      return json(res, 200, files);
    }
    if ((p === '/api/media/trash' || p === '/api/media/restore') && req.method === 'POST') {   // a background to the bin (Coș), and back
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const name = path.basename(String(JSON.parse(await body(req, 10_000)).name || ''));
      const BIN = path.join(DATA_DIR, 'cos'); fs.mkdirSync(BIN, { recursive: true });
      const [from, to] = p.endsWith('trash') ? [MEDIA_DIR, BIN] : [BIN, MEDIA_DIR];
      if (!name || !fs.existsSync(path.join(from, name))) return json(res, 404, { error: 'Fișierul nu există' });
      fs.renameSync(path.join(from, name), path.join(to, name));
      if (p.endsWith('trash') && live.background === name) { live.background = ''; broadcast(); }
      return json(res, 200, { ok: true, name });
    }
    if (p === '/api/media' && req.method === 'POST') {      // upload background (raw body, ?name=)
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const name = path.basename(url.searchParams.get('name') || '').replace(/[^\w.\- ]/g, '_');
      if (!name || !MEDIA_EXT.includes(path.extname(name).toLowerCase())) return json(res, 400, { error: 'Tip de fișier nepermis (doar imagini, video sau audio)' });
      const buf = await body(req, 500 * 1024 * 1024, true);
      fs.writeFileSync(path.join(MEDIA_DIR, name), buf);
      return json(res, 200, { ok: true, name });
    }
    if (p === '/api/bibles' && req.method === 'GET') return json(res, 200, bibleList());
    if (p === '/api/peers' && req.method === 'GET') return json(res, 200, peerList());
    if (p === '/api/update' && req.method === 'GET') return json(res, 200, { ...updater.state, repo: UPDATE_REPO, auto: UPDATES });
    if (p === '/api/update' && req.method === 'POST') {       // "Caută acum"
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      await updater.fromGithub(); return json(res, 200, updater.state);
    }
    if (p === '/api/update/manifest' && req.method === 'GET') { const pk = updater.packageForPeers(); return pk ? json(res, 200, pk.manifest) : json(res, 404, { error: 'nu am' }); }
    if (p === '/api/update/package' && req.method === 'GET') {  // signed: the other computer checks it before using it
      const pk = updater.packageForPeers(); if (!pk || !fs.existsSync(pk.file)) return json(res, 404, { error: 'nu am' });
      res.writeHead(200, { 'content-type': 'application/gzip' }); return fs.createReadStream(pk.file).pipe(res);
    }
    if (p === '/api/send' && req.method === 'POST') return handleSend(req, res, url);
    if (p === '/api/tunnel' && req.method === 'GET') return json(res, 200, tunnelState());
    if (p === '/api/tunnel' && req.method === 'POST') {
      if (!checkLeader(req)) return json(res, 401, { error: 'Doar liderul' });
      const m = JSON.parse(await body(req, 1000) || '{}');
      if (m.install) installCloudflared(); else if (m.on) startTunnel(); else stopTunnel();
      return json(res, 200, tunnelState());
    }
    if (p === '/api/inbox' && req.method === 'GET') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const t = url.searchParams.get('new') === '1' ? (sendToken = crypto.randomBytes(9).toString('base64url')) : sendToken;
      return json(res, 200, { token: t, urls: lanIPs().map(i => `http://${i.address}:${PORT}`), files: inboxList() });
    }
    if (p === '/api/inbox/file' && req.method === 'GET') {    // ?pin= too, so pictures can show in an <img>
      const qp = url.searchParams.get('pin');
      if (!checkPin(req) && !(qp && (safeEq(qp, PIN) || safeEq(qp, LEADER_PIN)))) return json(res, 401, { error: 'PIN greșit' });
      return file(res, INBOX_DIR, inboxName(url.searchParams.get('name')), req);
    }
    if (p === '/api/inbox/take' && req.method === 'POST') {  // to the backgrounds / media folder, or thrown away
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const m = JSON.parse(await body(req, 10000)), name = inboxName(m.name), src = path.join(INBOX_DIR, name);
      if (!fs.existsSync(src)) return json(res, 404, { error: 'Fișierul nu mai e în Primite' });
      if (m.action === 'delete') { fs.rmSync(src); inboxEvent({}); return json(res, 200, { ok: true }); }
      if (!MEDIA_EXT.includes(path.extname(name).toLowerCase())) return json(res, 400, { error: 'Acest fișier se deschide ca prezentare' });
      const dst = freeName(MEDIA_DIR, name.replace(/ /g, '-'));
      fs.renameSync(src, path.join(MEDIA_DIR, dst)); inboxEvent({});
      return json(res, 200, { ok: true, media: dst });
    }
    if (p === '/api/hello' && req.method === 'GET') {        // "is there a Betleem at this address?" (asked from another computer's page)
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      return res.end(JSON.stringify({ app: 'betleem', name: os.hostname().replace(/\.local$/, ''), church: activeChurch()?.name || '' }));
    }
    if (p === '/api/this' && req.method === 'GET') {         // only on this computer: its addresses and PINs, to join from another one
      if (!(TRUST_LOCALHOST && isLocal(req.socket.remoteAddress))) return json(res, 403, { error: 'Doar pe acest calculator' });
      return json(res, 200, { name: os.hostname().replace(/\.local$/, ''), urls: lanIPs().map(i => `http://${i.address}:${PORT}`), pin: PIN, leaderPin: LEADER_PIN });
    }
    if (p === '/api/bible' && req.method === 'GET') {        // one chapter: ?v=vdc&b=42&c=3
      const b = bible(url.searchParams.get('v')); if (!b) return json(res, 404, { error: 'Traducerea nu există' });
      const bk = Number(url.searchParams.get('b')), ch = Number(url.searchParams.get('c')) || 1, book = b.books[bk];
      if (!book) return json(res, 404, { error: 'Cartea nu există' });
      return json(res, 200, { book: bk, name: bookName(bk, b.lang), chapters: book.length, chapter: Math.min(ch, book.length), verses: book[Math.min(ch, book.length) - 1] || [] });
    }
    if (p === '/api/bible/search' && req.method === 'GET') {  // words: ?v=vdc&q=pastorul meu
      const b = bible(url.searchParams.get('v')), q = String(url.searchParams.get('q') || '');
      if (!b || q.trim().length < 3) return json(res, 200, []);
      const f = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const words = f(q).split(/\s+/).filter(Boolean), hits = [];
      for (const [bi, book] of b.books.entries()) for (const [ci, ch] of book.entries()) for (const [vi, v] of ch.entries()) {
        const t = f(v); if (words.every(w => t.includes(w))) { hits.push({ book: bi, chapter: ci + 1, verse: vi + 1, text: v, ref: formatRef({ book: bi, chapter: ci + 1, from: vi + 1 }, b.lang) }); if (hits.length >= 60) return json(res, 200, hits); }
      }
      return json(res, 200, hits);
    }
    if (p === '/api/bibles' && req.method === 'POST') {       // a version the church has the right to use, converted in the browser
      if (!checkLeader(req)) return json(res, 401, { error: 'Doar liderul poate adăuga traduceri' });
      const b = JSON.parse(await body(req, 30 * 1024 * 1024));
      const id = String(b.short || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
      const ok = id && Array.isArray(b.books) && b.books.length === 66 && b.books.every(bk => Array.isArray(bk) && bk.every(ch => Array.isArray(ch) && ch.every(v => typeof v === 'string')));
      if (!ok) return json(res, 400, { error: 'Fișierul nu are toate cele 66 de cărți ale Bibliei' });
      if (fs.existsSync(path.join(BIBLE_DIRS[0], id + '.json'))) return json(res, 400, { error: 'Prescurtarea ' + b.short + ' e deja folosită' });
      fs.mkdirSync(BIBLE_DIRS[1], { recursive: true });
      fs.writeFileSync(path.join(BIBLE_DIRS[1], id + '.json'), JSON.stringify({ id, name: String(b.name || b.short).slice(0, 80), short: String(b.short).slice(0, 12), lang: b.lang === 'en' ? 'en' : b.lang === 'ro' ? 'ro' : String(b.lang || 'ro').slice(0, 5), books: b.books }));
      bibleCache.delete(id);
      return json(res, 200, { ok: true, id });
    }
    if (p === '/api/convert' && req.method === 'POST') {    // PowerPoint / Keynote → PDF (the pages are drawn in the browser)
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const name = path.basename(url.searchParams.get('name') || '').replace(/[^\w.\- ]/g, '_');
      if (!SHOW_EXT.includes(path.extname(name).toLowerCase())) return json(res, 400, { error: 'Tip de fișier nepermis' });
      const native = (process.platform === 'darwin' && fs.existsSync('/Applications/Keynote.app')) || process.platform === 'win32';
      if (!findOffice() && !native) return json(res, 200, { office: false });
      const buf = await body(req, 300 * 1024 * 1024, true);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betleem-show-')), src = path.join(dir, name);
      fs.writeFileSync(src, buf);
      try {
        const pdf = await toPdf(src);
        if (!pdf) return json(res, 200, { office: false, error: 'Nu am putut deschide prezentarea cu Keynote / PowerPoint / LibreOffice' });
        res.writeHead(200, { 'content-type': 'application/pdf' }); const data = fs.readFileSync(pdf);
        if (pdf.includes(path.sep + 'conversie' + path.sep)) fs.rmSync(pdf, { force: true });
        return res.end(data);
      } catch (e) { logError('convert', e); return json(res, 200, { office: true, error: 'Conversia a eșuat: ' + e.message }); }
      finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    if (p.startsWith('/media/')) return file(res, MEDIA_DIR, decodeURIComponent(p.slice(7)), req);
    if (p.startsWith('/userfonts/')) return file(res, FONTS_DIR, path.basename(decodeURIComponent(p.slice(11))), req);
    if (p === '/api/fonts' && req.method === 'POST') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const m = JSON.parse(await body(req, 10000));
      return json(res, 200, await ensureFonts(Array.isArray(m.families) ? m.families : []));
    }
    if (p === '/' ) return redirect(res, '/live.html');
    return file(res, PUBLIC, p.slice(1), req);
  } catch (e) {
    if (!(e instanceof SyntaxError)) logError('cerere ' + p, e);
    try { return json(res, 400, { error: e.message }); } catch {}
  }
}

function checkLeader(req) { return !LEADER_PIN || (TRUST_LOCALHOST && isLocal(req.socket.remoteAddress)) || safeEq(req.headers['x-pin'], LEADER_PIN); }
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

// --- Other computers with Betleem on the same network (Wi-Fi, hotspot, cable) ---------------------
// Every Betleem says "I am here" a few times a minute; the others list it, so a second computer
// (tracks in front, lyrics in the back) can join the same program with one click.
const DISCOVERY_PORT = 45454, instanceId = crypto.randomUUID();
const peers = new Map();                              // id → { name, church, address, port, seen }
const lanIPs = () => Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal);
if (process.env.DISCOVERY !== '0') (async () => {
  try {
    const dgram = await import('node:dgram');
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    sock.on('error', e => { logError('găsirea altor calculatoare', e); try { sock.close(); } catch {} });
    sock.on('message', (buf, rinfo) => {
      try {
        const m = JSON.parse(buf);
        if (m.app !== 'betleem' || m.id === instanceId) return;
        peers.set(m.id, { name: String(m.name).slice(0, 60), church: String(m.church || '').slice(0, 60), address: rinfo.address, port: Number(m.port) || 4545, seen: Date.now(), version: String(m.version || '') });
        if (UPDATES && newer(m.version, updater.state.ready || VERSION)) updater.fromPeer(`http://${rinfo.address}:${Number(m.port) || 4545}`, String(m.version));
      } catch {}
    });
    sock.bind(DISCOVERY_PORT, () => {
      try { sock.setBroadcast(true); } catch {}
      const beat = () => {
        const msg = Buffer.from(JSON.stringify({ app: 'betleem', id: instanceId, name: os.hostname().replace(/\.local$/, ''), church: activeChurch()?.name || '', port: PORT, version: updater.state.ready || VERSION }));
        // the broadcast address of every network this computer is on (hotspots do not always pass 255.255.255.255)
        const targets = new Set(['255.255.255.255']);
        for (const i of lanIPs()) {
          const ip = i.address.split('.').map(Number), mask = i.netmask.split('.').map(Number);
          targets.add(ip.map((b, k) => (b | (~mask[k] & 255))).join('.'));
        }
        for (const t of targets) sock.send(msg, DISCOVERY_PORT, t, () => {});
      };
      beat(); setInterval(beat, 3000).unref();
    });
    sock.unref();
  } catch (e) { logError('găsirea altor calculatoare', e); }
})();
// --- Updates: from GitHub, or from another Betleem in the network that already has them (signed, see updater.js)
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '0'; } })();
const UPDATE_REPO = (() => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'update-sursa.json'), 'utf8')).repo; } catch { return process.env.UPDATE_REPO || 'gheorgheturcu97-eng/betleem'; } })();
const updater = createUpdater({ root: ROOT, dataDir: DATA_DIR, version: VERSION, repo: UPDATE_REPO, log: logError,
  onState: st => { const msg = JSON.stringify({ type: 'update', ...st }); for (const ws of wss.clients) if (ws.readyState === 1 && sessions.get(ws)?.role !== 'viewer') ws.send(msg); } });
const UPDATES = !!process.versions.electron && process.env.UPDATES !== '0';
if (UPDATES) { setTimeout(() => updater.fromGithub(), 30000).unref(); setInterval(() => updater.fromGithub(), 6 * 3600 * 1000).unref(); }

function peerList() {
  const now = Date.now();
  return [...peers.values()].filter(p => now - p.seen < 12000).sort((a, b) => a.name.localeCompare(b.name))
    .map(p => ({ name: p.name, church: p.church, url: `http://${p.address}:${p.port}` }));
}


// phone → Betleem: the page behind the QR code sends files here (only with the code from the QR)
async function handleSend(req, res, url) {
  if (!safeEq(url.searchParams.get('t'), sendToken)) return json(res, 403, { error: 'Codul QR a expirat. Scanează-l din nou de pe ecranul Betleem.' });
  const name = inboxName(url.searchParams.get('name'));
  if (!name || !INBOX_EXT.includes(path.extname(name).toLowerCase())) return json(res, 400, { error: 'Pot primi poze, video, audio, PowerPoint, Keynote și PDF.' });
  const final = freeName(INBOX_DIR, name), tmp = path.join(INBOX_DIR, '.' + final + '.part');
  let size = 0; const MAX = 4 * 1024 * 1024 * 1024;
  try {
    await new Promise((ok, bad) => {
      const out = fs.createWriteStream(tmp);
      req.on('data', c => { size += c.length; if (size > MAX) { req.destroy(); bad(new Error('Fișierul e prea mare')); } });
      req.pipe(out); out.on('finish', ok); out.on('error', bad); req.on('error', bad);
    });
  } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch {} return json(res, 400, { error: e.message }); }
  fs.renameSync(tmp, path.join(INBOX_DIR, final));
  inboxEvent({ added: final, via: req.socket.localPort === SEND_PORT ? 'internet' : 'telefon' });
  return json(res, 200, { ok: true, name: final });
}

// --- From anywhere (mobile data, another city): a Cloudflare link to a tiny server that can ONLY receive files.
// The program, the screens and the PINs are never reachable from the internet: that server has two things —
// the send page and the upload, which still needs the code from the QR.
const SEND_PORT = PORT + 1;
const sendServer = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), p = url.pathname;
  try {
    if (p === '/api/send' && req.method === 'POST') return await handleSend(req, res, url);
    if (p === '/' || p === '/send.html') return file(res, PUBLIC, 'send.html', req);
    if (p.startsWith('/fonts/') && req.method === 'GET') return file(res, PUBLIC, p.slice(1), req);
    return send(res, 404, 'Not found', 'text/plain');
  } catch (e) { try { json(res, 400, { error: e.message }); } catch {} }
});
if (process.env.SEND_SERVER !== '0') { sendServer.on('error', e => logError('serverul de trimis', e)); sendServer.listen(SEND_PORT, '127.0.0.1'); sendServer.unref(); }

const TOOLS_DIR = path.join(DATA_DIR, 'tools');
const tunnel = { proc: null, url: '', error: '', installing: false };
function findCloudflared() {
  const exe = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const c = [path.join(TOOLS_DIR, exe), '/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared', '/usr/bin/cloudflared',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe'];
  return c.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || null;
}
const tunnelState = () => ({ available: !!findCloudflared(), running: !!tunnel.proc, url: tunnel.url, error: tunnel.error, installing: tunnel.installing,
  link: tunnel.url ? `${tunnel.url}/send.html?t=${sendToken}` : '' });
const tunnelEvent = () => { const msg = JSON.stringify({ type: 'tunnel', ...tunnelState() }); for (const ws of wss.clients) if (ws.readyState === 1 && sessions.get(ws)?.role !== 'viewer') ws.send(msg); };
async function startTunnel() {
  const bin = findCloudflared(); if (!bin || tunnel.proc) return;
  const { spawn } = await import('node:child_process');
  tunnel.error = ''; tunnel.url = '';
  const proc = tunnel.proc = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${SEND_PORT}`], { windowsHide: true });
  const look = d => { const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/); if (m && !tunnel.url) { tunnel.url = m[0]; tunnelEvent(); } };
  proc.stdout.on('data', look); proc.stderr.on('data', look);
  proc.on('exit', code => { if (tunnel.proc === proc) { tunnel.proc = null; tunnel.url = ''; if (code) tunnel.error = 'Legătura prin internet s-a oprit'; tunnelEvent(); } });
  proc.on('error', e => { tunnel.error = e.message; tunnel.proc = null; tunnelEvent(); });
  setTimeout(() => { if (tunnel.proc === proc && !tunnel.url) { tunnel.error = 'Nu am primit link de la Cloudflare. Ai internet?'; tunnelEvent(); } }, 25000).unref();
  tunnelEvent();
}
function stopTunnel() { try { tunnel.proc?.kill(); } catch {} tunnel.proc = null; tunnel.url = ''; tunnelEvent(); }
process.on('exit', () => { try { tunnel.proc?.kill(); } catch {} });
// cloudflared is Cloudflare's free, official program for these links (github.com/cloudflare/cloudflared)
async function installCloudflared() {
  if (tunnel.installing || findCloudflared()) return;
  tunnel.installing = true; tunnel.error = ''; tunnelEvent();
  try {
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const asset = process.platform === 'win32' ? `cloudflared-windows-${arch === 'arm64' ? 'amd64' : arch}.exe`
      : process.platform === 'darwin' ? `cloudflared-darwin-${arch}.tgz` : `cloudflared-linux-${arch}`;
    const r = await fetch('https://github.com/cloudflare/cloudflared/releases/latest/download/' + asset);
    if (!r.ok) throw new Error('Descărcarea a eșuat (' + r.status + ')');
    fs.mkdirSync(TOOLS_DIR, { recursive: true });
    const buf = Buffer.from(await r.arrayBuffer());
    const exe = path.join(TOOLS_DIR, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
    if (asset.endsWith('.tgz')) {
      const tgz = path.join(TOOLS_DIR, asset); fs.writeFileSync(tgz, buf);
      const { execFileSync } = await import('node:child_process');
      execFileSync('tar', ['-xzf', tgz, '-C', TOOLS_DIR]); fs.rmSync(tgz, { force: true });
    } else fs.writeFileSync(exe, buf);
    fs.chmodSync(exe, 0o755);
  } catch (e) { tunnel.error = 'Nu am putut instala: ' + e.message; logError('cloudflared', e); }
  tunnel.installing = false; tunnelEvent();
}

// --- Primite: files sent from a phone (QR code) or by AirDrop, waiting to be used ------------------
const INBOX_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.mp4', '.mov', '.m4v', '.webm', '.mp3', '.wav', '.m4a', '.aac', '.pdf', '.pptx', '.ppt', '.key', '.odp', '.ppsx', '.pps'];
let sendToken = crypto.randomBytes(9).toString('base64url');   // in the QR code; a new one each time Betleem starts
fs.mkdirSync(INBOX_DIR, { recursive: true });
const inboxName = n => path.basename(String(n || '')).replace(/[^\w.\- ăâîșțĂÂÎȘȚ()]/g, '_').slice(-120);
function inboxList() {
  return fs.readdirSync(INBOX_DIR).filter(f => !f.startsWith('.') && INBOX_EXT.includes(path.extname(f).toLowerCase()))
    .map(f => { const st = fs.statSync(path.join(INBOX_DIR, f)); return { name: f, size: st.size, at: st.mtimeMs }; })
    .sort((a, b) => b.at - a.at);
}
function inboxEvent(o) {
  const msg = JSON.stringify({ type: 'inbox', files: inboxList(), ...o });
  for (const ws of wss.clients) if (ws.readyState === 1 && sessions.get(ws)?.role !== 'viewer') ws.send(msg);
}
function freeName(dir, name) {
  let n = name, i = 2; const ext = path.extname(name), base = name.slice(0, -ext.length || undefined);
  while (fs.existsSync(path.join(dir, n))) n = `${base} (${i++})${ext}`;
  return n;
}
// AirDrop (Mac) and Nearby Share (Windows) drop files into Downloads: new pictures, videos and presentations that arrive
// while Betleem is open come to Primite (copied, the original stays). Nothing else from Downloads is read.
if (['darwin', 'win32'].includes(process.platform) && process.env.WATCH_AIRDROP !== '0' && !process.env.NODE_TEST_CONTEXT) {
  const dl = path.join(os.homedir(), 'Downloads'), started = Date.now(), seen = new Set();
  try {
    fs.watch(dl, (_e, f) => {
      if (!f || seen.has(f) || f.startsWith('.') || !INBOX_EXT.includes(path.extname(f).toLowerCase())) return;
      let last = -1, tries = 0;
      const check = () => {                                  // wait until the file stops growing (big videos take a while)
        try {
          const src = path.join(dl, f), st = fs.statSync(src);
          if (!st.isFile() || Math.max(st.birthtimeMs, st.ctimeMs) < started || seen.has(f)) return;
          if (st.size !== last || !st.size) { last = st.size; if (++tries < 300) setTimeout(check, 1500); return; }
          seen.add(f);
          const n = freeName(INBOX_DIR, inboxName(f)); fs.copyFileSync(src, path.join(INBOX_DIR, n));
          inboxEvent({ added: n, via: process.platform === 'darwin' ? 'AirDrop' : 'Descărcări' });
        } catch {}
      };
      setTimeout(check, 1500);
    }).unref?.();
  } catch (e) { logError('AirDrop (Downloads)', e); }
}

export { server };
