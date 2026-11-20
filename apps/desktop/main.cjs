// Bethlehem — desktop app (Electron)
// Starts the Local Hub inside the app, opens the control window, and puts the
// main / stage screens full-screen on the monitors you choose. Phones on the
// church Wi-Fi still connect to http://<this-pc>:4545 as before.

const { app, BrowserWindow, Menu, screen, ipcMain, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

const PORT = 4545;
const BASE = `http://localhost:${PORT}`;
const APP_DIR = __dirname;
const BUILTIN_HUB = path.join(APP_DIR, 'hub');

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// ---------------------------------------------------------------- data + settings
const DATA_DIR = path.join(app.getPath('documents'), 'Betleem');
// first versions kept data in Documents\Bethlehem — move it over once
const OLD_DIR = path.join(app.getPath('documents'), 'Bethlehem');
if (!fs.existsSync(DATA_DIR) && fs.existsSync(OLD_DIR)) { try { fs.renameSync(OLD_DIR, DATA_DIR); } catch {} }
const MEDIA_DIR = path.join(DATA_DIR, 'media');
// Updates: a newer hub can be dropped in Documents/Betleem/update/hub (no reinstall, no re-signing on Mac).
// If it fails to start, the hub inside the app is used.
const UPDATE_HUB = path.join(DATA_DIR, 'update', 'hub');
let HUB = fs.existsSync(path.join(UPDATE_HUB, 'src', 'server.js')) ? UPDATE_HUB : BUILTIN_HUB;
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const pin = () => String(crypto.randomInt(1000, 9999));
let settings = {};
try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch {}
settings = { pin: pin(), leaderPin: pin(), mainDisplay: null, stageDisplay: null, ...settings };
const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
saveSettings();

// ship the built-in backgrounds into the user's media folder (never overwrite theirs)
const BG_SRC = path.join(APP_DIR, 'backgrounds');
for (const f of fs.existsSync(BG_SRC) ? fs.readdirSync(BG_SRC) : []) {
  const dst = path.join(MEDIA_DIR, f);
  if (!fs.existsSync(dst)) fs.copyFileSync(path.join(BG_SRC, f), dst);
}

process.env.DATA_DIR = DATA_DIR;

// An error must never close Betleem on a Sunday: write it down (Documents\Betleem\erori.log) and keep going.
function logError(where, err) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(path.join(DATA_DIR, 'erori.log'), `[${new Date().toISOString()}] ${where}: ${err && err.stack || err}\n`);
  } catch {}
}
process.on('uncaughtException', e => logError('main', e));
process.on('unhandledRejection', e => logError('main (promise)', e));
process.env.PORT = String(PORT);
process.env.PIN = settings.pin;
process.env.LEADER_PIN = settings.leaderPin;
process.env.TRUST_LOCALHOST = '1';

let hub = null;           // the server module
let control = null;       // control window
const outputs = {};       // { main, stage } BrowserWindows

// ---------------------------------------------------------------- displays
function displays() { return screen.getAllDisplays(); }
function displayFor(kind) {
  const all = displays();
  const wanted = all.find(d => d.id === settings[kind + 'Display']);
  if (wanted) return wanted;
  const primary = screen.getPrimaryDisplay();
  const others = all.filter(d => d.id !== primary.id);
  if (kind === 'main') return others[0] || primary;          // projector = first extra monitor
  return others[1] || others[0] || primary;                  // stage = second extra monitor
}
function displayLabel(d, i) {
  const primary = d.id === screen.getPrimaryDisplay().id;
  return `Ecran ${i + 1}${primary ? ' (principal Windows)' : ''} – ${d.size.width}×${d.size.height}`;
}

