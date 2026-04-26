import { useState, KeyboardEvent } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import { arrayMove, SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X, GripHorizontal, Edit2, Plus, Trash2, ArrowDownAZ } from 'lucide-react'
import {
  dedupeKeywords,
  autoSortKeywords,
  normalizeKeyword,
  findCopyrightHints
} from '@renderer/utils/keywords'

interface Props {
  keywords: string[]
  target?: number
  onChange: (next: string[]) => void
  readOnly?: boolean
  compact?: boolean
}

interface ChipProps {
  id: string
  index: number
  value: string
  highlight?: boolean
  onRemove: () => void
  onEdit: (next: string) => void
  readOnly?: boolean
}

function SortableChip({ id, index, value, highlight, onRemove, onEdit, readOnly }: ChipProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: readOnly
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px 4px 10px',
        borderRadius: 999,
        background: highlight
          ? 'rgba(246, 213, 211, 0.85)'
          : index < 10
            ? 'rgba(255, 230, 215, 0.85)'
            : 'rgba(255, 255, 255, 0.7)',
        border: '1px solid var(--c-border-strong)',
        fontSize: 12,
        fontWeight: 500,
        color: 'var(--c-text)',
        cursor: readOnly ? 'default' : 'grab',
        userSelect: 'none'
      }}
    >
      {!readOnly && (
        <span
          {...attributes}
          {...listeners}
          style={{ display: 'inline-flex', color: 'var(--c-text-muted)' }}
          title="Drag to reorder"
        >
          <GripHorizontal size={12} />
        </span>
      )}
      <span
        style={{
          display: 'inline-flex',
          width: 18,
          height: 18,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.6)',
          color: 'var(--c-text-muted)',
          fontSize: 10,
          fontWeight: 700,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {index + 1}
      </span>
      {editing && !readOnly ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setEditing(false)
            const v = normalizeKeyword(draft)
            if (v && v !== value) onEdit(v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setEditing(false)
              const v = normalizeKeyword(draft)
              if (v && v !== value) onEdit(v)
            } else if (e.key === 'Escape') {
              setEditing(false)
              setDraft(value)
            }
          }}
          style={{
            background: 'transparent',
            border: 0,
            outline: 0,
            width: Math.max(40, value.length * 7),
            color: 'inherit',
            fontSize: 'inherit'
          }}
        />
      ) : (
        <span onDoubleClick={() => !readOnly && setEditing(true)} title="Double-click to edit">
          {value}
        </span>
      )}
      {!readOnly && !editing && (
        <button
          className="btn-icon"
          onClick={() => setEditing(true)}
          style={{ padding: 2, color: 'var(--c-text-muted)' }}
          aria-label="Edit"
        >
          <Edit2 size={11} />
        </button>
      )}
      {!readOnly && (
        <button
          className="btn-icon"
          onClick={onRemove}
          style={{ padding: 2, color: 'var(--c-text-muted)' }}
          aria-label="Remove"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

export function KeywordChipList({ keywords, target = 49, onChange, readOnly, compact }: Props) {
  const [draft, setDraft] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const flagged = new Set(findCopyrightHints(keywords))

  function add() {
    const list = draft.split(',').map(normalizeKeyword).filter(Boolean)
    if (list.length === 0) return
    onChange(dedupeKeywords([...keywords, ...list]))
    setDraft('')
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    }
  }

  function remove(idx: number) {
    const next = keywords.slice()
    next.splice(idx, 1)
    onChange(next)
  }

  function edit(idx: number, val: string) {
    const next = keywords.slice()
    next[idx] = val
    onChange(dedupeKeywords(next))
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = keywords.findIndex((_, i) => `kw-${i}` === active.id)
    const newIndex = keywords.findIndex((_, i) => `kw-${i}` === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onChange(arrayMove(keywords, oldIndex, newIndex))
  }

  const counterColor =
    keywords.length === target
      ? 'var(--c-success)'
      : keywords.length > target
        ? 'var(--c-danger)'
        : keywords.length < Math.max(1, Math.floor(target * 0.6))
          ? 'var(--c-warning)'
          : 'var(--c-text-soft)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: counterColor }}>
          {keywords.length}/{target}
          {keywords.length > target && <span> · over limit</span>}
          {flagged.size > 0 && <span> · {flagged.size} need review</span>}
        </span>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => onChange(autoSortKeywords(keywords))}
              title="Auto sort"
            >
              <ArrowDownAZ size={13} /> Auto Sort
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => onChange(dedupeKeywords(keywords))}
              title="Remove duplicates"
            >
              <Trash2 size={13} /> Dedupe
            </button>
          </div>
        )}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={keywords.map((_, i) => `kw-${i}`)} strategy={rectSortingStrategy}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              padding: compact ? 4 : 6,
              minHeight: compact ? 36 : 48,
              borderRadius: 12,
              background: 'rgba(255,255,255,0.35)',
              border: '1px dashed var(--c-border-strong)'
            }}
          >
            {keywords.map((kw, i) => (
              <SortableChip
                key={`kw-${i}`}
                id={`kw-${i}`}
                index={i}
                value={kw}
                highlight={flagged.has(kw)}
                onRemove={() => remove(i)}
                onEdit={(v) => edit(i, v)}
                readOnly={readOnly}
              />
            ))}
            {keywords.length === 0 && (
              <span style={{ color: 'var(--c-text-muted)', fontSize: 12, padding: 4 }}>
                No keywords yet.
              </span>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {!readOnly && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            className="input"
            placeholder="Add keyword (Enter or comma to add multiple)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            style={{ fontSize: 13 }}
          />
          <button className="btn" onClick={add} disabled={!draft.trim()}>
            <Plus size={14} /> Add
          </button>
        </div>
      )}
    </div>
  )
}
