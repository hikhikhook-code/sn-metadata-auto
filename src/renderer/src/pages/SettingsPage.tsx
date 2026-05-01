import { useAppStore } from '@renderer/store/store'
import { InfoIcon } from '@renderer/components/ui/Tooltip'
import { ChevronRight, FolderOpen } from 'lucide-react'
import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  KEYWORD_COUNT_PRESETS,
  KEYWORD_COUNT_MIN,
  KEYWORD_COUNT_MAX,
  clampKeywordCount
} from '@renderer/utils/keywordCount'
import type { SettingsMode } from '@renderer/types'

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
    background: 'var(--c-bg-elev, rgba(255,255,255,0.85))',
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
        background: 'var(--c-bg-soft, rgba(255,255,255,0.4))',
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
        </div>
      </Card>

      <Card title="File Behavior">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <ToggleField fieldKey="autoRenameAfterApprove" label="Auto rename after Approve" />
          <ToggleField fieldKey="keepOriginalBackup" label="Keep original backup" />
        </div>
      </Card>

      <Card title="Project">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <ToggleField fieldKey="autosaveProject" label="Auto-save project" />
          <ToggleField fieldKey="tooltipsEnabled" label="Show tooltips" />
        </div>
        <div style={{ marginTop: 12, maxWidth: 280 }}>
          <DefaultViewModeField />
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
        </div>
      </Card>

      <CollapsibleCard title="Rename Rules" defaultOpen>
        <RenameRulesBody />
      </CollapsibleCard>

      <CollapsibleCard title="Project & UX" defaultOpen>
        <ProjectUxBody />
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

// ---------------- advanced section bodies ----------------

function RenameRulesBody() {
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
    <>
      <div className="field">
        <span className="label">
          Output Folder{' '}
          <InfoIcon content="Optional. Used as a default location for exports and backups." />
        </span>
        <div className="row" style={{ gap: 6 }}>
          <input
            className="input"
            value={settings.outputFolder}
            placeholder="(none)"
            onChange={(e) => update({ outputFolder: e.target.value })}
          />
          <button className="btn" onClick={pickFolder}>
            <FolderOpen size={14} /> Browse
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <ToggleField
          fieldKey="autoRenameAfterSuccess"
          label="Auto rename after metadata Success (no review)"
        />
        <ToggleField fieldKey="useTitleCase" label="Use Title Case for filenames" />
        <ToggleField fieldKey="useLowercaseFilename" label="Use lowercase filenames" />
        <ToggleField fieldKey="replaceSpacesWithHyphen" label="Replace spaces with hyphen" />
        <ToggleField fieldKey="addNumberIfDuplicate" label="Add number if duplicate exists" />
      </div>
    </>
  )
}

function ProjectUxBody() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
