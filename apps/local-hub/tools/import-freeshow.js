// Import songs from FreeShow into the Local Hub library.
//
//   node tools/import-freeshow.js "C:\Users\<you>\Documents\FreeShow\Shows"
//
// Reads every *.show file with category "song", keeps the slide labels
// (Vers, Refren, Pre-Refren, Bridge, Tag…), the order from the active layout
// and any chords, and adds them to data/library.json. Songs whose title is
// already in the library are skipped, so it is safe to run more than once.
// FreeShow's own files are only read, never changed.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(process.env.DATA_DIR || path.join(HERE, '..', 'data'), 'library.json');

const GROUP_LABEL = {
  verse: 'Strofa', chorus: 'Refren', pre_chorus: 'Pre-Refren', bridge: 'Punte',
  intro: 'Intro', outro: 'Final', tag: 'Tag', break: 'Intro',
};

function lineText(line) {
  let text = (line.text || []).map(t => String(t.value ?? '')).join('');
  text = text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  // FreeShow chords: [{ key: "G", pos: 3 }] — insert as inline ChordPro
  const chords = [...(line.chords || [])].filter(c => c && c.key).sort((a, b) => b.pos - a.pos);
  for (const c of chords) {
    const pos = Math.max(0, Math.min(text.length, Number(c.pos) || 0));
    text = text.slice(0, pos) + `[${c.key}]` + text.slice(pos);
  }
  return text;
}

function slideLines(slide) {
  const items = (slide.items || []).filter(i => !i.type || i.type === 'text');
  return items.flatMap(i => (i.lines || []).map(lineText)).filter(Boolean);
}

/** Convert one parsed .show file. Returns null if it is not a song. */
export function convertShow(json, fileName = '') {
  const show = Array.isArray(json) ? json[1] : json;
  if (!show || !show.slides) return null;
  if (show.category && show.category !== 'song') return null;

  const layouts = show.layouts || {};
  const layout = layouts[show.settings?.activeLayout] || Object.values(layouts)[0];
  let order = (layout?.slides || []).filter(s => !s.disabled).map(s => s.id).filter(id => show.slides[id]);
  if (!order.length) order = Object.keys(show.slides).filter(id => !Object.values(show.slides).some(s => s.children?.includes(id)));

  // give each distinct parent slide a unique label: Strofa 1, Strofa 2, Refren, Refren 2…
  const labelOf = new Map();
  const counts = {};
  // labels the song engine recognises; anything else (custom names) becomes a numbered "Strofa"
  const KNOWN = /^(verse|vers|strofa|strofă|chorus|refren|bridge|punte|pre-?chorus|pre-?refren|intro|outro|final|tag|ending)\b/i;
  const groupName = s => {
    if (GROUP_LABEL[s.globalGroup]) return GROUP_LABEL[s.globalGroup];
    const g = (s.group || '').trim();
    if (/^b\b/i.test(g)) return 'Punte';
    return KNOWN.test(g) && g.length < 30 ? g : 'Strofa';
  };
  for (const id of order) {
    if (labelOf.has(id)) continue;
    const base = groupName(show.slides[id]);
    counts[base] = (counts[base] || 0) + 1;
    labelOf.set(id, base);
  }
  const seen = {};
  for (const [id, base] of labelOf) {
    if (counts[base] > 1 || base === 'Strofa') { seen[base] = (seen[base] || 0) + 1; labelOf.set(id, `${base} ${seen[base]}`); }
  }

  const sections = [];
  const kept = new Set();
  for (const id of labelOf.keys()) {
    const parent = show.slides[id];
    const lines = [parent, ...(parent.children || []).map(c => show.slides[c]).filter(Boolean)]
      .flatMap((s, i, all) => (i < all.length - 1 ? [...slideLines(s), ''] : slideLines(s)));
    while (lines.at(-1) === '') lines.pop();
    if (lines.some(Boolean)) { sections.push(`${labelOf.get(id)}:\n${lines.join('\n')}`); kept.add(labelOf.get(id)); }
  }
  if (!sections.length) return null;

  const fixRo = t => t.replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț');
  const title = fixRo(String(show.name || path.basename(fileName, '.show')).trim());
  const arrangement = order.map(id => labelOf.get(id)).filter(l => kept.has(l));  // drop empty slides
  const unique = [...new Set(arrangement)];
  return {
    title,
    author: show.meta?.author || show.meta?.artist || '',
    key: show.meta?.key || '',
    body: sections.join('\n\n')
      .replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț'),
    // only store the order when it differs from "each section once, as written"
    arrangement: arrangement.length === unique.length && arrangement.every((l, i) => l === unique[i]) ? undefined : arrangement,
    source: 'freeshow',
  };
}

function main() {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(dir)) {
    console.error('Folosire: node tools/import-freeshow.js "C:\\Users\\<tu>\\Documents\\FreeShow\\Shows"');
    process.exit(1);
  }
  let db = { songs: [], setlist: [], service: { title: 'Serviciu duminică', startsAt: null } };
  try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch {}
  const have = new Set(db.songs.map(s => s.title.toLowerCase()));
  let added = 0, skipped = 0, notSongs = 0, failed = 0;
  for (const f of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.show'))) {
    try {
      const song = convertShow(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f);
      if (!song) { notSongs++; continue; }
      if (have.has(song.title.toLowerCase())) { skipped++; continue; }
      db.songs.push({ id: crypto.randomUUID(), ...song, createdAt: new Date().toISOString() });
      have.add(song.title.toLowerCase()); added++;
    } catch (e) { failed++; console.warn('  nu am putut citi', f, '-', e.message); }
  }
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  console.log(`Adăugate: ${added}  ·  deja existente: ${skipped}  ·  nu sunt cântări: ${notSongs}  ·  erori: ${failed}`);
  console.log('Biblioteca:', DB_FILE);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
