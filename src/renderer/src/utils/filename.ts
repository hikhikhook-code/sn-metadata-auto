import type { AppSettings } from '@renderer/types'

const ILLEGAL = /[\\/:*?"<>|]/g

export function sanitizeFilenameBase(input: string): string {
  return input.replace(ILLEGAL, '').replace(/\s+/g, ' ').trim()
}

export function buildRenamePreview(
  title: string,
  originalFilename: string,
  settings: AppSettings
): string {
  const base = sanitizeFilenameBase(title || '')
  if (!base) return originalFilename
  let stem = base
  if (settings.useTitleCase) {
    stem = stem.replace(/\w\S*/g, (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
  }
  if (settings.useLowercaseFilename) {
    stem = stem.toLowerCase()
  }
  if (settings.replaceSpacesWithHyphen) {
    stem = stem.replace(/\s+/g, '-')
  }
  const dot = originalFilename.lastIndexOf('.')
  const ext = dot >= 0 ? originalFilename.slice(dot) : ''
  return `${stem}${ext}`
}

export function ensureUniqueFilename(name: string, existing: Set<string>): string {
  if (!existing.has(name)) return name
  const dot = name.lastIndexOf('.')
  const stem = dot >= 0 ? name.slice(0, dot) : name
  const ext = dot >= 0 ? name.slice(dot) : ''
  let i = 2
  while (existing.has(`${stem} ${i}${ext}`)) i++
  return `${stem} ${i}${ext}`
}
