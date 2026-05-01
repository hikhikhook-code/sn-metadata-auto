import type { ApiKeyEntry, ApiKeyStatus, AppFile, Metadata } from '@renderer/types'
import { mockGenerate } from './mock'

export interface KeyStatusChange {
  id: string
  status: ApiKeyStatus
  lastError?: string
  cooldownUntil?: string
}

export interface GenerateOutcome {
  ok: boolean
  metadata?: Metadata
  apiProvider?: string
  apiKeySlot?: string
  error?: string
  keyStatusChanges?: KeyStatusChange[]
  rateLimitedAll?: boolean
  /**
   * Set when the file format is not supported by any AI vision provider
   * (e.g. SVG, EPS, MOV, MP4 — Gemini/OpenAI/Groq only accept JPG/PNG/WEBP).
   * The caller should mark the file as `Unsupported` rather than `Failed` and
   * not retry, so the user can fill metadata in manually via the Editor.
   */
  unsupported?: boolean
}

/**
 * Image MIME types that mainstream AI vision providers (Gemini, OpenAI, Groq,
 * and most OpenAI-compatible endpoints) accept for inline image input. Any
 * other extension is short-circuited as `unsupported` instead of triggering
 * a guaranteed-fail network round-trip.
 */
const AI_VISION_EXTS: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png', 'webp'])

interface OrchestrateOptions {
  useMock: boolean
  keywordCount: number
  delayBetweenApiCallsMs: number
  rateLimitCooldownSec: number
  autoSwitchOnLimit: boolean
}

const lastCallTime = new Map<string, number>()

async function waitForKeyGate(keyId: string, minDelayMs: number): Promise<number> {
  if (minDelayMs <= 0) {
    lastCallTime.set(keyId, Date.now())
    return 0
  }
  const last = lastCallTime.get(keyId) ?? 0
  const now = Date.now()
  // Reserve the slot BEFORE awaiting so concurrent callers see this caller's
  // expected completion time and queue behind it. Without this, multiple
  // workers reading lastCallTime in the same tick would all compute the same
  // wait and fire simultaneously, defeating delayBetweenApiCallsMs.
  const earliest = Math.max(now, last + minDelayMs)
  lastCallTime.set(keyId, earliest)
  const wait = earliest - now
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait))
  }
  return Math.max(0, wait)
}

export function resetKeyGate(): void {
  lastCallTime.clear()
}

export async function generateForFile(
  file: AppFile,
  apiKeys: ApiKeyEntry[],
  opts: OrchestrateOptions
): Promise<GenerateOutcome> {
  if (opts.useMock || apiKeys.length === 0) {
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 600))
    const metadata = mockGenerate(file.originalFilename, opts.keywordCount)
    return {
      ok: true,
      metadata,
      apiProvider: 'Mock',
      apiKeySlot: 'Mock Key 1'
    }
  }

  const ext = String(file.fileType).toLowerCase()
  if (!AI_VISION_EXTS.has(ext)) {
    return {
      ok: false,
      unsupported: true,
      error: `${ext.toUpperCase()} files are not supported by AI vision providers (image-only: JPG, PNG, WEBP). Edit metadata manually in the Editor, then use Embed metadata to write it into the file.`
    }
  }

  const now = Date.now()
  const usable = [...apiKeys]
    .filter((k) => k.enabled && k.apiKey && k.status !== 'Disabled' && k.status !== 'Invalid')
    .filter((k) => {
      if (!k.cooldownUntil) return true
      return new Date(k.cooldownUntil).getTime() <= now
    })
    .sort((a, b) => a.priority - b.priority)

  if (usable.length === 0) {
    return {
      ok: false,
      error: 'No usable API keys (all in cooldown or limited)',
      rateLimitedAll: true
    }
  }

  const keysToTry = opts.autoSwitchOnLimit ? usable : usable.slice(0, 1)
  const keyStatusChanges: KeyStatusChange[] = []
  let lastError = ''

  for (const key of keysToTry) {
    await waitForKeyGate(key.id, opts.delayBetweenApiCallsMs)
    const slot = `${key.provider} Key ${key.priority}`
    try {
      const res = await window.api.ai.generate({
        provider: key.provider,
        apiKey: key.apiKey,
        baseUrl: key.baseUrl,
        model: key.model,
        filePath: file.originalPath,
        fileType: String(file.fileType),
        keywordCount: opts.keywordCount
      })
      if (res.ok && res.metadata) {
        return {
          ok: true,
          metadata: res.metadata,
          apiProvider: key.provider,
          apiKeySlot: slot,
          keyStatusChanges: keyStatusChanges.length ? keyStatusChanges : undefined
        }
      }
      lastError = res.error ?? 'Unknown error'
      if (res.status === 'Limit') {
        const cooldownUntil = new Date(Date.now() + opts.rateLimitCooldownSec * 1000).toISOString()
        keyStatusChanges.push({
          id: key.id,
          status: 'Limit',
          lastError,
          cooldownUntil
        })
        continue
      }
      if (res.status === 'Invalid') {
        keyStatusChanges.push({ id: key.id, status: 'Invalid', lastError })
        continue
      }
      // generic error: try next key (no status change)
    } catch (e) {
      lastError = (e as Error).message
    }
  }

  const allLimited =
    keyStatusChanges.length > 0 && keyStatusChanges.every((c) => c.status === 'Limit')
  return {
    ok: false,
    error: lastError || 'All API keys failed',
    keyStatusChanges: keyStatusChanges.length ? keyStatusChanges : undefined,
    rateLimitedAll: allLimited
  }
}
