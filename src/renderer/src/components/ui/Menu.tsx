import { useState, useRef, useEffect, ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'

export interface MenuItem {
  key: string
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

export function ActionMenu({ items, label }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={label ?? 'More actions'}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div
          className="glass-strong"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            minWidth: 200,
            padding: 6,
            zIndex: 50,
            boxShadow: 'var(--shadow-lg)'
          }}
        >
          {items.map((it) => (
            <button
              key={it.key}
              disabled={it.disabled}
              onClick={() => {
                if (it.disabled) return
                setOpen(false)
                it.onClick()
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 10px',
                borderRadius: 10,
                fontSize: 13,
                textAlign: 'left',
                background: 'transparent',
                color: it.danger ? 'var(--c-danger)' : 'var(--c-text)',
                opacity: it.disabled ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (!it.disabled)
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.6)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              {it.icon}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
