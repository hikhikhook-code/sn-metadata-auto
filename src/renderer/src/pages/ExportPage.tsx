import { useMemo, useState } from 'react'
import { useAppStore } from '@renderer/store/store'
import type { AppFile, FileStatus } from '@renderer/types'
import {
  AlertTriangle,
  FileDown,
  Eye,
  FolderOpen,
  Save,
  Settings as SettingsIcon
} from 'lucide-react'
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

/**
 * Six scope filters. The user-facing names match the spec; the implementation
 * here translates each to the internal `FileStatus` enum.
 *
 *   - Successful files only  : Approved + Metadata ready (anything that
 *                              successfully produced metadata)
 *   - Selected files only    : whatever the user has ticked in the queue
 *   - Approved files only    : explicit Approved status (post-review)
 *   - Metadata ready files   : has AI metadata but not yet approved
 *   - All files              : everything in the queue
 *   - Failed files report    : sheet-only failure report (no copy/embed)
 */
type Scope = 'successful' | 'selected' | 'approved' | 'metadataReady' | 'all' | 'failed'

const SUCCESSFUL_STATUSES: FileStatus[] = ['Generated', 'Saved', 'Approved', 'Renamed', 'Exported']

const METADATA_READY_STATUSES: FileStatus[] = ['Generated', 'Saved', 'Approved', 'Renamed']

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

function fileToFailureRow(f: AppFile): Record<string, unknown> {
  return {
    original_filename: f.originalFilename,
    current_filename: f.currentFilename,
    file_type: String(f.fileType).toLowerCase(),
    status: f.status,
    api_provider: f.apiProvider ?? '',
    api_key_used: f.apiKeySlot ?? '',
    error_message: f.errorMessage ?? ''
  }
}

