export const TITLE_RECOMMENDED_MAX = 70
export const TITLE_HARD_MAX = 200

export type TitleState = 'empty' | 'ok' | 'warn' | 'tooLong'

export interface TitleStatus {
  state: TitleState
  count: number
  message: string
}

export function titleStatus(raw: string): TitleStatus {
  // Trim before evaluating so that whitespace-only titles are treated as
  // empty, matching the save / rename guards in store and useBatch which
  // also trim before validating.
  const text = (raw ?? '').trim()
  const count = text.length
  if (count === 0) {
    return { state: 'empty', count, message: 'Title is required.' }
  }
  if (count > TITLE_HARD_MAX) {
    return {
      state: 'tooLong',
      count,
      message: `Title must be ${TITLE_HARD_MAX} characters or fewer (currently ${count}).`
    }
  }
  if (count > TITLE_RECOMMENDED_MAX) {
    return {
      state: 'warn',
      count,
      message: 'Adobe Stock recommends titles around 70 characters. This title may be too long.'
    }
  }
  return { state: 'ok', count, message: '' }
}

export function clampTitleHardMax(raw: string): string {
  const t = raw ?? ''
  return t.length > TITLE_HARD_MAX ? t.slice(0, TITLE_HARD_MAX) : t
}

export function shortenTitle(raw: string): string {
  let t = (raw ?? '').trim().replace(/\s+/g, ' ')
  // strip trailing "Keywords: ..." / "Tags: ..." / "SEO: ..." tail segments
  t = t.replace(/\s*[-—–|·,;:]+\s*(?:keywords?|tags?|seo|description|metadata)\s*[:\-—–|]+.*$/i, '')
  t = t
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim()
  if (t.length <= TITLE_RECOMMENDED_MAX) return t
  // Cut at the last word boundary <= recommended; require at least 30 chars
  // so we don't end up with a stub.
  const cut = t.slice(0, TITLE_RECOMMENDED_MAX)
  const lastSpace = cut.lastIndexOf(' ')
  const trimmed = lastSpace > 30 ? cut.slice(0, lastSpace) : cut
  return trimmed.replace(/[\s,;:.\-–—|]+$/g, '').trim()
}

export interface CleanedAiTitle {
  /** The title that should populate the editable field. */
  title: string
  /**
   * The unmodified AI-returned title, if it differs from `title`. Surfaced as
   * a "Use original" option so the user can revert.
   */
  titleOriginal?: string
}

const KEYWORD_LIST_RE = /(?:^|\s)([\p{L}\p{N}'-]+\s*,\s*){3,}[\p{L}\p{N}'-]+/u
const TRAILING_RANDOM_TOKEN_RE = /\s+\b(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{5,12}\b$/i
const FILENAME_SOURCE_SUFFIX_RE =
  /\s+(?:via\s+.*|(?:from|by)\s+.*|(?:adobe\s+)?firefly(?:\s+auto)?|stock|generated\s+by\s+.*|ai\s+generated)$/i

function stripFilenameArtifacts(raw: string): string {
  let out = raw
  let prev = ''
  while (out && out !== prev) {
    prev = out
    out = out
      .replace(FILENAME_SOURCE_SUFFIX_RE, '')
      .replace(TRAILING_RANDOM_TOKEN_RE, '')
      .replace(/\s+[-–—|·]\s*$/u, '')
      .trim()
  }
  return out
}

/**
 * Post-process a raw AI title:
 *  - clamp to {@link TITLE_HARD_MAX}
 *  - strip surrounding quotes
 *  - if the title looks like a comma-separated keyword list, replace it with
 *    a shortened form derived from the first phrase
 *  - if the result is still over the recommended length, suggest a shortened
 *    version and keep the original under `titleOriginal`
 */
export function cleanAiTitle(raw: string): CleanedAiTitle {
  const stripped = clampTitleHardMax(
    (raw ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim()
  )
  if (!stripped) return { title: '' }

  // If it looks like a keyword list (3+ commas), shorten to the first phrase
  // before the first comma so the title is descriptive rather than a tag list.
  let working = stripFilenameArtifacts(stripped)
  if (!working) working = stripped
  if (KEYWORD_LIST_RE.test(stripped)) {
    const firstChunk = stripped.split(/[,;|]/)[0].trim()
    if (firstChunk.length >= 12) working = firstChunk
  }

  if (working.length <= TITLE_RECOMMENDED_MAX) {
    return working === stripped ? { title: working } : { title: working, titleOriginal: stripped }
  }
  const shorter = shortenTitle(working)
  if (shorter && shorter.length < working.length) {
    return { title: shorter, titleOriginal: stripped }
  }
  // Could not shorten further; keep within hard max but record the original.
  return { title: working, titleOriginal: stripped !== working ? stripped : undefined }
}
