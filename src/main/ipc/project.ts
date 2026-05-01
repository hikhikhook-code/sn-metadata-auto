import { app, dialog, ipcMain, BrowserWindow, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'

function autosavePath(): string {
  return path.join(app.getPath('userData'), 'autosave.snmproj.json')
}

/**
 * Marker prepended to encrypted API key values written into project files.
 * The format is `enc:v1:<base64>` where the base64 payload is what
 * `safeStorage.encryptString()` returned. Anything that does not start with
 * this marker is treated as legacy plaintext on load (and re-encrypted on the
 * next save), so existing `*.snmproj.json` files stay loadable.
 */
const ENC_PREFIX = 'enc:v1:'

let warnedNoEncryption = false
let warnedDecryptFailure = false

function isEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

function encryptApiKeyValue(value: string): string {
  if (!value) return value
  if (value.startsWith(ENC_PREFIX)) return value
  if (!isEncryptionAvailable()) {
    if (!warnedNoEncryption) {
      warnedNoEncryption = true
      console.warn(
        '[project] safeStorage encryption is not available on this system; ' +
          'API keys will be saved as plaintext. Configure a system keychain ' +
          '(DPAPI on Windows, Keychain on macOS, libsecret on Linux) and ' +
          'restart the app to enable encryption-at-rest.'
      )
    }
    return value
  }
  const cipher = safeStorage.encryptString(value)
  return ENC_PREFIX + cipher.toString('base64')
}

function decryptApiKeyValue(value: string): string {
  if (!value || !value.startsWith(ENC_PREFIX)) return value
  if (!isEncryptionAvailable()) {
    if (!warnedDecryptFailure) {
      warnedDecryptFailure = true
      console.warn(
        '[project] Project file contains encrypted API keys but safeStorage ' +
          'is not available on this system; affected keys will load as empty. ' +
          'Re-enter the keys after starting the app on a system with a ' +
          'keychain backend.'
      )
    }
    return ''
  }
  try {
    const buf = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch (err) {
    if (!warnedDecryptFailure) {
      warnedDecryptFailure = true
      console.warn(
        '[project] Failed to decrypt one or more API keys; they will load as ' +
          'empty. This usually means the project was encrypted on a different ' +
          'OS user or machine. Original error:',
        (err as Error).message
      )
    }
    return ''
  }
}

interface MaybeApiKeyEntry {
  apiKey?: unknown
}

interface MaybeProject {
  apiKeys?: unknown
}

/**
 * Returns a deep clone of `project` with each `apiKeys[].apiKey` value passed
 * through `transform`. Non-string values and entries without `apiKeys` are
 * left as-is. The original object is never mutated.
 */
function mapApiKeyValues(project: unknown, transform: (v: string) => string): unknown {
  if (!project || typeof project !== 'object') return project
  const cloned = JSON.parse(JSON.stringify(project)) as MaybeProject
  if (!Array.isArray(cloned.apiKeys)) return cloned
  for (const entry of cloned.apiKeys as MaybeApiKeyEntry[]) {
    if (entry && typeof entry.apiKey === 'string') {
      entry.apiKey = transform(entry.apiKey)
    }
  }
  return cloned
}

function encryptProjectForDisk(project: unknown): unknown {
  return mapApiKeyValues(project, encryptApiKeyValue)
}

function decryptProjectFromDisk(project: unknown): unknown {
  return mapApiKeyValues(project, decryptApiKeyValue)
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
        const onDisk = encryptProjectForDisk(args.project)
        await fs.writeFile(target, JSON.stringify(onDisk, null, 2), 'utf-8')
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
      const project = decryptProjectFromDisk(JSON.parse(data))
      return { ok: true, project, path: res.filePaths[0] }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('project:load-at', async (_e, p: string) => {
    try {
      const data = await fs.readFile(p, 'utf-8')
      const project = decryptProjectFromDisk(JSON.parse(data))
      return { ok: true, project, path: p }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('project:autosave', async (_e, args: { project: unknown }) => {
    try {
      const target = autosavePath()
      const onDisk = encryptProjectForDisk(args.project)
      await fs.writeFile(target, JSON.stringify(onDisk, null, 2), 'utf-8')
      return { ok: true, path: target }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('project:load-autosave', async () => {
    try {
      const target = autosavePath()
      const data = await fs.readFile(target, 'utf-8')
      const project = decryptProjectFromDisk(JSON.parse(data))
      return { ok: true, project }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })
}