export function ExportPage() {
  const files = useAppStore((s) => s.files)
  const selected = useAppStore((s) => s.selectedFileIds)
  const showToast = useAppStore((s) => s.showToast)
  const addLog = useAppStore((s) => s.addLog)
  const setActivePage = useAppStore((s) => s.setActivePage)
  // The global Output Folder lives in Settings → Output Files and is the
  // single source of truth for every "finished files go here" path:
  // Approve auto-rename, manual Approve, embedded copies, the Save Output
  // Files button on this page. The page only displays it as a read-only
  // badge so users always know where copies will land.
  const settingsOutputFolder = useAppStore((s) => s.settings.outputFolder)
  const settingsPlatform = useAppStore((s) => s.settings.platformPreset)
  const customSchemaSetting = useAppStore((s) => s.settings.customCsvSchema)
  const settings = useAppStore((s) => s.settings)
  const settingsMode = settings.settingsMode ?? 'simple'
  const isSimpleMode = settingsMode === 'simple'

  // Simple mode hides the scope dropdown entirely and forces "Successful
  // files only" so the daily user just clicks Save Output Files and the
  // app does the obvious thing.
  const [scopeAdv, setScopeAdv] = useState<Scope>('successful')
  const scope: Scope = isSimpleMode ? 'successful' : scopeAdv
  const isFailedReport = scope === 'failed'

  const [includeSheet, setIncludeSheet] = useState(false)
  const [format, setFormat] = useState<'csv' | 'txt' | 'json' | 'xlsx'>('csv')
  const [platform, setPlatform] = useState<Platform>(settingsPlatform)
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const trimmedOutputFolder = settingsOutputFolder?.trim() ?? ''

  // For the failure-report scope the sheet is the *only* output, so force
  // the checkbox on whenever the user is in that scope. Likewise, leaving
  // it on when they switch back to a normal scope is fine — it just adds a
  // sheet alongside the saved copies.
  const sheetEnabled = isFailedReport ? true : includeSheet

  const { rows, validFiles, dropped, longTitleCount, scopePool } = useMemo(() => {
    let pool = files
    if (scope === 'successful') pool = files.filter((f) => SUCCESSFUL_STATUSES.includes(f.status))
    if (scope === 'selected') pool = files.filter((f) => selected.includes(f.id))
    if (scope === 'approved')
      pool = files.filter((f) => f.status === 'Approved' || f.status === 'Exported')
    if (scope === 'metadataReady')
      pool = files.filter((f) => METADATA_READY_STATUSES.includes(f.status))
    if (scope === 'failed') pool = files.filter((f) => f.status === 'Failed')

    if (scope === 'failed') {
      // Failure report: no metadata required, just emit one row per failed
      // file with the error message attached.
      return {
        rows: pool.map(fileToFailureRow),
        validFiles: [] as AppFile[],
        dropped: [] as AppFile[],
        longTitleCount: 0,
        scopePool: pool
      }
    }

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
      longTitleCount: warnTitle,
      scopePool: pool
    }
  }, [files, selected, scope])

  // The schema we'll actually emit when the user writes a sheet. Built-in
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

  // Files we'd actually copy+embed: those with metadata that haven't
  // already been Exported. Approved/Metadata-ready files are the typical
  // case; once Exported their bytes are already in the output folder so we
  // don't re-copy.
  const filesToCopy = useMemo(() => validFiles.filter((f) => f.status !== 'Exported'), [validFiles])

  async function writeSheet(): Promise<boolean> {
    if (rows.length === 0) return false
    let payloadRows: Record<string, unknown>[] = rows
    let payloadHeaders: string[] | undefined
    let payloadDelimiter: ',' | ';' | '\t' | undefined
    if (!isFailedReport && (format === 'csv' || format === 'xlsx')) {
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
    const stamp = new Date().toISOString().slice(0, 10)
    const defaultName = isFailedReport
      ? `sn-metadata-failure-report-${stamp}`
      : `sn-metadata-${platform.toLowerCase().replace(/\s+/g, '-')}-${stamp}`
    const res = await window.api.exportData({
      format,
      rows: payloadRows,
      defaultName,
      delimiter: payloadDelimiter,
      headers: payloadHeaders
    })
    if (res.ok) {
      const tag = isFailedReport ? 'failure report' : `${platform}`
      addLog(
        'success',
        'EXPORT',
        `Wrote metadata sheet (${tag}, ${rows.length} rows) → ${res.path}`
      )
      showToast('success', `Sheet written: ${rows.length} row(s)`)
      // Spreadsheet-only writes never bump status to Exported. The
      // "Exported" lifecycle marker is reserved for "bytes have landed in
      // the output folder via copy/embed" — see handleSaveOutput below.
      return true
    } else if (res.error) {
      addLog('error', 'EXPORT', `Sheet write failed: ${res.error}`)
      showToast('error', `Sheet write failed: ${res.error}`)
    }
    return false
  }

  async function copyAndEmbedOne(file: AppFile, outputFolder: string): Promise<boolean> {
    const meta = file.editedMetadata ?? file.aiMetadata
    if (!meta) return false
    const target = file.renamePreview || file.currentFilename
    const shouldRename =
      settings.autoRenameAfterApprove && target.length > 0 && target !== file.currentFilename
    try {
      const embedRes = await window.api.metadata.embed({
        files: [
          {
            filePath: file.currentPath,
            fileType: String(file.fileType),
            outputBasename: shouldRename ? target : undefined,
            metadata: {
              title: meta.title,
              description: meta.description,
              keywords: meta.keywords
            }
          }
        ],
        mode: 'copy',
        backup: false,
        outputDirName: outputFolder
      })
      const detail = embedRes.results?.[0]
      if (!embedRes.ok || !detail?.ok || !detail.outputPath) {
        const reason = detail?.error ?? 'unknown error'
        addLog(
          'error',
          'EMBED',
          `Save Output Files failed for ${file.originalFilename}: ${reason}`,
          {
            fileId: file.id
          }
        )
        return false
      }
      const outputPath = detail.outputPath
      const outputName = shouldRename ? target : file.currentFilename
      addLog('success', 'EMBED', `Saved output file: ${outputPath}`, { fileId: file.id })
      addLog('info', 'EMBED', `Original file unchanged: ${file.currentPath}`, { fileId: file.id })
      // Re-point the file record at the output copy and bump status to
      // 'Exported' — copy+embed succeeded, the file is in the output
      // folder, lifecycle reaches its terminal state.
      useAppStore.getState().applyRenameResult(file.id, outputPath, outputName)
      useAppStore.getState().setFileStatus(file.id, 'Exported')
      return true
    } catch (err) {
      const reason = (err as Error).message
      addLog(
        'error',
        'EMBED',
        `Save Output Files crashed for ${file.originalFilename}: ${reason}`,
        {
          fileId: file.id
        }
      )
      return false
    }
  }

  async function handleSaveOutput() {
    if (saving) return
    if (isFailedReport) {
      // Failed report: sheet-only, no copy/embed, no status bump.
      if (rows.length === 0) {
        showToast('warning', 'No failed files in the queue')
        return
      }
      setSaving(true)
      try {
        await writeSheet()
      } finally {
        setSaving(false)
      }
      return
    }

    if (!trimmedOutputFolder) {
      showToast('warning', 'Set an Output Folder in Settings before saving output files')
      setActivePage('settings')
      return
    }
    if (filesToCopy.length === 0 && !sheetEnabled) {
      showToast('warning', 'Nothing to save in the current scope')
      return
    }

    setSaving(true)
    try {
      let succeeded = 0
      let failed = 0
      for (const f of filesToCopy) {
        const ok = await copyAndEmbedOne(f, trimmedOutputFolder)
        if (ok) succeeded++
        else failed++
      }
      if (filesToCopy.length > 0) {
        const summary =
          failed === 0
            ? `Saved ${succeeded} output file(s) to ${trimmedOutputFolder}`
            : `Saved ${succeeded} of ${filesToCopy.length} (${failed} failed)`
        showToast(failed === 0 ? 'success' : 'warning', summary)
      }
      if (sheetEnabled) {
        await writeSheet()
      }
    } finally {
      setSaving(false)
    }
  }

  const outputFolderMissing = !trimmedOutputFolder && !isFailedReport
  const saveDisabled =
    saving ||
    (isFailedReport && rows.length === 0) ||
    (!isFailedReport && filesToCopy.length === 0 && !sheetEnabled) ||
    outputFolderMissing

  const primaryButtonLabel = isFailedReport ? 'Export Failure Report' : 'Save Output Files'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="section-title">Save Output Files</h2>
          <p className="section-sub">
            Create upload-ready copies in the output folder. Original files stay unchanged.
          </p>
        </div>
      </div>

      <div
        className="glass-strong"
        style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {/* Read-only Output Folder badge. The only knob is in Settings →
            Output Files → Output Folder; clicking "Change in Settings"
            jumps the user there. */}
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
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <FolderOpen size={14} style={{ flexShrink: 0 }} />
            <span style={{ flexShrink: 0, fontWeight: 600 }}>Output folder:</span>
            <code
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: trimmedOutputFolder ? 'var(--c-text-strong)' : 'var(--c-text-soft)'
              }}
              title={trimmedOutputFolder || 'Not set'}
            >
              {trimmedOutputFolder || '(not set)'}
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

        {/* Scope dropdown — hidden in Simple mode (we always use Successful) */}
        {!isSimpleMode && (
          <div className="field" style={{ maxWidth: 360 }}>
            <span className="label">Scope</span>
            <select
              className="select"
              value={scopeAdv}
              onChange={(e) => setScopeAdv(e.target.value as Scope)}
            >
              <option value="successful">Successful files only</option>
              <option value="selected">Selected files only</option>
              <option value="approved">Approved files only</option>
              <option value="metadataReady">Metadata ready files</option>
              <option value="all">All files</option>
              <option value="failed">Failed files report</option>
            </select>
            <span className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
              {scope === 'successful' &&
                'Approved + Metadata ready. Skips Ready / Processing / Failed.'}
              {scope === 'selected' && 'Whatever you have ticked in the Files queue.'}
              {scope === 'approved' && 'Only files explicitly Approved (post-review).'}
              {scope === 'metadataReady' &&
                'Has AI metadata but may not be Approved yet. Skips Failed.'}
              {scope === 'all' && 'Every file in the queue.'}
              {scope === 'failed' &&
                'Sheet-only failure report. No output files are saved and no status changes.'}
            </span>
          </div>
        )}

        {/* Optional metadata sheet */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '10px 12px',
            border: '1px solid var(--c-border)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.35)'
          }}
        >
          <label
            className="row"
            style={{
              gap: 8,
              fontSize: 13,
              alignItems: 'center',
              cursor: isFailedReport ? 'not-allowed' : 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={sheetEnabled}
              disabled={isFailedReport}
              onChange={(e) => setIncludeSheet(e.target.checked)}
            />
            <span>Include metadata sheet</span>
            {isFailedReport && (
              <span className="text-muted" style={{ fontSize: 11 }}>
                (always on for failure reports)
              </span>
            )}
          </label>
          {sheetEnabled && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginTop: 4
              }}
            >
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
              {!isFailedReport && (format === 'csv' || format === 'xlsx') && (
                <div className="field">
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
                </div>
              )}
            </div>
          )}
        </div>

        {(dropped.length > 0 || longTitleCount > 0 || outputFolderMissing) && (
          <div
            className="warn-banner"
            style={{ fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}
          >
            <AlertTriangle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {outputFolderMissing && (
                <span>Set an Output Folder in Settings to enable saving output files.</span>
              )}
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

        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span className="text-soft" style={{ fontSize: 13 }}>
            {isFailedReport
              ? `${rows.length} failed file(s) in scope`
              : `${filesToCopy.length} file(s) ready to save${
                  validFiles.length - filesToCopy.length > 0
                    ? ` · ${validFiles.length - filesToCopy.length} already exported`
                    : ''
                }${dropped.length > 0 ? ` · ${dropped.length} skipped` : ''}${
                  scopePool.length - validFiles.length - dropped.length > 0
                    ? ` · ${scopePool.length - validFiles.length - dropped.length} without metadata`
                    : ''
                }`}
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn"
              onClick={() => setShowPreview((v) => !v)}
              disabled={rows.length === 0}
            >
              <Eye size={14} /> {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void handleSaveOutput()}
              disabled={saveDisabled}
              title={
                outputFolderMissing ? 'Set an Output Folder in Settings first' : primaryButtonLabel
              }
            >
              {isFailedReport ? <FileDown size={14} /> : <Save size={14} />}{' '}
              {saving ? 'Saving…' : primaryButtonLabel}
            </button>
          </div>
        </div>
      </div>

      {showPreview && rows.length > 0 && (
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
