import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzePptx, pdfPageCount, fontFamilyName } from '../src/showcheck.js';

test('🔎 a PowerPoint is read before the import: slides, the hidden one, 16:9, the fonts it needs', () => {
  const a = analyzePptx(fs.readFileSync(new URL('./fixtures/proba.pptx', import.meta.url)));
  assert.equal(a.slides, 3); assert.equal(a.visible, 2); assert.deepEqual(a.hiddenAt, [2]);
  assert.equal(a.size.ratio, '16:9');
  for (const f of ['Montserrat', 'Calibri', 'Bebas Neue']) assert.ok(a.fonts.includes(f), f);
  assert.deepEqual(a.videos, []); assert.deepEqual(a.external, []);
});

test('🔎 the pages of a PDF are counted (to check that every slide came out)', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R >> endobj\n4 0 obj << /Type /Page /Parent 2 0 R >> endobj\n', 'latin1');
  assert.equal(pdfPageCount(pdf), 2);
});

test('🔤 the family name is read from inside a font file (so a font put in Documente/Betleem/Fonturi gets its real name)', () => {
  const name = Buffer.from('Calibri', 'utf16le').swap16(), tbl = Buffer.alloc(6 + 12 + name.length);
  tbl.writeUInt16BE(0, 0); tbl.writeUInt16BE(1, 2); tbl.writeUInt16BE(18, 4);
  tbl.writeUInt16BE(3, 6); tbl.writeUInt16BE(1, 8); tbl.writeUInt16BE(0x409, 10); tbl.writeUInt16BE(1, 12); tbl.writeUInt16BE(name.length, 14); tbl.writeUInt16BE(0, 16);
  name.copy(tbl, 18);
  const head = Buffer.alloc(12 + 16); head.writeUInt32BE(0x00010000, 0); head.writeUInt16BE(1, 4);
  head.write('name', 12, 'latin1'); head.writeUInt32BE(28, 20); head.writeUInt32BE(tbl.length, 24);
  assert.equal(fontFamilyName(Buffer.concat([head, tbl])), 'Calibri');
});
