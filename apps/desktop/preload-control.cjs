// Gives the control page a few desktop-only abilities.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bnc', {
  webSearch: q => ipcRenderer.send('bnc:web-search', String(q)),
  version: 2,
  openScreen: (kind, base) => ipcRenderer.send('bnc:open-screen', kind, base || ''),
  onImport: cb => ipcRenderer.on('bnc:imported', (_e, data) => cb(data)),
});
