import { useMemo, useState } from 'react'
import { useAppStore } from '@renderer/store/store'
import type { LogEntry, LogCategory, LogLevel } from '@renderer/types'
import { formatDateTime } from '@renderer/utils/format'
import { Copy, Eraser, FileDown, Search } from 'lucide-react'

const CATEGORIES: ('All' | LogCategory)[] = [
  'All',
  'BATCH',
  'PROCESSING',
  'SUCCESS',
  'FAILED',
  'WARNING',
  'SAVED',
  'APPROVED',
  'RENAMED',
  'EXPORT',
  'API',
  'PROJECT',
  'STOP',
  'RESUME',
  'INFO'
]

const LEVEL_COLORS: Record<LogLevel, string> = {
  info: 'var(--c-info)',
  success: 'var(--c-success)',
  warning: 'var(--c-warning)',
  error: 'var(--c-danger)'
}

function entryToText(e: LogEntry): string {
  const ts = formatDateTime(e.timestamp)
  return `[${ts}] ${e.category} ${e.level.toUpperCase()} - ${e.message}${e.apiKeySlot ? ` (${e.apiKeySlot})` : ''}`
}

export function LogsPage() {
  const logs = useAppStore((s) => s.logs)
  const clearLogs = useAppStore((s) => s.clearLogs)
  const showToast = useAppStore((s) => s.showToast)

  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'All' | LogCategory>('All')

  const filtered = useMemo(() => {
    const lq = q.trim().toLowerCase()
    return logs.filter((l) => {
      if (cat !== 'All' && l.category !== cat) return false
      if (!lq) return true
      return (
        l.message.toLowerCase().includes(lq) ||
        l.category.toLowerCase().includes(lq) ||
        (l.apiKeySlot ?? '').toLowerCase().includes(lq)
      )
    })
  }, [logs, q, cat])

  function copyAll() {
    const text = filtered.map(entryToText).join('\n')
    navigator.clipboard.writeText(text)
    showToast('success', `Copied ${filtered.length} log lines`)
  }

  async function exportLogs(fmt: 'txt' | 'json') {
    const content =
      fmt === 'txt' ? filtered.map(entryToText).join('\n') : JSON.stringify(filtered, null, 2)
    const res = await window.api.exportLogs({
      format: fmt,
      content,
      defaultName: `sn-metadata-logs-${new Date().toISOString().slice(0, 10)}`
    })
    if (res.ok) {
      showToast('success', `Logs exported`)
      useAppStore.getState().addLog('success', 'EXPORT', `Logs exported → ${res.path}`)
    } else if (res.error) {
      showToast('error', `Export failed: ${res.error}`)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="section-title">Logs</h2>
          <p className="section-sub">
            Activity log for the current session. API keys are never logged in full — only the slot
            name.
          </p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <button className="btn" onClick={copyAll} disabled={filtered.length === 0}>
            <Copy size={14} /> Copy
          </button>
          <button
            className="btn"
            onClick={() => void exportLogs('txt')}
            disabled={filtered.length === 0}
          >
            <FileDown size={14} /> Export TXT
          </button>
          <button
            className="btn"
            onClick={() => void exportLogs('json')}
            disabled={filtered.length === 0}
          >
            <FileDown size={14} /> Export JSON
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (logs.length === 0) return
              if (confirm('Clear all logs?')) clearLogs()
            }}
            disabled={logs.length === 0}
          >
            <Eraser size={14} /> Clear
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <div className="row" style={{ flex: 1, gap: 6 }}>
          <Search size={14} style={{ color: 'var(--c-text-muted)' }} />
          <input
            className="input"
            placeholder="Search logs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="select"
          style={{ width: 180 }}
          value={cat}
          onChange={(e) => setCat(e.target.value as 'All' | LogCategory)}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="page-body glass" style={{ padding: 8 }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <span>No logs match your filter.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered
              .slice()
              .reverse()
              .map((l) => (
                <div
                  key={l.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 90px 1fr',
                    gap: 10,
                    padding: '6px 10px',
                    borderBottom: '1px solid var(--c-border-strong)',
                    fontFamily:
                      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                    fontSize: 12
                  }}
                >
                  <span style={{ color: 'var(--c-text-muted)' }}>
                    {formatDateTime(l.timestamp)}
                  </span>
                  <span style={{ fontWeight: 700, color: LEVEL_COLORS[l.level] }}>
                    {l.category}
                  </span>
                  <span>
                    {l.message}
                    {l.apiKeySlot && (
                      <span style={{ color: 'var(--c-text-muted)' }}> · {l.apiKeySlot}</span>
                    )}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
