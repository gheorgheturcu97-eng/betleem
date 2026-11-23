// 🎧 Track virtual: for songs without bought tracks. The click (the metronome), a pad in the song's key and a
// spoken guide ("one, two, three, four", "Chorus", "Verse two") made live from the song's map. No audio is stored:
// the map is only "section p starts at bar n", kept on the song. The voices are the church's own recordings
// (Documents/Betleem/ghid: files like "Chorus.wav", "Verse 2.wav", "1.wav"); until they are there, the computer's
// own voice says the words.
import { cuesFromWords } from '/voice.js';

const EN = { strofa: 'Verse', refren: 'Chorus', bridge: 'Bridge', pre: 'Pre chorus', intro: 'Intro', final: 'Ending', tag: 'Tag', instrumental: 'Instrumental' };
const NUM_WORD = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, unu: 1, doi: 2, trei: 3, patru: 4 };

/** "Strofa 2" / "Verse 2" → "strofa2"; "Refren" / "Chorus" → "refren" */
export function guideKey(label) {
  const c = cuesFromWords([{ text: String(label || ''), start: 0 }])[0];
  return c ? c.kind + (c.kind === 'strofa' ? (c.n || 1) : c.n && c.kind !== 'refren' ? c.n : '') : '';
}
/** a voice file's name → the word it says ("Verse 2.wav" → strofa2, "3.wav" / "three.mp3" → n3) */
export function voiceKey(file) {
  const base = String(file).replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim(), t = base.toLowerCase();
  const n = NUM[t] || (/^\d$/.test(t) ? +t : 0);
  return n ? 'n' + n : guideKey(base);
}
/** the recordings that say a key: its own, or the word plus the number ("strofa2" → strofa1 + n2) */
export function voiceParts(key, voices) {
  if (voices[key]) return [key];
  const m = /^([a-z]+)(\d+)$/.exec(key || ''); if (!m || m[1] === 'n') return [];
  const word = voices[m[1] + '1'] ? m[1] + '1' : voices[m[1]] ? m[1] : '';
  return word ? [word, ...(voices['n' + m[2]] ? ['n' + m[2]] : [])] : [];
}

/**
 * 🎚 Make real tracks from the map: a Click and a spoken Guide (count-in, then each section announced a bar before),
 * as WAV files, so a song without bought tracks gets them in a minute and everything in MD&TRACK works for it
 * (sections on the tracks, the phone, the jumps). Bar 1 starts after one count-in bar.
 */
export async function renderGuide({ marks, names, bpm, beats = 4, voices, bars, rate = 44100 }) {
  const beat = 60 / bpm, bar = beat * beats, total = (bars + 1) * bar + 1.5, len = Math.ceil(total * rate);
  const click = new OfflineAudioContext(1, len, rate), guide = new OfflineAudioContext(1, len, rate);
  for (let k = 0; k < (bars + 1) * beats; k++) {                 // the click, the first beat of every bar higher
    const t = k * beat, acc = k % beats === 0 && beats > 1, o = click.createOscillator(), g = click.createGain();
    o.type = 'square'; o.frequency.value = acc ? 1760 : 1180;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(acc ? 0.5 : 0.32, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(click.destination); o.start(t); o.stop(t + 0.06);
  }
  const buf = {};
  for (const [k, u] of Object.entries(voices)) { try { buf[k] = await guide.decodeAudioData(await (await fetch(u)).arrayBuffer()); } catch {} }
  const say = (key, t) => { for (const k of voiceParts(key, buf)) { const b = buf[k]; if (!b) continue; const s = guide.createBufferSource(); s.buffer = b; s.connect(guide.destination); s.start(t); t += b.duration * 0.92; } };
  for (let j = 0; j < beats; j++) say('n' + (j + 1), j * beat);        // count-in: one, two, three, four
  for (const m of marks) if (m.bar > 0) say(guideKey(names[m.p]), m.bar * bar);   // a bar before the section (its bar starts at (bar+1)·bar)
  const [c, g] = await Promise.all([click.startRendering(), guide.startRendering()]);
  return { click: wav(c), guide: wav(g), offset: bar, bar, duration: total };
}
function wav(audio) {                                  // 16-bit mono WAV
  const d = audio.getChannelData(0), n = d.length, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), r = audio.sampleRate;
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, r, true); v.setUint32(28, r * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 32767, true);
  return new Blob([b], { type: 'audio/wav' });
}
const english = key => { const m = /^([a-z]+)(\d*)$/.exec(key) || []; return m[1] === 'n' ? NUM_WORD[+m[2]] : (EN[m[1]] || m[1] || '') + (m[2] && m[1] !== 'refren' ? ' ' + NUM_WORD[+m[2]] : ''); };

