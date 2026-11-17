import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../../../packages/core/src/song.ts';
import { findChords, addChordsToSongs, chordLinks } from '../src/chords.js';

const a = c => `<a href="#" class="nice-acord" onclick="return false;" rel="${c}">${c}</a>`;
const SHEET = `<html><div id="acorduri_wrapper" class="resized-text">
	<form style="display:inline;"><strong>Afisare acorduri:</strong></form>
	<br><br>
    <span class="stil-acorduri">C<br>
Pe&nbsp;câmpul&nbsp;de&nbsp;război&nbsp;Tu&nbsp;ești&nbsp;cu&nbsp;<br>
mine,<br>
Am<br>
Mă-mbărbătezi&nbsp;să&nbsp;lupt&nbsp;ca&nbsp;un<br>
viteaz.<br>
<br>
&nbsp;&nbsp;${a('F')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${a('C')}&nbsp;<br \\="">
/:&nbsp;Biruitor&nbsp;eu&nbsp;voi&nbsp;umbla,<br>
${a('Am')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${a('G')}&nbsp;<br \\="">
Nu&nbsp;e&nbsp;dușman&nbsp;împotrivă&nbsp;să-mi&nbsp;stea!<br></span></div></html>`;
const SEARCH = `<a href="https://www.resursecrestine.ro/acorduri/327749/biruitor">Biruitor</a>
  <a href="https://www.resursecrestine.ro/acorduri/194697/colindam-biruitori">Colindăm</a>`;
const OTHER = `<div class="resized-text">${a('D')}<br>Colindăm&nbsp;biruitori&nbsp;pe&nbsp;cer<br>${a('A')}<br>Altă&nbsp;cântare&nbsp;cu&nbsp;totul</div>`;

const fakeFetch = async url => {
  const body = url.includes('/cauta/') ? SEARCH : url.includes('327749') ? SHEET : OTHER;
  return { ok: true, status: 200, text: async () => body };
};

const SONG = { title: 'Biruitor', body: 'Strofa 1:\nPe câmpul de război Tu ești cu mine\nMă-mbărbătezi să lupt ca un viteaz\n\nRefren:\nBiruitor eu voi umbla\nNu e dușman împotrivă să-mi stea' };

test('chordLinks finds chord pages in search results', () => {
  assert.deepEqual(chordLinks(SEARCH).length, 2);
});

test('findChords picks the sheet that matches our words and keeps our text', async () => {
  const r = await findChords(SONG, core, { fetchImpl: fakeFetch });
  assert.ok(r, 'found');
  assert.match(r.url, /327749/);
  assert.equal(r.body.split('\n')[1], '[C]Pe câmpul de război Tu ești cu mine');
  assert.equal(r.body.split('\n')[5], '[F]Biruitor eu voi [C]umbla');
  assert.equal(r.key, 'C');
});

test('a song with no matching sheet is left alone', async () => {
  const r = await findChords({ title: 'Necunoscută', body: 'Strofa 1:\nVersuri care nu există nicăieri\nAltceva cu totul diferit aici' }, core, { fetchImpl: fakeFetch });
  assert.equal(r, null);
});

test('addChordsToSongs skips songs that already have chords and reports', async () => {
  const done = [];
  const res = await addChordsToSongs([SONG, { title: 'Gata', body: '[G]Are deja' }], core, { fetchImpl: fakeFetch, onSong: s => done.push(s.title) });
  assert.deepEqual(res.added, ['Biruitor']);
  assert.deepEqual(done, ['Biruitor']);
});
