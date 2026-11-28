// Bethlehem Network Churches — song engine
// One song is stored ONCE as ChordPro-style text: "[G]Mare e [D]Domnul".
// Every part of the app (presenter, stage screen, music stand, phones) derives
// what it needs from that single source.

                                                         
                                                       

const SECTION_LABEL =
  /^\s*(\{(?:c|comment|soc|sov|sob)?:?\s*)?(verse|vers|strofa|strofă|chorus|refren|bridge|punte|pre-?chorus|pre-?refren|intro|outro|final|tag|ending)\b[^\n]*$/i;

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const FLAT_TO_SHARP                         = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B', Fb: 'E' };
const SHARP_EXTRA                         = { 'E#': 'F', 'B#': 'C' };

function normalizeNote(n        )         {
  return FLAT_TO_SHARP[n] ?? SHARP_EXTRA[n] ?? n;
}

/** Clean a section label: "{c: Refren:}" -> "Refren" */
/** A line that is only a section name ("Refren", "Strofa 2:", "{c: Bridge}") — not a lyric that starts with such a word. */
function isLabelLine(t        )          {
  if (!SECTION_LABEL.test(t) || t.length >= 40) return false;
  return /:\s*$/.test(t) || /^\{/.test(t) || /^(verse|vers|strofa|strofă|chorus|refren|bridge|punte|pre-?chorus|pre-?refren|intro|outro|final|tag|ending)\s*\d*\s*$/i.test(t);
}

function cleanLabel(raw        )         {
  return raw.replace(/^\s*\{(?:c|comment|soc|sov|sob)?:?\s*/i, '').replace(/[}:]+\s*$/, '').trim();
}

/** Split a song body into labelled sections. Empty lines or labels start a new section. */
export function parseSong(body        )            {
  const sections            = [];
  let cur          = { label: '', lines: [] };
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
export function readMeta(body        )                         {
  const meta                         = {};
  for (const m of body.matchAll(/^\s*\{(\w+)\s*:\s*([^}]*)\}\s*$/gm)) meta[m[1].toLowerCase()] = m[2].trim();
  return meta;
}

/** Lyrics only (main screen / congregation). */
export function stripChords(line        )         {
  return line.replace(/\[[^\]]*\]/g, '').replace(/\s{2,}/g, ' ').trim();
}

/** Does this text contain inline chords? */
export function hasChords(body        )          {
  return /\[[A-G][^\]]*\]/.test(body);
}

function transposeNote(note        , steps        , preferFlats         )         {
  const idx = NOTES.indexOf(normalizeNote(note));
  if (idx < 0) return note;
  const n = (idx + (steps % 12) + 12) % 12;
  return preferFlats ? NOTES_FLAT[n] : NOTES[n];
}

