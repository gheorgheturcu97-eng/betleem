// 💡 Lights over MIDI (the USB–MIDI cable into the dimmer, e.g. Eurolite). Only the computer with the cable sends:
// it is ticked once ("Lumini de pe acest calculator"). A scene is a list of MIDI messages; CC values fade smoothly.
let access = null;
export async function midiOutputs() {
  if (!navigator.requestMIDIAccess) throw new Error('Acest calculator nu are MIDI în browser. Folosește aplicația Betleem.');
  access ||= await navigator.requestMIDIAccess({ sysex: false });
  return [...access.outputs.values()].map(o => ({ id: o.id, name: o.name }));
}
export async function midiInputs() { await midiOutputs(); return [...access.inputs.values()]; }
const out = async name => { await midiOutputs(); const all = [...access.outputs.values()]; return all.find(o => o.name === name) || all[0] || null; };

const level = {};                 // last value sent per "ch:cc", so a fade starts where the light is now
let fadeTimer = null;
/** msgs: [{ type: 'cc'|'note'|'pc', ch: 1-16, n: 0-127, v: 0-127 }], fade in seconds (only CC values fade) */
export async function sendScene(portName, msgs = [], fade = 0) {
  const o = await out(portName); if (!o) throw new Error('Nu găsesc ieșirea MIDI. E conectat cablul USB–MIDI?');
  clearInterval(fadeTimer);
  const clampB = x => Math.max(0, Math.min(127, Math.round(Number(x) || 0)));
  const ccs = [];
  for (const m of msgs) {
    const ch = Math.max(1, Math.min(16, Math.round(m.ch) || 1)) - 1, n = clampB(m.n), v = clampB(m.v);
    if (m.type === 'pc') o.send([0xC0 | ch, n]);
    else if (m.type === 'note') { o.send(v ? [0x90 | ch, n, v] : [0x80 | ch, n, 0]); }
    else ccs.push({ ch, n, v, from: level[ch + ':' + n] ?? (fade ? 0 : v) });
  }
  const steps = fade > 0 ? Math.max(2, Math.round(fade * 25)) : 1; let k = 0;
  const tick = () => {
    k++; const f = k / steps;
    for (const c of ccs) { const v = Math.round(c.from + (c.v - c.from) * f); o.send([0xB0 | c.ch, c.n, v]); level[c.ch + ':' + c.n] = v; }
    if (k >= steps) clearInterval(fadeTimer);
  };
  tick(); if (steps > 1) fadeTimer = setInterval(tick, 40);
}
/** 🎓 learn: the next message that comes in from a MIDI controller (a fader or a button on the desk) */
export async function learnOne(timeoutMs = 15000) {
  const ins = await midiInputs();
  if (!ins.length) throw new Error('Nu e nicio intrare MIDI. Poți scrie mesajul de mână.');
  return new Promise((ok, bad) => {
    const done = m => { ins.forEach(i => (i.onmidimessage = null)); clearTimeout(t); ok(m); };
    const t = setTimeout(() => { ins.forEach(i => (i.onmidimessage = null)); bad(new Error('Nu a venit niciun mesaj MIDI')); }, timeoutMs);
    ins.forEach(i => (i.onmidimessage = e => {
      const [s, a, b] = e.data, type = s & 0xF0, ch = (s & 0x0F) + 1;
      if (type === 0xB0) done({ type: 'cc', ch, n: a, v: b }); else if (type === 0x90 && b) done({ type: 'note', ch, n: a, v: b }); else if (type === 0xC0) done({ type: 'pc', ch, n: a, v: 0 });
    }));
  });
}
