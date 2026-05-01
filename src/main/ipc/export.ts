import { dialog, ipcMain, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import ExcelJS from 'exceljs'

interface ExportPayload {
  format: 'csv' | 'txt' | 'json' | 'xlsx'
  rows: Record<string, unknown>[]
  defaultName: string
  /**
   * Optional CSV delimiter. Defaults to `,` for backward compatibility.
   * Renderer passes `';'` for Freepik or `'\t'` for tab-separated custom
   * exports. Only consulted for `format === 'csv'`; ignored for other
   * formats.
   */
  delimiter?: ',' | ';' | '\t'
  /**
   * Optional explicit header order. If provided, the CSV's first row uses
   * exactly these labels in this order, and each data row pulls cells via
   * those same labels from the row record. If absent we fall back to the
   * legacy `Object.keys(rows[0])` behavior so old callers keep working.
   */
  headers?: string[]
}

function escapeCsvCell(v: unknown, delimiter: string): string {
  const s = v == null ? '' : String(v)
  // RFC 4180 quoting: any cell containing the delimiter, double quotes, or
  // newlines must be wrapped in double quotes with internal quotes doubled.
  const needsQuote = s.includes(delimiter) || /["\n\r]/.test(s)
  if (needsQuote) return `"${s.replace(/"/g, '""')}"`
  return s
}

function rowsToCsv(
  rows: Record<string, unknown>[],
  delimiter: string,
  explicitHeaders?: string[]
): string {
  if (rows.length === 0) return ''
  const headers = explicitHeaders ?? Object.keys(rows[0])
  const lines = [headers.map((h) => escapeCsvCell(h, delimiter)).join(delimiter)]
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h], delimiter)).join(delimiter))
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

async function rowsToXlsx(
  rows: Record<string, unknown>[],
  explicitHeaders?: string[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Metadata')
  if (rows.length === 0) {
    return Buffer.from(await wb.xlsx.writeBuffer())
  }
  const headers = explicitHeaders ?? Object.keys(rows[0])
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
        const delim = payload.delimiter ?? ','
        // Microsoft Excel parses a CSV's column delimiter from the user's
        // regional setting (e.g. Indonesian Excel defaults to `;`, English
        // to `,`). When the file's delimiter doesn't match the locale, every
        // row collapses into column A. The standard escape hatch is the
        // `sep=<char>` directive on line 1: Excel reads it as a hint and
        // applies that delimiter regardless of locale. Other CSV consumers
        // (Adobe Stock contributor portal, Shutterstock submitter,
        // pandas/Python, LibreOffice) treat it as a regular row that they
        // either skip silently because no header matches, or in LibreOffice
        // simply expose as a one-cell first row.
        //
        // We also prepend a UTF-8 BOM so Excel renders non-ASCII characters
        // (Indonesian diacritics in titles/keywords) correctly. The BOM is
        // tolerated by every parser we care about.
        const sepLine = `sep=${delim}\r\n`
        const csvText = sepLine + rowsToCsv(payload.rows, delim, payload.headers)
        buf = Buffer.concat([Buffer.from('\uFEFF', 'utf-8'), Buffer.from(csvText, 'utf-8')])
      } else if (ext === 'txt') {
        buf = Buffer.from(rowsToTxt(payload.rows), 'utf-8')
      } else if (ext === 'json') {
        buf = Buffer.from(JSON.stringify(payload.rows, null, 2), 'utf-8')
      } else {
        buf = await rowsToXlsx(payload.rows, payload.headers)
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
