// Bethlehem Network Churches — song engine
// One song is stored ONCE as ChordPro-style text: "[G]Mare e [D]Domnul".
// Every part of the app (presenter, stage screen, music stand, phones) derives
// what it needs from that single source.

export type Section = { label: string; lines: string[] };
export type Slide = { label: string; lines: string[] };

const SECTION_LABEL =
  /^\s*(\{(?:c|comment|soc|sov|sob)?:?\s*)?(verse|vers|strofa|strofă|chorus|refren|bridge|punte|pre-?chorus|pre-?refren|intro|outro|final|tag|ending)\b[^\n]*$/i;

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_TO_SHARP: Record<string, string> = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E' };
const SHARP_EXTRA: Record<string, string> = { 'E#': 'F', 'B#': 'C' };

function normalizeNote(n: string): string {
  return FLAT_TO_SHARP[n] ?? SHARP_EXTRA[n] ?? n;
}

/** Clean a section label: "{c: Refren:}" -> "Refren" */
/** A line that is only a section name ("Refren", "Strofa 2:", "{c: Bridge}") — not a lyric that starts with such a word. */
function isLabelLine(t: string): boolean {
  if (!SECTION_LABEL.test(t) || t.length >= 40) return false;
  return /:\s*$/.test(t) || /^\{/.test(t) || /^(verse|vers|strofa|strofă|chorus|refren|bridge|punte|pre-?chorus|pre-?refren|intro|outro|final|tag|ending)\s*\d*\s*$/i.test(t);
}

function cleanLabel(raw: string): string {
  return raw.replace(/^\s*\{(?:c|comment|soc|sov|sob)?:?\s*/i, '').replace(/[}:]+\s*$/, '').trim();
}

/** Split a song body into labelled sections. Empty lines or labels start a new section. */
export function parseSong(body: string): Section[] {
  const sections: Section[] = [];
  let cur: Section = { label: '', lines: [] };
  const push = () => { if (cur.lines.length) sections.push(cur); };
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (/^\{(eoc|eov|eob|end_of_\w+)\}$/i.test(t)) continue; // ChordPro end markers
    if (/^\{(title|t|artist|key|tempo|time|capo)\s*:/i.test(t)) continue; // metadata lines
    if (isLabelLine(t)) {
      push();
      cur = { label: cleanLabel(t), lines: [] };
    } else if (t === '') {
      push();
      cur = { label: '', lines: [] };
    } else {
      cur.lines.push(line);
    }
  }
  push();
  // carry labels forward for unlabeled continuation blocks? No: keep explicit.
  return sections;
}

/** Read {key: G} style metadata from the body. */
export function readMeta(body: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const m of body.matchAll(/^\s*\{(\w+)\s*:\s*([^}]*)\}\s*$/gm)) meta[m[1].toLowerCase()] = m[2].trim();
  return meta;
}

/** Lyrics only (main screen / congregation). */
export function stripChords(line: string): string {
  return line.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Does this text contain inline chords? */
export function hasChords(body: string): boolean {
  return /\[[A-G][^\]]*\]/.test(body);
}

function transposeNote(note: string, steps: number, preferFlats: boolean): string {
  const idx = NOTES.indexOf(normalizeNote(note));
  if (idx < 0) return note;
  const n = (idx + (steps % 12) + 12) % 12;
  return preferFlats ? NOTES_FLAT[n] : NOTES[n];
}

