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

/** Keep the screen awake on phones / projector PCs where supported. */
export async function stayAwake() {
  try { await navigator.wakeLock?.request('screen'); } catch {}
  document.addEventListener('visibilitychange', () => { if (!document.hidden) navigator.wakeLock?.request('screen').catch(() => {}); });
}
