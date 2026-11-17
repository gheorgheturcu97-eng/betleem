// Gives the control page a few desktop-only abilities.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bnc', {
  webSearch: q => ipcRenderer.send('bnc:web-search', String(q)),
  openScreen: kind => ipcRenderer.send('bnc:open-screen', kind),
  onImport: cb => ipcRenderer.on('bnc:imported', (_e, data) => cb(data)),
});
