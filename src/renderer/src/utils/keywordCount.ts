export const KEYWORD_COUNT_PRESETS: readonly number[] = [30, 40, 49, 50, 100]
export const KEYWORD_COUNT_MIN = 1
export const KEYWORD_COUNT_MAX = 200

/** Clamp an arbitrary number to the supported keyword-count range and round to an integer. */
export function clampKeywordCount(raw: number): number {
  if (!Number.isFinite(raw)) return KEYWORD_COUNT_MIN
  const rounded = Math.round(raw)
  if (rounded < KEYWORD_COUNT_MIN) return KEYWORD_COUNT_MIN
  if (rounded > KEYWORD_COUNT_MAX) return KEYWORD_COUNT_MAX
  return rounded
}

/** True if the value is not one of the preset values; useful for showing the Custom number input. */
export function isCustomKeywordCount(value: number): boolean {
  return !KEYWORD_COUNT_PRESETS.includes(value)
}
