import { app, shell, BrowserWindow, protocol } from 'electron'
import { join, extname } from 'path'
import { promises as fs } from 'fs'
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

const PREVIEW_MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml'
}

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
  // We read the file directly via fs so behavior is identical across dev /
  // production / Windows / Linux without depending on Electron's file://
  // URL handling under the privileged scheme.
  protocol.handle('snfile', async (request) => {
    try {
      const url = new URL(request.url)
      let raw = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      // url.pathname is like "/C:/path/file.png" on Windows or "/home/x/file.png".
      // After stripping the leading slashes we have a Windows path with a
      // drive letter, or a POSIX path that needs its leading slash restored.
      if (process.platform !== 'win32') raw = '/' + raw
      const data = await fs.readFile(raw)
      const ext = extname(raw).slice(1).toLowerCase()
      const mime = PREVIEW_MIME_BY_EXT[ext] ?? 'application/octet-stream'
      return new Response(new Uint8Array(data), {
        headers: { 'content-type': mime, 'cache-control': 'no-cache' }
      })
    } catch (err) {
      console.error('snfile preview fetch failed:', err)
      return new Response('Not found', { status: 404 })
    }
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
