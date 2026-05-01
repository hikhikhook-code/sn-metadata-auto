import { useMemo, useState } from 'react'
import { useAppStore } from '@renderer/store/store'
import type { AppFile, FileStatus } from '@renderer/types'
import { AlertTriangle, FileDown, Eye, FolderOpen, Settings as SettingsIcon } from 'lucide-react'
import { formatDateTime } from '@renderer/utils/format'
import { TITLE_HARD_MAX, TITLE_RECOMMENDED_MAX } from '@renderer/utils/title'
import {
  applySchema,
  buildSourceRow,
  getSchema,
  PLATFORM_SCHEMAS,
  type CsvSchema,
  type Platform
} from '@renderer/services/csvSchema'

type Scope = 'all' | 'selected' | 'approved' | 'saved' | 'failed'

// Legacy generic row used for the in-page Preview table when no platform
// schema is selected (the preview always shows the canonical source row so
// the user can see every field we know). Real CSV/XLSX exports go through
// `applySchema()` so they match the active platform's column layout.
function fileToPreviewRow(f: AppFile): Record<string, unknown> {
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
  const setActivePage = useAppStore((s) => s.setActivePage)
  // The global Output Folder lives in Settings → Rename Rules and is the
  // single source of truth for every "finished files go here" path:
  // Approve auto-rename, manual Approve, embedded copies, etc. The Export
  // page only displays it as a read-only badge so users always know where
  // their CSVs reference and where embedded copies have already landed.
  const settingsOutputFolder = useAppStore((s) => s.settings.outputFolder)
  const settingsPlatform = useAppStore((s) => s.settings.platformPreset)
  const customSchemaSetting = useAppStore((s) => s.settings.customCsvSchema)

  const [scope, setScope] = useState<Scope>('all')
  const [format, setFormat] = useState<'csv' | 'txt' | 'json' | 'xlsx'>('csv')
  // Local export-time platform override. Initializes from the global Settings
  // preset so the daily user just hits Export with no extra clicks; power
  // users who export to multiple platforms one after another can switch
  // platform here without bouncing back to Settings.
  const [platform, setPlatform] = useState<Platform>(settingsPlatform)
  const [showPreview, setShowPreview] = useState(false)
  const trimmedOutputFolder = settingsOutputFolder?.trim() ?? ''

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
      rows: valid.map(fileToPreviewRow),
      validFiles: valid,
      dropped: droppedFiles,
      longTitleCount: warnTitle
    }
  }, [files, selected, scope])

  // The schema we'll actually emit when the user clicks Export. Built-in
  // platforms read from the static registry; Custom pulls from settings.
  const activeSchema: CsvSchema = useMemo(() => {
    const customLite: CsvSchema = {
      label: 'Custom',
      columns: customSchemaSetting.columns.map((c) => ({
        header: c.header,
        source: c.source
      })),
      delimiter: customSchemaSetting.delimiter
    }
    return getSchema(platform, customLite)
  }, [platform, customSchemaSetting])

  async function doExport() {
    if (rows.length === 0) {
      showToast('warning', 'Nothing to export with the current scope')
      return
    }
    // For CSV/XLSX, route through the platform schema. JSON keeps the
    // canonical source row (more useful for downstream automation) and TXT
    // keeps its key:value layout.
    let payloadRows: Record<string, unknown>[] = rows
    let payloadHeaders: string[] | undefined
    let payloadDelimiter: ',' | ';' | '\t' | undefined
    if (format === 'csv' || format === 'xlsx') {
      const sourceRows = validFiles.map(buildSourceRow)
      const { headers, data } = applySchema(sourceRows, activeSchema)
      payloadRows = data.map((cells) => {
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => {
          obj[h] = cells[i] ?? ''
        })
        return obj
      })
      payloadHeaders = headers
      if (format === 'csv') payloadDelimiter = activeSchema.delimiter
    }
    const platformSlug = platform.toLowerCase().replace(/\s+/g, '-')
    const res = await window.api.exportData({
      format,
      rows: payloadRows,
      defaultName: `sn-metadata-${platformSlug}-${new Date().toISOString().slice(0, 10)}`,
      delimiter: payloadDelimiter,
      headers: payloadHeaders
    })
    if (res.ok) {
      addLog(
        'success',
        'EXPORT',
        `Exported ${rows.length} row(s) (${platform}) → ${res.path}`
      )
      showToast('success', `Exported ${rows.length} row(s) for ${platform}`)
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
        {/* Read-only badge advertising the global Output Folder. We removed
            the per-export folder input so users can't accidentally diverge
            from the global setting; if they want to retarget, the only
            knob is in Settings → Rename Rules → Output Folder. */}
        <div
          className="row"
          style={{
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 10px',
            border: '1px solid var(--c-border)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.4)',
            fontSize: 12
          }}
        >
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}
          >
            <FolderOpen size={14} style={{ flexShrink: 0 }} />
            <span style={{ flexShrink: 0, fontWeight: 600 }}>Output folder:</span>
            <code
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: trimmedOutputFolder
                  ? 'var(--c-text-strong)'
                  : 'var(--c-text-soft)'
              }}
              title={trimmedOutputFolder || 'Not set'}
            >
              {trimmedOutputFolder || '(not set — using each file\u2019s source folder)'}
            </code>
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ flexShrink: 0, padding: '4px 8px', fontSize: 12 }}
            onClick={() => setActivePage('settings')}
          >
            <SettingsIcon size={12} /> Change in Settings
          </button>
        </div>

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

        {(format === 'csv' || format === 'xlsx') && (
          <div className="field" style={{ maxWidth: 320 }}>
            <span className="label">
              Platform{' '}
              <span className="text-muted" style={{ fontWeight: 400 }}>
                — column layout per microstock site
              </span>
            </span>
            <select
              className="select"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
            >
              {Object.entries(PLATFORM_SCHEMAS).map(([key, schema]) => (
                <option key={key} value={key}>
                  {schema.label}
                </option>
              ))}
              <option value="Custom">Custom</option>
            </select>
            <span className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
              {platform === 'Adobe Stock' &&
                'Filename, Title, Keywords, Category (auto 1–21), Releases. Comma-delimited.'}
              {platform === 'Shutterstock' &&
                'Filename, Description, Keywords, Categories, Editorial, Mature, Illustration. Comma-delimited.'}
              {platform === 'Freepik' && 'filename, title, keywords. Semicolon-delimited.'}
              {platform === 'Pond5' && 'Filename, Title, Description, Keywords. Comma-delimited.'}
              {platform === 'Custom' &&
                'Edit columns + delimiter in Settings → Advanced → Custom CSV Schema.'}
            </span>
          </div>
        )}

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

      {showPreview && rows.length > 0 && (
        // Cap the preview height so it stays a reasonable scrollable region
        // inside the page even with hundreds of files. Without `maxHeight`,
        // `overflow: auto` does nothing (the parent grows to fit content) so
        // the bottom rows fall off the bottom of the window with no
        // scrollbar to reach them.
        <div
          className="page-body glass"
          style={{ padding: 8, overflow: 'auto', maxHeight: '60vh' }}
        >
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
