import { useMemo, useState } from 'react'
import { useAppStore } from '@renderer/store/store'
import type { AppFile, FileStatus } from '@renderer/types'
import { FileDown, Eye } from 'lucide-react'
import { formatDateTime } from '@renderer/utils/format'

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

  const rows = useMemo(() => {
    let pool = files
    if (scope === 'selected') pool = files.filter((f) => selected.includes(f.id))
    if (scope === 'approved')
      pool = files.filter(
        (f) => f.status === 'Approved' || f.status === 'Renamed' || f.status === 'Exported'
      )
    if (scope === 'saved') pool = files.filter((f) => COMPLETE_STATUSES.includes(f.status))
    if (scope === 'failed') pool = files.filter((f) => f.status === 'Failed')
    return pool.filter((f) => f.aiMetadata || f.editedMetadata).map(fileToRow)
  }, [files, selected, scope])

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

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="text-soft" style={{ fontSize: 13 }}>
            {rows.length} row(s) ready to export.
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
