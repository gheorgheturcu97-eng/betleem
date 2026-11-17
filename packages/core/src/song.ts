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
    if (SECTION_LABEL.test(t) && t.length < 40) {
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
  return order.map(l => byLabel.get(l.toLowerCase())).filter((s): s is Section => !!s);
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
  return t;
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
