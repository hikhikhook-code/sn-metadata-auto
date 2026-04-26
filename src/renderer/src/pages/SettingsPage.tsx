import { useAppStore } from '@renderer/store/store'
import { InfoIcon } from '@renderer/components/ui/Tooltip'
import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import {
  KEYWORD_COUNT_PRESETS,
  KEYWORD_COUNT_MIN,
  KEYWORD_COUNT_MAX,
  clampKeywordCount
} from '@renderer/utils/keywordCount'

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
  const showToast = useAppStore((s) => s.showToast)

  const valueIsCustom = !KEYWORD_COUNT_PRESETS.includes(settings.defaultKeywordCount)
  const [forceCustom, setForceCustom] = useState<boolean>(valueIsCustom)
  const showCustom = valueIsCustom || forceCustom
  const [customDraft, setCustomDraft] = useState<string>(
    valueIsCustom ? String(settings.defaultKeywordCount) : ''
  )

  async function pickFolder() {
    const res = await window.api.selectFolderPath()
    if (res.ok && res.path) {
      update({ outputFolder: res.path })
      showToast('success', `Output folder set`)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="section-title">Settings</h2>
          <p className="section-sub">
            Defaults applied across the app. All settings are saved with your project.
          </p>
        </div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div
          className="glass-strong"
          style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
        >
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
                    const parsed = Number(customDraft)
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
        </div>

        <div className="glass-strong" style={{ padding: 16 }}>
          <h3 className="section-title" style={{ fontSize: 14 }}>
            Auto-rename
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            {(
              [
                ['autoRenameAfterApprove', 'Auto rename after Approve'],
                ['autoRenameAfterSuccess', 'Auto rename after metadata Success (no review)'],
                ['keepOriginalBackup', 'Keep original backup in _originals/'],
                ['useTitleCase', 'Use Title Case for filenames'],
                ['useLowercaseFilename', 'Use lowercase filenames'],
                ['replaceSpacesWithHyphen', 'Replace spaces with hyphen'],
                ['addNumberIfDuplicate', 'Add number if duplicate exists']
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="row" style={{ gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={(e) => update({ [key]: e.target.checked } as Partial<typeof settings>)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="glass-strong" style={{ padding: 16 }}>
          <h3 className="section-title" style={{ fontSize: 14 }}>
            Project &amp; UX
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={settings.autosaveProject}
                onChange={(e) => update({ autosaveProject: e.target.checked })}
              />
              Auto-save project
            </label>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={settings.tooltipsEnabled}
                onChange={(e) => update({ tooltipsEnabled: e.target.checked })}
              />
              Show tooltips (i)
            </label>
          </div>
        </div>

        <div
          className="glass-strong"
          style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}
        >
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
      </div>
    </div>
  )
}
