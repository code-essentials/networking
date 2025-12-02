const { app, BrowserWindow, Menu, dialog } = require('electron')
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

  const template = [fileMenu]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
