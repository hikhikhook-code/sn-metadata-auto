import { useAppStore } from '@renderer/store/store'
import { CheckCircle2, AlertCircle, Activity } from 'lucide-react'

export function BottomBar() {
  const batch = useAppStore((s) => s.batch)
  const files = useAppStore((s) => s.files)

  const currentFile = files.find((f) => f.id === batch.currentFileId)
  const total = batch.totalCount || files.length || 1
  const done = batch.successCount + batch.failedCount
  const pct =
    batch.isRunning || batch.isPaused
      ? Math.min(100, Math.round((done / total) * 100))
      : files.length > 0
        ? Math.round(
            (files.filter(
              (f) =>
                f.status === 'Renamed' ||
                f.status === 'Approved' ||
                f.status === 'Saved' ||
                f.status === 'Generated' ||
                f.status === 'Edited' ||
                f.status === 'Exported'
            ).length /
              files.length) *
              100
          )
        : 0

  return (
    <footer
      className="glass"
      style={{
        height: 'var(--bottombar-h)',
        margin: '6px 12px 12px',
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        fontSize: 12
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flex: 1,
          minWidth: 0
        }}
      >
        <div
          style={{
            position: 'relative',
            flex: 1,
            height: 6,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.5)',
            border: '1px solid var(--c-border-strong)',
            overflow: 'hidden',
            maxWidth: 320
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: `${pct}%`,
              background: 'linear-gradient(90deg, var(--c-accent), var(--c-accent-2))',
              transition: 'width 0.25s ease'
            }}
          />
        </div>
        <span style={{ fontWeight: 700, color: 'var(--c-text-soft)', minWidth: 36 }}>{pct}%</span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--c-text-soft)',
          minWidth: 0,
          flex: 1.2,
          overflow: 'hidden'
        }}
      >
        <Activity size={13} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {batch.isRunning
            ? currentFile
              ? `Processing ${currentFile.originalFilename}`
              : 'Running…'
            : batch.isPaused
              ? `Paused at ${currentFile?.originalFilename ?? '—'}`
              : files.length === 0
                ? 'Idle — add files to begin'
                : `Idle · ${files.length} file${files.length === 1 ? '' : 's'} loaded`}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c-success)' }}>
        <CheckCircle2 size={13} />
        <span>{batch.successCount} success</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--c-danger)' }}>
        <AlertCircle size={13} />
        <span>{batch.failedCount} failed</span>
      </div>
    </footer>
  )
}
