// 🎙 Spoken commands, in Romanian.
// In a browser that can (Chrome, Safari, phones) it uses the browser's own speech recognition.
// In the desktop app it uses Whisper on this computer (downloaded once, ~80 MB, then it works offline).
const isElectron = /Electron/i.test(navigator.userAgent);
const Native = window.SpeechRecognition || window.webkitSpeechRecognition;

let current = null;                                  // the listening in progress: { stop() }
export const listening = () => !!current;
export function stopListening() { current?.stop(); }

/** Listen until the speaker is quiet (or stop is pressed). Resolves with the text. */
export function listen({ lang = 'ro-RO', onState = () => {} } = {}) {
  if (current) { current.stop(); return Promise.resolve(''); }
  return Native && !isElectron ? nativeListen(lang, onState) : whisperListen(onState);
}

function nativeListen(lang, onState) {
  return new Promise((ok, no) => {
    const r = new Native(); r.lang = lang; r.interimResults = true; r.maxAlternatives = 1; r.continuous = false;
    let text = '';
    r.onresult = e => { text = [...e.results].map(x => x[0].transcript).join(' '); onState({ listening: true, text }); };
    r.onerror = e => { current = null; onState({ listening: false }); e.error === 'no-speech' ? ok('') : no(new Error('Microfonul nu a mers: ' + e.error)); };
    r.onend = () => { current = null; onState({ listening: false, text }); ok(text.trim()); };
    current = { stop: () => r.stop() };
    onState({ listening: true, text: '' }); r.start();
  });
}

// ---- Whisper on this computer (transformers.js): a small model that understands Romanian
let asr = null;
async function whisper(onState) {
  if (asr) return asr;
  onState({ loading: true, note: 'Pregătesc recunoașterea vocii (prima dată se descarcă ~80 MB)…' });
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2');
  env.allowLocalModels = false;
  asr = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
    dtype: 'q8', progress_callback: p => { if (p.status === 'progress' && p.total) onState({ loading: true, note: `Descarc vocea: ${Math.round(p.loaded / p.total * 100)}%` }); },
  });
  return asr;
}

async function whisperListen(onState) {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { throw new Error('Nu am acces la microfon. Permite microfonul pentru Echipa Betleem.'); }
  const model = whisper(onState);                     // loads while you speak
  const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
  const rec = new MediaRecorder(stream), parts = [];
  rec.ondataavailable = e => e.data.size && parts.push(e.data);
  const stopped = new Promise(r => { rec.onstop = r; });
  let spoke = false, quietSince = 0;
  const buf = new Float32Array(an.fftSize), started = Date.now();
  const timer = setInterval(() => {                    // stop by itself after ~1.2 s of quiet, or after 12 s
    an.getFloatTimeDomainData(buf); let e = 0; for (const v of buf) e += v * v; const loud = Math.sqrt(e / buf.length) > 0.02;
    if (loud) { spoke = true; quietSince = 0; } else if (spoke && !quietSince) quietSince = Date.now();
    if ((spoke && quietSince && Date.now() - quietSince > 1200) || Date.now() - started > 12000 || (!spoke && Date.now() - started > 6000)) end();
  }, 100);
  const end = () => { if (rec.state !== 'inactive') rec.stop(); };
  current = { stop: end };
  onState({ listening: true, text: '' }); rec.start();
  await stopped;
  clearInterval(timer); current = null; stream.getTracks().forEach(t => t.stop());
  onState({ listening: false, working: true, note: 'Înțeleg…' });
  try {
    if (!spoke) return '';
    const audio = await new Blob(parts).arrayBuffer();
    const pcm = (await new OfflineAudioContext(1, 1, 16000).decodeAudioData(audio)).getChannelData(0);
    const out = await (await model)(pcm, { language: 'romanian', task: 'transcribe', chunk_length_s: 30 });
    return String(out?.text || '').trim();
  } finally { ctx.close(); onState({ working: false }); }
}

// ---- spoken commands for the music view: “refrenul”, “strofa doi”, “următoarea”, “tempo 72”, “tobele mai încet”…
const fold = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
const NUM = { unu: 1, una: 1, intai: 1, prima: 1, primul: 1, doi: 2, doua: 2, al_doilea: 2, trei: 3, treia: 3, patru: 4, patra: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10 };
const num = w => Number.isFinite(+w) ? +w : NUM[w] ?? NUM[w?.replace(/^a(l)?_?/, '')] ?? null;
const SECTION = [[/refren|chorus/, 'refren'], [/strof|vers(?!uri)|verse/, 'strofa'], [/bridge|punte|pod/, 'bridge'], [/pre ?refren|pre ?chorus/, 'pre'],
  [/intro/, 'intro'], [/outro|final|sfarsit|incheiere/, 'final'], [/tag/, 'tag'], [/instrumental|solo instr/, 'instrumental']];

