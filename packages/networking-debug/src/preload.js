const { contextBridge, ipcRenderer } = require('electron')

// Expose a small API to the renderer to receive log entries and end signal,
// and to communicate visibility changes with the main process.
contextBridge.exposeInMainWorld('electron', {
  onLogEntry: (cb) => ipcRenderer.on('log-entry', (event, entry) => cb(entry)),
  onLogEnd: (cb) => ipcRenderer.on('log-end', (event) => cb()),
  // Listen for visibility changes triggered from the native menu
  onVisibilityChange: (cb) => ipcRenderer.on('visibility-changed', (event, payload) => cb(payload)),
  // Send visibility changes from renderer UI to main so menu stays in sync
  setVisibility: (name, checked) => ipcRenderer.send('set-visibility', { name, checked })
})
