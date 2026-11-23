import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parsePro7, parsePro6, rtfToText, importFolders, findSame } from '../src/propresenter.js';
import * as core from '../../../packages/core/src/song.ts';

// a tiny protobuf writer, only for building test files
const vint = n => { const b = []; do { let x = n & 0x7f; n = Math.floor(n / 128); if (n) x |= 0x80; b.push(x); } while (n); return Buffer.from(b); };
const f = (n, v) => { const b = Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'utf8'); return Buffer.concat([vint(n * 8 + 2), vint(b.length), b]); };
const m = (...parts) => Buffer.concat(parts);
const uuid = s => f(1, s);
const rtf = t => '{\\rtf1\\ansi\\ansicpg1252{\\fonttbl\\f0 Helvetica;}{\\colortbl;\\red255\\green255\\blue255;}\\f0\\fs120 ' + t + '}';
const cue = (id, text) => f(13, m(f(1, uuid(id)), f(10, f(23, f(2, f(1, f(1, f(1, f(13, f(5, rtf(text)))))))))));
const group = (id, name, cues) => f(12, m(f(1, m(f(1, uuid(id)), f(2, name))), ...cues.map(c => f(2, uuid(c)))));

const PRO = m(f(3, 'Mare e Domnul'),
  f(10, uuid('a1')), f(11, m(f(1, uuid('a1')), f(2, 'Duminică'), f(3, uuid('g1')), f(3, uuid('g2')), f(3, uuid('g1')))),
  group('g1', 'Verse 1', ['c1', 'c2']), group('g2', 'Chorus', ['c3']),
  cue('c1', 'Mare e Domnul\\line \\u537?i vrednic de laud\\u259?'), cue('c2', 'În cetatea Sa'), cue('c3', 'Aleluia\\par Aleluia'));

test('ProPresenter 7: groups, slides in order, Romanian letters, the chosen arrangement', () => {
  const s = parsePro7(PRO);
  assert.equal(s.title, 'Mare e Domnul');
  assert.deepEqual(s.sections.map(x => x.name), ['Verse 1', 'Chorus']);
  assert.equal(s.sections[0].text, 'Mare e Domnul\nși vrednic de laudă\n\nÎn cetatea Sa');
  assert.deepEqual(s.order, ['Verse 1', 'Chorus', 'Verse 1']);
  assert.equal(rtfToText("{\\rtf1\\ansi\\ansicpg1250 Dumnezeu e t\\'e3ria mea}"), 'Dumnezeu e tăria mea');
});

test('ProPresenter 6 (.pro6): groups and text', () => {
  const b = s => Buffer.from(s).toString('base64');
  const xml = `<?xml version="1.0"?><RVPresentationDocument CCLISongTitle="Cerb"><groups><RVSlideGrouping name="Verse 1"><slides><RVDisplaySlide><displayElements><RVTextElement><NSString rvXMLIvarName="PlainText">${b('Cum dorește un cerb')}</NSString></RVTextElement></displayElements></RVDisplaySlide></slides></RVSlideGrouping></groups></RVPresentationDocument>`;
  const s = parsePro6(xml);
  assert.equal(s.title, 'Cerb'); assert.equal(s.sections[0].text, 'Cum dorește un cerb');
});

test('a folder of ProPresenter songs: new ones added, the same song is never copied twice', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
  fs.mkdirSync(path.join(dir, 'Libraries', 'Default'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Libraries', 'Default', 'Mare e Domnul.pro'), PRO);
  fs.writeFileSync(path.join(dir, 'Libraries', 'Default', 'stricat.pro'), Buffer.from([0xff, 0xff, 0xff]));
  const lib = [];
  const add = s => { const x = { id: String(lib.length + 1), ...s }; lib.push(x); return x; };
  const r1 = importFolders([dir], lib, core, add);
  assert.equal(r1.files, 2); assert.deepEqual(r1.added, ['Mare e Domnul']); assert.equal(r1.failed.length, 1);
  assert.match(lib[0].body, /^Strofa 1:/); assert.deepEqual(lib[0].arrangement, ['Strofa 1', 'Refren', 'Strofa 1']); assert.match(lib[0].body, /Aleluia/);
  const r2 = importFolders([dir], lib, core, add);
  assert.equal(r2.added.length, 0); assert.equal(r2.same[0].existing, 'Mare e Domnul');
  assert.ok(findSame(lib, 'MARE E DOMNUL', ''), 'the name without diacritics or capitals');
  assert.ok(findSame(lib, 'Alt titlu', 'Mare e Domnul\nși vrednic de laudă'), 'or the same first lines');
  assert.equal(findSame(lib, 'Alt titlu', 'Cu totul alte versuri aici\nși încă un rând'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
