export function normalizeKeyword(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function dedupeKeywords(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of list) {
    const k = normalizeKeyword(raw)
    if (!k) continue
    if (seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

export function parsePriorityKeywords(text: string): string[] {
  return dedupeKeywords(String(text || '').split(/[\s,]+/))
}

export function prioritizeKeywords(
  existingKeywords: string[] | string,
  priorityKeywords: string[] | string,
  maxKeywords?: number | null
): string[] {
  const existing = Array.isArray(existingKeywords)
    ? existingKeywords
    : String(existingKeywords || '').split(',')
  const priority = Array.isArray(priorityKeywords)
    ? priorityKeywords
    : parsePriorityKeywords(priorityKeywords)
  const max =
    typeof maxKeywords === 'number' && Number.isFinite(maxKeywords) && maxKeywords > 0
      ? Math.floor(maxKeywords)
      : null

  const prioritized = dedupeKeywords([...priority.map(normalizeKeyword), ...existing])
  return max == null ? prioritized : prioritized.slice(0, max)
}

export function autoSortKeywords(list: string[]): string[] {
  // Sort by: shorter (more general/important) first, then alphabetically.
  return [...dedupeKeywords(list)].sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length
    return a.localeCompare(b)
  })
}

const COPYRIGHT_HINTS = [
  'disney',
  'marvel',
  'pixar',
  'apple',
  'samsung',
  'nike',
  'adidas',
  'coca-cola',
  'mcdonalds',
  'starbucks',
  'google',
  'microsoft',
  'tesla',
  'amazon',
  'facebook',
  'instagram',
  'tiktok'
]

export function findCopyrightHints(list: string[]): string[] {
  const flagged: string[] = []
  for (const k of list) {
    const lk = k.toLowerCase()
    for (const c of COPYRIGHT_HINTS) {
      if (lk.includes(c)) {
        flagged.push(k)
        break
      }
    }
  }
  return flagged
}