/** Understand a spoken music command. Returns { do, ... } or null (then it goes to the assistant). */
export function parseMusicCommand(text) {
  const t = fold(text); if (!t) return null;
  const words = t.split(' ');
  if (/^(play|porneste|start|canta|da drumul|merge)/.test(t)) return { do: 'play' };
  if (/^(pauza|stop|opreste tot|opreste|gata)$/.test(t)) return { do: 'pause' };
  if (/de la (inceput|capat)/.test(t)) return { do: 'start' };
  if (/(urmatoare|inainte|next|mai departe)/.test(t) && !/tempo|bpm/.test(t)) return { do: 'next' };
  if (/(anterioar|inapoi|previous|precedent)/.test(t)) return { do: 'prev' };
  const tempo = t.match(/(tempo|bpm)\s*(la\s*)?(\d{2,3})/); if (tempo) return { do: 'bpm', value: +tempo[3] };
  const SOL = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };   // Romanian note names too
  const key = t.match(/\bton(ul|alitatea)?\s*(in\s*)?(do|re|mi|fa|sol|la|si|[a-h])\s*(diez|#|bemol|b)?\s*(minor|m)?\b/);
  if (key) { const n = (SOL[key[3]] || key[3].toUpperCase()).replace('H', 'B'); return { do: 'key', value: n + (key[4] ? (/diez|#/.test(key[4]) ? '#' : 'b') : '') + (key[5] ? 'm' : '') }; }
  if (/metronom/.test(t)) return { do: 'metronome', on: !/opreste|stop|fara/.test(t) };
  // a track: “tobele mai încet”, “mut la bas”, “solo click”, “pornește guide”
  const track = t.match(/\b(click|guide|ghid|tobe(le)?|drums|bas(ul)?|bass|clape(le)?|keys|pian(ul)?|chitar(a|e)|guitar|voci(le)?|vocal|pad|cor(ul)?|synth)\b/);
  if (track) {
    const name = track[1].replace(/(le|ul|a)$/, '').replace('ghid', 'guide');
    if (/solo/.test(t)) return { do: 'track', name, solo: true };
    if (/\bmut|opreste|fara|scoate/.test(t)) return { do: 'track', name, muted: true };
    if (/mai tare|mai sus|creste/.test(t)) return { do: 'track', name, gain: 3 };
    if (/mai incet|mai jos|scade/.test(t)) return { do: 'track', name, gain: -3 };
    if (/porneste|pune|activ|da drumul|on/.test(t)) return { do: 'track', name, muted: false };
  }
  // a section: “refrenul”, “strofa doi”, “la bridge”, “repetă refrenul”
  for (const [re, kind] of SECTION) if (re.test(t)) {
    const n = words.map(w => num(w)).find(x => x) || null;
    if (/repeta|inca o data|mai pune|adauga/.test(t)) return { do: 'repeat', kind, n };
    if (/scoate|sari peste|fara/.test(t)) return { do: 'drop', kind, n };
    return { do: 'section', kind, n };
  }
  return null;
}
/** Does a section label (Strofa 2, Refren, Bridge…) match what was said? */
export function sectionMatches(label, kind, n) {
  const l = fold(label);
  const k = SECTION.find(([re]) => re.test(l))?.[1];
  if (k !== kind) return false;
  if (!n) return true;
  const m = l.match(/(\d+)/); return m ? +m[1] === n : n === 1;
}

/**
 * Always listening on one input of the audio interface (e.g. the music director's mic with a proximity gate):
 * every time someone speaks into it, the phrase is turned into text and given to onText.
 * Returns stop().
 */
export async function listenOn({ deviceId, channel = 1, onText, onState = () => {}, threshold = 0.03 }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false, noiseSuppression: true, autoGainControl: false, channelCount: { ideal: 32 } } });
  const ctx = new AudioContext(), src = ctx.createMediaStreamSource(stream), n = Math.max(1, src.channelCount || 1);
  const sp = ctx.createChannelSplitter(n), one = ctx.createGain(), an = ctx.createAnalyser(), dest = ctx.createMediaStreamDestination();
  an.fftSize = 1024; src.connect(sp); sp.connect(one, Math.min(Math.max(1, channel), n) - 1); one.connect(an); one.connect(dest);
  const model = whisper(onState);
  let rec = null, parts = [], quietSince = 0, startedAt = 0, alive = true;
  const buf = new Float32Array(an.fftSize);
  const begin = () => { parts = []; rec = new MediaRecorder(dest.stream); rec.ondataavailable = e => e.data.size && parts.push(e.data); rec.start(); startedAt = Date.now(); onState({ listening: true, text: '' }); };
  const finish = () => {
    const r = rec; rec = null; if (!r) return;
    r.onstop = async () => {
      onState({ listening: false, working: true, note: 'Înțeleg…' });
      try {
        const pcm = (await new OfflineAudioContext(1, 1, 16000).decodeAudioData(await new Blob(parts).arrayBuffer())).getChannelData(0);
        const out = await (await model)(pcm, { language: 'romanian', task: 'transcribe' });
        const text = String(out?.text || '').trim(); if (text) onText(text);
      } catch (e) { onState({ error: e.message }); }
      finally { onState({ working: false }); }
    };
    r.stop();
  };
  const timer = setInterval(() => {
    if (!alive) return;
    an.getFloatTimeDomainData(buf); let e = 0; for (const v of buf) e += v * v; const loud = Math.sqrt(e / buf.length) > threshold;
    if (loud) { quietSince = 0; if (!rec) begin(); }
    else if (rec) { if (!quietSince) quietSince = Date.now(); if (Date.now() - quietSince > 900) finish(); }
    if (rec && Date.now() - startedAt > 10000) finish();
    onState({ level: Math.sqrt(e / buf.length) });
  }, 80);
  return { channels: n, stop() { alive = false; clearInterval(timer); if (rec) try { rec.stop(); } catch {} stream.getTracks().forEach(t => t.stop()); ctx.close(); } };
}
