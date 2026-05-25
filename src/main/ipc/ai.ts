import { ipcMain } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'

interface KeyInput {
  provider: string
  apiKey: string
  baseUrl?: string
  model?: string
}

interface FetchModelsInput {
  provider: string
  apiKey: string
  baseUrl?: string
}

interface GenerateInput {
  provider: string
  apiKey: string
  baseUrl?: string
  model: string
  filePath: string
  fileType: string
  keywordCount: number
}

interface GenericMetadata {
  title: string
  description: string
  keywords: string[]
  category: string
}

const STOCK_CATEGORIES = [
  'Animals',
  'Architecture',
  'Beauty / Fashion',
  'Business',
  'Education',
  'Food and Drink',
  'Healthcare',
  'Holidays',
  'Industrial',
  'Lifestyle',
  'Nature',
  'Objects',
  'People',
  'Religion',
  'Science',
  'Signs / Symbols',
  'Sports',
  'Technology',
  'Transportation',
  'Travel',
  'Vintage',
  'Wellbeing',
  'Abstract',
  'Backgrounds / Textures',
  'Concepts'
]

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  webm: 'video/webm',
  eps: 'application/postscript'
}

function buildSystemPrompt(): string {
  return `You are a senior microstock metadata editor. You analyze only the uploaded visual content and return marketplace-ready metadata. You never use filenames, paths, random IDs, generator labels, watermarks, or upload-source text as metadata.`
}

function buildMetadataPrompt(keywordCount: number, fileType: string): string {
  return `Analyze the uploaded ${fileType.toUpperCase()} file visually and generate accurate commercial stock metadata.

Hard rule: the title, description, and keywords must describe what is visible in the media. Ignore filename-like text, random suffixes, creator names, "via", "Firefly", "Auto", upload source labels, and any text that is not actually part of the visual subject.

Return ONLY valid JSON with this exact structure (no markdown, no code fence):
{"title":"","description":"","keywords":[],"category":""}

Title:
- Write one natural English stock title, 45-70 characters when possible.
- Use the main visible subject first, then the setting/action/concept.
- Do not write a keyword list. Do not use commas unless naturally needed.
- Do not include file IDs, camera names, usernames, provider names, generator names, "via", "Firefly", or "Auto".
- Do not invent brands, locations, people identity, medical claims, or events.
- Must be safe as a filename: no slashes, quotes, pipes, leading/trailing punctuation.

Description:
- Write one complete natural sentence, 90-160 characters when possible.
- Describe subject, action, setting, mood, and commercial use case if visible.
- Do not repeat the title exactly.
- Do not mention "image", "photo", "stock", "AI", "generated", file names, or metadata.

Keywords:
- Generate exactly ${keywordCount} keywords as a JSON array of strings.
- All keywords must be lowercase, trimmed, unique, and comma-free.
- The first 10 keywords must be the strongest buyer search terms in priority order.
- Include visible subject, setting, action, attributes, style, concept, composition, and use case.
- Do not include filler terms such as "image", "photo", "stock", "generated", "ai", "high quality", "beautiful", "creative", "design" unless they are visibly specific and useful.
- Avoid brands, logos, copyrighted characters, artist names, trademarks, exact locations, medical/legal claims, and anything not visible.
- For vectors, include "vector", "illustration", "icon", or "graphic" only when visually true.
- For video, include motion/action terms only when visible.

Category:
- Choose exactly one category from this list:
${STOCK_CATEGORIES.join(', ')}

Quality check before final JSON:
- If the title sounds like a filename, rewrite it from the visual content.
- If keywords are generic or duplicated, replace them with visible, buyer-focused terms.
- If uncertain, use conservative visual terms rather than guessing.`
}

function normalizeKeywordList(raw: unknown): string[] {
  const source = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of source) {
    const keyword = String(item ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/^[,;|]+|[,;|]+$/g, '')
    if (!keyword || seen.has(keyword)) continue
    seen.add(keyword)
    out.push(keyword)
  }
  return out
}

