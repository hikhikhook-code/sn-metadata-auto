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
  // KoboiLLM is an OpenAI-compatible proxy at https://lite.koboillm.com that
  // gives access to 100+ underlying models from OpenAI, Anthropic (Claude),
  // Google (Gemini), Groq, Meta and more under one API key. Models are
  // referenced as `<vendor>/<model>`. The list below is a curated subset of
  // vision-capable models suitable for batch metadata; users can also pick
  // "Custom Model ID…" on the API Keys page to type any model their key
  // supports, or click "Fetch Models" to load the live list.
  KoboiLLM: [
    // OpenAI
    {
      id: 'openai/gpt-4o-mini',
      label: 'OpenAI GPT-4o mini (via KoboiLLM)',
      category: 'Recommended for Metadata',
      vision: true,
      description: 'Balanced cost / quality vision model proxied through KoboiLLM.'
    },
    {
      id: 'openai/gpt-4o',
      label: 'OpenAI GPT-4o (via KoboiLLM)',
      category: 'Best Quality',
      vision: true
    },
    {
      id: 'openai/gpt-4.1-mini',
      label: 'OpenAI GPT-4.1 mini (via KoboiLLM)',
      category: 'Fast / Cheap',
      vision: true
    },
    // Anthropic / Claude
    {
      id: 'anthropic/claude-3-5-sonnet-20241022',
      label: 'Anthropic Claude 3.5 Sonnet (via KoboiLLM)',
      category: 'Best Quality',
      vision: true,
      description: 'Strong reasoning + vision; good for tricky scenes.'
    },
    {
      id: 'anthropic/claude-3-5-haiku-20241022',
      label: 'Anthropic Claude 3.5 Haiku (via KoboiLLM)',
      category: 'Fast / Cheap',
      vision: true
    },
    {
      id: 'anthropic/claude-4-5-sonnet',
      label: 'Anthropic Claude 4.5 Sonnet (via KoboiLLM)',
      category: 'Preview / Experimental',
      vision: true
    },
    // Google / Gemini
    {
      id: 'google/gemini-2.0-flash',
      label: 'Google Gemini 2.0 Flash (via KoboiLLM)',
      category: 'Recommended for Metadata',
      vision: true
    },
    {
      id: 'google/gemini-1.5-flash',
      label: 'Google Gemini 1.5 Flash (via KoboiLLM)',
      category: 'Fast / Cheap',
      vision: true
    },
    {
      id: 'google/gemini-1.5-pro',
      label: 'Google Gemini 1.5 Pro (via KoboiLLM)',
      category: 'Best Quality',
      vision: true
    },
    // Groq (vision-capable Llama)
    {
      id: 'groq/meta-llama/llama-4-scout-17b-16e-instruct',
      label: 'Groq Llama 4 Scout 17B Vision (via KoboiLLM)',
      category: 'Fast / Cheap',
      vision: true
    },
    {
      id: 'groq/llama-3.2-90b-vision-preview',
      label: 'Groq Llama 3.2 90B Vision (via KoboiLLM)',
      category: 'Preview / Experimental',
      vision: true
    },
    // Other open-weights vendors (vision)
    {
      id: 'mistralai/pixtral-large-latest',
      label: 'Mistral Pixtral Large (via KoboiLLM)',
      category: 'Best Quality',
      vision: true
    },
    {
      id: 'meta-llama/llama-3.2-90b-vision-instruct',
      label: 'Meta Llama 3.2 90B Vision (via KoboiLLM)',
      category: 'Vision Support',
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
