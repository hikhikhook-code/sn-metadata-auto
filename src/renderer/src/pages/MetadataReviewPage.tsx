import { useMemo } from 'react'
import { useAppStore } from '@renderer/store/store'
import { MetadataCard, CompactMetadataRow } from '@renderer/components/metadata/MetadataCard'
import { useBatchControls, useRename } from '@renderer/hooks/useBatch'
import { Tooltip } from '@renderer/components/ui/Tooltip'
import { LayoutGrid, Rows3, Sparkles, RotateCcw } from 'lucide-react'

export function MetadataReviewPage() {
  const files = useAppStore((s) => s.files)
  const viewMode = useAppStore((s) => s.ui.viewMode)
  const setViewMode = useAppStore((s) => s.setViewMode)
  const setActivePage = useAppStore((s) => s.setActivePage)
  const { regenerateOne, regenerateFailed } = useBatchControls()
  const rename = useRename()
  const failedCount = files.filter((f) => f.status === 'Failed').length

  const items = useMemo(
    () =>
      files.filter(
        (f) =>
          f.aiMetadata || f.editedMetadata || f.status === 'Processing' || f.status === 'Failed'
      ),
    [files]
  )

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="section-title">Metadata Review</h2>
          <p className="section-sub">
            Edit AI-generated metadata directly. Click <strong>Save</strong> then{' '}
            <strong>Approve &amp; Rename</strong> when ready.
          </p>
        </div>
        <div className="row">
          {failedCount > 0 && (
            <Tooltip content="Regenerate metadata for every Failed file.">
              <button className="btn btn-sm btn-warning" onClick={() => void regenerateFailed()}>
                <RotateCcw size={14} /> Regenerate Failed ({failedCount})
              </button>
            </Tooltip>
          )}
          <Tooltip content="Comfort view — full editable card per file.">
            <button
              className={`btn btn-sm ${viewMode === 'comfort' ? 'btn-primary' : ''}`}
              onClick={() => setViewMode('comfort')}
            >
              <LayoutGrid size={14} /> Comfort
            </button>
          </Tooltip>
          <Tooltip content="Compact view — one row per file for quick batch review.">
            <button
              className={`btn btn-sm ${viewMode === 'compact' ? 'btn-primary' : ''}`}
              onClick={() => setViewMode('compact')}
            >
              <Rows3 size={14} /> Compact
            </button>
          </Tooltip>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state glass-soft" style={{ padding: 40 }}>
          <Sparkles size={28} />
          <p className="section-sub">
            No metadata yet. Add files, then press <strong>Start</strong> in the top bar to generate
            metadata.
          </p>
          <button className="btn btn-primary" onClick={() => setActivePage('files')}>
            Go to Files / Queue
          </button>
        </div>
      ) : (
        <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((file) =>
            viewMode === 'compact' ? (
              <CompactMetadataRow
                key={file.id}
                file={file}
                onRegenerate={(id) => void regenerateOne(id)}
                onApproveAndRename={(id) => void rename(id)}
              />
            ) : (
              <MetadataCard
                key={file.id}
                file={file}
                onRegenerate={(id) => void regenerateOne(id)}
                onApproveAndRename={(id) => void rename(id)}
              />
            )
          )}
        </div>
      )}
    </div>
  )
}
