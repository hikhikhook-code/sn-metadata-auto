import { dialog, ipcMain, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import ExcelJS from 'exceljs'

interface ExportPayload {
  format: 'csv' | 'txt' | 'json' | 'xlsx'
  rows: Record<string, unknown>[]
  defaultName: string
}

function escapeCsv(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsv(row[h])).join(','))
  }
  return lines.join('\r\n')
}

function rowsToTxt(rows: Record<string, unknown>[]): string {
  return rows
    .map((r) =>
      Object.entries(r)
        .map(([k, v]) => `${k}: ${v == null ? '' : String(v)}`)
        .join('\n')
    )
    .join('\n\n---\n\n')
}

async function rowsToXlsx(rows: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Metadata')
  if (rows.length === 0) {
    return Buffer.from(await wb.xlsx.writeBuffer())
  }
  const headers = Object.keys(rows[0])
  ws.columns = headers.map((h) => ({
    header: h,
    key: h,
    width: Math.min(40, Math.max(12, h.length + 2))
  }))
  for (const r of rows) ws.addRow(r)
  ws.getRow(1).font = { bold: true }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export function registerExportIpc(): void {
  ipcMain.handle('export:write', async (_e, payload: ExportPayload) => {
    try {
      const win = BrowserWindow.getFocusedWindow() ?? undefined
      const ext = payload.format
      const opts: Electron.SaveDialogOptions = {
        title: 'Export metadata',
        defaultPath: `${payload.defaultName}.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
      }
      const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
      if (res.canceled || !res.filePath) return { ok: false }

      let buf: Buffer
      if (ext === 'csv') {
        buf = Buffer.from(rowsToCsv(payload.rows), 'utf-8')
      } else if (ext === 'txt') {
        buf = Buffer.from(rowsToTxt(payload.rows), 'utf-8')
      } else if (ext === 'json') {
        buf = Buffer.from(JSON.stringify(payload.rows, null, 2), 'utf-8')
      } else {
        buf = await rowsToXlsx(payload.rows)
      }
      await fs.writeFile(res.filePath, buf)
      return { ok: true, path: res.filePath }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle(
    'logs:export',
    async (_e, payload: { format: 'txt' | 'json'; content: string; defaultName: string }) => {
      try {
        const win = BrowserWindow.getFocusedWindow() ?? undefined
        const opts: Electron.SaveDialogOptions = {
          title: 'Export logs',
          defaultPath: `${payload.defaultName}.${payload.format}`,
          filters: [{ name: payload.format.toUpperCase(), extensions: [payload.format] }]
        }
        const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
        if (res.canceled || !res.filePath) return { ok: false }
        await fs.writeFile(res.filePath, payload.content, 'utf-8')
        return { ok: true, path: res.filePath }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )
}
