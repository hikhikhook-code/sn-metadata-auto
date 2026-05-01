import { CSSProperties, ReactElement, useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  Square,
  FileDown,
  Activity,
  Minus,
  X,
  Maximize2,
  Minimize2
} from 'lucide-react'
import { useAppStore } from '@renderer/store/store'
import { Tooltip } from '../ui/Tooltip'
import { useBatchControls } from '@renderer/hooks/useBatch'
import { MiniMonitor } from './MiniMonitor'
import { FocusMonitor } from './FocusMonitor'

type MonitorMode = 'closed' | 'mini' | 'focus'

// CSS `-webkit-app-region` is the cross-platform way to mark which parts of
// a frameless window let the user drag the OS window around. Children of
// dragged regions need an explicit `no-drag` to remain interactive.
const DRAG_STYLE: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG_STYLE: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties

// macOS uses `titleBarStyle: 'hiddenInset'` so the native traffic-light
// buttons (close / minimize / zoom) stay visible at the top-left, AND the
// OS handles double-click-on-titlebar natively (controlled by the user's
// "Double-click a window's title bar to" preference). Rendering our custom
// Min/Max/Close buttons there would duplicate the native controls, and our
// JS double-click handler would fight the OS handler. Detect once per
// load.
const IS_MACOS = window.api.platform === 'darwin'

export function TopBar() {
  const [monitorMode, setMonitorMode] = useState<MonitorMode>('closed')
  const apiKeys = useAppStore((s) => s.apiKeys)
  const batch = useAppStore((s) => s.batch)
  const project = useAppStore((s) => s.project)
  const files = useAppStore((s) => s.files)
  const showToast = useAppStore((s) => s.showToast)
  const setActivePage = useAppStore((s) => s.setActivePage)

  const { startBatch, stopBatch, resumeBatch } = useBatchControls()

  const activeKey = [...apiKeys]
    .filter((k) => k.enabled && k.apiKey)
    .sort((a, b) => a.priority - b.priority)[0]
  const activeKeyLabel = activeKey
    ? `${activeKey.provider} Key ${activeKey.priority}`
    : 'Mock provider'

  const hasReadyFile = files.some(
    (f) => f.status === 'Ready' || f.status === 'Waiting' || f.status === 'Failed'
  )

  // Window state — drives the maximize/restore icon on the custom controls.
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    let alive = true
    void window.api.win.getState().then((s) => {
      if (alive) setMaximized(s.maximized)
    })
    const off = window.api.win.onStateChange((s) => setMaximized(s.maximized))
    return () => {
      alive = false
      off()
    }
  }, [])

  // Manual double-click detection for the drag region. The OS captures real
  // click/dblclick events on `-webkit-app-region: drag` surfaces (especially
  // on Windows) so React's `onDoubleClick` doesn't fire there. `pointerdown`
  // does fire briefly before the OS hijacks the gesture for window dragging,
  // which is enough to hand-roll a 400 ms double-click window.
  //
  // We skip the toggle when:
  //  - the click landed inside a `[data-no-drag]` wrapper (badge / button
  //    clusters), where double-clicking a button must NOT maximize, and
  //  - we're on macOS, where the OS title bar handles double-click natively
  //    (per the user's System Preferences) and a duplicate JS handler would
  //    cause the window to flicker between maximized/restored.
  const lastDownRef = useRef<number>(0)
  function handleDragRegionPointerDown(e: React.PointerEvent<HTMLElement>): void {
    if (IS_MACOS) return
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (target && target.closest('[data-no-drag]')) return
    const now = Date.now()
    if (now - lastDownRef.current < 400) {
      lastDownRef.current = 0
      void window.api.win.toggleMaximize()
    } else {
      lastDownRef.current = now
    }
  }

  return (
    <header
      className="glass"
      style={{
        height: 'var(--topbar-h)',
        margin: '12px 12px 6px',
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        ...DRAG_STYLE
      }}
      onPointerDown={handleDragRegionPointerDown}
    >
      <div
        data-no-drag
        style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, ...NO_DRAG_STYLE }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            background: 'linear-gradient(135deg, var(--c-accent), var(--c-accent-2))',
            color: 'white',
            fontWeight: 800,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          SN
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>SN Metadata Auto</span>
          <span style={{ fontSize: 11, color: 'var(--c-text-soft)' }}>
            {project.name}
            {project.lastSavedAt ? ' · saved' : ' · unsaved'}
          </span>
        </div>
      </div>

      <Tooltip
        side="bottom"
        content="The API key that will be used first for the next request. Lower priority numbers run first."
      >
        <div
          data-no-drag
          className="badge"
          style={{
            background: activeKey ? 'rgba(232,217,245,0.85)' : 'rgba(255,235,210,0.85)',
            cursor: 'pointer',
            ...NO_DRAG_STYLE
          }}
          onClick={() => setActivePage('apikeys')}
        >
          Active API: <strong style={{ color: 'var(--c-accent-strong)' }}>{activeKeyLabel}</strong>
        </div>
      </Tooltip>

      {/* Empty flex spacer is the primary draggable region — it inherits
          `app-region: drag` from the header. */}
      <div style={{ flex: 1, alignSelf: 'stretch' }} />

      <div
        data-no-drag
        style={{ display: 'flex', alignItems: 'center', gap: 10, ...NO_DRAG_STYLE }}
      >
        <Tooltip side="bottom" content="Start batch processing of all Ready files.">
          <button
            className="btn btn-sm btn-primary"
            onClick={() => startBatch()}
            disabled={batch.isRunning || !hasReadyFile}
          >
            <Play size={14} /> Start
          </button>
        </Tooltip>
        <Tooltip side="bottom" content="Pause processing without losing progress.">
          <button
            className="btn btn-sm"
            onClick={stopBatch}
            disabled={!batch.isRunning}
            style={{ background: 'rgba(255,255,255,0.6)' }}
          >
            <Square size={14} /> Stop
          </button>
        </Tooltip>
        <Tooltip side="bottom" content="Resume processing from the last incomplete file.">
          <button
            className="btn btn-sm"
            onClick={resumeBatch}
            disabled={batch.isRunning || !hasReadyFile}
            style={{ background: 'rgba(255,255,255,0.6)' }}
          >
            <Pause size={14} style={{ transform: 'rotate(90deg)' }} /> Resume
          </button>
        </Tooltip>

        <Tooltip side="bottom" content="Open Mini Monitor — workers, active key, cooldown.">
          <button
            className="btn btn-sm btn-ghost"
            // Stop mousedown from reaching MiniMonitor's document-level outside-click
            // handler; without this, clicking the toggle while the panel is open fires
            // close-on-mousedown and then toggle-on-click, leaving the panel open.
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => setMonitorMode((m) => (m === 'closed' ? 'mini' : 'closed'))}
            aria-label="Toggle Mini Monitor"
            aria-pressed={monitorMode !== 'closed'}
          >
            <Activity size={14} /> Monitor
          </button>
        </Tooltip>

        <Tooltip
          side="bottom"
          content="Open the Save Output Files page. This button only navigates — it does not create output files on its own."
        >
          <button
            className="btn btn-sm"
            onClick={() => {
              if (files.length === 0) {
                showToast('warning', 'No files in the queue')
                return
              }
              setActivePage('export')
            }}
            style={{
              background: 'linear-gradient(135deg, var(--c-accent-3), #f3b390)',
              color: 'white',
              borderColor: 'transparent'
            }}
          >
            <FileDown size={14} /> Go to Output
          </button>
        </Tooltip>
      </div>

      {/* On macOS the native traffic-light buttons already render at the
          top-left thanks to `titleBarStyle: 'hiddenInset'` — drawing our own
          set on the right would duplicate them. */}
      {!IS_MACOS && <WindowControls maximized={maximized} />}

      <MiniMonitor
        open={monitorMode === 'mini'}
        onClose={() => setMonitorMode('closed')}
        onOpenFocus={() => setMonitorMode('focus')}
      />
      <FocusMonitor
        open={monitorMode === 'focus'}
        onClose={() => setMonitorMode('closed')}
        onBackToMini={() => setMonitorMode('mini')}
        onViewLogs={() => {
          setActivePage('logs')
          setMonitorMode('closed')
        }}
      />
    </header>
  )
}

