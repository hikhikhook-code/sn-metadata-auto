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
