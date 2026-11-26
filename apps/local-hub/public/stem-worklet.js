// 🎚 Motor nou (probă) for MD & TRACK: every stem of a song is read by ONE processor on the audio clock, so the stems
// can never drift apart (they are the same sample index by construction). Tempo without changing the key is one
// shared WSOLA time-stretch: the grain positions are chosen once, on a mix of all stems, and applied to every stem
// alike, so a faster or slower song stays locked too. At the original tempo the stretch is an exact copy (Hann
// windows at 50 % overlap add up to 1 and the search is skipped). Jumps happen on the audio clock (e.g. exactly on the
// next bar) with a 5 ms crossfade, so there is no click.
// The core is a plain class (StemCore) so it is tested in Node (test/stem-engine.test.js).

const WIN = 1536, HS = WIN / 2, TOL = 384, DEC = 4, XF = 256, CAP = 8192;

export class StemCore {
  constructor(sr = 48000) {
    this.sr = sr; this.stems = []; this.len = 0; this.pos = 0; this.playing = false; this.speed = 1;
    this.w = new Float32Array(WIN); for (let k = 0; k < WIN; k++) this.w[k] = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / WIN);   // periodic Hann
    this.jumps = []; this.events = []; this.xf = 0; this.xfFrom = 0;
    this.click = { on: false }; this.voices = [];
  }
  // ---- ⏱ the click, made here on the same clock as the stems (E3). Beat k is at off + k·spf (song frames), or at
  // grid[k] when the song has a tempo map (Ableton ramps). Beat 0 = bar 1. It sounds in output time, so a faster
  // tempo gives faster clicks with the same short tone.
  setClick(c) {
    this.click = c && c.on ? { on: true, off: c.off || 0, spf: c.spf || this.sr / 2, beats: c.beats || 4, grid: c.grid || null, k: 0 } : { on: false };
    this.voices = []; this.clickSync();
  }
  beatAt(k) { const c = this.click; return c.grid ? (k < c.grid.length ? c.grid[k] : Infinity) : c.off + k * c.spf; }
  clickSync() {
    const c = this.click; if (!c.on) return;
    if (c.grid) { let k = 0; while (k < c.grid.length && c.grid[k] < this.pos - 1e-6) k++; c.k = k; }
    else c.k = Math.max(0, Math.ceil((this.pos - c.off) / c.spf - 1e-9));
  }
  renderClick(o, n) {
    const c = this.click, sr = this.sr, att = Math.round(sr * 0.002), life = Math.round(sr * 0.06), tau = sr * 0.05 / 9.2;
    for (let i = 0; i < n; i++) {
      const p = this.pos + i * this.speed;
      while (this.beatAt(c.k) <= p) {
        const accent = c.k % c.beats === 0 && c.beats > 1;
        this.voices.push({ t: 0, f: accent ? 1760 : 1180, amp: accent ? 0.5 : 0.32 });
        this.events.push({ t: 'beat', b: c.k % c.beats }); c.k++;
      }
      let v = 0;
      for (const vo of this.voices) {
        const env = vo.t < att ? vo.t / att : Math.exp(-(vo.t - att) / tau);
        v += vo.amp * env * (Math.sin(2 * Math.PI * vo.f * vo.t / sr) >= 0 ? 1 : -1); vo.t++;
      }
      if (this.voices.length && this.voices[0].t > life) this.voices = this.voices.filter(x => x.t <= life);
      if (o[0]) o[0][i] = v; if (o[1]) o[1][i] = v;
    }
  }
  /** stems: [[Float32Array L, (Float32Array R)], …] at this sample rate */
  load(stems) {
    this.stems = stems.map(chs => (chs && chs.length ? chs : [new Float32Array(0)]));
    this.len = Math.max(0, ...this.stems.map(c => c[0].length));
    this.q = this.stems.map(() => [new Float32Array(CAP), new Float32Array(CAP)]);
    this.tail = this.stems.map(() => [new Float32Array(HS), new Float32Array(HS)]);
    this.jumps = []; this.xf = 0; this.at(0);
  }
  x(s, c, i) { const ch = this.stems[s][Math.min(c, this.stems[s].length - 1)]; return i >= 0 && i < ch.length ? ch[i] : 0; }
  /** start reading at frame p; the previous (virtual) grain ends exactly there, so the sound continues without a dip */
  at(p) {
    this.pos = p; const a = Math.round(p) - HS; this.a = a; this.anom = a; this.qr = 0; this.qn = 0; this.clickSync?.();
    for (let s = 0; s < this.stems.length; s++) for (let c = 0; c < 2; c++) {
      const t = this.tail[s][c]; for (let k = 0; k < HS; k++) t[k] = this.x(s, c, a + HS + k) * this.w[HS + k];
    }
  }
  mix(i) { let v = 0; for (let s = 0; s < this.stems.length; s++) v += this.x(s, 0, i); return v; }
  /** one synthesis hop: HS more samples of every stem into the queue */
  hop() {
    const nominal = this.anom + HS * this.speed, natural = this.a + HS;
    let g = Math.round(nominal);
    if (g !== natural) {                             // the grain that sounds most like the natural continuation (on the mix)
      const L = HS / DEC, ref = new Float32Array(L);
      for (let k = 0; k < L; k++) ref[k] = this.mix(natural + k * DEC);
      const lo = g - TOL, n = (2 * TOL + HS) / DEC, cand = new Float32Array(n);
      for (let k = 0; k < n; k++) cand[k] = this.mix(lo + k * DEC);
      let best = -Infinity, bestD = 0;
      for (let d = 0; d + L <= n; d++) {
        let dot = 0, en = 1e-9; for (let k = 0; k < L; k++) { const v = cand[d + k]; dot += v * ref[k]; en += v * v; }
        const score = dot / Math.sqrt(en); if (score > best) { best = score; bestD = d; }
      }
      g = lo + bestD * DEC;
    }
    this.a = g; this.anom = nominal;
    const start = (this.qr + this.qn) % CAP;
    for (let s = 0; s < this.stems.length; s++) for (let c = 0; c < 2; c++) {
      const q = this.q[s][c], t = this.tail[s][c], w = this.w;
      for (let k = 0; k < HS; k++) {
        q[(start + k) % CAP] = t[k] + this.x(s, c, g + k) * w[k];
        t[k] = this.x(s, c, g + HS + k) * w[HS + k];
      }
    }
    this.qn += HS;
  }
  /** fill outs[s] = [L, R] with n frames */
  render(outs, n) {
    for (const o of outs) for (const ch of o) ch.fill(0);
    if (!this.playing || !this.stems.length) return;
    // a jump planned on the audio clock: it happens in the block that reaches it (at most one block early, ~3 ms)
    const j = this.jumps.find(x => this.pos + n * this.speed > x.at);
    if (j) { this.jumps = this.jumps.filter(x => x !== j); this.seek(j.to, true); this.events.push({ t: 'jumped', id: j.id, to: j.to / this.sr }); }
    while (this.qn < n) this.hop();
    for (let s = 0; s < outs.length && s < this.stems.length; s++) for (let c = 0; c < 2; c++) {
      const q = this.q[s][c], o = outs[s][c]; if (!o) continue;
      for (let i = 0; i < n; i++) o[i] = q[(this.qr + i) % CAP];
    }
    this.qr = (this.qr + n) % CAP; this.qn -= n;
    if (this.xf > 0) {                              // crossfade from where we were (read directly, 5 ms)
      for (let i = 0; i < n && this.xf > 0; i++, this.xf--) {
        const k = XF - this.xf, fin = k / XF, fout = 1 - fin, src = Math.round(this.xfFrom + k * this.speed);
        for (let s = 0; s < outs.length && s < this.stems.length; s++) for (let c = 0; c < 2; c++) {
          const o = outs[s][c]; if (o) o[i] = o[i] * fin + this.x(s, c, src) * fout;
        }
      }
    }
    const co = outs[this.stems.length]; if (this.click.on && co) this.renderClick(co, n);
    this.pos += n * this.speed;
    if (this.pos >= this.len) { this.playing = false; this.pos = this.len; this.events.push({ t: 'ended' }); }
  }
  seek(frame, fade) {
    frame = Math.max(0, Math.min(this.len, frame));
    if (fade && this.playing) { this.xf = XF; this.xfFrom = this.pos; }
    this.at(frame);
  }
}

