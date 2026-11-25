import test from 'node:test';
import assert from 'node:assert/strict';
import { Multitrack } from '../public/music.js';

// fake stems: only what keepInStep reads and writes
const stem = (t, rate = 1) => ({ el: { currentTime: t, playbackRate: rate, paused: false, ended: false } });

test('a stem a little late glides back by speeding up (no jump); a stem far away jumps', () => {
  const mt = new Multitrack(); mt.rate = 1.15; mt.stats = { seeks: 0, worst: 0 };
  mt.ch = [stem(10), stem(9.98), stem(10.02), stem(10.001), stem(9.7)];
  mt.keepInStep();
  const [, late, early, near, far] = mt.ch.map(c => c.el);
  assert.ok(late.playbackRate > 1.15 && late.playbackRate <= 1.15 * 1.02 + 1e-9, 'late: a bit faster, at most 2 %');
  assert.ok(early.playbackRate < 1.15 && early.playbackRate >= 1.15 * 0.98 - 1e-9, 'early: a bit slower');
  assert.equal(near.playbackRate, 1.15, 'within 3 ms: left alone');
  assert.equal(far.currentTime, 10, 'more than 150 ms: put back on the first stem');
  assert.equal(far.playbackRate, 1.15);
  assert.equal(mt.stats.seeks, 1);
});

test('back in step: the speed returns to the tempo', () => {
  const mt = new Multitrack(); mt.rate = 1;
  mt.ch = [stem(5), stem(5.0005, 1.012)];
  mt.keepInStep();
  assert.equal(mt.ch[1].el.playbackRate, 1);
});
