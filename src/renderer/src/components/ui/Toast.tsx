import { useEffect } from 'react'
import { useAppStore } from '@renderer/store/store'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

export function Toast() {
  const toast = useAppStore((s) => s.ui.toast)
  const dismiss = useAppStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toast) return
    // Info kind is used heavily by global click feedback; keep it short so
    // back-to-back clicks don't visibly stack. Other kinds linger longer
    // because they convey actual outcomes.
    const ms = toast.kind === 'info' ? 1800 : 3500
    const t = setTimeout(dismiss, ms)
    return () => clearTimeout(t)
  }, [toast, dismiss])

  if (!toast) return null

  const Icon =
    toast.kind === 'success'
      ? CheckCircle2
      : toast.kind === 'warning'
        ? AlertTriangle
        : toast.kind === 'error'
          ? AlertCircle
          : Info

  const color =
    toast.kind === 'success'
      ? 'var(--c-success)'
      : toast.kind === 'warning'
        ? 'var(--c-warning)'
        : toast.kind === 'error'
          ? 'var(--c-danger)'
          : 'var(--c-info)'

  return (
    <div
      className="glass-strong"
      style={{
        position: 'fixed',
        bottom: 'calc(var(--bottombar-h) + 16px)',
        right: 16,
        padding: '10px 14px',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: 380,
        boxShadow: 'var(--shadow-lg)'
      }}
    >
      <Icon size={18} color={color} />
      <span style={{ fontSize: 13 }}>{toast.message}</span>
      <button
        onClick={dismiss}
        className="btn-icon"
        style={{
          background: 'transparent',
          padding: 4,
          color: 'var(--c-text-soft)',
          marginLeft: 4
        }}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  )
}
