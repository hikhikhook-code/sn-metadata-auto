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

function buildPrompt(keywordCount: number): string {
  return `You are a professional microstock metadata specialist. Analyze the uploaded visual file carefully and generate accurate, buyer-focused metadata for stock content.

Return ONLY valid JSON with this exact structure (no markdown, no code fence):
{"title":"","description":"","keywords":[],"category":""}

Title rules (very important):
- Be concise and ideally under 70 characters; never exceed 200 characters.
- Describe the unique visual content in one short, natural phrase.
- Must NOT be a comma-separated keyword list.
- Include the most important searchable terms naturally in the phrase.
- Avoid brand names, logos, copyrighted characters, artist names, trademarks, and misleading terms.
- Must be suitable for use as a file name (no slashes, no quotes, no leading/trailing punctuation).

Description rules:
- One natural sentence describing the visual content accurately.

Keyword rules:
- Generate exactly ${keywordCount} keywords.
- Put the most important and visually relevant keywords in the first 10 positions.
- Keywords must be lowercase, no duplicates.
- Avoid brand names, logos, copyrighted characters, artist names, trademarks.
- Do not include anything that is not visible.
- For vector files include terms like vector, illustration, icon, graphic only if relevant.
- For video include motion-related keywords only if visible.
- Do not use vague filler keywords.`
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
      keywords: Array.isArray(obj.keywords) ? obj.keywords.map((k) => String(k)) : [],
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
            { text: buildPrompt(input.keywordCount) },
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

async function openaiCheckKey(
  input: KeyInput
): Promise<{ ok: boolean; status: string; error?: string }> {
  try {
    const r = await fetch(`${openAiBase(input)}/models`, {
      headers: { authorization: `Bearer ${input.apiKey}` }
    })
    if (r.ok) return { ok: true, status: 'Valid' }
    if (r.status === 429) return { ok: false, status: 'Limit', error: 'Rate limited' }
    return { ok: false, status: 'Invalid', error: `HTTP ${r.status}` }
  } catch (e) {
    return { ok: false, status: 'Error', error: (e as Error).message }
  }
}

async function openaiFetchModels(
  input: FetchModelsInput
): Promise<{ ok: boolean; models?: unknown[]; error?: string }> {
  try {
    const r = await fetch(`${openAiBase(input)}/models`, {
      headers: { authorization: `Bearer ${input.apiKey}` }
    })
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` }
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
            role: 'user',
            content: [
              { type: 'text', text: buildPrompt(input.keywordCount) },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4
      })
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
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = data.choices?.[0]?.message?.content ?? ''
    const meta = parseJson(text)
    if (!meta) return { ok: false, status: 'Error', error: 'Failed to parse model output' }
    return { ok: true, metadata: meta }
  } catch (e) {
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
      case 'Custom':
        return openaiGenerate(input)
      default:
        return { ok: false, status: 'Error', error: 'Unknown provider' }
    }
  })
}