interface WindowControlsProps {
  maximized: boolean
}

/**
 * Custom min / max-restore / close buttons. They take over from the OS
 * caption controls when the native title bar is hidden. Sizes match the
 * width of Windows 11 captions (≈46×32) so the window feels familiar.
 *
 * `data-no-toast="true"` opts these icons out of the global click-feedback
 * toast — a toast saying "Minimize" right as the window is minimizing is
 * just visual noise.
 */
function WindowControls({ maximized }: WindowControlsProps): ReactElement {
  const baseStyle: CSSProperties = {
    width: 38,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: '1px solid var(--c-border)',
    background: 'rgba(255,255,255,0.55)',
    color: 'var(--c-text)',
    cursor: 'pointer',
    padding: 0
  }

  return (
    <div
      data-no-drag
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginLeft: 4,
        ...NO_DRAG_STYLE
      }}
    >
      <button
        aria-label="Minimize"
        title="Minimize"
        data-no-toast="true"
        style={baseStyle}
        onClick={() => void window.api.win.minimize()}
      >
        <Minus size={13} />
      </button>
      <button
        aria-label={maximized ? 'Restore' : 'Maximize'}
        title={maximized ? 'Restore' : 'Maximize'}
        data-no-toast="true"
        style={baseStyle}
        onClick={() => void window.api.win.toggleMaximize()}
      >
        {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
      </button>
      <button
        aria-label="Close"
        title="Close"
        data-no-toast="true"
        style={{
          ...baseStyle,
          background: 'rgba(232, 60, 76, 0.12)',
          color: 'var(--c-danger, #b1001b)'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(232, 60, 76, 0.85)'
          e.currentTarget.style.color = 'white'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(232, 60, 76, 0.12)'
          e.currentTarget.style.color = 'var(--c-danger, #b1001b)'
        }}
        onClick={() => void window.api.win.close()}
      >
        <X size={14} />
      </button>
    </div>
  )
}
