import { ReactElement, ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Activity, X, Minimize2, FileText } from 'lucide-react'
import { useAppStore } from '@renderer/store/store'

interface FocusMonitorProps {
  open: boolean
  onClose: () => void
  onBackToMini: () => void
  onViewLogs: () => void
}

/**
 * Focus Monitor — a compact, centered overlay with a blurred backdrop that
 * surfaces the same live processing state as Mini Monitor but in a layout
 * the user can read at a glance without other UI competing for attention.
 *
 * Intentionally not a full-page modal: the same dimensions as a chunky
 * dialog so it doesn't replace the main UI permanently. The user can pop
 * back to the mini popover, jump to the full Logs page, or just close it.
 */
export function FocusMonitor({
  open,
  onClose,
  onBackToMini,
  onViewLogs
}: FocusMonitorProps): ReactElement | null {
  const batch = useAppStore((s) => s.batch)
  const apiKeys = useAppStore((s) => s.apiKeys)
  const files = useAppStore((s) => s.files)
  const logs = useAppStore((s) => s.logs)
  const workerCountSetting = useAppStore((s) => s.settings.workerCount)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const workers = batch.workers.length
    ? batch.workers
    : Array.from({ length: workerCountSetting }, (_, i) => ({
        id: i + 1,
        fileId: null,
        fileName: null,
        apiKeySlot: null
      }))
  const activeWorkers = workers.filter((w) => w.fileId !== null).length

  const currentFile = batch.currentFileId
    ? files.find((f) => f.id === batch.currentFileId)
    : null

  const status = batch.isRunning
    ? 'Running'
    : batch.isPaused
      ? 'Paused'
      : files.length === 0
        ? 'Empty'
        : 'Idle'

  const total = batch.totalCount > 0 ? batch.totalCount : files.length
  const done = batch.successCount + batch.failedCount
  const progressPct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0

  // Mirror the orchestrator's usability filter so the panel doesn't advertise
  // a key (Invalid auth, Disabled by user, in cooldown) the orchestrator will
  // skip on the next request.
  const activeKey = [...apiKeys]
    .filter((k) => k.enabled && k.apiKey && k.status !== 'Disabled' && k.status !== 'Invalid')
    .filter((k) => !k.cooldownUntil || new Date(k.cooldownUntil).getTime() <= now)
    .sort((a, b) => a.priority - b.priority)[0]
  const activeKeyLabel = activeKey
    ? `${activeKey.provider} Key ${activeKey.priority}`
    : apiKeys.length === 0
      ? 'Mock provider'
      : '— (no usable key)'

  // Latest log = the last entry pushed to the shared log store, so it stays
  // in sync with the full Logs page in real time.
  const latestLog = logs.length > 0 ? logs[logs.length - 1] : null
  const latestTimeLabel = latestLog
    ? new Date(latestLog.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    : ''

  const overlay = (
    <div
      role="dialog"
      aria-label="Focus Monitor"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(40, 28, 52, 0.34)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)'
      }}
    >
      <div
        className="glass-strong"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: 'calc(100vw - 48px)',
          padding: 18,
          borderRadius: 18,
          boxShadow: '0 20px 60px rgba(80, 40, 90, 0.28)',
          fontSize: 13
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontWeight: 700,
              fontSize: 14
            }}
          >
            <Activity size={16} /> Focus Monitor
          </div>
          <button
            aria-label="Close Focus Monitor"
            className="btn btn-sm btn-ghost"
            style={{ padding: 4 }}
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 14,
            rowGap: 10,
            marginBottom: 14
          }}
        >
          <RowLabel>Status</RowLabel>
          <RowValue>
            <span
              className="badge"
              style={{
                background:
                  status === 'Running'
                    ? 'rgba(216, 191, 247, 0.55)'
                    : status === 'Paused'
                      ? 'rgba(255, 230, 215, 0.85)'
                      : 'var(--c-glass-2)'
              }}
            >
              {status}
            </span>
          </RowValue>

          <RowLabel>Current file</RowLabel>
          <RowValue>
            <span
              title={currentFile ? currentFile.currentFilename : ''}
              style={{
                display: 'block',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {currentFile ? currentFile.currentFilename : '—'}
            </span>
          </RowValue>

          <RowLabel>Progress</RowLabel>
          <RowValue>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ minWidth: 56 }}>
                {done} / {total}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 6,
                  borderRadius: 999,
                  background: 'var(--c-border-strong)',
                  overflow: 'hidden'
                }}
              >
                <div
                  style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--c-accent), var(--c-accent-2))',
                    transition: 'width 250ms ease'
                  }}
                />
              </div>
              <span
                style={{
                  minWidth: 38,
                  textAlign: 'right',
                  color: 'var(--c-text-soft)'
                }}
              >
                {progressPct}%
              </span>
            </div>
          </RowValue>

          <RowLabel>Active API key</RowLabel>
          <RowValue>
            <span
              className="badge"
              style={{
                background: activeKey
                  ? 'rgba(232,217,245,0.85)'
                  : 'rgba(255,235,210,0.85)'
              }}
            >
              {activeKeyLabel}
            </span>
          </RowValue>

          <RowLabel>Workers</RowLabel>
          <RowValue>
            {activeWorkers}/{workers.length} active
          </RowValue>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div className="label" style={{ marginBottom: 4 }}>
            Latest log
          </div>
          <div
            style={{
              padding: '8px 10px',
              borderRadius: 10,
              background: 'var(--c-glass-2)',
              border: '1px solid var(--c-border)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: latestLog ? 'var(--c-text)' : 'var(--c-text-soft)',
              fontStyle: latestLog ? 'normal' : 'italic'
            }}
            title={latestLog ? latestLog.message : ''}
          >
            {latestLog ? (
              <>
                <span style={{ color: 'var(--c-text-soft)', fontSize: 11, flexShrink: 0 }}>
                  {latestTimeLabel}
                </span>
                <span style={{ fontWeight: 600, flexShrink: 0 }}>[{latestLog.category}]</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {latestLog.message}
                </span>
              </>
            ) : (
              'No log entries yet'
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-sm" onClick={onBackToMini} aria-label="Back to mini monitor">
            <Minimize2 size={13} /> Back to mini
          </button>
          <button className="btn btn-sm" onClick={onViewLogs} aria-label="Open Logs page">
            <FileText size={13} /> View Logs
          </button>
          <button className="btn btn-sm btn-primary" onClick={onClose} aria-label="Close">
            Close
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}

function RowLabel({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="label" style={{ alignSelf: 'center', whiteSpace: 'nowrap' }}>
      {children}
    </div>
  )
}

function RowValue({ children }: { children: ReactNode }): ReactElement {
  return (
    <div style={{ minWidth: 0, fontWeight: 500 }}>
      {children}
    </div>
  )
}
