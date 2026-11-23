// 🧱 Layers: independent objects on a slide or in a Prop (text, picture, video, shape).
// One renderer for the projector (main.html), the slide editor and the Props editor, so what you edit is what shows.
// Positions are in % of the screen, sizes in cqh (1 = 1% of the screen height): the same layer looks the same on a
// 1080p projector, a small preview or a TV. Nothing here talks to the hub: the pages save what the editor returns.

const CSS = `
.ly-box{position:absolute;inset:0;pointer-events:none;container-type:size;overflow:hidden}
.ly{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}
.ly>img,.ly>video{width:100%;height:100%;display:block}
.ly .lt{white-space:pre-line;width:100%;overflow-wrap:anywhere}
.ly-edit .ly{pointer-events:auto;cursor:move;touch-action:none;overflow:visible}
.ly-edit .ly.locked{pointer-events:none}
.ly-edit .ly.off{opacity:.3!important;outline:1px dashed rgba(255,255,255,.6)}
.ly-edit .ly:hover{outline:1px solid rgba(120,180,255,.8)}
.ly-edit .ly.sel{outline:2px solid #4da3ff;outline-offset:1px}
.ly .h{display:none}
.ly-edit .ly.sel .h{display:block;position:absolute;right:-7px;bottom:-7px;width:13px;height:13px;border-radius:4px;background:#4da3ff;cursor:nwse-resize;z-index:2}
.lye{display:flex;flex-direction:column;gap:8px}
.lye-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.lye-tools button{height:30px;padding:0 10px;border-radius:999px;font-size:12.5px}
.lye-list{display:flex;flex-direction:column;gap:3px;max-height:170px;overflow:auto}
.lye-row{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:9px;background:rgba(255,255,255,.05);cursor:pointer;font-size:12.5px}
.lye-row.sel{background:rgba(77,163,255,.25)} .lye-row .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lye-row button{height:24px;min-width:24px;padding:0 5px;border-radius:7px;font-size:12px;background:transparent}
.lye-row button.off{opacity:.35}
.lye-props{display:flex;flex-direction:column;gap:7px}
.lye-props .lf{display:flex;align-items:center;gap:8px}.lye-props .lf>span{width:92px;color:var(--mute,#999);font-size:12px;flex:none}
.lye-props .lf input[type=range]{flex:1;padding:0}.lye-props .lf select,.lye-props .lf input[type=text]{flex:1;min-width:0}
.lye-props .lf input[type=number]{width:62px}.lye-props textarea{width:100%;min-height:64px}
.lye-props input[type=color]{width:42px;height:28px;padding:2px;border-radius:8px}
.lye-empty{color:var(--mute,#999);font-size:12px}
.lye-menu{position:fixed;z-index:9999;min-width:190px;padding:6px;border-radius:12px;background:rgba(28,30,36,.97);border:1px solid rgba(255,255,255,.12);box-shadow:0 10px 30px rgba(0,0,0,.5);display:flex;flex-direction:column}
.lye-menu button{border:0;box-shadow:none;color:inherit;text-align:left;height:30px;padding:0 10px;border-radius:8px;background:transparent;font-size:13px;display:flex;justify-content:space-between;gap:14px}
.lye-menu button:hover{background:rgba(255,255,255,.08)} .lye-menu small{opacity:.55}
`;
let cssOn = false;
function ensureCss() { if (cssOn || typeof document === 'undefined') return; cssOn = true; const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }

const uid = () => Math.random().toString(36).slice(2, 10);
const NAMES = { text: 'Text', image: 'Imagine', video: 'Video', shape: 'Formă' };
const V = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

/** A new layer with sensible defaults, in the middle of the screen. */
export function newLayer(type, extra = {}) {
  const base = { id: uid(), type, name: NAMES[type] || 'Strat', x: 30, y: 35, w: 40, h: 30, opacity: 1, hidden: false, locked: false, under: false, anim: 'fade' };
  if (type === 'text') Object.assign(base, { text: 'Text nou', font: 'Inter', size: 6, color: '#ffffff', weight: 700, align: 'center', valign: 'middle', shadow: true, y: 40, h: 20 });
  if (type === 'image' || type === 'video') Object.assign(base, { src: '', fit: 'contain' });
  if (type === 'shape') Object.assign(base, { shape: 'rect', bg: '#000000', bgAlpha: 0.6, radius: 1.5, border: '', borderW: 0, y: 78, h: 14, x: 0, w: 100 });
  return Object.assign(base, extra);
}

