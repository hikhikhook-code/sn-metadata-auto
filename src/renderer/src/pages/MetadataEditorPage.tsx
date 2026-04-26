import { useMemo, useState } from 'react'
import { useAppStore } from '@renderer/store/store'
import { FilePreview } from '@renderer/components/metadata/FilePreview'
import { StatusBadge } from '@renderer/components/ui/StatusBadge'
import { InfoIcon } from '@renderer/components/ui/Tooltip'
import { KeywordChipList } from '@renderer/components/keywords/KeywordChipList'
import { CATEGORIES } from '@renderer/utils/categories'
import { formatDateTime } from '@renderer/utils/format'
import { Save, RefreshCcw, FileEdit, Sparkles, RotateCcw } from 'lucide-react'
import { useBatchControls, useRename } from '@renderer/hooks/useBatch'

type Tab = 'main' | 'keywords' | 'rename'

export function MetadataEditorPage() {
  const files = useAppStore((s) => s.files)
  const settings = useAppStore((s) => s.settings)
  const updateEdited = useAppStore((s) => s.updateEditedMetadata)
  const saveMetadata = useAppStore((s) => s.saveMetadata)
  const resetToAi = useAppStore((s) => s.resetToAi)
  const setRenamePreview = useAppStore((s) => s.setRenamePreview)
  const showToast = useAppStore((s) => s.showToast)
  const { regenerateOne } = useBatchControls()
  const rename = useRename()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('main')

  const editable = useMemo(() => files.filter((f) => f.aiMetadata || f.editedMetadata), [files])

  const file = editable.find((f) => f.id === selectedId) ?? editable[0] ?? null
  const meta = file?.editedMetadata ?? file?.aiMetadata

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="section-title">Metadata Editor</h2>
          <p className="section-sub">
            Re-edit metadata for files that already have a generated version. Useful when revisiting
            an old project.
          </p>
        </div>
      </div>

      {editable.length === 0 ? (
        <div className="empty-state glass-soft" style={{ padding: 40 }}>
          <FileEdit size={28} />
          <p className="section-sub">
            Nothing to edit yet — generate metadata first, or open a saved project.
          </p>
        </div>
      ) : (
        <div
          className="page-body"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(240px, 320px) 1fr',
            gap: 14,
            minHeight: 0
          }}
        >
          <div
            className="glass"
            style={{
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              overflowY: 'auto'
            }}
          >
            {editable.map((f) => {
              const sel = file?.id === f.id
              const m = f.editedMetadata ?? f.aiMetadata
              return (
                <button
                  key={f.id}
                  onClick={() => setSelectedId(f.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '44px 1fr',
                    gap: 8,
                    padding: 8,
                    borderRadius: 12,
                    background: sel ? 'rgba(255,210,225,0.55)' : 'transparent',
                    border: sel ? '1px solid rgba(201,122,139,0.3)' : '1px solid transparent',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    if (!sel)
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.55)'
                  }}
                  onMouseLeave={(e) => {
                    if (!sel) (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  <FilePreview file={f} size={44} rounded={9} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {m?.title || f.originalFilename}
                    </div>
                    <div
                      className="text-muted"
                      style={{
                        fontSize: 11,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {f.originalFilename} · <StatusBadge status={f.status} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {!file || !meta ? (
            <div className="empty-state glass-soft">
              <Sparkles size={24} />
              <p className="section-sub">Select a file to start editing.</p>
            </div>
          ) : (
            <div className="glass-strong" style={{ padding: 16, overflowY: 'auto', minHeight: 0 }}>
              {(file.status === 'Renamed' ||
                file.status === 'Approved' ||
                file.status === 'Exported') && (
                <div className="warn-banner" style={{ marginBottom: 10, fontSize: 12 }}>
                  This file has already been {file.status.toLowerCase()}. Editing metadata may
                  require a new rename / re-export.
                </div>
              )}

              <div className="row" style={{ marginBottom: 10, gap: 4 }}>
                {(['main', 'keywords', 'rename'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    {t === 'main' ? 'Main Info' : t === 'keywords' ? 'Keywords' : 'Rename'}
                  </button>
                ))}
              </div>

              {tab === 'main' && (
                <div className="col" style={{ gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16 }}>
                    <FilePreview file={file} size={160} rounded={16} />
                    <div className="col" style={{ gap: 6 }}>
                      <div className="text-muted">
                        <strong style={{ color: 'var(--c-text-soft)' }}>Original:</strong>{' '}
                        {file.originalFilename}
                      </div>
                      <div className="text-muted">
                        <strong style={{ color: 'var(--c-text-soft)' }}>Current:</strong>{' '}
                        {file.currentFilename}
                      </div>
                      <div className="text-muted" style={{ fontSize: 11 }}>
                        Generated: {formatDateTime(file.generatedAt)} · Last edited:{' '}
                        {formatDateTime(file.lastEditedAt)}
                      </div>
                    </div>
                  </div>

                  <div className="field">
                    <span className="label">
                      Title <InfoIcon content="Microstock-friendly title under 70 chars." />
                    </span>
                    <input
                      className="input"
                      value={meta.title}
                      onChange={(e) => updateEdited(file.id, { title: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <span className="label">
                      Description <InfoIcon content="One natural sentence." />
                    </span>
                    <textarea
                      className="textarea"
                      rows={3}
                      value={meta.description}
                      onChange={(e) => updateEdited(file.id, { description: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <span className="label">
                      Category{' '}
                      <InfoIcon content="Pick a category that best matches the visual content." />
                    </span>
                    <select
                      className="select"
                      value={meta.category}
                      onChange={(e) => updateEdited(file.id, { category: e.target.value })}
                    >
                      <option value="">— Select —</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      {meta.category && !CATEGORIES.includes(meta.category) && (
                        <option value={meta.category}>{meta.category}</option>
                      )}
                    </select>
                  </div>

                  <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    <button
                      className="btn btn-ghost"
                      onClick={() => resetToAi(file.id)}
                      disabled={!file.aiMetadata}
                    >
                      <RotateCcw size={14} /> Reset to AI Version
                    </button>
                    <button className="btn btn-warning" onClick={() => void regenerateOne(file.id)}>
                      <RefreshCcw size={14} /> Regenerate This File
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        saveMetadata(file.id)
                        showToast('success', 'Saved')
                      }}
                    >
                      <Save size={14} /> Save Changes
                    </button>
                  </div>
                </div>
              )}

              {tab === 'keywords' && (
                <div className="col" style={{ gap: 10 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="label" style={{ marginBottom: 0 }}>
                      Keywords{' '}
                      <InfoIcon content="Drag to reorder, double-click to edit, Enter / comma to add multiple." />
                    </span>
                    <select
                      className="select"
                      style={{ width: 'auto' }}
                      value={settings.defaultKeywordCount}
                      onChange={(e) =>
                        useAppStore
                          .getState()
                          .updateSettings({ defaultKeywordCount: Number(e.target.value) })
                      }
                    >
                      {[30, 40, 49, 50, 100].map((n) => (
                        <option key={n} value={n}>
                          Target {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <KeywordChipList
                    keywords={meta.keywords}
                    target={settings.defaultKeywordCount}
                    onChange={(next) => updateEdited(file.id, { keywords: next })}
                  />
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        saveMetadata(file.id)
                        showToast('success', 'Keyword order saved')
                      }}
                    >
                      <Save size={14} /> Save Keyword Order
                    </button>
                  </div>
                </div>
              )}

              {tab === 'rename' && (
                <div className="col" style={{ gap: 12 }}>
                  <div className="text-muted">
                    <strong>Original:</strong> {file.originalFilename}
                  </div>
                  <div className="text-muted">
                    <strong>Current:</strong> {file.currentFilename}
                  </div>
                  <div className="field">
                    <span className="label">
                      Rename Preview{' '}
                      <InfoIcon content="The filename that will be applied when you click Approve & Rename." />
                    </span>
                    <input
                      className="input"
                      value={file.renamePreview ?? ''}
                      onChange={(e) => setRenamePreview(file.id, e.target.value)}
                    />
                  </div>
                  <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    <label className="row" style={{ gap: 6, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={settings.addNumberIfDuplicate}
                        onChange={(e) =>
                          useAppStore
                            .getState()
                            .updateSettings({ addNumberIfDuplicate: e.target.checked })
                        }
                      />
                      Add number if duplicate
                    </label>
                    <label className="row" style={{ gap: 6, fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={settings.keepOriginalBackup}
                        onChange={(e) =>
                          useAppStore
                            .getState()
                            .updateSettings({ keepOriginalBackup: e.target.checked })
                        }
                      />
                      Keep original backup
                    </label>
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-success" onClick={() => void rename(file.id)}>
                      Rename Now
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