/** Transpose one chord symbol, e.g. "F#m7/C#". Unknown symbols are returned unchanged. */
export function transposeChord(chord: string, steps: number, preferFlats = false): string {
  const m = chord.match(/^([A-G][b#]?)([^/]*)(?:\/([A-G][b#]?))?$/);
  if (!m) return chord;
  const [, root, rest, bass] = m;
  return transposeNote(root, steps, preferFlats) + rest + (bass ? '/' + transposeNote(bass, steps, preferFlats) : '');
}

/** Transpose every [chord] in a line or a whole body. */
export function transpose(text: string, steps: number, preferFlats = false): string {
  if (!steps) return text;
  return text.replace(/\[([^\]]+)\]/g, (_, c: string) => `[${transposeChord(c.trim(), steps, preferFlats)}]`);
}

/** Semitones from one key to another ("G" -> "A" = 2). Minor suffix ignored. */
export function keyDistance(from: string, to: string): number {
  const a = NOTES.indexOf(normalizeNote(from.replace(/m(in)?$/i, '')));
  const b = NOTES.indexOf(normalizeNote(to.replace(/m(in)?$/i, '')));
  if (a < 0 || b < 0) return 0;
  return (b - a + 12) % 12;
}

/** Keys that usually read better with flats. */
export function prefersFlats(key: string): boolean {
  return /^(F|Bb|Eb|Ab|Db|Gb|Dm|Gm|Cm|Fm|Bbm|Ebm)$/.test(key.trim());
}

/**
 * Turn sections into slides. Long sections are split evenly
 * (a 6-line verse with max 4 becomes 3+3, not 4+2).
 */
export function toSlides(sections: Section[], maxLines = 4): Slide[] {
  const out: Slide[] = [];
  for (const s of sections) {
    const parts = Math.max(1, Math.ceil(s.lines.length / maxLines));
    const size = Math.ceil(s.lines.length / parts);
    for (let i = 0; i < s.lines.length; i += size) out.push({ label: s.label, lines: s.lines.slice(i, i + size) });
  }
  return out;
}

/**
 * Apply an arrangement: ["Strofa 1","Refren","Strofa 2","Refren"].
 * Labels are matched case-insensitively; unknown labels are skipped.
 * With no arrangement, sections are returned as written.
 */
export function arrange(sections: Section[], order?: string[]): Section[] {
  if (!order || !order.length) return sections;
  const byLabel = new Map<string, Section>();
  for (const s of sections) if (s.label && !byLabel.has(s.label.toLowerCase())) byLabel.set(s.label.toLowerCase(), s);
  // "#3" means the 4th section as written — works for sections with no name or with the same name twice
  // "#3" means the 4th section as written — works for sections with no name or with the same name twice.
  // A name brings that section plus the ones right after it with the same name (a verse tagged over several slides).
  return order.flatMap(l => {
    if (/^#\d+$/.test(l)) return sections[+l.slice(1)] ? [sections[+l.slice(1)]] : [];
    const first = byLabel.get(l.toLowerCase()); if (!first) return [];
    const out = [first];
    for (let i = sections.indexOf(first) + 1; i < sections.length && sections[i].label.toLowerCase() === l.toLowerCase(); i++) out.push(sections[i]);
    return out;
  });
}

/** An arrangement written with section numbers ("#0", "#2"…), so every chip points at exactly one section. */
export function arrangementIndexes(sections: Section[], order?: string[] | null): string[] {
  if (!order || !order.length) return sections.map((_, i) => '#' + i);
  return order.map(l => {
    if (/^#\d+$/.test(l)) return +l.slice(1) < sections.length ? l : '';
    const i = sections.findIndex(s => s.label && s.label.toLowerCase() === l.toLowerCase());
    return i >= 0 ? '#' + i : '';
  }).filter(Boolean);
}

/** After section k was split into n parts, renumber an index arrangement (the split section plays all its parts). */
export function expandArrangement(order: string[], k: number, n: number): string[] {
  return order.flatMap(t => {
    const i = +t.slice(1);
    if (i < k) return [t];
    if (i === k) return Array.from({ length: n }, (_, j) => '#' + (k + j));
    return ['#' + (i + n - 1)];
  });
}

// ---------------------------------------------------------------------------
// Import helpers
// ---------------------------------------------------------------------------

const CHORD_TOKEN = /^[A-G][b#]?(?:m|maj|min|dim|aug|sus|add|M)?\d*(?:[b#]\d+)*(?:sus\d*)?(?:add\d+)?(?:\/[A-G][b#]?)?$/;

/** Is this line made only of chord symbols (the "chords above lyrics" format)? */
export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every(t => CHORD_TOKEN.test(t.replace(/[()|]/g, '')) || /^[|/\-x\d]+$/.test(t));
}

/**
 * Convert "chords above lyrics" text (as found on most chord websites and PDFs)
 * into inline ChordPro: the chord is inserted at its column in the lyric line.
 *
 *   G        D
 *   Mare e Domnul    ->   [G]Mare e [D]Domnul
 */
export function chordsOverToChordPro(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isChordLine(line)) {
      const next = lines[i + 1];
      const chords: { col: number; chord: string }[] = [];
      for (const m of line.matchAll(/\S+/g)) chords.push({ col: m.index ?? 0, chord: m[0] });
      if (next !== undefined && next.trim() !== '' && !isChordLine(next) && !SECTION_LABEL.test(next.trim())) {
        let merged = next.padEnd(Math.max(next.length, (chords.at(-1)?.col ?? 0)), ' ');
        for (const { col, chord } of [...chords].reverse()) {
          merged = merged.slice(0, col) + `[${chord}]` + merged.slice(col);
        }
        out.push(merged.trimEnd());
        i++;
      } else {
        out.push(chords.map(c => `[${c.chord}]`).join(' ')); // instrumental line
      }
    } else {
      out.push(line);
    }
  }
  return out.join('\n');
}

/**
 * Turn the labels used on lyric sites into our section labels (only at the start of a stanza;
 * chords in front of the mark are kept, the mark itself is not shown on screen):
 *   "1." "1)" "Str1" "Str. 1" "Strofa 1" "V1:" -> "Strofa 1:"
 *   "R:" "R1:" "Ref:" "Refren 2" "Cor:" "Chorus" -> "Refren:" / "Refren 2:"
 *   "Bridge:" "Punte" "Pod:" -> "Bridge:"; "Pre-refren:" -> "Pre-refren:"; "Intro", "Final"/"Outro"/"Coda", "Tag"
 */
export function labelStanzas(text: string): string {
  const CH = '((?:\\[[^\\]]+\\]\\s*)*)';                        // chords before the mark
  const RULES: [RegExp, (n: string) => string][] = [
    [new RegExp('^' + CH + '(\\d{1,2})[.)]\\s+(.*)$'), n => 'Strofa ' + n],
    [new RegExp('^' + CH + '(?:str(?:ofa|ofă)?|vers(?:e|ul)?|v)\\.?\\s*(\\d{1,2})\\s*[:.)]?\\s*(.*)$', 'i'), n => 'Strofa ' + n],
    [new RegExp('^' + CH + '(?:pre-?\\s?refren|pre-?\\s?chorus)\\s*(\\d*)\\s*(?:[:.]\\s*(.*))?$', 'i'), n => 'Pre-refren' + (n ? ' ' + n : '')],
    [new RegExp('^' + CH + '(?:r|ref|refren|refrain|cor|chorus)\\s*(\\d*)\\s*[:.]\\s*(.*)$', 'i'), n => 'Refren' + (n ? ' ' + n : '')],
    [new RegExp('^' + CH + '(?:refren|chorus)\\s*(\\d*)()$', 'i'), n => 'Refren' + (n ? ' ' + n : '')],
    [new RegExp('^' + CH + '(?:bridge|punte|pod)\\s*(\\d*)\\s*(?:[:.]\\s*(.*))?$', 'i'), n => 'Bridge' + (n ? ' ' + n : '')],
    [new RegExp('^' + CH + '(?:intro)\\s*(\\d*)\\s*(?:[:.]\\s*(.*))?$', 'i'), () => 'Intro'],
    [new RegExp('^' + CH + '(?:final|outro|coda|încheiere|incheiere)\\s*(\\d*)\\s*(?:[:.]\\s*(.*))?$', 'i'), () => 'Final'],
    [new RegExp('^' + CH + '(?:tag)\\s*(\\d*)\\s*[:.]\\s*(.*)$', 'i'), () => 'Tag'],
  ];
  const out: string[] = [];
  let atStart = true;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) { out.push(line); atStart = true; continue; }
    if (atStart && !isLabelLine(t)) {
      const hit = RULES.map(([re, name]) => { const m = t.match(re); return m && { m, name }; }).find(Boolean);
      if (hit) {
        const [, chords, n, rest = ''] = hit.m;
        out.push(hit.name(n || '') + ':');
        if ((chords + rest).trim()) out.push((chords + rest).trimEnd());
        atStart = false; continue;
      }
    }
    out.push(line); atStart = false;
  }
  return out.join('\n');
}