if (typeof AudioWorkletProcessor !== 'undefined') {
  class StemProcessor extends AudioWorkletProcessor {
    constructor() {
      super(); this.core = new StemCore(sampleRate); this.tick = 0;
      this.port.onmessage = ({ data: m }) => {
        const k = this.core;
        if (m.t === 'load') { k.load(m.stems); k.playing = false; }
        else if (m.t === 'play') { k.playing = k.len > 0 && k.pos < k.len; if (k.playing) k.at(k.pos); }
        else if (m.t === 'pause') k.playing = false;
        else if (m.t === 'seek') k.seek(m.to * sampleRate, m.fade);
        else if (m.t === 'speed') k.speed = Math.min(2, Math.max(0.5, m.v || 1));
        else if (m.t === 'jump') k.jumps.push({ at: m.at * sampleRate, to: m.to * sampleRate, id: m.id });
        else if (m.t === 'click') k.setClick(m.on ? { on: true, off: m.off * sampleRate, spf: m.spb * sampleRate, beats: m.beats, grid: m.grid ? m.grid.map(x => x * sampleRate) : null } : null);
        else if (m.t === 'cancel') k.jumps = m.id == null ? [] : k.jumps.filter(x => x.id !== m.id);
        this.say();
      };
    }
    say(p = this.core.pos) { this.port.postMessage({ t: 'pos', pos: p / sampleRate, ct: currentTime, playing: this.core.playing }); }
    process(inputs, outputs) {
      const n = outputs[0]?.[0]?.length || 128, p0 = this.core.pos;
      this.core.render(outputs, n);
      const ev = this.core.events.splice(0);
      for (const e of ev) this.port.postMessage(e);
      // ~ every 20 ms: where the song is at `currentTime` (the start of this block), on the audio clock
      if (++this.tick % 8 === 0 && !ev.length) this.say(p0);
      return true;
    }
  }
  registerProcessor('stems', StemProcessor);
}
