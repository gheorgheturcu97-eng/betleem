// Find chords for songs in our library on resursecrestine.ro and put them on OUR lyrics.
// Searches by title and by the first line, tries the best few chord sheets, keeps the one
// that matches our words best. Nothing changes when the match is not convincing.

import { extractLyrics } from './extract.js';

const RC = 'https://www.resursecrestine.ro';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Safari/537.36';
const MIN_MATCH = 0.6;   // share of our words found on the sheet
const MIN_CHORDS = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, fetchImpl) {
  const r = await fetchImpl(url, { headers: { 'user-agent': UA, 'accept-language': 'ro-RO,ro;q=0.9' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(String(r.status));
  return r.text();
}

export function chordLinks(html) {
  const out = [];
  for (const m of html.matchAll(/href="((?:https?:\/\/www\.resursecrestine\.ro)?\/acorduri\/\d+\/[^"#?]+)"/g)) {
    const u = m[1].startsWith('http') ? m[1] : RC + m[1];
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

function firstLine(body) {
  for (const l of body.split('\n')) {
    const t = l.replace(/\[[^\]]*\]/g, '').trim();
    if (t && !/:\s*$/.test(t) && t.split(/\s+/).length >= 3) return t.slice(0, 80);
  }
  return '';
}

/** Try to find chords for one song. Returns { body, key, url, match, chords } or null. */
export async function findChords(song, core, { fetchImpl = fetch, maxSheets = 5 } = {}) {
  const queries = [[song.title, 'titlu'], [firstLine(song.body), 'continut']].filter(q => q[0]);
  const links = [];
  for (const [q, by] of queries) {
    try {
      for (const u of chordLinks(await get(`${RC}/cauta/${encodeURIComponent(q)}/1/${by}`, fetchImpl))) if (!links.includes(u)) links.push(u);
    } catch {}
    await sleep(250);
  }
  let best = null;
  for (const url of links.slice(0, maxSheets)) {
    try {
      const sheet = core.normalizeImported(extractLyrics(await get(url, fetchImpl), 'www.resursecrestine.ro').body);
      if (!/\[[A-G]/.test(sheet)) continue;
      const r = core.applyChords(song.body, sheet);
      if (!best || r.match > best.match || (r.match === best.match && r.chords > best.chords)) best = { ...r, url };
      if (best.match > 0.95) break;
    } catch {}
    await sleep(250);
  }
  if (!best || best.match < MIN_MATCH || best.chords < MIN_CHORDS) return null;
  return { ...best, key: core.guessKey(best.body) };
}

/**
 * Add chords to many songs. `onProgress({ done, total, current, added })` after each song.
 * Songs that already have chords are skipped. Returns { added: [titles], missed: [titles] }.
 */
export async function addChordsToSongs(songs, core, { onProgress = () => {}, onSong = () => {}, fetchImpl = fetch, shouldStop = () => false } = {}) {
  const todo = songs.filter(s => !/\[[A-G][^\]]*\]/.test(s.body));
  const added = [], missed = [];
  for (let i = 0; i < todo.length; i++) {
    if (shouldStop()) break;
    const s = todo[i];
    onProgress({ done: i, total: todo.length, current: s.title, added: added.length });
    const r = await findChords(s, core, { fetchImpl });
    if (r) { onSong(s, r); added.push(s.title); } else missed.push(s.title);
  }
  onProgress({ done: todo.length, total: todo.length, current: '', added: added.length });
  return { added, missed };
}