const REPEAT_MARK = /\/{1,2}:|:\/{1,2}|\((?:x\s*\d|bis|\d\s*x)\)|\s(?:x\s?\d|bis)\s*$/gi;

/** "/: … :/" means "sing twice". The marks are not shown on screen. */
export function stripRepeatMarks(body: string): string {
  return body.split('\n').map(l => {
    if (!REPEAT_MARK.test(l)) return l;
    REPEAT_MARK.lastIndex = 0;
    return l.replace(REPEAT_MARK, ' ').replace(/(\])\s+(?=\S)/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
  }).join('\n');
}

/**
 * When the chorus is written only once (as on most lyric sites), sing it after every verse and bridge:
 * Strofa 1, Refren, Strofa 2, Refren… Returns section numbers ("#0", "#1"…), or null when nothing changes.
 */
export function autoArrangement(body: string): string[] | null {
  const secs = parseSong(body);
  const kinds = secs.map(s => sectionKind(s.label));
  const c = kinds.indexOf('chorus');
  if (c < 0) return null;
  const chorusLabel = secs[c].label.toLowerCase();
  const group: number[] = [];                                   // the chorus may span several sections with the same name
  for (let i = c; i < secs.length && secs[i].label.toLowerCase() === chorusLabel; i++) group.push(i);
  if (secs.some((s, i) => !group.includes(i) && s.label.toLowerCase() === chorusLabel)) return null;   // already written out
  if (kinds.filter(k => k === 'verse').length < 2) return null;
  const order: string[] = [];
  for (let i = 0; i < secs.length; i++) {
    if (group.includes(i) && i !== group[0]) continue;
    if (i === group[0]) { group.forEach(g => order.push('#' + g)); i = group[group.length - 1]; continue; }
    order.push('#' + i);
    const nextKind = kinds[i + 1];
    if ((kinds[i] === 'verse' || kinds[i] === 'bridge') && i > group[0] && nextKind !== 'chorus' && nextKind !== 'prechorus') group.forEach(g => order.push('#' + g));
    if (kinds[i] === 'prechorus' && i > group[0] && nextKind !== 'chorus') group.forEach(g => order.push('#' + g));
  }
  const same = order.length === secs.length && order.every((t, i) => t === '#' + i);
  return same ? null : order;
}