export class VirtualTrack {
  constructor({ met, out, onSection = () => {}, onBar = () => {} }) {
    Object.assign(this, { met, out, onSection, onBar }); this.voices = {}; this.buffers = {}; this.running = false; this.bar = -1; this.beatNow = 0; this.marks = [];
  }
  async loadVoices() {
    try { const list = await fetch('/api/ghid').then(r => r.ok ? r.json() : []); this.voices = {}; for (const f of list) { const k = voiceKey(f); if (k && !this.voices[k]) this.voices[k] = '/ghid/' + encodeURIComponent(f); } } catch {}
    return Object.keys(this.voices).length;
  }
  async buffer(key) {
    if (!this.voices[key]) return null;
    if (!this.buffers[key]) this.buffers[key] = fetch(this.voices[key]).then(r => r.arrayBuffer()).then(b => this.met.ctx.decodeAudioData(b)).catch(() => null);
    return this.buffers[key];
  }
  /** say one word now: the church's recording if there is one, else the computer's voice */
  async say(key) {
    if (!key) return;
    const keys = voiceParts(key, this.voices);
    if (keys.length) {                                 // "Verse" + "2" when there is no "Verse 2" recording: one after the other
      let at = this.met.ctx.currentTime + 0.01;
      for (const k of keys) { const buf = await this.buffer(k); if (!buf) continue; const s = this.met.ctx.createBufferSource(); s.buffer = buf; s.connect(this.out()); s.start(at); at += buf.duration * 0.92; }
      return;
    }
    try { const u = new SpeechSynthesisUtterance(english(key)); u.lang = 'en-US'; u.rate = 1.15; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {}
  }
  /** marks: [{ bar, p }] (p = which section of the order), names[p] = its label */
  async start({ marks, names, countIn = true }) {
    this.marks = marks.slice().sort((a, b) => a.bar - b.bar); this.names = names;
    this.bar = countIn ? -2 : -1; this.running = true;
    const prev = this.met.onBeat; this._prev = prev;
    this.met.onBeat = b => { prev(b); if (this.running && b >= 0) this.beat(b); };
    if (!this.met.playing) await this.met.play();
    Object.keys(this.voices).forEach(k => this.buffer(k));             // ready before they are needed
  }
  beat(b) {
    if (b === 0) this.bar++;
    this.beatNow = b;
    if (this.bar === -1) this.say('n' + (b + 1));                     // count-in bar: one, two, three, four
    if (b === 0) {
      const now = this.marks.find(m => m.bar === this.bar); if (now) this.onSection(now);
      const next = this.marks.find(m => m.bar === this.bar + 1); if (next && this.bar >= 0) this.say(guideKey(this.names[next.p]));   // a bar before
    }
    this.onBar(this.bar, b);
  }
  /** the bar a section should start at if the leader presses its key now (the next downbeat, or this one if just passed) */
  barForPress() { return this.bar < 0 ? 0 : this.beatNow <= 1 ? this.bar : this.bar + 1; }
  stop() { this.running = false; if (this._prev) this.met.onBeat = this._prev; this._prev = null; this.met.pause(); try { speechSynthesis.cancel(); } catch {} }
}
