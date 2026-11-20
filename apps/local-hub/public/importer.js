// Media for the program: PDF and PowerPoint/Keynote pages, pictures, videos → one "Prezentare" item with a slide per page.
// PDF pages are drawn with pdf.js. PowerPoint: LibreOffice on the computer (exact), otherwise our own simple drawing of the slides.

const W = 1920, H = 1080;
const VIDEO = /\.(mp4|webm|mov)$/i, IMAGE = /\.(png|jpe?g|webp)$/i;
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 30).toLowerCase() || 'prezentare';
const toBlob = canvas => new Promise(ok => canvas.toBlob(ok, 'image/jpeg', 0.9));

/**
 * files: File[]; upload(name, blob) → url; progress(text).
 * Returns [{ title, slides: [url] }] or throws an Error with a message for people.
 */
export async function importMedia(files, { upload, convert, fonts = async () => null, progress = () => {} }) {
  const out = [];
  for (const f of files) {
    const ext = (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase(), title = f.name.replace(/\.[^.]+$/, '');
    const base = 'pres-' + slug(title) + '-' + Date.now().toString(36);
    let pages, info = null;                                     // canvases; info: transitions, timings, fonts of a PowerPoint
    if (IMAGE.test(f.name) || VIDEO.test(f.name)) {
      progress(`Încarc ${f.name}…`);
      out.push({ title, slides: [await upload(base + ext, f)] });
      continue;
    }
    if (ext === '.pdf') pages = await pdfPages(f, progress);
    else if (['.pptx', '.ppt', '.key', '.odp', '.pps', '.ppsx'].includes(ext)) {
      progress(`Deschid ${f.name}…`);
      if (ext === '.pptx' || ext === '.ppsx') {
        info = await pptxInfo(f).catch(() => null);
        if (info?.fonts.length) {                               // fonts the computer does not have: downloaded once, kept for next time
          progress('Caut fonturile prezentării…');
          const r = await fonts(info.fonts).catch(() => null);
          if (r?.css) await loadFontCss(r.css, r.got || []);
          if (r?.missing?.length) progress('Fonturi negăsite (folosesc altele asemănătoare): ' + r.missing.join(', '));
        }
      }
      const pdf = await convert(f);                             // Blob (LibreOffice did it) or null
      if (pdf) pages = await pdfPages(pdf, progress);
      else if (ext === '.pptx' || ext === '.ppsx') pages = await pptxPages(f, progress);
      else throw new Error(`„${f.name}”: salvează prezentarea ca PDF (Fișier → Exportă → PDF) sau ca .pptx și import-o din nou.`);
    } else throw new Error(`„${f.name}”: pot importa PDF, PowerPoint (.pptx), Keynote, imagini și video.`);
    const slides = [];
    for (const [i, c] of pages.entries()) {
      progress(`Salvez pagina ${i + 1} din ${pages.length}…`);
      slides.push(await upload(`${base}-${String(i + 1).padStart(3, '0')}.jpg`, await toBlob(c)));
    }
    const shown = info?.slides.filter(x => !x.hidden) || [];
    const fx = shown.length === slides.length ? shown : null;     // pages and slides line up: keep PowerPoint's transitions and timings
    out.push({ title, slides, ...(fx ? { transitions: fx.map(x => x.transition), advance: fx.map(x => x.advance) } : {}) });
  }
  return out;
}

async function loadFontCss(href, families) {
  if (!document.querySelector(`link[href="${href}"]`)) document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
  await new Promise(ok => setTimeout(ok, 300));
  await Promise.all(families.flatMap(f => ['400', '700'].map(w => document.fonts.load(`${w} 40px "${f}"`).catch(() => {}))));
}

// ---------------------------------------------------------------- what PowerPoint knows besides the pictures
const TRANS = { fade: 'fade', dissolve: 'fade', push: 'push', wipe: 'wipe', cover: 'cover', pull: 'uncover', split: 'split',
  zoom: 'zoom', cut: 'cut', randomBar: 'fade', circle: 'zoom', diamond: 'zoom', plus: 'zoom', wedge: 'wipe', wheel: 'wipe',
  strips: 'wipe', blinds: 'wipe', checker: 'fade', comb: 'wipe', newsflash: 'zoom', random: 'fade', morph: 'fade',
  vortex: 'zoom', ripple: 'zoom', glitter: 'fade', honeycomb: 'fade', flash: 'fade', shred: 'fade', switch: 'push',
  flip: 'push', gallery: 'push', cube: 'push', doors: 'split', box: 'zoom', reveal: 'uncover', ferris: 'push', conveyor: 'push',
  pan: 'push', prism: 'push', flythrough: 'zoom', warp: 'zoom', curtains: 'split', wind: 'push', airplane: 'push', origami: 'fade',
  fracture: 'fade', crush: 'zoom', peelOff: 'uncover', pageCurlDouble: 'uncover', pageCurlSingle: 'uncover', drape: 'fade', prestige: 'fade' };
export async function pptxInfo(file) {
  const z = await unzip(file);
  const relMap = async path => {
    const dir = path.slice(0, path.lastIndexOf('/')), name = path.slice(path.lastIndexOf('/') + 1);
    const t = await z.text(`${dir}/_rels/${name}.rels`); const map = {};
    if (t) for (const r of xml(t).getElementsByTagNameNS('*', 'Relationship')) map[r.getAttribute('Id')] = resolve(dir, r.getAttribute('Target'));
    return map;
  };
  const pres = xml(await z.text('ppt/presentation.xml')), pr = await relMap('ppt/presentation.xml');
  const ids = [...pres.getElementsByTagNameNS('*', 'sldId')].map(s => pr[s.getAttribute('r:id')]).filter(Boolean);
  const fonts = new Set();
  const addFonts = d => { for (const el of d.getElementsByTagNameNS('*', 'latin')) { const f = el.getAttribute('typeface'); if (f && !f.startsWith('+')) fonts.add(f); } };
  const theme = await z.text('ppt/theme/theme1.xml'); if (theme) addFonts(xml(theme));
  const slides = [];
  for (const path of ids) {
    const d = xml(await z.text(path)); addFonts(d);
    const tr = d.getElementsByTagNameNS('*', 'transition')[0];        // the richer PowerPoint 2010+ one comes first
    let transition = null, advance = null;
    if (tr) {
      const kind = [...tr.children].map(c => c.localName).find(n => n !== 'sndAc' && n !== 'extLst');
      const dur = Number(tr.getAttribute('p14:dur') || tr.getAttribute('dur')) || ({ slow: 1000, med: 750, fast: 500 }[tr.getAttribute('spd')] ?? 700);
      const el = kind && [...tr.children].find(c => c.localName === kind);
      const dir = el?.getAttribute('dir') || '';
      if (kind) transition = { type: TRANS[kind] || 'fade', dir: /^[lrud]$/.test(dir) ? dir : dir === 'in' || dir === 'out' ? dir : '', dur: Math.min(5000, Math.max(0, dur)) };
      const adv = [...d.getElementsByTagNameNS('*', 'transition')].map(t => t.getAttribute('advTm')).find(Boolean);
      if (adv) advance = Math.max(500, Number(adv));
    }
    slides.push({ hidden: d.documentElement.getAttribute('show') === '0', transition, advance });
  }
  for (const n of [1, 2, 3]) { const t = await z.text(`ppt/slideMasters/slideMaster${n}.xml`); if (t) addFonts(xml(t)); }
  return { slides, fonts: [...fonts].slice(0, 20) };
}

// ---------------------------------------------------------------- PDF
async function pdfPages(file, progress) {
  const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), standardFontDataUrl: '/vendor/pdfjs/standard_fonts/' }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    progress(`Desenez pagina ${n} din ${doc.numPages}…`);
    const page = await doc.getPage(n), v = page.getViewport({ scale: 1 });
    const scale = Math.min(W / v.width, H / v.height);
    const vp = page.getViewport({ scale });
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(vp.width), height: Math.round(vp.height) });
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    pages.push(c);
  }
  return pages;
}

