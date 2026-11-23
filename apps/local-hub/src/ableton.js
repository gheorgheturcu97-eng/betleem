// 🎛 Ableton Live sets (.als) → MD&TRACK: the markers (Locators: "Verse 1", "Chorus"…), the tempo (with changes) and
// the time signature, so a multitrack pack made in Ableton comes in already mapped.
// An .als is gzip-compressed XML. Where things live was documented by dawtool (github.com/offlinemark/dawtool, BSD-3);
// this is our own small reader, no code copied: we read only these few tags, without a full XML parser.
//   LiveSet > Locators > Locators > Locator { Time (beats), Name }
//   MasterTrack (MainTrack in Live 12) > … > Tempo { Manual (bpm), AutomationTarget Id } and its automation events
//   TimeSignature: RemoteableTimeSignature { Numerator, Denominator } (first one)

import zlib from 'node:zlib';

const val = (s, tag) => (s.match(new RegExp('<' + tag + '\\s+Value="([^"]*)"')) || [])[1];
function chunk(s, tag, from = 0) {                    // the first <tag>…</tag> (same-name tags inside are counted)
  const open = new RegExp('<' + tag + '[\\s>/]', 'g'); open.lastIndex = from;
  const m = open.exec(s); if (!m) return '';
  const head = s.indexOf('>', m.index); if (s[head - 1] === '/') return s.slice(m.index, head + 1);
  let depth = 1, i = head + 1;
  const re = new RegExp('<(/?)' + tag + '(?=[\\s>/])[^>]*?(/?)>', 'g'); re.lastIndex = i;
  for (let x; (x = re.exec(s));) { if (x[2] === '/') continue; depth += x[1] ? -1 : 1; if (!depth) return s.slice(m.index, re.lastIndex); }
  return s.slice(m.index);
}
const xmlText = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** The set's XML (gzip or already plain). */
export function alsXml(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  const s = buf.toString('utf8');
  if (!s.includes('<Ableton')) throw new Error('Nu e un fișier Ableton Live (.als)');
  return s;
}

/** { bpm, beats, tempo: [{ beat, bpm }], markers: [{ beat, sec, name }], tracks: [names] } */
export function parseAls(buf) {
  const s = alsXml(buf);
  const master = chunk(s, 'MainTrack') || chunk(s, 'MasterTrack');
  const tempo = chunk(master || s, 'Tempo');
  const bpm = +val(tempo, 'Manual') || 120;
  const targetId = (tempo.match(/<AutomationTarget\s+Id="(\d+)"/) || [])[1];
  // tempo changes: the master track's automation envelope pointing at the tempo
  let events = [];
  if (targetId) for (const env of master.matchAll(/<AutomationEnvelope[\s\S]*?<\/AutomationEnvelope>/g)) {
    if (val(env[0], 'PointeeId') !== targetId) continue;
    events = [...env[0].matchAll(/<FloatEvent[^>]*Time="([^"]+)"[^>]*Value="([^"]+)"/g)].map(m => ({ beat: Math.max(0, +m[1]), bpm: +m[2] }))
      .filter(e => e.bpm >= 20 && e.bpm <= 400).sort((a, b) => a.beat - b.beat);
  }
  if (!events.length || events[0].beat > 0) events.unshift({ beat: 0, bpm: events[0]?.bpm || bpm });
  const ts = chunk(s, 'RemoteableTimeSignature');
  const num = +val(ts, 'Numerator') || 4, den = +val(ts, 'Denominator') || 4;
  const sec = beatToSec(events);
  const outer = chunk(s, 'Locators'), inner = outer ? chunk(outer, 'Locators', 1) : '';
  const markers = [...(inner || '').matchAll(/<Locator\b[\s\S]*?<\/Locator>/g)].map(m => ({ beat: +val(m[0], 'Time') || 0, name: xmlText(val(m[0], 'Name') || '').trim() }))
    .filter(m => m.name).sort((a, b) => a.beat - b.beat).map(m => ({ ...m, sec: Math.round(sec(m.beat) * 1000) / 1000 }));
  const tracks = [...s.matchAll(/<(Audio|Midi)Track\b[\s\S]*?<EffectiveName\s+Value="([^"]*)"/g)].map(m => xmlText(m[2]));
  return { bpm: Math.round(events[0].bpm * 100) / 100, beats: num, unit: den, tempo: events, markers, tracks };
}

/** Beats → seconds with tempo changes. Ableton ramps the tempo in a straight line between two points. */
export function beatToSec(events) {
  return beat => {
    let t = 0;
    for (let i = 0; i < events.length; i++) {
      const a = events[i], b = events[i + 1];
      if (!b || beat <= b.beat) {
        const end = Math.min(beat, b ? b.beat : beat), d = end - a.beat; if (d <= 0) return t;
        const r1 = a.bpm, r2 = b ? a.bpm + (b.bpm - a.bpm) * d / (b.beat - a.beat) : a.bpm;
        return t + (Math.abs(r2 - r1) < 1e-6 ? d * 60 / r1 : d * 60 * Math.log(r2 / r1) / (r2 - r1));
      }
      const d = b.beat - a.beat;
      t += Math.abs(b.bpm - a.bpm) < 1e-6 ? d * 60 / a.bpm : d * 60 * Math.log(b.bpm / a.bpm) / (b.bpm - a.bpm);
    }
    return t;
  };
}
