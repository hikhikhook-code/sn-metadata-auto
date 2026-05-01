import { useMemo, useState } from 'react'
import { useAppStore } from '@renderer/store/store'
import { IMAGE_EXTS, VIDEO_EXTS, VECTOR_EXTS } from '@renderer/types'
import type { AppFile, FileStatus } from '@renderer/types'
import { AlertTriangle, FileDown, Eye, Tag } from 'lucide-react'
import { formatDateTime } from '@renderer/utils/format'
import { TITLE_HARD_MAX, TITLE_RECOMMENDED_MAX } from '@renderer/utils/title'

type EmbedMode = 'copy' | 'in-place'

const EMBED_SUPPORTED: ReadonlySet<string> = new Set<string>([
  ...IMAGE_EXTS,
  ...VIDEO_EXTS,
  ...VECTOR_EXTS
])

type Scope = 'all' | 'selected' | 'approved' | 'saved' | 'failed'

function fileToRow(f: AppFile): Record<string, unknown> {
  const m = f.editedMetadata ?? f.aiMetadata
  return {
    original_filename: f.originalFilename,
    current_filename: f.currentFilename,
    new_filename: f.renamePreview ?? '',
    title: m?.title ?? '',
    description: m?.description ?? '',
    keywords: (m?.keywords ?? []).join(', '),
    category: m?.category ?? '',
    file_type: String(f.fileType).toLowerCase(),
    status: f.status,
    api_provider: f.apiProvider ?? '',
    api_key_used: f.apiKeySlot ?? '',
    generated_at: f.generatedAt ?? '',
    last_edited_at: f.lastEditedAt ?? ''
  }
}

const COMPLETE_STATUSES: FileStatus[] = [
  'Generated',
  'Edited',
  'Saved',
  'Approved',
  'Renamed',
  'Exported'
]