// ---------------------------------------------------------------- ZIP (pptx is a zip of XML files)
async function unzip(file) {
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
  let e = buf.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Fișierul PowerPoint e deteriorat.');
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint32(p + 30, true) & 0xffff, cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nl));
    entries.set(name, { method, size, off });
    p += 46 + nl + xl + cl;
  }
  const raw = async name => {
    const x = entries.get(name); if (!x) return null;
    const start = x.off + 30 + dv.getUint16(x.off + 26, true) + dv.getUint16(x.off + 28, true);
    const data = buf.subarray(start, start + x.size);
    if (x.method === 0) return data;
    return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  };
  return { raw, text: async n => { const b = await raw(n); return b ? new TextDecoder().decode(b) : null; }, has: n => entries.has(n) };
}

// ---------------------------------------------------------------- PowerPoint, drawn by us (text, pictures, colours, backgrounds)
const xml = t => new DOMParser().parseFromString(t, 'application/xml');
const kids = (el, tag) => el ? [...el.children].filter(c => c.localName === tag) : [];
const kid = (el, tag) => kids(el, tag)[0] || null;
const deep = (el, tag) => el ? el.getElementsByTagNameNS('*', tag)[0] || null : null;
const resolve = (dir, target) => { const parts = (dir + '/' + target).split('/'), out = []; for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); } return out.join('/'); };