const rgba = (hex, a = 1) => { const n = parseInt(String(hex || '#000000').slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const kindKey = l => l.type + '|' + (l.src || '');

function make(l) {
  const el = document.createElement('div'); el.className = 'ly';
  if (l.type === 'image' && l.src) el.append(Object.assign(document.createElement('img'), { src: '/media/' + encodeURIComponent(l.src), alt: '', draggable: false }));
  if (l.type === 'video' && l.src) el.append(Object.assign(document.createElement('video'), { src: '/media/' + encodeURIComponent(l.src), autoplay: true, loop: true, muted: true, playsInline: true }));
  if (l.type === 'text') el.append(Object.assign(document.createElement('div'), { className: 'lt' }));
  el.append(Object.assign(document.createElement('i'), { className: 'h' }));
  return el;
}

function paint(el, l, editing) {
  const s = el.style;
  Object.assign(s, { left: l.x + '%', top: l.y + '%', width: l.w + '%', height: l.h + '%', opacity: l.opacity ?? 1,
    background: l.bg ? rgba(l.bg, l.bgAlpha ?? 1) : '', borderRadius: l.shape === 'ellipse' ? '50%' : (l.radius || 0) + 'cqh',
    border: l.border && l.borderW ? `${l.borderW}cqh solid ${l.border}` : '', justifyContent: V[l.valign] || 'center' });
  el.classList.toggle('off', !!(editing && l.hidden)); el.classList.toggle('locked', !!(editing && l.locked));
  if (l.type === 'text') {
    const t = el.querySelector('.lt'); t.textContent = l.text || '';
    Object.assign(t.style, { fontFamily: `"${l.font || 'Inter'}", "Segoe UI", Arial, sans-serif`, fontSize: (l.size || 6) + 'cqh', color: l.color || '#fff',
      fontWeight: l.weight || 700, textAlign: l.align || 'center', fontStyle: l.italic ? 'italic' : 'normal', textTransform: l.upper ? 'uppercase' : 'none',
      lineHeight: l.lineHeight || 1.25, textShadow: l.shadow ? '0 .3cqh 1.2cqh rgba(0,0,0,.85)' : 'none', padding: (l.pad ?? 1) + 'cqh' });
  }
  const m = el.querySelector('img,video'); if (m) m.style.objectFit = l.fit || 'contain';
}

const ANIM = { fade: [{ opacity: 0 }, {}], rise: [{ opacity: 0, transform: 'translateY(4cqh)' }, { transform: 'none' }],
  zoom: [{ opacity: 0, transform: 'scale(.85)' }, { transform: 'none' }], left: [{ opacity: 0, transform: 'translateX(-8cqw)' }, { transform: 'none' }] };

/**
 * Show `layers` in `box` (a .ly-box). Elements are kept by id, so a picture or video that stays from one slide to the
 * next is not reloaded; new ones come in with their own animation when `animate` is on.
 */
export function renderLayers(box, layers, { animate = false, editing = false } = {}) {
  ensureCss();
  const want = (layers || []).filter(l => editing || !l.hidden);
  const have = new Map([...box.children].filter(e => e.dataset.id).map(e => [e.dataset.id, e]));
  const keep = new Set();
  want.forEach((l, i) => {
    let el = have.get(l.id);
    if (el && el.dataset.k !== kindKey(l)) { el.remove(); el = null; }
    const fresh = !el;
    if (!el) { el = make(l); el.dataset.id = l.id; el.dataset.k = kindKey(l); }
    paint(el, l, editing);
    if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
    if (fresh && animate && ANIM[l.anim]) el.animate(ANIM[l.anim], { duration: 450, easing: 'cubic-bezier(.2,.7,.2,1)' });
    keep.add(l.id);
  });
  for (const [id, el] of have) if (!keep.has(id)) {
    if (animate && el.isConnected) el.animate([{}, { opacity: 0 }], { duration: 250 }).finished.then(() => el.remove(), () => el.remove());
    else el.remove();
  }
}

/** Keep only what a layer may hold (the hub does the same before saving). */
export function sameLayers(a, b) { return JSON.stringify(a || []) === JSON.stringify(b || []); }

const clone = o => JSON.parse(JSON.stringify(o));
const r1 = v => Math.round(v * 10) / 10;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * The editor: drag and resize on the preview, a list of layers (👁 🔒 ↑ ↓), the properties of the chosen one,
 * a right-click menu, Ctrl+Z / Ctrl+Shift+Z, Ctrl+D, Delete and the arrow keys.
 * `under` and `over` are .ly-box elements inside the preview (below and above the lyrics); `panel` gets the controls.
 * `extra` (optional) adds outside state (the lyrics look) to the undo history: { get(), set(v) }.
 */
export class LayerEditor {
  constructor({ under, over, panel, fonts = () => '', media = async () => [], onChange = () => {}, extra = null }) {
    ensureCss();
    Object.assign(this, { under, over, panel, fonts, media, onChange, extra, layers: [], selId: null, past: [], future: [], mediaList: [] });
    under.classList.add('ly-edit'); over.classList.add('ly-edit');
    panel.innerHTML = `<div class="lye"><div class="lye-tools">
        <button data-add="text" title="Un text oriunde pe ecran">＋ Text</button><button data-add="image" title="O imagine din Fundaluri">＋ Imagine</button>
        <button data-add="video" title="Un video din Fundaluri (fără sunet, în buclă)">＋ Video</button><button data-add="shape" title="Bandă, chenar, cerc">＋ Formă</button>
        <span style="flex:1"></span><button data-u="undo" title="Anulează (Ctrl+Z)">↶</button><button data-u="redo" title="Refă (Ctrl+Shift+Z)">↷</button></div>
      <div class="lye-list"></div><div class="lye-props"></div></div>`;
    this.list = panel.querySelector('.lye-list'); this.props = panel.querySelector('.lye-props');
    panel.querySelector('.lye-tools').onclick = e => {
      const a = e.target.closest('[data-add]')?.dataset.add, u = e.target.closest('[data-u]')?.dataset.u;
      if (a) this.add(a); if (u === 'undo') this.undo(); if (u === 'redo') this.redo();
    };
    for (const box of [under, over]) {
      box.addEventListener('pointerdown', e => this.drag(e));
      box.addEventListener('contextmenu', e => { const id = e.target.closest('.ly')?.dataset.id; if (!id) return; e.preventDefault(); e.stopPropagation(); this.select(id); this.menu(e.clientX, e.clientY); });
      box.addEventListener('dblclick', e => { const id = e.target.closest('.ly')?.dataset.id; if (!id) return; this.select(id); this.props.querySelector('textarea,select')?.focus(); });
    }
    this.list.addEventListener('click', e => {
      const row = e.target.closest('.lye-row'); if (!row) return; const id = row.dataset.id, b = e.target.closest('button')?.dataset.b;
      if (b === 'eye') this.update(id, l => { l.hidden = !l.hidden; });
      else if (b === 'lock') this.update(id, l => { l.locked = !l.locked; });
      else if (b === 'up') this.order(id, 1); else if (b === 'down') this.order(id, -1);
      else this.select(id);
    });
    this.list.addEventListener('contextmenu', e => { const id = e.target.closest('.lye-row')?.dataset.id; if (!id) return; e.preventDefault(); e.stopPropagation(); this.select(id); this.menu(e.clientX, e.clientY); });
  }
  /** Start editing these layers (a copy is kept; get() returns the result). */
  async set(layers) {
    this.layers = clone(layers || []); this.selId = null; this.past = []; this.future = [];
    this.render();
    try { this.mediaList = await this.media(); } catch { this.mediaList = []; }
    this.renderProps();
  }
  get() { return clone(this.layers); }
  snap() { return JSON.stringify({ l: this.layers, x: this.extra ? this.extra.get() : null }); }
  /** remember the state before a change (for ↶) */
  record() { this.past.push(this.snap()); if (this.past.length > 80) this.past.shift(); this.future = []; }
  restore(s) { const o = JSON.parse(s); this.layers = o.l; if (this.extra && o.x) this.extra.set(o.x); if (!this.layers.some(l => l.id === this.selId)) this.selId = null; this.render(); this.onChange(); }
  undo() { const s = this.past.pop(); if (!s) return; this.future.push(this.snap()); this.restore(s); }
  redo() { const s = this.future.pop(); if (!s) return; this.past.push(this.snap()); this.restore(s); }
  find(id) { return this.layers.find(l => l.id === id); }
  update(id, fn, rec = true) { const l = this.find(id); if (!l) return; if (rec) this.record(); fn(l); this.render(); this.onChange(); }
  add(type) {
    this.record();
    const l = newLayer(type);
    if ((type === 'image' || type === 'video') && this.mediaList.length) l.src = this.mediaList.find(f => (type === 'video') === /\.(mp4|webm|mov)$/i.test(f)) || '';
    this.layers.push(l); this.selId = l.id; this.render(); this.onChange();
  }
  remove(id) { this.record(); this.layers = this.layers.filter(l => l.id !== id); if (this.selId === id) this.selId = null; this.render(); this.onChange(); }
  duplicate(id) { const l = this.find(id); if (!l) return; this.record(); const c = { ...clone(l), id: uid(), name: l.name + ' (copie)', x: Math.min(95, l.x + 2), y: Math.min(95, l.y + 2) };
    this.layers.splice(this.layers.indexOf(l) + 1, 0, c); this.selId = c.id; this.render(); this.onChange(); }
  order(id, d) {                                       // d = +1 forward, -1 back, +99 front, -99 back
    const i = this.layers.findIndex(l => l.id === id); if (i < 0) return;
    const j = Math.max(0, Math.min(this.layers.length - 1, d > 1 ? this.layers.length - 1 : d < -1 ? 0 : i + d)); if (j === i) return;
    this.record(); const [l] = this.layers.splice(i, 1); this.layers.splice(j, 0, l); this.render(); this.onChange();
  }
  select(id) { this.selId = id; this.render(); }
  render() {
    renderLayers(this.under, this.layers.filter(l => l.under), { editing: true });
    renderLayers(this.over, this.layers.filter(l => !l.under), { editing: true });
    for (const el of [...this.under.children, ...this.over.children]) el.classList.toggle('sel', el.dataset.id === this.selId);
    this.list.innerHTML = this.layers.length ? this.layers.slice().reverse().map(l => `<div class="lye-row ${l.id === this.selId ? 'sel' : ''}" data-id="${l.id}">
        <button data-b="eye" class="${l.hidden ? 'off' : ''}" title="Arată / ascunde">👁</button><button data-b="lock" class="${l.locked ? '' : 'off'}" title="Blochează (nu se mai mută din greșeală)">🔒</button>
        <span class="nm">${esc(l.name)}${l.under ? ' <small style="opacity:.6">· sub versuri</small>' : ''}</span>
        <button data-b="up" title="Mai în față">↑</button><button data-b="down" title="Mai în spate">↓</button></div>`).join('')
      : '<p class="lye-empty">Niciun strat. Adaugă text, imagine, video sau o formă (de ex. o bandă sub versuri).</p>';
    this.renderProps();
  }
  renderProps() {
    const l = this.find(this.selId);
    if (!l) { this.props.innerHTML = this.layers.length ? '<p class="lye-empty">Clic pe un strat (pe ecran sau în listă) ca să-l editezi. Clic dreapta = comenzi rapide.</p>' : ''; return; }
    const opt = (v, t, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${t}</option>`;
    const media = this.mediaList.filter(f => (l.type === 'video') === /\.(mp4|webm|mov)$/i.test(f));
    const row = (label, html) => `<div class="lf"><span>${label}</span>${html}</div>`;
    let h = row('Nume', `<input type="text" data-k="name" value="${esc(l.name)}">`);
    if (l.type === 'text') {
      h += `<textarea data-k="text" spellcheck="false" placeholder="Textul">${esc(l.text)}</textarea>`;
      h += row('Font', `<select data-k="font">${this.fonts()}</select>`);
      h += row('Mărime', `<input type="range" data-k="size" data-n="1" min="1" max="30" step="0.2" value="${l.size}">`);
      h += row('Culoare', `<input type="color" data-k="color" value="${l.color}"><select data-k="weight" data-n="1">${[400, 500, 600, 700, 800].map(w => opt(w, { 400: 'Normal', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Foarte gros' }[w], l.weight)).join('')}</select>`);
      h += row('Aliniere', `<select data-k="align">${opt('left', 'Stânga', l.align)}${opt('center', 'Mijloc', l.align)}${opt('right', 'Dreapta', l.align)}</select><select data-k="valign">${opt('top', 'Sus', l.valign)}${opt('middle', 'Mijloc', l.valign)}${opt('bottom', 'Jos', l.valign)}</select>`);
      h += row('', `<label class="check"><input type="checkbox" data-k="italic" ${l.italic ? 'checked' : ''}> <i>Italic</i></label><label class="check"><input type="checkbox" data-k="upper" ${l.upper ? 'checked' : ''}> MAJ</label><label class="check"><input type="checkbox" data-k="shadow" ${l.shadow ? 'checked' : ''}> Umbră</label>`);
    }
    if (l.type === 'image' || l.type === 'video') {
      h += row(l.type === 'video' ? 'Video' : 'Imagine', `<select data-k="src">${opt('', media.length ? '— alege —' : '(încarcă întâi la Fundaluri)', l.src)}${media.map(f => opt(esc(f), esc(f), l.src)).join('')}</select>`);
      h += row('Încadrare', `<select data-k="fit">${opt('contain', 'Întreagă', l.fit)}${opt('cover', 'Umple caseta', l.fit)}</select>`);
    }
    if (l.type === 'shape') h += row('Formă', `<select data-k="shape">${opt('rect', 'Dreptunghi / bandă', l.shape)}${opt('ellipse', 'Cerc / elipsă', l.shape)}</select>`);
    h += row('Fundal', `<input type="color" data-k="bg" value="${l.bg || '#000000'}"><input type="range" data-k="bgAlpha" data-n="1" min="0" max="1" step="0.05" value="${l.bg ? l.bgAlpha ?? 1 : 0}" title="Cât de plin e fundalul">`);
    h += row('Colțuri', `<input type="range" data-k="radius" data-n="1" min="0" max="10" step="0.5" value="${l.radius || 0}">`);
    h += row('Chenar', `<input type="color" data-k="border" value="${l.border || '#ffffff'}"><input type="range" data-k="borderW" data-n="1" min="0" max="2" step="0.1" value="${l.borderW || 0}">`);
    h += row('Opacitate', `<input type="range" data-k="opacity" data-n="1" min="0" max="1" step="0.05" value="${l.opacity ?? 1}">`);
    h += row('Poziție', ['x', 'y', 'w', 'h'].map(k => `<input type="number" data-k="${k}" data-n="1" step="0.5" min="0" max="100" value="${l[k]}" title="${{ x: 'Stânga', y: 'Sus', w: 'Lățime', h: 'Înălțime' }[k]} (%)">`).join(''));
    h += row('Strat', `<select data-k="under">${opt('0', 'Peste versuri', l.under ? 1 : 0)}${opt('1', 'Sub versuri', l.under ? 1 : 0)}</select>`);
    h += row('Apare cu', `<select data-k="anim">${opt('none', 'Direct', l.anim)}${opt('fade', 'Stingere', l.anim)}${opt('rise', 'Ridicare', l.anim)}${opt('zoom', 'Zoom', l.anim)}${opt('left', 'Din stânga', l.anim)}</select>`);
    this.props.innerHTML = h;
    const fs = this.props.querySelector('[data-k=font]'); if (fs) { fs.value = l.font; if (fs.value !== l.font) fs.insertAdjacentHTML('afterbegin', opt(esc(l.font), esc(l.font), l.font)); }
    let lastKey = '', lastAt = 0;
    const apply = e => {
      const el = e.target, k = el.dataset.k; if (!k) return;
      let v = el.type === 'checkbox' ? el.checked : el.dataset.n ? +el.value : el.value;
      if (k === 'under') v = el.value === '1';
      const rec = !(k === lastKey && Date.now() - lastAt < 1200); lastKey = k; lastAt = Date.now();   // a slider moved = one ↶ step
      if (rec) this.record();
      if (k === 'bgAlpha' && !l.bg) l.bg = this.props.querySelector('[data-k=bg]').value;
      if (k === 'borderW' && !l.border) l.border = this.props.querySelector('[data-k=border]').value;
      l[k] = v;
      if (k === 'bg' && !(l.bgAlpha > 0)) l.bgAlpha = 1;
      if (k === 'border' && !(l.borderW > 0)) l.borderW = 0.3;
      if (['x', 'y', 'w', 'h'].includes(k)) l[k] = Math.max(0, Math.min(100, v));
      renderLayers(this.under, this.layers.filter(x => x.under), { editing: true });
      renderLayers(this.over, this.layers.filter(x => !x.under), { editing: true });
      for (const x of [...this.under.children, ...this.over.children]) x.classList.toggle('sel', x.dataset.id === this.selId);
      if (['name', 'under'].includes(k)) { const keep = this.props.scrollTop; this.render(); this.props.scrollTop = keep; }
      this.onChange();
    };
    this.props.oninput = apply; this.props.onchange = e => { if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') apply(e); };
  }
  drag(e) {
    const el = e.target.closest('.ly'); if (!el || e.button !== 0) return;
    const l = this.find(el.dataset.id); if (!l || l.locked) return;
    e.preventDefault(); e.stopPropagation(); this.select(l.id);
    const box = (l.under ? this.under : this.over).getBoundingClientRect(), resize = e.target.classList.contains('h');
    const start = { x: l.x, y: l.y, w: l.w, h: l.h }, x0 = e.clientX, y0 = e.clientY; let moved = false;
    const before = this.snap();
    const move = m => {
      const dx = (m.clientX - x0) / box.width * 100, dy = (m.clientY - y0) / box.height * 100, c = (v, a, b) => Math.min(b, Math.max(a, v));
      if (!moved && Math.abs(dx) + Math.abs(dy) < 0.3) return; moved = true;
      if (resize) { l.w = r1(c(start.w + dx, 2, 100 - start.x)); l.h = r1(c(start.h + dy, 2, 100 - start.y)); }
      else {                                              // snaps to the middle and the edges, like a design app
        let x = c(start.x + dx, -start.w + 2, 98), y = c(start.y + dy, -start.h + 2, 98);
        for (const [t, k] of [[50 - start.w / 2, 'x'], [0, 'x'], [100 - start.w, 'x']]) if (k === 'x' && Math.abs(x - t) < 1.2) x = t;
        for (const t of [50 - start.h / 2, 0, 100 - start.h]) if (Math.abs(y - t) < 1.2) y = t;
        l.x = r1(x); l.y = r1(y);
      }
      renderLayers(l.under ? this.under : this.over, this.layers.filter(x => !!x.under === !!l.under), { editing: true });
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (moved) { this.past.push(before); this.future = []; this.render(); this.onChange(); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  menu(x, y) {
    document.querySelector('.lye-menu')?.remove();
    const l = this.find(this.selId); if (!l) return;
    const m = document.createElement('div'); m.className = 'lye-menu';
    const items = [['dup', 'Duplică', 'Ctrl+D'], ['front', 'Adu în față', ''], ['fwd', 'Un pas în față', ''], ['back', 'Un pas în spate', ''], ['bottom', 'Trimite în spate', ''],
      ['under', l.under ? 'Pune peste versuri' : 'Pune sub versuri', ''], ['center', 'Centrează pe ecran', ''], ['full', 'Pe tot ecranul', ''],
      ['hide', l.hidden ? 'Arată' : 'Ascunde', ''], ['lock', l.locked ? 'Deblochează' : 'Blochează', ''], ['del', 'Șterge', 'Del']];
    m.innerHTML = items.map(([k, t, s]) => `<button data-m="${k}">${t}<small>${s}</small></button>`).join('');
    document.body.append(m);
    const r = m.getBoundingClientRect();
    Object.assign(m.style, { left: Math.min(x, innerWidth - r.width - 8) + 'px', top: Math.min(y, innerHeight - r.height - 8) + 'px' });
    const close = () => { m.remove(); window.removeEventListener('pointerdown', out, true); };
    const out = e => { if (!m.contains(e.target)) close(); };
    setTimeout(() => window.addEventListener('pointerdown', out, true), 0);
    m.onclick = e => {
      const k = e.target.closest('[data-m]')?.dataset.m; if (!k) return; close(); const id = l.id;
      if (k === 'dup') this.duplicate(id); if (k === 'del') this.remove(id);
      if (k === 'front') this.order(id, 99); if (k === 'bottom') this.order(id, -99); if (k === 'fwd') this.order(id, 1); if (k === 'back') this.order(id, -1);
      if (k === 'under') this.update(id, x => { x.under = !x.under; });
      if (k === 'center') this.update(id, x => { x.x = r1(50 - x.w / 2); x.y = r1(50 - x.h / 2); });
      if (k === 'full') this.update(id, x => { Object.assign(x, { x: 0, y: 0, w: 100, h: 100 }); });
      if (k === 'hide') this.update(id, x => { x.hidden = !x.hidden; }); if (k === 'lock') this.update(id, x => { x.locked = !x.locked; });
    };
  }
  /** Keys while the editor is open. Returns true when the key was used. */
  key(e) {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return false;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.shiftKey ? this.redo() : this.undo(); return true; }
    if (mod && e.key.toLowerCase() === 'y') { this.redo(); return true; }
    const l = this.find(this.selId); if (!l) return false;
    if (mod && e.key.toLowerCase() === 'd') { this.duplicate(l.id); return true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { this.remove(l.id); return true; }
    const step = e.shiftKey ? 5 : 0.5, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (d && !l.locked) { this.update(l.id, x => { x.x = r1(x.x + d[0]); x.y = r1(x.y + d[1]); }); return true; }
    return false;
  }
}
