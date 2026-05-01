import { app, shell, BrowserWindow, protocol } from 'electron'
import { join, extname } from 'path'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerFileIpc } from './ipc/files'
import { registerProjectIpc } from './ipc/project'
import { registerExportIpc } from './ipc/export'
import { registerAiIpc } from './ipc/ai'
import { registerEmbedIpc, shutdownExifTool } from './ipc/embed'
import {
  registerVectorPreviewIpc,
  cleanupVectorPreviewCache
} from './ipc/media/renderVectorPreview'
import { registerCryptoIpc } from './ipc/crypto'

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
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  webm: 'video/webm'
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
  //
  // Range requests are honored so that a <video> element pointed at this
  // protocol can fetch just the moov atom + the bytes around its current
  // seek position rather than downloading the whole file. Without this, a
  // 200MB MP4 would have to fully buffer before we could capture a poster
  // frame in the renderer.
  protocol.handle('snfile', async (request) => {
    try {
      const url = new URL(request.url)
      let raw = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      // url.pathname is like "/C:/path/file.png" on Windows or "/home/x/file.png".
      // After stripping the leading slashes we have a Windows path with a
      // drive letter, or a POSIX path that needs its leading slash restored.
      if (process.platform !== 'win32') raw = '/' + raw
      const ext = extname(raw).slice(1).toLowerCase()
      const mime = PREVIEW_MIME_BY_EXT[ext] ?? 'application/octet-stream'

      const stats = await stat(raw)
      const total = stats.size
      const rangeHeader = request.headers.get('range')
      const m = rangeHeader ? /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim()) : null

      if (m) {
        const start = parseInt(m[1], 10)
        const end = m[2] && m[2].length > 0 ? Math.min(parseInt(m[2], 10), total - 1) : total - 1
        if (Number.isNaN(start) || start >= total || start > end) {
          return new Response('Range not satisfiable', {
            status: 416,
            headers: { 'content-range': `bytes */${total}` }
          })
        }
        const stream = createReadStream(raw, { start, end })
        return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
          status: 206,
          headers: {
            'content-type': mime,
            'content-length': String(end - start + 1),
            'content-range': `bytes ${start}-${end}/${total}`,
            'accept-ranges': 'bytes',
            'cache-control': 'no-cache'
          }
        })
      }

      const stream = createReadStream(raw)
      return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
        headers: {
          'content-type': mime,
          'content-length': String(total),
          'accept-ranges': 'bytes',
          'cache-control': 'no-cache'
        }
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
  registerVectorPreviewIpc()
  // Fire-and-forget: don't block window creation on cache pruning.
  void cleanupVectorPreviewCache()
  registerCryptoIpc()

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
