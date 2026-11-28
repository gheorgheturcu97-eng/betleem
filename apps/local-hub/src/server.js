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
import { execFileSync, execFile } from 'node:child_process';
import * as nodeModule from 'node:module';
import { WebSocketServer } from 'ws';
import { extractLyrics } from './extract.js';
import { searchLyrics } from './websearch.js';
import { addChordsToSongs } from './chords.js';
import * as propres from './propresenter.js';
import { parseAls } from './ableton.js';
import { feedbackProposal, runAssistant, askAI } from './ai.js';
import { defaultPlan, applyPlanOp, serviceWarnings, newToken, focusByMonth } from './plan.js';
import { createReverbSync } from './reverb-sync.js';
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
/** This computer itself (trusted as leader with TRUST_LOCALHOST). Never true for the 🌐 public door: the tunnel also
 *  connects from 127.0.0.1, so without this check anyone on the internet would count as "this computer". */
const localReq = req => !req.viaDoor && isLocal(req.socket.remoteAddress);
/** 🔓 "Fără PIN" (⚙): every phone/computer on the church network counts as leader. Only private network addresses
 *  (Wi-Fi 192.168/10/172.16-31, Tailscale 100.64/10, IPv6 fe80/fd), and never the 🌐 internet door. */
const isLan = addr => { const a = String(addr || '').replace(/^::ffff:/, '');
  return isLocal(addr) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(a) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(a) || /^f[cde][0-9a-f]{2}:/i.test(a); };
const openLan = req => !!db?.noPin && !req.viaDoor && isLan(req.socket?.remoteAddress);

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
/** 🎤 The preacher's PIN: moves only the sermon's slides, from a phone or tablet. Separate from the team PINs. */
function newPreacherPin() { let p; do { p = String(crypto.randomInt(1000, 10000)); } while (p === PIN || p === LEADER_PIN); return p; }
db.preacherPin ||= newPreacherPin();
const activeChurch = () => db.churches.find(c => c.id === db.activeChurch) || db.churches[0];
const canva = createCanva({ dataDir: DATA_DIR, port: PORT, mediaDir: MEDIA_DIR, log: (w, e) => logError(w, e) });
function broadcastCanva() { const msg = JSON.stringify({ type: 'canva', ...canva.status() }); for (const ws of wss?.clients || []) if (ws.readyState === 1) ws.send(msg); }

