import { useAppStore } from '@renderer/store/store'
import { InfoIcon } from '@renderer/components/ui/Tooltip'
import {
  ChevronRight,
  FolderOpen,
  FolderInput,
  GripVertical,
  Plus,
  Save,
  Trash2
} from 'lucide-react'
import { useState, type CSSProperties, type DragEvent, type ReactNode } from 'react'
import { useProjectActions } from '@renderer/hooks/useProject'
import {
  KEYWORD_COUNT_PRESETS,
  KEYWORD_COUNT_MIN,
  KEYWORD_COUNT_MAX,
  clampKeywordCount
} from '@renderer/utils/keywordCount'
import type { AppSettings, SettingsMode } from '@renderer/types'
import { DEFAULT_CUSTOM_SCHEMA, PLATFORM_SCHEMAS } from '@renderer/services/csvSchema'

const PLATFORM_PRESETS: Array<{
  value: 'Adobe Stock' | 'Freepik' | 'Shutterstock' | 'Pond5' | 'Custom'
  keywords: number
}> = [
  { value: 'Adobe Stock', keywords: 49 },
  { value: 'Freepik', keywords: 49 },
  { value: 'Shutterstock', keywords: 49 },
  { value: 'Pond5', keywords: 50 },
  { value: 'Custom', keywords: 49 }
]

export function SettingsPage() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  // `settingsMode` was added in the Settings UX redesign; older project files
  // saved before that field existed will load with `settingsMode === undefined`
  // until the next save merges in the default. Treat undefined as 'simple'.
  const mode: SettingsMode = settings.settingsMode ?? 'simple'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="section-title">Settings</h2>
          <p className="section-sub">
            Defaults applied across the app. All settings are saved with your project.
          </p>
        </div>
        <ModeToggle mode={mode} onChange={(next) => update({ settingsMode: next })} />
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mode === 'simple' ? (
          <SimpleSettings onShowAdvanced={() => update({ settingsMode: 'advanced' })} />
        ) : (
          <AdvancedSettings />
        )}
      </div>
    </div>
  )
}

// ---------------- mode toggle ----------------

function ModeToggle({
  mode,
  onChange
}: {
  mode: SettingsMode
  onChange: (next: SettingsMode) => void
}) {
  const baseBtn: CSSProperties = {
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    background: 'transparent',
    color: 'var(--c-text-muted)',
    transition: 'color 0.15s'
  }
  const activeBtn: CSSProperties = {
    ...baseBtn,
    background: 'var(--c-glass-4)',
    color: 'var(--c-heading)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
  }
  return (
    <div
      role="tablist"
      aria-label="Settings mode"
      style={{
        display: 'inline-flex',
        padding: 3,
        borderRadius: 999,
        border: '1px solid var(--c-border, rgba(0,0,0,0.08))',
        background: 'var(--c-glass-1)',
        gap: 2,
        alignSelf: 'flex-start'
      }}
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'simple'}
        style={{ ...(mode === 'simple' ? activeBtn : baseBtn), borderRadius: 999 }}
        onClick={() => onChange('simple')}
      >
        Simple
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'advanced'}
        style={{ ...(mode === 'advanced' ? activeBtn : baseBtn), borderRadius: 999 }}
        onClick={() => onChange('advanced')}
      >
        Advanced
      </button>
    </div>
  )
}

// ---------------- simple mode ----------------

function SimpleSettings({ onShowAdvanced }: { onShowAdvanced: () => void }) {
  return (
    <>
      <Card title="General">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <PlatformPresetField />
          <DefaultKeywordCountField />
          <DefaultViewModeField />
          <ThemeField />
        </div>
      </Card>

      <Card title="Output Files">
        <OutputFolderField />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <AutoRenameOutputToggle />
          <ToggleField fieldKey="addNumberIfDuplicate" label="Add number if duplicate exists" />
        </div>
      </Card>

      <button
        type="button"
        className="btn"
        style={{ alignSelf: 'flex-start', marginTop: 4 }}
        onClick={onShowAdvanced}
      >
        Show Advanced Settings
      </button>
    </>
  )
}