const themeFonts = { major: 'Inter', minor: 'Inter' };
// the part of a picture PowerPoint shows (srcRect: what is cut from each side, in 1/1000 %)
function crop(im, sr) {
  const v = a => +(sr?.getAttribute(a) || 0) / 100000;
  const l = v('l'), t = v('t'), r = v('r'), b = v('b');
  return [im.width * l, im.height * t, Math.max(1, im.width * (1 - l - r)), Math.max(1, im.height * (1 - t - b))];
}
async function pptxPages(file, progress) {
  const z = await unzip(file);
  const rels = async path => {
    const dir = path.slice(0, path.lastIndexOf('/')), name = path.slice(path.lastIndexOf('/') + 1);
    const t = await z.text(`${dir}/_rels/${name}.rels`); const map = {};
    if (t) for (const r of xml(t).getElementsByTagNameNS('*', 'Relationship')) map[r.getAttribute('Id')] = { target: resolve(dir, r.getAttribute('Target')), type: r.getAttribute('Type') };
    return map;
  };
  const pres = xml(await z.text('ppt/presentation.xml'));
  const sz = deep(pres, 'sldSz'), cx = +sz.getAttribute('cx'), cy = +sz.getAttribute('cy');
  const presRels = await rels('ppt/presentation.xml');
  const ids = [...pres.getElementsByTagNameNS('*', 'sldId')].map(s => presRels[s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')]?.target).filter(Boolean);
  const k = W / cx, h = Math.round(cy * k);
  const imgCache = new Map();
  const image = async path => {
    if (!imgCache.has(path)) imgCache.set(path, (async () => {
      const b = await z.raw(path); if (!b) return null;
      try { return await createImageBitmap(new Blob([b])); } catch { return null; }
    })());
    return imgCache.get(path);
  };
  const pages = [];
  for (const [n, path] of ids.entries()) {
    progress(`Desenez slide-ul ${n + 1} din ${ids.length}…`);
    const doc = xml(await z.text(path)), r = await rels(path);
    if (doc.documentElement.getAttribute('show') === '0') continue;           // hidden slides stay hidden
    const layoutPath = Object.values(r).find(x => x.type.endsWith('/slideLayout'))?.target;
    const layout = layoutPath ? xml(await z.text(layoutPath)) : null, lr = layoutPath ? await rels(layoutPath) : {};
    const masterPath = Object.values(lr).find(x => x.type.endsWith('/slideMaster'))?.target;
    const master = masterPath ? xml(await z.text(masterPath)) : null, mr = masterPath ? await rels(masterPath) : {};
    const themePath = Object.values(mr).find(x => x.type.endsWith('/theme'))?.target;
    const theme = themePath ? xml(await z.text(themePath)) : null;
    const scheme = {};
    const cs = deep(theme, 'clrScheme');
    themeFonts.major = deep(deep(theme, 'majorFont'), 'latin')?.getAttribute('typeface') || 'Inter';
    themeFonts.minor = deep(deep(theme, 'minorFont'), 'latin')?.getAttribute('typeface') || 'Inter';
    if (cs) for (const c of cs.children) { const v = c.firstElementChild; scheme[c.localName] = '#' + (v?.getAttribute('val') || v?.getAttribute('lastClr') || '000000'); }
    const alias = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    // a color with PowerPoint's adjustments (lighter/darker, see-through), as css rgba()
    const color = el => {
      if (!el) return null;
      const node = kid(el, 'srgbClr') || kid(el, 'schemeClr') || kid(el, 'sysClr') || kid(el, 'prstClr');
      if (!node) return null;
      let hex = node.localName === 'srgbClr' ? node.getAttribute('val') : node.localName === 'sysClr' ? (node.getAttribute('lastClr') || '000000')
        : node.localName === 'schemeClr' ? (scheme[alias[node.getAttribute('val')] || node.getAttribute('val')] || '').slice(1)
        : ({ white: 'ffffff', black: '000000', red: 'ff0000' })[node.getAttribute('val')] || '000000';
      if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
      let [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), a = 1;
      for (const m of node.children) {
        const v = +m.getAttribute('val') / 100000;
        if (m.localName === 'alpha') a = v;
        else if (m.localName === 'lumMod') [r, g, b] = [r, g, b].map(c => c * v);
        else if (m.localName === 'lumOff') [r, g, b] = [r, g, b].map(c => Math.min(1, c + v));
        else if (m.localName === 'tint') [r, g, b] = [r, g, b].map(c => 1 - (1 - c) * v);
        else if (m.localName === 'shade') [r, g, b] = [r, g, b].map(c => c * v);
      }
      return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${+a.toFixed(3)})`;
    };
    // a fill: plain color, or a gradient across the box
    const paint = (spPr, [x, y, w, h]) => {
      const sf = kid(spPr, 'solidFill'); if (sf) return color(sf);
      const gf = kid(spPr, 'gradFill'); if (!gf) return null;
      const stops = [...gf.getElementsByTagNameNS('*', 'gs')].map(g => [+g.getAttribute('pos') / 100000, color(g)]).filter(s => s[1]);
      if (!stops.length) return null;
      const ang = (+(deep(gf, 'lin')?.getAttribute('ang') || 0) / 60000) * Math.PI / 180, dx = Math.cos(ang) * w / 2, dy = Math.sin(ang) * h / 2;
      const gr = deep(gf, 'path') ? ctx.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2)
        : ctx.createLinearGradient(x + w / 2 - dx, y + h / 2 - dy, x + w / 2 + dx, y + h / 2 + dy);
      for (const [p, c] of stops) gr.addColorStop(Math.min(1, Math.max(0, p)), c);
      return gr;
    };
    const c = Object.assign(document.createElement('canvas'), { width: W, height: h });
    const ctx = c.getContext('2d');
    // background: slide, then layout, then master
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, h);
    for (const [d, rr] of [[doc, r], [layout, lr], [master, mr]]) {
      const bg = deep(d, 'bg'); if (!bg) continue;
      const bgPr = kid(bg, 'bgPr'), fill = (bgPr && paint(bgPr, [0, 0, W, h])) || color(kid(bg, 'bgRef'));
      const blip = deep(bg, 'blip');
      if (blip) { const im = await image(rr[blip.getAttribute('r:embed')]?.target); if (im) { ctx.drawImage(im, ...crop(im, deep(bg, 'srcRect')), 0, 0, W, h); break; } }
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, W, h); break; }
    }
    // placeholders without a position take it from the layout / master
    const phKey = sp => { const ph = deep(deep(sp, 'nvPr'), 'ph'); return ph ? { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') } : null; };
    const findPh = (d, key) => d && [...d.getElementsByTagNameNS('*', 'sp')].find(sp => { const p = phKey(sp); return p && ((key.idx && p.idx === key.idx) || p.type === key.type); });
    const xfrmOf = sp => {
      const x = deep(kid(sp, 'spPr'), 'xfrm');
      if (x) return x;
      const key = phKey(sp); if (!key) return null;
      return deep(kid(findPh(layout, key), 'spPr'), 'xfrm') || deep(kid(findPh(master, key), 'spPr'), 'xfrm');
    };
    // a box in slide pixels; inside a group the children have their own coordinates, mapped onto the group's box
    const ID = { ox: 0, oy: 0, sx: 1, sy: 1 };
    const box = (x, T = ID) => {
      const o = kid(x, 'off'), e = kid(x, 'ext'); if (!o || !e) return null;
      return [(T.ox + +o.getAttribute('x') * T.sx) * k, (T.oy + +o.getAttribute('y') * T.sy) * k, +e.getAttribute('cx') * T.sx * k, +e.getAttribute('cy') * T.sy * k];
    };
    // draw with the shape's rotation and mirroring
    const turned = (x, b, fn) => {
      const rot = +(x?.getAttribute('rot') || 0) / 60000, fh = x?.getAttribute('flipH') === '1', fv = x?.getAttribute('flipV') === '1';
      if (!rot && !fh && !fv) return fn(b);
      ctx.save(); ctx.translate(b[0] + b[2] / 2, b[1] + b[3] / 2); ctx.rotate(rot * Math.PI / 180); ctx.scale(fh ? -1 : 1, fv ? -1 : 1);
      const r = fn([-b[2] / 2, -b[3] / 2, b[2], b[3]]); ctx.restore(); return r;
    };
    const shapePath = (spPr, [x, y, w, hh]) => {
      const g = deep(spPr, 'prstGeom')?.getAttribute('prst') || 'rect';
      ctx.beginPath();
      if (g === 'ellipse') ctx.ellipse(x + w / 2, y + hh / 2, Math.abs(w / 2), Math.abs(hh / 2), 0, 0, Math.PI * 2);
      else if (/roundRect/.test(g) && ctx.roundRect) ctx.roundRect(x, y, w, hh, Math.min(Math.abs(w), Math.abs(hh)) * 0.1667);
      else ctx.rect(x, y, w, hh);
    };
    const outline = (spPr, b) => {
      const ln = kid(spPr, 'ln'); if (!ln || kid(ln, 'noFill')) return;
      const c = color(kid(ln, 'solidFill')); if (!c) return;
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, +(ln.getAttribute('w') || 12700) * k); shapePath(spPr, b); ctx.stroke();
    };
    const picture = async (el, rr, b, x) => {
      const bf = kid(el, 'blipFill') || kid(kid(el, 'spPr'), 'blipFill'), blip = deep(bf, 'blip');
      const im = blip && await image(rr[blip.getAttribute('r:embed')]?.target); if (!im) return;
      const am = deep(blip, 'alphaModFix'); ctx.save(); if (am) ctx.globalAlpha = +(am.getAttribute('amt') || 100000) / 100000;
      turned(x, b, bb => { shapePath(kid(el, 'spPr'), bb); ctx.clip(); ctx.drawImage(im, ...crop(im, deep(bf, 'srcRect')), ...bb); });
      ctx.restore();
    };
    const drawTree = async (tree, rr, skipPh, T = ID) => {
      for (const el of tree.children) {
        if (el.localName === 'grpSp') {
          const gx = deep(kid(el, 'grpSpPr'), 'xfrm'), o = kid(gx, 'off'), e = kid(gx, 'ext'), co = kid(gx, 'chOff'), ce = kid(gx, 'chExt');
          let G = T;
          if (o && e && co && ce) {
            const sx = (+e.getAttribute('cx') / (+ce.getAttribute('cx') || 1)) || 1, sy = (+e.getAttribute('cy') / (+ce.getAttribute('cy') || 1)) || 1;
            G = { sx: T.sx * sx, sy: T.sy * sy, ox: T.ox + T.sx * (+o.getAttribute('x') - +co.getAttribute('x') * sx), oy: T.oy + T.sy * (+o.getAttribute('y') - +co.getAttribute('y') * sy) };
          }
          await drawTree(el, rr, skipPh, G); continue;
        }
        if (el.localName === 'pic') {
          const x = xfrmOf(el) || deep(el, 'xfrm'), b = x && box(x, T);
          if (b) await picture(el, rr, b, x);
          continue;
        }
        if (el.localName !== 'sp' && el.localName !== 'cxnSp') continue;
        if (skipPh && phKey(el)) continue;                           // the layout's empty "Click to add title" boxes
        const x = xfrmOf(el); const b = x && box(x, T); if (!b) continue;
        const spPr = kid(el, 'spPr');
        await turned(x, b, async bb => {
          const fill = paint(spPr, bb);
          if (fill) { ctx.fillStyle = fill; shapePath(spPr, bb); ctx.fill(); }
          outline(spPr, bb);
        });
        if (deep(kid(spPr, 'blipFill'), 'blip')) await picture(el, rr, b, x);
        const tx = kid(el, 'txBody'); if (tx) turned(x, b, bb => drawText(ctx, tx, bb, phKey(el), color, k, master));
      }
    };
    if (master) await drawTree(deep(master, 'spTree'), mr, true);
    if (layout) await drawTree(deep(layout, 'spTree'), lr, true);
    await drawTree(deep(doc, 'spTree'), r, false);
    pages.push(c);
  }
  return pages;
}

function drawText(ctx, tx, [x, y, w, h], ph, color, k, master) {
  // text without its own color takes the master's: title style or body style
  const style = deep(deep(master, 'txStyles'), ph && /title/i.test(ph.type) ? 'titleStyle' : ph ? 'bodyStyle' : 'otherStyle');
  const lst = kid(tx, 'lstStyle');
  const baseColor = color(deep(deep(lst, 'defRPr'), 'solidFill')) || color(deep(deep(style, 'defRPr'), 'solidFill')) || '#000';
  const baseSize = +(deep(lst, 'defRPr')?.getAttribute('sz') || deep(style, 'defRPr')?.getAttribute('sz') || 0) / 100;
  const body = kid(tx, 'bodyPr');
  const ins = a => (body?.hasAttribute(a) ? +body.getAttribute(a) : a.startsWith('l') || a.startsWith('r') ? 91440 : 45720) * k;
  const L = x + ins('lIns'), T = y + ins('tIns'), Wd = w - ins('lIns') - ins('rIns'), Ht = h - ins('tIns') - ins('bIns');
  const scale = +(deep(body, 'normAutofit')?.getAttribute('fontScale') || 100000) / 100000;
  const title = ph && /title/i.test(ph.type);
  const lines = [];                                           // [{ runs:[{text,font,color}], size, align }]
  for (const p of kids(tx, 'p')) {
    const pPr = kid(p, 'pPr'), align = pPr?.getAttribute('algn') || (ph && /ctrTitle|subTitle/.test(ph.type) ? 'ctr' : 'l');
    const runs = [];
    let size = 0;
    for (const r of p.children) {
      if (r.localName === 'br') { runs.push({ br: true }); continue; }
      if (r.localName !== 'r' && r.localName !== 'fld') continue;
      const rp = kid(r, 'rPr'), sz = +(rp?.getAttribute('sz') || 0) / 100 || +(kid(pPr, 'defRPr')?.getAttribute('sz') || 0) / 100 || baseSize || (title ? 40 : 24);
      size = Math.max(size, sz);
      let face = deep(rp, 'latin')?.getAttribute('typeface') || (title ? '+mj-lt' : '+mn-lt');
      if (face.startsWith('+mj')) face = themeFonts.major; else if (face.startsWith('+mn')) face = themeFonts.minor;
      runs.push({ text: kid(r, 't')?.textContent || '', sz, bold: rp?.getAttribute('b') === '1', italic: rp?.getAttribute('i') === '1',
        color: color(kid(rp, 'solidFill')) || color(deep(kid(pPr, 'defRPr'), 'solidFill')) || baseColor, face: face || 'Inter' });
    }
    const lnPct = +(deep(deep(pPr, 'lnSpc'), 'spcPct')?.getAttribute('val') || 100000) / 100000;
    lines.push({ runs, size: size || baseSize || (title ? 40 : 24), align, ln: lnPct });
  }
  // wrap words into rows that fit the box
  const rows = [];
  for (const l of lines) {
    let row = { parts: [], width: 0, size: l.size, align: l.align, ln: l.ln };
    const push = () => { rows.push(row); row = { parts: [], width: 0, size: l.size, align: l.align, ln: l.ln }; };
    if (!l.runs.length) { push(); continue; }
    for (const r of l.runs) {
      if (r.br) { push(); continue; }
      const px = r.sz * scale * 12700 * k;                       // points → EMU → pixels
      ctx.font = `${r.italic ? 'italic ' : ''}${r.bold ? 700 : 400} ${px}px "${r.face}", Inter, Arial, sans-serif`;
      for (const word of r.text.split(/(\s+)/)) {
        if (!word) continue;
        const ww = ctx.measureText(word).width;
        if (row.width + ww > Wd && row.parts.length && word.trim()) push();
        if (!row.parts.length && !word.trim()) continue;
        row.parts.push({ word, font: ctx.font, color: r.color, w: ww, px }); row.width += ww;
      }
    }
    push();
  }
  const rowH = r => Math.max(...r.parts.map(p => p.px), r.size * scale * 12700 * k) * 1.2 * (r.ln || 1);
  const total = rows.reduce((a, r) => a + rowH(r), 0);
  const anchor = body?.getAttribute('anchor') || (title ? 'ctr' : 't');
  let yy = anchor === 'ctr' ? T + (Ht - total) / 2 : anchor === 'b' ? T + Ht - total : T;
  ctx.textBaseline = 'alphabetic';
  for (const r of rows) {
    const rh = rowH(r);
    let xx = r.align === 'ctr' ? L + (Wd - r.width) / 2 : r.align === 'r' ? L + Wd - r.width : L;
    for (const p of r.parts) { ctx.font = p.font; ctx.fillStyle = p.color; ctx.fillText(p.word, xx, yy + rh * 0.8); xx += p.w; }
    yy += rh;
  }
}