// --- What comes with the app --------------------------------------------------------
// Backgrounds made for Echipa Betleem (free, original): put in the media folder once; one you delete stays deleted.
function installBundled() {
  db.bundledBg ||= [];
  for (const f of db.removedBg || []) {                // the app copies its backgrounds at every start: the ones you deleted go back to the bin
    const src = path.join(MEDIA_DIR, f), bin = path.join(DATA_DIR, 'cos');
    try { if (fs.existsSync(src)) { fs.mkdirSync(bin, { recursive: true }); if (fs.existsSync(path.join(bin, f))) fs.rmSync(src); else fs.renameSync(src, path.join(bin, f)); } } catch {}
  }
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
let reverbQuiet = false, reverbBackupAt = 0;            // a save made by the Reverb online sync itself does not start another sync
function save() {
  if (!reverbQuiet) reverb?.changed();
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
// 🎭 Looks: the whole look of the screens in one click (idea from ProPresenter, our own code). A Look keeps the hall
// screen's text look, and optionally the stage's, the background and which Props are on. Undefined = leave as it is.
if (!Array.isArray(db.looks)) {
  const m = db.display.main;
  db.looks = [
    { id: 'serviciu', name: '⛪ Serviciu', main: { ...m } },
    { id: 'inchinare', name: '🙌 Închinare', main: { ...m, align: 'center', valign: 'middle', size: Math.max(m.size || 6.2, 6.6), tr: 'crossfade', trDur: 700 } },
    { id: 'predica', name: '📖 Predică', main: { ...m, align: 'left', valign: 'bottom', size: 4.4, upper: false, dim: 55, tr: 'fade', trDur: 400 } },
  ];
}
function cleanLook(x, old = {}) {
  const l = { id: String(x.id || old.id || crypto.randomUUID()).replace(/[^\w-]/g, '').slice(0, 40), name: String(x.name ?? old.name ?? 'Look').trim().slice(0, 40) || 'Look' };
  const main = 'main' in x ? x.main : old.main, stage = 'stage' in x ? x.stage : old.stage;
  if (main) l.main = cleanDisplay('main', main);
  if (stage) l.stage = cleanDisplay('stage', stage);
  const bg = 'background' in x ? x.background : old.background; if (bg != null) l.background = String(bg).slice(0, 500);
  const pr = 'props' in x ? x.props : old.props; if (Array.isArray(pr)) l.props = pr.map(String).slice(0, 50);
  return l;
}
function applyLook(id) {
  const l = (db.looks || []).find(x => x.id === id); if (!l) return false;
  if (l.main) db.display.main = { ...DISPLAY_DEFAULTS.main, ...l.main };
  if (l.stage) db.display.stage = { ...DISPLAY_DEFAULTS.stage, ...l.stage };
  if (l.background != null) live.background = l.background;
  if (l.props) for (const pr of db.props || []) pr.on = l.props.includes(pr.id);
  db.lookOn = l.id; return true;
}
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
  if (['cut', 'fade', 'crossfade', 'dissolve'].includes(p.tr)) d.tr = p.tr;                       // how the words change on screen
  if (p.trDur != null && Number.isFinite(+p.trDur)) d.trDur = Math.round(Math.min(3000, Math.max(0, +p.trDur)));     // …in milliseconds
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

/** 🧱 Layers of a slide or a Prop (public/layers.js draws them): only known keys, numbers in range, media by file name. */
function cleanLayers(list) {
  const hex = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v : '', num = (v, a, b, d) => Number.isFinite(+v) ? Math.min(b, Math.max(a, Math.round(+v * 100) / 100)) : d;
  return (Array.isArray(list) ? list : []).slice(0, 40).filter(l => ['text', 'image', 'video', 'shape'].includes(l?.type)).map(l => {
    const o = { id: String(l.id || crypto.randomUUID()).replace(/[^\w-]/g, '').slice(0, 40) || crypto.randomUUID().slice(0, 8), type: l.type, name: String(l.name || '').slice(0, 40),
      x: num(l.x, -100, 100, 0), y: num(l.y, -100, 100, 0), w: num(l.w, 1, 200, 30), h: num(l.h, 1, 200, 20), opacity: num(l.opacity, 0, 1, 1),
      hidden: !!l.hidden, locked: !!l.locked, under: !!l.under, anim: ['none', 'fade', 'rise', 'zoom', 'left'].includes(l.anim) ? l.anim : 'none',
      bg: hex(l.bg), bgAlpha: num(l.bgAlpha, 0, 1, 1), radius: num(l.radius, 0, 50, 0), border: hex(l.border), borderW: num(l.borderW, 0, 5, 0) };
    if (l.type === 'text') Object.assign(o, { text: String(l.text || '').slice(0, 2000), font: String(l.font || 'Inter').slice(0, 60).replace(/[^\w\s-]/g, ''),
      size: num(l.size, 0.5, 40, 6), color: hex(l.color) || '#ffffff', weight: [400, 500, 600, 700, 800].includes(+l.weight) ? +l.weight : 700,
      align: ['left', 'center', 'right'].includes(l.align) ? l.align : 'center', valign: ['top', 'middle', 'bottom'].includes(l.valign) ? l.valign : 'middle',
      italic: !!l.italic, upper: !!l.upper, shadow: !!l.shadow });
    if (l.type === 'image' || l.type === 'video') Object.assign(o, { src: path.basename(String(l.src || '')).slice(0, 200), fit: l.fit === 'cover' ? 'cover' : 'contain' });
    if (l.type === 'shape') o.shape = l.shape === 'ellipse' ? 'ellipse' : 'rect';
    return o;
  });
}
/** slide numbers after one slide is removed (d = -1) or copied (d = +1): per-slide looks and layers follow their slide */
function shiftSlides(obj, slide, d) {
  if (!obj) return obj; const out = {};
  for (const [i, v] of Object.entries(obj)) { if (d < 0 && +i === slide) continue; out[+i > slide ? +i + d : i] = v; }
  if (d > 0 && obj[slide]) out[slide + 1] = structuredClone(obj[slide]);
  return out;
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

/** With the standard names on (Verse / Chorus / Bridge, like ProPresenter), every song that comes in is written with them. */
const stdBody = b => (db.labelStd === 'en' ? core.standardizeLabels(b) : b);
const stdOrder = a => (db.labelStd === 'en' && Array.isArray(a) ? a.map(x => (/^#\d+$/.test(x) ? x : core.standardLabel(x))) : a);

function snapshot() {
  const open = k => [...sessions.values()].some(s => s.screen === k);
  return {
    screensOpen: { main: open('main'), stage: open('stage') },
    labelStd: db.labelStd || '',                                   // 'en' = Verse / Chorus / Bridge     // 🖥 is the projector / stage window open right now
    service: db.service,
    display: db.display,
    lights: db.lights || { scenes: [] },
    noPin: !!db.noPin,                               // 🔓 everyone on the church Wi-Fi is let in without a PIN
    looks: db.looks || [], lookOn: db.lookOn || null,  // 🎭 Looks (whole look in one click) and the one on now
    props: db.props || [],                           // 🏷 things on screen independent of the slide (logo, banner, text)
    church: (({ id, name, city, logo, vision }) => ({ id, name, city, logo: logo || '', vision: vision || '' }))(activeChurch()),
    churches: db.churches.map(c => ({ id: c.id, name: c.name, city: c.city, locked: !!c.code })),
    setlist: db.setlist.map((it, i) => ({
      ...it,
      title: it.kind === 'song' ? (db.songs.find(s => s.id === it.songId)?.title ?? '(cântare ștearsă)') : it.title,
      rev: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.updatedAt || '' : undefined,   // lets screens notice a changed song
      track: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.track || '' : undefined,
      stems: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.stems || [] : undefined,
      cues: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.cues || [] : undefined,
      guide: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.guide || [] : undefined,
      lights: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.lights || undefined : undefined,     // 🎧 the map in bars, for songs without tracks
      origBpm: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.bpm || 0 : undefined,
      // the key and tempo the tracks were recorded in: the tracks change only when the program is set differently from these
      trackKey: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.trackKey || '' : undefined,
      trackBpm: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.trackBpm || 0 : undefined,
      beatOffset: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.beatOffset || 0 : undefined,
      origKey: it.kind === 'song' ? (s => s ? core.originalKey(s.key, s.body) : '')(db.songs.find(s => s.id === it.songId)) : undefined,
      slideCount: slidesFor(i).length,
    })),
    live: { ...live, slides: slidesFor(live.item), title: live.item === -2 ? live.bible?.title || '' : undefined, preachers: preacherCount(), sermon: sermonIndex() },
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

const ROLE_RANK = { viewer: 0, preacher: 0, operator: 1, leader: 2 };
const preacherCount = () => [...sessions.values()].filter(x => x.role === 'preacher').length;
/** The sermon the preacher controls: the one on screen now, else the next one in the program, else the first. */
function sermonIndex() {
  const isS = i => ['sermon'].includes(db.setlist[i]?.kind);
  if (isS(live.item)) return live.item;
  const after = db.setlist.findIndex((it, i) => i > live.item && isS(i));
  return after >= 0 ? after : db.setlist.findIndex((it, i) => isS(i));
}
const need = (ws, role) => ROLE_RANK[sessions.get(ws)?.role ?? 'viewer'] >= ROLE_RANK[role];

wss.on('connection', (ws, req) => {
  sessions.set(ws, { role: !PIN || (TRUST_LOCALHOST && localReq(req)) || openLan(req) ? 'leader' : 'viewer', addr: String(req.socket.remoteAddress) });
  ws.send(JSON.stringify({ type: 'hello', role: sessions.get(ws).role, state: snapshot() }));
  ws.on('close', () => { const was = sessions.get(ws); sessions.delete(ws); if (was?.role === 'preacher' || was?.screen) broadcast(); });
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
let lastMd = null;                                     // the last MD&TRACK state, for a phone that just opened
const UNDOABLE = new Set(['setStems', 'setCues', 'setTrack', 'setBpm', 'setKey', 'addItem', 'removeItem', 'moveItem', 'updateItem', 'deleteSong', 'service', 'saveSong', 'editSlide', 'slideSection',
  'tagSlides', 'autoLabel', 'cleanLibrary', 'duplicateSlide', 'pasteSlides', 'breakSlide', 'standardLabels', 'saveArrangement', 'deleteArrangement', 'removeSlide', 'slideStyle', 'slideLayers', 'trackBase', 'saveProp', 'deleteProp', 'saveLook', 'deleteLook', 'applyLook', 'itemLook', 'itemDisplay', 'itemBackground', 'arrangement', 'display', 'openProgram', 'newProgram']);
const history = { undo: [], redo: [], church: null, last: { key: '', at: 0 } };
function takeSnapshot() {
  return {
    setlist: structuredClone(db.setlist), service: structuredClone(db.service), display: structuredClone(db.display), props: structuredClone(db.props || []), looks: structuredClone(db.looks || []), lookOn: db.lookOn || null,
    plan: structuredClone(db.plan?.services || []),
    songs: db.songs.map(x => ({ ...x, ...(x.arrangement ? { arrangement: [...x.arrangement] } : {}), ...(x.tags ? { tags: [...x.tags] } : {}) })),
    liveItemId: db.setlist[live.item]?.id || null, slide: live.slide,
  };
}
function restoreSnapshot(sn) {
  db.setlist = sn.setlist; db.service = sn.service; db.display = sn.display; db.songs = sn.songs; if (sn.props) db.props = sn.props; if (sn.looks) { db.looks = sn.looks; db.lookOn = sn.lookOn; }
  if (db.plan) db.plan.services = sn.plan;
  live.item = sn.liveItemId ? db.setlist.findIndex(x => x.id === sn.liveItemId) : -1;
  live.slide = live.item >= 0 ? clamp(sn.slide, 0, Math.max(0, slidesFor(live.item).length - 1)) : 0;
}
const UNDO_NAMES = { setStems: 'track-urile', setCues: 'cue-urile', setTrack: 'track-ul', setBpm: 'tempo-ul', setKey: 'schimbarea tonului', addItem: 'adăugarea în program', removeItem: 'scoaterea din program', moveItem: 'mutarea în program', updateItem: 'modificarea din program',
  deleteSong: 'ștergerea cântării', service: 'schimbarea serviciului', saveSong: 'salvarea cântării', editSlide: 'textul slide-ului', slideSection: 'eticheta',
  tagSlides: 'eticheta', autoLabel: 'etichetele automate', cleanLibrary: 'curățarea bibliotecii', duplicateSlide: 'repetarea slide-ului', pasteSlides: 'lipirea slide-urilor', breakSlide: 'ruperea slide-ului', standardLabels: 'etichetele standard', saveArrangement: 'salvarea aranjamentului', deleteArrangement: 'ștergerea aranjamentului', removeSlide: 'ștergerea slide-ului', slideStyle: 'aspectul slide-ului', slideLayers: 'straturile slide-ului', trackBase: 'tonul și tempo-ul track-urilor', saveProp: 'prop-ul', saveLook: 'Look-ul salvat', deleteLook: 'ștergerea Look-ului', applyLook: 'schimbarea Look-ului', itemLook: 'Look-ul momentului', deleteProp: 'ștergerea prop-ului', itemDisplay: 'aspectul cântării',
  itemBackground: 'fundalul cântării', arrangement: 'ordinea', display: 'aspectul', openProgram: 'schimbarea programului', newProgram: 'programul nou' };

function handleMessage(ws, m) {
    const reply = o => ws.send(JSON.stringify(o));
    // 🖥 the projector / stage windows say they are open; a double-click on a preview in Live closes them
    if (m.type === 'screenHere') { const s = sessions.get(ws); if (s) { s.screen = m.kind === 'stage' ? 'stage' : 'main'; broadcast(); } return; }
    if (m.type === 'closeScreen') {
      if (!need(ws, 'operator')) return;
      for (const [c, s] of sessions) if (s.screen === m.kind && c.readyState === 1) c.send(JSON.stringify({ type: 'closeScreen', kind: m.kind }));
      return;
    }
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
      const addr = sessions.get(ws)?.addr || '?';
      if (locked(addr)) return reply({ type: 'login', ok: false, role: sessions.get(ws).role, error: 'Prea multe încercări greșite. Așteaptă puțin.' });
      const role = safeEq(m.pin, LEADER_PIN) && LEADER_PIN ? 'leader' : safeEq(m.pin, PIN) && PIN ? 'operator'
        : safeEq(m.pin, db.preacherPin) ? 'preacher' : null;
      if (!role) wrongPin(addr); else guesses.delete(addr);
      if (role) sessions.get(ws).role = role;
      reply({ type: 'login', ok: !!role, role: sessions.get(ws).role });
      if (role === 'preacher') broadcast();            // the operator sees that the preacher is connected
      return;
    }
    if (sessions.get(ws)?.role === 'preacher') {     // 🎤 only the sermon's slides, and only while the operator allows it
      if (!['next', 'prev', 'start', 'go'].includes(m.type)) return reply({ type: 'error', error: 'Predicatorul poate schimba doar slide-urile predicii.' });
      if (live.preacherOff) return reply({ type: 'error', error: 'Regia a preluat controlul slide-urilor.' });
      const si = sermonIndex();
      if (si < 0) return reply({ type: 'error', error: 'Nu există o predică în programul de azi.' });
      const n = Math.max(1, slidesFor(si).length);
      if (live.item !== si) {                         // not on the sermon yet: any button starts it, from its first slide
        applyItemBackground(si); live.item = si; live.slide = 0;
      } else if (m.type === 'go') live.slide = clamp(Number(m.slide) || 0, 0, n - 1);
      else if (m.type !== 'start') live.slide = clamp(live.slide + (m.type === 'next' ? 1 : -1), 0, n - 1);
      live.blank = false; live.logo = false; live.preacherAt = Date.now();
      broadcast(); return;
    }
    if (!need(ws, 'operator')) return reply({ type: 'error', error: 'Nu ai drept de control. Introdu PIN-ul.' });
    // 🎛 MD&TRACK from the phone: the phone sends a command, the computer with the tracks does it and tells where it is.
    // Only passed along (nothing saved, no full state sent), so it stays light even every second.
    if (m.type === 'md' || m.type === 'mdState') {
      const out = m.type === 'md'
        ? JSON.stringify({ type: 'md', cmd: String(m.cmd || '').slice(0, 20), k: Number.isInteger(m.k) ? m.k : undefined, now: !!m.now })
        : JSON.stringify({ type: 'mdState', md: m.md && typeof m.md === 'object' && JSON.stringify(m.md).length < 8000 ? m.md : null });
      for (const c of wss.clients) if (c !== ws && c.readyState === 1 && ROLE_RANK[sessions.get(c)?.role] >= 1) c.send(out);
      if (m.type === 'mdState') lastMd = out;
      return;
    }
    if (m.type === 'mdAsk') { if (lastMd) ws.send(lastMd); return; }

    switch (m.type) {
      case 'go': {                                   // go to item + slide
        const item = clamp(m.item ?? live.item, -1, db.setlist.length - 1);
        if (item !== live.item) { applyItemBackground(item); live.video = { ...live.video, cmd: 'play', at: Date.now() };
          const lk = db.setlist[item]?.look; if (lk && lk !== db.lookOn) { applyLook(lk); if (db.setlist[item].background) live.background = db.setlist[item].background; } }
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
      case 'preacher': live.preacherOff = !!m.off; break;     // the operator takes the slides back (or gives them again)
      case 'resetTimer': live.since = live.item >= 0 ? Date.now() : 0; break;
      case 'logo': live.logo = !live.logo; break;
      case 'background': live.background = String(m.value || ''); break;
      // 💡 light scenes (MIDI): the list, a scene now, and which scene goes with a program moment / a song section
      case 'saveLightScene': {
        db.lights ||= { scenes: [] }; const x = m.scene || {};
        const clean = { id: String(x.id || crypto.randomUUID()).slice(0, 40), name: String(x.name || 'Scenă').slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(x.color) ? x.color : '#f5b301',
          fade: Math.max(0, Math.min(20, Number(x.fade) || 0)),
          msgs: (Array.isArray(x.msgs) ? x.msgs : []).slice(0, 64).map(q => ({ type: ['cc', 'note', 'pc'].includes(q.type) ? q.type : 'cc', ch: clamp(Math.round(+q.ch), 1, 16), n: clamp(Math.round(+q.n), 0, 127), v: clamp(Math.round(+q.v), 0, 127) })) };
        const i = db.lights.scenes.findIndex(z => z.id === clean.id); if (i >= 0) db.lights.scenes[i] = clean; else db.lights.scenes.push(clean);
        break;
      }
      case 'deleteLightScene': db.lights ||= { scenes: [] }; db.lights.scenes = db.lights.scenes.filter(z => z.id !== m.id); break;
      case 'lightPort': db.lights ||= { scenes: [] }; db.lights.port = String(m.port || '').slice(0, 120); break;
      case 'lightScene': live.light = { id: String(m.id || ''), at: Date.now() }; break;      // pressed by hand: the computer with the cable sends it
      case 'linkLight': {                            // a scene for a moment of the program, or for a section of a song (kept on the song)
        const it = db.setlist[m.item]; if (!it) break;
        if (m.section) { const song = it.kind === 'song' && db.songs.find(x => x.id === it.songId); if (!song) break; song.lights ||= {};
          if (m.id) song.lights[String(m.section).slice(0, 40)] = String(m.id); else delete song.lights[String(m.section)]; }
        else if (m.id) it.light = String(m.id); else delete it.light;
        break;
      }
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
        if ('name' in m || !it.arrangement) it.arrangementName = it.arrangement && m.name ? String(m.name).slice(0, 40) : undefined;   // 🎼 which saved arrangement is used
        if (m.maxLines) it.maxLines = clamp(Number(m.maxLines), 1, 8);
        if ('background' in m) it.background = String(m.background || '');
        save(); break;
      }
      case 'saveLook': {                             // 🎭 save the screens as they are now (new or over an existing Look)
        db.looks ||= []; const x = m.look || {}; const i = db.looks.findIndex(z => z.id === x.id);
        const take = x.take;                         // { stage, background, props }: what else to keep besides the hall text
        const src = take ? { ...x, main: db.display.main, ...(take.stage ? { stage: db.display.stage } : {}),
          ...(take.background ? { background: live.background || '' } : {}), ...(take.props ? { props: (db.props || []).filter(p => p.on).map(p => p.id) } : {}) } : x;
        const l = cleanLook(src, i >= 0 ? db.looks[i] : {});
        if (take && i >= 0) { if (!take.stage) delete l.stage; if (!take.background) delete l.background; if (!take.props) delete l.props; }
        if (i >= 0) db.looks[i] = l; else if (db.looks.length < 30) db.looks.push(l);
        if (take) db.lookOn = l.id;
        save(); break;
      }
      case 'deleteLook': db.looks = (db.looks || []).filter(z => z.id !== m.id); if (db.lookOn === m.id) db.lookOn = null;
        for (const it of db.setlist) if (it.look === m.id) delete it.look; save(); break;
      case 'applyLook': if (!applyLook(m.id)) return reply({ type: 'error', error: 'Nu găsesc acest Look' }); save(); break;
      case 'itemLook': {                             // a moment of the program switches to its Look when it goes live (sermon → 📖 Predică)
        const it = db.setlist[m.item]; if (!it) break;
        if (m.id && (db.looks || []).some(z => z.id === m.id)) it.look = m.id; else delete it.look;
        save(); break;
      }
      case 'display': {                              // look of the main / stage screen
        const screen = m.screen === 'stage' ? 'stage' : 'main';
        Object.assign(db.display[screen], cleanDisplay(screen, m.patch));
        db.lookOn = null;
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
      case 'slideLayers': {                          // 🧱 layers of one slide, the whole song, or every item of the program
        const it = db.setlist[m.item]; if (!it) break;
        const L = m.layers == null ? null : cleanLayers(m.layers);
        if (m.scope === 'all') for (const x of db.setlist) { if (L?.length) x.layers = structuredClone(L); else delete x.layers; delete x.slideLayers; }
        else if (m.scope === 'song') { if (L?.length) it.layers = L; else delete it.layers; delete it.slideLayers; }
        else {
          const n = Number(m.slide); if (!Number.isInteger(n) || n < 0 || n > 500) break;
          it.slideLayers ||= {};
          if (L) it.slideLayers[n] = L; else delete it.slideLayers[n];          // [] = nothing on this slide, even if the song has layers
          if (!Object.keys(it.slideLayers).length) delete it.slideLayers;
        }
        save(); break;
      }
      case 'saveProp': {                             // 🏷 a Prop: layers shown over everything, switched on and off by hand
        db.props ||= []; const x = m.prop || {};
        const clean = { id: String(x.id || crypto.randomUUID()).replace(/[^\w-]/g, '').slice(0, 40), name: String(x.name || 'Prop').slice(0, 40), on: !!x.on, layers: cleanLayers(x.layers) };
        const i = db.props.findIndex(z => z.id === clean.id); if (i >= 0) db.props[i] = clean; else db.props.push(clean);
        save(); break;
      }
      case 'deleteProp': db.props = (db.props || []).filter(z => z.id !== m.id); save(); break;
      case 'toggleProp': { const pr = (db.props || []).find(z => z.id === m.id); if (pr) pr.on = typeof m.on === 'boolean' ? m.on : !pr.on; save(); break; }
      case 'propsOff': for (const pr of db.props || []) pr.on = false; save(); break;
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
        const body = stdBody(core.stripRepeatMarks(core.autoLabel(core.labelStanzas(song.body))));   // site marks ("1.", "R:", "/: :/") become tags
        if (body !== song.body) { song.body = body; song.updatedAt = new Date().toISOString(); }
        if (!song.arrangement?.length) { const order = core.autoArrangement(song.body); if (order) song.arrangement = order; }
        save();
        reply({ type: 'autoLabeled', named: before, title: song.title });
        break;
      }
      case 'standardLabels': {                       // 🏷 every song: Verse 1 / Chorus / Verse 2 / Bridge…, order V1 C V2 C… where none
        if (!need(ws, 'leader')) return reply({ type: 'error', error: 'Doar liderul poate schimba toată biblioteca.' });
        try { fs.writeFileSync(path.join(DATA_DIR, `library.backup-${Date.now()}.json`), JSON.stringify(db)); } catch {}
        db.labelStd = 'en';
        let changed = 0, ordered = 0;
        for (const song of db.songs) {
          // names for unnamed blocks too, but only when the blocks stay the same (programs point at blocks by number)
          const n0 = core.parseSong(song.body).length, same = b => core.parseSong(b).length === n0;
          const full = stdBody(core.stripRepeatMarks(core.autoLabel(core.labelStanzas(core.normalizeImported(song.body)))));
          const named = stdBody(core.autoLabel(song.body));
          const body = same(full) ? full : same(named) ? named : stdBody(song.body);
          if (body !== song.body) { song.body = body; song.updatedAt = new Date().toISOString(); changed++; }
          if (song.arrangement?.length) song.arrangement = stdOrder(song.arrangement);
          else { const order = core.autoArrangement(song.body); if (order) { song.arrangement = order; ordered++; } }
          if (song.arrangements) for (const k of Object.keys(song.arrangements)) song.arrangements[k] = stdOrder(song.arrangements[k]);
        }
        const fixItems = items => { for (const it of items || []) if (it.arrangement?.length) it.arrangement = stdOrder(it.arrangement); };
        fixItems(db.setlist); for (const sv of db.plan?.services || []) fixItems(sv.items);
        for (const c of Object.values(db.churchData || {})) { fixItems(c.setlist); for (const sv of c.plan?.services || []) fixItems(sv.items); }
        save(); reply({ type: 'standardized', changed, ordered, total: db.songs.length });
        break;
      }
      case 'saveArrangement': case 'deleteArrangement': {   // 🎼 named arrangements of a song, like ProPresenter
        const song = db.songs.find(x => x.id === m.songId); if (!song) break;
        const name = String(m.name || '').trim().slice(0, 40); if (!name) break;
        song.arrangements ||= {};
        if (m.type === 'deleteArrangement') delete song.arrangements[name];
        else song.arrangements[name] = (Array.isArray(m.value) ? m.value : []).map(v => String(v).slice(0, 40)).slice(0, 60);
        if (!Object.keys(song.arrangements).length) delete song.arrangements;
        song.updatedAt = new Date().toISOString(); save(); break;
      }
      case 'cleanLibrary': {                         // every song: site marks -> tags, no "/: :/", names for blocks, chorus after each verse
        if (!need(ws, 'leader')) return reply({ type: 'error', error: 'Doar liderul poate curăța toată biblioteca.' });
        try { fs.writeFileSync(path.join(DATA_DIR, `library.backup-${Date.now()}.json`), JSON.stringify(db)); } catch {}
        let changed = 0, ordered = 0;
        for (const song of db.songs) {
          const body = stdBody(core.normalizeImported(song.body));
          if (body !== song.body) { song.body = body; song.updatedAt = new Date().toISOString(); changed++; }
          if (!song.arrangement?.length) { const order = core.autoArrangement(song.body); if (order) { song.arrangement = order; ordered++; } }
        }
        save(); reply({ type: 'cleaned', changed, ordered, total: db.songs.length });
        break;
      }
      case 'setGuide': {                             // 🎧 track virtual: where each section starts, in bars (no audio is kept)
        const it = db.setlist[m.item]; const song = it?.kind === 'song' && db.songs.find(x => x.id === it.songId); if (!song) break;
        song.guide = (Array.isArray(m.marks) ? m.marks : []).slice(0, 80).map(x => ({ bar: Math.max(0, Math.min(999, Math.round(Number(x.bar) || 0))), p: Math.max(0, Math.min(80, Math.round(Number(x.p) || 0))) }))
          .filter((x, i, a) => a.findIndex(y => y.p === x.p) === i).sort((a, b) => a.bar - b.bar);
        song.updatedAt = new Date().toISOString(); break;
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
            .map(c => ({ t: Math.max(0, Math.round(Number(c.t) * 100) / 100), slide: Math.max(0, Math.floor(Number(c.slide) || 0)), ...(c.mark ? { mark: true } : {}),
              ...(c.song ? { song: String(c.song).slice(0, 60), label: String(c.label || '').slice(0, 40) } : {}) }))   // a part of another song sung on these tracks
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
        if ('bpm' in m && song?.stems?.length && !song.trackBpm && (it.bpm || song.bpm)) song.trackBpm = it.bpm || song.bpm;   // the tracks' tempo until now
        if ('bpm' in m) {
          const b = Math.round(Number(m.bpm));
          if (song && !song.bpm && b >= 30 && b <= 300) { song.bpm = b; it.bpm = undefined; }   // the first tempo given is the song's own
          else it.bpm = b >= 30 && b <= 300 && b !== song?.bpm ? b : undefined;
        }
        save(); break;
      }
      case 'trackBase': {                            // 🎯 the key / exact tempo / bar 1 of the recorded tracks (detected or told)
        const it = db.setlist[m.item]; const song = it?.kind === 'song' && db.songs.find(x => x.id === it.songId); if (!song) break;
        if ('key' in m) { const k = String(m.key || '').trim(); if (k && !core.KEYS.includes(k)) return reply({ type: 'error', error: 'Ton necunoscut: ' + k }); song.trackKey = k || undefined; }
        if ('bpm' in m) { const b = Math.round(Number(m.bpm) * 100) / 100; song.trackBpm = b >= 30 && b <= 300 ? b : undefined; if (song.trackBpm && !song.bpm) song.bpm = Math.round(song.trackBpm); }
        if ('offset' in m) song.beatOffset = Math.max(0, Math.round(Number(m.offset) * 1000) / 1000) || 0;
        song.updatedAt = new Date().toISOString(); save(); break;
      }
      case 'setKey': {                               // key for this program; chords on the stage follow it
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') break;
        const k = String(m.key || '').trim();
        if (k && !core.KEYS.includes(k)) return reply({ type: 'error', error: 'Ton necunoscut: ' + k });
        const sg = db.songs.find(x => x.id === it.songId);       // first change on a song with tracks: the key until now is the tracks' key
        if (sg?.stems?.length && !sg.trackKey) sg.trackKey = it.key || core.originalKey(sg.key, sg.body) || '';
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
        if (it.slideStyles) it.slideStyles = shiftSlides(it.slideStyles, m.slide, -1);
        if (it.slideLayers) it.slideLayers = shiftSlides(it.slideLayers, m.slide, -1);
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
        // looks and layers set on later slides move one place down; the copy gets the same ones
        if (it.slideStyles) it.slideStyles = shiftSlides(it.slideStyles, m.slide, 1);
        if (it.slideLayers) it.slideLayers = shiftSlides(it.slideLayers, m.slide, 1);
        save(); break;
      }
      case 'breakSlide': {                           // ✂ like Reflow in ProPresenter: a new slide starts at this line
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') break;
        const song = db.songs.find(x => x.id === it.songId); if (!song) break;
        const hit = slideSource(it, song, m.slide); if (!hit) break;
        const at = hit.from + Math.round(Number(m.line) || 0);
        if (at <= 0 || at >= hit.sec.lines.length) return reply({ type: 'error', error: 'Pune cursorul între două rânduri ca să rupi slide-ul acolo.' });
        // the section is cut in two with the same name: arrangements by name keep both halves, numbered ones are renumbered
        if (splitAtSlide(song, { ...hit, from: at, to: hit.sec.lines.length }, hit.sec.label || 'Verse') === null) return reply({ type: 'error', error: 'Nu am putut rupe slide-ul.' });
        save(); reply({ type: 'broken', slide: Number(m.slide) }); break;
      }
      case 'pasteSlides': {                          // ⌘V: copied slides (from this song or another one) go after a slide
        const it = db.setlist[m.item]; if (!it || it.kind !== 'song') return reply({ type: 'error', error: 'Slide-urile se lipesc într-o cântare din program.' });
        const song = db.songs.find(x => x.id === it.songId); if (!song) break;
        const list = (Array.isArray(m.slides) ? m.slides : []).slice(0, 40)
          .map(x => ({ label: String(x?.label || '').replace(/[:\n]/g, ' ').trim().slice(0, 40), lines: (Array.isArray(x?.lines) ? x.lines : []).map(l => String(l).replace(/\r|\n/g, ' ').slice(0, 300)).filter(l => l.trim()).slice(0, 20) }))
          .filter(x => x.lines.length);
        if (!list.length) break;
        let parsed = core.parseSong(song.body);
        const order = core.arrangementIndexes(parsed, it.arrangement || song.arrangement);
        if (!song.arrangement?.length) song.arrangement = core.arrangementIndexes(parsed, null).map(t => parsed[+t.slice(1)]?.label || t);   // the library order stays as it was
        const tokens = [];
        for (const x of list) {
          const same = parsed.findIndex(sec => sec.lines.join('\n') === x.lines.join('\n'));                      // already in this song: play it again
          if (same >= 0) { tokens.push('#' + same); continue; }
          song.body = song.body.replace(/\s+$/, '') + '\n\n' + (x.label ? x.label + ':\n' : '') + x.lines.join('\n') + '\n';   // from another song: added to this one
          parsed = core.parseSong(song.body); tokens.push('#' + (parsed.length - 1));
        }
        song.updatedAt = new Date().toISOString();
        const after = Number.isInteger(m.after) && m.after >= 0 ? slideSource(it, song, m.after) : null;
        const at = after ? after.pos + 1 : order.length;
        order.splice(at, 0, ...tokens);
        it.arrangement = order;
        const n0 = after ? m.after : slidesFor(m.item).length;
        for (let j = 0; j < tokens.length; j++) { if (it.slideStyles) it.slideStyles = shiftSlides(it.slideStyles, n0 + j, 1); if (it.slideLayers) it.slideLayers = shiftSlides(it.slideLayers, n0 + j, 1); }
        save(); reply({ type: 'pasted', count: tokens.length }); break;
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
        const body = stdBody(core.normalizeImported(String(s.body)));
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
      case 'noPin': {                                // 🔓 no PINs on the church network (⚙); the phones already connected get in at once
        if (!need(ws, 'leader')) return reply({ type: 'error', error: 'Doar liderul poate scoate PIN-urile.' });
        db.noPin = !!m.on;
        if (db.noPin) for (const [c, x] of sessions) if (c !== aiSocket && isLan(x.addr) && x.role !== 'leader') {
          x.role = 'leader'; try { c.send(JSON.stringify({ type: 'login', ok: true, role: 'leader' })); } catch {} }
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
            ? { notes: [], ...pick(m.item, ['id', 'kind', 'songId', 'title', 'key', 'minutes', 'leader', 'arrangement', 'maxLines', 'background', 'display', 'slideStyles', 'layers', 'slideLayers', 'notes', 'slides', 'ref', 'versions', 'autoAdvance', 'loop']), id: m.item.id || crypto.randomUUID() }
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
  const strip = list => JSON.stringify(list.map(({ notes, planNotes, ...it }) => it));
  if (strip(s.items) !== strip(db.setlist)) {
    const liveId = db.setlist[live.item]?.id;
    db.setlist = s.items.map(it => ({ ...structuredClone(it), notes: db.setlist.find(x => x.id === it.id)?.notes || [], ...(it.notes ? { planNotes: it.notes } : {}) }));
    live.item = liveId ? db.setlist.findIndex(x => x.id === liveId) : -1;
    if (live.item < 0) live.slide = 0;
  }
}

/** When the Live program came from a planned service, keep that service up to date. */
function syncLiveToPlan() {
  const s = db.service.planId && db.plan?.services.find(x => x.id === db.service.planId);
  if (!s) return;
  s.items = db.setlist.map(({ notes, planNotes, ...it }) => ({ ...structuredClone(it), ...(planNotes ? { notes: planNotes } : {}) }));
  s.title = db.service.title || s.title;
  if (db.service.startsAt) s.date = db.service.startsAt;
}

// Musician notes can be posted by anyone logged in as operator+ (musicians use operator PIN or
// the future Supabase login). Kept separate so it is easy to open up later.
const nrm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const allTags = () => [...new Set(db.songs.flatMap(s => s.tags || []))].sort((a, b) => a.localeCompare(b, 'ro'));
/** Tag names written loosely ("lauda", "închinare", "adorare" → Închinare) match the real ones. */
function tagMatch(tag) {
  const t = nrm(tag); if (!t) return null;
  const syn = { adorare: 'inchinare', worship: 'inchinare', praise: 'lauda', rapide: 'lauda', lente: 'inchinare' };
  const want = [t, syn[t]].filter(Boolean);
  return s => (s.tags || []).some(x => { const n = nrm(x); return want.some(w => n === w || n.startsWith(w) || w.startsWith(n)); });
}
function searchSongs(query, tag, loose = false) {
  const tm = tagMatch(tag);
  const list = db.songs.filter(s => !tm || tm(s));
  let ranked = query && String(query).trim()
    ? core.rankSongs(list, query)
    : list.sort((a, b) => a.title.localeCompare(b.title, 'ro'));
  if (loose && !ranked.length && query) {                 // assistant: drop filler words, then accept any word in the title
    const words = nrm(query).split(' ').filter(w => w.length > 2 && !['cantari', 'cantare', 'piese', 'piesa', 'pentru', 'din', 'sau', 'care'].includes(w));
    const tagWord = words.find(w => tagMatch(w) && db.songs.some(tagMatch(w)));
    if (tagWord && !tm) return searchSongs(words.filter(w => w !== tagWord).join(' '), tagWord, true);
    ranked = list.map(s => ({ s, n: words.filter(w => nrm(s.title).includes(w)).length })).filter(x => x.n).sort((a, b) => b.n - a.n).map(x => x.s);
  }
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
  /** 🗓 leaders' meetings and tasks, for the assistant ("pune pe agenda de marți…", "dă-i lui Andrei sarcina…") */
  plan: () => { db.plan.meetings ||= []; db.plan.tasks ||= []; return db.plan; },
  /** 🎛 ✦ Secțiuni automat: the computer with the tracks listens to the guide (Whisper runs there, in the page) */
  autoSections(cmd = 'aiCues') {
    const msg = JSON.stringify({ type: 'md', cmd }); let n = 0;
    for (const c of wss.clients) if (c.readyState === 1 && ROLE_RANK[sessions.get(c)?.role] >= 1) { c.send(msg); n++; }
    return n ? { ok: true, note: 'Calculatorul cu track-urile ascultă acum ghidul (durează cam un minut). Secțiunile apar pe track-uri și rămân salvate la cântare.' }
      : { error: 'Deschide MD&TRACK cu o cântare care are track-uri, apoi cere din nou.' };
  },
  /** ♪ chords on every section: one song (by title) or the whole library; runs in the background */
  chords(title = '') {
    if (chordsJob.running) return { error: 'Căutarea acordurilor rulează deja' };
    const list = title ? core.rankSongs(db.songs, title).slice(0, 1) : db.songs;
    if (!list.length) return { error: 'N-am găsit cântarea în bibliotecă' };
    if (list.length > 1) libraryBackup();
    runChordsJob(list);
    return { ok: true, started: title ? list[0].title : `toată biblioteca (${list.length} cântări)`, note: 'Rulează în fundal; progresul se vede la Bibliotecă (♪).' };
  },
  /** ✦ fill the empty team places of a service fairly (the live program's, unless another one is named) */
  fillTeam(serviceId, department = '') {
    const sv = db.plan.services.find(x => x.id === (serviceId || db.service.planId)) || db.plan.services.find(x => new Date(x.date) >= Date.now() - 6 * 3600_000);
    if (!sv) return { error: 'Nu am un serviciu planificat' };
    const op = { op: 'autoAssign', id: sv.id, department }; const err = this.planOp(op); if (err) return { error: err };
    const name = id => db.plan.volunteers.find(v => v.id === id)?.name;
    return { service: sv.title, date: sv.date, filled: op.filled, team: Object.entries(sv.assignments).map(([k, a]) => ({ place: k.split('#')[0], who: name(a.volunteer), status: a.status })),
      warnings: serviceWarnings(db.plan, sv) };
  },
  planOp(op) {
    const err = applyPlanOp(db.plan, op); if (err) return err;
    save(); broadcast(); const msg = JSON.stringify({ type: 'planChanged' }); for (const ws of wss.clients) if (ws.readyState === 1) ws.send(msg);
    return null;
  },
  state: () => ({
    church: activeChurch().name, service: db.service,
    program: db.setlist.map((it, i) => ({ position: i + 1, kind: it.kind,
      title: it.kind === 'song' ? db.songs.find(s => s.id === it.songId)?.title : it.title, key: it.key || '', minutes: it.minutes, display: it.display, background: it.background, look: it.look })),
    live: { position: live.item + 1, slide: live.slide + 1, blank: live.blank, background: live.background },
    display: db.display, looks: (db.looks || []).map(l => ({ id: l.id, name: l.name })), look_on: db.lookOn || null,
  }),
  run(m) { aiSocket.last = null; handleMessage(aiSocket, m); return aiSocket.last; },
  searchSongs, media: mediaList, tags: allTags,
  song: id => db.songs.find(s => s.id === id),
  /** The library song best matching a written title (or null). strict = only a clear title match. */
  findSong(title, strict = false) {
    const q = nrm(String(title).replace(/\(.*?\)|\b(in|în)\s+[A-G][#b]?m?\b|-\s*[A-G][#b]?m?$/g, ' '));
    if (!q) return null;
    const exact = db.songs.find(s => nrm(s.title) === q) || db.songs.find(s => nrm(s.title).startsWith(q) && q.length >= 6)
      || db.songs.find(s => q.startsWith(nrm(s.title)) && nrm(s.title).length >= 6);
    if (exact || strict) return exact || null;
    const r = core.rankSongs(db.songs, q); if (r.length) return r[0];
    const words = q.split(' ').filter(w => w.length > 2);      // most title words in common
    const best = db.songs.map(s => { const t = nrm(s.title); return { s, n: words.filter(w => t.includes(w)).length }; }).sort((a, b) => b.n - a.n)[0];
    return best && best.n >= Math.max(2, Math.ceil(words.length * 0.6)) ? best.s : null;
  },
  /** n songs from a category: rar = not sung for longest, des = most sung, oricare = shuffled. Skips songs already in the program. */
  pickSongs(n, tag, how) {
    const tm = tagMatch(tag), inProg = new Set((this.programSongIds?.() || db.setlist.map(i => i.songId)).filter(Boolean));
    let list = songUsage(60).filter(u => !inProg.has(u.id) && (!tm || tm(u)));
    if (how === 'rar') list.sort((a, b) => a.count - b.count || a.last - b.last);
    else if (how === 'des') list.sort((a, b) => b.count - a.count || b.last - a.last);
    else list = list.map(u => ({ u, r: Math.random() })).sort((a, b) => a.r - b.r).map(x => x.u);
    return list.slice(0, n);
  },
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
    fillTeam: (sid, dept) => aiHub.fillTeam(sid || serviceId, dept),
    chords: t => aiHub.chords(t),
    programSongIds: () => (svc()?.items || []).map(i => i.songId),
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

// a looser title: without a number in front ("1. Este-un vânt"), without what is in brackets ("(Cântă suflete)") and "live"…
const looseTitle = t => foldTitle(String(t || '').replace(/[([{].*?[)\]}]/g, ' ')).replace(/^\d+\s+/, '').replace(/\b(live|acoustic|official|version|varianta|v\d)\b/g, ' ').replace(/\s+/g, ' ').trim();
// the first words that are sung (no chords, no section names), to recognise the same song under another title
const firstWords = body => foldTitle(core.parseSong(String(body || '')).flatMap(sec => sec.lines).map(l => core.stripChords(l)).filter(l => l.trim()).slice(0, 2).join(' ')).slice(0, 40);
/** The songs of the library that are this Planning Center song: its own id, the same title, the same title written
 *  a little differently with the same first words, or the same first words. The best match comes first. */
export function sameSongs(x, body) {
  const ft = foldTitle(x.title), lt = looseTitle(x.title), fw = firstWords(body);
  const score = s => s.pcoId && s.pcoId === x.pcoId ? 4 : foldTitle(s.title) === ft ? 3
    : lt && looseTitle(s.title) === lt && (fw.length < 12 || firstWords(s.body) === fw || !firstWords(s.body)) ? 2
    : fw.length >= 20 && firstWords(s.body) === fw ? 1 : 0;
  return db.songs.map(s => [s, score(s)]).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([s]) => s);
}
/** Every program (all churches, Live and planned) that used `from` now uses `to`. */
function repointSong(from, to) {
  const fix = items => { for (const it of items || []) if (it.songId === from) it.songId = to; };
  fix(db.setlist); for (const s of db.plan?.services || []) fix(s.items);
  for (const c of Object.values(db.churchData || {})) { fix(c.setlist); for (const s of c.plan?.services || []) fix(s.items); }
}

/** Put Planning Center songs into the library: new ones are added, existing ones only get chords if they had none.
 *  With `prefer` ("Planning Center has the right version") the same song in the library is replaced, and copies of it
 *  (the same song twice) become one: the programs that used a copy use the replaced song. */
export function mergePcoSongs(list, { prefer = false, account = '' } = {}) {
  let added = 0, chords = 0, skipped = 0, replaced = 0, merged = 0, backedUp = false;
  for (const x of list) {
    const body = stdBody(core.normalizeImported(x.body || ''));
    if (!x.title || !body.trim()) { skipped++; continue; }
    const hits = sameSongs(x, body), have = hits[0];
    if (have) {
      if (prefer) {                                  // the same song more than once in the library: keep one
        for (const dup of hits.slice(1)) {
          if (dup.pcoAccount && account && dup.pcoAccount !== account) continue;          // another church's version stays
          if (dup.pcoId && x.pcoId && dup.pcoId !== x.pcoId && dup.pcoId !== have.pcoId) continue;   // another Planning Center song
          if (!backedUp) { try { libraryBackup(); } catch {} backedUp = true; }
          repointSong(dup.id, have.id); db.songs = db.songs.filter(s => s !== dup); merged++;
        }
      }
      const other = have.pcoAccount && account && have.pcoAccount !== account;     // the same song, already brought from another account
      if (!other) { have.pcoId = x.pcoId; if (account) have.pcoAccount = account; }
      // "Planning Center has the right version": its words, chords, key and order replace ours (ours stays in song.before)
      if (prefer && !other && (core.hasChords(body) || !core.hasChords(have.body)) && body.trim() !== have.body.trim()) {
        have.before = { body: have.body, key: have.key || '', arrangement: have.arrangement, savedAt: new Date().toISOString() };
        have.body = body; have.key = x.key || core.readMeta(body).key || have.key || '';
        if (x.bpm >= 30 && x.bpm <= 300) have.bpm = Math.round(x.bpm);
        const labels = core.parseSong(body).map(sec => sec.label.toLowerCase());
        const order = (x.sequence || []).map(l => String(l)).filter(l => labels.includes(l.toLowerCase()));
        const arr = order.length >= 2 ? order : core.autoArrangement(body);
        if (arr) have.arrangement = arr; else delete have.arrangement;
        have.title = x.title.slice(0, 120);                       // the Planning Center title too (no „1.” in front, diacritics)
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
  return { added, chords, skipped, replaced, ...(merged ? { merged } : {}) };
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
// safety copy of the library before changing many songs
function libraryBackup() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  fs.writeFileSync(path.join(DATA_DIR, `library.backup-${stamp}.json`), JSON.stringify(db, null, 2));
}
async function runChordsJob(list) {
  Object.assign(chordsJob, { running: true, stop: false });
  try {
    const result = await addChordsToSongs(list, core, {
      shouldStop: () => chordsJob.stop,
      extraSheets: q => searchLyrics(q, { chords: true, normalize: core.normalizeImported, limit: 4 }).then(r => r.filter(x => x.hasChords)),
      onProgress: p => chordsEvent({ ...p, running: true }),
      onSong: (song, r) => {
        song.body = r.body;
        if (!song.key) song.key = r.key;
        song.chordsSource = r.url;
        song.updatedAt = new Date().toISOString();
        save();
      },
    });
    chordsEvent({ running: false, finished: true, added: result.added.length, missed: result.missed, spread: result.spread.length });
    broadcast();
  } catch (e) {
    chordsEvent({ running: false, finished: true, error: e.message });
  } finally { chordsJob.running = false; }
}

// Once (2026.11.23.5, again in .7 for half-converted lines and bars): songs saved with chord letters as lines of words ("f", "Eb f Db Ab", "Intro: Ab Db") or with
// "Pre: …" / "R: …" in front of the words are cleaned like a new import, so the hall shows only the words.
// A copy of the library is kept first; a song whose sections changed loses its custom order (it gets the automatic one).
if (!db.migrated?.chordLines2) {
  try {
    const bad = db.songs.filter(x => core.needsChordCleanup?.(x.body || ''));
    if (bad.length) {
      libraryBackup();
      for (const song of bad) {
        const before = core.parseSong(song.body).length;
        song.body = core.normalizeImported(song.body); song.updatedAt = new Date().toISOString();
        if (core.parseSong(song.body).length !== before) {
          if (song.arrangement) song.arrangement = core.autoArrangement(song.body) || undefined;
          const lists = [db.setlist, db.plan?.services?.flatMap(s => s.items) || [], ...Object.values(db.churchData || {}).flatMap(c => [c.setlist || [], c.plan?.services?.flatMap(s => s.items) || []])];
          for (const it of lists.flat()) if (it?.songId === song.id) { delete it.arrangement; delete it.slideStyles; delete it.slideLayers; }
        }
      }
      console.log(`Cântări curățate (acorduri pe rânduri de versuri): ${bad.length}`);
    }
    db.migrated = { ...(db.migrated || {}), chordLines: true, chordLines2: true }; save();
  } catch (e) { logError('curățarea acordurilor', e); }
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
// Microsoft PowerPoint on a Mac (when Keynote cannot): it saves the slides as PDF exactly as they look in PowerPoint
const MAC_PPT_SCRIPT = `on run argv
  set inF to POSIX file (item 1 of argv)
  set outP to item 2 of argv
  tell application "Microsoft PowerPoint"
    open inF
    set p to active presentation
    save p in (POSIX file outP) as save as PDF
    close p saving no
  end tell
end run`;
let lastNativeError = '';
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
    lastNativeError = '';
    if (process.platform === 'darwin') {
      // Keynote and PowerPoint are sandboxed: give them a copy inside Documente/Betleem; Keynote first, then PowerPoint
      const src = path.join(work, 'p-' + Date.now().toString(36) + path.extname(file));
      fs.copyFileSync(file, src);
      try {
        for (const [app, script] of [['/Applications/Keynote.app', KEYNOTE_SCRIPT], ['/Applications/Microsoft PowerPoint.app', MAC_PPT_SCRIPT]]) {
          if (!fs.existsSync(app)) continue;
          try { await run('osascript', ['-e', script, src, out]); if (fs.existsSync(out) && fs.statSync(out).size > 0) break; }
          catch (e) { lastNativeError = String(e.message || e); logError('convert ' + path.basename(app), e); }
        }
      } finally { fs.rmSync(src, { force: true }); }
      if (!(fs.existsSync(out) && fs.statSync(out).size > 0)) return null;
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
      if (list.length > 1) libraryBackup();
      runChordsJob(list);
      return json(res, 200, { ok: true });
    }
    // ⇪ every song from ProPresenter on this computer (its own folders, or one the operator picks); the same song twice is skipped
    if (p === '/api/import/propresenter' && req.method === 'POST') {
      if (req.viaDoor || !checkPin(req)) return json(res, 403, { error: 'Doar pe calculatorul bisericii, cu PIN' });
      const m = JSON.parse((await body(req, 5000)) || '{}');
      let dirs = propres.defaultFolders();
      if (m.pick && EL) {                                // the operator shows the folder (ProPresenter → Settings → Library location)
        const r = await EL.dialog.showOpenDialog({ title: 'Alege folderul ProPresenter (cu fișierele .pro)', properties: ['openDirectory'] });
        if (r.canceled || !r.filePaths[0]) return json(res, 200, { canceled: true });
        dirs = [r.filePaths[0]];
      }
      if (!dirs.length) return json(res, 200, { files: 0, added: [], same: [], failed: [], dirs: [] });
      libraryBackup();
      const r = propres.importFolders(dirs, db.songs, core, s => {
        const order = s.arrangement || core.autoArrangement(s.body);
        const song = { id: crypto.randomUUID(), title: s.title, author: s.author, key: s.key, body: s.body, source: s.source, ...(s.tags ? { tags: s.tags } : {}),
          ...(order ? { arrangement: order } : {}), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        db.songs.push(song); return song;
      });
      if (r.added.length) { save(); broadcast(); }
      return json(res, 200, { ...r, dirs });
    }
    // 📥 the songs of another Betleem (its library.json, a backup or the leaders' package): only the songs are taken,
    // the ones already here are skipped (same name or same first lines), never overwritten
    if (p === '/api/import/betleem' && req.method === 'POST') {
      if (req.viaDoor || !checkPin(req)) return json(res, 403, { error: 'Doar pe calculatorul bisericii, cu PIN' });
      let src; try { src = JSON.parse(await body(req, 80_000_000)); } catch { return json(res, 400, { error: 'Nu e un fișier de bibliotecă Betleem' }); }
      const list = Array.isArray(src) ? src : Array.isArray(src?.songs) ? src.songs : null;
      if (!list) return json(res, 400, { error: 'În fișier nu sunt cântări Betleem' });
      const KEEP = ['title', 'author', 'key', 'body', 'source', 'ccli', 'chordsSource', 'arrangement', 'bpm', 'tags', 'createdAt'];
      const added = [], same = [];
      const ids = new Set(db.songs.map(x => x.id));
      for (const x of list) {
        if (!x || typeof x.title !== 'string' || typeof x.body !== 'string' || !x.body.trim()) continue;
        const hit = propres.findSame(db.songs, x.title, x.body);
        if (hit) { same.push({ title: x.title, existing: hit.title }); continue; }
        if (!added.length) libraryBackup();
        const song = Object.fromEntries(KEEP.filter(k => x[k] != null).map(k => [k, x[k]]));
        song.id = x.id && !ids.has(x.id) ? String(x.id) : crypto.randomUUID(); ids.add(song.id);
        song.title = song.title.trim().slice(0, 120); song.updatedAt = new Date().toISOString(); song.createdAt ||= song.updatedAt;
        db.songs.push(song); added.push(song.title);
      }
      if (added.length) { save(); broadcast(); }
      return json(res, 200, { files: list.length, added, same, failed: [] });
    }
    // 🎛 an Ableton Live set (.als): markers, tempo and time signature for MD&TRACK (the file is only read, not kept)
    if (p === '/api/import/ableton' && req.method === 'POST') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      try { return json(res, 200, parseAls(await body(req, 60_000_000, true))); }
      catch (e) { return json(res, 400, { error: e.message.startsWith('Nu e') ? e.message : 'Nu am putut citi setul Ableton' }); }
    }
    // ✍ the words of a song, corrected: diacritics, spelling, hyphens. Only the words change; chords stay on them,
    // sections and lines stay as they are. A line the AI changed too much keeps its old form.
    if (p === '/api/songs/fix' && req.method === 'POST') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const { body: text = '' } = JSON.parse((await body(req, 200_000)) || '{}');
      const lines = String(text).split('\n'), idx = [];
      lines.forEach((l, i) => { const t = core.stripChords(l).trim(); if (t && !core.isChordLine(t) && !/^\{/.test(t) && !/:\s*$/.test(t)) idx.push(i); });
      if (!idx.length) return json(res, 200, { body: text, changed: 0 });
      const ask = idx.map((i, k) => `${k + 1}| ${core.stripChords(lines[i]).trim()}`).join('\n');
      let answer;
      try {
        answer = await askAI(aiSettings, 'Corectezi versuri de cântări creștine în limba română. Pui diacriticele corecte (ă, â, î, ș, ț), corectezi greșelile de scriere și cratima (s-a, într-o, m-ai), majuscula la începutul rândului și la numele lui Dumnezeu (Isus, Domnul, Tu/Ție când e despre El). NU schimbi cuvintele, ordinea lor, rima sau sensul; nu adaugi și nu scoți rânduri. Primești rânduri numerotate „N| text”. Răspunzi DOAR cu aceleași rânduri, în același format „N| text”, fără alte explicații.', ask);
      } catch (e) { return json(res, 503, { error: e.message }); }
      const fixed = new Map();
      for (const m of String(answer).matchAll(/^\s*(\d+)\s*\|\s?(.*)$/gm)) fixed.set(+m[1], m[2].trim());
      const norm = w => core.normWord(w), words = t => t.split(/\s+/).map(norm).filter(Boolean);
      let changed = 0; const out = lines.slice();
      idx.forEach((i, k) => {
        const old = core.stripChords(lines[i]).trim(), neu = fixed.get(k + 1);
        if (!neu || neu === old) return;
        const a = words(old), b = words(neu);                       // the same words (diacritics apart), give or take one
        const same = a.filter(w => b.includes(w)).length;
        if (Math.abs(a.length - b.length) > 1 || same < Math.max(1, a.length - 1)) return;
        const lead = lines[i].match(/^\s*/)[0];
        out[i] = /\[[A-H]/.test(lines[i]) ? core.applyChords(lead + neu, lines[i]).body : lead + neu;   // chords back on their words
        changed++;
      });
      return json(res, 200, { body: out.join('\n'), changed });
    }
    // 🎤 sung words that are not from this song: which song (and which sections) of the library are they?
    if (p === '/api/songs/match' && req.method === 'POST') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const m = JSON.parse((await body(req, 100_000)) || '{}');
      const W = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2);
      const said = W(m.text); if (said.length < 4) return json(res, 200, []);
      const out = [];
      for (const song of db.songs) {
        if (song.id === m.except) continue;
        const secs = core.parseSong(song.body).filter(x => x.label);
        const hits = secs.map(sec => { const w = new Set(W(sec.lines.join(' '))); return { label: sec.label, score: said.filter(x => w.has(x)).length / said.length }; });
        const all = new Set(W(song.body)), score = said.filter(x => all.has(x)).length / said.length;
        if (score < 0.55) continue;
        const best = Math.max(...hits.map(h => h.score));
        out.push({ songId: song.id, title: song.title, score: Math.round(score * 100) / 100, sections: [...new Set(hits.filter(h => h.score >= Math.max(0.3, best * 0.6)).map(h => h.label))] });
      }
      return json(res, 200, out.sort((a, b) => b.score - a.score).slice(0, 3));
    }
    // 🔎 a new song that may already be in the library (same name, or the same first lines)
    if (p === '/api/songs/same' && req.method === 'POST') {
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const m = JSON.parse((await body(req, 200_000)) || '{}');
      const hit = propres.findSame(db.songs.filter(x => x.id !== m.id), String(m.title || ''), String(m.body || ''));
      return json(res, 200, hit ? { id: hit.id, title: hit.title } : {});
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
          db.setlist = s.items.map(it => ({ ...structuredClone(it), notes: [], ...(it.notes ? { planNotes: it.notes } : {}) }));
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
      const plan = db.plan, lead = checkLeader(req);
      plan.meetings ||= []; plan.tasks ||= [];
      if (plan.volunteers.some(v => !v.token)) { for (const v of plan.volunteers) v.token ||= newToken(); save(); }
      const { journal, ...shared } = plan;                    // the personal journals are never shown to others, not even leaders
      return json(res, 200, { ...shared, focus: focusByMonth(plan), currentPlanId: db.service.planId || null,
        volunteers: lead ? plan.volunteers : plan.volunteers.map(({ token, ...v }) => v),       // personal links: leaders only
        services: plan.services.map(s => ({ ...s, warnings: serviceWarnings(plan, s),
          items: s.items.map(it => it.kind === 'song' ? { ...it, title: db.songs.find(x => x.id === it.songId)?.title || it.title || '(cântare ștearsă)' } : it) })) });
    }
    if (p.startsWith('/api/canva/')) {                   // Canva: the leader connects once, then operators bring designs in
      if (p === '/api/canva/callback') {                 // Canva sends the browser back here after "Allow"
        if (!localReq(req)) return send(res, 403, 'Doar pe acest calculator');
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
      db.removedBg = (db.removedBg || []).filter(x => x !== name);                     // a deleted built-in one must not come back with the next start
      if (p.endsWith('trash')) db.removedBg.push(name);
      save();
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
    // ⇩ the backgrounds of another Betleem on the church network (the main computer): only the missing ones are copied here
    if (p === '/api/media/pull') {
      if (req.method === 'GET') return json(res, 200, { ...mediaPull });
      if (req.viaDoor || !checkPin(req)) return json(res, 403, { error: 'Doar pe calculatorul bisericii, cu PIN' });
      const m = JSON.parse(await body(req, 2000) || '{}');
      const peer = peerList().find(x => x.url === m.url);   // only a Betleem seen on the network
      if (!peer) return json(res, 400, { error: 'Nu mai văd acel calculator în rețea' });
      if (!mediaPull.running) pullMedia(peer);
      return json(res, 200, { ...mediaPull });
    }
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
      if (!(TRUST_LOCALHOST && localReq(req))) return json(res, 403, { error: 'Doar pe acest calculator' });
      return json(res, 200, { name: os.hostname().replace(/\.local$/, ''), urls: lanIPs().map(i => `http://${i.address}:${PORT}`), pin: PIN, leaderPin: LEADER_PIN, preacherPin: db.preacherPin, publicUrl: db.security?.door && db.security.publicUrl || '' });
    }
    if (p === '/api/preacher/pin' && req.method === 'POST') {   // ↻ a new preacher PIN: the old QR stops working
      if (!checkLeader(req)) return json(res, 401, { error: 'Doar liderul (PIN de lider).' });
      db.preacherPin = newPreacherPin(); save();
      for (const [w, x] of sessions) if (x.role === 'preacher') x.role = 'viewer';
      broadcast(); return json(res, 200, { preacherPin: db.preacherPin });
    }
    if (p === '/api/eu') {                                    // 🙋 a volunteer's own page, by his personal link (no password)
      const t = String(url.searchParams.get('t') || ''); let me = null, plan = null, church = null;
      if (t.length >= 20) for (const [cid, pl] of [[activeChurch()?.id, db.plan], ...Object.entries(db.churchData || {}).map(([k, d]) => [k, d?.plan])]) {
        const v = pl?.volunteers?.find(x => x.token && safeEq(x.token, t)); if (v) { me = v; plan = pl; church = (db.churches || []).find(c => c.id === cid) || activeChurch(); break; }
      }
      if (!me) return json(res, 404, { error: 'Linkul nu mai e valabil. Cere-i liderului unul nou.' });
      plan.meetings ||= []; plan.tasks ||= [];
      const posName = pid => { for (const d of plan.departments) { const p2 = d.positions.find(x => x.id === pid); if (p2) return { pos: p2.name, dept: d.name, color: d.color }; } return { pos: '', dept: '' }; };
      // 📷 photographers: originals (no compression) into the church's photo folder (the NAS), one folder per event
      const photoRoot = db.security?.photoDir || path.join(DATA_DIR, 'poze');
      const eventDir = ev => path.join(photoRoot, String(ev || new Date().toISOString().slice(0, 10)).replace(/[^\w ăâîșțĂÂÎȘȚ.-]/g, '_').trim().slice(0, 80) || 'poze', me.name.replace(/[^\w ăâîșțĂÂÎȘȚ.-]/g, '_'));
      if (req.method === 'POST' && url.searchParams.get('photo')) {
        if (!me.photographer) return json(res, 403, { error: 'Cere-i liderului să te treacă la fotografi.' });
        const dir = eventDir(url.searchParams.get('event')), name = path.basename(String(url.searchParams.get('photo'))).replace(/[^\w ăâîșțĂÂÎȘȚ().-]/g, '_').slice(-120);
        if (!/\.(jpe?g|png|heic|heif|dng|cr2|cr3|nef|arw|raf|tiff?|webp|mp4|mov)$/i.test(name)) return json(res, 400, { error: 'Doar poze și video' });
        fs.mkdirSync(dir, { recursive: true });
        const to = path.join(dir, name), tmp = to + '.part'; let size = 0;
        try {
          await new Promise((ok, bad) => { const out = fs.createWriteStream(tmp);
            req.on('data', c => { size += c.length; if (size > 2 * 1024 ** 3) { req.destroy(); bad(new Error('Prea mare')); } });
            req.pipe(out); out.on('finish', ok); out.on('error', bad); req.on('error', bad); });
        } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch {} return json(res, 400, { error: e.message }); }
        fs.renameSync(tmp, to);
        return json(res, 200, { ok: true });
      }
      const preaches = (sv, key) => /predic|pastor|vorbitor|mesaj/i.test(posName(key.split('#')[0]).pos) && sv.assignments[key]?.volunteer === me.id;
      if (req.method === 'POST' && url.searchParams.get('upload')) {   // 📎 the preacher puts his own presentation for the sermon (until the last minute)
        const sv = plan.services.find(x => x.id === url.searchParams.get('service'));
        if (!sv || !Object.keys(sv.assignments).some(k => preaches(sv, k))) return json(res, 403, { error: 'Poți pune prezentarea doar pentru predica ta.' });
        const name = inboxName(url.searchParams.get('upload'));
        if (!name || !INBOX_EXT.includes(path.extname(name).toLowerCase())) return json(res, 400, { error: 'Pot primi PowerPoint, Keynote, PDF, poze și video.' });
        const final = freeName(INBOX_DIR, name), tmp = path.join(INBOX_DIR, '.' + final + '.part'); let size = 0;
        try {
          await new Promise((ok, bad) => { const out = fs.createWriteStream(tmp);
            req.on('data', c => { size += c.length; if (size > 800 * 1024 * 1024) { req.destroy(); bad(new Error('Fișierul e prea mare')); } });
            req.pipe(out); out.on('finish', ok); out.on('error', bad); req.on('error', bad); });
        } catch (e) { try { fs.rmSync(tmp, { force: true }); } catch {} return json(res, 400, { error: e.message }); }
        fs.renameSync(tmp, path.join(INBOX_DIR, final));
        const it = sv.items.find(x => x.kind === 'sermon');
        if (it) { it.incoming = { file: final, from: me.name, at: new Date().toISOString() }; if (db.service.planId === sv.id) planToLive(); }
        save(); broadcast(); inboxEvent({ added: final, via: 'predicator · ' + me.name });
        return json(res, 200, { ok: true, name: final });
      }
      if (req.method === 'POST') {
        const m = JSON.parse(await body(req, 20_000) || '{}');
        if (m.action === 'answer') {                          // ✓ I'll be there / ✕ I can't
          const sv = plan.services.find(x => x.id === m.service), a = sv?.assignments[m.key];
          if (!a || a.volunteer !== me.id) return json(res, 400, { error: 'Nu mai ești pus aici.' });
          a.status = m.status === 'declined' ? 'declined' : 'confirmed'; a.answeredAt = new Date().toISOString();
        } else if (m.action === 'away') {                     // the days I can't serve, and how often I can
          me.away = [...new Set((m.away || []).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort().slice(0, 120);
          if (m.maxPerMonth !== undefined) me.maxPerMonth = Math.min(8, Math.max(0, Math.round(Number(m.maxPerMonth) || 0)));
        } else if (m.action === 'photoHave') {                // which photos are already there (an interrupted upload goes on from where it stopped)
          if (!me.photographer) return json(res, 403, { error: 'Nu ești la fotografi' });
          const dir = eventDir(m.event), have = [];
          for (const f of (m.files || []).slice(0, 3000)) { try { if (fs.statSync(path.join(dir, path.basename(String(f.name)))).size === Number(f.size)) have.push(f.name); } catch {} }
          return json(res, 200, { have });
        } else if (m.action === 'journal') {                 // 📓 my day, only for me
          plan.journal ||= {}; const day = /^\d{4}-\d{2}-\d{2}$/.test(m.day) ? m.day : new Date().toISOString().slice(0, 10);
          const list = plan.journal[me.id] ||= []; const e = list.find(x => x.day === day);
          const text = String(m.text || '').slice(0, 4000); if (e) e.text = text; else list.unshift({ day, text });
          plan.journal[me.id] = list.filter(x => x.text.trim()).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 400);
        } else if (m.action === 'journalSummary') {          // ✦ a short look back: the week against the year's goals (asked only by him)
          const week = (plan.journal?.[me.id] || []).filter(x => Date.now() - new Date(x.day) < 8 * 864e5);
          const goals = (plan.goals || []).map(g => `${g.text}: ${g.done}/${g.target} ${g.unit}`).join('\n') || 'fără obiective scrise';
          if (!week.length) return json(res, 200, { summary: 'Scrie întâi câteva zile în jurnal.' });
          try {
            const summary = await askAI({ ...aiSettings, provider: 'ollama' }, 'Ești un mentor creștin cald și scurt. Răspunzi în română, în maxim 8 rânduri: ce a mers bine săptămâna asta, cât s-a apropiat de obiective (estimează un procent), unde s-a abătut, și un pas concret pentru săptămâna viitoare. Fără predici lungi.',
              `Obiectivele anului:\n${goals}\n\nJurnalul ultimei săptămâni:\n${week.map(x => x.day + ': ' + x.text).join('\n')}`);
            return json(res, 200, { summary });
          } catch (e) { return json(res, 200, { summary: 'Asistentul nu e pornit acum (' + e.message + ').' }); }
        } else if (m.action === 'task') {                     // ☐ / ☑ one of my tasks
          const tk = plan.tasks.find(x => x.id === m.task && x.who === me.id); if (!tk) return json(res, 400, { error: 'Sarcina nu e a ta.' });
          tk.done = !!m.done; tk.doneAt = tk.done ? new Date().toISOString() : '';
        } else return json(res, 400, { error: 'Nu înțeleg' });
        save(); broadcast();
        const msg = JSON.stringify({ type: 'planChanged' }); for (const ws of wss.clients) if (ws.readyState === 1 && sessions.get(ws)?.role === 'leader') ws.send(msg);
      }
      const now = Date.now() - 6 * 3600_000, name = id => plan.volunteers.find(v => v.id === id)?.name || '';
      const serve = plan.services.filter(x => new Date(x.date).getTime() >= now).flatMap(sv => Object.entries(sv.assignments).filter(([, a]) => a.volunteer === me.id)
        .map(([key, a]) => ({ service: sv.id, key, date: sv.date, title: sv.title, status: a.status, ...posName(key.split('#')[0]) }))).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 20);
      const myDepts = new Set(plan.departments.filter(d => d.positions.some(p2 => me.positions.includes(p2.id))).map(d => d.id));
      const myServices = new Set(plan.services.filter(sv => Object.values(sv.assignments).some(a => a.volunteer === me.id)).map(sv => sv.id));
      const messages = (plan.messages || []).filter(m => Date.now() - new Date(m.at) < 30 * 864e5 && (m.to === 'all' || (m.to === 'dept' && myDepts.has(m.ref)) || (m.to === 'service' && myServices.has(m.ref)))).slice(0, 5)
        .map(({ text, from, at }) => ({ text, from, at }));
      for (const x of serve) { const sv = plan.services.find(y => y.id === x.service); x.preach = preaches(sv, x.key); if (x.preach) x.incoming = sv.items.find(i => i.kind === 'sermon')?.incoming?.file || ''; }
      return json(res, 200, { name: me.name, church: church?.name || '', away: me.away || [], maxPerMonth: me.maxPerMonth || 0, leader: !!me.leader, photographer: !!me.photographer, serve, messages,
        journal: me.leader ? (plan.journal?.[me.id] || []).slice(0, 14) : [], goals: me.leader ? (plan.goals || []).map(({ text, target, done, unit }) => ({ text, target, done, unit })) : [],
        tasks: plan.tasks.filter(tk => tk.who === me.id).sort((a, b) => (a.done - b.done) || (a.due || '9').localeCompare(b.due || '9')).slice(0, 40),
        meetings: me.leader ? plan.meetings.filter(mt => new Date(mt.date).getTime() >= now).slice(0, 3).map(mt => ({ ...mt,
          tasks: plan.tasks.filter(tk => tk.meeting === mt.id).map(tk => ({ text: tk.text, who: name(tk.who), due: tk.due, done: tk.done })) })) : [] });
    }
    // 📦 give Betleem (with the song library) to the churches around: personal links made by the leader on this Mac
    if (p === '/api/reverb') {                              // 🔗 Reverb online: link this computer (leader, on the church network)
      if (req.viaDoor || !checkLeader(req)) return json(res, 403, { error: 'Doar liderul, pe calculatorul bisericii.' });
      if (req.method === 'POST') {
        const m = JSON.parse(await body(req, 2000) || '{}');
        if (m.off) return json(res, 200, reverb.unlink());
        if (m.key) { const k = String(m.key).trim(); if (!/^[A-Za-z0-9_-]{24,80}$/.test(k)) return json(res, 400, { error: 'Cheia nu arată bine. Copiaz-o din nou din Reverb online.' });
          await reverb.link(k, activeChurch().id); }
        else await reverb.syncNow();
      }
      return json(res, 200, reverb.status());
    }
    if (p === '/api/shares') {                              // the leader, on this computer: the links and the package
      if (req.viaDoor || !checkLeader(req)) return json(res, 403, { error: 'Doar liderul, pe calculatorul bisericii.' });
      if (req.method === 'POST') {
        const m = JSON.parse(await body(req, 5000) || '{}');
        if (m.new) {
          const days = Math.min(90, Math.max(1, Number(m.days) || 14));
          db.shares.push({ id: crypto.randomUUID().slice(0, 8), name: String(m.name || 'Lider').trim().slice(0, 60) || 'Lider',
            token: crypto.randomBytes(18).toString('base64url'), created: new Date().toISOString(), expires: new Date(Date.now() + days * 864e5).toISOString(), downloads: 0 });
          if (!pkg.building && pkgStale()) buildPackage();
        }
        if (m.off) db.shares = db.shares.filter(x => x.id !== m.off);
        if (m.build) buildPackage();
        save();
      }
      const bases = [...lanIPs().map(i => `http://${i.address}:${PORT}`), ...(db.security.door && db.security.publicUrl ? [db.security.publicUrl] : [])];
      return json(res, 200, { package: pkgInfo(), door: !!(db.security.door && db.security.publicUrl), bases,
        shares: db.shares.filter(x => Date.parse(x.expires) > Date.now()).map(x => ({ ...x })) });
    }
    if (p === '/api/descarca' || p === '/api/descarca/Reverb.dmg' || p === '/api/descarca/Betleem-Mac.zip') {   // the leader who got a link (church Wi-Fi, Tailscale or the 🔒 door)
      const ip = who(req);
      if (locked(ip)) return json(res, 429, { error: 'Prea multe încercări. Mai încearcă peste câteva minute.' });
      const sh = shareOf(url.searchParams.get('t'));
      if (!sh) { wrongPin(ip); return json(res, 404, { error: 'Linkul nu mai e valabil. Cere unul nou liderului de la Betleem.' }); }
      if (p === '/api/descarca') return json(res, 200, { name: sh.name, expires: sh.expires, church: activeChurch()?.name || 'Betleem', ...pkgInfo() });
      if (!pkg.ready || !fs.existsSync(PKG_FILE)) { if (!pkg.building) buildPackage(); return json(res, 503, { error: 'Pachetul se pregătește. Încearcă din nou peste un minut.' }); }
      sh.downloads = (sh.downloads || 0) + 1; save();
      const st = fs.statSync(PKG_FILE);
      res.writeHead(200, { 'content-type': 'application/x-apple-diskimage', 'content-length': st.size, 'content-disposition': 'attachment; filename="Reverb.dmg"', 'cache-control': 'no-store' });
      return fs.createReadStream(PKG_FILE).pipe(res);
    }
    if (p === '/api/security') {                            // 🔒 the leader, on this computer only
      if (req.viaDoor || !checkLeader(req)) return json(res, 403, { error: 'Doar liderul, pe calculatorul bisericii.' });
      if (req.method === 'POST') {
        const m = JSON.parse(await body(req, 5000) || '{}');
        if ('door' in m) db.security.door = !!m.door;
        if (typeof m.publicUrl === 'string') { const u = m.publicUrl.trim().replace(/\/+$/, ''); if (u && !/^https:\/\/[\w.-]+$/.test(u)) return json(res, 400, { error: 'Adresa trebuie să fie de forma https://nume.ts.net' }); db.security.publicUrl = u; }
        if (typeof m.backupDir === 'string') db.security.backupDir = m.backupDir.trim().slice(0, 300);
        if (typeof m.photoDir === 'string') db.security.photoDir = m.photoDir.trim().slice(0, 300);
        if (m.backupNow) backup();
        save();
      }
      let log = [];
      try { log = fs.readFileSync(ACCESS_LOG, 'utf8').trim().split('\n').slice(-12).reverse(); } catch {}
      return json(res, 200, { ...db.security, doorPort: DOOR_PORT, doorOpen: !!db.security.door && sendServer.listening, log });
    }
    if (p === '/api/next' && req.method === 'GET') {          // the QR at the office: the next program, read only, no PIN, no personal data
      const now = Date.now() - 3 * 3600_000, list = (db.plan?.services || []).filter(x => new Date(x.date).getTime() >= now).sort((a, b) => a.date.localeCompare(b.date));
      const s = list.find(x => x.status === 'published') || list[0];
      const church = activeChurch();
      if (!s) return json(res, 200, { church: church?.name || '', service: null });
      return json(res, 200, { church: church?.name || '', logo: church?.logo || '', service: { title: s.title, date: s.date, draft: s.status !== 'published',
        items: s.items.map(it => ({ kind: it.kind, minutes: it.minutes || 0, key: it.kind === 'song' ? it.key || '' : '', leader: it.leader || '',
          title: it.kind === 'song' ? db.songs.find(x => x.id === it.songId)?.title || it.title || '' : it.title || '' })) } });
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
      const native = (process.platform === 'darwin' && (fs.existsSync('/Applications/Keynote.app') || fs.existsSync('/Applications/Microsoft PowerPoint.app'))) || process.platform === 'win32';
      if (!findOffice() && !native) return json(res, 200, { office: false });
      const buf = await body(req, 300 * 1024 * 1024, true);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'betleem-show-')), src = path.join(dir, name);
      fs.writeFileSync(src, buf);
      try {
        const pdf = await toPdf(src);
        if (!pdf) {
          // macOS refused: Betleem may not control Keynote / PowerPoint yet (Privacy & Security → Automation)
          const denied = /-1743|not authori[sz]ed|nu este autorizat|not allowed/i.test(lastNativeError);
          return json(res, 200, { office: false, denied, error: denied
            ? 'macOS nu-i dă voie lui Betleem să deschidă Keynote / PowerPoint. Deschide Setări sistem → Confidențialitate și securitate → Automatizare → Betleem și bifează Keynote și Microsoft PowerPoint, apoi importă din nou. Până atunci, slide-urile sunt desenate de Betleem și pot arăta altfel decât în PowerPoint.'
            : 'Nu am putut deschide prezentarea cu Keynote / PowerPoint, așa că slide-urile sunt desenate de Betleem și pot arăta altfel decât în PowerPoint.' });
        }
        res.writeHead(200, { 'content-type': 'application/pdf' }); const data = fs.readFileSync(pdf);
        if (pdf.includes(path.sep + 'conversie' + path.sep)) fs.rmSync(pdf, { force: true });
        return res.end(data);
      } catch (e) { logError('convert', e); return json(res, 200, { office: true, error: 'Conversia a eșuat: ' + e.message }); }
      finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    if (p.startsWith('/media/')) return file(res, MEDIA_DIR, decodeURIComponent(p.slice(7)), req);
    if (p === '/api/plan/year/churches' && req.method === 'GET') {   // which church the plan belongs to: the one whose name matches, else a new one
      if (!checkLeader(req)) return json(res, 401, { error: 'Doar liderul (PIN de lider).' });
      const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const want = fold(url.searchParams.get('name')).replace(/^biserica\s+/, '').replace(/\s+pestera$/, '');
      const match = want && db.churches.find(c => (fold(c.name).length > 3 && fold(c.name).includes(want)) || (/pestera/.test(fold(c.name) + fold(c.city)) && /raul vietii/.test(want)));
      return json(res, 200, { churches: db.churches.map(c => ({ id: c.id, name: c.name, active: c.id === db.activeChurch })), suggested: match?.id || '' });
    }
    if (p === '/api/plan/year' && req.method === 'POST') {    // 📅 the pastor's year plan document → that church's plan (and, if wanted, its vision and logo)
      if (!checkLeader(req)) return json(res, 401, { error: 'Doar liderul (PIN de lider).' });
      const m = JSON.parse(await body(req, 400_000) || '{}');
      let c = db.churches.find(x => x.id === m.churchId);
      if (!c && m.newChurch) {                               // a new church for it (no code yet: it can be set from the churches menu)
        c = { id: crypto.randomUUID(), name: String(m.newChurch).trim().slice(0, 60) || 'Biserică nouă', city: '', code: null }; db.churches.push(c);
      }
      c ||= activeChurch();
      const isActive = c.id === db.activeChurch;
      const box = isActive ? null : (db.churchData[c.id] ||= { setlist: [], service: { title: 'Serviciu duminică', startsAt: null }, plan: defaultPlan() });
      if (box) box.plan ||= defaultPlan();
      const plan = isActive ? db.plan : box.plan;
      const op = { op: 'importYear', data: m.data, tz: m.tz }; const err = applyPlanOp(plan, op); if (err) return json(res, 400, { error: err });
      if (m.vision && plan.year?.vision && !c.vision) c.vision = plan.year.vision;
      const ext = m.logo && /^[a-z0-9-]+$/.test(m.logo) && ['.png', '.svg'].find(e => fs.existsSync(path.join(PUBLIC, 'logos', m.logo + e)));
      if (ext) { const f = 'logo-echipa-' + m.logo + ext; fs.copyFileSync(path.join(PUBLIC, 'logos', m.logo + ext), path.join(MEDIA_DIR, f)); c.logo = f; }   // the church's own logo
      save(); broadcast(); const msg = JSON.stringify({ type: 'planChanged' }); for (const ws of wss.clients) if (ws.readyState === 1) ws.send(msg);
      return json(res, 200, { ok: true, created: op.created, goals: plan.goals.filter(g => g.code).length, tasks: plan.tasks.filter(t => t.code).length, church: c.name, other: !isActive });
    }
    if (p === '/api/displays') {                                 // 🖥 the monitors by name, and which one shows the projector / the stage
      if (req.viaDoor || !checkPin(req)) return json(res, 403, { error: 'Doar pe calculatorul bisericii' });
      if (req.method === 'POST') {
        const m = JSON.parse(await body(req, 2000) || '{}');
        if (m.wireless && EL) {                                // 📡 AirPlay / Miracast: the computer's own "add a display" settings
          const u = process.platform === 'darwin' ? 'x-apple.systempreferences:com.apple.Displays-Settings.extension' : process.platform === 'win32' ? 'ms-settings:display' : '';
          if (u) EL.shell.openExternal(u).catch(() => {});
        }
        if (['main', 'stage'].includes(m.kind)) await pickDisplay(m.kind, m.id);
      }
      return json(res, 200, { inApp: !!EL, displays: displaysInfo() });
    }
    if (p === '/api/brand') {                                    // 🎨 the church's own layer: Documents/Betleem/personalizare.json
      const F = path.join(DATA_DIR, 'personalizare.json'); let b = {}; try { b = JSON.parse(fs.readFileSync(F, 'utf8')); } catch {}
      if (req.method === 'POST') {
        if (req.viaDoor || !checkLeader(req)) return json(res, 403, { error: 'Doar liderul.' });
        const m = JSON.parse(await body(req, 5000) || '{}');
        b = { accent: /^#[0-9a-f]{6}$/i.test(m.accent || '') ? m.accent : '', off: (Array.isArray(m.off) ? m.off : []).filter(x => ['md', 'lumini', 'lideri', 'asistent', 'voluntari'].includes(x)) };
        fs.writeFileSync(F, JSON.stringify(b, null, 1)); broadcast();
      }
      return json(res, 200, b);
    }
    if (p === '/api/ghid' && req.method === 'GET') return json(res, 200, guideVoices());          // 🎧 the voices for the guide
    if (p === '/api/pads' && req.method === 'GET') return json(res, 200, audioIn(PAD_DIR));            // 🎹 the church's recorded pads
    if (p.startsWith('/pads/')) return file(res, PAD_DIR, path.basename(decodeURIComponent(p.slice(6))), req);
    if (p === '/api/tracks/link' && req.method === 'POST') {                                       // 🔗 the one tracks folder → the songs
      if (!checkPin(req)) return json(res, 401, { error: 'PIN greșit' });
      const r = linkTrackFolder(); save(); broadcast(); return json(res, 200, r);
    }
    if (p.startsWith('/ghid/')) return file(res, GHID_DIR, path.basename(decodeURIComponent(p.slice(6))), req);
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

// 🎧 the church's guide voices ("Chorus", "Verse 2", "1"…): Documents/Betleem/ghid. A ghid-voci.zip put in
// Documents/Betleem is unpacked there once. They stay on this computer (they may be licensed): never in updates.
const GHID_DIR = path.join(DATA_DIR, 'ghid');
function guideVoices() {
  const zip = path.join(DATA_DIR, 'ghid-voci.zip');
  if (fs.existsSync(zip) && !fs.existsSync(GHID_DIR)) {
    try {
      fs.mkdirSync(GHID_DIR, { recursive: true });
      execFileSync(process.platform === 'win32' ? 'tar' : 'unzip', process.platform === 'win32' ? ['-xf', zip, '-C', GHID_DIR] : ['-q', '-j', '-o', zip, '-d', GHID_DIR], { timeout: 60000 });
      for (const f of fs.readdirSync(GHID_DIR, { recursive: true })) {      // folders inside the zip: bring the sounds up
        const full = path.join(GHID_DIR, String(f));
        if (fs.statSync(full).isFile() && path.dirname(full) !== GHID_DIR) fs.renameSync(full, path.join(GHID_DIR, path.basename(full)));
      }
    } catch (e) { logError('vocile de ghid', e); }
  }
  try { return fs.readdirSync(GHID_DIR).filter(f => /\.(wav|mp3|m4a|aif|aiff|ogg|flac)$/i.test(f) && !f.startsWith('.')).sort(); } catch { return []; }
}
// 🎹 recorded pads (one file per key) and 🔗 the one place for all tracks: Documents/Betleem/trackuri/<song title>/<stem>.wav
const PAD_DIR = path.join(DATA_DIR, 'pad'), TRACKS_DIR = path.join(DATA_DIR, 'trackuri');
fs.mkdirSync(PAD_DIR, { recursive: true }); fs.mkdirSync(TRACKS_DIR, { recursive: true });
const audioIn = dir => { try { return fs.readdirSync(dir).filter(f => /\.(wav|mp3|m4a|aif|aiff|ogg|flac)$/i.test(f) && !f.startsWith('.')).sort(); } catch { return []; } };
/** every folder in trackuri/ named like a song becomes that song's stems (files are linked, not copied, when possible) */
function linkTrackFolder() {
  const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const linked = [], unknown = [];
  for (const dir of fs.readdirSync(TRACKS_DIR, { withFileTypes: true }).filter(d => d.isDirectory())) {
    const song = db.songs.find(s => fold(s.title) === fold(dir.name)) || db.songs.find(s => fold(dir.name).startsWith(fold(s.title)) && fold(s.title).length > 5);
    if (!song) { unknown.push(dir.name); continue; }
    const files = audioIn(path.join(TRACKS_DIR, dir.name)); if (!files.length) continue;
    const stems = [];
    for (const f of files.slice(0, 24)) {
      const name = ('trk-' + fold(song.title).replace(/ /g, '-').slice(0, 30) + '-' + f).replace(/[^\w.\-]/g, '_'), to = path.join(MEDIA_DIR, name);
      if (!fs.existsSync(to)) { try { fs.linkSync(path.join(TRACKS_DIR, dir.name, f), to); } catch { fs.copyFileSync(path.join(TRACKS_DIR, dir.name, f), to); } }
      const old = song.stems?.find(x => x.file === name);
      stems.push(old || { file: name, name: f.replace(/\.[a-z0-9]+$/i, '').slice(0, 30), vol: 1, muted: false, pan: 0 });
    }
    song.stems = stems; linked.push(song.title);
  }
  return { linked, unknown };
}
const guesses = new Map();                     // address → { n, until }: slows down anyone trying PINs one after another
const who = req => String((req.viaDoor && req.headers['x-forwarded-for']?.split(',')[0].trim()) || req.socket?.remoteAddress || '?');
function locked(addr) { const g = guesses.get(addr); return !!g && g.until > Date.now(); }
function wrongPin(addr) {
  const g = guesses.get(addr) || { n: 0, until: 0 }; g.n++;
  if (g.n >= 5) g.until = Date.now() + Math.min(3600_000, 60_000 * 2 ** (g.n - 5));   // 1 min, 2, 4… max 1 h
  guesses.set(addr, g); if (guesses.size > 5000) guesses.clear();
}
function pinCheck(req, ok) {
  const addr = who(req), given = req.headers['x-pin'];
  if (given && locked(addr)) return false;
  if (ok(given)) { guesses.delete(addr); return true; }
  if (given) wrongPin(addr);
  return false;
}
function checkLeader(req) { return !LEADER_PIN || (TRUST_LOCALHOST && localReq(req)) || openLan(req) || (!req.viaDoor && pinCheck(req, x => safeEq(x, LEADER_PIN))); }
function checkPin(req) { return !PIN || (TRUST_LOCALHOST && localReq(req)) || openLan(req) || (!req.viaDoor && pinCheck(req, x => safeEq(x, PIN) || safeEq(x, LEADER_PIN))); }
function safeEq(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo)); }
function pick(o, keys) { const r = {}; for (const k of keys) if (o && k in o) r[k] = o[k]; return r; }
const SAFE = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'SAMEORIGIN' };   // links carry personal tokens: never leak them
function send(res, code, data, type) { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-cache', ...SAFE }); res.end(data); }
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
    res.writeHead(206, { ...SAFE, 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    return fs.createReadStream(full, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...SAFE, 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', ...(/\.(html|js|css)$/.test(full) ? { 'cache-control': 'no-cache' } : {}) });
  fs.createReadStream(full).pipe(res);
}

// Resolves when listening, rejects (e.g. EADDRINUSE) instead of crashing the desktop app.
export const ready = new Promise((ok, bad) => { server.once('listening', ok); server.once('error', bad); });
ready.catch(() => {});
// ---- 🔒 Security: the public door, daily backups, access log -------------------------------------------------
// The app itself stays on the church network. From the internet there is only the tiny server on 127.0.0.1 that
// already receives files from phones (sendServer, below). When the leader opens "the door", that same server also
// answers the volunteers' pages listed here, and NOTHING else (control, planning, PINs, screens, media, WebSocket).
// A tunnel (Tailscale Funnel: a fixed https address) brings internet requests to it. No router ports are opened.
db.security ||= { door: false, publicUrl: '', backupDir: '' };
const DOOR_PORT = PORT + 1;                          // = SEND_PORT
const DOOR_PAGES = new Set(['/descarca.html', '/eu.html', '/live.html', '/client.js', '/core/song.js', '/fit.js', '/glass.js', '/glass.css', '/manifest.webmanifest', '/icon.svg']);
const DOOR_API = new Set(['/api/eu', '/api/next', '/api/descarca', '/api/descarca/Betleem-Mac.zip', '/api/descarca/Reverb.dmg']);
const ACCESS_LOG = path.join(DATA_DIR, 'acces-internet.log');
// 📦 The package for other churches: a copy of THIS Mac's Betleem app (newest code) with the song library inside
// (hub/starter/library.json: only songs, without track paths or Planning Center ids). Never in the public updates:
// it leaves this Mac only through a personal link, which expires and can be cancelled.
// Since 2026-11-25 it is a disk image (Reverb.dmg: drag Reverb into Applications), signed on this Mac (ad hoc), so the
// new church opens it once with System Settings → Privacy & Security → Open Anyway, without any Terminal commands.
// (Later, with an Apple Developer ID, the same step signs + notarizes it and macOS opens it with no question at all.)
db.shares ||= [];
const SHARE_DIR = path.join(DATA_DIR, 'descarca'), PKG_FILE = path.join(SHARE_DIR, 'Reverb.dmg');
try { fs.rmSync(path.join(SHARE_DIR, 'Betleem-Mac.zip'), { force: true }); } catch {}   // the old zip package (before the disk image)
const pkg = { building: false, ready: false, error: '', version: '', songs: 0, size: 0, at: '' };
try { Object.assign(pkg, JSON.parse(fs.readFileSync(path.join(SHARE_DIR, 'pachet.json'), 'utf8')), { building: false }); pkg.ready = pkg.ready && fs.existsSync(PKG_FILE); } catch {}
const shareOf = t => typeof t === 'string' && t.length >= 20 ? db.shares.find(x => safeEq(x.token, t) && Date.parse(x.expires) > Date.now()) : null;
const SHARE_SONG_KEYS = ['id', 'title', 'author', 'key', 'body', 'source', 'createdAt', 'updatedAt', 'ccli', 'chordsSource', 'arrangement', 'bpm', 'tags'];
const pkgStale = () => !pkg.ready || pkg.version !== VERSION || pkg.songs !== db.songs.length;
const pkgInfo = () => ({ ready: pkg.ready, building: pkg.building, error: pkg.error, version: pkg.version, songs: pkg.songs, size: pkg.size, at: pkg.at, stale: pkgStale() });
function buildPackage() {
  if (pkg.building) return;
  const run = (cmd, args) => new Promise((ok, bad) => execFile(cmd, args, { maxBuffer: 1 << 20 }, e => e ? bad(e) : ok()));
  pkg.building = true; pkg.error = ''; broadcast();
  (async () => {
    // the app bundle this hub runs in: …/Betleem.app/Contents/MacOS/<exe>
    const bundle = path.resolve(process.execPath, '../../..');
    if (process.platform !== 'darwin' || !process.versions.electron || !bundle.endsWith('.app')) throw new Error('Pachetul se face doar din aplicația Betleem de pe Mac.');
    const work = path.join(SHARE_DIR, 'lucru'), stage = path.join(work, 'Reverb'), app = path.join(stage, 'Reverb.app');
    fs.mkdirSync(stage, { recursive: true });
    fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(stage, { recursive: true });
    await run('ditto', [bundle, app]);
    const hubDst = path.join(app, 'Contents/Resources/app/hub');
    fs.rmSync(hubDst, { recursive: true, force: true });             // the newest code (this running hub), not the one from the installer
    fs.cpSync(ROOT, hubDst, { recursive: true, filter: f => !['starter', '.git', 'test'].includes(path.relative(ROOT, f).split(path.sep)[0]) });
    const songs = db.songs.map(x => Object.fromEntries(SHARE_SONG_KEYS.filter(k => x[k] != null).map(k => [k, x[k]])));
    fs.mkdirSync(path.join(hubDst, 'starter'), { recursive: true });
    fs.writeFileSync(path.join(hubDst, 'starter/library.json'), JSON.stringify({ songs }));
    // the name on the Mac: Reverb (each church still sees its own name inside)
    const plist = path.join(app, 'Contents/Info.plist');
    for (const k of ['CFBundleName', 'CFBundleDisplayName']) await run('plutil', ['-replace', k, '-string', 'Reverb', plist]).catch(() => {});
    await run('xattr', ['-cr', app]).catch(() => {});
    await run('codesign', ['--force', '--deep', '--sign', '-', app]);           // one valid signature for the whole app (ad hoc)
    await run('codesign', ['--verify', '--deep', '--strict', app]);
    fs.symlinkSync('/Applications', path.join(stage, 'Aplicații'));            // drag Reverb here
    const tmp = PKG_FILE.replace(/\.dmg$/, '.tmp.dmg');
    fs.rmSync(tmp, { force: true });
    await run('hdiutil', ['create', '-volname', 'Reverb', '-srcfolder', stage, '-ov', '-fs', 'HFS+', '-format', 'UDZO', tmp]);
    fs.renameSync(tmp, PKG_FILE); fs.rmSync(work, { recursive: true, force: true });
    Object.assign(pkg, { ready: true, version: VERSION, songs: songs.length, size: fs.statSync(PKG_FILE).size, at: new Date().toISOString() });
  })().catch(e => { pkg.error = e.message; logError('pachetul pentru alte biserici', e); })
    .finally(() => { pkg.building = false; try { fs.writeFileSync(path.join(SHARE_DIR, 'pachet.json'), JSON.stringify({ ...pkg, building: false })); } catch {} broadcast(); });
}

/** Called by the internet server for anything that isn't the file sending. Returns false if not one of the door's pages. */
function doorHandle(req, res) {
  req.viaDoor = true;
  const u = new URL(req.url, 'http://x'), p = u.pathname, ip = who(req);
  const okPath = db.security.door && ((req.method === 'GET' && DOOR_PAGES.has(p)) || DOOR_API.has(p))
    && !(p === '/live.html' && u.searchParams.get('v') !== 'next');          // from outside: only the program, not the live screens
  try { fs.appendFileSync(ACCESS_LOG, `${new Date().toISOString()} ${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 8)} ${req.method} ${p}${okPath ? '' : ' BLOCAT'}\n`); } catch {}
  if (!okPath) return false;
  if (p === '/api/eu' && locked(ip)) return json(res, 429, { error: 'Prea multe încercări. Mai încearcă peste câteva minute.' });
  res.on('finish', () => { if (p === '/api/eu' && res.statusCode === 404) wrongPin(ip); });     // someone guessing personal links
  handle(req, res); return true;
}
/** Every day: a copy of everything (songs, plans, people) in Documents/Betleem/backup (30 days) and, if set, on the NAS. */
function backup() {
  const day = new Date().toISOString().slice(0, 10), src = path.join(DATA_DIR, 'library.json');
  db.security.backupError = '';
  for (const dir of [path.join(DATA_DIR, 'backup'), db.security.backupDir].filter(Boolean)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const to = path.join(dir, `betleem-${day}.json`);
      if (fs.existsSync(src)) fs.copyFileSync(src, to);
      const old = fs.readdirSync(dir).filter(f => /^betleem-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(0, -30);
      for (const f of old) fs.rmSync(path.join(dir, f));
      db.security.lastBackup = new Date().toISOString();
    } catch (e) { db.security.backupError = (dir === db.security.backupDir ? 'NAS: ' : '') + e.message; }
  }
}
setTimeout(backup, 20_000).unref?.(); setInterval(backup, 6 * 3600_000).unref?.();

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
const mediaPull = { running: false, from: '', total: 0, done: 0, copied: 0, error: '' };
async function pullMedia(peer) {
  Object.assign(mediaPull, { running: true, from: peer.name, total: 0, done: 0, copied: 0, error: '' });
  const { pipeline } = await import('node:stream/promises'), { Readable } = await import('node:stream');
  const base = peer.url;
  try {
    const list = await fetch(base + '/api/media', { signal: AbortSignal.timeout(10000) }).then(r => r.json());
    const want = (Array.isArray(list) ? list : []).map(f => path.basename(String(f))).filter(f => f && TYPES[path.extname(f).toLowerCase()] && !(db.removedBg || []).includes(f));
    const missing = want.filter(f => !fs.existsSync(path.join(MEDIA_DIR, f)));
    mediaPull.total = missing.length;
    for (const f of missing) {
      const tmp = path.join(MEDIA_DIR, '.' + f + '.part');
      try {
        const r = await fetch(base + '/media/' + encodeURIComponent(f));
        if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
        await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(tmp));
        fs.renameSync(tmp, path.join(MEDIA_DIR, f)); mediaPull.copied++;
      } catch (e) { fs.rmSync(tmp, { force: true }); mediaPull.error = f + ': ' + e.message; }
      mediaPull.done++;
    }
  } catch (e) { mediaPull.error = 'Nu răspunde ' + peer.name + ' (' + e.message + ')'; }
  mediaPull.running = false; broadcast();
}
const DISCOVERY_PORT = 45454, instanceId = crypto.randomUUID();
const peers = new Map();                              // id → { name, church, address, port, seen }
const lanIPs = () => Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal);

// 🔗 Reverb online ⇄ Planificarea (src/reverb-sync.js): linked once with a key from the web page; only the program travels
var reverb = createReverbSync({
  file: path.join(DATA_DIR, 'reverb-online.json'), fs,
  getPlan: id => (activeChurch().id === id ? db.plan : db.churchData?.[id]?.plan) || null,
  liveId: id => (activeChurch().id === id ? db.service?.planId : db.churchData?.[id]?.service?.planId) || null,
  applied: (changed, id) => {
    if (!changed) return;
    if (activeChurch().id === id) planToLive();
    reverbQuiet = true; save(); reverbQuiet = false; broadcast();
    const msg = JSON.stringify({ type: 'planChanged' }); for (const ws of wss.clients) if (ws.readyState === 1) ws.send(msg);
  },
  newToken, hubUrl: () => { const ip = lanIPs()[0]?.address; return ip ? `http://${ip}:${PORT}` : ''; },
  songs: {                                            // the song library: written / corrected from a link ⇄ here
    list: () => db.songs,
    apply: c => {
      const t = String(c.title || '').slice(0, 120), body = String(c.body || '');
      let song = db.songs.find(x => x.id === c.local_id);
      if (!song) { db.songs.push({ id: String(c.local_id).slice(0, 80), title: t, author: c.author || '', key: c.key || '', body,
        ...(Array.isArray(c.arrangement) ? { arrangement: c.arrangement } : {}), ...(c.tags?.length ? { tags: c.tags } : {}), createdAt: c.updated_at, updatedAt: c.updated_at }); return true; }
      if (Date.parse(c.updated_at) <= Date.parse(song.updatedAt || 0)) return false;          // changed here later: ours stays (and goes up)
      if (song.body === body && song.title === t && (song.key || '') === (c.key || '')) return false;
      if (Date.now() - (reverbBackupAt || 0) > 3600e3) { reverbBackupAt = Date.now(); libraryBackup(); }   // a copy before songs change from outside (at most hourly)
      Object.assign(song, { title: t, body, key: c.key || song.key || '', updatedAt: c.updated_at }); return true;
    },
    saved: () => { reverbQuiet = true; save(); reverbQuiet = false; broadcast(); },
  },
  log: m => console.log(m),
});
if (process.env.REVERB_SYNC !== '0') reverb.start();
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
if (UPDATES) { setTimeout(() => updater.fromGithub(), 30000).unref(); setInterval(() => updater.fromGithub(), 30 * 60 * 1000).unref(); }

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
    if (doorHandle(req, res)) return;                 // 🔒 the volunteers' pages, only when the leader opened the door
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

export { server, aiHub };

// --- 🖥 The projector and stage windows: on the monitor chosen BY NAME, never the macOS full screen -------------
// The desktop shell (main.cjs) only changes when the app is reinstalled, but this hub code runs inside it, so it can
// place those two windows itself. macOS full screen opens a new Space and, when "Displays have separate Spaces" is
// off, takes every monitor (the operator loses the program): here a window that goes full screen comes out of it
// and becomes a borderless window over its own monitor, above the menu bar.
let EL = null;
const outWins = {};                                    // kind → BrowserWindow
db.screenPick ||= {};                                  // kind → display id, chosen by name in Proiectez
const kindOf = w => { const t = w?.getTitle?.() || ''; return /^Ecran principal|– Sală$/.test(t) ? 'main' : /^Ecran scenă|– Scenă$/.test(t) ? 'stage' : null; };
const controlDisplayId = () => {
  const { BrowserWindow, screen } = EL;
  const c = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.isVisible() && !kindOf(w) && w.getBounds().width > 600);
  return c ? screen.getDisplayMatching(c.getBounds()).id : null;
};
// An installed shell from before 2026.11.23 makes these windows without "enableLargerThanScreen", so macOS keeps them
// under its menu bar (the bar showed on the projector at Peștera). Until the app is reinstalled, the hub opens its own
// copy of the screen with that option, over the whole monitor, and parks the old window (blank, hidden, closed with it).
let shellBig = null;
const shellHasBig = () => {
  if (shellBig !== null) return shellBig;
  try { shellBig = fs.readFileSync(require_main(), 'utf8').includes('enableLargerThanScreen'); } catch { shellBig = true; }
  return shellBig;
};
function require_main() {
  const c = [process.argv.find(a => /main\.cjs$/.test(a)), path.join(process.resourcesPath || '', 'app', 'main.cjs'), path.join(process.resourcesPath || '', 'app.asar', 'main.cjs')];
  return c.find(f => f && fs.existsSync(f)) || c[1];
}
function coverFor(kind, old) {
  const { BrowserWindow } = EL;
  if (old._cover && !old._cover.isDestroyed()) return old._cover;
  const url = old.webContents.getURL();
  if (!/^https?:/.test(url)) return null;
  const c = new BrowserWindow({ ...old.getBounds(), frame: false, backgroundColor: '#000000', show: false, hasShadow: false,
    enableLargerThanScreen: true, fullscreenable: false, title: old.getTitle(),
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  c._betleem = true; c._isCover = true; c._old = old; old._cover = c; outWins[kind] = c;
  c.loadURL(url); c.once('ready-to-show', () => { c.showInactive(); placeOut(kind); });
  const park = () => { if (old.isDestroyed()) return; const u = old.webContents.getURL();
    if (/^https?:/.test(u)) { if (u !== c.webContents.getURL() && !c.isDestroyed()) c.loadURL(u); old.loadURL('about:blank'); }
    old.hide(); };
  old.webContents.on('did-navigate', park); old.on('show', () => setTimeout(park, 0));
  old.on('move', () => setTimeout(() => !c.isDestroyed() && placeOut(kind), 50));
  old.on('closed', () => { if (!c.isDestroyed()) c.destroy(); if (outWins[kind] === c) delete outWins[kind]; });
  c.on('closed', () => { if (!old.isDestroyed()) old.close(); });
  park();
  return c;
}
function placeOut(kind) {
  if (!EL) return;
  let w = outWins[kind]; if (!w || w.isDestroyed()) return;
  const { screen } = EL, all = screen.getAllDisplays();
  const named = db.screenPickName?.[kind] && all.find(x => x.label === db.screenPickName[kind]);   // a wireless TV comes back with a new id
  const d = all.find(x => x.id === db.screenPick[kind]) || named || screen.getDisplayMatching((w._old && !w._old.isDestroyed() ? w._old : w).getBounds());
  if (w.isFullScreen()) { w.once('leave-full-screen', () => setTimeout(() => placeOut(kind), 60)); w.setFullScreen(false); return; }
  if (d.id === controlDisplayId()) {                   // the same monitor as the program: a small window, never covering it
    w.setAlwaysOnTop(false); w.setBounds({ x: d.workArea.x + 40, y: d.workArea.y + 40, width: Math.round(d.workArea.width / 2), height: Math.round(d.workArea.width / 2 * 9 / 16) });
    return;
  }
  if (process.platform === 'darwin' && !w._isCover && !shellHasBig()) {            // old shell: cover the monitor with our own window
    const c = coverFor(kind, w); if (c) { if (!c.isVisible()) return; w = c; }
  }
  w.setBounds(d.bounds);
  if (process.platform === 'darwin') { w.setAlwaysOnTop(true, 'screen-saver'); w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); }
  else w.setFullScreen(true);
  setTimeout(() => {
    if (w.isDestroyed() || w.isFullScreen()) return;
    w.setBounds(d.bounds);
    const b = w.getBounds();                         // macOS kept it under the menu bar: cover the monitor with our own window
    if (process.platform === 'darwin' && !w._isCover && (b.y > d.bounds.y || b.height < d.bounds.height)) { shellBig = false; placeOut(kind); }
  }, 400);
}
if (process.versions.electron) {
  import('electron').then(m => {
    EL = m.default?.screen ? m.default : m;
    const { app, BrowserWindow } = EL;
    const watch = w => {
      const kind = kindOf(w); if (!kind || w._betleem) return;
      w._betleem = true; outWins[kind] = w;
      if (process.platform === 'darwin') w.on('enter-full-screen', () => setTimeout(() => placeOut(kind), 30));
      const settle = () => { if (db.screenPick[kind] || w.isFullScreen()) placeOut(kind); };
      w.once('ready-to-show', () => { setTimeout(settle, 300); setTimeout(settle, 1200); });
      setTimeout(settle, 900);
    };
    app.on('browser-window-created', (_e, w) => { watch(w); setTimeout(() => watch(w), 0); });
    // a monitor came or went (an AirPlay / Miracast TV connects): tell the control pages; the chosen one gets its screen back
    const changed = (d, added) => setTimeout(() => {
      const msg = JSON.stringify({ type: 'displays', added: added ? (d.label || 'Monitor nou') : '', removed: added ? '' : (d.label || '') });
      for (const ws of wss.clients) if (ws.readyState === 1) ws.send(msg);
      if (added) for (const k of ['main', 'stage']) if (db.screenPick[k] === d.id || (db.screenPickName?.[k] && db.screenPickName[k] === d.label)) {
        db.screenPick[k] = d.id; save();
        if (outWins[k] && !outWins[k].isDestroyed()) placeOut(k); else EL.ipcMain.emit('bnc:open-screen', {}, k, '');
      }
    }, 800);
    EL.screen.on('display-added', (_e, d) => changed(d, true));
    EL.screen.on('display-removed', (_e, d) => changed(d, false));
    BrowserWindow.getAllWindows().forEach(watch);
  }).catch(e => logError('ferestrele de ecran', e));
}
/** the monitors with their own names (as in the Mac's / Windows' display settings) */
function displaysInfo() {
  if (!EL) return [];
  const { screen } = EL, cd = controlDisplayId(), on = k => outWins[k] && !outWins[k].isDestroyed() ? screen.getDisplayMatching(outWins[k].getBounds()).id : null;
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, name: d.label || `Monitor ${i + 1}`, size: `${d.size.width}×${d.size.height}`,
    primary: d.id === screen.getPrimaryDisplay().id, control: d.id === cd, main: on('main') === d.id, stage: on('stage') === d.id,
    pick: Object.entries(db.screenPick).filter(([, v]) => v === d.id).map(([k]) => k) }));
}
async function pickDisplay(kind, id) {
  db.screenPick[kind] = Number(id) || null;
  db.screenPickName ||= {}; db.screenPickName[kind] = EL?.screen.getAllDisplays().find(x => x.id === db.screenPick[kind])?.label || '';
  save();
  try { const F = path.join(DATA_DIR, 'settings.json'), st = JSON.parse(fs.readFileSync(F, 'utf8')); st[kind + 'Display'] = db.screenPick[kind]; fs.writeFileSync(F, JSON.stringify(st, null, 2)); } catch {}   // for the next start too
  if (!EL || !id) return;
  if (!outWins[kind] || outWins[kind].isDestroyed()) { EL.ipcMain.emit('bnc:open-screen', {}, kind, ''); await new Promise(r => setTimeout(r, 900)); }
  placeOut(kind);
}