/** Normalise any pasted/imported text into a clean song body. */
export function normalizeImported(text: string): string {
  let t = text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+$/gm, '')
    // Romanian diacritics: cedilla forms -> correct comma-below forms
    .replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (t.split("\n").some(isChordLine)) t = chordsOverToChordPro(t); // also fixes mixed pastes
  t = labelStanzas(t);
  // blocks without a name get one (the "/: :/" marks help find the chorus), then the marks are dropped
  if (parseSong(t).some(sec => !sec.label)) t = autoLabel(t);
  return stripRepeatMarks(t);
}

/** Render one line as HTML with chords placed above the syllables (stage / music stand). */
export function chordLineToHtml(line: string, escape: (s: string) => string): string {
  if (!/\[/.test(line)) return `<span class="ly">${escape(line)}</span>`;
  const parts = line.split(/(\[[^\]]*\])/);
  let html = '';
  let pending = '';
  for (const p of parts) {
    if (/^\[.*\]$/.test(p)) { if (pending) html += `<span class="seg"><b>${escape(pending)}</b><i></i></span>`; pending = p.slice(1, -1); continue; }
    if (!p && !pending) continue;
    html += `<span class="seg"><b>${escape(pending)}</b><i>${escape(p) || '&nbsp;'}</i></span>`;
    pending = '';
  }
  if (pending) html += `<span class="seg"><b>${escape(pending)}</b><i></i></span>`;
  return html;
}

// ---------------------------------------------------------------------------
// Put chords from a chord sheet onto OUR lyrics (keeps our sections, order,
// diacritics and line breaks). Used to add chords to songs imported without them.
// ---------------------------------------------------------------------------

export type ChordToken = { norm: string; chords: string[] };

/** Word key used for matching: lower case, no diacritics, letters/digits only. */
export function normWord(w: string): string {
  return w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

/** A chord sheet (ChordPro) as a stream of words, each with the chords that start on it. */
export function chordStream(body: string): ChordToken[] {
  const out: ChordToken[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || (SECTION_LABEL.test(line) && line.length < 40)) continue;
    if (!line.replace(/\[[^\]]*\]/g, '').trim()) continue;          // chords only (intro): skip
    let pending: string[] = [];
    let word = '', wordChords: string[] = [];
    const flush = () => {
      const n = normWord(word);
      if (n) { out.push({ norm: n, chords: wordChords }); wordChords = []; }
      else pending = pending.concat(wordChords), wordChords = [];  // e.g. "/:" repeat marks
      word = '';
    };
    for (const part of line.split(/(\[[^\]]*\])/)) {
      if (/^\[.*\]$/.test(part)) {
        const c = part.slice(1, -1).trim();
        if (!c) continue;
        if (word) wordChords.push(c); else pending.push(c);
        continue;
      }
      for (const ch of part) {
        if (/\s/.test(ch)) { flush(); continue; }
        if (!word && pending.length) { wordChords = pending.concat(wordChords); pending = []; }
        word += ch;
      }
    }
    flush();
  }
  return out;
}

