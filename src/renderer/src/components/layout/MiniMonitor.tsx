import { ReactElement, ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '@renderer/store/store'
import { Activity, X, Users, Timer, CheckCircle2, AlertCircle } from 'lucide-react'

interface MiniMonitorProps {
  open: boolean
  onClose: () => void
}

export function MiniMonitor({ open, onClose }: MiniMonitorProps): ReactElement | null {
  const batch = useAppStore((s) => s.batch)
  const apiKeys = useAppStore((s) => s.apiKeys)
  const files = useAppStore((s) => s.files)
  const workerCountSetting = useAppStore((s) => s.settings.workerCount)

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [open])

  const panelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent): void {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
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
  const activeWorkers = workers.filter((w) => w.fileId !== null)

  // Mirror the orchestrator's usability filter so the panel doesn't advertise
  // a key (Invalid auth, Disabled by user) that the orchestrator will skip.
  const activeKey = [...apiKeys]
    .filter((k) => k.enabled && k.apiKey && k.status !== 'Disabled' && k.status !== 'Invalid')
    .filter((k) => !k.cooldownUntil || new Date(k.cooldownUntil).getTime() <= now)
    .sort((a, b) => a.priority - b.priority)[0]
  const activeKeyLabel = activeKey
    ? `${activeKey.provider} Key ${activeKey.priority}`
    : apiKeys.length === 0
      ? 'Mock provider'
      : '— (no usable key)'

  const cooldowns = apiKeys
    .map((k) => ({
      key: k,
      remaining: k.cooldownUntil
        ? Math.max(0, Math.ceil((new Date(k.cooldownUntil).getTime() - now) / 1000))
        : 0
    }))
    .filter((c) => c.remaining > 0)

  const queueStatus = batch.isRunning
    ? 'Running'
    : batch.isPaused
      ? 'Paused'
      : files.length === 0
        ? 'Empty'
        : 'Idle'

  // The TopBar has backdrop-filter, which creates a containing block for
  // position:fixed descendants. Rendering the popover inline made the fixed
  // element resolve to the topbar instead of the viewport and get clipped.
  // Mount via a portal directly under document.body so the panel is anchored
  // to the actual viewport.
  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Mini Monitor"
      className="glass-strong"
      style={{
        position: 'fixed',
        top: 'calc(var(--topbar-h) + 26px)',
        right: 30,
        width: 360,
        zIndex: 200,
        padding: 14,
        borderRadius: 14,
        boxShadow: '0 14px 40px rgba(120, 80, 180, 0.18)',
        fontSize: 12
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
          <Activity size={14} /> Mini Monitor
        </div>
        <button
          aria-label="Close Mini Monitor"
          className="btn btn-sm btn-ghost"
          style={{ padding: 4 }}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <Stat
          icon={<Users size={13} />}
          label="Workers"
          value={`${activeWorkers.length}/${workers.length}`}
        />
        <Stat icon={<Activity size={13} />} label="Queue" value={queueStatus} />
        <Stat
          icon={<CheckCircle2 size={13} color="var(--c-success)" />}
          label="Success"
          value={batch.successCount}
        />
        <Stat
          icon={<AlertCircle size={13} color="var(--c-danger)" />}
          label="Failed"
          value={batch.failedCount}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div className="label" style={{ marginBottom: 4 }}>
          Active API Key
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span
            className="badge"
            style={{
              background: activeKey ? 'rgba(232,217,245,0.85)' : 'rgba(255,235,210,0.85)'
            }}
          >
            {activeKeyLabel}
          </span>
        </div>
      </div>

      {cooldowns.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div className="label" style={{ marginBottom: 4 }}>
            Cooldown
          </div>
          {cooldowns.map(({ key, remaining }) => (
            <div
              key={key.id}
              className="row"
              style={{
                gap: 6,
                color: 'var(--c-warning, #92400e)',
                marginBottom: 2
              }}
            >
              <Timer size={13} />
              <span>
                {key.provider} Key {key.priority}: {remaining}s
              </span>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="label" style={{ marginBottom: 4 }}>
          Worker Slots
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {workers.map((w) => (
            <div
              key={w.id}
              className="row"
              style={{
                gap: 6,
                padding: '4px 8px',
                borderRadius: 8,
                background: w.fileId ? 'rgba(216, 191, 247, 0.25)' : 'rgba(255,255,255,0.4)',
                border: '1px solid var(--c-border)'
              }}
            >
              <strong style={{ width: 32 }}>#{w.id}</strong>
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: w.fileId ? 'var(--c-text)' : 'var(--c-text-soft)'
                }}
              >
                {w.fileName ?? 'Idle'}
              </span>
              {w.apiKeySlot && (
                <span style={{ color: 'var(--c-text-soft)', fontSize: 11 }}>{w.apiKeySlot}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}

function Stat({
  icon,
  label,
  value
}: {
  icon: ReactNode
  label: string
  value: string | number
}): ReactElement {
  return (
    <div
      style={{
        padding: '6px 10px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.55)',
        border: '1px solid var(--c-border)'
      }}
    >
      <div className="row" style={{ gap: 4, color: 'var(--c-text-soft)', fontSize: 11 }}>
        {icon}
        <span>{label}</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, marginTop: 2 }}>{value}</div>
    </div>
  )
}
