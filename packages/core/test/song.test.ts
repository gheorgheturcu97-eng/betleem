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
  assert.equal(t, 'Strofa 1:\n[C]Și ție', 'a block with no name gets one; an empty label is dropped');
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

test('setSlideLabel gives one slide of a long section its own tag', async () => {
  const { setSlideLabel, parseSong, toSlides } = await import('../src/song.ts');
  const body = 'Strofa 1:\nA\nB\nC\nD';
  const lines = ['A', 'B', 'C', 'D'];
  const out = setSlideLabel(body, lines, 2, 4, 'Refren', 'Strofa 1');
  assert.deepEqual(parseSong(out).map(s => [s.label, s.lines.join('')]), [['Strofa 1', 'AB'], ['Refren', 'CD']]);
  const mid = setSlideLabel('Refren:\n1\n2\n3\n4\n5\n6', ['1', '2', '3', '4', '5', '6'], 2, 4, 'Bridge', 'Refren');
  assert.deepEqual(parseSong(mid).map(s => s.label), ['Refren', 'Bridge', 'Refren']);
  assert.equal(toSlides(parseSong(mid), 2).length, 3, 'still one slide per part');
});

test('arrangement by section number, and renumbering after a split', async () => {
  const { arrange, parseSong, arrangementIndexes, expandArrangement } = await import('../src/song.ts');
  const secs = parseSong('Strofa 1:\nA\n\nRefren:\nB\n\nC');
  assert.deepEqual(arrange(secs, ['#2', 'Refren', '#0', '#9']).map(s => s.lines[0]), ['C', 'B', 'A']);
  assert.deepEqual(arrangementIndexes(secs, ['Refren', 'Strofa 1', 'nimic']), ['#1', '#0']);
  assert.deepEqual(arrangementIndexes(secs, null), ['#0', '#1', '#2']);
  assert.deepEqual(expandArrangement(['#1', '#0', '#2', '#1'], 1, 2), ['#1', '#2', '#0', '#3', '#1', '#2']);
});

test('autoLabel finds the chorus and numbers the verses', async () => {
  const { autoLabel, parseSong } = await import('../src/song.ts');
  const body = 'Unu doi trei patru\nCinci sase\n\n[G]Aleluia slava Lui\nIn veci de veci amin\n\nSapte opt noua zece\nUnspe doispe\n\nAleluia slava Lui\nIn veci de veci amin';
  assert.deepEqual(parseSong(autoLabel(body)).map(s => s.label), ['Strofa 1', 'Refren', 'Strofa 2', 'Refren']);
  assert.equal(parseSong(autoLabel(body))[1].lines[0], '[G]Aleluia slava Lui', 'chords kept');
  const r = autoLabel('Prima strofa aici acum\n\nR: Sfant sfant sfant Domnul\nEste vrednic');
  assert.deepEqual(parseSong(r).map(s => s.label), ['Strofa 1', 'Refren']);
  assert.equal(parseSong(r)[1].lines[0], 'Sfant sfant sfant Domnul', '"R:" mark removed');
  assert.deepEqual(parseSong(autoLabel('Bridge:\nX y z\n\nA b c d')).map(s => s.label), ['Bridge', 'Strofa 1'], 'existing names kept');
});

test('arrange by name takes the following sections with the same name', async () => {
  const { arrange, parseSong } = await import('../src/song.ts');
  const secs = parseSong('Strofa 1:\nA\n\nStrofa 1:\nB\n\nRefren:\nC');
  assert.deepEqual(arrange(secs, ['Refren', 'Strofa 1']).map(s => s.lines[0]), ['C', 'A', 'B']);
});

test('labels go on the right copy of a repeated block', async () => {
  const { setSectionLabel, parseSong, occurrenceOf } = await import('../src/song.ts');
  const body = 'Strofa 1:\nA\n\nR\n\nB\n\nR';
  const secs = parseSong(body);
  assert.equal(occurrenceOf(secs, 3), 1);
  assert.deepEqual(parseSong(setSectionLabel(body, ['R'], 'Refren', 1)).map(s => s.label), ['Strofa 1', '', '', 'Refren']);
});

