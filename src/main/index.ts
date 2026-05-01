import { app, shell, BrowserWindow, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerFileIpc } from './ipc/files'
import { registerProjectIpc } from './ipc/project'
import { registerExportIpc } from './ipc/export'
import { registerAiIpc } from './ipc/ai'
import { registerEmbedIpc, shutdownExifTool } from './ipc/embed'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'snfile',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'SN Metadata Auto',
    backgroundColor: '#fff7f0',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.snmetadataauto')

  // Register a custom protocol that streams local files (for previews) so we
  // don't have to read the entire file into base64 just to render an <img>.
  protocol.handle('snfile', (request) => {
    const url = new URL(request.url)
    // url.pathname is like "//C:/path/file.png" on Windows or "/home/x/file.png"
    const raw = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    const filePath = process.platform === 'win32' ? raw : '/' + raw
    return net.fetch(pathToFileURL(filePath).toString())
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerFileIpc()
  registerProjectIpc()
  registerExportIpc()
  registerAiIpc()
  registerEmbedIpc()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  // Stop the persistent exiftool child process before quitting so it doesn't
  // outlive the renderer window on platforms that keep the app alive.
  await shutdownExifTool()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  await shutdownExifTool()
})
