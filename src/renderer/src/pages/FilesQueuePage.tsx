import { useCallback, useState, DragEvent } from 'react'
import { useAppStore } from '@renderer/store/store'
import { FilePreview } from '@renderer/components/metadata/FilePreview'
import { StatusBadge } from '@renderer/components/ui/StatusBadge'
import { formatBytes } from '@renderer/utils/format'
import { Tooltip } from '@renderer/components/ui/Tooltip'
import {
  FilePlus,
  FolderOpen,
  Trash2,
  Eraser,
  Square as SquareIcon,
  CheckSquare,
  Upload
} from 'lucide-react'

export function FilesQueuePage() {
  const files = useAppStore((s) => s.files)
  const selected = useAppStore((s) => s.selectedFileIds)
  const addFiles = useAppStore((s) => s.addFiles)
  const removeFiles = useAppStore((s) => s.removeFiles)
  const clearFiles = useAppStore((s) => s.clearFiles)
  const setSelectedFiles = useAppStore((s) => s.setSelectedFiles)
  const toggleFileSelected = useAppStore((s) => s.toggleFileSelected)
  const selectAllFiles = useAppStore((s) => s.selectAllFiles)
  const showToast = useAppStore((s) => s.showToast)
  const setActivePage = useAppStore((s) => s.setActivePage)

  const [dragOver, setDragOver] = useState(false)

  const onSelectFiles = useCallback(async () => {
    const list = await window.api.selectFiles()
    if (list.length === 0) return
    const added = addFiles(list)
    showToast(added > 0 ? 'success' : 'info', `${added} file(s) added to queue`)
  }, [addFiles, showToast])

  const onSelectFolder = useCallback(async () => {
    const list = await window.api.selectFolder()
    if (list.length === 0) {
      showToast('info', 'No supported files found in that folder')
      return
    }
    const added = addFiles(list)
    showToast(added > 0 ? 'success' : 'info', `${added} file(s) added from folder`)
  }, [addFiles, showToast])

  const onDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      const dropped = Array.from(e.dataTransfer.files)
      if (dropped.length === 0) return
      const paths = dropped
        .map((f) => (f as File & { path?: string }).path)
        .filter(Boolean) as string[]
      if (paths.length === 0) {
        showToast('warning', 'Could not read dropped file paths — use Select Files instead')
        return
      }
      const stats = await window.api.statFiles(paths)
      const added = addFiles(stats)
      showToast(added > 0 ? 'success' : 'info', `${added} file(s) added`)
    },
    [addFiles, showToast]
  )

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }
  const onDragLeave = () => setDragOver(false)

  const allSelected = selected.length > 0 && selected.length === files.length

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="section-title">Files / Queue</h2>
          <p className="section-sub">
            Add files, choose a folder, or drag & drop. Supported: JPG, JPEG, PNG, WEBP, MP4, MOV,
            AVI, WEBM, SVG, EPS.
          </p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
          <Tooltip content="Pick individual files">
            <button className="btn btn-primary" onClick={onSelectFiles}>
              <FilePlus size={14} /> Select Files
            </button>
          </Tooltip>
          <Tooltip content="Pick a folder — all supported files will be added recursively">
            <button className="btn" onClick={onSelectFolder}>
              <FolderOpen size={14} /> Select Folder
            </button>
          </Tooltip>
          <Tooltip content="Remove selected files from the queue">
            <button
              className="btn"
              onClick={() => removeFiles(selected)}
              disabled={selected.length === 0}
            >
              <Trash2 size={14} /> Remove Selected
            </button>
          </Tooltip>
          <Tooltip content="Clear all files from the queue">
            <button
              className="btn btn-danger"
              onClick={() => {
                if (files.length === 0) return
                if (confirm(`Remove all ${files.length} file(s) from the queue?`)) clearFiles()
              }}
              disabled={files.length === 0}
            >
              <Eraser size={14} /> Clear Queue
            </button>
          </Tooltip>
        </div>
      </div>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className="glass"
        style={{
          border: dragOver ? '2px dashed var(--c-accent)' : '2px dashed var(--c-border-strong)',
          background: dragOver ? 'rgba(255,235,225,0.6)' : 'rgba(255,255,255,0.4)',
          padding: 18,
          textAlign: 'center',
          color: 'var(--c-text-soft)',
          transition: 'border-color 0.15s ease, background 0.15s ease'
        }}
      >
        <Upload size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} />
        <strong>Drop files here</strong> · or use the buttons above
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {files.length === 0 ? (
          <div className="empty-state glass-soft" style={{ padding: 36 }}>
            <FilePlus size={28} />
            <p className="section-sub" style={{ marginTop: 6 }}>
              No files yet. Add files to start generating metadata.
            </p>
          </div>
        ) : (
          <>
            <div
              className="glass-soft"
              style={{
                padding: '6px 12px',
                display: 'grid',
                gridTemplateColumns: '32px 56px 2fr 0.6fr 0.7fr 1fr auto',
                gap: 10,
                alignItems: 'center',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.05,
                color: 'var(--c-text-muted)',
                textTransform: 'uppercase'
              }}
            >
              <button
                className="btn-icon"
                onClick={() => (allSelected ? setSelectedFiles([]) : selectAllFiles())}
                style={{ color: 'var(--c-text-muted)' }}
                aria-label={allSelected ? 'Clear selection' : 'Select all'}
              >
                {allSelected ? <CheckSquare size={16} /> : <SquareIcon size={16} />}
              </button>
              <span></span>
              <span>Filename</span>
              <span>Type</span>
              <span>Size</span>
              <span>Status</span>
              <span></span>
            </div>

            {files.map((file) => {
              const isSel = selected.includes(file.id)
              return (
                <div
                  key={file.id}
                  className="glass"
                  style={{
                    padding: '8px 12px',
                    display: 'grid',
                    gridTemplateColumns: '32px 56px 2fr 0.6fr 0.7fr 1fr auto',
                    gap: 10,
                    alignItems: 'center',
                    border: isSel ? '1px solid var(--c-accent)' : undefined
                  }}
                >
                  <button
                    className="btn-icon"
                    onClick={() => toggleFileSelected(file.id)}
                    aria-label={isSel ? 'Deselect' : 'Select'}
                    style={{ color: isSel ? 'var(--c-accent)' : 'var(--c-text-muted)' }}
                  >
                    {isSel ? <CheckSquare size={16} /> : <SquareIcon size={16} />}
                  </button>
                  <FilePreview file={file} size={48} rounded={10} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {file.currentFilename}
                    </div>
                    <div
                      className="text-muted"
                      style={{
                        fontSize: 11,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {file.originalPath}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-soft)' }}>
                    {String(file.fileType).toUpperCase()}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--c-text-soft)' }}>
                    {formatBytes(file.fileSize)}
                  </span>
                  <span>
                    <StatusBadge status={file.status} />
                  </span>
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => removeFiles([file.id])}
                    aria-label="Remove"
                    title="Remove from queue"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>

      {files.some((f) => f.aiMetadata) && (
        <div className="info-banner">
          Some files already have metadata.{' '}
          <a
            onClick={() => setActivePage('review')}
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
          >
            Open Metadata Review →
          </a>
        </div>
      )}
    </div>
  )
}
