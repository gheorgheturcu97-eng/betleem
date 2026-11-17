import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSong, stripChords, transpose, transposeChord, keyDistance, toSlides, arrange,
  isChordLine, chordsOverToChordPro, normalizeImported, readMeta,
} from '../src/song.ts';

const SONG = `{title: Mare e Domnul}
{key: G}
Strofa 1:
[G]Mare e [D]Domnul și [Em]vrednic de laudă
[C]Mare e [D]Domnul în [G]cetatea Sa

Refren:
[C]Aleluia, [D]aleluia
[Em]Slavă Lui în [C]veci
[G]Aleluia, [D]aleluia
[C]Domnul e [D]Rege
[G]Domnul e Rege`;

test('parseSong finds labelled sections and skips metadata', () => {
  const s = parseSong(SONG);
  assert.equal(s.length, 2);
  assert.equal(s[0].label, 'Strofa 1');
  assert.equal(s[1].label, 'Refren');
  assert.equal(s[1].lines.length, 5);
});

test('readMeta reads key', () => {
  assert.equal(readMeta(SONG).key, 'G');
});

test('stripChords leaves clean lyrics', () => {
  assert.equal(stripChords('[G]Mare e [D]Domnul'), 'Mare e Domnul');
});

test('transpose up and down, slash chords, flats', () => {
  assert.equal(transposeChord('G', 2), 'A');
  assert.equal(transposeChord('F#m7/C#', 1), 'Gm7/D');
  assert.equal(transposeChord('Bb', 2), 'C');
  assert.equal(transposeChord('C', -1, true), 'B');
  assert.equal(transposeChord('D', 1, true), 'Eb');
  assert.equal(transpose('[G]Mare [D/F#]e', 2), '[A]Mare [E/G#]e');
});

test('keyDistance', () => {
  assert.equal(keyDistance('G', 'A'), 2);
  assert.equal(keyDistance('A', 'G'), 10);
  assert.equal(keyDistance('Em', 'Gm'), 3);
});

test('toSlides splits long sections evenly', () => {
  const slides = toSlides(parseSong(SONG), 4);
  // verse 2 lines -> 1 slide; chorus 5 lines -> 3+2
  assert.deepEqual(slides.map(s => s.lines.length), [2, 3, 2]);
  assert.equal(slides[1].label, 'Refren');
});

test('arrange repeats sections by label', () => {
  const a = arrange(parseSong(SONG), ['Strofa 1', 'Refren', 'refren']);
  assert.equal(a.length, 3);
  assert.equal(a[2].label, 'Refren');
});

test('isChordLine recognises chord rows only', () => {
  assert.ok(isChordLine('G       D/F#    Em7   Csus4'));
  assert.ok(!isChordLine('Mare e Domnul'));
  assert.ok(!isChordLine('A venit Isus'));
});

test('chordsOverToChordPro places chords at their columns', () => {
  // D sits at column 7, exactly above "Domnul"
  assert.equal(chordsOverToChordPro('G      D\nMare e Domnul'), '[G]Mare e [D]Domnul');
  // chord past the end of the lyric line is kept at the end
  assert.equal(chordsOverToChordPro('G           D    Em\nMare e'), '[G]Mare e      [D]     [Em]');
  // a chord row with nothing under it stays as an instrumental line
  assert.equal(chordsOverToChordPro('G  D  Em\n\nStrofa'), '[G] [D] [Em]\n\nStrofa');
});

test('normalizeImported fixes Romanian cedilla diacritics and converts chords', () => {
  const t = normalizeImported('C\nŞi ţie\n\n\n\nRefren');
  assert.equal(t, '[C]Și ție\n\nRefren');
});

test('labelStanzas turns site numbering into section labels', async () => {
  const { labelStanzas } = await import('../src/song.ts');
  assert.equal(labelStanzas('1. Ce se-aude\nÎn tăcere\n\nR1: Sfânt și vrednic\nGlorios\n\nR:\nMaranata'),
    'Strofa 1:\nCe se-aude\nÎn tăcere\n\nRefren 1:\nSfânt și vrednic\nGlorios\n\nRefren:\nMaranata');
  // chords before the number stay with the line; numbers inside a stanza are left alone
  assert.equal(labelStanzas('[D]1. Curând\n2. nu e label'), 'Strofa 1:\n[D]Curând\n2. nu e label');
});
