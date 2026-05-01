import { dialog, ipcMain, BrowserWindow, nativeImage } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'

const SUPPORTED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'avi', 'webm', 'svg', 'eps']

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  webm: 'video/webm',
  eps: 'application/postscript'
}

interface SelectedFile {
  path: string
  name: string
  size: number
  ext: string
}

async function statFile(p: string): Promise<SelectedFile | null> {
  try {
    const stat = await fs.stat(p)
    if (!stat.isFile()) return null
    const name = path.basename(p)
    const ext = path.extname(name).slice(1).toLowerCase()
    return { path: p, name, size: stat.size, ext }
  } catch {
    return null
  }
}

async function walkFolder(dir: string, acc: string[]): Promise<void> {
  let entries: import('fs').Dirent[] = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      await walkFolder(full, acc)
    } else if (e.isFile()) {
      const ext = path.extname(e.name).slice(1).toLowerCase()
      if (SUPPORTED_EXTS.includes(ext)) acc.push(full)
    }
  }
}

export function registerFileIpc(): void {
  ipcMain.handle('files:select', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const opts: Electron.OpenDialogOptions = {
      title: 'Select files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Supported', extensions: SUPPORTED_EXTS },
        { name: 'All Files', extensions: ['*'] }
      ]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled) return []
    const stats = await Promise.all(res.filePaths.map(statFile))
    return stats.filter((s): s is SelectedFile => s !== null)
  })

  ipcMain.handle('files:select-folder', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const opts: Electron.OpenDialogOptions = {
      title: 'Select folder',
      properties: ['openDirectory']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) return []
    const out: string[] = []
    await walkFolder(res.filePaths[0], out)
    const stats = await Promise.all(out.map(statFile))
    return stats.filter((s): s is SelectedFile => s !== null)
  })

  ipcMain.handle('files:select-folder-path', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? undefined
    const opts: Electron.OpenDialogOptions = {
      title: 'Choose output folder',
      properties: ['openDirectory', 'createDirectory']
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || res.filePaths.length === 0) return { ok: false }
    return { ok: true, path: res.filePaths[0] }
  })

  ipcMain.handle('files:stat', async (_e, paths: string[]) => {
    const stats = await Promise.all(paths.map(statFile))
    return stats.filter((s): s is SelectedFile => s !== null)
  })

  ipcMain.handle('files:read-base64', async (_e, p: string) => {
    try {
      const buf = await fs.readFile(p)
      const ext = path.extname(p).slice(1).toLowerCase()
      const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
      return { ok: true, data: buf.toString('base64'), mime }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  // Returns a small PNG data URL suitable for use as an <img> thumbnail. We
  // resize via Electron's nativeImage on the main process so we don't have to
  // ship the entire file into the renderer for every preview tile, and so we
  // can keep memory bounded for large folders. SVG/EPS aren't decoded by
  // nativeImage; for SVG we still return the raw bytes as a data URL because
  // browsers can render SVG markup directly. EPS / video previews fall back
  // to the placeholder icon.
  ipcMain.handle(
    'files:read-thumbnail',
    async (_e, req: { path: string; maxSize?: number }) => {
      try {
        const ext = path.extname(req.path).slice(1).toLowerCase()
        if (ext === 'svg') {
          const buf = await fs.readFile(req.path)
          return {
            ok: true,
            dataUrl: `data:image/svg+xml;base64,${buf.toString('base64')}`
          }
        }
        if (!['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) {
          return { ok: false, error: `unsupported preview format: ${ext}` }
        }
        const max = Math.max(32, Math.min(512, req.maxSize ?? 192))
        const img = nativeImage.createFromPath(req.path)
        if (img.isEmpty()) {
          return { ok: false, error: 'nativeImage decoded empty bitmap' }
        }
        const { width, height } = img.getSize()
        // Preserve aspect ratio: shrink by the longer edge so neither side
        // exceeds the requested max. Skip the resize when the source is
        // already smaller than the target so we don't upscale.
        const longest = Math.max(width, height)
        const resized = longest > max ? img.resize({ quality: 'good', width: Math.round((width / longest) * max), height: Math.round((height / longest) * max) }) : img
        return { ok: true, dataUrl: resized.toDataURL() }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'files:rename',
    async (
      _e,
      req: {
        fromPath: string
        toFilename: string
        backup: boolean
        addNumberIfDuplicate: boolean
      }
    ) => {
      try {
        const dir = path.dirname(req.fromPath)
        const ext = path.extname(req.toFilename) || path.extname(req.fromPath)
        const stem = req.toFilename
          .replace(/[\\/:*?"<>|]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
        let target = path.join(dir, stem.endsWith(ext) ? stem : stem)
        if (!stem.endsWith(ext)) target = path.join(dir, stem + ext)

        if (req.addNumberIfDuplicate) {
          let i = 2
          let current = target
          while (true) {
            try {
              await fs.access(current)
              const baseStem = path.basename(target, ext)
              current = path.join(dir, `${baseStem} ${i}${ext}`)
              i++
            } catch {
              target = current
              break
            }
          }
        }

        if (req.backup) {
          try {
            const backupDir = path.join(dir, '_originals')
            await fs.mkdir(backupDir, { recursive: true })
            const backupPath = path.join(backupDir, path.basename(req.fromPath))
            try {
              await fs.copyFile(req.fromPath, backupPath)
            } catch {
              // ignore backup failure
            }
          } catch {
            // ignore
          }
        }

        await fs.rename(req.fromPath, target)
        return { ok: true, newPath: target, newFilename: path.basename(target) }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )
}
