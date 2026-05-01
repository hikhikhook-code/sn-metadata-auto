import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface SelectedFile {
  path: string
  name: string
  size: number
  ext: string
}

export interface RenameRequest {
  fromPath: string
  toFilename: string
  backup: boolean
  addNumberIfDuplicate: boolean
}

export interface RenameResult {
  ok: boolean
  newPath?: string
  newFilename?: string
  error?: string
}

export interface ExportPayload {
  format: 'csv' | 'txt' | 'json' | 'xlsx'
  rows: Record<string, unknown>[]
  defaultName: string
}

const api = {
  selectFiles: (): Promise<SelectedFile[]> => ipcRenderer.invoke('files:select'),
  selectFolder: (): Promise<SelectedFile[]> => ipcRenderer.invoke('files:select-folder'),
  statFiles: (paths: string[]): Promise<SelectedFile[]> => ipcRenderer.invoke('files:stat', paths),
  readFileBase64: (
    path: string
  ): Promise<{ ok: boolean; data?: string; mime?: string; error?: string }> =>
    ipcRenderer.invoke('files:read-base64', path),
  readThumbnail: (
    req: { path: string; maxSize?: number }
  ): Promise<{ ok: boolean; dataUrl?: string; error?: string }> =>
    ipcRenderer.invoke('files:read-thumbnail', req),
  renameFile: (req: RenameRequest): Promise<RenameResult> =>
    ipcRenderer.invoke('files:rename', req),
  exportData: (payload: ExportPayload): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('export:write', payload),
  exportLogs: (payload: {
    format: 'txt' | 'json'
    content: string
    defaultName: string
  }): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('logs:export', payload),
  saveProject: (
    project: unknown,
    pathHint?: string | null
  ): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('project:save', { project, pathHint }),
  loadProject: (): Promise<{ ok: boolean; project?: unknown; path?: string; error?: string }> =>
    ipcRenderer.invoke('project:load'),
  loadProjectAtPath: (
    path: string
  ): Promise<{ ok: boolean; project?: unknown; path?: string; error?: string }> =>
    ipcRenderer.invoke('project:load-at', path),
  autoSaveProject: (project: unknown): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('project:autosave', { project }),
  loadAutoSave: (): Promise<{ ok: boolean; project?: unknown; error?: string }> =>
    ipcRenderer.invoke('project:load-autosave'),
  selectFolderPath: (): Promise<{ ok: boolean; path?: string }> =>
    ipcRenderer.invoke('files:select-folder-path'),
  ai: {
    checkKey: (input: {
      provider: string
      apiKey: string
      baseUrl?: string
      model?: string
    }): Promise<{ ok: boolean; status: string; error?: string }> =>
      ipcRenderer.invoke('ai:check-key', input),
    fetchModels: (input: {
      provider: string
      apiKey: string
      baseUrl?: string
    }): Promise<{ ok: boolean; models?: unknown[]; error?: string }> =>
      ipcRenderer.invoke('ai:fetch-models', input),
    generate: (input: {
      provider: string
      apiKey: string
      baseUrl?: string
      model: string
      filePath: string
      fileType: string
      keywordCount: number
    }): Promise<{
      ok: boolean
      metadata?: { title: string; description: string; keywords: string[]; category: string }
      error?: string
      status?: string
    }> => ipcRenderer.invoke('ai:generate', input)
  },
  media: {
    renderSvgPreview: (input: {
      filePath: string
      width?: number
    }): Promise<{ ok: boolean; previewPath?: string; mimeType?: 'image/png'; error?: string }> =>
      ipcRenderer.invoke('media:render-svg-preview', input)
  },
  metadata: {
    embed: (req: {
      files: Array<{
        filePath: string
        fileType: string
        outputBasename?: string
        metadata: { title?: string; description?: string; keywords?: string[] }
      }>
      mode: 'in-place' | 'copy'
      backup: boolean
      outputDirName?: string
    }): Promise<{
      ok: boolean
      results: Array<{
        filePath: string
        ok: boolean
        outputPath?: string
        error?: string
      }>
    }> => ipcRenderer.invoke('metadata:embed', req)
  },
  crypto: {
    encryptionStatus: (): Promise<{ available: boolean; backend: string }> =>
      ipcRenderer.invoke('crypto:encryption-status')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}

export type RendererApi = typeof api
