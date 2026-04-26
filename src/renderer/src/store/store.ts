import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { nanoid } from 'nanoid'
import type {
  AppFile,
  ApiKeyEntry,
  ApiProvider,
  AppSettings,
  BatchState,
  FileStatus,
  LogCategory,
  LogEntry,
  LogLevel,
  Metadata,
  ProjectState,
  SerializedProject,
  ViewMode
} from '@renderer/types'
import { buildRenamePreview } from '@renderer/utils/filename'
import { dedupeKeywords } from '@renderer/utils/keywords'
import { clampTitleHardMax, cleanAiTitle } from '@renderer/utils/title'

const MAX_API_KEYS = 10
const PROJECT_VERSION = 1

const DEFAULT_SETTINGS: AppSettings = {
  defaultKeywordCount: 49,
  platformPreset: 'Adobe Stock',
  autoRenameAfterApprove: true,
  autoRenameAfterSuccess: false,
  keepOriginalBackup: true,
  useTitleCase: false,
  useLowercaseFilename: false,
  replaceSpacesWithHyphen: false,
  addNumberIfDuplicate: true,
  outputFolder: '',
  autosaveProject: true,
  tooltipsEnabled: true,
  defaultViewMode: 'comfort',
  logRetention: 5000,
  apiTimeoutMs: 60000,
  retryCount: 2,
  videoFrameCount: 3,
  workerCount: 1,
  delayBetweenFilesMs: 2000,
  delayBetweenApiCallsMs: 3000,
  retryDelayMs: 10000,
  maxRetryAttempts: 2,
  rateLimitCooldownSec: 60,
  autoSwitchOnLimit: true,
  stopOnTooManyFailures: false,
  failureThreshold: 5
}

const INITIAL_BATCH: BatchState = {
  isRunning: false,
  isPaused: false,
  currentFileId: null,
  successCount: 0,
  failedCount: 0,
  totalCount: 0,
  startedAt: null,
  workers: [],
  consecutiveFailures: 0
}

const INITIAL_PROJECT: ProjectState = {
  filePath: null,
  name: 'Untitled Project',
  lastSavedAt: null,
  recentProjects: []
}

export type SidebarKey = 'files' | 'review' | 'editor' | 'apikeys' | 'logs' | 'export' | 'settings'

export interface UiState {
  sidebarCollapsed: boolean
  activePage: SidebarKey
  viewMode: ViewMode
  toast: { id: string; kind: 'info' | 'success' | 'warning' | 'error'; message: string } | null
}

export interface AppState {
  files: AppFile[]
  selectedFileIds: string[]
  apiKeys: ApiKeyEntry[]
  logs: LogEntry[]
  settings: AppSettings
  batch: BatchState
  project: ProjectState
  ui: UiState

  // Actions
  setSidebarCollapsed: (v: boolean) => void
  setActivePage: (p: SidebarKey) => void
  setViewMode: (m: ViewMode) => void
  showToast: (
    kind: UiState['toast'] extends infer T
      ? T extends null
        ? never
        : T extends { kind: infer K }
          ? K
          : never
      : never,
    message: string
  ) => void
  dismissToast: () => void

  addFiles: (incoming: { path: string; name: string; size: number; ext: string }[]) => number
  removeFiles: (ids: string[]) => void
  clearFiles: () => void
  toggleFileSelected: (id: string) => void
  setSelectedFiles: (ids: string[]) => void
  selectAllFiles: () => void
  clearSelection: () => void
  setFilePreview: (id: string, previewUrl: string) => void
  setFileStatus: (id: string, status: FileStatus, errorMessage?: string) => void
  applyAiMetadata: (id: string, metadata: Metadata, apiProvider: string, apiKeySlot: string) => void
  updateEditedMetadata: (id: string, partial: Partial<Metadata>) => void
  resetToAi: (id: string) => void
  saveMetadata: (id: string) => boolean
  approveMetadata: (id: string) => void
  applyRenameResult: (id: string, newPath: string, newFilename: string) => void
  setRenamePreview: (id: string, preview: string) => void

  addApiKey: () => string | null
  removeApiKey: (id: string) => void
  updateApiKey: (id: string, partial: Partial<ApiKeyEntry>) => void
  reorderApiKeys: (ids: string[]) => void
  setApiKeyEnabled: (id: string, enabled: boolean) => void

