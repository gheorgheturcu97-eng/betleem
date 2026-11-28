// Shared browser client: connects to the hub, reconnects automatically,
// keeps the latest state and lets pages send commands.
export function connect(onState, onEvent = () => {}) {
  let ws, state = null, role = 'viewer', retry = 500;
  const pin = () => { try { return localStorage.getItem('bnc-pin') || ''; } catch { return ''; } };

  function open() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { retry = 500; onEvent({ type: 'online' }); if (pin()) ws.send(JSON.stringify({ type: 'login', pin: pin() })); };
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.state) { state = m.state; onState(state); }
      if (m.role) role = m.role;
      onEvent(m);
    };
    ws.onclose = () => { onEvent({ type: 'offline' }); setTimeout(open, retry); retry = Math.min(retry * 2, 5000); };
  }
  open();

  return {
    send: o => ws?.readyState === 1 && ws.send(JSON.stringify(o)),
    login: p => { try { localStorage.setItem('bnc-pin', p); } catch {} ws.send(JSON.stringify({ type: 'login', pin: p })); },
    pin, get state() { return state; }, get role() { return role; },
  };
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Paint a background (image or video file from /media) into an element. */
export function paintBackground(el, name) {
  if (el.dataset.bg === (name || '')) return;
  el.dataset.bg = name || '';
  el.innerHTML = '';
  if (!name) return;
  const src = '/media/' + encodeURIComponent(name);
  if (/\.(mp4|webm|mov)$/i.test(name)) {
    const v = Object.assign(document.createElement('video'), { src, autoplay: true, loop: true, muted: true, playsInline: true });
    el.append(v);
  } else {
    const i = Object.assign(document.createElement('img'), { src, alt: '' });
    el.append(i);
  }
}

/** True in the projector / stage window of the desktop app (not a preview inside Live, not a phone or a TV browser). */
export const isOutputWindow = () => window.top === window && /Electron/.test(navigator.userAgent);
/** 🖥 The output window says it is open, and closes itself when the operator asks (double-click on its preview in Live)
 *  (Esc on the projector window does nothing: it must never close by mistake.) */
export function outputEvents(kind, hubRef) {
  return m => {
    if (!isOutputWindow()) return;
    if (m.type === 'online') setTimeout(() => hubRef()?.send({ type: 'screenHere', kind }), 0);
    if (m.type === 'closeScreen' && m.kind === kind) window.close();
  };
}

/** Keep the screen awake on phones / projector PCs where supported. */
export async function stayAwake() {
  try { await navigator.wakeLock?.request('screen'); } catch {}
  document.addEventListener('visibilitychange', () => { if (!document.hidden) navigator.wakeLock?.request('screen').catch(() => {}); });
}
