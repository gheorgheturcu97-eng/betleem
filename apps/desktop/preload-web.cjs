// Runs on every web page in the search window and adds a small floating
// "Importă în Bethlehem" bar. The page itself never gets access to the app.
const { ipcRenderer } = require('electron');

function bar() {
  if (document.getElementById('__bnc_bar') || !document.body) return;
  const host = document.createElement('div');
  host.id = '__bnc_bar';
  host.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `
    <style>
      .b{font:600 14px system-ui,Segoe UI,sans-serif;display:flex;gap:6px;align-items:center;background:#121316;color:#fff;
         padding:8px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35)}
      button{font:inherit;border:0;border-radius:8px;padding:9px 12px;cursor:pointer;background:#2a2d33;color:#fff}
      button.go{background:#f5b301;color:#000}
      span{padding:0 6px;font-weight:500;color:#c8ccd2;max-width:260px}
    </style>
    <div class="b">
      <span id="m">Betleem</span>
      <button class="go" id="page" title="Găsește automat versurile pe această pagină">Importă versurile</button>
      <button id="sel" title="Selectează întâi versurile cu mouse-ul">Importă textul selectat</button>
    </div>`;
  const msg = t => { root.getElementById('m').textContent = t; };
  root.getElementById('page').onclick = () => {
    msg('Se importă…');
    ipcRenderer.send('bnc:import', { kind: 'page', html: document.documentElement.outerHTML, title: document.title, url: location.href });
  };
  root.getElementById('sel').onclick = () => {
    const text = String(window.getSelection() || '').trim();
    if (!text) return msg('Selectează întâi versurile');
    msg('Se importă…');
    ipcRenderer.send('bnc:import', { kind: 'selection', text, title: document.title, url: location.href });
  };
  // keep the selection when clicking the bar
  root.querySelectorAll('button').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
  ipcRenderer.on('bnc:import-done', (_e, r) => msg(r.ok ? '✓ Trimis în Betleem' : 'Nu am găsit versuri. Selectează-le și apasă „textul selectat”.'));
  document.documentElement.appendChild(host);
}

window.addEventListener('DOMContentLoaded', bar);
setInterval(bar, 1500); // some sites rebuild the page
