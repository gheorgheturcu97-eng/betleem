// ⇪ ProPresenter → our library. Reads the song files on this computer (ProPresenter 7 .pro, ProPresenter 6 .pro6),
// only reading them, never changing them. ProPresenter 7 files are Protocol Buffers; the field numbers come from the
// open, MIT-licensed definitions at github.com/greyshirtguy/ProPresenter7-Proto (no ProPresenter code is used).
//   Presentation: name 3, arrangements 11, cue_groups 12, cues 13, ccli 14, music_key 22, selected_arrangement 10
//   CueGroup: group 1 (Group: uuid 1, name 2), cue_identifiers 2 (UUID: string 1)
//   Cue: uuid 1, actions 10 → Action.slide 23 → SlideType.presentation 2 → PresentationSlide.base_slide 1
//   → Slide.elements 1 → Slide.Element.element 1 → Graphics.Element.text 13 → Graphics.Text.rtf_data 5

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ---- a tiny Protocol Buffers reader (wire format only; we know which fields we want) ----
function varint(b, i) {
  let v = 0, s = 0, x;
  do { if (i >= b.length) throw new Error('trunchiat'); x = b[i++]; v += (x & 0x7f) * 2 ** s; s += 7; } while (x & 0x80 && s < 64);
  return [v, i];
}
/** All fields of one message: [{ n, wt, v }] where v is a Buffer for length-delimited fields. */
export function fields(b) {
  const out = []; let i = 0;
  while (i < b.length) {
    let key; [key, i] = varint(b, i);
    const n = Math.floor(key / 8), wt = key & 7;
    if (wt === 0) { let v; [v, i] = varint(b, i); out.push({ n, wt, v }); }
    else if (wt === 1) { out.push({ n, wt, v: b.subarray(i, i + 8) }); i += 8; }
    else if (wt === 5) { out.push({ n, wt, v: b.subarray(i, i + 4) }); i += 4; }
    else if (wt === 2) { let len; [len, i] = varint(b, i); if (i + len > b.length) throw new Error('trunchiat'); out.push({ n, wt, v: b.subarray(i, i + len) }); i += len; }
    else throw new Error('format necunoscut');
  }
  return out;
}
const sub = (b, n) => fields(b).filter(f => f.n === n && f.wt === 2).map(f => f.v);
const one = (b, n) => sub(b, n)[0];
const str = (b, n) => { const v = one(b, n); return v ? v.toString('utf8') : ''; };
const uuidOf = b => (b ? str(b, 1) : '');
const path_ = (b, ns) => ns.reduce((xs, n) => xs.flatMap(x => sub(x, n)), [b]);

// ---- RTF → plain text (enough for song slides: paragraphs, line breaks, Unicode and code-page letters) ----
const CP1250 = { 0x8a: 'Š', 0x8c: 'Ś', 0x8d: 'Ť', 0x8e: 'Ž', 0x9a: 'š', 0x9c: 'ś', 0x9d: 'ť', 0x9e: 'ž', 0xaa: 'Ş', 0xba: 'ş', 0xc3: 'Ă', 0xe3: 'ă', 0xde: 'Ţ', 0xfe: 'ţ', 0xc2: 'Â', 0xe2: 'â', 0xce: 'Î', 0xee: 'î' };
export function rtfToText(rtf) {
  rtf = String(rtf);
  if (!rtf.startsWith('{\\rtf')) return rtf;
  const skipDest = /^(fonttbl|colortbl|stylesheet|info|pict|header|footer|expandedcolortbl|listtable|listoverridetable|\*)$/;
  let out = '', depth = 0, skipAt = -1, uc = 1, skipChars = 0, cp1250 = /ansicpg1250/.test(rtf);
  for (let i = 0; i < rtf.length; i++) {
    const c = rtf[i];
    if (c === '{') { depth++; continue; }
    if (c === '}') { if (depth === skipAt) skipAt = -1; depth--; continue; }
    if (c === '\\') {
      const n = rtf[i + 1];
      if (n === '\\' || n === '{' || n === '}') { if (skipAt < 0) { if (skipChars) skipChars--; else out += n; } i++; continue; }
      if (n === '\n' || n === '\r') { if (skipAt < 0) out += '\n'; i++; continue; }
      if (n === "'") {                                  // \'hh: a letter from the code page
        const code = parseInt(rtf.slice(i + 2, i + 4), 16); i += 3;
        if (skipAt >= 0) continue; if (skipChars) { skipChars--; continue; }
        out += cp1250 && CP1250[code] ? CP1250[code] : String.fromCharCode(code); continue;
      }
      if (n === '*') { if (skipAt < 0) skipAt = depth; i++; continue; }
      const m = rtf.slice(i + 1).match(/^([a-zA-Z]+)(-?\d+)? ?/);
      if (!m) { i++; continue; }
      i += m[0].length;
      const w = m[1], arg = m[2] !== undefined ? +m[2] : null;
      if (skipDest.test(w) && skipAt < 0) skipAt = depth;
      if (skipAt >= 0) continue;
      if (w === 'par' || w === 'line' || w === 'sect') out += '\n';
      else if (w === 'tab') out += ' ';
      else if (w === 'uc') uc = arg ?? 1;
      else if (w === 'u') { let code = arg; if (code < 0) code += 65536; out += String.fromCharCode(code); skipChars = uc; }
      continue;
    }
    if (c === '\r' || c === '\n') continue;
    if (skipAt >= 0) continue;
    if (skipChars) { skipChars--; continue; }
    out += c;
  }
  return out.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    .replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț');
}

