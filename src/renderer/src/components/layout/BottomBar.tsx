import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@renderer/store/store'
import { CheckCircle2, AlertCircle, Activity, Users, Timer } from 'lucide-react'
import type { FileStatus } from '@renderer/types'

// Internal statuses that map to the user-facing "Metadata ready" lifecycle
// stage (see StatusBadge for the full mapping). Kept in sync with
// `displayStatus()` so the bottom bar count and the per-row badges always
// agree.
const METADATA_READY_STATUSES: FileStatus[] = [
  'Generated',
  'Saved',
  'Approved',
  'Renamed'
]
const COMPLETE_STATUSES: FileStatus[] = [
  ...METADATA_READY_STATUSES,
  'Edited',
  'Need Approval',
  'Exported'
]

export function BottomBar() {
  const batch = useAppStore((s) => s.batch)
  const files = useAppStore((s) => s.files)
  const apiKeys = useAppStore((s) => s.apiKeys)
  const workerCount = useAppStore((s) => s.settings.workerCount)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const currentFile = files.find((f) => f.id === batch.currentFileId)
  const total = batch.totalCount || files.length || 1
  const done = batch.successCount + batch.failedCount

  const counts = useMemo(() => {
    let metadataReady = 0
    let failed = 0
    for (const f of files) {
      if (METADATA_READY_STATUSES.includes(f.status)) metadataReady += 1
      else if (f.status === 'Failed') failed += 1
    }
    return { metadataReady, failed }
  }, [files])

  const pct =
    batch.isRunning || batch.isPaused
      ? Math.min(100, Math.round((done / total) * 100))
      : files.length > 0
        ? Math.round(
            (files.filter((f) => COMPLETE_STATUSES.includes(f.status)).length / files.length) * 100
          )
        : 0

  const activeWorkers = batch.workers.filter((w) => w.fileId !== null)
  const totalWorkers = batch.workers.length || workerCount
  const showWorkerCount = batch.isRunning || batch.isPaused

  const cooldownKeys = apiKeys.filter(
    (k) => k.cooldownUntil && new Date(k.cooldownUntil).getTime() > now
  )
  const firstCooldown = cooldownKeys[0]
  const cooldownRemaining = firstCooldown?.cooldownUntil
    ? Math.max(0, Math.ceil((new Date(firstCooldown.cooldownUntil).getTime() - now) / 1000))
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
            background: 'var(--c-glass-hover)',
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

      {/* Activity / state. Idle:
              "6 files loaded · 3 metadata ready · 0 failed"
            Processing:
              "Processing filename.jpg · Workers 1/1 · 3 metadata ready · 0 failed"
            We render the segments inline as colored chips so the user can
            visually parse counts at a glance without reading prose. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--c-text-soft)',
          minWidth: 0,
          flex: 1.6,
          overflow: 'hidden'
        }}
      >
        <Activity size={13} style={{ flexShrink: 0 }} />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0
          }}
        >
          {batch.isRunning
            ? activeWorkers.length > 1
              ? `Processing ${activeWorkers.length} files`
              : currentFile
                ? `Processing ${currentFile.originalFilename}`
                : 'Running…'
            : batch.isPaused
              ? `Paused at ${currentFile?.originalFilename ?? '—'}`
              : files.length === 0
                ? 'Idle — add files to begin'
                : `${files.length} file${files.length === 1 ? '' : 's'} loaded`}
        </span>

        {showWorkerCount && (
          <>
            <span style={{ color: 'var(--c-border-strong)' }}>·</span>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
              title="Active workers"
            >
              <Users size={12} />
              Workers {activeWorkers.length}/{totalWorkers}
            </span>
          </>
        )}

        <span style={{ color: 'var(--c-border-strong)' }}>·</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            flexShrink: 0,
            color: counts.metadataReady > 0 ? 'var(--c-success)' : 'var(--c-text-soft)'
          }}
        >
          <CheckCircle2 size={12} />
          {counts.metadataReady} metadata ready
        </span>

        <span style={{ color: 'var(--c-border-strong)' }}>·</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            flexShrink: 0,
            color: counts.failed > 0 ? 'var(--c-danger)' : 'var(--c-text-soft)'
          }}
        >
          <AlertCircle size={12} />
          {counts.failed} failed
        </span>
      </div>

      {firstCooldown && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--c-warning, #92400e)',
            flexShrink: 0
          }}
          title={`${firstCooldown.provider} Key ${firstCooldown.priority} is in cooldown`}
        >
          <Timer size={13} />
          <span>
            {firstCooldown.provider} Key {firstCooldown.priority} cooldown {cooldownRemaining}s
          </span>
        </div>
      )}
    </footer>
  )
}
