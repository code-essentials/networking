const { contextBridge, ipcRenderer } = require('electron')

// Expose a small API to the renderer to receive log entries and end signal
contextBridge.exposeInMainWorld('electron', {
  onLogEntry: (cb) => ipcRenderer.on('log-entry', (event, entry) => cb(entry)),
  onLogEnd: (cb) => ipcRenderer.on('log-end', (event) => cb())
})
