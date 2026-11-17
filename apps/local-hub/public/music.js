// Ambient pad (drone) and metronome, made in the browser with Web Audio — no sound files needed.
// The pad plays the root and the fifth of the key (no third), so it fits both major and minor songs.

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function keyRoot(key) {
  const m = String(key || '').match(/^([A-G][b#]?)/);
  return m && m[1] in NOTE ? NOTE[m[1]] : null;
}
const freq = (semi, octave) => 440 * Math.pow(2, (semi - 9) / 12 + (octave - 4));

/** Pick the speaker: Chrome/Electron can send each sound to a different output (e.g. pad to the mixer, click to in-ears). */
async function setOutput(ctx, deviceId) {
  if (ctx.setSinkId) { try { await ctx.setSinkId(deviceId || ''); return true; } catch { return false; } }
  return false;
}
export async function outputs() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput'); } catch { return []; }
}

function reverb(ctx, seconds = 4) {
  const len = ctx.sampleRate * seconds, buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const conv = ctx.createConvolver(); conv.buffer = buf; return conv;
}

export const PAD_SOUNDS = {
  cald: { name: 'Cald', wave: 'sawtooth', cutoff: 750, shimmer: 0 },
  luminos: { name: 'Luminos', wave: 'sawtooth', cutoff: 2200, shimmer: 0.35 },
  moale: { name: 'Moale', wave: 'triangle', cutoff: 1400, shimmer: 0.15 },
};

export class Pad {
  constructor() { this.ctx = null; this.voice = null; this.key = ''; this.sound = 'cald'; this.vol = 0.6; this.playing = false; }
  init() {
    if (this.ctx) return;
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const dry = ctx.createGain(), wet = ctx.createGain(), rv = reverb(ctx);
    dry.gain.value = 0.55; wet.gain.value = 0.75;
    this.bus = ctx.createGain();
    this.bus.connect(dry); this.bus.connect(rv); rv.connect(wet);
    dry.connect(this.master); wet.connect(this.master); this.master.connect(ctx.destination);
  }
  /** One sounding key: low root, root, fifth, octave (+ a soft high shimmer). */
  makeVoice(key) {
    const ctx = this.ctx, root = keyRoot(key); if (root === null) return null;
    const s = PAD_SOUNDS[this.sound] || PAD_SOUNDS.cald;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(this.bus);
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = s.cutoff; filter.Q.value = 0.6; filter.connect(out);
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();      // slow movement so it breathes
    lfo.frequency.value = 0.07; lfoGain.gain.value = s.cutoff * 0.35; lfo.connect(lfoGain); lfoGain.connect(filter.frequency);
    const oscs = [lfo];
    const oct = root >= 5 ? 2 : 3;                                        // keep the root low but not muddy
    const notes = [[root, oct, 0.5], [root, oct + 1, 0.42], [root + 7, oct + 1, 0.32], [root, oct + 2, 0.18]];
    for (const [semi, o, g] of notes) {
      for (const det of [-8, 0, 7]) {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = s.wave; osc.frequency.value = freq(semi, o); osc.detune.value = det;
        gain.gain.value = g / 3 * 0.22; osc.connect(gain); gain.connect(filter); oscs.push(osc);
      }
    }
    if (s.shimmer) {
      for (const [semi, o] of [[root, oct + 3], [root + 7, oct + 3]]) {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq(semi, o); gain.gain.value = s.shimmer * 0.05;
        osc.connect(gain); gain.connect(out); oscs.push(osc);
      }
    }
    oscs.forEach(o => o.start());
    return { out, oscs, key };
  }
  setKey(key, fade = 3) {
    if (!key || key === this.key && this.voice) return;
    this.key = key;
    if (!this.ctx || !this.playing) return;
    const t = this.ctx.currentTime, old = this.voice;
    this.voice = this.makeVoice(key);
    if (this.voice) { this.voice.out.gain.setValueAtTime(0, t); this.voice.out.gain.linearRampToValueAtTime(1, t + fade); }
    if (old) { old.out.gain.cancelScheduledValues(t); old.out.gain.setValueAtTime(old.out.gain.value, t); old.out.gain.linearRampToValueAtTime(0, t + fade);
      setTimeout(() => old.oscs.forEach(o => { try { o.stop(); } catch {} }), (fade + 0.5) * 1000); }
  }
  setSound(name) { this.sound = name; if (this.playing) { const k = this.key; this.key = ''; this.setKey(k, 2); } }
  setVolume(v) { this.vol = v; if (this.ctx && this.playing) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2); }
  async play(key) {
    this.init(); await this.ctx.resume();
    this.playing = true;
    if (key) { this.key = ''; this.setKey(key, 2); }
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.master.gain.value, t); this.master.gain.linearRampToValueAtTime(this.vol, t + 2.5);
  }
  pause() {
    if (!this.ctx || !this.playing) return;
    this.playing = false;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t); this.master.gain.setValueAtTime(this.master.gain.value, t); this.master.gain.linearRampToValueAtTime(0, t + 2.5);
    const v = this.voice; this.voice = null;
    setTimeout(() => { if (!this.playing) { v?.oscs.forEach(o => { try { o.stop(); } catch {} }); } }, 3000);
  }
  async output(deviceId) { this.init(); return setOutput(this.ctx, deviceId); }
}

