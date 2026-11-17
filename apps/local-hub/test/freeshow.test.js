import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertShow } from '../tools/import-freeshow.js';

const line = (value, chords) => ({ text: [{ value }], ...(chords ? { chords } : {}) });
const slide = (group, globalGroup, ...lines) => ({ group, globalGroup, items: [{ type: 'text', lines: lines.map(l => typeof l === 'string' ? line(l) : l) }] });

test('FreeShow show -> song with labels, order and chords', () => {
  const show = ['x', {
    name: 'Cântare de probă', category: 'song', settings: { activeLayout: 'L' }, meta: { key: 'G' },
    slides: {
      a: slide('Vers', 'verse', 'Prima strofă', line('Cu acord', [{ key: 'G', pos: 0 }, { key: 'D', pos: 3 }])),
      b: slide('Refren', 'chorus', 'Refrenul'),
      c: slide('Vers', 'verse', 'A doua strofă'),
      d: slide('Vers', 'verse', ''),                         // empty slide is dropped
    },
    layouts: { L: { slides: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'b' }, { id: 'd' }] } },
  }];
  const s = convertShow(show);
  assert.equal(s.title, 'Cântare de probă');
  assert.equal(s.key, 'G');
  assert.equal(s.body, 'Strofa 1:\nPrima strofă\n[G]Cu [D]acord\n\nRefren:\nRefrenul\n\nStrofa 2:\nA doua strofă');
  assert.deepEqual(s.arrangement, ['Strofa 1', 'Refren', 'Strofa 2', 'Refren']);
});

test('non-songs are skipped', () => {
  assert.equal(convertShow(['x', { name: 'Anunț', category: 'presentation', slides: { a: slide('', '', 'x') }, layouts: {} }]), null);
});