// ---- ProPresenter 7 ----
/** One .pro file → { title, author, key, sections: [{ name, text }], order: [group names] } */
export function parsePro7(buf) {
  const title = str(buf, 3), key = str(buf, 22);
  const ccli = one(buf, 14), author = ccli ? str(ccli, 1) : '';
  const cues = new Map();
  for (const cue of sub(buf, 13)) {
    const id = uuidOf(one(cue, 1)), texts = [];
    for (const el of path_(cue, [10, 23, 2, 1, 1, 1])) {          // the text boxes of the slide, in their order
      const t = one(el, 13), rtf = t && one(t, 5);
      if (rtf) { const s = rtfToText(rtf.toString('latin1').includes('\\u') || !/[\x80-\xff]/.test(rtf.toString('latin1')) ? rtf.toString('latin1') : rtf.toString('utf8')); if (s.trim()) texts.push(s.trim()); }
    }
    cues.set(id, texts.join('\n'));
  }
  const groups = sub(buf, 12).map(g => {
    const grp = one(g, 1);
    return { id: grp ? uuidOf(one(grp, 1)) : '', name: grp ? str(grp, 2) : '', cues: sub(g, 2).map(uuidOf) };
  });
  const sections = groups.map(g => ({ id: g.id, name: g.name.trim(), text: g.cues.map(c => cues.get(c) || '').filter(Boolean).join('\n\n') })).filter(s => s.text);
  if (!sections.length) {                                    // no groups: the cues in order
    const all = [...cues.values()].filter(Boolean);
    if (all.length) sections.push({ id: '', name: '', text: all.join('\n\n') });
  }
  const sel = uuidOf(one(buf, 10)), arrs = sub(buf, 11).map(a => ({ id: uuidOf(one(a, 1)), name: str(a, 2), groups: sub(a, 3).map(uuidOf) }));
  const arr = arrs.find(a => a.id === sel) || null;
  const order = arr ? arr.groups.map(id => groups.find(g => g.id === id)?.name.trim()).filter(Boolean) : [];
  return { title, author, key, sections, order };
}

// ---- ProPresenter 6 (.pro6, XML with the text in base64) ----
export function parsePro6(xml) {
  xml = String(xml);
  const attr = (s, a) => (s.match(new RegExp('\\s' + a + '="([^"]*)"')) || [])[1] || '';
  const b64 = s => { try { return Buffer.from(s, 'base64').toString('utf8'); } catch { return ''; } };
  const head = xml.match(/<RVPresentationDocument[^>]*>/)?.[0] || '';
  const title = attr(head, 'CCLISongTitle') || '';
  const author = attr(head, 'CCLIAuthor') || '';
  const sections = [];
  for (const g of xml.matchAll(/<RVSlideGrouping([^>]*)>([\s\S]*?)<\/RVSlideGrouping>/g)) {
    const texts = [];
    for (const sl of g[2].matchAll(/<RVDisplaySlide[\s\S]*?<\/RVDisplaySlide>/g)) {
      const parts = [];
      for (const t of sl[0].matchAll(/<RVTextElement[\s\S]*?(?:<\/RVTextElement>|\/>)/g)) {
        const plain = t[0].match(/<NSString rvXMLIvarName="PlainText">([^<]*)</)?.[1];
        const rtf = t[0].match(/<NSString rvXMLIvarName="RTFData">([^<]*)</)?.[1] || attr(t[0], 'RTFData');
        const s = plain ? b64(plain) : rtf ? rtfToText(b64(rtf)) : '';
        if (s.trim()) parts.push(s.trim());
      }
      if (parts.length) texts.push(parts.join('\n'));
    }
    if (texts.length) sections.push({ name: attr(g[1], 'name').trim(), text: texts.join('\n\n') });
  }
  return { title, author, key: '', sections, order: [] };
}

/** ProPresenter's English group names in our words: "Verse 2" → "Strofa 2", "Chorus" → "Refren", "Pre-Chorus" → "Pre-refren". */
export function roName(n) {
  n = String(n || '').trim().replace(/:$/, '');
  return n.replace(/^pre-?\s?chorus/i, 'Pre-refren').replace(/^chorus/i, 'Refren').replace(/^verse/i, 'Strofa').replace(/^(ending|outro)/i, 'Final');
}
/** Our song body: "Strofa 1:" / "Refren:" … then the words. Names we don't know are left for the automatic labels. */
export function toBody(song, core) {
  const known = n => n && core.sectionKind(n);
  const parts = song.sections.map(s => (known(s.name) ? roName(s.name) + ':\n' : '') + s.text);
  return core.normalizeImported(parts.join('\n\n'));
}