export class Metronome {
  constructor() { this.ctx = null; this.bpm = 120; this.beats = 4; this.vol = 0.7; this.playing = false; this.onBeat = () => {}; }
  init() { if (!this.ctx) { this.ctx = new AudioContext(); this.out = this.ctx.createGain(); this.out.connect(this.ctx.destination); } }
  click(time, accent) {
    const ctx = this.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = accent ? 1760 : 1180;
    g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(this.vol * (accent ? 0.5 : 0.32), time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(g); g.connect(this.out); osc.start(time); osc.stop(time + 0.06);
  }
  async play() {
    this.init(); await this.ctx.resume();
    if (this.playing) return;
    this.playing = true; this.beat = 0; this.next = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => {                 // schedule a little ahead so the click is steady
      while (this.next < this.ctx.currentTime + 0.12) {
        const b = this.beat, at = this.next;
        this.click(at, b === 0 && this.beats > 1);
        setTimeout(() => this.playing && this.onBeat(b), Math.max(0, (at - this.ctx.currentTime) * 1000));
        this.next += 60 / this.bpm; this.beat = (this.beat + 1) % this.beats;
      }
    }, 25);
  }
  pause() { this.playing = false; clearInterval(this.timer); this.onBeat(-1); }
  setBpm(b) { this.bpm = Math.min(300, Math.max(30, Math.round(b) || 120)); }
  async output(deviceId) { this.init(); return setOutput(this.ctx, deviceId); }
}

/** Tap tempo: average of the last taps. */
export function tapper() {
  let taps = [];
  return () => {
    const now = performance.now();
    taps = taps.filter(t => now - t < 3000); taps.push(now);
    if (taps.length < 2) return 0;
    const gaps = taps.slice(1).map((t, i) => t - taps[i]);
    return Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
  };
}

/**
 * Multitrack player: every stem is its own <audio>, all routed through Web Audio (volume, pan, mute, solo, meter).
 * They start together and are kept in step with the first stem (drift under ~40 ms is corrected).
 */
export class Multitrack {
  constructor() { this.ctx = null; this.ch = []; this.playing = false; this.onTime = () => {}; this.onEnd = () => {}; this.vol = 1; }
  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol;
    this.masterMeter = this.ctx.createAnalyser(); this.masterMeter.fftSize = 512;
    this.master.connect(this.masterMeter); this.master.connect(this.ctx.destination);
  }
  async load(stems) {
    this.init(); this.stop(true);
    for (const c of this.ch) { try { c.el.pause(); c.src.disconnect(); } catch {} }
    this.ch = stems.map(s => {
      const el = new Audio(); el.preload = 'auto'; el.src = '/media/' + encodeURIComponent(s.file); el.crossOrigin = 'anonymous';
      const src = this.ctx.createMediaElementSource(el), gain = this.ctx.createGain(), pan = this.ctx.createStereoPanner(), meter = this.ctx.createAnalyser();
      meter.fftSize = 512; src.connect(gain); gain.connect(pan); pan.connect(meter); pan.connect(this.master);
      return { ...s, panValue: Number(s.pan) || 0, el, src, gain, pan, meter, solo: false };
    });
    this.apply();
    await Promise.all(this.ch.map(c => new Promise(ok => { if (c.el.readyState >= 1) ok(); else { c.el.onloadedmetadata = ok; c.el.onerror = ok; } })));
    if (this.ch[0]) this.ch[0].el.onended = () => { this.playing = false; this.onEnd(); };
    return this.duration;
  }
  get duration() { return Math.max(0, ...this.ch.map(c => c.el.duration || 0)); }
  get time() { return this.ch[0]?.el.currentTime || 0; }
  apply() {
    const anySolo = this.ch.some(c => c.solo);
    for (const c of this.ch) {
      const on = !c.muted && (!anySolo || c.solo);
      c.gain.gain.setTargetAtTime(on ? c.vol : 0, this.ctx.currentTime, 0.02);
      c.pan.pan.value = c.panValue || 0;
    }
    this.master.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.02);
  }
  async play() {
    if (!this.ch.length) return;
    this.init(); await this.ctx.resume();
    const t = this.time;
    this.ch.forEach(c => { c.el.currentTime = t; });
    await Promise.all(this.ch.map(c => c.el.play().catch(() => {})));
    this.playing = true;
    clearInterval(this.sync);
    this.sync = setInterval(() => {                 // keep every stem with the first one
      const ref = this.ch[0]?.el; if (!ref || ref.paused) return;
      for (const c of this.ch.slice(1)) if (!c.el.paused && Math.abs(c.el.currentTime - ref.currentTime) > 0.04) c.el.currentTime = ref.currentTime;
    }, 500);
    const tick = () => { if (!this.playing) return; this.onTime(this.time); this.raf = requestAnimationFrame(tick); };
    tick();
  }
  pause() { this.playing = false; clearInterval(this.sync); cancelAnimationFrame(this.raf); this.ch.forEach(c => c.el.pause()); this.onTime(this.time); }
  stop(quiet) { this.pause(); this.seek(0, quiet); }
  seek(t, quiet) { t = Math.max(0, Math.min(t, this.duration || 0)); this.ch.forEach(c => { try { c.el.currentTime = t; } catch {} }); if (!quiet) this.onTime(t); }
  level(c) {                                        // 0..1 for the meters
    const a = c ? c.meter : this.masterMeter; if (!a) return 0;
    const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d);
    let p = 0; for (const v of d) p = Math.max(p, Math.abs(v)); return Math.min(1, p);
  }
  async output(deviceId) { this.init(); return setOutput(this.ctx, deviceId); }
}
