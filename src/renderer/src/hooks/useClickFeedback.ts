import { useEffect, useRef } from 'react'
import { useAppStore } from '@renderer/store/store'

/**
 * Global click feedback.
 *
 * Listens for clicks anywhere in the app and shows a brief info toast with the
 * clicked button's label, so users get immediate confirmation that their click
 * registered.
 *
 * Skipped to avoid noise:
 *   - disabled buttons (no real action),
 *   - sidebar/nav buttons (page change is already a strong visual cue),
 *   - tabs (role="tab"),
 *   - the toast dismiss button (aria-label="Dismiss"),
 *   - any element with `data-no-toast="true"` on the button or an ancestor,
 *   - buttons whose label exceeds 60 characters or is empty.
 *
 * Same-label clicks within 200 ms collapse to a single toast so double-clicks
 * don't flash twice.
 */
export function useClickFeedback(): void {
  const showToast = useAppStore((s) => s.showToast)
  const lastRef = useRef<{ label: string; at: number }>({ label: '', at: 0 })

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      const target = e.target as HTMLElement | null
      if (!target) return
      const btn = target.closest('button') as HTMLButtonElement | null
      if (!btn) return
      if (btn.disabled) return
      if (btn.dataset.noToast === 'true') return
      if (btn.getAttribute('role') === 'tab') return
      if (btn.closest('nav')) return
      if (btn.closest('[data-no-toast="true"]')) return

      const ariaLabel = btn.getAttribute('aria-label')
      const text = (btn.textContent || '').replace(/\s+/g, ' ').trim()
      // Prefer the visible text — that's what the user actually clicked on.
      // Fall back to aria-label for icon-only buttons.
      const raw = (text || ariaLabel || '').trim()
      if (!raw) return
      if (raw.length > 60) return
      if (raw === 'Dismiss') return

      const now = Date.now()
      if (lastRef.current.label === raw && now - lastRef.current.at < 200) return
      lastRef.current = { label: raw, at: now }

      showToast('info', raw)
    }

    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [showToast])
}
