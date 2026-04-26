import { Play, Pause, Square, FileDown, FolderOpen, Save, Activity } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '@renderer/store/store'
import { Tooltip } from '../ui/Tooltip'
import { useBatchControls } from '@renderer/hooks/useBatch'
import { useProjectActions } from '@renderer/hooks/useProject'
import { MiniMonitor } from './MiniMonitor'

export function TopBar() {
  const [monitorOpen, setMonitorOpen] = useState(false)
  const apiKeys = useAppStore((s) => s.apiKeys)
  const batch = useAppStore((s) => s.batch)
  const project = useAppStore((s) => s.project)
  const files = useAppStore((s) => s.files)
  const showToast = useAppStore((s) => s.showToast)
  const setActivePage = useAppStore((s) => s.setActivePage)

  const { startBatch, stopBatch, resumeBatch } = useBatchControls()
  const { saveProject, openProject } = useProjectActions()

  const activeKey = [...apiKeys]
    .filter((k) => k.enabled && k.apiKey)
    .sort((a, b) => a.priority - b.priority)[0]
  const activeKeyLabel = activeKey
    ? `${activeKey.provider} Key ${activeKey.priority}`
    : 'Mock provider'

  const hasReadyFile = files.some(
    (f) => f.status === 'Ready' || f.status === 'Waiting' || f.status === 'Failed'
  )

  return (
    <header
      className="glass"
      style={{
        height: 'var(--topbar-h)',
        margin: '12px 12px 6px',
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
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

      <Tooltip content="The API key that will be used first for the next request. Lower priority numbers run first.">
        <div
          className="badge"
          style={{
            background: activeKey ? 'rgba(232,217,245,0.85)' : 'rgba(255,235,210,0.85)',
            cursor: 'pointer'
          }}
          onClick={() => setActivePage('apikeys')}
        >
          Active API: <strong style={{ color: 'var(--c-accent-strong)' }}>{activeKeyLabel}</strong>
        </div>
      </Tooltip>

      <div style={{ flex: 1 }} />

      <Tooltip content="Open project (.snmproj.json)">
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            void openProject()
          }}
        >
          <FolderOpen size={14} /> Open
        </button>
      </Tooltip>

      <Tooltip content="Save project file">
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            void saveProject(false)
          }}
        >
          <Save size={14} /> Save
        </button>
      </Tooltip>

      <div
        style={{ width: 1, height: 28, background: 'var(--c-border-strong)', margin: '0 4px' }}
      />

      <Tooltip content="Start batch processing of all Ready files.">
        <button
          className="btn btn-sm btn-primary"
          onClick={() => startBatch()}
          disabled={batch.isRunning || !hasReadyFile}
        >
          <Play size={14} /> Start
        </button>
      </Tooltip>
      <Tooltip content="Pause processing without losing progress.">
        <button
          className="btn btn-sm"
          onClick={stopBatch}
          disabled={!batch.isRunning}
          style={{ background: 'rgba(255,255,255,0.6)' }}
        >
          <Square size={14} /> Stop
        </button>
      </Tooltip>
      <Tooltip content="Resume processing from the last incomplete file.">
        <button
          className="btn btn-sm"
          onClick={resumeBatch}
          disabled={batch.isRunning || !hasReadyFile}
          style={{ background: 'rgba(255,255,255,0.6)' }}
        >
          <Pause size={14} style={{ transform: 'rotate(90deg)' }} /> Resume
        </button>
      </Tooltip>

      <Tooltip content="Open Mini Monitor — workers, active key, cooldown.">
        <button
          className="btn btn-sm btn-ghost"
          // Stop mousedown from reaching MiniMonitor's document-level outside-click
          // handler; without this, clicking the toggle while the panel is open fires
          // close-on-mousedown and then toggle-on-click, leaving the panel open.
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setMonitorOpen((v) => !v)}
          aria-label="Toggle Mini Monitor"
          aria-pressed={monitorOpen}
        >
          <Activity size={14} /> Monitor
        </button>
      </Tooltip>

      <Tooltip content="Quick export — opens Export page with the current metadata ready to save.">
        <button
          className="btn btn-sm"
          onClick={() => {
            if (files.length === 0) {
              showToast('warning', 'No files in the queue to export')
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
          <FileDown size={14} /> Quick Export
        </button>
      </Tooltip>

      <MiniMonitor open={monitorOpen} onClose={() => setMonitorOpen(false)} />
    </header>
  )
}