// ---------------- advanced mode ----------------

function AdvancedSettings() {
  return (
    <>
      <Card title="General">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <PlatformPresetField />
          <DefaultKeywordCountField />
          <DefaultViewModeField />
          <ThemeField />
        </div>
      </Card>

      <CollapsibleCard title="Rename Rules" defaultOpen>
        <RenameRulesBody />
      </CollapsibleCard>

      <CollapsibleCard title="Project & UX" defaultOpen>
        <ProjectUxBody />
      </CollapsibleCard>

      <CollapsibleCard title="Custom CSV Schema" defaultOpen={false}>
        <CustomCsvSchemaBody />
      </CollapsibleCard>

      <CollapsibleCard title="Processing Control" defaultOpen={false}>
        <ProcessingControlBody />
      </CollapsibleCard>

      <CollapsibleCard title="Technical Settings" defaultOpen={false}>
        <TechnicalSettingsBody />
      </CollapsibleCard>
    </>
  )
}

// ---------------- card primitives ----------------

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass-strong" style={{ padding: 16 }}>
      <h3 className="section-title" style={{ fontSize: 14, marginBottom: 12 }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function CollapsibleCard({
  title,
  defaultOpen = true,
  children
}: {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="glass-strong" style={{ padding: 16 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          fontSize: 14,
          fontWeight: 600,
          color: 'inherit',
          textAlign: 'left',
          fontFamily: 'inherit'
        }}
      >
        <ChevronRight
          size={14}
          style={{
            transition: 'transform 0.15s ease',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            flexShrink: 0
          }}
        />
        <span className="section-title" style={{ fontSize: 14, margin: 0 }}>
          {title}
        </span>
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  )
}

// ---------------- shared field components ----------------

function ToggleField({
  fieldKey,
  label
}: {
  fieldKey:
    | 'autoRenameAfterApprove'
    | 'autoRenameAfterSuccess'
    | 'keepOriginalBackup'
    | 'useTitleCase'
    | 'useLowercaseFilename'
    | 'replaceSpacesWithHyphen'
    | 'addNumberIfDuplicate'
    | 'autosaveProject'
    | 'tooltipsEnabled'
    | 'autoSwitchOnLimit'
    | 'stopOnTooManyFailures'
  label: string
}) {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  return (
    <label className="row" style={{ gap: 8, fontSize: 13 }}>
      <input
        type="checkbox"
        checked={settings[fieldKey]}
        onChange={(e) => update({ [fieldKey]: e.target.checked } as Partial<typeof settings>)}
      />
      {label}
    </label>
  )
}

function PlatformPresetField() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  return (
    <div className="field">
      <span className="label">Platform Preset</span>
      <select
        className="select"
        value={settings.platformPreset}
        onChange={(e) => {
          const preset = PLATFORM_PRESETS.find((p) => p.value === e.target.value)
          if (!preset) return
          if (preset.value === 'Custom') {
            update({ platformPreset: preset.value })
          } else {
            update({ platformPreset: preset.value, defaultKeywordCount: preset.keywords })
          }
        }}
      >
        {PLATFORM_PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.value}
          </option>
        ))}
      </select>
    </div>
  )
}

