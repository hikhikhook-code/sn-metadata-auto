import { useEffect } from 'react'
import { useAppStore } from '../store/store'
import type { ThemePreference } from '../types'

/**
 * Resolve a `ThemePreference` to a concrete theme that CSS understands.
 * `'system'` collapses to whatever the OS reports right now via the standard
 * `prefers-color-scheme` media query. We cannot use `'system'` directly as a
 * `data-theme` value because the CSS variable contract only ships `light` and
 * `dark` palettes.
 */
function resolveSystemTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply the user's theme preference to `<html data-theme="...">`. The CSS in
 * `theme.css` resolves all colors from there.
 *
 * Behavior:
 *  - `'light'` / `'dark'` → write the value directly. Stays put even if the
 *    OS theme changes.
 *  - `'system'` → write whatever the OS currently reports, AND subscribe to
 *    `(prefers-color-scheme: dark)` so the app updates live when the user
 *    flips their OS appearance.
 *
 * Returning `theme` from `useAppStore` (instead of subscribing to the whole
 * settings object) means we only re-run the effect when the theme actually
 * changes, not on every settings tweak.
 */
export function useTheme(): void {
  const theme = useAppStore((s) => s.settings.theme)

  useEffect(() => {
    const root = document.documentElement
    const apply = (): void => {
      root.setAttribute('data-theme', resolveSystemTheme(theme))
    }
    apply()
    if (theme !== 'system') return
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    // Safari < 14 only supports the legacy addListener API.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
    mq.addListener(apply)
    return () => mq.removeListener(apply)
  }, [theme])
}