function parseJson(content: string): GenericMetadata | null {
  if (!content) return null
  let txt = content.trim()
  // strip ```json fences if any
  txt = txt.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '')
  // find first { ... last }
  const start = txt.indexOf('{')
  const end = txt.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    const obj = JSON.parse(txt.slice(start, end + 1)) as Partial<GenericMetadata>
    if (!obj || typeof obj !== 'object') return null
    return {
      title: String(obj.title ?? ''),
      description: String(obj.description ?? ''),
      keywords: normalizeKeywordList(obj.keywords),
      category: String(obj.category ?? '')
    }
  } catch {
    return null
  }
}

async function readBase64(p: string): Promise<{ base64: string; mime: string }> {
  const buf = await fs.readFile(p)
  const ext = path.extname(p).slice(1).toLowerCase()
  const mime = MIME_BY_EXT[ext] ?? 'application/octet-stream'
  return { base64: buf.toString('base64'), mime }
}

// ---------- Gemini ----------
async function geminiCheckKey(
  input: KeyInput
): Promise<{ ok: boolean; status: string; error?: string }> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(input.apiKey)}`
    const r = await fetch(url)
    if (r.ok) return { ok: true, status: 'Valid' }
    if (r.status === 429) return { ok: false, status: 'Limit', error: 'Rate limited' }
    return { ok: false, status: 'Invalid', error: `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, status: 'Error', error: (e as Error).message }
  }
}