function DefaultKeywordCountField() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  const valueIsCustom = !KEYWORD_COUNT_PRESETS.includes(settings.defaultKeywordCount)
  const [forceCustom, setForceCustom] = useState<boolean>(valueIsCustom)
  const showCustom = valueIsCustom || forceCustom
  const [customDraft, setCustomDraft] = useState<string>(
    valueIsCustom ? String(settings.defaultKeywordCount) : ''
  )

  return (
    <div className="field">
      <span className="label">
        Default Keyword Count{' '}
        <InfoIcon
          content={`Default number of keywords requested from the AI per file. Pick a preset or choose Custom… to enter any value between ${KEYWORD_COUNT_MIN} and ${KEYWORD_COUNT_MAX}.`}
        />
      </span>
      <div className="row" style={{ gap: 6 }}>
        <select
          className="select"
          value={showCustom ? 'custom' : String(settings.defaultKeywordCount)}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'custom') {
              setForceCustom(true)
              if (customDraft.trim() === '') {
                setCustomDraft(String(settings.defaultKeywordCount))
              }
            } else {
              setForceCustom(false)
              setCustomDraft('')
              update({ defaultKeywordCount: Number(v) })
            }
          }}
        >
          {KEYWORD_COUNT_PRESETS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
        {showCustom && (
          <input
            type="number"
            className="input"
            style={{ width: 96 }}
            min={KEYWORD_COUNT_MIN}
            max={KEYWORD_COUNT_MAX}
            step={1}
            value={customDraft}
            placeholder={`${KEYWORD_COUNT_MIN}–${KEYWORD_COUNT_MAX}`}
            aria-label="Custom keyword count"
            onChange={(e) => setCustomDraft(e.target.value)}
            onBlur={() => {
              const trimmed = customDraft.trim()
              const parsed = trimmed === '' ? NaN : Number(trimmed)
              if (!Number.isFinite(parsed)) {
                setCustomDraft(String(settings.defaultKeywordCount))
                return
              }
              const next = clampKeywordCount(parsed)
              setCustomDraft(String(next))
              if (next !== settings.defaultKeywordCount) {
                update({ defaultKeywordCount: next })
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
          />
        )}
      </div>
    </div>
  )
}

function DefaultViewModeField() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  return (
    <div className="field">
      <span className="label">Default View Mode</span>
      <select
        className="select"
        value={settings.defaultViewMode}
        onChange={(e) => update({ defaultViewMode: e.target.value as 'comfort' | 'compact' })}
      >
        <option value="comfort">Comfort</option>
        <option value="compact">Compact</option>
      </select>
    </div>
  )
}

/**
 * Theme picker. `'system'` (the default) tracks the host OS appearance via
 * `prefers-color-scheme`; `'light'` / `'dark'` pin the app regardless of
 * what the OS does. The renderer's `useTheme` hook owns applying the
 * resulting `data-theme` attribute on `<html>`.
 */
function ThemeField() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  return (
    <div className="field">
      <span className="label">Theme</span>
      <select
        className="select"
        value={settings.theme}
        onChange={(e) => update({ theme: e.target.value as 'light' | 'dark' | 'system' })}
      >
        <option value="system">Match system</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  )
}

// ---------------- advanced section bodies ----------------

function RenameRulesBody() {
  return (
    <>
      <OutputFolderField />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <AutoRenameOutputToggle />
        <ToggleField
          fieldKey="autoRenameAfterSuccess"
          label="Auto rename after metadata Success (no review)"
        />
        <ToggleField fieldKey="useTitleCase" label="Use Title Case for filenames" />
        <ToggleField fieldKey="useLowercaseFilename" label="Use lowercase filenames" />
        <ToggleField fieldKey="replaceSpacesWithHyphen" label="Replace spaces with hyphen" />
        <ToggleField fieldKey="addNumberIfDuplicate" label="Add number if duplicate exists" />
        <ToggleField fieldKey="keepOriginalBackup" label="Keep original backup" />
      </div>
    </>
  )
}

/**
 * One global Output Folder. Single source of truth for every “finished
 * files go here” code path (Approve copy/embed, Save Output Files on the
 * Export page, etc.). Originals are never modified — the app only writes
 * copies into this folder. Shown in both Simple and Advanced settings so
 * the daily user never has to leave Simple mode to point the app at a
 * folder.
 */
function OutputFolderField() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  const showToast = useAppStore((s) => s.showToast)

  async function pickFolder() {
    const res = await window.api.selectFolderPath()
    if (res.ok && res.path) {
      update({ outputFolder: res.path })
      showToast('success', `Output folder set`)
    }
  }

  return (
    <div className="field">
      <span className="label">
        Output Folder{' '}
        <InfoIcon content="One global folder. Approved metadata is embedded into a copy that lands here — originals are never changed. Used by Approve and the Save Output Files page. Leave empty to embed in-place into the source file." />
      </span>
      <div className="row" style={{ gap: 6 }}>
        <input
          className="input"
          value={settings.outputFolder}
          placeholder="(none — in-place embed will be used)"
          onChange={(e) => update({ outputFolder: e.target.value })}
        />
        <button className="btn" onClick={pickFolder}>
          <FolderOpen size={14} /> Browse
        </button>
      </div>
    </div>
  )
}