test('autoLabel does not reuse names and follows named copies', async () => {
  const { autoLabel, parseSong } = await import('../src/song.ts');
  const body = 'Strofa 1:\nUnu doi trei patru\n\nRefren 1:\nSlava slava aleluia amin\n\nCinci sase sapte opt\n\nSlava slava aleluia amin';
  assert.deepEqual(parseSong(autoLabel(body)).map(s => s.label), ['Strofa 1', 'Refren 1', 'Strofa 2', 'Refren 1']);
});

test('lyric sites: marks become tags, repeat marks go away, chorus after every verse', async () => {
  const { normalizeImported, autoArrangement, parseSong, stripRepeatMarks } = await import('../src/song.ts');
  const site = '1. Ce se-aude\nÎn tăcere\n\nR: /: Sfânt și vrednic\nGlorios :/\n\n2. A doua\nRând\n\nStr3 A treia\nrând (x2)\n\nBridge: Punte aici\ngata\n\nFinalul vine curând';
  const n = normalizeImported(site);
  assert.deepEqual(parseSong(n).map(s => s.label), ['Strofa 1', 'Refren', 'Strofa 2', 'Strofa 3', 'Bridge', 'Strofa 4']);
  assert.ok(!/\/:|:\/|x2/.test(n), 'no repeat marks left');
  assert.equal(parseSong(n)[1].lines[0], 'Sfânt și vrednic');
  assert.deepEqual(autoArrangement(n), ['#0', '#1', '#2', '#1', '#3', '#1', '#4', '#1', '#5', '#1']);
  assert.equal(stripRepeatMarks('[A]/:[E] S-a născut'), '[A][E]S-a născut');
  assert.equal(autoArrangement('Strofa 1:\nA\n\nRefren:\nB\n\nStrofa 2:\nC\n\nRefren:\nB'), null, 'already written out');
});

test('autoLabel: pre-chorus before each chorus, bridge late, B: is a bridge', async () => {
  const { autoLabel, parseSong, normalizeImported } = await import('../src/song.ts');
  const V = n => n === 'a' ? 'Noaptea nu va domni\nRaul se va sfarsi' : 'Peste toti va domni\nSi nu se va sfarsi niciodata';
  const P = 'Si acum ne ridicam\nspre cer privim';
  const C = 'Aleluia slava Lui\nIn veci de veci amin';
  const body = [V('a'), P, C, V('b'), P, C, 'Doar Tu esti Domn\nDoar Tu esti Rege\nPentru totdeauna', C].join('\n\n');
  assert.deepEqual(parseSong(autoLabel(body)).map(s => s.label), ['Strofa 1', 'Pre-refren', 'Refren', 'Strofa 2', 'Pre-refren', 'Refren', 'Bridge', 'Refren']);
  assert.deepEqual(parseSong(normalizeImported('1. Unu doi trei\npatru\n\nB: Punte aici\nsi aici')).map(s => s.label), ['Strofa 1', 'Bridge']);
});

import { fillChords, syllableStarts, chordsOnSameSyllables } from '../src/song.ts';

test('chords on every verse and chorus: the same syllables as the first one', () => {
  assert.deepEqual(syllableStarts('Mare e Domnul'), [0, 2, 5, 7, 10]);
  assert.equal(chordsOnSameSyllables('[G]Mare e [D]Domnul în [Em]slavă', 'Tare e Domnul în ceruri'), '[G]Tare e [D]Domnul în [Em]ceruri');
  const body = `Strofa 1:\n[G]Tu ești [D]Domnul\n[Em]Tu ești [C]Rege\n\nRefren:\n[C]Aleluia [D]Doamne\n\nStrofa 2:\nEu sunt robul\nTu ești Tatăl\n\nRefren:\nAleluia Doamne\n\nBridge:\nNumai Tu`;
  const r = fillChords(body);
  assert.equal(r.filled, 2, 'verse 2 and the second chorus; the bridge has no model, it stays as it was');
  assert.match(r.body, /Strofa 2:\n\[G\]Eu sunt \[D\]robul\n\[Em\]Tu ești \[C\]Tatăl/);
  assert.match(r.body, /Refren:\n\[C\]Aleluia \[D\]Doamne\n\nBridge:\nNumai Tu$/);
  assert.equal(fillChords('Strofa 1:\nfără acorduri').filled, 0, 'a song without chords is left alone');
  assert.equal(fillChords(r.body).body, r.body, 'running it again changes nothing');
  assert.match(normalizeImported(body), /Strofa 2:\n\[G\]Eu sunt/, 'imports get it too');
});
