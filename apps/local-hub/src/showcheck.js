// 🔎 Before a presentation is imported: what it needs to look exactly as it was made (fonts, slide size, videos, links),
// and after: did every slide come out. No dependencies (a .pptx is a zip of XML files; zlib opens it).
import zlib from 'node:zlib';

/** The files of a zip: Map(name → () => Buffer). */
export function unzipBuffer(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Fișierul nu e un .pptx valid (arhivă deteriorată).');
  const count = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  const out = new Map();
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    out.set(name, () => {
      const start = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28), raw = buf.subarray(start, start + size);
      return method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    });
    p += 46 + nl + xl + cl;
  }
  return out;
}

const THEME_ALIAS = /^\+(mj|mn)-(lt|ea|cs)$/;            // "+mj-lt" = the theme's heading font, "+mn-lt" = its body font
const NOT_A_FONT = /^(\+|@|$)|^(Symbol|Wingdings.*|Webdings|Marlett)$/i;

/** What a .pptx / .ppsx holds: slides (hidden ones too), size, fonts used, fonts embedded, videos, files linked from outside. */
export function analyzePptx(buf) {
  const z = unzipBuffer(buf), text = n => (z.has(n) ? z.get(n)().toString('utf8') : '');
  const pres = text('ppt/presentation.xml');
  const sz = pres.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  const w = sz ? +sz[1] : 12192000, h = sz ? +sz[2] : 6858000, r = w / h;
  const ratio = Math.abs(r - 16 / 9) < 0.02 ? '16:9' : Math.abs(r - 4 / 3) < 0.02 ? '4:3' : Math.abs(r - 16 / 10) < 0.02 ? '16:10' : r.toFixed(2) + ':1';
  // the order of the slides is the presentation's list, not the file names
  const rels = text('ppt/_rels/presentation.xml.rels'), target = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { const id = (m[0].match(/Id="([^"]+)"/) || [])[1], t = (m[0].match(/Target="([^"]+)"/) || [])[1]; if (id && t) target[id] = 'ppt/' + t.replace(/^\/?ppt\//, '').replace(/^\.\.\//, ''); }
  const order = [...pres.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/g)].map(m => target[m[1]]).filter(Boolean);
  const files = order.length ? order : [...z.keys()].filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
  const slides = files.map(f => ({ file: f, hidden: /<p:sld\b[^>]*\bshow="0"/.test(text(f)) }));
  // fonts: every typeface in slides, layouts, masters, notes-free; the theme's heading / body fonts stand for +mj / +mn
  const theme = [...z.keys()].filter(n => /^ppt\/theme\/theme\d+\.xml$/.test(n)).map(text).join('');
  const major = (theme.match(/<a:majorFont>\s*<a:latin typeface="([^"]*)"/) || [])[1] || '', minor = (theme.match(/<a:minorFont>\s*<a:latin typeface="([^"]*)"/) || [])[1] || '';
  const used = new Map();                                  // font → how many places
  for (const n of z.keys()) {
    if (!/^ppt\/(slides|slideLayouts|slideMasters)\/[^/]+\.xml$/.test(n)) continue;
    for (const m of text(n).matchAll(/<a:(latin|ea|cs|sym)\b[^>]*typeface="([^"]*)"/g)) {
      let f = m[2]; const al = f.match(THEME_ALIAS); if (al) f = al[1] === 'mj' ? major : minor;
      if (m[1] !== 'latin' && !al) continue;                // East-Asian / complex-script fallbacks are not what the slide shows
      if (!f || NOT_A_FONT.test(f)) continue;
      used.set(f, (used.get(f) || 0) + 1);
    }
  }
  for (const f of [major, minor]) if (f && !NOT_A_FONT.test(f) && !used.has(f)) used.set(f, 1);
  const embedded = [...pres.matchAll(/<p:embeddedFont>\s*<p:font typeface="([^"]+)"/g)].map(m => m[1]);
  const media = [...z.keys()].filter(n => /^ppt\/media\//.test(n));
  const videos = media.filter(n => /\.(mp4|mov|m4v|wmv|avi|mpg|mpeg|webm)$/i.test(n)).map(n => n.split('/').pop());
  const audio = media.filter(n => /\.(mp3|wav|m4a|aac|wma)$/i.test(n)).map(n => n.split('/').pop());
  const external = [];
  for (const n of z.keys()) if (/^ppt\/slides\/_rels\/.*\.rels$/.test(n))
    for (const m of text(n).matchAll(/<Relationship\b[^>]*TargetMode="External"[^>]*>/g)) {
      const t = (m[0].match(/Target="([^"]+)"/) || [])[1] || '', type = (m[0].match(/Type="[^"]*\/([^/"]+)"/) || [])[1] || '';
      if (!/hyperlink/i.test(type)) external.push(t);      // a picture / video linked from the author's own disk: it is not in the file
    }
  return { slides: slides.length, visible: slides.filter(s => !s.hidden).length, hiddenAt: slides.map((s, i) => s.hidden ? i + 1 : 0).filter(Boolean),
    size: { w, h, ratio }, fonts: [...used.keys()], embedded, videos, audio, external, mainFonts: [major, minor].filter(Boolean) };
}

/** How many pages a PDF has (good enough for the ones Keynote / PowerPoint / LibreOffice write). */
export function pdfPageCount(buf) {
  const s = buf.toString('latin1');
  const counts = [...s.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g), ...s.matchAll(/\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g)].map(m => +m[1]);
  if (counts.length) return Math.max(...counts);
  return (s.match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
}

/** The family name written inside a .ttf / .otf (its "name" table), e.g. "Calibri"; '' if it cannot be read. */
export function fontFamilyName(buf) {
  try {
    let off = 0;
    if (buf.toString('latin1', 0, 4) === 'ttcf') off = buf.readUInt32BE(12);       // a collection: the first font
    const n = buf.readUInt16BE(off + 4);
    for (let i = 0; i < n; i++) {
      const r = off + 12 + i * 16;
      if (buf.toString('latin1', r, r + 4) !== 'name') continue;
      const t = buf.readUInt32BE(r + 8), count = buf.readUInt16BE(t + 2), strings = t + buf.readUInt16BE(t + 4);
      let best = '';
      for (let k = 0; k < count; k++) {
        const e = t + 6 + k * 12, pid = buf.readUInt16BE(e), nid = buf.readUInt16BE(e + 6), len = buf.readUInt16BE(e + 8), at = strings + buf.readUInt16BE(e + 10);
        if (nid !== 16 && nid !== 1) continue;                                          // 16 = typographic family, 1 = family
        const raw = buf.subarray(at, at + len);
        const s = pid === 1 ? raw.toString('latin1') : Buffer.from(raw).swap16().toString('utf16le');
        if (nid === 16) return s.trim(); if (!best) best = s.trim();
      }
      return best;
    }
  } catch {}
  return '';
}
