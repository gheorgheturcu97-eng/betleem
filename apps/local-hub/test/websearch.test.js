import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDuckDuckGo } from '../src/websearch.js';
import { extractLyrics } from '../src/extract.js';
import { normalizeImported } from '../../../packages/core/src/song.ts';

test('DuckDuckGo results are decoded to real URLs', () => {
  const html = `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.resursecrestine.ro%2Fcantece%2F248052%2Fmaranata&amp;rut=abc">Maranata! - Resurse Creștine</a>`;
  assert.deepEqual(parseDuckDuckGo(html), [{ url: 'https://www.resursecrestine.ro/cantece/248052/maranata', title: 'Maranata! - Resurse Creștine' }]);
});

// shapes copied from the live pages (Nov 2026), text shortened
test('Resurse Creștine lyrics page', () => {
  const html = `<html><head><meta property="og:title" content="Maranata!"></head><body>
    <div class="clearfix"><div class="resized-text">1. Ce se-aude-n depărtare?<br>
În tăcerea zorilor<br>
Un alai de sărbătoare<br>
O oștire de război<br>
<br>
R1: Sfânt și vrednic<br>
Glorios,<br>
Miel de jertfă<br>
</div></div></body></html>`;
  const r = extractLyrics(html, 'www.resursecrestine.ro');
  assert.equal(r.title, 'Maranata!');
  assert.equal(normalizeImported(r.body), 'Strofa 1:\nCe se-aude-n depărtare?\nÎn tăcerea zorilor\nUn alai de sărbătoare\nO oștire de război\n\nRefren 1:\nSfânt și vrednic\nGlorios,\nMiel de jertfă');
});

test('Resurse Creștine chords page (chords above lyrics, &nbsp; spacing)', () => {
  const a = c => `<a href="#" class="nice-acord" onclick="return false;" rel="${c}">${c}</a>`;
  const html = `<meta property="og:title" content="Maranata"><div id="acorduri_wrapper" class="resized-text">
	<form style="display:inline;"><strong>Afisare acorduri:</strong><label for="gacord">chitara</label></form>
	<br><br>
    <span class="stil-acorduri">${a('D')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${a('A')}&nbsp;<br \\="">
Curand&nbsp;Domnul&nbsp;Slavei<br>
<br>
Refren:<br>
&nbsp;&nbsp;&nbsp;${a('D')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${a('G')}&nbsp;<br \\="">
Sa&nbsp;cantam&nbsp;Maranata<br></span></div>`;
  const body = normalizeImported(extractLyrics(html, 'resursecrestine.ro').body);
  assert.equal(body, '[D]Curand [A]Domnul Slavei\n\nRefren:\nSa [D]cantam Ma[G]ranata');
});
