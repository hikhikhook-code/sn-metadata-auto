import type { Metadata } from '@renderer/types'

const COLORS = ['warm', 'soft', 'vibrant', 'pastel', 'natural', 'fresh', 'minimal', 'modern']
const SUBJECTS = [
  'composition',
  'concept',
  'design',
  'background',
  'pattern',
  'scene',
  'illustration',
  'visual'
]

const KEYWORD_POOL = [
  'background',
  'design',
  'creative',
  'modern',
  'minimal',
  'colorful',
  'concept',
  'lifestyle',
  'professional',
  'high quality',
  'detailed',
  'clean',
  'bright',
  'soft',
  'elegant',
  'natural',
  'artistic',
  'vibrant',
  'composition',
  'beautiful',
  'stylish',
  'simple',
  'pattern',
  'texture',
  'graphic',
  'photo',
  'image',
  'studio',
  'fresh',
  'illustration',
  'isolated',
  'abstract',
  'vector',
  'icon',
  'business',
  'nature',
  'closeup',
  'space',
  'light',
  'shadow',
  'wallpaper',
  'horizontal',
  'vertical',
  'banner',
  'card',
  'cover',
  'poster',
  'frame',
  'editorial'
]

function pick<T>(arr: T[], n: number): T[] {
  const out: T[] = []
  const used = new Set<number>()
  let attempts = 0
  while (out.length < n && attempts < arr.length * 4) {
    const idx = Math.floor(Math.random() * arr.length)
    if (!used.has(idx)) {
      used.add(idx)
      out.push(arr[idx])
    }
    attempts++
  }
  return out
}

const CATEGORIES = [
  'Backgrounds / Textures',
  'Nature',
  'Business',
  'Lifestyle',
  'Objects',
  'Concepts',
  'Abstract',
  'Technology'
]

export function mockGenerate(_filename: string, keywordCount: number): Metadata {
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)]
  const titleBase = `${color} ${subject}`
  const title =
    titleBase
      .split(' ')
      .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .slice(0, 8)
      .join(' ')
      .slice(0, 70) || 'Beautiful Modern Composition'

  const description = `${title} — a ${color} ${subject} suited for editorial, commercial, and creative use.`
  const baseKeywords = pick(KEYWORD_POOL, Math.min(keywordCount, KEYWORD_POOL.length))
  // Pad if requested more than pool size
  const keywords = [...baseKeywords]
  let i = 1
  while (keywords.length < keywordCount) {
    keywords.push(`tag ${i++}`)
  }
  const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]
  return { title, description, keywords: keywords.slice(0, keywordCount), category }
}