/** Longest common subsequence of two word-key arrays -> pairs [i, j]. */
function lcsPairs(a: string[], b: string[]): [number, number][] {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return pairs;
}

/** Guess the key from the first chord: "Am7" -> "Am", "F#" -> "F#". */
export function guessKey(body: string): string {
  const m = body.match(/\[([A-G][b#]?)(m(?!aj))?/);
  return m ? m[1] + (m[2] ? 'm' : '') : '';
}

/**
 * Copy chords from `sheet` onto `lyrics`. Each section of our song is matched on its own
 * against the whole sheet, so a different section order on the website does not matter.
 * Returns the new body, how many of our words were found (0..1) and how many chords were placed.
 */
export function applyChords(lyrics: string, sheet: string): { body: string; match: number; chords: number } {
  const src = chordStream(sheet);
  const srcKeys = src.map(t => t.norm);
  const lines = lyrics.split('\n');
  type W = { line: number; col: number; norm: string };
  const sections: W[][] = [];
  let cur: W[] = [];
  lines.forEach((line, li) => {
    const t = line.trim();
    if (!t || (SECTION_LABEL.test(t) && t.length < 40)) { if (cur.length) sections.push(cur); cur = []; return; }
    if (/\[[A-G][^\]]*\]/.test(line)) return;                     // already has chords: leave it
    for (const m of line.matchAll(/\S+/g)) {
      const n = normWord(m[0]);
      if (n) cur.push({ line: li, col: m.index ?? 0, norm: n });
    }
  });
  if (cur.length) sections.push(cur);

  const inserts = new Map<number, { col: number; chords: string[] }[]>();
  let total = 0, found = 0, placed = 0;
  for (const sec of sections) {
    total += sec.length;
    const pairs = lcsPairs(sec.map(w => w.norm), srcKeys);
    found += pairs.length;
    for (const [i, j] of pairs) {
      const chords = src[j].chords;
      if (!chords.length) continue;
      const w = sec[i];
      if (!inserts.has(w.line)) inserts.set(w.line, []);
      inserts.get(w.line)!.push({ col: w.col, chords });
      placed += chords.length;
    }
  }
  const out = lines.map((line, li) => {
    const ins = (inserts.get(li) || []).sort((a, b) => b.col - a.col);
    for (const { col, chords } of ins) line = line.slice(0, col) + chords.map(c => `[${c}]`).join('') + line.slice(col);
    return line;
  });
  return { body: out.join('\n'), match: total ? found / total : 0, chords: placed };
}

// ---------------------------------------------------------------------------
// Search that forgives: no diacritics needed, words in any order, small typos.
// ---------------------------------------------------------------------------

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

/** Does query word q match text word w? prefix ("biru" -> "biruitor"), or one typo for longer words. */
function wordMatches(q: string, w: string): boolean {
  if (w.startsWith(q)) return true;
  if (q.length >= 4 && editDistanceAtMost1(q, w.slice(0, Math.max(q.length, Math.min(w.length, q.length + 1))))) return true;
  return q.length >= 5 && editDistanceAtMost1(q, w);
}

/** Songs where every query word is found (title counts more). Best matches first. */
export function rankSongs<T extends { title: string; body: string }>(songs: T[], query: string): T[] {
  const qs = String(query).split(/\s+/).map(normWord).filter(Boolean);
  if (!qs.length) return songs;
  const scored: { s: T; score: number }[] = [];
  for (const s of songs) {
    const tw = s.title.split(/\s+/).map(normWord).filter(Boolean);
    const bw = s.body.replace(/\[[^\]]*\]/g, '').split(/\s+/).map(normWord).filter(Boolean);
    let score = 0, ok = true;
    for (const q of qs) {
      if (tw.some(w => w === q)) score += 6;
      else if (tw.some(w => wordMatches(q, w))) score += 4;
      else if (bw.some(w => w === q)) score += 2;
      else if (bw.some(w => wordMatches(q, w))) score += 1;
      else { ok = false; break; }
    }
    if (ok) {
      const tn = tw.join(' '), qn = qs.join(' ');
      if (tn.startsWith(qn)) score += 5;
      else if (tn.includes(qn)) score += 3;
      scored.push({ s, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score || a.s.title.localeCompare(b.s.title, 'ro')).map(x => x.s);
}

// ---------------------------------------------------------------------------
// Section kinds and colors (Strofa, Refren, Bridge…) and renaming a section.
// ---------------------------------------------------------------------------

export type SectionKind = 'verse' | 'chorus' | 'prechorus' | 'bridge' | 'intro' | 'outro' | 'tag' | '';

export function sectionKind(label: string): SectionKind {
  const t = String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/pre-?(chorus|refren)/.test(t)) return 'prechorus';
  if (/^(chorus|refren)/.test(t)) return 'chorus';
  if (/^(bridge|punte)/.test(t)) return 'bridge';
  if (/^intro/.test(t)) return 'intro';
  if (/^(outro|final|ending)/.test(t)) return 'outro';
  if (/^tag/.test(t)) return 'tag';
  if (/^(verse|vers|strofa)/.test(t)) return 'verse';
  return '';
}

/** One color per kind of section, same everywhere in the app. */
export const SECTION_COLORS: Record<string, string> = {
  verse: '#5aa9ff', chorus: '#ffb13b', prechorus: '#ff7eb6', bridge: '#b38cff', intro: '#4fd1a5', outro: '#8f96a3', tag: '#47d7e6', '': '#8f96a3',
};
export const sectionColor = (label: string): string => SECTION_COLORS[sectionKind(label)];

/**
 * Give the block made of `lines` a new section label. The label line right above it is replaced;
 * if there is none, the label is written above the block. Returns the body unchanged if the block is not found.
 */
export function setSectionLabel(body: string, lines: string[], label: string, occurrence = 0): string {
  const all = body.replace(/\r\n?/g, '\n').split('\n');
  const want = lines.map(l => l.trimEnd());
  const name = String(label).trim().replace(/:+$/, '');
  if (!want.length || !name) return body;
  let skip = occurrence;                             // the same words can be in the song twice (a chorus): pick the right one
  for (let i = 0; i + want.length <= all.length; i++) {
    if (!want.every((l, k) => all[i + k].trimEnd() === l)) continue;
    if (skip-- > 0) { i += want.length - 1; continue; }
    let j = i - 1;
    while (j >= 0 && all[j].trim() === '') j--;
    const above = j >= 0 ? all[j].trim() : '';
    const isLabel = SECTION_LABEL.test(above) && above.length < 40;
    if (isLabel && j === i - 1) all[j] = name + ':';
    else all.splice(i, 0, ...(i > 0 && all[i - 1].trim() !== '' ? ['', name + ':'] : [name + ':']));
    return all.join('\n');
  }
  return body;
}

/**
 * Give ONE slide its own section label. When the slide is only part of a longer section
 * (a section split over several slides), the section is split in the song so that every
 * slide can have its own tag; the lines before and after keep the old label.
 */
export function setSlideLabel(body: string, sectionLines: string[], from: number, to: number, label: string, oldLabel = '', occurrence = 0): string {
  if (from <= 0 && to >= sectionLines.length) return setSectionLabel(body, sectionLines, label, occurrence);
  const all = body.replace(/\r\n?/g, '\n').split('\n');
  const want = sectionLines.map(l => l.trimEnd());
  const name = String(label).trim().replace(/:+$/, '');
  if (!want.length) return body;                     // an empty name is allowed: it only splits the section
  let skip = occurrence;
  for (let i = 0; i + want.length <= all.length; i++) {
    if (!want.every((l, k) => all[i + k].trimEnd() === l)) continue;
    if (skip-- > 0) { i += want.length - 1; continue; }
    let start = i;
    const above = i > 0 ? all[i - 1].trim() : '';
    if (above && SECTION_LABEL.test(above) && above.length < 40) start = i - 1;   // replace the old label line too
    const part = (lab: string, lines: string[]) => [...(lab ? [lab + ':'] : []), ...lines];
    const blocks = [
      from > 0 ? part(oldLabel, want.slice(0, from)) : null,
      part(name, want.slice(from, to)),
      to < want.length ? part(oldLabel, want.slice(to)) : null,
    ].filter(Boolean) as string[][];
    const block = blocks.flatMap((b, k) => (k ? ['', ...b] : b));
    const before = start > 0 && all[start - 1].trim() !== '' ? [''] : [];
    all.splice(start, i + want.length - start, ...before, ...block);
    return all.join('\n');
  }
  return body;
}


/**
 * Name the sections of a song that has no names yet: a block that comes back (the same words twice or more,
 * or that starts with "R:") is the chorus — "Refren", a second different one "Refren 2"; the others are "Strofa 1", "Strofa 2"…
 * Sections that already have a name keep it.
 */
export function autoLabel(body: string): string {
  const text = body.replace(/\r\n?/g, '\n');
  const meta = text.split('\n').filter(l => /^\s*\{(title|t|artist|key|tempo|time|capo)\s*:/i.test(l));
  const secs = parseSong(text);
  if (!secs.length) return body;
  const words = (s: Section) => s.lines.map(l => stripChords(l)).join(' ').replace(/^\s*R\s*\d*\s*[:.]\s*/i, '').split(/\s+/).map(normWord).filter(Boolean);
  const sim = (a: string[], b: string[]) => { const A = new Set(a), B = new Set(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.max(A.size, B.size)); };
  const w = secs.map(words);
  const group: number[] = secs.map(() => -1);                // sections with (almost) the same words share a group
  let g = 0;
  for (let i = 0; i < secs.length; i++) {
    if (group[i] >= 0) continue;
    group[i] = g;
    for (let j = i + 1; j < secs.length; j++) if (group[j] < 0 && w[i].length > 2 && sim(w[i], w[j]) >= 0.8) group[j] = g;
    g++;
  }
  // two blocks in a row that start with the same two words ("Hey, hey, tu…" / "Hey, hey și…") are one chorus
  for (let i = 1; i < secs.length; i++) {
    if (!secs[i].label && w[i].length > 1 && w[i - 1].length > 1 && w[i][0] === w[i - 1][0] && w[i][1] === w[i - 1][1]) {
      const from = group[i]; for (let j = 0; j < secs.length; j++) if (group[j] === from) group[j] = group[i - 1];
    }
  }
  const repeatMark = (s: Section) => /\/:/.test(s.lines.map(l => stripChords(l)).join(' '));   // "/: … :/" = sung twice, a chorus
  const count = (k: number) => group.filter(x => x === k).length;
  const used = new Set(secs.map(s => s.label.toLowerCase()).filter(Boolean));
  const known = new Map<number, string>();           // a group with a named member: the others get the same name
  secs.forEach((s, i) => { if (s.label && !known.has(group[i])) known.set(group[i], s.label); });
  const fresh = (base: string, first: boolean) => {   // "Strofa 3" if 1 and 2 are taken; "Refren" then "Refren 2"…
    for (let n = 1; ; n++) { const name = n === 1 && first ? base : base + ' ' + n; if (!used.has(name.toLowerCase())) { used.add(name.toLowerCase()); return name; } }
  };
  const chorusName = new Map<number, string>();
  const names = secs.map((s, i) => {
    if (s.label) return s.label;
    const k = group[i];
    if (known.has(k)) return known.get(k)!;
    const isChorus = count(k) > 1 || repeatMark(s) || /^\s*(\[[^\]]*\])?\s*R\s*\d*\s*[:.]/i.test(s.lines[0] || '');
    if (isChorus) {
      if (!chorusName.has(k)) chorusName.set(k, fresh('Refren', true));
      return chorusName.get(k)!;
    }
    return fresh('Strofa', false);
  });
  const out = secs.map((s, i) => [names[i] + ':', ...s.lines.map(l => /^\s*(\[[^\]]*\])?\s*R\s*\d*\s*[:.]\s*/i.test(l) && s.lines[0] === l ? l.replace(/^(\s*(?:\[[^\]]*\])?)\s*R\s*\d*\s*[:.]\s*/i, '$1') : l)].join('\n'));
  return [...meta, ...(meta.length ? [''] : []), out.join('\n\n')].join('\n');
}

/** How many sections before section k have exactly the same lines (to find the right copy of a repeated chorus). */
export function occurrenceOf(sections: Section[], k: number): number {
  const key = sections[k]?.lines.join('\n');
  return sections.slice(0, k).filter(s => s.lines.join('\n') === key).length;
}