/**
 * The single “Auto-rename” toggle the user actually thinks about. Renamed
 * from the historical “Auto rename after Approve” so it matches the new
 * Output-Files vocabulary and makes it explicit that this is about the
 * copied output file, never the original.
 */
function AutoRenameOutputToggle() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  return (
    <label className="row" style={{ gap: 8, fontSize: 13, alignItems: 'flex-start' }}>
      <input
        type="checkbox"
        checked={settings.autoRenameAfterApprove}
        onChange={(e) => update({ autoRenameAfterApprove: e.target.checked })}
        style={{ marginTop: 3 }}
      />
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span>
          Auto-rename output files after metadata is ready{' '}
          <InfoIcon content="Uses the generated title to name copied output files. Original files stay unchanged." />
        </span>
        <span className="text-muted" style={{ fontSize: 11 }}>
          Uses the generated title to name copied output files. Original files stay unchanged.
        </span>
      </span>
    </label>
  )
}

function ProjectUxBody() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ToggleField fieldKey="autosaveProject" label="Auto-save project" />
        <ToggleField fieldKey="tooltipsEnabled" label="Show tooltips" />
        <div className="field">
          <span className="label">Log Retention (entries)</span>
          <input
            type="number"
            className="input"
            value={settings.logRetention}
            onChange={(e) => update({ logRetention: Number(e.target.value) })}
          />
        </div>
      </div>
      <SessionActions />
    </>
  )
}

/**
 * Session save/load controls — moved here from the global TopBar so they
 * sit next to the "Auto-save project" toggle they relate to. A "session"
 * is the entire app state: file queue, generated metadata, settings, API
 * keys (encrypted), logs. Saving writes a `.snmproj.json` file the user
 * can re-open later (e.g. to back up work, share with another machine, or
 * keep multiple platforms' work separate). Auto-save is on by default and
 * covers the common case; these buttons are for explicit checkpoints.
 */
function SessionActions() {
  const project = useAppStore((s) => s.project)
  const { saveProject, openProject } = useProjectActions()

  const lastSaved = project.lastSavedAt ? new Date(project.lastSavedAt).toLocaleString() : null

  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: '1px solid var(--c-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className="label" style={{ marginRight: 4 }}>
          Session
        </span>
        <button
          type="button"
          className="btn btn-sm"
          title="Open a previously saved session file (.snmproj.json) — replaces the current queue and metadata."
          onClick={() => {
            void openProject()
          }}
        >
          <FolderInput size={14} /> Open Session…
        </button>
        <button
          type="button"
          className="btn btn-sm"
          title="Write the current queue, metadata, and settings to a session file (.snmproj.json)."
          onClick={() => {
            void saveProject(true)
          }}
        >
          <Save size={14} /> Save Session…
        </button>
      </div>
      <p className="section-sub" style={{ margin: 0, fontSize: 11 }}>
        Backup or move the entire workspace (file queue, generated metadata, settings) to a portable{' '}
        <code>.snmproj.json</code> file.
        {lastSaved && (
          <>
            {' '}
            Last saved: <strong>{lastSaved}</strong>
            {project.filePath ? ` · ${project.filePath}` : ''}
          </>
        )}
      </p>
    </div>
  )
}