/** Transpose one chord symbol, e.g. "F#m7/C#". Unknown symbols are returned unchanged. */
export function transposeChord(chord        , steps        , preferFlats = false)         {
  const m = chord.match(/^([A-G][b#]?)([^/]*)(?:\/([A-G][b#]?))?$/);
  if (!m) return chord;
  const [, root, rest, bass] = m;
  return transposeNote(root, steps, preferFlats) + rest + (bass ? '/' + transposeNote(bass, steps, preferFlats) : '');
}

/** Transpose every [chord] in a line or a whole body. */
export function transpose(text        , steps        , preferFlats = false)         {
  if (!steps) return text;
  return text.replace(/\[([^\]]+)\]/g, (_, c        ) => `[${transposeChord(c.trim(), steps, preferFlats)}]`);
}

/** Semitones from one key to another ("G" -> "A" = 2). Minor suffix ignored. */
export function keyDistance(from        , to        )         {
  const a = NOTES.indexOf(normalizeNote(from.replace(/m(in)?$/i, '')));
  const b = NOTES.indexOf(normalizeNote(to.replace(/m(in)?$/i, '')));
  if (a < 0 || b < 0) return 0;
  return (b - a + 12) % 12;
}

/** Keys that usually read better with flats. */
export function prefersFlats(key        )          {
  return /^(F|Bb|Eb|Ab|Db|Gb|Dm|Gm|Cm|Fm|Bbm|Ebm)$/.test(key.trim());
}

/**
 * Turn sections into slides. Long sections are split evenly
 * (a 6-line verse with max 4 becomes 3+3, not 4+2).
 */
export function toSlides(sections           , maxLines = 4)          {
  const out          = [];
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
export function arrange(sections           , order           )            {
  if (!order || !order.length) return sections;
  const byLabel = new Map                 ();
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
export function arrangementIndexes(sections           , order                  )           {
  if (!order || !order.length) return sections.map((_, i) => '#' + i);
  return order.map(l => {
    if (/^#\d+$/.test(l)) return +l.slice(1) < sections.length ? l : '';
    const i = sections.findIndex(s => s.label && s.label.toLowerCase() === l.toLowerCase());
    return i >= 0 ? '#' + i : '';
  }).filter(Boolean);
}

/** After section k was split into n parts, renumber an index arrangement (the split section plays all its parts). */
export function expandArrangement(order          , k        , n        )           {
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
// Romanian / German sheets write minor chords in lower case: "f" = Fm, "c#7" = C#m7, "h" = Bm
const LOWER_CHORD = /^[a-h][b#]?(?:maj|dim|aug|sus|add)?\d*(?:sus\d*)?(?:add\d+)?(?:\/[A-Ha-h][b#]?)?$/;
export function isChordLine(line        )          {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  if (!tokens.some(t => /[A-Ha-h]/.test(t))) return false;
  return tokens.every(t => /^[|/\-x\d.]+$/.test(t) || isChordWord(t));
}
/** "Am", "f#", "A4-", "G-A" (two chords joined), "(D)" */
function isChordWord(t        )          {
  const parts = t.replace(/[()|,]/g, '').split('-').filter(Boolean);
  return parts.length > 0 && parts.every(c => CHORD_TOKEN.test(c) || LOWER_CHORD.test(c));
}
/** The chords of a chord line (plain or half in brackets), each with its column in the words below. */
function chordsOfLine(line        )                                   {
  const { text, chords } = splitChords(line), out = chords.map(c => ({ col: c.col, chord: chordName(c.chord) }));
  for (const m of text.matchAll(/\S+/g)) {
    if (/^[|/\-x\d.]+$/.test(m[0]) || !isChordWord(m[0])) continue;
    m[0].replace(/[()|,]/g, '').split('-').filter(Boolean).forEach(c => out.push({ col: m.index ?? 0, chord: chordName(c) }));
  }
  return out.sort((a, b) => a.col - b.col);
}
/** A chord line half converted before ("A        [F]e"): with the brackets taken off, only chords are left. */
function isMixedChordLine(line        )          {
  if (!line.includes('[')) return false;
  const plain = line.replace(/\[[^\]]*\]/g, ' ');                 // what is outside the brackets must hold a chord too
  return /[A-Ha-h]/.test(plain) && isChordLine(line.replace(/\[([^\]]*)\]/g, ' $1 '));
}
/** "f" -> "Fm", "c#7" -> "C#m7", "h" -> "Bm", "b" -> "Bbm"; anything else unchanged. */
export function chordName(t        )         {
  if (!LOWER_CHORD.test(t)) return t;
  const m = t.match(/^([a-h])([b#]?)(.*)$/) ;
  const root = m[1] === 'h' ? 'B' : m[1].toUpperCase() + m[2];   // Romanian sheets: "b" = Bm (English letters, small = minor)
  const rest = m[3].replace(/\/([a-h])/, (_, x) => '/' + (x === 'h' ? 'B' : x.toUpperCase()));
  return root + (/^(maj|dim|aug)/.test(rest) ? '' : 'm') + rest;
}

// "Pre: Isus…", "R: Cel născut…", "Intro: Ab Db": the name of the section written on the same line as the words
// (or the chords). The name goes on its own line; a chord line above the words moves with them.
const INLINE_LABEL = /^(\s*)(B(?=\s*\d*\s*:)|r|ref|refren|refrain|cor|chorus|pre|pr|pre-?\s?refren|pre-?\s?chorus|bridge|punte|pod|intro|final|outro|coda|tag|str(?:ofa|ofă)?\.?\s*\d{1,2}|v\s*\d{1,2}|vers(?:ul)?\s*\d{1,2})\s*(\d*)\s*:\s*(\S.*)$/i;
function inlineLabelName(w        , n        )         {
  const t = w.toLowerCase().replace(/\s+/g, '');
  const num = (t.match(/\d+/) || [n])[0] || '';
  if (/^(pre|pr)/.test(t)) return 'Pre-refren' + (num ? ' ' + num : '');
  if (/^(r|ref|refren|refrain|cor|chorus)$/.test(t.replace(/\d+/, ''))) return 'Refren' + (num ? ' ' + num : '');
  if (/^(bridge|punte|pod|b$|b\d)/.test(t)) return 'Bridge' + (num ? ' ' + num : '');
  if (/^intro/.test(t)) return 'Intro';
  if (/^(final|outro|coda)/.test(t)) return 'Final';
  if (/^tag/.test(t)) return 'Tag';
  return 'Strofa ' + (num || '1');
}
/** A song saved before lower-case chords and "Pre: words" were understood: chord letters still sit on lines of words. */
export function needsChordCleanup(body        )          {
  return body.split('\n').some(l => { const t = l.trim(); return !!t && !t.startsWith('{') && ((!t.includes('[') && isChordLine(t)) || isMixedChordLine(t) || (INLINE_LABEL.test(t) && !isLabelLine(t))); });
}
export function splitInlineLabels(text        )         {
  const out           = [];
  for (const line of text.split('\n')) {
    const m = line.match(INLINE_LABEL);
    if (!m || /^\s*\{/.test(line)) { out.push(line); continue; }
    const cut = line.length - m[4].length;                         // where the words (or chords) start
    const label = inlineLabelName(m[2], m[3]) + ':';
    const prev = out.at(-1);
    if (prev !== undefined && prev.trim() && isChordLine(prev) && !isChordLine(m[4])) {   // the chords above move left with the words
      out.pop();
      const head = prev.slice(0, cut).trim(), rest = prev.slice(cut), lead = rest.length - rest.trimStart().length;   // chords over the name go first
      const shifted = !rest.trim() ? head : head ? head + ' '.repeat(Math.max(1, lead - head.length)) + rest.trimStart() : rest;
      out.push(label, shifted.trimEnd(), m[4]);
    } else out.push(label, m[4]);
  }
  return out.join('\n');
}

/**
 * Convert "chords above lyrics" text (as found on most chord websites and PDFs)
 * into inline ChordPro: the chord is inserted at its column in the lyric line.
 *
 *   G        D
 *   Mare e Domnul    ->   [G]Mare e [D]Domnul
 */
export function chordsOverToChordPro(text        )         {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out           = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isChordLine(line) || isMixedChordLine(line)) {
      const next = lines[i + 1];
      const chords = chordsOfLine(line);                            // a half-converted line: its bracket chords count as written
      if (next !== undefined && next.trim() !== '' && next.includes('[') && !isChordLine(next) && !isMixedChordLine(next) && !SECTION_LABEL.test(next.trim())) {
        // the words already have some chords: put these in too, by column in the words, keeping theirs
        const { text, chords: have } = splitChords(next);
        const all = [...have, ...chords.filter(c => !have.some(h => Math.abs(h.col - Math.min(c.col, text.length)) <= 1 && h.chord === c.chord)).map(c => ({ col: Math.min(c.col, text.length), chord: c.chord }))];
        let merged = text;
        for (const { col, chord } of all.sort((a, b) => b.col - a.col)) merged = merged.slice(0, col) + `[${chord}]` + merged.slice(col);
        out.push(merged.trimEnd()); i++; continue;
      }
      if (next !== undefined && next.trim() !== '' && !isChordLine(next) && !isMixedChordLine(next) && !SECTION_LABEL.test(next.trim())) {
        let merged = next.padEnd(Math.max(next.length, (chords.at(-1)?.col ?? 0)), ' ');
        for (const { col, chord } of [...chords].reverse()) {
          merged = merged.slice(0, col) + `[${chord}]` + merged.slice(col);
        }
        out.push(merged.trimEnd());
        i++;
      } else {
        // instrumental line; with bars ("|G - - -|C - G -|") the bars stay, for the stage: "[|G] [-] [-] [-|C] …"
        out.push(line.includes('|') ? line.replace(/\[([^\]]*)\]/g, '$1 ').trim().split(/\s+/).map(t => `[${t.replace(/(?<=^|[|\-])[a-h][#b]?(?:\d|maj|dim|sus)*(?=$|[-|/])/g, x => LOWER_CHORD.test(x) ? chordName(x) : x)}]`).join(' ')
          : chords.map(c => `[${c.chord}]`).join(' '));
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
export function labelStanzas(text        )         {
  const CH = '((?:\\[[^\\]]+\\]\\s*)*)';                        // chords before the mark
  const RULES                                    = [
    [new RegExp('^' + CH + '(\\d{1,2})[.)]\\s+(.*)$'), n => 'Strofa ' + n],
    [new RegExp('^' + CH + '(?:str(?:ofa|ofă)?|vers(?:e|ul)?|v)\\.?\\s*(\\d{1,2})\\s*[:.)]?\\s*(.*)$', 'i'), n => 'Strofa ' + n],
    [new RegExp('^' + CH + '(?:pre-?\\s?refren|pre-?\\s?chorus)\\s*(\\d*)\\s*(?:[:.]\\s*(.*))?$', 'i'), n => 'Pre-refren' + (n ? ' ' + n : '')],
    [new RegExp('^' + CH + '(?:r|ref|refren|refrain|cor|chorus)\\s*(\\d*)\\s*[:.]\\s*(.*)$', 'i'), n => 'Refren' + (n ? ' ' + n : '')],
    [new RegExp('^' + CH + '(?:refren|chorus)\\s*(\\d*)()$', 'i'), n => 'Refren' + (n ? ' ' + n : '')],
    [new RegExp('^' + CH + '(?:bridge|punte|pod)\\s*(\\d*)\\s*(?:[:.]\\s*(.*))?$', 'i'), n => 'Bridge' + (n ? ' ' + n : '')],
    [new RegExp('^' + CH + 'B\\s*(\\d*)\\s*[:.]\\s*(.*)$'), n => 'Bridge' + (n ? ' ' + n : '')],
    [new RegExp('^' + CH + '(?:PR|Pre)\\s*(\\d*)\\s*[:.]\\s*(.*)$', 'i'), n => 'Pre-refren' + (n ? ' ' + n : '')],
    [new RegExp('^' + CH + '(?:intro)\\s*(\\d*)\\s*(?:[:.]\\s*(.*))?$', 'i'), () => 'Intro'],
    [new RegExp('^' + CH + '(?:final|outro|coda|încheiere|incheiere)\\s*(\\d*)\\s*(?:[:.]\\s*(.*))?$', 'i'), () => 'Final'],
    [new RegExp('^' + CH + '(?:tag)\\s*(\\d*)\\s*[:.]\\s*(.*)$', 'i'), () => 'Tag'],
  ];
  const out           = [];
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
export function stripRepeatMarks(body        )         {
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
export function autoArrangement(body        )                  {
  const secs = parseSong(body);
  const kinds = secs.map(s => sectionKind(s.label));
  const c = kinds.indexOf('chorus');
  if (c < 0) return null;
  const chorusLabel = secs[c].label.toLowerCase();
  const group           = [];                                   // the chorus may span several sections with the same name
  for (let i = c; i < secs.length && secs[i].label.toLowerCase() === chorusLabel; i++) group.push(i);
  if (secs.some((s, i) => !group.includes(i) && s.label.toLowerCase() === chorusLabel)) return null;   // already written out
  if (kinds.filter(k => k === 'verse').length < 2) return null;
  const order           = [];
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
export function normalizeImported(text        )         {
  let t = text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+$/gm, '')
    // Romanian diacritics: cedilla forms -> correct comma-below forms
    .replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  t = splitInlineLabels(t);                                     // "Pre: words", "Intro: Ab Db" -> the name on its own line
  if (t.split("\n").some(l => isChordLine(l) || isMixedChordLine(l))) t = chordsOverToChordPro(t); // also fixes mixed pastes
  t = labelStanzas(t);
  // blocks without a name get one (the "/: :/" marks help find the chorus), then the marks are dropped
  if (parseSong(t).some(sec => !sec.label)) t = autoLabel(t);
  return fillChords(stripRepeatMarks(t)).body;   // chords written only on the first verse / chorus go on all of them
}

/** Render one line as HTML with chords placed above the syllables (stage / music stand). */
export function chordLineToHtml(line        , escape                       )         {
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

                                                            

/** Word key used for matching: lower case, no diacritics, letters/digits only. */
export function normWord(w        )         {
  return w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

/** A chord sheet (ChordPro) as a stream of words, each with the chords that start on it. */
export function chordStream(body        )               {
  const out               = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || (SECTION_LABEL.test(line) && line.length < 40)) continue;
    if (!line.replace(/\[[^\]]*\]/g, '').trim()) continue;          // chords only (intro): skip
    let pending           = [];
    let word = '', wordChords           = [];
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
function lcsPairs(a          , b          )                     {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs                     = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return pairs;
}

/** Guess the key from the first chord: "Am7" -> "Am", "F#" -> "F#". */
/** The key a song is written in: the one saved with it, else {key: …}, else its first chord. */
export function originalKey(key                    , body        )         {
  return (key || '').trim() || readMeta(body).key || guessKey(body);
}

/** All keys to choose from, major then minor. */
export const KEYS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
  'Cm', 'C#m', 'Dm', 'D#m', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

export function guessKey(body        )         {
  const m = body.match(/\[([A-G][b#]?)(m(?!aj))?/);
  return m ? m[1] + (m[2] ? 'm' : '') : '';
}

/**
 * Copy chords from `sheet` onto `lyrics`. Each section of our song is matched on its own
 * against the whole sheet, so a different section order on the website does not matter.
 * Returns the new body, how many of our words were found (0..1) and how many chords were placed.
 */
export function applyChords(lyrics        , sheet        )                                                  {
  const src = chordStream(sheet);
  const srcKeys = src.map(t => t.norm);
  const lines = lyrics.split('\n');
                                                       
  const sections        = [];
  let cur      = [];
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

  const inserts = new Map                                             ();
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
      inserts.get(w.line) .push({ col: w.col, chords });
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
// Chords on every section: most sheets (websites, Planning Center PDFs) write the chords only on the first verse and
// the first chorus. The other verses sing the same melody, so the same chords fall on the same syllables.
// ---------------------------------------------------------------------------

const VOWEL = /[aeiouyăâîáéíóúàèìòùäëïöüœæ]/i;
const LETTER = /\p{L}/u;

/** Where each syllable of a line starts (column), for placing a chord on it. Romanian-friendly, good enough for songs. */
export function syllableStarts(text        )           {
  const out           = [];
  for (const m of text.matchAll(/\S+/g)) {
    const w = m[0], base = m.index ?? 0;
    let first = -1, prevEnd = -1;
    for (let i = 0; i < w.length; i++) {
      if (!VOWEL.test(w[i])) continue;
      if (i > 0 && VOWEL.test(w[i - 1])) continue;                   // same vowel group ("ia", "oa", "eu")
      if (first >= 0 && /^i\P{L}*$/iu.test(w.slice(i))) continue;  // Romanian final "i" after a consonant is not a syllable: "ești", "pomi"
      if (first < 0) {                                              // first syllable: from the first letter of the word
        let s = 0; while (s < w.length && !LETTER.test(w[s])) s++;
        first = s; out.push(base + s);
      } else {                                                      // next ones: one consonant before the vowel goes with it
        const c = i - 1 > prevEnd && LETTER.test(w[i - 1]) && !VOWEL.test(w[i - 1]) ? i - 1 : i;
        out.push(base + c);
      }
      let e = i; while (e + 1 < w.length && VOWEL.test(w[e + 1])) e++;
      prevEnd = e;
    }
    if (first < 0) { let s = 0; while (s < w.length && !LETTER.test(w[s])) s++; if (s < w.length) out.push(base + s); }   // "Și", "în" have vowels; "/:" has none
  }
  return out;
}

                                              
/** A ChordPro line split into the words and the chords with their column in those words. */
function splitChords(line        )                                      {
  let text = ''; const chords            = [];
  for (const part of line.split(/(\[[^\]]*\])/)) {
    if (/^\[.*\]$/.test(part)) { const c = part.slice(1, -1).trim(); if (c) chords.push({ col: text.length, chord: c }); }
    else text += part;
  }
  return { text, chords };
}

/** Put the chords of `tmpl` (a ChordPro line) on the same syllables of `lyric` (a plain line). */
export function chordsOnSameSyllables(tmpl        , lyric        )         {
  const { text, chords } = splitChords(tmpl);
  if (!chords.length) return lyric;
  const S = syllableStarts(text), T = syllableStarts(lyric);
  const at = new Map                  ();
  const put = (col        , c        ) => { if (!at.has(col)) at.set(col, []); at.get(col) .push(c); };
  for (const { col, chord } of chords) {
    const atSpace = col >= text.trimEnd().length;
    let k = -1;
    if (!atSpace) { k = 0; for (let i = 0; i < S.length; i++) if (S[i] <= col) k = i; if (/\s/.test(text[col] || '')) k = S.findIndex(x => x >= col); }
    if (atSpace || k < 0 || !T.length) put(lyric.trimEnd().length, chord);   // a chord after the last word stays at the end
    else put(T[Math.min(k, T.length - 1)], chord);
  }
  let out = lyric;
  for (const col of [...at.keys()].sort((a, b) => b - a)) out = out.slice(0, col) + at.get(col) .map(c => `[${c}]`).join('') + out.slice(col);
  return out;
}

/**
 * Give chords to the sections that have none, from the first section of the same kind that has them
 * (Strofa 2, 3 from Strofa 1; every Refren from the first Refren). Lines and words never change.
 * Returns the new body and how many sections got chords.
 */
export function fillChords(body        )                                   {
  const lines = body.split('\n');
  const hasCh = (l        ) => /\[[A-H][^\]]*\]/.test(l);
  const lyric = (l        ) => !!stripChords(l).trim();
                                                                    
  const blocks          = [];
  let cur               = null, label = '';
  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t) { cur = null; return; }
    if (isLabelLine(t) || /^\{(c|comment|soc|sov|sob)\b/i.test(t)) { label = cleanLabel(t); cur = null; return; }
    if (/^\{/.test(t)) return;
    if (!cur) { cur = { kind: sectionKind(label), label, rows: [] }; blocks.push(cur); label = ''; }
    if (lyric(raw)) cur.rows.push(i);
  });
  const tmpl = new Map               ();
  for (const b of blocks) {
    const n = b.rows.filter(r => hasCh(lines[r])).length;
    if (n && n * 2 >= b.rows.length && !tmpl.has(b.kind)) tmpl.set(b.kind, b);
  }
  if (!tmpl.size) return { body, filled: 0 };
  let filled = 0;
  for (const b of blocks) {
    if (!b.rows.length || b.rows.every(r => hasCh(lines[r]))) continue;
    const some = b.rows.some(r => hasCh(lines[r]));
    let src = tmpl.get(b.kind);
    if (!src && !b.kind && !some) src = [...tmpl.values()].find(x => x.rows.length === b.rows.length) || tmpl.get('verse');   // no name: same shape
    if (!src || src === b) continue;
    // a block with chords on some lines only (the sheet wrote a chord just where it changes): the missing lines
    // take the chords of the same line in the model; a block without any chords takes them all
    const from = src.rows.filter(r => hasCh(lines[r])).length === src.rows.length || some ? src.rows : src.rows.filter(r => hasCh(lines[r]));
    let did = false;
    b.rows.forEach((r, j) => { if (hasCh(lines[r])) return; const t = lines[from[j % from.length]]; if (!hasCh(t)) return; lines[r] = chordsOnSameSyllables(t, lines[r]); did = true; });
    if (did) filled++;
  }
  return { body: lines.join('\n'), filled };
}

// ---------------------------------------------------------------------------
// Search that forgives: no diacritics needed, words in any order, small typos.
// ---------------------------------------------------------------------------

function editDistanceAtMost1(a        , b        )          {
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
function wordMatches(q        , w        )          {
  if (w.startsWith(q)) return true;
  if (q.length >= 4 && editDistanceAtMost1(q, w.slice(0, Math.max(q.length, Math.min(w.length, q.length + 1))))) return true;
  return q.length >= 5 && editDistanceAtMost1(q, w);
}

/** Songs where every query word is found (title counts more). Best matches first. */
export function rankSongs                                           (songs     , query        )      {
  const qs = String(query).split(/\s+/).map(normWord).filter(Boolean);
  if (!qs.length) return songs;
  const scored                            = [];
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

                                                                                                       

export function sectionKind(label        )              {
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

/**
 * The standard names, like ProPresenter: "Strofa 2" -> "Verse 2", "Refren" -> "Chorus", "Pre-refren" -> "Pre-Chorus",
 * "Punte" -> "Bridge", "Final" -> "Ending". Intro, Tag and names it does not know stay as they are.
 */
export function standardLabel(label        )         {
  const raw = String(label || '').trim(), num = (raw.match(/(\d+)\s*$/) || [])[1];
  const n = num ? ' ' + num : '';
  switch (sectionKind(raw)) {
    case 'verse': return 'Verse' + (n || ' 1');
    case 'chorus': return 'Chorus' + n;
    case 'prechorus': return 'Pre-Chorus' + n;
    case 'bridge': return 'Bridge' + n;
    case 'intro': return 'Intro' + n;
    case 'outro': return 'Ending' + n;
    case 'tag': return 'Tag' + n;
    default: return raw;
  }
}
/** Every section label line of a song written with the standard names (the words and chords do not change). */
export function standardizeLabels(body        )         {
  return String(body || '').replace(/\r\n?/g, '\n').split('\n').map(line => {
    const t = line.trim();
    if (!isLabelLine(t)) return line;
    const was = cleanLabel(t), now = standardLabel(was);
    return now === was ? line : now + ':';
  }).join('\n');
}

/** One color per kind of section, same everywhere in the app. */
export const SECTION_COLORS                         = {
  verse: '#5aa9ff', chorus: '#ffb13b', prechorus: '#ff7eb6', bridge: '#b38cff', intro: '#4fd1a5', outro: '#8f96a3', tag: '#47d7e6', '': '#8f96a3',
};
export const sectionColor = (label        )         => SECTION_COLORS[sectionKind(label)];

/**
 * Give the block made of `lines` a new section label. The label line right above it is replaced;
 * if there is none, the label is written above the block. Returns the body unchanged if the block is not found.
 */
export function setSectionLabel(body        , lines          , label        , occurrence = 0)         {
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
export function setSlideLabel(body        , sectionLines          , from        , to        , label        , oldLabel = '', occurrence = 0)         {
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
    const part = (lab        , lines          ) => [...(lab ? [lab + ':'] : []), ...lines];
    const blocks = [
      from > 0 ? part(oldLabel, want.slice(0, from)) : null,
      part(name, want.slice(from, to)),
      to < want.length ? part(oldLabel, want.slice(to)) : null,
    ].filter(Boolean)              ;
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
export function autoLabel(body        )         {
  const text = body.replace(/\r\n?/g, '\n');
  const meta = text.split('\n').filter(l => /^\s*\{(title|t|artist|key|tempo|time|capo)\s*:/i.test(l));
  const secs = parseSong(text);
  if (!secs.length) return body;
  const words = (s         ) => s.lines.map(l => stripChords(l)).join(' ').replace(/^\s*R\s*\d*\s*[:.]\s*/i, '').split(/\s+/).map(normWord).filter(Boolean);
  const sim = (a          , b          ) => { const A = new Set(a), B = new Set(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, Math.max(A.size, B.size)); };
  const w = secs.map(words);
  const group           = secs.map(() => -1);                // sections with (almost) the same words share a group
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
  const repeatMark = (s         ) => /\/:/.test(s.lines.map(l => stripChords(l)).join(' '));   // "/: … :/" = sung twice, a chorus
  const count = (k        ) => group.filter(x => x === k).length;
  const used = new Set(secs.map(s => s.label.toLowerCase()).filter(Boolean));
  const known = new Map                ();           // a group with a named member: the others get the same name
  secs.forEach((s, i) => { if (s.label && !known.has(group[i])) known.set(group[i], s.label); });
  const fresh = (base        , first         ) => {   // "Strofa 3" if 1 and 2 are taken; "Refren" then "Refren 2"…
    for (let n = 1; ; n++) { const name = n === 1 && first ? base : base + ' ' + n; if (!used.has(name.toLowerCase())) { used.add(name.toLowerCase()); return name; } }
  };
  const rMark = (s         ) => /^\s*(\[[^\]]*\])?\s*R\s*\d*\s*[:.]/i.test(s.lines[0] || '');
  const chorusLike = (k        ) => count(k) > 1 || secs.some((s, i) => group[i] === k && !s.label && (repeatMark(s) || rMark(s)))
    || /^(refren|chorus)/i.test(known.get(k) || '');
  // a block that comes back and every time is followed right away by the chorus is the pre-chorus
  const isPre = (k        ) => {
    if (count(k) < 2 || known.has(k)) return false;
    const at = group.map((x, i) => x === k ? i : -1).filter(i => i >= 0);
    return at.every(i => i + 1 < secs.length && group[i + 1] !== k && chorusLike(group[i + 1]) && count(group[i + 1]) >= count(k));
  };
  const firstChorus = group.findIndex((k, i) => chorusLike(k) && !isPre(k) && !secs[i].label?.match(/^pre/i));
  const chorusRuns = firstChorus < 0 ? 0 : group.filter((k, i) => k === group[firstChorus] && (i === 0 || group[i - 1] !== k)).length;
  const uniqueIdx = secs.map((s, i) => i).filter(i => !secs[i].label && !chorusLike(group[i]) && !known.has(group[i]));
  const lineCount = (i        ) => secs[i].lines.length;
  const usual = (() => { const c = new Map                (); uniqueIdx.forEach(i => c.set(lineCount(i), (c.get(lineCount(i)) || 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0; })();
  // the bridge comes late: after the chorus was sung twice, or the last odd block once the verses are done
  const bridgeOrFinal = (i        )         => {
    if (firstChorus < 0 || i < firstChorus) return '';
    const runsBefore = group.filter((k, j) => j < i && k === group[firstChorus] && (j === 0 || group[j - 1] !== k)).length;
    const last = i === uniqueIdx[uniqueIdx.length - 1];
    if (last && i === secs.length - 1 && lineCount(i) <= 2 && uniqueIdx.length >= 3) return 'Final';
    if (chorusRuns >= 2 && runsBefore >= 2) return 'Bridge';
    if (chorusRuns < 2 && last && uniqueIdx.length >= 4 && lineCount(i) !== usual) return 'Bridge';
    return '';
  };
  const chorusName = new Map                ();
  const names = secs.map((s, i) => {
    if (s.label) return s.label;
    const k = group[i];
    if (known.has(k)) return known.get(k) ;
    if (isPre(k)) { if (!chorusName.has(k)) chorusName.set(k, fresh('Pre-refren', true)); return chorusName.get(k) ; }
    if (chorusLike(k)) { if (!chorusName.has(k)) chorusName.set(k, fresh('Refren', true)); return chorusName.get(k) ; }
    const late = bridgeOrFinal(i);
    if (late) return fresh(late, true);
    return fresh('Strofa', false);
  });
  const out = secs.map((s, i) => [names[i] + ':', ...s.lines.map(l => /^\s*(\[[^\]]*\])?\s*R\s*\d*\s*[:.]\s*/i.test(l) && s.lines[0] === l ? l.replace(/^(\s*(?:\[[^\]]*\])?)\s*R\s*\d*\s*[:.]\s*/i, '$1') : l)].join('\n'));
  return [...meta, ...(meta.length ? [''] : []), out.join('\n\n')].join('\n');
}

/** How many sections before section k have exactly the same lines (to find the right copy of a repeated chorus). */
export function occurrenceOf(sections           , k        )         {
  const key = sections[k]?.lines.join('\n');
  return sections.slice(0, k).filter(s => s.lines.join('\n') === key).length;
}

// ---------------------------------------------------------------- 🎤 what someone says (or dictates) → the program
const foldRo = (t        ) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const SOLFEGE                         = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
const NUMBERS                         = { unu: 1, una: 1, intai: 1, prima: 1, primul: 1, doi: 2, doua: 2, trei: 3, treia: 3, patru: 4, patra: 4, cinci: 5, cincea: 5, sase: 6, sasea: 6, sapte: 7, saptea: 7, opt: 8, opta: 8, noua: 9, zece: 10 };

/** "în G", "în re", "tonul la minor", "în fa diez" → the key ("G", "D", "Am", "F#"), and the words without it. */
export function spokenKey(text        )                                {
  const t = foldRo(text);
  const m = t.match(/\b(?:in|ton(?:ul|alitatea)?|pe)\s+(do|re|mi|fa|sol|la|si|[a-g])(?:\s*(#|diez|b\b|bemol))?(?:\s*(minor|m\b|major))?(?=\s|$|[,.;])/);
  if (!m) return { key: '', rest: text };
  const root = SOLFEGE[m[1]] || m[1].toUpperCase();
  const acc = m[2] ? (/#|diez/.test(m[2]) ? '#' : 'b') : '', minor = m[3] && /^m/.test(m[3]) && m[3] !== 'major';
  return { key: root + acc + (minor ? 'm' : ''), rest: (text.slice(0, m.index) + ' ' + text.slice((m.index || 0) + m[0].length)).trim() };
}

/** The parts of a spoken list: "A, apoi B și după C" → ["A", "B", "C"]. */
export function spokenParts(text        )           {
  return String(text || '').split(/\s*(?:[,;.\n]|\bapoi\b|\bdupa aceea\b|\bdupă aceea\b|\bdupa\b|\bdupă\b|\bsi apoi\b|\bși apoi\b|\bthen\b)\s*/i)
    .map(x => x.replace(/^(?:si|și|pune(?:-mi)?|adauga|adaugă|vreau|cantarea|cântarea|piesa)\s+/i, '').trim()).filter(Boolean);
}

/** 🎤 "Mii de laude în G, apoi Psalmul 8 în re" → which titles (by index) and their keys. Titles are matched on their words,
 *  without diacritics, so "mii de laude" finds "Mii de laude (Lauda Celui ce a biruit)". Parts it cannot match come back in `missed`. */
export function spokenSongs(text        , titles          )                                                                              {
  const words = (t        ) => foldRo(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 1);
  const tw = titles.map(t => words(t));
  const picks                                                 = [], missed           = [];
  for (const part of spokenParts(text)) {
    const { key, rest } = spokenKey(part), q = words(rest).filter(w => !['de', 'si', 'in', 'la', 'cu', 'pe'].includes(w) || words(rest).length < 3);
    if (!q.length) continue;
    let best = -1, score = 0;
    tw.forEach((w, i) => {
      const hit = q.filter(x => w.some(y => y === x || (x.length > 3 && y.startsWith(x)) || (y.length > 3 && x.startsWith(y)))).length / q.length;
      const s = hit - Math.max(0, w.length - q.length) * 0.01 + (foldRo(titles[i]).startsWith(foldRo(rest)) ? 0.05 : 0);
      if (s > score) { score = s; best = i; }
    });
    if (best >= 0 && score >= 0.6) picks.push({ index: best, key, said: part }); else missed.push(part);
  }
  return { picks, missed };
}

/** 🎤 "strofa 1, refren, strofa 2, refren de două ori, bridge, final" → the order as section indexes of the song ("#k").
 *  A number picks the second verse; no number: the first of that kind, then the next ones in turn for verses. */
export function spokenStructure(text        , sections           )                                        {
  const kinds = sections.map(s => ({ kind: sectionKind(s.label), num: +(String(s.label).match(/(\d+)\s*$/) || [])[1] || 0 }));
  const order           = [], missed           = [];
  let nextVerse = 1;
  for (const part of spokenParts(text)) {
    const t = foldRo(part);
    const kind = /pre[- ]?(refren|chorus|cor)/.test(t) ? 'prechorus' : /(refren|chorus|\bcor\b)/.test(t) ? 'chorus' : /(bridge|punte|\bpod\b)/.test(t) ? 'bridge'
      : /intro/.test(t) ? 'intro' : /(final|ending|outro|sfarsit)/.test(t) ? 'outro' : /\btag\b/.test(t) ? 'tag' : /(strof|vers|verse|\bv\s*\d)/.test(t) ? 'verse' : '';
    if (!kind) { missed.push(part); continue; }
    const times = (() => { const m = t.match(/(?:de\s+)?(\d+|doua|trei|patru)\s+ori|x\s*(\d+)/); return m ? (+(m[1] || m[2]) || NUMBERS[m[1]] || 1) : 1; })();
    const nm = t.replace(/(?:de\s+)?(\d+|doua|trei|patru)\s+ori|x\s*\d+/, '').match(/(\d+)|\b(unu|una|intai|prima|primul|doi|doua|trei|treia|patru|patra|cinci|cincea|sase|sasea|sapte|saptea|opt|opta|noua|zece)\b/);
    let num = nm ? (+nm[1] || NUMBERS[nm[2]] || 0) : 0;
    if (kind === 'verse' && !num) num = nextVerse;
    let i = kinds.findIndex(k => k.kind === kind && (num ? (k.num || 1) === num : true));
    if (i < 0 && kind !== 'verse') i = kinds.findIndex(k => k.kind === kind);
    if (i < 0) { missed.push(part); continue; }
    if (kind === 'verse') nextVerse = (kinds[i].num || 1) + 1;
    for (let r = 0; r < Math.min(times, 6); r++) order.push('#' + i);
  }
  return { order, missed };
}
