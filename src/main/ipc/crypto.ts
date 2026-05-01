import { ipcMain, safeStorage } from 'electron'

export interface EncryptionStatus {
  /** True when `safeStorage.encryptString()` will produce real OS-keychain ciphertext. */
  available: boolean
  /**
   * Best-effort name of the keychain backend in use. Linux returns the actual
   * backend reported by Electron (`gnome_libsecret`, `kwallet*`, `basic_text`,
   * `unknown`); Windows always reports `dpapi`, macOS `keychain`. When
   * `available` is false the value is `unsupported`.
   */
  backend: string
}

interface SafeStorageWithBackend {
  getSelectedStorageBackend?: () => string
}

function detectBackend(available: boolean): string {
  if (!available) return 'unsupported'
  if (process.platform === 'win32') return 'dpapi'
  if (process.platform === 'darwin') return 'keychain'
  if (process.platform === 'linux') {
    try {
      const fn = (safeStorage as SafeStorageWithBackend).getSelectedStorageBackend
      if (typeof fn === 'function') {
        const result = fn.call(safeStorage)
        if (typeof result === 'string' && result.length > 0) return result
      }
    } catch {
      // fall through to default name
    }
    return 'libsecret'
  }
  return 'unknown'
}

export function registerCryptoIpc(): void {
  ipcMain.handle('crypto:encryption-status', async (): Promise<EncryptionStatus> => {
    let available = false
    try {
      available = safeStorage.isEncryptionAvailable()
    } catch {
      available = false
    }
    return { available, backend: detectBackend(available) }
  })
}
