export type FileType =
  | 'jpg'
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'mp4'
  | 'mov'
  | 'avi'
  | 'webm'
  | 'svg'
  | 'eps'

export const SUPPORTED_EXTS: FileType[] = [
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
]

export const IMAGE_EXTS: FileType[] = ['jpg', 'jpeg', 'png', 'webp']
export const VIDEO_EXTS: FileType[] = ['mp4', 'mov', 'avi', 'webm']
export const VECTOR_EXTS: FileType[] = ['svg', 'eps']

export type FileStatus =
  | 'Waiting'
  | 'Ready'
  | 'Unsupported'
  | 'Duplicate'
  | 'Processing'
  | 'Generated'
  | 'Edited'
  | 'Saved'
  | 'Need Approval'
  | 'Approved'
  | 'Renamed'
  | 'Exported'
  | 'Failed'
  | 'Skipped'

export interface Metadata {
  title: string
  description: string
  keywords: string[]
  category: string
  /**
   * The unmodified AI-returned title, kept only when the AI produced a title
   * longer than the recommended length and we substituted a shortened version
   * for the editable field. Lets the user revert to the original via the UI.
   */
  titleOriginal?: string
}

export interface AppFile {
  id: string
  originalPath: string
  currentPath: string
  originalFilename: string
  currentFilename: string
  fileType: FileType | string
  fileSize: number
  previewUrl?: string
  aiMetadata?: Metadata
  editedMetadata?: Metadata
  renamePreview?: string
  status: FileStatus
  apiProvider?: string
  apiKeySlot?: string
  errorMessage?: string
  generatedAt?: string
  lastEditedAt?: string
  approvedAt?: string
  renamedAt?: string
  exportedAt?: string
}

export type ApiProvider = 'Gemini' | 'OpenAI' | 'Groq' | 'Custom'

export type ApiKeyStatus = 'Untested' | 'Valid' | 'Invalid' | 'Limit' | 'Error' | 'Disabled'

export type ModelCategory =
  | 'Recommended for Metadata'
  | 'Vision Support'
  | 'Text Only'
  | 'Fast / Cheap'
  | 'Best Quality'
  | 'Preview / Experimental'
  | 'Deprecated / Not Recommended'
  | 'Image Generation Only'
  | 'Video Generation Only'
  | 'Audio Only'
  | 'Embedding Only'

export interface ModelPreset {
  id: string
  label: string
  category: ModelCategory
  vision: boolean
  description?: string
}

export interface ApiKeyEntry {
  id: string
  name: string
  provider: ApiProvider
  model: string
  apiKey: string
  baseUrl?: string
  priority: number
  status: ApiKeyStatus
  enabled: boolean
  lastChecked?: string
  lastError?: string
  fetchedModels?: ModelPreset[]
  /** ISO timestamp; while now() < cooldownUntil the key is treated as Limited and skipped. */
  cooldownUntil?: string
}

export type LogLevel = 'info' | 'success' | 'warning' | 'error'

export type LogCategory =
  | 'BATCH'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'WARNING'
  | 'SAVED'
  | 'APPROVED'
  | 'RENAMED'
  | 'EXPORT'
  | 'EMBED'
  | 'API'
  | 'PROJECT'
  | 'STOP'
  | 'RESUME'
  | 'INFO'
  | 'WORKER'
  | 'DELAY'
  | 'RETRY'
  | 'COOLDOWN'

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  category: LogCategory
  message: string
  fileId?: string
  apiKeySlot?: string
}

export type ViewMode = 'comfort' | 'compact'

export type SettingsMode = 'simple' | 'advanced'

export interface AppSettings {
  /**
   * UI density of the Settings page. `simple` (default) shows the small set
   * of controls daily users care about; `advanced` reveals every setting.
   * This is purely a UI knob — the underlying values for hidden settings are
   * still read by the backend (workers, orchestrator, etc.) so behavior never
   * changes between modes.
   */
  settingsMode: SettingsMode
  defaultKeywordCount: number
  platformPreset: 'Adobe Stock' | 'Freepik' | 'Shutterstock' | 'Pond5' | 'Custom'
  autoRenameAfterApprove: boolean
  autoRenameAfterSuccess: boolean
  keepOriginalBackup: boolean
  useTitleCase: boolean
  useLowercaseFilename: boolean
  replaceSpacesWithHyphen: boolean
  addNumberIfDuplicate: boolean
  outputFolder: string
  autosaveProject: boolean
  tooltipsEnabled: boolean
  defaultViewMode: ViewMode
  logRetention: number
  apiTimeoutMs: number
  retryCount: number
  videoFrameCount: number
  // Processing Control
  workerCount: number
  delayBetweenFilesMs: number
  delayBetweenApiCallsMs: number
  retryDelayMs: number
  maxRetryAttempts: number
  rateLimitCooldownSec: number
  autoSwitchOnLimit: boolean
  stopOnTooManyFailures: boolean
  failureThreshold: number
}

export interface BatchWorkerSlot {
  id: number
  fileId: string | null
  fileName: string | null
  apiKeySlot: string | null
}

export interface BatchState {
  isRunning: boolean
  isPaused: boolean
  currentFileId: string | null
  successCount: number
  failedCount: number
  totalCount: number
  startedAt: string | null
  workers: BatchWorkerSlot[]
  consecutiveFailures: number
}

export interface ProjectState {
  filePath: string | null
  name: string
  lastSavedAt: string | null
  recentProjects: string[]
}

export interface SerializedProject {
  version: number
  name: string
  files: AppFile[]
  apiKeys: ApiKeyEntry[]
  logs: LogEntry[]
  settings: AppSettings
  savedAt: string
}
