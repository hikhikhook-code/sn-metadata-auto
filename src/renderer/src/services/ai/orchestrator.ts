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
   * Set when the file format genuinely cannot be sent to any AI provider
   * (currently: SVG and EPS — vector formats whose raw bytes are XML/PostScript
   * source, which vision models can't interpret as an image). Raster images
   * (JPG/PNG/WEBP) and video (MP4/MOV/AVI/WEBM) are NOT marked unsupported
   * because:
   *  - Gemini accepts video bytes directly (file uploads);
   *  - OpenAI / Groq vision endpoints get the file's first-frame data URL via
   *    `readBase64` in `src/main/ipc/ai.ts`, which works for video containers
   *    even when the API's documented allow-list is image-only.
   * The caller marks the file as `Unsupported` rather than `Failed` and skips
   * retries, letting the user enter metadata manually via the Editor.
   */
  unsupported?: boolean
}

/**
 * File extensions whose raw bytes cannot be sent directly to any vision
 * provider we wire up. EPS stays here because we currently have no rasterizer
 * for PostScript; SVG is *not* in this set anymore — for SVG we rasterize to
 * a PNG preview via the main process and feed that to the provider instead
 * (see the SVG branch below).
 */
const UNSUPPORTED_AI_GENERATE_EXTS: ReadonlySet<string> = new Set(['eps'])

/**
 * Vector formats that need a rasterized preview before they reach the AI.
 * For each of these we ask the main process to produce a PNG snapshot, then
 * forward the snapshot path (with `fileType=png`) to the provider.
 */
const VECTOR_RASTERIZE_EXTS: ReadonlySet<string> = new Set(['svg'])

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
  if (UNSUPPORTED_AI_GENERATE_EXTS.has(ext)) {
    return {
      ok: false,
      unsupported: true,
      error: `${ext.toUpperCase()} files cannot be analyzed by AI vision providers because their bytes are vector source (XML / PostScript), not raster image data. Edit metadata manually in the Editor, then use Embed metadata to write it into the file.`
    }
  }

  // For vector formats with a known rasterizer (currently SVG), substitute
  // a PNG preview rendered by the main process before talking to any
  // provider. The original SVG file is left untouched on disk; the AI sees
  // the PNG snapshot and the resulting metadata is applied to the SVG.
  let aiFilePath = file.originalPath
  let aiFileType = String(file.fileType)
  if (VECTOR_RASTERIZE_EXTS.has(ext)) {
    const preview = await window.api.media.renderSvgPreview({
      filePath: file.originalPath,
      width: 1024
    })
    if (!preview.ok || !preview.previewPath) {
      return {
        ok: false,
        error: `SVG preview rendering failed. Metadata generation could not continue.${preview.error ? ` (${preview.error})` : ''}`
      }
    }
    aiFilePath = preview.previewPath
    aiFileType = 'png'
  }

  const now = Date.now()
  const usable = [...apiKeys]
    .filter(
      (k) =>
        k.enabled && k.apiKey && k.provider && k.status !== 'Disabled' && k.status !== 'Invalid'
    )
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
        filePath: aiFilePath,
        fileType: aiFileType,
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
