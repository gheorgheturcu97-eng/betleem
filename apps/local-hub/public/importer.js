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
export async function importMedia(files, { upload, convert, progress = () => {} }) {
  const out = [];
  for (const f of files) {
    const ext = (f.name.match(/\.[^.]+$/) || [''])[0].toLowerCase(), title = f.name.replace(/\.[^.]+$/, '');
    const base = 'pres-' + slug(title) + '-' + Date.now().toString(36);
    let pages;                                                  // canvases, or null for a picture / video kept as it is
    if (IMAGE.test(f.name) || VIDEO.test(f.name)) {
      progress(`Încarc ${f.name}…`);
      out.push({ title, slides: [await upload(base + ext, f)] });
      continue;
    }
    if (ext === '.pdf') pages = await pdfPages(f, progress);
    else if (['.pptx', '.ppt', '.key', '.odp', '.pps', '.ppsx'].includes(ext)) {
      progress(`Deschid ${f.name}…`);
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
    out.push({ title, slides });
  }
  return out;
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
    const layoutPath = Object.values(r).find(x => x.type.endsWith('/slideLayout'))?.target;
    const layout = layoutPath ? xml(await z.text(layoutPath)) : null, lr = layoutPath ? await rels(layoutPath) : {};
    const masterPath = Object.values(lr).find(x => x.type.endsWith('/slideMaster'))?.target;
    const master = masterPath ? xml(await z.text(masterPath)) : null, mr = masterPath ? await rels(masterPath) : {};
    const themePath = Object.values(mr).find(x => x.type.endsWith('/theme'))?.target;
    const theme = themePath ? xml(await z.text(themePath)) : null;
    const scheme = {};
    const cs = deep(theme, 'clrScheme');
    if (cs) for (const c of cs.children) { const v = c.firstElementChild; scheme[c.localName] = '#' + (v?.getAttribute('val') || v?.getAttribute('lastClr') || '000000'); }
    const alias = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    const color = el => {
      if (!el) return null;
      const s = kid(el, 'srgbClr'), sc = kid(el, 'schemeClr'), sys = kid(el, 'sysClr');
      if (s) return '#' + s.getAttribute('val');
      if (sys) return '#' + (sys.getAttribute('lastClr') || '000000');
      if (sc) { const v = sc.getAttribute('val'); return scheme[alias[v] || v] || null; }
      return null;
    };
    const c = Object.assign(document.createElement('canvas'), { width: W, height: h });
    const ctx = c.getContext('2d');
    // background: slide, then layout, then master
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, h);
    for (const [d, rr] of [[doc, r], [layout, lr], [master, mr]]) {
      const bg = deep(d, 'bg'); if (!bg) continue;
      const fill = color(deep(bg, 'solidFill')) || color(kid(bg, 'bgRef'));
      const blip = deep(bg, 'blip');
      if (blip) { const im = await image(rr[blip.getAttribute('r:embed')]?.target); if (im) { ctx.drawImage(im, 0, 0, W, h); break; } }
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
    const box = x => { const o = kid(x, 'off'), e = kid(x, 'ext'); return o && e ? [+o.getAttribute('x') * k, +o.getAttribute('y') * k, +e.getAttribute('cx') * k, +e.getAttribute('cy') * k] : null; };
    const drawTree = async (tree, rr, skipPh) => {
      for (const el of tree.children) {
        if (el.localName === 'grpSp') { await drawTree(el, rr, skipPh); continue; }
        if (el.localName === 'pic') {
          const x = xfrmOf(el) || deep(el, 'xfrm'), b = x && box(x); const blip = deep(el, 'blip');
          const im = blip && await image(rr[blip.getAttribute('r:embed')]?.target);
          if (b && im) ctx.drawImage(im, ...b);
          continue;
        }
        if (el.localName !== 'sp') continue;
        if (skipPh && phKey(el)) continue;                           // the layout's empty "Click to add title" boxes
        const x = xfrmOf(el); const b = x && box(x); if (!b) continue;
        const spPr = kid(el, 'spPr'), fill = color(kid(spPr, 'solidFill'));
        if (fill) { ctx.fillStyle = fill; ctx.fillRect(...b); }
        const blip = deep(kid(spPr, 'blipFill'), 'blip');
        if (blip) { const im = await image(rr[blip.getAttribute('r:embed')]?.target); if (im) ctx.drawImage(im, ...b); }
        const tx = kid(el, 'txBody'); if (tx) drawText(ctx, tx, b, phKey(el), color, k);
      }
    };
    if (master) await drawTree(deep(master, 'spTree'), mr, true);
    if (layout) await drawTree(deep(layout, 'spTree'), lr, true);
    await drawTree(deep(doc, 'spTree'), r, false);
    pages.push(c);
  }
  return pages;
}

function drawText(ctx, tx, [x, y, w, h], ph, color, k) {
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
      const rp = kid(r, 'rPr'), sz = +(rp?.getAttribute('sz') || 0) / 100 || (title ? 40 : 24);
      size = Math.max(size, sz);
      const face = deep(rp, 'latin')?.getAttribute('typeface');
      runs.push({ text: kid(r, 't')?.textContent || '', sz, bold: rp?.getAttribute('b') === '1', italic: rp?.getAttribute('i') === '1',
        color: color(kid(rp, 'solidFill')) || '#000', face: face && !face.startsWith('+') ? face : 'Inter' });
    }
    lines.push({ runs, size: size || (title ? 40 : 24), align });
  }
  // wrap words into rows that fit the box
  const rows = [];
  for (const l of lines) {
    let row = { parts: [], width: 0, size: l.size, align: l.align };
    const push = () => { rows.push(row); row = { parts: [], width: 0, size: l.size, align: l.align }; };
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
  const rowH = r => Math.max(...r.parts.map(p => p.px), r.size * scale * 12700 * k) * 1.2;
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
