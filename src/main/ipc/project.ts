import { app, dialog, ipcMain, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'

function autosavePath(): string {
  return path.join(app.getPath('userData'), 'autosave.snmproj.json')
}

export function registerProjectIpc(): void {
  ipcMain.handle(
    'project:save',
    async (_e, args: { project: unknown; pathHint?: string | null }) => {
      try {
        let target = args.pathHint || null
        if (!target) {
          const win = BrowserWindow.getFocusedWindow() ?? undefined
          const opts: Electron.SaveDialogOptions = {
            title: 'Save project',
            defaultPath: 'untitled.snmproj.json',
            filters: [{ name: 'SN Metadata Project', extensions: ['snmproj.json', 'json'] }]
          }
          const res = win
            ? await dialog.showSaveDialog(win, opts)
            : await dialog.showSaveDialog(opts)
          if (res.canceled || !res.filePath) return { ok: false }
          target = res.filePath
        }
        await fs.writeFile(target, JSON.stringify(args.project, null, 2), 'utf-8')
        return { ok: true, path: target }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('project:load', async () => {
    try {
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const opts: Electron.OpenDialogOptions = {
        title: 'Open project',
        properties: ['openFile'],
        filters: [{ name: 'SN Metadata Project', extensions: ['snmproj.json', 'json'] }]
      }
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (res.canceled || res.filePaths.length === 0) return { ok: false }
      const data = await fs.readFile(res.filePaths[0], 'utf-8')
      return { ok: true, project: JSON.parse(data), path: res.filePaths[0] }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('project:load-at', async (_e, p: string) => {
    try {
      const data = await fs.readFile(p, 'utf-8')
      return { ok: true, project: JSON.parse(data), path: p }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('project:autosave', async (_e, args: { project: unknown }) => {
    try {
      const target = autosavePath()
      await fs.writeFile(target, JSON.stringify(args.project, null, 2), 'utf-8')
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('project:load-autosave', async () => {
    try {
      const target = autosavePath()
      const data = await fs.readFile(target, 'utf-8')
      return { ok: true, project: JSON.parse(data) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
