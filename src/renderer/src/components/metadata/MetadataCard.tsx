import { useAppStore } from '@renderer/store/store'
import type { AppFile } from '@renderer/types'
import { FilePreview } from './FilePreview'
import { StatusBadge } from '../ui/StatusBadge'
import { InfoIcon } from '../ui/Tooltip'
import { ActionMenu } from '../ui/Menu'
import { KeywordChipList } from '../keywords/KeywordChipList'
import { CATEGORIES } from '@renderer/utils/categories'
import {
  Save,
  CheckCircle2,
  RefreshCcw,
  Copy,
  FileSearch,
  Trash2,
  Eye,
  ListChecks,
  Undo2
} from 'lucide-react'
import { formatBytes } from '@renderer/utils/format'
import { TITLE_RECOMMENDED_MAX, titleStatus } from '@renderer/utils/title'

interface Props {
  file: AppFile
  onRegenerate: (id: string) => void
  onApproveAndRename: (id: string) => void
}

export function MetadataCard({ file, onRegenerate, onApproveAndRename }: Props) {
  const updateEditedMetadata = useAppStore((s) => s.updateEditedMetadata)
  const saveMetadata = useAppStore((s) => s.saveMetadata)
  const resetToAi = useAppStore((s) => s.resetToAi)
  const removeFiles = useAppStore((s) => s.removeFiles)
  const setFileStatus = useAppStore((s) => s.setFileStatus)
  const showToast = useAppStore((s) => s.showToast)
  const settings = useAppStore((s) => s.settings)

  const meta = file.editedMetadata ?? file.aiMetadata
  const target = settings.defaultKeywordCount

  const wasRenamed = file.status === 'Renamed' || file.status === 'Exported'

  const tStatus = titleStatus(meta?.title ?? '')
  const isTitleValid = tStatus.state !== 'empty' && tStatus.state !== 'tooLong'

  const isSaveable = !!meta && isTitleValid
  const isApprovable =
    !!meta && isTitleValid && meta.keywords.length > 0 && file.status !== 'Renamed'

  return (
    <div
      className="glass-strong"
      style={{
        padding: 16,
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        gap: 16
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <FilePreview file={file} size={120} rounded={16} />
        <span className="text-muted" style={{ fontSize: 11 }}>
          {String(file.fileType).toUpperCase()} · {formatBytes(file.fileSize)}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <StatusBadge status={file.status} />
            <span className="text-muted">
              <strong style={{ color: 'var(--c-text-soft)' }}>Original:</strong>{' '}
              {file.originalFilename}
            </span>
          </div>
          <ActionMenu
            items={[
              {
                key: 'copy',
                label: 'Copy Metadata as JSON',
                icon: <Copy size={14} />,
                onClick: () => {
                  navigator.clipboard.writeText(JSON.stringify(meta ?? {}, null, 2))
                  showToast('success', 'Metadata copied to clipboard')
                }
              },
              {
                key: 'reset',
                label: 'Reset to AI Version',
                icon: <RefreshCcw size={14} />,
                disabled: !file.aiMetadata,
                onClick: () => resetToAi(file.id)
              },
              {
                key: 'review',
                label: 'Mark as Need Review',
                icon: <ListChecks size={14} />,
                onClick: () => setFileStatus(file.id, 'Need Approval')
              },
              {
                key: 'view-log',
                label: 'View File Log',
                icon: <FileSearch size={14} />,
                onClick: () => {
                  useAppStore.getState().setActivePage('logs')
                }
              },
              {
                key: 'delete',
                label: 'Delete File from Project',
                icon: <Trash2 size={14} />,
                danger: true,
                onClick: () => removeFiles([file.id])
              }
            ]}
          />
        </div>

        {wasRenamed && (
          <div className="warn-banner" style={{ fontSize: 12 }}>
            <Eye size={14} /> This file was already renamed/exported — editing may require a
            re-export.
          </div>
        )}

        <div className="field">
          <div className="label-row">
            <span className="label">
              Title{' '}
              <InfoIcon content="Concise, descriptive title under 70 chars. Used as filename after Approve & Rename." />
            </span>
            <span
              className={
                tStatus.state === 'empty' || tStatus.state === 'tooLong'
                  ? 'title-counter title-counter--err'
                  : tStatus.state === 'warn'
                    ? 'title-counter title-counter--warn'
                    : 'title-counter'
              }
              style={{ fontSize: 11 }}
            >
              {tStatus.count}/{TITLE_RECOMMENDED_MAX}
            </span>
          </div>
          <input
            className={`input ${
              tStatus.state === 'empty' || tStatus.state === 'tooLong'
                ? 'input--error'
                : tStatus.state === 'warn'
                  ? 'input--warn'
                  : ''
            }`}
            value={meta?.title ?? ''}
            onChange={(e) => updateEditedMetadata(file.id, { title: e.target.value })}
            placeholder="Generate metadata to populate the title"
            maxLength={200}
          />
          {tStatus.message && (
            <div
              className={`field-helper ${
                tStatus.state === 'empty' || tStatus.state === 'tooLong'
                  ? 'field-helper--error'
                  : 'field-helper--warn'
              }`}
            >
              {tStatus.message}
            </div>
          )}
          {meta?.titleOriginal && meta.titleOriginal !== meta.title && (
            <div className="row" style={{ gap: 6, marginTop: 4, fontSize: 11 }}>
              <span className="text-muted">
                AI suggested a shorter title. Original ({meta.titleOriginal.length} chars):
              </span>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => updateEditedMetadata(file.id, { title: meta.titleOriginal! })}
                title="Replace with the original AI-generated title"
              >
                <Undo2 size={12} /> Use original
              </button>
            </div>
          )}
        </div>

        <div className="field">
          <span className="label">
            Description <InfoIcon content="One natural sentence describing what is visible." />
          </span>
          <textarea
            className="textarea"
            value={meta?.description ?? ''}
            onChange={(e) => updateEditedMetadata(file.id, { description: e.target.value })}
            placeholder="Describe the visual content"
            rows={2}
          />
        </div>

        <div className="field">
          <span className="label">
            Keywords{' '}
            <InfoIcon content="Drag to reorder. First 10 are most important. Lowercase, no duplicates, no brand names." />
          </span>
          <KeywordChipList
            keywords={meta?.keywords ?? []}
            target={target}
            onChange={(next) => updateEditedMetadata(file.id, { keywords: next })}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field">
            <span className="label">
              Category <InfoIcon content="Pick the category that best matches the file content." />
            </span>
            <select
              className="select"
              value={meta?.category ?? ''}
              onChange={(e) => updateEditedMetadata(file.id, { category: e.target.value })}
            >
              <option value="">— Select —</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {meta?.category && !CATEGORIES.includes(meta.category) && (
                <option value={meta.category}>{meta.category}</option>
              )}
            </select>
          </div>

          <div className="field">
            <span className="label">
              Rename Preview{' '}
              <InfoIcon content="The new filename to be applied after Approve & Rename." />
            </span>
            <input
              className="input"
              value={file.renamePreview ?? ''}
              onChange={(e) => useAppStore.getState().setRenamePreview(file.id, e.target.value)}
              placeholder="(filename will be derived from title)"
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            className="btn"
            onClick={() => saveMetadata(file.id)}
            disabled={!isSaveable}
            title={
              !meta
                ? 'No metadata to save'
                : tStatus.state === 'empty'
                  ? 'Title is required'
                  : tStatus.state === 'tooLong'
                    ? tStatus.message
                    : 'Save edited metadata'
            }
          >
            <Save size={14} /> Save
          </button>
          <button
            className="btn btn-success"
            onClick={() => onApproveAndRename(file.id)}
            disabled={!isApprovable}
            title={
              file.status === 'Renamed'
                ? 'Already renamed'
                : tStatus.state === 'empty'
                  ? 'Title is required'
                  : tStatus.state === 'tooLong'
                    ? tStatus.message
                    : 'Approve metadata and rename file on disk'
            }
          >
            <CheckCircle2 size={14} /> Approve &amp; Rename
          </button>
          <button className="btn btn-warning" onClick={() => onRegenerate(file.id)}>
            <RefreshCcw size={14} /> Regenerate
          </button>
        </div>
      </div>
    </div>
  )
}

export function CompactMetadataRow({ file, onApproveAndRename }: Props) {
  const meta = file.editedMetadata ?? file.aiMetadata
  const tStatus = titleStatus(meta?.title ?? '')
  const compactApprovable =
    !!meta && tStatus.state !== 'empty' && tStatus.state !== 'tooLong' && file.status !== 'Renamed'
  return (
    <div
      className="glass"
      style={{
        padding: 10,
        display: 'grid',
        gridTemplateColumns: '52px 1.4fr 1.6fr 1fr 0.6fr auto',
        gap: 10,
        alignItems: 'center'
      }}
    >
      <FilePreview file={file} size={52} rounded={10} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {file.originalFilename}
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
          → {file.renamePreview ?? '—'}
        </div>
      </div>
      <div
        style={{
          minWidth: 0,
          fontSize: 13,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {meta?.title || <span className="text-muted">No title</span>}
      </div>
      <div className="text-muted" style={{ fontSize: 12 }}>
        {meta?.category || '—'}
      </div>
      <div className="text-muted" style={{ fontSize: 12 }}>
        {meta?.keywords.length ?? 0} kw
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <StatusBadge status={file.status} />
        <button
          className="btn btn-sm btn-success"
          onClick={() => onApproveAndRename(file.id)}
          disabled={!compactApprovable}
          title={
            tStatus.state === 'empty'
              ? 'Title is required'
              : tStatus.state === 'tooLong'
                ? tStatus.message
                : undefined
          }
        >
          Approve
        </button>
      </div>
    </div>
  )
}
