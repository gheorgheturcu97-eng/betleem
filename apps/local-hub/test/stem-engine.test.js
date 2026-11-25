import test from 'node:test';
import assert from 'node:assert/strict';
import { StemCore } from '../public/stem-worklet.js';

const SR = 48000;
const sine = (f, secs, amp = 0.5, ph = 0) => Float32Array.from({ length: SR * secs }, (_, i) => amp * Math.sin(2 * Math.PI * f * i / SR + ph));
function play(core, frames, stems = core.stems.length) {
  const out = Array.from({ length: stems }, () => [new Float32Array(frames), new Float32Array(frames)]);
  for (let i = 0; i < frames; i += 128) {
    const blk = Array.from({ length: stems }, () => [new Float32Array(128), new Float32Array(128)]);
    core.render(blk, 128);
    for (let s = 0; s < stems; s++) for (let c = 0; c < 2; c++) out[s][c].set(blk[s][c].subarray(0, Math.min(128, frames - i)), i);
  }
  return out;
}
const freq = (a, from, to) => { let z = 0; for (let i = from + 1; i < to; i++) if (a[i - 1] < 0 && a[i] >= 0) z++; return z / ((to - from) / SR); };

test('at the original tempo the engine is an exact copy of every stem', () => {
  const k = new StemCore(SR), a = sine(220, 2), b = sine(330, 2, 0.3);
  k.load([[a], [b, b]]); k.playing = true;
  const [oa, ob] = play(k, SR);
  let err = 0; for (let i = 0; i < SR; i++) err = Math.max(err, Math.abs(oa[0][i] - a[i]), Math.abs(oa[1][i] - a[i]), Math.abs(ob[1][i] - b[i]));
  assert.ok(err < 1e-6, 'max error ' + err);
});

test('faster tempo: the stems stay locked to each other and the key does not change', () => {
  const k = new StemCore(SR), a = sine(440, 6), b = a.map(v => v * 0.5);
  k.load([[a], [b]]); k.speed = 1.25; k.playing = true;
  const [oa, ob] = play(k, SR * 2);
  let err = 0; for (let i = 0; i < SR * 2; i++) err = Math.max(err, Math.abs(ob[0][i] - 0.5 * oa[0][i]));
  assert.ok(err < 1e-6, 'stems apart by ' + err);
  assert.ok(Math.abs(k.pos / SR - 2.5) < 0.01, 'song moved 2.5 s in 2 s: ' + k.pos / SR);
  const f = freq(oa[0], SR / 2, SR * 2); assert.ok(Math.abs(f - 440) < 6, 'pitch kept: ' + f);
});

test('a jump planned on the audio clock happens there, without a click', () => {
  const k = new StemCore(SR), a = sine(440, 6);
  k.load([[a]]); k.playing = true; k.jumps.push({ at: SR * 1, to: SR * 3.0003, id: 7 });
  const [o] = play(k, SR * 1.5);
  const ev = k.events.find(e => e.t === 'jumped'); assert.equal(ev?.id, 7);
  assert.ok(Math.abs(k.pos / SR - 3.5) < 0.01, 'after the jump: ' + k.pos / SR);
  let worst = 0; for (let i = SR * 0.98; i < SR * 1.03; i++) worst = Math.max(worst, Math.abs(o[0][i] - o[0][i - 1]));
  assert.ok(worst < 0.08, 'biggest step around the jump ' + worst + ' (a sine step is 0.029; a click would be up to 1)');
});

test('the end of the song stops it and says so', () => {
  const k = new StemCore(SR); k.load([[sine(220, 1)]]); k.playing = true;
  play(k, SR * 1.2);
  assert.equal(k.playing, false); assert.ok(k.events.some(e => e.t === 'ended'));
});