function TechnicalSettingsBody() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
      <div className="field">
        <span className="label">
          API Timeout (ms){' '}
          <InfoIcon content="Maximum time to wait for an API response before retrying." />
        </span>
        <input
          type="number"
          className="input"
          value={settings.apiTimeoutMs}
          onChange={(e) => update({ apiTimeoutMs: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <span className="label">Retry Count</span>
        <input
          type="number"
          className="input"
          value={settings.retryCount}
          onChange={(e) => update({ retryCount: Number(e.target.value) })}
        />
      </div>
      <div className="field">
        <span className="label">
          Video Frame Count{' '}
          <InfoIcon content="How many frames to extract from videos before sending to vision models." />
        </span>
        <input
          type="number"
          className="input"
          value={settings.videoFrameCount}
          onChange={(e) => update({ videoFrameCount: Number(e.target.value) })}
        />
      </div>
    </div>
  )
}

function clampInt(raw: number, min: number, max: number): number {
  if (!Number.isFinite(raw)) return min
  const n = Math.round(raw)
  return Math.max(min, Math.min(max, n))
}

// ---------------- Custom CSV schema editor ----------------

const SOURCE_KEYS: Array<{
  value: AppSettings['customCsvSchema']['columns'][number]['source']
  label: string
}> = [
  { value: 'filename', label: 'Filename (current)' },
  { value: 'originalFilename', label: 'Original filename' },
  { value: 'newFilename', label: 'New filename (from rename preview)' },
  { value: 'title', label: 'Title' },
  { value: 'description', label: 'Description' },
  { value: 'keywords', label: 'Keywords (joined)' },
  { value: 'category', label: 'Category (free-text from AI)' },
  { value: 'adobeCategory', label: 'Adobe Stock category (auto 1\u201321)' },
  { value: 'fileType', label: 'File type' },
  { value: 'status', label: 'Status' },
  { value: 'apiProvider', label: 'API provider' },
  { value: 'empty', label: 'Empty (blank cell)' }
]

const DELIMITER_OPTIONS: Array<{ value: ',' | ';' | '\t'; label: string }> = [
  { value: ',', label: 'Comma  ,' },
  { value: ';', label: 'Semicolon  ;' },
  { value: '\t', label: 'Tab' }
]

function CustomCsvSchemaBody() {
  const schema = useAppStore((s) => s.settings.customCsvSchema)
  const platformPreset = useAppStore((s) => s.settings.platformPreset)
  const update = useAppStore((s) => s.updateSettings)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

  const isCustomActive = platformPreset === 'Custom'

  function patchSchema(next: AppSettings['customCsvSchema']) {
    update({ customCsvSchema: next })
  }

  function moveColumn(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return
    const cols = [...schema.columns]
    const [item] = cols.splice(from, 1)
    cols.splice(to, 0, item)
    patchSchema({ ...schema, columns: cols })
  }

  function updateColumn(
    index: number,
    patch: Partial<AppSettings['customCsvSchema']['columns'][number]>
  ) {
    const cols = schema.columns.map((c, i) => (i === index ? { ...c, ...patch } : c))
    patchSchema({ ...schema, columns: cols })
  }

  function deleteColumn(index: number) {
    if (schema.columns.length <= 1) return
    patchSchema({ ...schema, columns: schema.columns.filter((_, i) => i !== index) })
  }

  function addColumn() {
    patchSchema({
      ...schema,
      columns: [...schema.columns, { header: 'New column', source: 'empty' }]
    })
  }

  function resetTo(name: 'Adobe Stock' | 'Shutterstock' | 'Freepik' | 'Pond5' | 'Default') {
    if (name === 'Default') {
      patchSchema({
        columns: DEFAULT_CUSTOM_SCHEMA.columns.map((c) => ({ ...c })),
        delimiter: DEFAULT_CUSTOM_SCHEMA.delimiter
      })
      return
    }
    const src = PLATFORM_SCHEMAS[name]
    patchSchema({
      columns: src.columns.map((c) => ({ ...c })),
      delimiter: src.delimiter
    })
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>, index: number) {
    setDragIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    // Firefox needs *something* in dataTransfer or the drag never starts.
    e.dataTransfer.setData('text/plain', String(index))
  }
  function handleDragOver(e: DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropTarget !== index) setDropTarget(index)
  }
  function handleDrop(e: DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault()
    if (dragIndex !== null) moveColumn(dragIndex, index)
    setDragIndex(null)
    setDropTarget(null)
  }
  function handleDragEnd() {
    setDragIndex(null)
    setDropTarget(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="text-soft" style={{ margin: 0, fontSize: 12 }}>
        These columns are used when <strong style={{ fontWeight: 600 }}>Platform = Custom</strong>{' '}
        on the Export page. Drag the <GripVertical size={11} style={{ verticalAlign: '-2px' }} />{' '}
        handle to reorder. Built-in platform schemas (Adobe Stock, Shutterstock, etc.) are not
        affected by this editor.
      </p>

      {!isCustomActive && (
        <div className="warn-banner" style={{ fontSize: 12 }}>
          Current Platform Preset is <strong>{platformPreset}</strong>. Switch Platform to{' '}
          <strong>Custom</strong> on the Export page (or set Platform Preset above to Custom) for
          this schema to take effect.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {schema.columns.map((col, i) => (
          <div
            key={i}
            draggable
            onDragStart={(e) => handleDragStart(e, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={(e) => handleDrop(e, i)}
            onDragEnd={handleDragEnd}
            style={{
              display: 'grid',
              gridTemplateColumns: '20px 1fr 1.4fr 28px',
              gap: 8,
              alignItems: 'center',
              padding: '6px 8px',
              borderRadius: 6,
              border:
                dropTarget === i && dragIndex !== null && dragIndex !== i
                  ? '1px dashed var(--c-accent-3)'
                  : '1px solid var(--c-border)',
              background: dragIndex === i ? 'var(--c-bg-hover, rgba(0,0,0,0.03))' : 'transparent',
              opacity: dragIndex === i ? 0.6 : 1,
              cursor: 'grab'
            }}
          >
            <GripVertical size={14} className="text-muted" style={{ flexShrink: 0 }} />
            <input
              className="input"
              value={col.header}
              onChange={(e) => updateColumn(i, { header: e.target.value })}
              placeholder="CSV header label"
              style={{ minWidth: 0 }}
            />
            <select
              className="select"
              value={col.source}
              onChange={(e) =>
                updateColumn(i, {
                  source: e.target
                    .value as AppSettings['customCsvSchema']['columns'][number]['source']
                })
              }
              style={{ minWidth: 0 }}
            >
              {SOURCE_KEYS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              aria-label={`Remove column ${col.header || i + 1}`}
              disabled={schema.columns.length <= 1}
              onClick={() => deleteColumn(i)}
              style={{ padding: 4 }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" onClick={addColumn}>
          <Plus size={13} /> Add column
        </button>
        <span className="text-muted" style={{ fontSize: 12, alignSelf: 'center' }}>
          Reset to:
        </span>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => resetTo('Adobe Stock')}
        >
          Adobe
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          onClick={() => resetTo('Shutterstock')}
        >
          Shutterstock
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => resetTo('Freepik')}>
          Freepik
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => resetTo('Pond5')}>
          Pond5
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => resetTo('Default')}>
          Default
        </button>
      </div>

      <div className="field" style={{ maxWidth: 220 }}>
        <span className="label">Delimiter</span>
        <select
          className="select"
          value={schema.delimiter}
          onChange={(e) =>
            patchSchema({ ...schema, delimiter: e.target.value as ',' | ';' | '\t' })
          }
        >
          {DELIMITER_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ProcessingControlBody() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)

  const workerWarning =
    settings.workerCount > 25
      ? {
          tone: 'danger' as const,
          text: 'Very high worker count is not recommended for most API providers. Use only if you have enough quota and multiple API keys.'
        }
      : settings.workerCount > 10
        ? {
            tone: 'warning' as const,
            text: 'High worker count may trigger API rate limits, increase failures, or make processing unstable.'
          }
        : null

  return (
    <>
      <p className="section-sub" style={{ marginTop: 0 }}>
        Concurrency, delays, retries, and rate-limit behavior. Defaults are safe for one API key.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          marginTop: 12
        }}
      >
        <div className="field">
          <span className="label">
            Worker Count{' '}
            <InfoIcon content="How many files are processed concurrently. Recommended 1–5. Maximum 50." />
          </span>
          <input
            type="number"
            className="input"
            min={1}
            max={50}
            step={1}
            value={settings.workerCount}
            onChange={(e) => update({ workerCount: clampInt(Number(e.target.value), 1, 50) })}
          />
        </div>

        <div className="field">
          <span className="label">
            Delay Between Files (ms){' '}
            <InfoIcon content="Pause each worker before pulling the next file from the queue." />
          </span>
          <input
            type="number"
            className="input"
            min={0}
            max={600000}
            step={100}
            value={settings.delayBetweenFilesMs}
            onChange={(e) =>
              update({ delayBetweenFilesMs: clampInt(Number(e.target.value), 0, 600000) })
            }
          />
        </div>

        <div className="field">
          <span className="label">
            Delay Between API Calls (ms){' '}
            <InfoIcon content="Minimum time between two requests on the same API key." />
          </span>
          <input
            type="number"
            className="input"
            min={0}
            max={600000}
            step={100}
            value={settings.delayBetweenApiCallsMs}
            onChange={(e) =>
              update({ delayBetweenApiCallsMs: clampInt(Number(e.target.value), 0, 600000) })
            }
          />
        </div>

        <div className="field">
          <span className="label">
            Max Retry Attempts{' '}
            <InfoIcon content="How many times a failed file is retried before being marked Failed." />
          </span>
          <input
            type="number"
            className="input"
            min={0}
            max={10}
            step={1}
            value={settings.maxRetryAttempts}
            onChange={(e) => update({ maxRetryAttempts: clampInt(Number(e.target.value), 0, 10) })}
          />
        </div>

        <div className="field">
          <span className="label">
            Retry Delay (ms) <InfoIcon content="Wait this long before retrying a failed request." />
          </span>
          <input
            type="number"
            className="input"
            min={0}
            max={600000}
            step={100}
            value={settings.retryDelayMs}
            onChange={(e) => update({ retryDelayMs: clampInt(Number(e.target.value), 0, 600000) })}
          />
        </div>

        <div className="field">
          <span className="label">
            Rate Limit Cooldown (sec){' '}
            <InfoIcon content="When an API key returns a rate-limit error, mark it Limited for this many seconds." />
          </span>
          <input
            type="number"
            className="input"
            min={1}
            max={3600}
            step={1}
            value={settings.rateLimitCooldownSec}
            onChange={(e) =>
              update({ rateLimitCooldownSec: clampInt(Number(e.target.value), 1, 3600) })
            }
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          marginTop: 12,
          alignItems: 'end'
        }}
      >
        <ToggleField fieldKey="autoSwitchOnLimit" label="Auto Switch API Key on Limit" />
        <ToggleField fieldKey="stopOnTooManyFailures" label="Stop on Too Many Failures" />

        <div className="field">
          <span className="label">
            Failure Threshold{' '}
            <InfoIcon content="Pause the queue after this many consecutive failed files (only if Stop on Too Many Failures is on)." />
          </span>
          <input
            type="number"
            className="input"
            min={1}
            max={1000}
            step={1}
            value={settings.failureThreshold}
            disabled={!settings.stopOnTooManyFailures}
            onChange={(e) =>
              update({ failureThreshold: clampInt(Number(e.target.value), 1, 1000) })
            }
          />
        </div>
      </div>

      {workerWarning && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 10,
            fontSize: 12,
            background:
              workerWarning.tone === 'danger'
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(234, 179, 8, 0.14)',
            color:
              workerWarning.tone === 'danger'
                ? 'var(--c-danger, #b91c1c)'
                : 'var(--c-warning, #92400e)',
            border:
              workerWarning.tone === 'danger'
                ? '1px solid rgba(239, 68, 68, 0.4)'
                : '1px solid rgba(234, 179, 8, 0.4)'
          }}
        >
          {workerWarning.text}
        </div>
      )}
    </>
  )
}
