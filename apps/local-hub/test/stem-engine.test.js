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

test('the click is made on the same clock: each beat starts on its exact frame, also faster and after a jump', () => {
  const onsets = (o, from = 0) => { const r = []; let quiet = 1e9; for (let i = from; i < o.length; i++) { if (o[i] !== 0 && quiet > 2000) r.push(i); quiet = o[i] === 0 ? quiet + 1 : 0; } return r; };
  const k = new StemCore(SR); k.load([[new Float32Array(SR * 20)]]); k.playing = true;
  k.setClick({ on: true, off: SR * 0.5, spf: SR * 0.5, beats: 4 });
  const out = play(k, SR * 3, 2);                 // stem + click output
  const on = onsets(out[1][0]);
  // the attack starts from 0 on the beat's frame, so the first audible sample is the next one
  assert.deepEqual(on.slice(0, 4), [SR * 0.5, SR * 1, SR * 1.5, SR * 2].map(x => x + 1), 'beats at 0.5 s, 1 s, 1.5 s, 2 s');
  const bars = k.events.filter(e => e.t === 'beat').map(e => e.b);
  assert.deepEqual(bars.slice(0, 5), [0, 1, 2, 3, 0], 'the first beat after the offset is bar 1 (the accent)');
  const f = new StemCore(SR); f.load([[new Float32Array(SR * 20)]]); f.speed = 1.25; f.playing = true;
  f.setClick({ on: true, off: 0, spf: SR * 0.5, beats: 4 });
  const fo = onsets(play(f, SR * 2, 2)[1][0]);
  assert.ok(Math.abs(fo[1] - SR * 0.4) <= 2 && Math.abs(fo[2] - SR * 0.8) <= 2, 'faster song: a beat every 0.4 s of output ' + fo.slice(0, 3));
  const j = new StemCore(SR); j.load([[new Float32Array(SR * 20)]]); j.playing = true;
  j.setClick({ on: true, off: 0, spf: SR * 0.5, beats: 4 }); j.jumps.push({ at: SR * 0.7, to: SR * 5.25, id: 1 });
  const jo = onsets(play(j, SR * 2, 2)[1][0], SR * 0.75);
  // after landing at 5.25 s, the next beat of the song is 5.5 s: 0.25 s of output later
  const landed = Math.floor(SR * 0.7 / 128) * 128;
  assert.ok(Math.abs(jo[0] - (landed + SR * 0.25)) <= 130, 'beat after the jump on the song grid: ' + (jo[0] - landed) / SR);
});