/** The folders where ProPresenter keeps its songs on this computer (only those that exist). */
export function defaultFolders() {
  const h = os.homedir();
  const c = [
    path.join(h, 'Documents', 'ProPresenter'), path.join(h, 'Documents', 'ProPresenter6'), path.join(h, 'Documents', 'ProPresenter 7'),
    path.join(h, 'Library', 'Application Support', 'RenewedVision', 'ProPresenter'), path.join(h, 'Library', 'Application Support', 'RenewedVision', 'ProPresenter6'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'RenewedVision', 'ProPresenter'),
    process.env.PUBLIC && path.join(process.env.PUBLIC, 'Documents', 'ProPresenter'),
  ].filter(Boolean);
  return c.filter(d => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
}
const NOT_SONGS = /anun[tț]|count ?down|cowntdown|predic|sermon|templat|teme\b|announce/i;
/** The ProPresenter library a file is in (Libraries/<name>/…), to keep it as a tag: „Colinde”, „Înmormântare”… (not for the main „Songs”). */
export function libraryOf(f) { const m = String(f).split(/[\\/]/); const i = m.lastIndexOf('Libraries'); return i >= 0 && m[i + 2] ? m[i + 1].trim() : ''; }
/** Every .pro / .pro6 file under these folders (not following links, at most 6 levels, at most 20 000 files). */
export function findFiles(dirs) {
  const out = [];
  const walk = (d, depth) => {
    if (depth > 6 || out.length > 20000) return;
    let list = []; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (e.name.startsWith('.')) continue;
      const f = path.join(d, e.name);
      // not songs: ProPresenter's own folders (themes, playlists, presets…) and libraries of announcements, sermons or countdowns
      if (e.isDirectory() && !/\.(app|bundle)$/i.test(e.name) && !/^(Media|Cache|Thumbnails|Backups?|Themes|Playlists|Presets|Configuration|Downloads|Templates|Props|Macros|Looks|Stage)$/i.test(e.name)
        && !NOT_SONGS.test(e.name)) walk(f, depth + 1);
      else if (e.isFile() && /\.pro6?$/i.test(e.name)) out.push(f);
    }
  };
  for (const d of dirs) walk(d, 0);
  return [...new Set(out)];
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\[[^\]]*\]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const firstLines = (body, n = 2) => norm(body.split('\n').filter(l => { const t = l.replace(/\[[^\]]*\]/g, '').trim(); return t && !/:\s*$/.test(t) && !/^\{/.test(t); }).slice(0, n).join(' '));
/** A song already in the library with the same name, or that starts with the same words. */
export function findSame(songs, title, body) {
  const t = norm(title).replace(/\b(live|acoustic|official|version|varianta|v\d)\b/g, '').trim(), f = firstLines(body || '');
  return songs.find(s => (t && norm(s.title) === t) || (f.length > 12 && firstLines(s.body) === f)) || null;
}

/**
 * Import every song found. Returns { files, added: [titles], same: [{ title, existing }], failed: [names] }.
 * `add(song)` puts one new song in the library.
 */
export function importFolders(dirs, songs, core, add) {
  const files = findFiles(dirs), added = [], same = [], failed = [];
  for (const f of files) {
    try {
      const buf = fs.readFileSync(f);
      const s = /\.pro6$/i.test(f) || buf.subarray(0, 64).toString('utf8').includes('<?xml') ? parsePro6(buf.toString('utf8')) : parsePro7(buf);
      const title = (s.title || path.basename(f).replace(/\.pro6?$/i, '')).trim().slice(0, 120);
      if (!s.sections.length) { failed.push(path.basename(f)); continue; }
      const body = toBody(s, core);
      if (!body.trim()) { failed.push(path.basename(f)); continue; }
      const hit = findSame(songs, title, body);
      if (hit) { same.push({ title, existing: hit.title }); continue; }
      const lib = libraryOf(f), tag = lib && !/^(songs?|cant[aă]ri|c[aâ]nt[aă]ri|library|default)$/i.test(lib) ? lib : '';
      const song = add({ title, author: s.author || '', key: s.key || core.readMeta(body).key || '', body, source: 'ProPresenter: ' + path.basename(f), ...(tag ? { tags: [tag] } : {}),
        arrangement: s.order.length && s.order.every(n => core.sectionKind(n)) ? s.order.map(roName) : undefined });
      songs = songs.concat(song); added.push(title);
    } catch { failed.push(path.basename(f)); }
  }
  return { files: files.length, added, same, failed };
}
