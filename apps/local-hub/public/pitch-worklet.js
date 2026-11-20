// Pitch shifter for the tracks: changes the key without changing the tempo.
// Two read heads move through a short delay line at a different speed than the writing,
// each faded in and out with a smooth window, so the sound never clicks.
class PitchShift extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'semitones', defaultValue: 0, minValue: -12, maxValue: 12, automationRate: 'k-rate' }]; }
  constructor() {
    super();
    this.size = Math.round(sampleRate * 0.1);           // 100 ms window: smooth for music
    this.len = this.size * 4;
    this.buf = [new Float32Array(this.len), new Float32Array(this.len)];
    this.w = 0; this.phase = 0;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp.length) return true;
    const semi = params.semitones[0];
    if (Math.abs(semi) < 0.01) {                         // no change: pass straight through
      for (let c = 0; c < out.length; c++) out[c].set(inp[Math.min(c, inp.length - 1)]);
      this.phase = 0; return true;
    }
    const ratio = Math.pow(2, semi / 12), step = (1 - ratio) / this.size;   // how fast the delay changes
    const n = out[0].length, L = this.len, S = this.size;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 2; c++) this.buf[c][this.w] = inp[Math.min(c, inp.length - 1)][i];
      this.phase += step; if (this.phase >= 1) this.phase -= 1; if (this.phase < 0) this.phase += 1;
      const p2 = (this.phase + 0.5) % 1;
      const g1 = Math.sin(Math.PI * this.phase), g2 = Math.sin(Math.PI * p2);   // two windows that always add up evenly
      for (let c = 0; c < out.length; c++) {
        const b = this.buf[Math.min(c, 1)];
        const r1 = this.w - this.phase * S - 1, r2 = this.w - p2 * S - 1;
        out[c][i] = g1 * read(b, r1, L) + g2 * read(b, r2, L);
      }
      this.w = (this.w + 1) % L;
    }
    return true;
  }
}
function read(b, pos, L) {
  pos = ((pos % L) + L) % L;
  const i = Math.floor(pos), f = pos - i, a = b[i], c = b[(i + 1) % L];
  return a + (c - a) * f;
}
registerProcessor('pitch-shift', PitchShift);
