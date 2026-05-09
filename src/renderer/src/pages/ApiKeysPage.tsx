import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import { useAppStore, MAX_API_KEYS } from '@renderer/store/store'
import { PRESET_MODELS, KOBOILLM_DEFAULT_BASE_URL } from '@renderer/services/models'
import { InfoIcon, Tooltip } from '@renderer/components/ui/Tooltip'
import {
  Plus,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  ListFilter,
  Power,
  ChevronUp,
  ChevronDown,
  KeyRound,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react'
import type { ApiKeyEntry, ApiProvider, ModelPreset } from '@renderer/types'
import { formatDateTime, maskApiKey } from '@renderer/utils/format'

const PROVIDERS: ApiProvider[] = ['Gemini', 'OpenAI', 'Groq', 'KoboiLLM', 'Custom']

const STATUS_COLORS: Record<ApiKeyEntry['status'], { bg: string; fg: string }> = {
  Untested: { bg: 'rgba(232,217,245,0.85)', fg: '#5a4884' },
  Valid: { bg: 'rgba(216,239,216,0.9)', fg: '#2d6a3a' },
  Invalid: { bg: 'rgba(246,213,211,0.9)', fg: '#8a3838' },
  Limit: { bg: 'rgba(251,233,200,0.9)', fg: '#8a5a1a' },
  Error: { bg: 'rgba(246,213,211,0.9)', fg: '#8a3838' },
  Disabled: { bg: 'rgba(236,227,227,0.9)', fg: '#6a5a5a' }
}

export function ApiKeysPage() {
  const apiKeys = useAppStore((s) => s.apiKeys)
  const addApiKey = useAppStore((s) => s.addApiKey)
  const updateApiKey = useAppStore((s) => s.updateApiKey)
  const removeApiKey = useAppStore((s) => s.removeApiKey)
  const setApiKeyEnabled = useAppStore((s) => s.setApiKeyEnabled)
  const reorderApiKeys = useAppStore((s) => s.reorderApiKeys)
  const showToast = useAppStore((s) => s.showToast)
  const addLog = useAppStore((s) => s.addLog)

  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [encryptionStatus, setEncryptionStatus] = useState<{
    available: boolean
    backend: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.crypto
      .encryptionStatus()
      .then((s) => {
        if (!cancelled) setEncryptionStatus(s)
      })
      .catch(() => {
        if (!cancelled) setEncryptionStatus({ available: false, backend: 'unsupported' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleReveal(id: string) {
    const next = new Set(revealed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setRevealed(next)
  }

  async function checkKey(id: string) {
    const k = useAppStore.getState().apiKeys.find((x) => x.id === id)
    if (!k) return
    if (!k.apiKey) {
      showToast('warning', `${k.name}: API key is empty`)
      return
    }
    setBusy((b) => new Set(b).add(id))
    try {
      const res = await window.api.ai.checkKey({
        provider: k.provider,
        apiKey: k.apiKey,
        baseUrl: k.baseUrl,
        model: k.model
      })
      updateApiKey(id, {
        status: res.status as ApiKeyEntry['status'],
        lastChecked: new Date().toISOString(),
        lastError: res.error
      })
      addLog(
        res.ok ? 'success' : 'warning',
        'API',
        `Check ${k.provider} Key ${k.priority}: ${res.status}${res.error ? ` (${res.error})` : ''}`,
        { apiKeySlot: `${k.provider} Key ${k.priority}` }
      )
      const toastMsg = res.ok ? `${k.name}: ${res.status}` : `${k.name}: ${res.error ?? res.status}`
      showToast(res.ok ? 'success' : 'warning', toastMsg)
    } finally {
      setBusy((b) => {
        const n = new Set(b)
        n.delete(id)
        return n
      })
    }
  }

  async function checkAll() {
    for (const k of apiKeys) {
      if (!k.enabled || !k.apiKey) continue
      await checkKey(k.id)
    }
  }

  async function fetchModels(id: string) {
    const k = useAppStore.getState().apiKeys.find((x) => x.id === id)
    if (!k) return
    setBusy((b) => new Set(b).add(id))
    try {
      const res = await window.api.ai.fetchModels({
        provider: k.provider,
        apiKey: k.apiKey,
        baseUrl: k.baseUrl
      })
      if (res.ok && res.models) {
        const models = res.models as ModelPreset[]
        updateApiKey(id, { fetchedModels: models })
        addLog('success', 'API', `Fetched ${models.length} models for ${k.name}`)
        showToast('success', `Fetched ${models.length} models`)
      } else {
        addLog('warning', 'API', `Fetch models failed: ${res.error ?? 'unknown'}`)
        showToast('warning', `Fetch failed: ${res.error ?? 'unknown'}`)
      }
    } finally {
      setBusy((b) => {
        const n = new Set(b)
        n.delete(id)
        return n
      })
    }
  }

  function move(id: string, dir: -1 | 1) {
    const ids = apiKeys.map((k) => k.id)
    const idx = ids.indexOf(id)
    const j = idx + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    reorderApiKeys(ids)
  }

  function modelOptions(k: ApiKeyEntry): ModelPreset[] {
    const presets = PRESET_MODELS[k.provider] ?? []
    if (k.fetchedModels && k.fetchedModels.length > 0) {
      const seen = new Set(presets.map((p) => p.id))
      return [...presets, ...k.fetchedModels.filter((m) => !seen.has(m.id))]
    }
    return presets
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="section-title">API Keys</h2>
          <p className="section-sub">
            Up to {MAX_API_KEYS} keys across Gemini, OpenAI, Groq, KoboiLLM (multi-vendor proxy),
            and Custom (OpenAI-compatible). Lower priority numbers are tried first; the next key
            takes over on rate limit / error.
          </p>
          <EncryptionStatusPill status={encryptionStatus} />
        </div>
        <div className="row">
          <Tooltip content="Validate every enabled key">
            <button className="btn" onClick={checkAll} disabled={apiKeys.length === 0}>
              <ListFilter size={14} /> Check All
            </button>
          </Tooltip>
          <Tooltip
            content={apiKeys.length >= MAX_API_KEYS ? 'Maximum 10 keys' : 'Add a new key slot'}
          >
            <button
              className="btn btn-primary"
              onClick={() => {
                const id = addApiKey()
                if (!id) showToast('warning', `Maximum of ${MAX_API_KEYS} keys reached`)
              }}
              disabled={apiKeys.length >= MAX_API_KEYS}
            >
              <Plus size={14} /> Add API Key
            </button>
          </Tooltip>
        </div>
      </div>

      {apiKeys.length === 0 ? (
        <div className="empty-state glass-soft" style={{ padding: 40 }}>
          <KeyRound size={28} />
          <p className="section-sub">
            No API keys yet. The app will use a built-in mock provider until you add one. Add a key
            to call Gemini / OpenAI / Groq / KoboiLLM for real metadata.
          </p>
        </div>
      ) : !apiKeys.some((k) => k.enabled && k.apiKey) ? (
        <div className="warn-banner">
          You have keys configured but none are enabled with a value — the built-in{' '}
          <strong>Mock provider</strong> will be used until at least one key is enabled.
        </div>
      ) : null}
      {apiKeys.length > 0 && (
        <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {apiKeys.map((k) => {
            const c = STATUS_COLORS[k.status]
            const isBusy = busy.has(k.id)
            const isRevealed = revealed.has(k.id)
            const presets = modelOptions(k)
            const selectedModel = presets.find((p) => p.id === k.model)
            const visionWarn = selectedModel && !selectedModel.vision && k.provider !== 'Custom'

            return (
              <div className="glass-strong" key={k.id} style={{ padding: 14 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px minmax(140px, 1fr) 130px 1.2fr 1.4fr 0.8fr auto',
                    gap: 10,
                    alignItems: 'center'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2
                    }}
                  >
                    <button
                      className="btn-icon"
                      onClick={() => move(k.id, -1)}
                      disabled={k.priority === 1}
                      style={{ color: 'var(--c-text-muted)' }}
                      title="Move up (higher priority)"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-text-soft)' }}>
                      #{k.priority}
                    </span>
                    <button
                      className="btn-icon"
                      onClick={() => move(k.id, 1)}
                      disabled={k.priority === apiKeys.length}
                      style={{ color: 'var(--c-text-muted)' }}
                      title="Move down (lower priority)"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>

                  <div className="field" style={{ gap: 4 }}>
                    <span className="label" style={{ marginBottom: 0 }}>
                      Key Name <InfoIcon content="Display name shown in logs and the top bar." />
                    </span>
                    <input
                      className="input"
                      value={k.name}
                      onChange={(e) => updateApiKey(k.id, { name: e.target.value })}
                    />
                  </div>

                  <div className="field" style={{ gap: 4 }}>
                    <span className="label" style={{ marginBottom: 0 }}>
                      Provider
                    </span>
                    <select
                      className="select"
                      value={k.provider}
                      onChange={(e) => {
                        const provider = e.target.value as ApiProvider
                        const first = PRESET_MODELS[provider]?.[0]?.id ?? ''
                        const patch: Partial<ApiKeyEntry> = {
                          provider,
                          model: first,
                          status: 'Untested'
                        }
                        if (provider === 'KoboiLLM' && !k.baseUrl) {
                          patch.baseUrl = KOBOILLM_DEFAULT_BASE_URL
                        }
                        updateApiKey(k.id, patch)
                      }}
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    {k.provider === 'KoboiLLM' && (
                      <span className="text-muted" style={{ fontSize: 11, lineHeight: 1.35 }}>
                        OpenAI-compatible proxy for multiple LLM models.
                      </span>
                    )}
                  </div>

                  <div className="field" style={{ gap: 4 }}>
                    <span className="label" style={{ marginBottom: 0 }}>
                      Model{' '}
                      <InfoIcon content="Pick a recommended preset or paste a custom Model ID. Use Fetch Models to load the live list from the provider." />
                    </span>
                    <select
                      className="select"
                      value={presets.some((p) => p.id === k.model) ? k.model : '__custom__'}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') return
                        updateApiKey(k.id, { model: e.target.value })
                      }}
                    >
                      {presets.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label} · {m.category}
                        </option>
                      ))}
                      <option value="__custom__">Custom Model ID…</option>
                    </select>
                    <input
                      className="input"
                      style={{ marginTop: 4 }}
                      placeholder="Custom Model ID (overrides selection if set)"
                      value={presets.some((p) => p.id === k.model) ? '' : k.model}
                      onChange={(e) => updateApiKey(k.id, { model: e.target.value })}
                    />
                    {k.provider === 'KoboiLLM' && (
                      <span
                        className="text-muted"
                        style={{ fontSize: 11, lineHeight: 1.35, marginTop: 4 }}
                      >
                        Choose a KoboiLLM model, or type another model ID if it is available in your
                        KoboiLLM account.
                      </span>
                    )}
                    {visionWarn && (
                      <span style={{ fontSize: 11, color: 'var(--c-warning)', marginTop: 4 }}>
                        ⚠ This model may not support image / visual analysis. Metadata quality may
                        be limited.
                      </span>
                    )}
                  </div>

                  <div className="field" style={{ gap: 4 }}>
                    <span className="label" style={{ marginBottom: 0 }}>
                      API Key{' '}
                      <InfoIcon content="Stored locally inside your project file. Never shown in logs." />
                    </span>
                    <div className="row" style={{ gap: 4 }}>
                      <input
                        className="input"
                        type={isRevealed ? 'text' : 'password'}
                        autoComplete="off"
                        value={k.apiKey}
                        onChange={(e) =>
                          updateApiKey(k.id, { apiKey: e.target.value, status: 'Untested' })
                        }
                        placeholder={k.apiKey ? maskApiKey(k.apiKey) : 'Paste API key'}
                      />
                      <button
                        className="btn btn-ghost btn-icon"
                        onClick={() => toggleReveal(k.id)}
                        aria-label={isRevealed ? 'Hide' : 'Reveal'}
                      >
                        {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {k.provider === 'Custom' && (
                      <input
                        className="input"
                        style={{ marginTop: 4 }}
                        placeholder="Base URL (OpenAI-compatible)"
                        value={k.baseUrl ?? ''}
                        onChange={(e) => updateApiKey(k.id, { baseUrl: e.target.value })}
                      />
                    )}
                    {k.provider === 'KoboiLLM' && (
                      <input
                        className="input"
                        style={{ marginTop: 4 }}
                        placeholder={`Base URL (defaults to ${KOBOILLM_DEFAULT_BASE_URL})`}
                        value={k.baseUrl ?? ''}
                        onChange={(e) => updateApiKey(k.id, { baseUrl: e.target.value })}
                      />
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 4
                    }}
                  >
                    <span
                      className="badge"
                      style={{ background: c.bg, color: c.fg, borderColor: 'transparent' }}
                    >
                      {k.status}
                    </span>
                    {k.lastChecked && (
                      <span className="text-muted" style={{ fontSize: 10 }}>
                        {formatDateTime(k.lastChecked)}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <Tooltip content="Validate this key">
                      <button
                        className="btn btn-sm"
                        disabled={isBusy || !k.apiKey}
                        onClick={() => void checkKey(k.id)}
                      >
                        {isBusy ? (
                          <RefreshCcw size={13} className="spin" />
                        ) : (
                          <CheckCircle2 size={13} />
                        )}{' '}
                        Check
                      </button>
                    </Tooltip>
                    <Tooltip content="Fetch the live model list from this provider.">
                      <button
                        className="btn btn-sm"
                        disabled={isBusy || !k.apiKey}
                        onClick={() => void fetchModels(k.id)}
                      >
                        <RefreshCcw size={13} /> Fetch Models
                      </button>
                    </Tooltip>
                    <Tooltip content={k.enabled ? 'Disable this key' : 'Enable this key'}>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setApiKeyEnabled(k.id, !k.enabled)}
                        style={{ color: k.enabled ? 'var(--c-success)' : 'var(--c-text-muted)' }}
                      >
                        <Power size={13} />
                      </button>
                    </Tooltip>
                    <Tooltip content="Remove this key">
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          if (confirm(`Remove ${k.name}?`)) removeApiKey(k.id)
                        }}
                        style={{ color: 'var(--c-danger)' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </Tooltip>
                  </div>
                </div>

                {k.provider === 'KoboiLLM' && (
                  <div
                    className="info-banner"
                    style={{ marginTop: 10, fontSize: 11, padding: '6px 12px' }}
                  >
                    KoboiLLM is an OpenAI-compatible proxy. Use your KoboiLLM key and choose any
                    model available in your account.
                  </div>
                )}
                {k.lastError && (
                  <div className="text-muted" style={{ fontSize: 11, marginTop: 8 }}>
                    <XCircle size={11} style={{ verticalAlign: '-2px' }} /> {k.lastError}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="info-banner">
        <strong>Security:</strong> API keys are stored only inside your project file. They are never
        sent to logs and are masked in the UI by default.
      </div>
    </div>
  )
}

function backendLabel(backend: string): string {
  switch (backend) {
    case 'dpapi':
      return 'Windows DPAPI'
    case 'keychain':
      return 'macOS Keychain'
    case 'gnome_libsecret':
      return 'libsecret (GNOME)'
    case 'kwallet':
    case 'kwallet5':
    case 'kwallet6':
      return 'KWallet (KDE)'
    case 'libsecret':
      return 'libsecret'
    case 'basic_text':
      return 'basic text (no system keychain)'
    case 'unsupported':
      return 'no keychain available'
    case 'unknown':
      return 'unknown backend'
    default:
      return backend
  }
}

function EncryptionStatusPill({
  status
}: {
  status: { available: boolean; backend: string } | null
}): ReactElement | null {
  if (status === null) return null
  const label = backendLabel(status.backend)
  // `basic_text` is reported when isEncryptionAvailable() returns true but the
  // OS has no real keychain (e.g. Linux with --password-store=basic). Treat it
  // as not-actually-encrypted so the user knows their keys are essentially
  // plaintext on disk.
  const trulyEncrypted = status.available && status.backend !== 'basic_text'
  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 500,
    marginTop: 8,
    border: '1px solid'
  }
  if (trulyEncrypted) {
    return (
      <Tooltip
        content={`API keys are encrypted at rest using ${label}. Saved project files store encrypted blobs (enc:v1:…) instead of plaintext keys.`}
      >
        <span
          style={{
            ...baseStyle,
            background: 'rgba(216,239,216,0.7)',
            color: '#2d6a3a',
            borderColor: 'rgba(45,106,58,0.25)'
          }}
        >
          <ShieldCheck size={13} />
          Encrypted at rest · {label}
        </span>
      </Tooltip>
    )
  }
  return (
    <Tooltip
      content={`safeStorage reports ${label}. API keys will be saved to disk as plaintext until a system keychain is configured (DPAPI on Windows, Keychain on macOS, libsecret on Linux).`}
    >
      <span
        style={{
          ...baseStyle,
          background: 'rgba(251,233,200,0.85)',
          color: '#8a5a1a',
          borderColor: 'rgba(138,90,26,0.25)'
        }}
      >
        <ShieldAlert size={13} />
        Saved as plaintext · {label}
      </span>
    </Tooltip>
  )
}
