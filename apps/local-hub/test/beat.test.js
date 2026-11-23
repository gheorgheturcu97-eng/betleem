import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.window ||= globalThis;
const { detectBeat } = await import('../public/music.js');

function clickTrack(bpm, off, sec, rate = 22050, noise = 0.02) {
  const pcm = new Float32Array(rate * sec);
  for (let k = 0; ; k++) { const t = off + k * 60 / bpm; if (t > sec - 1) break; const a = k % 4 === 0 ? 0.9 : 0.5;
    for (let j = 0; j < 400; j++) pcm[Math.round(t * rate) + j] += a * Math.sin(j * 0.6) * Math.exp(-j / 80); }
  for (let i = 0; i < pcm.length; i++) pcm[i] += (Math.random() - 0.5) * noise;
  return pcm;
}

test('🎯 exact tempo and bar 1 from a click track (so the click stays on the tracks for minutes)', () => {
  const r = detectBeat(clickTrack(74.6, 2.3, 300), 22050, 4);
  assert.ok(Math.abs(r.bpm - 74.6) < 0.02, 'tempo ' + r.bpm);
  assert.ok(Math.abs(r.offset - 2.3) < 0.01, 'bar 1 at ' + r.offset);
  const r2 = detectBeat(clickTrack(128, 0.47, 120), 22050, 4);
  assert.ok(Math.abs(r2.bpm - 128) < 0.05 && Math.abs(r2.offset - 0.47) < 0.01);
  assert.equal(detectBeat(new Float32Array(22050 * 10), 22050), null, 'silence: no tempo');
});
