import { useState, useRef, useEffect, ReactNode } from 'react'
import { Info } from 'lucide-react'
import { useAppStore } from '@renderer/store/store'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  maxWidth?: number
}

export function Tooltip({ content, children, side = 'top', maxWidth = 240 }: TooltipProps) {
  const enabled = useAppStore((s) => s.settings.tooltipsEnabled)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useEffect(() => {
    if (!open || !wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const offset = 8
    let top = rect.top
    let left = rect.left + rect.width / 2
    if (side === 'top') top = rect.top - offset
    if (side === 'bottom') top = rect.bottom + offset
    if (side === 'left') {
      top = rect.top + rect.height / 2
      left = rect.left - offset
    }
    if (side === 'right') {
      top = rect.top + rect.height / 2
      left = rect.right + offset
    }
    setPos({ top, left })
  }, [open, side])

  if (!enabled) return <>{children}</>

  const transform =
    side === 'top'
      ? 'translate(-50%, -100%)'
      : side === 'bottom'
        ? 'translate(-50%, 0)'
        : side === 'left'
          ? 'translate(-100%, -50%)'
          : 'translate(0, -50%)'

  return (
    <>
      <span
        ref={wrapRef}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{ display: 'inline-flex', alignItems: 'center' }}
      >
        {children}
      </span>
      {open && (
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform,
            maxWidth,
            zIndex: 9999,
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              background: 'rgba(58, 44, 61, 0.92)',
              color: '#fef7f1',
              padding: '8px 11px',
              borderRadius: 10,
              fontSize: 12,
              lineHeight: 1.45,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              boxShadow: '0 8px 22px rgba(80, 40, 70, 0.22)',
              border: '1px solid rgba(255,255,255,0.12)'
            }}
          >
            {content}
          </div>
        </div>
      )}
    </>
  )
}

export function InfoIcon({ content }: { content: ReactNode }) {
  return (
    <Tooltip content={content} side="top">
      <Info
        size={13}
        strokeWidth={2}
        style={{ color: 'var(--c-text-muted)', cursor: 'help', verticalAlign: 'middle' }}
      />
    </Tooltip>
  )
}
