import type { ApiKeyEntry, AppFile, Metadata } from '@renderer/types'
import { mockGenerate } from './mock'

export interface GenerateOutcome {
  ok: boolean
  metadata?: Metadata
  apiProvider?: string
  apiKeySlot?: string
  error?: string
  keyStatusChange?: { id: string; status: ApiKeyEntry['status']; lastError?: string }
}

interface OrchestrateOptions {
  useMock: boolean
  keywordCount: number
}

export async function generateForFile(
  file: AppFile,
  apiKeys: ApiKeyEntry[],
  opts: OrchestrateOptions
): Promise<GenerateOutcome> {
  if (opts.useMock || apiKeys.length === 0) {
    // Simulate a network delay
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 600))
    const metadata = mockGenerate(file.originalFilename, opts.keywordCount)
    return {
      ok: true,
      metadata,
      apiProvider: 'Mock',
      apiKeySlot: 'Mock Key 1'
    }
  }

  const sorted = [...apiKeys]
    .filter((k) => k.enabled && k.apiKey && k.status !== 'Disabled' && k.status !== 'Invalid')
    .sort((a, b) => a.priority - b.priority)

  if (sorted.length === 0) {
    return { ok: false, error: 'No usable API keys configured' }
  }

  let lastError = ''
  for (const key of sorted) {
    try {
      const slot = `${key.provider} Key ${key.priority}`
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
          apiKeySlot: slot
        }
      }
      lastError = res.error ?? 'Unknown error'
      if (res.status === 'Limit') {
        return {
          ok: false,
          error: lastError,
          keyStatusChange: { id: key.id, status: 'Limit', lastError }
        }
      }
      if (res.status === 'Invalid') {
        // mark and try next
        return {
          ok: false,
          error: lastError,
          keyStatusChange: { id: key.id, status: 'Invalid', lastError }
        }
      }
      // For generic errors continue to next key
    } catch (e) {
      lastError = (e as Error).message
    }
  }

  return { ok: false, error: lastError || 'All API keys failed' }
}
