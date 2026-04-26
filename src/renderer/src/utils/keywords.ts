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
