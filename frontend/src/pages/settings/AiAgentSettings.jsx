import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { Input, Select } from '../../components/ui/Input'
import { useApi } from '../../hooks/useApi'
import { api } from '../../lib/api'

const CUSTOM = '__custom__'
const PRESET_MODELS = ['gpt-5-mini', 'gpt-5', 'gpt-5-nano', 'gpt-4.1-mini', 'gpt-4o-mini']

function keyStatus(settings) {
  if (settings.keySource === 'settings') return `Saved key ending in ${settings.keyLast4 || '••••'}`
  if (settings.keySource === 'server') return 'Using the key from the server environment'
  return 'No API key set'
}

export default function AiAgentSettings() {
  const { token } = useAuth()
  const settingsRes = useApi('/api/settings/ai')
  const settings = settingsRes.data
  const [choice, setChoice] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [replacingKey, setReplacingKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState(false)

  useEffect(() => {
    if (!settings) return
    const preset = PRESET_MODELS.includes(settings.model)
    setChoice(preset ? settings.model : CUSTOM)
    setCustomModel(preset ? '' : settings.model)
  }, [settings])

  if (settingsRes.loading) return <Card><Spinner /></Card>
  if (settingsRes.error) return <ErrorState message={settingsRes.error} onRetry={settingsRes.refetch} />
  if (!settings) return null

  const hasSavedKey = settings.keySource === 'settings' && !settings.keyUnreadable
  const showSavedKey = hasSavedKey && !replacingKey
  const model = choice === CUSTOM ? customModel.trim() : choice
  const defaultModel = settings.defaultModel || 'gpt-5-mini'
  const options = [
    ...PRESET_MODELS.map((name) => ({ value: name, label: name === defaultModel ? `${name} (default)` : name })),
    { value: CUSTOM, label: 'Custom model name…' },
  ]

  const save = async (body, done) => {
    setSaving(true)
    setMessage('')
    try {
      await api.patch('/api/settings/ai', body, token)
      setApiKey('')
      setReplacingKey(false)
      setMessage(done)
      setMessageError(false)
      settingsRes.refetch()
    } catch (err) {
      setMessage(err.message)
      setMessageError(true)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!model) {
      setMessage('Enter a model name.')
      setMessageError(true)
      return
    }
    save({ model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }, 'AI agent settings saved.')
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">AI agent</h2>
            <p className="mt-1 text-sm text-gray-500">OpenAI key and model used by Product Discovery research.</p>
          </div>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
              settings.hasKey
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
                : 'bg-amber-50 text-amber-700 ring-amber-600/20'
            }`}
          >
            {settings.hasKey ? 'Ready' : 'API key needed'}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            {showSavedKey ? (
              <Input
                label="OpenAI API key"
                readOnly
                value={`sk-••••••••••••••••${settings.keyLast4 || ''}`}
                className="font-mono text-gray-500"
              />
            ) : (
              <Input
                label="OpenAI API key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={hasSavedKey ? 'Paste the new key' : 'sk-...'}
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500">{keyStatus(settings)}</p>
              {hasSavedKey && (
                <button
                  type="button"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  onClick={() => {
                    setReplacingKey(!replacingKey)
                    setApiKey('')
                  }}
                >
                  {replacingKey ? 'Keep saved key' : 'Replace key'}
                </button>
              )}
            </div>
            {settings.keyUnreadable && (
              <p className="text-xs text-amber-700">The saved key can no longer be read on this server. Enter it again.</p>
            )}
          </div>

          <div className="space-y-2">
            <Select label="Model" options={options} value={choice} onChange={(event) => setChoice(event.target.value)} />
            {choice === CUSTOM && (
              <Input
                aria-label="Custom model name"
                value={customModel}
                onChange={(event) => setCustomModel(event.target.value)}
                placeholder="e.g. gpt-5.1-mini"
              />
            )}
            <p className="text-xs text-gray-500">The model must support web search in the OpenAI Responses API.</p>
          </div>
        </div>

        {message && (
          <p className={`text-sm font-semibold ${messageError ? 'text-red-600' : 'text-emerald-700'}`}>{message}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          {settings.keySource === 'settings' && (
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => save({ clearApiKey: true }, 'Saved API key removed.')}
            >
              Remove saved key
            </Button>
          )}
        </div>
      </form>
    </Card>
  )
}
