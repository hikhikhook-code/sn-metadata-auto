import type { ApiProvider, ModelPreset } from '@renderer/types'

/**
 * Default OpenAI-compatible base URL for the KoboiLLM proxy. Used to prefill
 * the Base URL field on the API Keys page when a user switches a key to the
 * KoboiLLM provider, and as the fallback used by the IPC layer when the user
 * leaves the field blank. The user can override this for self-hosted gateways.
 */
export const KOBOILLM_DEFAULT_BASE_URL = 'https://api.koboillm.com/v1'

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
// KoboiLLM is an OpenAI-compatible proxy at https://api.koboillm.com that
  // gives access to many underlying models from OpenAI, Google (Gemini),
  // Anthropic and others under one API key. Models are referenced as
  // `<vendor>/<model>`. The curated list below mirrors the model IDs
  // KoboiLLM currently advertises in its docs / dashboard; KoboiLLM model
  // availability changes over time, so users can also pick "Custom Model
  // ID…" on the API Keys page to type any model their key supports, or
  // click "Fetch Models" to load the live list (which is merged with this
  // suggested list — never overwrites a manually entered custom ID).
  KoboiLLM: [
    // OpenAI family (defaults)
    {
      id: 'openai/gpt-5-mini',
      label: 'OpenAI GPT-5 mini (via KoboiLLM)',
      category: 'Recommended for Metadata',
      vision: true,
      description: 'KoboiLLM default — balanced cost / quality vision model.'
    },
    {
      id: 'openai/gpt-5-nano',
      label: 'OpenAI GPT-5 nano (via KoboiLLM)',
      category: 'Fast / Cheap',
      vision: true
    },
    {
      id: 'openai/gpt-4.1',
      label: 'OpenAI GPT-4.1 (via KoboiLLM)',
      category: 'Best Quality',
      vision: true
    },
    {
      id: 'openai/gpt-4.1-mini',
      label: 'OpenAI GPT-4.1 mini (via KoboiLLM)',
      category: 'Fast / Cheap',
      vision: true
    },
    {
      id: 'openai/gpt-4.1-nano',
      label: 'OpenAI GPT-4.1 nano (via KoboiLLM)',
      category: 'Fast / Cheap',
      vision: true
    },
    // Gemini family
    {
      id: 'gemini/gemini-2.5-pro',
      label: 'Gemini 2.5 Pro (via KoboiLLM)',
      category: 'Best Quality',
      vision: true
    },
    {
      id: 'gemini/gemini-2.5-flash',
      label: 'Gemini 2.5 Flash (via KoboiLLM)',
      category: 'Recommended for Metadata',
      vision: true
    },
    {
      id: 'gemini/gemini-2.5-flash-lite',
      label: 'Gemini 2.5 Flash-Lite (via KoboiLLM)',
      category: 'Fast / Cheap',
      vision: true
    },
    {
      id: 'gemini/gemini-2.0-flash',
      label: 'Gemini 2.0 Flash (via KoboiLLM)',
      category: 'Fast / Cheap',
      vision: true
    },
    {
      id: 'gemini/gemini-2.0-flash-lite',
      label: 'Gemini 2.0 Flash-Lite (via KoboiLLM)',
      category: 'Fast / Cheap',
      vision: true
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
