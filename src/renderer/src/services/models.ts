import type { ApiProvider, ModelPreset } from '@renderer/types'

export const PRESET_MODELS: Record<ApiProvider, ModelPreset[]> = {
  Gemini: [
    {
      id: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      category: 'Recommended for Metadata',
      vision: true,
      description: 'Fast multimodal model — recommended default for batch metadata.'
    },
    {
      id: 'gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite',
      category: 'Fast / Cheap',
      vision: true,
      description: 'Cheapest Gemini option for high-volume batches.'
    },
    {
      id: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      category: 'Best Quality',
      vision: true,
      description: 'Higher quality reasoning, slower / more expensive.'
    },
    {
      id: 'gemini-3.0-pro-preview',
      label: 'Gemini 3.0 Pro (Preview)',
      category: 'Preview / Experimental',
      vision: true
    },
    {
      id: 'text-embedding-004',
      label: 'Text Embedding 004',
      category: 'Embedding Only',
      vision: false
    }
  ],
  OpenAI: [
    {
      id: 'gpt-4o-mini',
      label: 'GPT-4o mini',
      category: 'Recommended for Metadata',
      vision: true,
      description: 'Balanced cost / quality vision-capable model.'
    },
    {
      id: 'gpt-4o',
      label: 'GPT-4o',
      category: 'Best Quality',
      vision: true
    },
    {
      id: 'gpt-4.1-mini',
      label: 'GPT-4.1 mini',
      category: 'Fast / Cheap',
      vision: true
    },
    {
      id: 'gpt-5-mini',
      label: 'GPT-5 mini',
      category: 'Preview / Experimental',
      vision: true
    },
    {
      id: 'text-embedding-3-small',
      label: 'Text Embedding 3 Small',
      category: 'Embedding Only',
      vision: false
    }
  ],
  Groq: [
    {
      id: 'meta-llama/llama-4-scout-17b-16e-instruct',
      label: 'Llama 4 Scout 17B (Vision)',
      category: 'Recommended for Metadata',
      vision: true,
      description: 'Vision-capable Llama on Groq, very fast.'
    },
    {
      id: 'llama-3.2-90b-vision-preview',
      label: 'Llama 3.2 90B Vision (Preview)',
      category: 'Preview / Experimental',
      vision: true
    },
    {
      id: 'llama-3.2-11b-vision-preview',
      label: 'Llama 3.2 11B Vision (Preview)',
      category: 'Fast / Cheap',
      vision: true
    },
    {
      id: 'llama-3.3-70b-versatile',
      label: 'Llama 3.3 70B Versatile',
      category: 'Text Only',
      vision: false
    }
  ],
  Custom: [
    {
      id: 'custom',
      label: 'Custom Model ID',
      category: 'Recommended for Metadata',
      vision: true,
      description: 'OpenAI-compatible custom endpoint.'
    }
  ]
}

export function findPreset(provider: ApiProvider, modelId: string): ModelPreset | undefined {
  return PRESET_MODELS[provider]?.find((m) => m.id === modelId)
}
