import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzePptx, pdfPageCount } from '../src/showcheck.js';

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