async function geminiFetchModels(
  input: FetchModelsInput
): Promise<{ ok: boolean; models?: unknown[]; error?: string }> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(input.apiKey)}`
    const r = await fetch(url)
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` }
    const data = (await r.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[]; description?: string }>
    }
    const models = (data.models ?? []).map((m) => {
      const id = (m.name ?? '').replace(/^models\//, '')
      const supportsGen = (m.supportedGenerationMethods ?? []).includes('generateContent')
      const looksVision =
        /flash|pro|vision|2\.|3\./i.test(id) && !/embedding|tts|veo|nano-banana|imagen/i.test(id)
      const category = !supportsGen
        ? 'Embedding Only'
        : /imagen|nano-banana/i.test(id)
          ? 'Image Generation Only'
          : /veo/i.test(id)
            ? 'Video Generation Only'
            : /tts/i.test(id)
              ? 'Audio Only'
              : looksVision
                ? 'Vision Support'
                : 'Text Only'
      return {
        id,
        label: id,
        category,
        vision: looksVision,
        description: m.description
      }
    })
    return { ok: true, models }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

async function geminiGenerate(
  input: GenerateInput
): Promise<{ ok: boolean; metadata?: GenericMetadata; error?: string; status?: string }> {
  try {
    const { base64, mime } = await readBase64(input.filePath)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      input.model
    )}:generateContent?key=${encodeURIComponent(input.apiKey)}`
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: `${buildSystemPrompt()}\n\n${buildMetadataPrompt(input.keywordCount, input.fileType)}` },
            { inline_data: { mime_type: mime, data: base64 } }
          ]
        }
      ],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4 }
    }
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!r.ok) {
      if (r.status === 429) return { ok: false, status: 'Limit', error: 'Rate limited' }
      return {
        ok: false,
        status: r.status === 401 || r.status === 403 ? 'Invalid' : 'Error',
        error: `HTTP ${r.status}`
      }
    }
    const data = (await r.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    const meta = parseJson(text)
    if (!meta) return { ok: false, status: 'Error', error: 'Failed to parse model output' }
    return { ok: true, metadata: meta }
  } catch (e) {
    return { ok: false, status: 'Error', error: (e as Error).message }
  }
}

// ---------- OpenAI ----------
function openAiBase(input: { baseUrl?: string }): string {
  return input.baseUrl?.replace(/\/+$/, '') || 'https://api.openai.com/v1'
}

// Map an OpenAI-compatible HTTP status code to a user-facing error string.
// Status codes never round-trip to the user — they only see this text — so it
// must be self-explanatory. The wider `status` enum (Valid / Invalid / Limit /
// Error) is still set by the caller to drive UI badges + key-rotation logic.
function openAiHttpErrorMessage(status: number): string {
  if (status === 401 || status === 403) return 'Invalid API key (HTTP ' + status + ')'
  if (status === 429) return 'Rate limit hit (HTTP 429) — wait or rotate keys'
  if (status >= 500 && status < 600) return 'Server error (HTTP ' + status + ')'
  return 'HTTP ' + status
}

async function openaiCheckKey(
  input: KeyInput
): Promise<{ ok: boolean; status: string; error?: string }> {
  try {
    const r = await fetch(`${openAiBase(input)}/models`, {
      headers: { authorization: `Bearer ${input.apiKey}` }
    })
    if (r.ok) return { ok: true, status: 'Valid' }
    if (r.status === 429) return { ok: false, status: 'Limit', error: openAiHttpErrorMessage(429) }
    if (r.status >= 500 && r.status < 600)
      return { ok: false, status: 'Error', error: openAiHttpErrorMessage(r.status) }
    return { ok: false, status: 'Invalid', error: openAiHttpErrorMessage(r.status) }
  } catch (e) {
    return { ok: false, status: 'Error', error: 'Network error: ' + (e as Error).message }
  }
}

async function openaiFetchModels(
  input: FetchModelsInput
): Promise<{ ok: boolean; models?: unknown[]; error?: string }> {
  try {
    const r = await fetch(`${openAiBase(input)}/models`, {
      headers: { authorization: `Bearer ${input.apiKey}` }
    })
    if (!r.ok) return { ok: false, error: openAiHttpErrorMessage(r.status) }
    const data = (await r.json()) as { data?: Array<{ id: string }> }
    const models = (data.data ?? []).map((m) => {
      const id = m.id
      const lower = id.toLowerCase()
      let category: string = 'Text Only'
      let vision = false
      if (/embedding/.test(lower)) category = 'Embedding Only'
      else if (/whisper|audio|tts|realtime/.test(lower)) category = 'Audio Only'
      else if (/dall-e|image/.test(lower) && !/gpt-image/.test(lower))
        category = 'Image Generation Only'
      else if (/gpt-image/.test(lower)) {
        category = 'Image Generation Only'
      } else if (/moderation/.test(lower)) category = 'Text Only'
      else if (/(gpt-4o|gpt-4\.1|gpt-5|o1|o3|o4|chatgpt-4o|vision)/.test(lower)) {
        category = 'Vision Support'
        vision = true
      }
      return { id, label: id, category, vision }
    })
    return { ok: true, models }
  } catch (e) {
    // Catches the fetch() throw (network) *and* r.json() throw (malformed
    // response body); use the raw message so a JSON-parse failure isn't
    // mis-labeled as "Network error".
    return { ok: false, error: (e as Error).message }
  }
}

async function openaiGenerate(
  input: GenerateInput
): Promise<{ ok: boolean; metadata?: GenericMetadata; error?: string; status?: string }> {
  try {
    const { base64, mime } = await readBase64(input.filePath)
    const dataUrl = `data:${mime};base64,${base64}`
    const r = await fetch(`${openAiBase(input)}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt()
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: buildMetadataPrompt(input.keywordCount, input.fileType) },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4
      })
    })
    if (!r.ok) {
      if (r.status === 429)
        return { ok: false, status: 'Limit', error: openAiHttpErrorMessage(429) }
      const status = r.status === 401 || r.status === 403 ? 'Invalid' : 'Error'
      return { ok: false, status, error: openAiHttpErrorMessage(r.status) }
    }
    const data = (await r.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = data.choices?.[0]?.message?.content ?? ''
    const meta = parseJson(text)
    if (!meta) return { ok: false, status: 'Error', error: 'Failed to parse model output' }
    return { ok: true, metadata: meta }
  } catch (e) {
    // Catches readBase64() (file I/O), fetch() (network), and r.json()
    // (parse). Using the raw message keeps ENOENT / parse errors readable
    // instead of being mis-labeled as a network failure.
    return { ok: false, status: 'Error', error: (e as Error).message }
  }
}

// ---------- Groq ----------
function groqBase(input: { baseUrl?: string }): string {
  return input.baseUrl?.replace(/\/+$/, '') || 'https://api.groq.com/openai/v1'
}

