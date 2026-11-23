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
    const g = typeof this.graph === 'function' ? this.graph() : this.graph;     // inside the tracks' sound (routable) or on its own
    const ctx = this.ctx = g?.ctx || new AudioContext();
    this.master = ctx.createGain(); this.master.gain.value = 0;
    const dry = ctx.createGain(), wet = ctx.createGain(), rv = reverb(ctx);
    dry.gain.value = 0.55; wet.gain.value = 0.75;
    this.bus = ctx.createGain();
    this.bus.connect(dry); this.bus.connect(rv); rv.connect(wet);
    dry.connect(this.master); wet.connect(this.master); this.master.connect(g?.out || ctx.destination);
  }
  /** 🎹 the church's own pads (Documents/Betleem/pad: one file per key, e.g. "C.wav", "F# Pad.mp3"), looped. */
  async loadFiles() {
    this.files = {}; this.buffers ||= {};
    try { for (const f of await fetch('/api/pads').then(r => r.ok ? r.json() : [])) { const k = keyRoot(String(f).replace(/\.[a-z0-9]+$/i, '').match(/\b([A-G](?:#|b|♯|♭)?)(?![a-z])/i)?.[1]?.replace('♯', '#').replace('♭', 'b') || ''); if (k !== null && !(k in this.files)) this.files[k] = '/pads/' + encodeURIComponent(f); } } catch {}
    return Object.keys(this.files).length;
  }
  async fileBuffer(root) {
    if (!this.files?.[root]) return null; this.init();
    this.buffers[root] ||= fetch(this.files[root]).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b)).catch(() => null);
    return this.buffers[root];
  }
  /** One sounding key: low root, root, fifth, octave (+ a soft high shimmer). With "Fișierele voastre": the recorded pad. */
  makeVoice(key) {
    const ctx = this.ctx, root = keyRoot(key); if (root === null) return null;
    if (this.sound === 'fisiere' && this.files?.[root]) {
      const out = ctx.createGain(); out.gain.value = 0; out.connect(this.master);     // recorded pads already have their own space: no extra reverb
      const v = { out, oscs: [], key };
      this.fileBuffer(root).then(buf => { if (!buf || this.voice !== v) return; const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(out); src.start(); v.oscs.push(src); });
      return v;
    }
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

/**
 * 🎯 The exact tempo and where bar 1 falls, from a click (or drums) track: find the hits, fit a straight line through them
 * (time = start + beat × period), so even 0.1 BPM is right over a 7-minute song. The loudest beat of the bar
 * (the click's accent) is bar 1. Returns { bpm, offset, beats, confidence } or null.
 */
export function detectBeat(pcm, rate, beatsPerBar = 4) {
  const hop = Math.max(64, Math.round(rate * 0.005)), n = Math.floor(pcm.length / hop);   // 5 ms frames
  if (n < 400) return null;
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) { let m = 0; for (let j = i * hop, e = j + hop; j < e; j++) { const v = Math.abs(pcm[j]); if (v > m) m = v; } env[i] = m; }
  const on = new Float32Array(n);                     // how much louder than just before: a hit
  for (let i = 3; i < n; i++) { const prev = Math.max(env[i - 1], env[i - 2], env[i - 3]); on[i] = Math.max(0, env[i] - prev); }
  let mx = 0; for (const v of on) if (v > mx) mx = v; if (!mx) return null;
  const hits = [];                                    // [time, strength], at least 120 ms apart
  for (let i = 1; i < n - 1; i++) {
    if (on[i] < mx * 0.18 || on[i] < on[i - 1] || on[i] < on[i + 1]) continue;
    const t = i * hop / rate; if (hits.length && t - hits.at(-1)[0] < 0.12) { if (on[i] > hits.at(-1)[1]) hits[hits.length - 1] = [t, on[i]]; continue; }
    hits.push([t, on[i]]);
  }
  if (hits.length < 16) return null;
  // rough period: the most common gap between hits (between 60 and 200 BPM)
  const votes = new Map();
  for (let i = 1; i < hits.length; i++) for (let k = 1; k <= 3 && i - k >= 0; k++) {
    const g = (hits[i][0] - hits[i - k][0]) / k; if (g < 0.3 || g > 1) continue;
    const key = Math.round(g * 200); votes.set(key, (votes.get(key) || 0) + (k === 1 ? 2 : 1));
  }
  let best = 0, period = 0; for (const [k, v] of votes) if (v > best) { best = v; period = k / 200; }
  if (!period) return null;
  // exact: least squares of hit time against beat number, three passes, keeping hits that sit on the grid
  let t0 = hits[0][0], used = [];
  for (let pass = 0; pass < 4; pass++) {
    used = hits.map(([t, w]) => { const k = Math.round((t - t0) / period); return { k, t, w, r: t - (t0 + k * period) }; }).filter(h => Math.abs(h.r) < period * (pass ? 0.12 : 0.25));
    if (used.length < 8) return null;
    let sk = 0, st = 0, skk = 0, skt = 0; for (const h of used) { sk += h.k; st += h.t; skk += h.k * h.k; skt += h.k * h.t; }
    const m = used.length, den = m * skk - sk * sk; if (!den) return null;
    period = (m * skt - sk * st) / den; t0 = (st - period * sk) / m;
  }
  // bar 1: the beat of the bar with the strongest hits (the accent)
  const kMin = Math.min(...used.map(h => h.k)), acc = new Array(beatsPerBar).fill(0), cnt = new Array(beatsPerBar).fill(0);
  for (const h of used) { const b = ((h.k - kMin) % beatsPerBar + beatsPerBar) % beatsPerBar; acc[b] += h.w; cnt[b]++; }
  const avg = acc.map((a, i) => cnt[i] ? a / cnt[i] : 0), down = avg.indexOf(Math.max(...avg));
  let first = t0 + (kMin + down) * period; while (first - period * beatsPerBar >= -0.02) first -= period * beatsPerBar;
  const sorted = avg.slice().sort((a, b) => b - a), accent = sorted[1] ? sorted[0] / sorted[1] : 1;
  return { bpm: Math.round(6000 / period) / 100, offset: Math.round(Math.max(0, first) * 1000) / 1000, beats: beatsPerBar,
    confidence: Math.round(used.length / hits.length * 100) / 100, accent: Math.round(accent * 100) / 100 };
}

export class Metronome {
  constructor() { this.ctx = null; this.bpm = 120; this.beats = 4; this.vol = 0.7; this.playing = false; this.onBeat = () => {}; }
  init() {
    if (this.ctx) return;
    const g = typeof this.graph === 'function' ? this.graph() : this.graph;
    this.ctx = g?.ctx || new AudioContext(); this.out = this.ctx.createGain(); this.out.connect(g?.out || this.ctx.destination);
  }
  click(time, accent) {
    const ctx = this.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'square'; osc.frequency.value = accent ? 1760 : 1180;
    g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(this.vol * (accent ? 0.5 : 0.32), time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(g); g.connect(this.out); osc.start(time); osc.stop(time + 0.06);
  }
  async play() {
    this.init(); await this.ctx.resume();
    if (this.playing && !this.synced) return;
    if (this.synced) { clearInterval(this.timer); this.synced = false; this.playing = false; }
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
  /** Click locked to the tracks: beats fall on the song's grid (first beat at `offset` s), following tempo changes. */
  // `trackBpm`: the tempo the tracks were recorded at (the beats are in the tracks' own time). The tracks' clock is read
  // through a smoothed line, so the small jumps of the audio elements' time do not shake the click.
  async playWith(track, offset = 0, trackBpm = 0) {
    this.init(); await this.ctx.resume();
    this.pause(); this.playing = true; this.synced = true;
    let lastBeat = null, anchor = null;
    this.timer = setInterval(() => {
      const rate = track.rate || 1, now = this.ctx.currentTime, spb = 60 / (trackBpm || this.bpm / rate);   // seconds per beat, in the tracks' time
      if (!track.playing) { anchor = null; return; }
      const raw = track.time, guess = anchor ? anchor.tt + (now - anchor.ct) * rate : raw;
      if (!anchor || Math.abs(guess - raw) > 0.03) anchor = { ct: now, tt: raw };     // a seek or real drift: take the tracks' time again
      const tt = anchor.tt + (now - anchor.ct) * rate;
      let n = Math.ceil((tt - offset) / spb - 1e-6);
      for (;; n++) {
        const tb = offset + n * spb, at = now + (tb - tt) / rate;
        if (at > now + 0.12) break;
        if (at < now - 0.005 || n === lastBeat || tb < 0) continue;
        lastBeat = n;
        const b = ((n % this.beats) + this.beats) % this.beats;
        this.click(at, b === 0 && this.beats > 1);
        setTimeout(() => this.playing && this.onBeat(b), Math.max(0, (at - now) * 1000));
      }
    }, 20);
  }
  pause() { this.playing = false; this.synced = false; clearInterval(this.timer); this.onBeat(-1); }
  setBpm(b) { this.bpm = Math.min(300, Math.max(30, Math.round((+b || 120) * 100) / 100)); }   // decimals kept: 74.98 stays 74.98
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
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol;
    this.masterMeter = this.ctx.createAnalyser(); this.masterMeter.fftSize = 512;
    this.master.connect(this.masterMeter);
    this.routes = this.routes || {}; this.masterOut = this.masterOut || 'main';
    this.rate = this.rate || 1; this.semis = this.semis || 0;
    this.pitchReady = this.ctx.audioWorklet ? this.ctx.audioWorklet.addModule('/pitch-worklet.js').then(() => true, () => false) : Promise.resolve(false);
    this.wire();
  }
  /** tempo: every track faster or slower, without changing the key (rate 1 = original) */
  setRate(r) { this.rate = Math.min(2, Math.max(0.5, r || 1)); for (const c of this.ch) { c.el.preservesPitch = true; c.el.playbackRate = this.rate; } }
  /** key: every track up or down in semitones, without changing the tempo */
  setPitch(semis) { this.semis = Math.max(-12, Math.min(12, Math.round(semis) || 0)); for (const c of this.ch) c.shift?.parameters.get('semitones').setValueAtTime(this.semis, this.ctx.currentTime); }
  // ---- routing to the outputs of an audio interface: every track to the main mix (1-2), one output, or a pair
  /** how many outputs the chosen device has (2 for normal speakers) */
  get outCount() { return this.ctx ? Math.max(2, this.ctx.destination.maxChannelCount || 2) : 2; }
  wire() {
    const ctx = this.ctx, n = this.outCount, d = ctx.destination;
    try { d.channelCount = n; d.channelCountMode = 'explicit'; d.channelInterpretation = 'discrete'; } catch {}
    try { this.merger?.disconnect(); } catch {}
    this.merger = ctx.createChannelMerger(n); this.merger.connect(d);
    try { this.master.disconnect(); } catch {} this.master.connect(this.masterMeter);
    this.link(this.master, this.masterOut);
    for (const c of this.ch) this.routeTrack(c);
    for (const [name, g] of Object.entries(this.buses || {})) { try { g.disconnect(); } catch {} this.link(g, this.routes['__' + name] || 'main'); }
    if (this.mic) this.link(this.mic.gain, this.mic.out);
  }
  /** a routable input for the click and the pad (they play inside this sound, on any output) */
  bus(name) {
    this.init(); this.buses ||= {};
    if (!this.buses[name]) { const g = this.ctx.createGain(); this.buses[name] = g; this.link(g, this.routes['__' + name] || 'main'); }
    return this.buses[name];
  }
  /** connect a stereo node to an output: 'main' = 1-2, 'm5' = output 5 alone (mono), 's3' = outputs 3-4 */
  link(node, out) {
    const n = this.outCount, sp = this.ctx.createChannelSplitter(2);
    const m = /^m(\d+)$/.exec(out || ''), st = /^s(\d+)$/.exec(out || '');
    if (m && +m[1] <= n) { const mono = this.ctx.createGain(); mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers'; node.connect(mono); mono.connect(this.merger, 0, +m[1] - 1); return; }
    const a = st && +st[1] < n ? +st[1] - 1 : 0;
    node.connect(sp); sp.connect(this.merger, 0, a); sp.connect(this.merger, 1, a + 1);
  }
  routeTrack(c) {
    try { c.pan.disconnect(); } catch {}
    c.pan.connect(c.meter);
    const out = this.routes[String(c.name || c.file).toLowerCase()] || 'main';
    c.out = out;
    if (out === 'main') c.pan.connect(this.master); else this.link(c.pan, out);   // a track on its own output skips the master fader
  }
  setRoutes(routes, masterOut) { this.routes = { ...routes }; if (masterOut) this.masterOut = masterOut; if (this.ctx) this.wire(); }
  // ---- an input of the interface (the music director's mic): heard on an output (talkback in the in-ears)
  async micOn({ deviceId, channel = 1, out = 'm3', vol = 1 } = {}) {
    this.init(); await this.ctx.resume(); this.micOff();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 32 } } });
    const src = this.ctx.createMediaStreamSource(stream), n = Math.max(1, src.channelCount || 2), sp = this.ctx.createChannelSplitter(n), gain = this.ctx.createGain(), meter = this.ctx.createAnalyser();
    meter.fftSize = 512; gain.gain.value = vol; src.connect(sp);
    const k = Math.min(Math.max(1, channel), n) - 1;
    const mono = this.ctx.createGain(); sp.connect(mono, k); mono.connect(gain); gain.connect(meter);
    this.mic = { stream, src, sp, gain, meter, out, channels: n, channel: k + 1 };
    this.link(gain, out);
    return n;
  }
  micOff() { if (!this.mic) return; try { this.mic.gain.disconnect(); this.mic.src.disconnect(); } catch {} this.mic.stream.getTracks().forEach(t => t.stop()); this.mic = null; }
  async load(stems) {
    this.init(); this.stop(true);
    for (const c of this.ch) { try { c.el.pause(); c.src.disconnect(); } catch {} }
    const pitch = await this.pitchReady;
    this.ch = stems.map(s => {
      const el = new Audio(); el.preload = 'auto'; el.src = '/media/' + encodeURIComponent(s.file); el.crossOrigin = 'anonymous';
      el.preservesPitch = true; el.playbackRate = this.rate;
      const src = this.ctx.createMediaElementSource(el), gain = this.ctx.createGain(), pan = this.ctx.createStereoPanner(), meter = this.ctx.createAnalyser();
      let shift = null;
      if (pitch) { shift = new AudioWorkletNode(this.ctx, 'pitch-shift', { outputChannelCount: [2] }); shift.parameters.get('semitones').value = this.semis; src.connect(shift); shift.connect(gain); }
      else src.connect(gain);
      meter.fftSize = 512; gain.connect(pan);
      const c = { ...s, panValue: Number(s.pan) || 0, el, src, gain, pan, meter, shift, solo: false };
      this.routeTrack(c); return c;
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
  /** Jump without a click in the sound: a very short fade out, the jump, a short fade in. */
  async seekSmooth(t) {
    if (!this.ctx || !this.playing) return this.seek(t);
    const g = this.master.gain, now = this.ctx.currentTime, v = this.vol;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0.0001, now + 0.04);
    await new Promise(r => setTimeout(r, 45));
    this.seek(t);
    const n2 = this.ctx.currentTime; g.cancelScheduledValues(n2); g.setValueAtTime(0.0001, n2); g.linearRampToValueAtTime(v, n2 + 0.09);
  }
  level(c) {                                        // 0..1 for the meters
    const a = c ? c.meter : this.masterMeter; if (!a) return 0;
    const d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d);
    let p = 0; for (const v of d) p = Math.max(p, Math.abs(v)); return Math.min(1, p);
  }
  async output(deviceId) { this.init(); const ok = await setOutput(this.ctx, deviceId); this.wire(); return ok; }
}
/** every microphone / interface input */
export async function inputs() {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch { return []; }
}