  addLog: (
    level: LogLevel,
    category: LogCategory,
    message: string,
    extra?: { fileId?: string; apiKeySlot?: string }
  ) => void
  clearLogs: () => void

  updateSettings: (partial: Partial<AppSettings>) => void

  setBatch: (partial: Partial<BatchState>) => void
  resetBatchCounters: () => void

  setProjectName: (name: string) => void
  setProjectPath: (p: string | null) => void
  markProjectSaved: () => void
  pushRecentProject: (p: string) => void

  // Project serialization
  serialize: () => SerializedProject
  hydrate: (data: SerializedProject) => void
  resetAll: () => void
}

function activeKeySlot(key: ApiKeyEntry): string {
  return `${key.provider} Key ${key.priority}`
}

export const useAppStore = create<AppState>()(
  immer((set, get) => ({
    files: [],
    selectedFileIds: [],
    apiKeys: [],
    logs: [],
    settings: DEFAULT_SETTINGS,
    batch: INITIAL_BATCH,
    project: INITIAL_PROJECT,
    ui: {
      sidebarCollapsed: false,
      activePage: 'files',
      viewMode: 'comfort',
      toast: null
    },

    setSidebarCollapsed: (v) =>
      set((s) => {
        s.ui.sidebarCollapsed = v
      }),
    setActivePage: (p) =>
      set((s) => {
        s.ui.activePage = p
      }),
    setViewMode: (m) =>
      set((s) => {
        s.ui.viewMode = m
      }),
    showToast: (kind, message) =>
      set((s) => {
        s.ui.toast = { id: nanoid(6), kind, message }
      }),
    dismissToast: () =>
      set((s) => {
        s.ui.toast = null
      }),

    addFiles: (incoming) => {
      let added = 0
      set((s) => {
        const existing = new Set(s.files.map((f) => f.originalPath))
        for (const f of incoming) {
          if (existing.has(f.path)) continue
          const ext = (f.ext || f.name.split('.').pop() || '').toLowerCase()
          const supported = [
            'jpg',
            'jpeg',
            'png',
            'webp',
            'mp4',
            'mov',
            'avi',
            'webm',
            'svg',
            'eps'
          ].includes(ext)
          s.files.push({
            id: nanoid(10),
            originalPath: f.path,
            currentPath: f.path,
            originalFilename: f.name,
            currentFilename: f.name,
            fileType: ext,
            fileSize: f.size,
            status: supported ? 'Ready' : 'Unsupported'
          })
          added++
        }
      })
      return added
    },
    removeFiles: (ids) =>
      set((s) => {
        const set = new Set(ids)
        s.files = s.files.filter((f) => !set.has(f.id))
        s.selectedFileIds = s.selectedFileIds.filter((id) => !set.has(id))
      }),
    clearFiles: () =>
      set((s) => {
        s.files = []
        s.selectedFileIds = []
      }),
    toggleFileSelected: (id) =>
      set((s) => {
        const idx = s.selectedFileIds.indexOf(id)
        if (idx === -1) s.selectedFileIds.push(id)
        else s.selectedFileIds.splice(idx, 1)
      }),
    setSelectedFiles: (ids) =>
      set((s) => {
        s.selectedFileIds = ids
      }),
    selectAllFiles: () =>
      set((s) => {
        s.selectedFileIds = s.files.map((f) => f.id)
      }),
    clearSelection: () =>
      set((s) => {
        s.selectedFileIds = []
      }),
    setFilePreview: (id, previewUrl) =>
      set((s) => {
        const f = s.files.find((x) => x.id === id)
        if (f) f.previewUrl = previewUrl
      }),
    setFileStatus: (id, status, errorMessage) =>
      set((s) => {
        const f = s.files.find((x) => x.id === id)
        if (!f) return
        f.status = status
        if (status === 'Failed') f.errorMessage = errorMessage
        if (status === 'Processing') f.errorMessage = undefined
      }),
    applyAiMetadata: (id, metadata, apiProvider, apiKeySlot) =>
      set((s) => {
        const f = s.files.find((x) => x.id === id)
        if (!f) return
        const titleClean = cleanAiTitle(metadata.title)
        const cleaned: Metadata = {
          title: titleClean.title,
          ...(titleClean.titleOriginal ? { titleOriginal: titleClean.titleOriginal } : {}),
          description: metadata.description.trim(),
          keywords: dedupeKeywords(metadata.keywords),
          category: metadata.category.trim()
        }
        f.aiMetadata = cleaned
        f.editedMetadata = { ...cleaned, keywords: [...cleaned.keywords] }
        f.status = 'Generated'
        f.apiProvider = apiProvider
        f.apiKeySlot = apiKeySlot
        f.generatedAt = new Date().toISOString()
        f.lastEditedAt = f.generatedAt
        f.renamePreview = buildRenamePreview(cleaned.title, f.originalFilename, s.settings)
      }),
    updateEditedMetadata: (id, partial) =>
      set((s) => {
        const f = s.files.find((x) => x.id === id)
        if (!f) return
        const base: Metadata = f.editedMetadata ?? {
          title: '',
          description: '',
          keywords: [],
          category: ''
        }
        const nextTitle =
          partial.title !== undefined ? clampTitleHardMax(partial.title) : base.title
        // If user manually changed the title, the AI's titleOriginal hint is
        // no longer relevant. Clearing it hides the "use original" affordance.
        const titleOriginal =
          partial.title !== undefined && partial.title !== base.titleOriginal
            ? undefined
            : base.titleOriginal
        const next: Metadata = {
          title: nextTitle,
          ...(titleOriginal ? { titleOriginal } : {}),
          description: partial.description ?? base.description,
          keywords:
            partial.keywords !== undefined ? dedupeKeywords(partial.keywords) : base.keywords,
          category: partial.category ?? base.category
        }
        f.editedMetadata = next
        f.lastEditedAt = new Date().toISOString()
        if (partial.title !== undefined) {
          f.renamePreview = buildRenamePreview(next.title, f.originalFilename, s.settings)
        }
        if (
          f.status === 'Saved' ||
          f.status === 'Approved' ||
          f.status === 'Renamed' ||
          f.status === 'Exported'
        ) {
          f.status = 'Edited'
        } else if (f.status === 'Generated') {
          f.status = 'Edited'
        }
      }),
    resetToAi: (id) =>
      set((s) => {
        const f = s.files.find((x) => x.id === id)
        if (!f || !f.aiMetadata) return
        f.editedMetadata = {
          title: f.aiMetadata.title,
          ...(f.aiMetadata.titleOriginal ? { titleOriginal: f.aiMetadata.titleOriginal } : {}),
          description: f.aiMetadata.description,
          keywords: [...f.aiMetadata.keywords],
          category: f.aiMetadata.category
        }
        f.renamePreview = buildRenamePreview(f.aiMetadata.title, f.originalFilename, s.settings)
        f.status = 'Generated'
        f.lastEditedAt = new Date().toISOString()
      }),
    saveMetadata: (id) => {
      // Validate before mutating so we can report success/failure to callers.
      // The UI also disables Save when the title is invalid, but this guard
      // protects against direct calls / race conditions.
      const f = get().files.find((x) => x.id === id)
      if (!f) return false
      const m = f.editedMetadata ?? f.aiMetadata
      const title = m?.title?.trim() ?? ''
      if (title.length === 0 || title.length > 200) return false
      set((s) => {
        const ff = s.files.find((x) => x.id === id)
        if (!ff) return
        ff.status = 'Saved'
        ff.lastEditedAt = new Date().toISOString()
      })
      return true
    },
    approveMetadata: (id) =>
      set((s) => {
        const f = s.files.find((x) => x.id === id)
        if (!f) return
        f.status = 'Approved'
        f.approvedAt = new Date().toISOString()
      }),
    applyRenameResult: (id, newPath, newFilename) =>
      set((s) => {
        const f = s.files.find((x) => x.id === id)
        if (!f) return
        f.currentPath = newPath
        f.currentFilename = newFilename
        f.renamePreview = newFilename
        f.status = 'Renamed'
        f.renamedAt = new Date().toISOString()
      }),
    setRenamePreview: (id, preview) =>
      set((s) => {
        const f = s.files.find((x) => x.id === id)
        if (!f) return
        f.renamePreview = preview
      }),

    addApiKey: () => {
      const state = get()
      if (state.apiKeys.length >= MAX_API_KEYS) return null
      const id = nanoid(8)
      set((s) => {
        const provider: ApiProvider = 'Gemini'
        const priority = s.apiKeys.length + 1
        s.apiKeys.push({
          id,
          name: `${provider} Key ${priority}`,
          provider,
          model: 'gemini-2.5-flash',
          apiKey: '',
          priority,
          status: 'Untested',
          enabled: true
        })
      })
      return id
    },
    removeApiKey: (id) =>
      set((s) => {
        s.apiKeys = s.apiKeys.filter((k) => k.id !== id)
        s.apiKeys.forEach((k, i) => {
          k.priority = i + 1
        })
      }),
    updateApiKey: (id, partial) =>
      set((s) => {
        const k = s.apiKeys.find((x) => x.id === id)
        if (!k) return
        Object.assign(k, partial)
      }),
    reorderApiKeys: (ids) =>
      set((s) => {
        const map = new Map(s.apiKeys.map((k) => [k.id, k]))
        const next: ApiKeyEntry[] = []
        ids.forEach((id, i) => {
          const k = map.get(id)
          if (!k) return
          k.priority = i + 1
          next.push(k)
        })
        s.apiKeys = next
      }),
    setApiKeyEnabled: (id, enabled) =>
      set((s) => {
        const k = s.apiKeys.find((x) => x.id === id)
        if (!k) return
        k.enabled = enabled
      }),

    addLog: (level, category, message, extra) =>
      set((s) => {
        s.logs.push({
          id: nanoid(8),
          timestamp: new Date().toISOString(),
          level,
          category,
          message,
          fileId: extra?.fileId,
          apiKeySlot: extra?.apiKeySlot
        })
        const max = s.settings.logRetention || 5000
        if (s.logs.length > max) s.logs.splice(0, s.logs.length - max)
      }),
    clearLogs: () =>
      set((s) => {
        s.logs = []
      }),

    updateSettings: (partial) =>
      set((s) => {
        Object.assign(s.settings, partial)
        // re-build rename preview for files that have a title
        s.files.forEach((f) => {
          const title = f.editedMetadata?.title || f.aiMetadata?.title
          if (title) f.renamePreview = buildRenamePreview(title, f.originalFilename, s.settings)
        })
      }),

    setBatch: (partial) =>
      set((s) => {
        Object.assign(s.batch, partial)
      }),
    resetBatchCounters: () =>
      set((s) => {
        s.batch.successCount = 0
        s.batch.failedCount = 0
        s.batch.totalCount = 0
        s.batch.currentFileId = null
        s.batch.startedAt = null
        s.batch.isRunning = false
        s.batch.isPaused = false
        s.batch.workers = []
        s.batch.consecutiveFailures = 0
      }),

    setProjectName: (name) =>
      set((s) => {
        s.project.name = name
      }),
    setProjectPath: (p) =>
      set((s) => {
        s.project.filePath = p
      }),
    markProjectSaved: () =>
      set((s) => {
        s.project.lastSavedAt = new Date().toISOString()
      }),
    pushRecentProject: (p) =>
      set((s) => {
        s.project.recentProjects = [p, ...s.project.recentProjects.filter((x) => x !== p)].slice(
          0,
          8
        )
      }),

    serialize: (): SerializedProject => {
      const s = get()
      return {
        version: PROJECT_VERSION,
        name: s.project.name,
        files: s.files,
        apiKeys: s.apiKeys,
        logs: s.logs,
        settings: s.settings,
        savedAt: new Date().toISOString()
      }
    },
    hydrate: (data) =>
      set((s) => {
        s.project.name = data.name
        s.files = data.files ?? []
        s.apiKeys = data.apiKeys ?? []
        s.logs = data.logs ?? []
        s.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) }
      }),
    resetAll: () =>
      set((s) => {
        s.files = []
        s.selectedFileIds = []
        s.logs = []
        s.batch = { ...INITIAL_BATCH }
        s.project = { ...INITIAL_PROJECT, recentProjects: s.project.recentProjects }
      })
  }))
)

export function getActiveKeySlotName(key: ApiKeyEntry): string {
  return activeKeySlot(key)
}

export { MAX_API_KEYS, DEFAULT_SETTINGS }