// base: the Betleem whose program the screens show (this computer, or the one it joined in the network)
const cleanBase = b => { try { const u = new URL(b); return /^https?:$/.test(u.protocol) ? u.origin : BASE; } catch { return BASE; } };
function openOutput(kind, base = BASE) {
  const d = displayFor(kind);
  const url = `${cleanBase(base)}/${kind === 'main' ? 'main' : 'stage'}.html`;
  let w = outputs[kind];
  if (w && !w.isDestroyed() && w.webContents.getURL() !== url) w.loadURL(url);
  if (!w || w.isDestroyed()) {
    w = outputs[kind] = new BrowserWindow({
      x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
      frame: false, backgroundColor: '#000000', show: false, autoHideMenuBar: true,
      title: kind === 'main' ? 'Ecran principal' : 'Ecran scenă',
      webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    w.loadURL(url);
    w.once('ready-to-show', () => w.show());
    w.on('closed', () => { delete outputs[kind]; buildMenu(); });
  }
  w.setBounds(d.bounds);
  // full screen only when it is NOT the monitor with the control window
  const controlDisplay = control ? screen.getDisplayMatching(control.getBounds()) : null;
  w.setFullScreen(!controlDisplay || controlDisplay.id !== d.id);
  if (controlDisplay && controlDisplay.id === d.id) { w.setBounds({ ...d.workArea, width: Math.round(d.workArea.width / 2), height: Math.round(d.workArea.width / 2 * 9 / 16) }); }
  buildMenu();
}
function closeOutput(kind) { outputs[kind]?.close(); }

const controlBase = () => { try { return new URL(control.webContents.getURL()).origin; } catch { return BASE; } };

// ---------------------------------------------------------------- web search window
function openWebSearch(query) {
  const w = new BrowserWindow({
    width: 1200, height: 860, title: 'Caută versuri – Echipa Betleem', autoHideMenuBar: true,
    webPreferences: { preload: path.join(APP_DIR, 'preload-web.cjs'), contextIsolation: true, sandbox: true, partition: 'persist:web' },
  });
  w.webContents.setWindowOpenHandler(({ url }) => { w.loadURL(url); return { action: 'deny' }; });  // keep everything in this window
  w.loadURL('https://duckduckgo.com/?q=' + encodeURIComponent(query + ' versuri') + '&kl=ro-ro');
}

ipcMain.on('bnc:web-search', (_e, q) => openWebSearch(String(q || '').slice(0, 200)));
ipcMain.on('bnc:open-screen', (_e, kind, base) => openOutput(kind === 'stage' ? 'stage' : 'main', base || BASE));
ipcMain.on('bnc:import', (e, data) => {
  try {
    const url = String(data.url || '');
    let title = String(data.title || '').split(/\s[|\-–—]\s/)[0].trim();
    let body = '';
    if (data.kind === 'selection') body = String(data.text || '');
    else {
      const found = hub.extractLyrics(String(data.html || ''), new URL(url).hostname);
      body = found.body; title = found.title || title;
    }
    body = hub.core.normalizeImported(body);
    control?.webContents.send('bnc:imported', { title, body, source: url });
    if (control) { if (control.isMinimized()) control.restore(); control.focus(); }
    e.sender.send('bnc:import-done', { ok: !!body });
  } catch (err) {
    e.sender.send('bnc:import-done', { ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------- FreeShow import
async function importFreeShow() {
  const def = path.join(app.getPath('documents'), 'FreeShow', 'Shows');
  let dir = def;
  if (!fs.existsSync(dir)) {
    const r = await dialog.showOpenDialog(control, { title: 'Alege folderul FreeShow\\Shows', properties: ['openDirectory'] });
    if (r.canceled) return; dir = r.filePaths[0];
  }
  const { convertShow } = await import(pathToFileURL(path.join(HUB, 'tools', 'import-freeshow.js')).href);
  const songs = [];
  for (const f of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.show'))) {
    try { const s = convertShow(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), f); if (s) songs.push(s); } catch {}
  }
  const added = hub.addSongs(songs);
  dialog.showMessageBox(control, { title: 'Echipa Betleem', type: 'info', message: `Am adăugat ${added} cântări noi din FreeShow.`, detail: added ? '' : 'Toate cântările erau deja în bibliotecă.' });
}

// ---------------------------------------------------------------- menu
function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${PORT}`);
}
function buildMenu() {
  const ds = displays();
  const pick = kind => ds.map((d, i) => ({
    label: displayLabel(d, i), type: 'radio', checked: displayFor(kind).id === d.id,
    click: () => { settings[kind + 'Display'] = d.id; saveSettings(); if (outputs[kind]) openOutput(kind, controlBase()); else buildMenu(); },
  }));
  const page = id => () => control?.webContents.executeJavaScript(`document.getElementById('${id}')?.click()`).catch(() => {});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu', label: 'Echipa Betleem' }] : []),
    { label: 'Editare', submenu: [   // Ctrl on Windows, ⌘ on Mac; undo/redo are handled by the page so text boxes keep their own undo
      { label: 'Anulează', accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: page('bUndo') },
      { label: 'Refă', accelerator: 'CmdOrCtrl+Shift+Z', registerAccelerator: false, click: page('bRedo') },
      { type: 'separator' },
      { role: 'cut', label: 'Taie' }, { role: 'copy', label: 'Copiază' }, { role: 'paste', label: 'Lipește' }, { role: 'selectAll', label: 'Selectează tot' },
      { type: 'separator' },
      { label: 'Scurtături de tastatură', accelerator: 'CmdOrCtrl+/', registerAccelerator: false, click: page('bKeys') },
    ] },
    { label: 'Ecrane', submenu: [
      { label: outputs.main ? 'Închide ecranul principal' : 'Deschide ecranul principal', accelerator: 'F2', click: () => outputs.main ? closeOutput('main') : openOutput('main', controlBase()) },
      { label: outputs.stage ? 'Închide ecranul de scenă' : 'Deschide ecranul de scenă', accelerator: 'F3', click: () => outputs.stage ? closeOutput('stage') : openOutput('stage', controlBase()) },
      { type: 'separator' },
      { label: 'Ecranul principal pe…', submenu: pick('main') },
      { label: 'Ecranul de scenă pe…', submenu: pick('stage') },
    ] },
    { label: 'Cântări', submenu: [
      { label: 'Importă din FreeShow', click: importFreeShow },
      { label: 'Deschide folderul cu fundaluri', click: () => shell.openPath(MEDIA_DIR) },
      { label: 'Deschide folderul cu date', click: () => shell.openPath(DATA_DIR) },
    ] },
    { label: 'Telefoane', submenu: [
      { label: 'Adrese și PIN-uri…', click: () => dialog.showMessageBox(control, { title: 'Echipa Betleem',
        type: 'info', message: 'Telefoanele din aceeași rețea Wi-Fi',
        detail: `Deschide în browserul telefonului:\n${lanAddresses().join('\n') || '(nu ești conectat la o rețea)'}\n\nPIN operator: ${settings.pin}\nPIN lider: ${settings.leaderPin}\n\nPIN-urile se pot schimba în ${SETTINGS_FILE}`,
      }) },
    ] },
    { label: 'Vizualizare', submenu: [
      { role: 'reload', label: 'Reîncarcă' }, { role: 'togglefullscreen', label: 'Ecran complet' },
      { role: 'zoomIn', label: 'Mărește' }, { role: 'zoomOut', label: 'Micșorează' }, { role: 'resetZoom', label: 'Mărime normală' },
      { type: 'separator' }, { role: 'toggleDevTools', label: 'Instrumente dezvoltator' },
    ] },
  ]));
}

// ---------------------------------------------------------------- start
app.on('second-instance', () => { if (control) { if (control.isMinimized()) control.restore(); control.focus(); } });

app.whenReady().then(async () => {
  try {
    try {
      hub = await import(pathToFileURL(path.join(HUB, 'src', 'server.js')).href);
      await hub.ready;
    } catch (err) {
      if (HUB === BUILTIN_HUB || err.code === 'EADDRINUSE') throw err;
      logError('actualizarea din update/hub nu pornește, folosesc versiunea din aplicație', err);
      HUB = BUILTIN_HUB;
      hub = await import(pathToFileURL(path.join(HUB, 'src', 'server.js')).href);
      await hub.ready;
    }
  } catch (err) {
    dialog.showErrorBox('Betleem nu poate porni',
      err.code === 'EADDRINUSE'
        ? 'Betleem este deja deschis, sau rulează încă versiunea veche (fereastra neagră start-windows.bat).\n\nÎnchide-o și pornește din nou.'
        : String(err.stack || err));
    app.quit(); return;
  }

  control = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700, title: 'Echipa Betleem', backgroundColor: '#121316', show: false,
    icon: path.join(APP_DIR, 'icon.png'),
    webPreferences: { preload: path.join(APP_DIR, 'preload-control.cjs'), contextIsolation: true, sandbox: true },
  });
  control.webContents.setWindowOpenHandler(({ url }) => {
    const plain = url.split(/[?#]/)[0];
    if (plain.endsWith('/main.html')) { openOutput('main', new URL(url).origin); return { action: 'deny' }; }
    if (plain.endsWith('/stage.html')) { openOutput('stage', new URL(url).origin); return { action: 'deny' }; }
    if (/^https?:/.test(url) && !url.startsWith(BASE)) shell.openExternal(url);
    return { action: 'deny' };
  });
  control.loadURL(`${BASE}/control.html`);
  // if the window's page crashes or freezes, note it and load it again
  control.webContents.on('render-process-gone', (_e, d) => { logError('fereastra de control', d.reason + ' ' + d.exitCode); if (d.reason !== 'clean-exit') setTimeout(() => control?.loadURL(`${BASE}/control.html`), 500); });
  control.on('unresponsive', () => logError('fereastra de control', 'nu răspunde'));
  control.once('ready-to-show', () => { control.maximize(); control.show(); });
  if (process.env.BNC_SMOKE) {            // automated check: screenshot the control window + main screen, then quit
    setTimeout(async () => {
      openOutput('main');
      await new Promise(r => setTimeout(r, 2500));
      fs.writeFileSync(path.join(process.env.BNC_SMOKE, 'control.png'), (await control.webContents.capturePage()).toPNG());
      if (outputs.main) fs.writeFileSync(path.join(process.env.BNC_SMOKE, 'main.png'), (await outputs.main.webContents.capturePage()).toPNG());
      app.quit();
    }, 3000);
  }
  control.on('closed', () => app.quit());
  buildMenu();
  screen.on('display-added', buildMenu);
  screen.on('display-removed', buildMenu);
});

app.on('window-all-closed', () => app.quit());