export function ExportPage() {
  const files = useAppStore((s) => s.files)
  const selected = useAppStore((s) => s.selectedFileIds)
  const showToast = useAppStore((s) => s.showToast)
  const addLog = useAppStore((s) => s.addLog)

  const [scope, setScope] = useState<Scope>('all')
  const [format, setFormat] = useState<'csv' | 'txt' | 'json' | 'xlsx'>('csv')
  const [showPreview, setShowPreview] = useState(false)
  const [embedMode, setEmbedMode] = useState<EmbedMode>('copy')
  const [embedBackup, setEmbedBackup] = useState(true)
  const [embedFolder, setEmbedFolder] = useState('embedded')
  const [embedBusy, setEmbedBusy] = useState(false)

  const { rows, validFiles, dropped, longTitleCount } = useMemo(() => {
    let pool = files
    if (scope === 'selected') pool = files.filter((f) => selected.includes(f.id))
    if (scope === 'approved')
      pool = files.filter(
        (f) => f.status === 'Approved' || f.status === 'Renamed' || f.status === 'Exported'
      )
    if (scope === 'saved') pool = files.filter((f) => COMPLETE_STATUSES.includes(f.status))
    if (scope === 'failed') pool = files.filter((f) => f.status === 'Failed')

    const withMeta = pool.filter((f) => f.aiMetadata || f.editedMetadata)
    const droppedFiles: AppFile[] = []
    let warnTitle = 0
    const valid: AppFile[] = []
    for (const f of withMeta) {
      const m = f.editedMetadata ?? f.aiMetadata
      const t = (m?.title ?? '').trim()
      if (t.length === 0 || t.length > TITLE_HARD_MAX) {
        droppedFiles.push(f)
        continue
      }
      if (t.length > TITLE_RECOMMENDED_MAX) warnTitle++
      valid.push(f)
    }
    return {
      rows: valid.map(fileToRow),
      validFiles: valid,
      dropped: droppedFiles,
      longTitleCount: warnTitle
    }
  }, [files, selected, scope])

  const embedTargets = useMemo(
    () => validFiles.filter((f) => EMBED_SUPPORTED.has(String(f.fileType).toLowerCase())),
    [validFiles]
  )
  const embedSkipped = validFiles.length - embedTargets.length

  async function doEmbed() {
    if (embedTargets.length === 0) {
      showToast('warning', 'No files in scope support metadata embedding')
      return
    }
    setEmbedBusy(true)
    try {
      const payload = embedTargets.map((f) => {
        const m = f.editedMetadata ?? f.aiMetadata
        return {
          filePath: f.currentPath,
          fileType: String(f.fileType).toLowerCase(),
          metadata: {
            title: m?.title,
            description: m?.description,
            keywords: m?.keywords
          }
        }
      })
      const res = await window.api.metadata.embed({
        files: payload,
        mode: embedMode,
        backup: embedBackup,
        outputDirName: embedMode === 'copy' ? embedFolder : undefined
      })
      const okCount = res.results.filter((r) => r.ok).length
      const failCount = res.results.length - okCount
      if (failCount === 0) {
        addLog(
          'success',
          'EMBED',
          `Embedded metadata into ${okCount} file(s) (mode: ${embedMode})`
        )
        showToast('success', `Embedded ${okCount} file(s)`)
      } else if (okCount === 0) {
        addLog(
          'error',
          'EMBED',
          `Embed failed for all ${failCount} file(s). First error: ${res.results.find((r) => !r.ok)?.error ?? 'unknown'}`
        )
        showToast('error', `Embed failed for all ${failCount} file(s)`)
      } else {
        addLog(
          'warning',
          'EMBED',
          `Embedded ${okCount} file(s); ${failCount} failed. First error: ${res.results.find((r) => !r.ok)?.error ?? 'unknown'}`
        )
        showToast('warning', `Embedded ${okCount} of ${res.results.length} (${failCount} failed)`)
      }
      // Surface per-file failures so the user can see which files broke.
      for (const r of res.results) {
        if (!r.ok) {
          addLog(
            'error',
            'EMBED',
            `Embed failed for ${r.filePath}: ${r.error ?? 'unknown error'}`
          )
        }
      }
    } catch (err) {
      addLog('error', 'EMBED', `Embed crashed: ${(err as Error).message}`)
      showToast('error', `Embed crashed: ${(err as Error).message}`)
    } finally {
      setEmbedBusy(false)
    }
  }

  async function doExport() {
    if (rows.length === 0) {
      showToast('warning', 'Nothing to export with the current scope')
      return
    }
    const res = await window.api.exportData({
      format,
      rows,
      defaultName: `sn-metadata-${new Date().toISOString().slice(0, 10)}`
    })
    if (res.ok) {
      addLog('success', 'EXPORT', `Exported ${rows.length} row(s) → ${res.path}`)
      showToast('success', `Exported ${rows.length} row(s)`)
      // mark exported
      const exportedAt = new Date().toISOString()
      useAppStore.setState((s) => {
        for (const r of rows) {
          const f = s.files.find((x) => x.originalFilename === r.original_filename)
          if (f) f.exportedAt = exportedAt
        }
      })
    } else if (res.error) {
      addLog('error', 'EXPORT', `Export failed: ${res.error}`)
      showToast('error', `Export failed: ${res.error}`)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="section-title">Export</h2>
          <p className="section-sub">
            Export metadata to CSV, TXT, JSON, or XLSX. Keywords are written as a comma-separated
            list inside one cell.
          </p>
        </div>
      </div>

      <div
        className="glass-strong"
        style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <span className="label">Scope</span>
            <select
              className="select"
              value={scope}
              onChange={(e) => setScope(e.target.value as Scope)}
            >
              <option value="all">All files</option>
              <option value="selected">Selected files only</option>
              <option value="approved">Approved / Renamed / Exported only</option>
              <option value="saved">Saved (any completed)</option>
              <option value="failed">Failed (failure report)</option>
            </select>
          </div>
          <div className="field">
            <span className="label">Format</span>
            <select
              className="select"
              value={format}
              onChange={(e) => setFormat(e.target.value as 'csv' | 'txt' | 'json' | 'xlsx')}
            >
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX</option>
              <option value="json">JSON</option>
              <option value="txt">TXT</option>
            </select>
          </div>
        </div>

        {(dropped.length > 0 || longTitleCount > 0) && (
          <div
            className="warn-banner"
            style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}
          >
            <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dropped.length > 0 && (
                <span>
                  {dropped.length} file(s) skipped — title is empty or longer than {TITLE_HARD_MAX}{' '}
                  characters:{' '}
                  <span className="text-muted">
                    {dropped
                      .slice(0, 5)
                      .map((f) => f.originalFilename)
                      .join(', ')}
                    {dropped.length > 5 ? `, +${dropped.length - 5} more` : ''}
                  </span>
                </span>
              )}
              {longTitleCount > 0 && (
                <span>
                  {longTitleCount} row(s) have titles longer than {TITLE_RECOMMENDED_MAX} characters
                  and may be flagged on Adobe Stock.
                </span>
              )}
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="text-soft" style={{ fontSize: 13 }}>
            {rows.length} row(s) ready to export
            {dropped.length > 0 ? ` (${dropped.length} skipped)` : ''}.
          </span>
          <div className="row">
            <button
              className="btn"
              onClick={() => setShowPreview((v) => !v)}
              disabled={rows.length === 0}
            >
              <Eye size={14} /> {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <button className="btn btn-primary" onClick={doExport} disabled={rows.length === 0}>
              <FileDown size={14} /> Export {format.toUpperCase()}
            </button>
          </div>
        </div>
      </div>

      <div
        className="glass-strong"
        style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Embed metadata into files</h3>
          <p className="text-soft" style={{ margin: '4px 0 0 0', fontSize: 12 }}>
            Writes title, description, and keywords directly into each file via XMP / IPTC / EXIF
            (XMP for SVG and video). Use this when an upload portal (e.g. Adobe Stock) reads
            metadata from the file itself instead of a separate spreadsheet.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <span className="label">Mode</span>
            <select
              className="select"
              value={embedMode}
              onChange={(e) => setEmbedMode(e.target.value as EmbedMode)}
              disabled={embedBusy}
            >
              <option value="copy">Folder copy (safest, originals untouched)</option>
              <option value="in-place">In-place (overwrite original file)</option>
            </select>
          </div>
          {embedMode === 'copy' ? (
            <div className="field">
              <span className="label">Output folder name</span>
              <input
                className="input"
                value={embedFolder}
                onChange={(e) => setEmbedFolder(e.target.value)}
                placeholder="embedded"
                disabled={embedBusy}
              />
            </div>
          ) : (
            <div className="field" style={{ alignSelf: 'end' }}>
              <label
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                <input
                  type="checkbox"
                  checked={embedBackup}
                  onChange={(e) => setEmbedBackup(e.target.checked)}
                  disabled={embedBusy}
                />
                Create <code>.bak</code> backup before first overwrite
              </label>
            </div>
          )}
        </div>

        {embedMode === 'copy' ? (
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
            Each file is copied to <code>&lt;originalDir&gt;/{embedFolder || 'embedded'}/</code>{' '}
            before metadata is written. Original files stay untouched.
          </p>
        ) : (
          <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
            Metadata is written directly into the original file. Recommended only after you have
            verified results in folder-copy mode at least once.
          </p>
        )}

        {embedSkipped > 0 && (
          <div
            className="warn-banner"
            style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}
          >
            <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
            <span>
              {embedSkipped} file(s) in scope have a file type the embedder does not support and
              will be skipped.
            </span>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="text-soft" style={{ fontSize: 13 }}>
            {embedTargets.length} file(s) ready to embed
            {embedSkipped > 0 ? ` (${embedSkipped} unsupported)` : ''}.
          </span>
          <button
            className="btn btn-primary"
            onClick={doEmbed}
            disabled={embedBusy || embedTargets.length === 0}
          >
            <Tag size={14} /> {embedBusy ? 'Embedding…' : 'Embed metadata'}
          </button>
        </div>
      </div>

      {showPreview && rows.length > 0 && (
        <div className="page-body glass" style={{ padding: 8, overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                {Object.keys(rows[0]).map((k) => (
                  <th
                    key={k}
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      borderBottom: '1px solid var(--c-border-strong)',
                      color: 'var(--c-text-soft)',
                      fontWeight: 700,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  {Object.keys(rows[0]).map((k) => {
                    const v = r[k]
                    const text =
                      v === null || v === undefined
                        ? ''
                        : typeof v === 'string' && /_at$/.test(k)
                          ? formatDateTime(String(v))
                          : String(v)
                    return (
                      <td
                        key={k}
                        style={{
                          padding: '5px 8px',
                          borderBottom: '1px solid rgba(255,255,255,0.4)',
                          maxWidth: 220,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={text}
                      >
                        {text}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && (
            <div className="text-muted" style={{ padding: '6px 8px', fontSize: 11 }}>
              Showing 50 of {rows.length} rows. Full export will include all rows.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