async function groqCheckKey(
  input: KeyInput
): Promise<{ ok: boolean; status: string; error?: string }> {
  return openaiCheckKey({ ...input, baseUrl: groqBase(input) })
}

async function groqFetchModels(
  input: FetchModelsInput
): Promise<{ ok: boolean; models?: unknown[]; error?: string }> {
  return openaiFetchModels({ ...input, baseUrl: groqBase(input) })
}

async function groqGenerate(
  input: GenerateInput
): Promise<{ ok: boolean; metadata?: GenericMetadata; error?: string; status?: string }> {
  return openaiGenerate({ ...input, baseUrl: groqBase(input) })
}

// ---------- KoboiLLM ----------
// KoboiLLM is an OpenAI-compatible proxy that exposes models from OpenAI,
// Google (Gemini), Anthropic and others under a single API key. Models are
// referenced as `<vendor>/<model>` (e.g. `openai/gpt-5-mini`,
// `gemini/gemini-2.5-flash`). The wire format is identical to OpenAI's, so we
// delegate to the OpenAI helpers with a custom base URL — same pattern Groq
// uses above. KoboiLLM model availability changes over time; the `Fetch
// Models` button on the API Keys page calls `koboillmFetchModels` to load the
// live list, which is then merged with the curated suggestions in
// `services/models.ts` (manually entered custom IDs are preserved).
export const KOBOILLM_DEFAULT_BASE_URL = 'https://api.koboillm.com/v1'

function koboillmBase(input: { baseUrl?: string }): string {
  return input.baseUrl?.replace(/\/+$/, '') || KOBOILLM_DEFAULT_BASE_URL
}

async function koboillmCheckKey(
  input: KeyInput
): Promise<{ ok: boolean; status: string; error?: string }> {
  return openaiCheckKey({ ...input, baseUrl: koboillmBase(input) })
}

async function koboillmFetchModels(
  input: FetchModelsInput
): Promise<{ ok: boolean; models?: unknown[]; error?: string }> {
  return openaiFetchModels({ ...input, baseUrl: koboillmBase(input) })
}

async function koboillmGenerate(
  input: GenerateInput
): Promise<{ ok: boolean; metadata?: GenericMetadata; error?: string; status?: string }> {
  return openaiGenerate({ ...input, baseUrl: koboillmBase(input) })
}

export function registerAiIpc(): void {
  ipcMain.handle('ai:check-key', async (_e, input: KeyInput) => {
    if (!input.apiKey) return { ok: false, status: 'Invalid', error: 'API key is empty' }
    switch (input.provider) {
      case 'Gemini':
        return geminiCheckKey(input)
      case 'OpenAI':
        return openaiCheckKey(input)
      case 'Groq':
        return groqCheckKey(input)
      case 'KoboiLLM':
        return koboillmCheckKey(input)
      case 'Custom':
        return openaiCheckKey(input) // assume OpenAI-compatible
      default:
        return { ok: false, status: 'Error', error: 'Unknown provider' }
    }
  })

  ipcMain.handle('ai:fetch-models', async (_e, input: FetchModelsInput) => {
    if (!input.apiKey) return { ok: false, error: 'API key is empty' }
    switch (input.provider) {
      case 'Gemini':
        return geminiFetchModels(input)
      case 'OpenAI':
        return openaiFetchModels(input)
      case 'Groq':
        return groqFetchModels(input)
      case 'KoboiLLM':
        return koboillmFetchModels(input)
      case 'Custom':
        return openaiFetchModels(input)
      default:
        return { ok: false, error: 'Unknown provider' }
    }
  })

  ipcMain.handle('ai:generate', async (_e, input: GenerateInput) => {
    if (!input.apiKey) return { ok: false, status: 'Invalid', error: 'API key is empty' }
    switch (input.provider) {
      case 'Gemini':
        return geminiGenerate(input)
      case 'OpenAI':
        return openaiGenerate(input)
      case 'Groq':
        return groqGenerate(input)
      case 'KoboiLLM':
        return koboillmGenerate(input)
      case 'Custom':
        return openaiGenerate(input)
      default:
        return { ok: false, status: 'Error', error: 'Unknown provider' }
    }
  })
}
