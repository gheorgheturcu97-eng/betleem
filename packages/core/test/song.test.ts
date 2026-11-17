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

// Real shapes from resursecrestine.ro (Nov 2026): a bare chord line above a wrapped line,
// aligned chords, "/:" repeat marks, no diacritics in places, different section order.
const RC_SHEET = `C
Pe câmpul de război Tu ești cu
mine,
Am
Mă-mbărbătezi să lupt ca un
viteaz.

  F                  C
/: Biruitor eu voi umbla,
Am                           G
Nu e dusman impotriva sa-mi stea!
F                       C
Tu mă conduci cu dreapta Ta,
Am                  G
Isuse, a Ta e victoria!  :/`;

const OURS = `Strofa 3:
Biruitor eu voi umbla
Nu e dușman împotrivă să-mi stea
Tu mă conduci cu dreapta Ta
Isuse a Ta e victoria

Strofa 1:
Pe câmpul de război Tu ești cu mine
Mă-mbărbătezi să lupt ca un viteaz
Îmi pui în mână sabia și scutul`;

test('applyChords puts website chords on our own lyrics', async () => {
  const { applyChords, guessKey } = await import('../src/song.ts');
  const sheet = normalizeImported(RC_SHEET);
  const r = applyChords(OURS, sheet);
  const lines = r.body.split('\n');
  assert.equal(lines[1], '[F]Biruitor eu voi [C]umbla', 'chord after "/:" lands on the first word');
  assert.equal(lines[2], '[Am]Nu e dușman împotrivă să-mi [G]stea', 'our diacritics kept, chords matched without them');
  assert.equal(lines[4], '[Am]Isuse a Ta e [G]victoria');
  assert.equal(lines[7], '[C]Pe câmpul de război Tu ești cu mine', 'bare chord line above lyrics');
  assert.equal(lines[9], 'Îmi pui în mână sabia și scutul', 'lines missing on the website stay as they were');
  assert.equal(lines[0], 'Strofa 3:', 'labels untouched');
  assert.ok(r.match > 0.8 && r.match < 1, 'match ratio ' + r.match);
  assert.equal(r.chords, 10);
  assert.equal(guessKey(r.body), 'F');
});

test('applyChords does not touch lines that already have chords', async () => {
  const { applyChords } = await import('../src/song.ts');
  assert.equal(applyChords('[D]Mare e Domnul', '[G]Mare e Domnul').body, '[D]Mare e Domnul');
});

test('rankSongs: no diacritics, any word order, small typos, title first', async () => {
  const { rankSongs } = await import('../src/song.ts');
  const songs = [
    { title: 'Iubirea Ta este atât de mare', body: 'Iubirea Ta' },
    { title: 'Biruitor', body: 'Pe câmpul de război Tu ești cu mine' },
    { title: 'Ancora', body: 'Ești ancora mea, biruitor în viață' },
  ];
  assert.deepEqual(rankSongs(songs, 'atat de mare iubirea').map(s => s.title), ['Iubirea Ta este atât de mare']);
  assert.deepEqual(rankSongs(songs, 'razboi campul').map(s => s.title), ['Biruitor'], 'lyrics, other order, no diacritics');
  assert.deepEqual(rankSongs(songs, 'biruitr').map(s => s.title), ['Biruitor', 'Ancora'], 'one typo; title match ranks first');
  assert.deepEqual(rankSongs(songs, 'biru').map(s => s.title), ['Biruitor', 'Ancora'], 'start of a word');
  assert.deepEqual(rankSongs(songs, 'xyz'), []);
});

test('sectionKind and colors', async () => {
  const { sectionKind, sectionColor } = await import('../src/song.ts');
  assert.equal(sectionKind('Strofa 2'), 'verse');
  assert.equal(sectionKind('Refren 1'), 'chorus');
  assert.equal(sectionKind('Pre-refren'), 'prechorus');
  assert.equal(sectionKind('Punte'), 'bridge');
  assert.equal(sectionKind('Final'), 'outro');
  assert.notEqual(sectionColor('Refren'), sectionColor('Strofa 1'));
});

test('setSectionLabel renames or adds a label above a block', async () => {
  const { setSectionLabel, parseSong } = await import('../src/song.ts');
  const body = 'Strofa 1:\n[G]Unu\nDoi\n\nTrei\nPatru';
  assert.equal(setSectionLabel(body, ['[G]Unu', 'Doi'], 'Refren'), 'Refren:\n[G]Unu\nDoi\n\nTrei\nPatru');
  const added = setSectionLabel(body, ['Trei', 'Patru'], 'Bridge');
  assert.deepEqual(parseSong(added).map(s => s.label), ['Strofa 1', 'Bridge']);
  assert.equal(setSectionLabel(body, ['Nu exista'], 'Refren'), body);
});
