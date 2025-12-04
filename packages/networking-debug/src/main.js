const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron')
const path = require('path')

// Parser module will only read stdin if it's piped (parser.js checks process.stdin.isTTY)
const parser = require('./parser')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'index.html'))
}

app.whenReady().then(() => {
  createWindow()

  // Forward parser events to renderer
  parser.on('entry', (entry) => {
    if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('log-entry', entry)
  })

  parser.on('end', () => {
    if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('log-end')
  })

  // After window is ready, send any buffered LOG entries so that file-open
  // feeding (or earlier stdin reads) are reflected in UI immediately.
  mainWindow.webContents.once('did-finish-load', () => {
    if (Array.isArray(parser.LOG) && parser.LOG.length) {
      for (const e of parser.LOG) mainWindow.webContents.send('log-entry', e)
    }
  })

  // If Electron was launched with --stdin-file=..., feed that file into parser
  const stdinArg = process.argv.find(a => a.startsWith('--stdin-file='))
  const stdinFile = stdinArg ? stdinArg.split('=')[1] : null
  if (stdinFile) {
    const fs = require('fs')
    const rl = require('readline').createInterface({ input: fs.createReadStream(stdinFile), crlfDelay: Infinity })
    rl.on('line', (line) => parser.feed(line))
  }

  // Build a simple File menu with Open disabled if stdin already produced records
  const fileMenu = {
    label: 'File',
    submenu: [
      {
        label: 'Open...',
        accelerator: 'CmdOrCtrl+O',
        enabled: !(stdinFile || (Array.isArray(parser.LOG) && parser.LOG.length > 0)),
        click: async () => {
          const res = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'Logs', extensions: ['log', 'txt'] }, { name: 'All', extensions: ['*'] }]
          })
          if (res.canceled || !res.filePaths || res.filePaths.length === 0) return
          const file = res.filePaths[0]
          const fs = require('fs')
          const rl = require('readline').createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })
          rl.on('line', (line) => parser.feed(line))
        }
      },
      { type: 'separator' },
      { role: 'quit' }
    ]
  }

  // Visibility state for different statuses; defaults to show all
  const visibility = {
    info: true,
    success: true,
    timeout: true,
    pending: true,
    other: true
  }

  // Visibility menu
  const visibilityMenu = {
    label: 'View',
    submenu: [
      { label: 'Show INFO', type: 'checkbox', checked: visibility.info, id: 'vis-info', click: (item) => { visibility.info = item.checked; broadcastVisibility('info', item.checked) } },
      { label: 'Show SUCCESS', type: 'checkbox', checked: visibility.success, id: 'vis-success', click: (item) => { visibility.success = item.checked; broadcastVisibility('success', item.checked) } },
      { label: 'Show TIMEOUT', type: 'checkbox', checked: visibility.timeout, id: 'vis-timeout', click: (item) => { visibility.timeout = item.checked; broadcastVisibility('timeout', item.checked) } },
      { label: 'Show PENDING', type: 'checkbox', checked: visibility.pending, id: 'vis-pending', click: (item) => { visibility.pending = item.checked; broadcastVisibility('pending', item.checked) } },
      { label: 'Show OTHER', type: 'checkbox', checked: visibility.other, id: 'vis-other', click: (item) => { visibility.other = item.checked; broadcastVisibility('other', item.checked) } }
    ]
  }

  const template = [fileMenu, visibilityMenu]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  // Helper to notify renderer of visibility changes
  function broadcastVisibility(name, checked) {
    if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('visibility-changed', { name, checked })
  }

  // Listen for visibility changes from renderer to update menu checkbox state
  ipcMain.on('set-visibility', (event, { name, checked }) => {
    if (visibility.hasOwnProperty(name)) {
      visibility[name] = checked
      // Update menu item if present
      try {
        const menuItem = menu.getMenuItemById(`vis-${name}`)
        if (menuItem) menuItem.checked = checked
      } catch (_) {}
      broadcastVisibility(name, checked)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
