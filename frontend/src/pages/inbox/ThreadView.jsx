import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import { Select } from '../../components/ui/Input'

export default function ThreadView({ convoId, onChanged, onBack }) {
  const { token } = useAuth()
  const [thread, setThread] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [templates, setTemplates] = useState([])
  const [busy, setBusy] = useState(false)
  const [sendError, setSendError] = useState('')

  const load = async () => {
    if (!convoId) return
    setLoading(true)
    setError('')
    try {
      const [t, tmps] = await Promise.all([
        api.get(`/api/inbox/conversations/${convoId}`, token),
        api.get(`/api/inbox/templates?shopId=${''}`, token).catch(() => []),
      ])
      setThread(t)
      setTemplates(Array.isArray(tmps) ? tmps : [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { setDraft(''); setSendError(''); load() }, [convoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!draft.trim()) return
    setBusy(true)
    setSendError('')
    try {
      await api.post(`/api/inbox/conversations/${convoId}/messages`, { text: draft }, token)
      setDraft('')
      await load()
      onChanged()
    } catch (e) {
      setSendError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const update = async (changes) => {
    await api.patch(`/api/inbox/conversations/${convoId}`, changes, token)
    await load()
    onChanged()
  }

  const toggleStatus = () => update({ status: thread.status === 'open' ? 'closed' : 'open' })
  const toggleAi = () => update({ aiEnabled: !thread.aiEnabled })

  if (!convoId) return <div className="grid flex-1 place-items-center p-6"><EmptyState message="Select a conversation" /></div>
  if (loading) return <div className="grid flex-1 place-items-center p-6"><Spinner /></div>
  if (error) return <div className="grid flex-1 place-items-center p-6"><ErrorState message={error} onRetry={load} /></div>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="secondary" size="sm" className="sm:hidden" onClick={onBack}>Back</Button>
          <span className="truncate font-medium">{thread.customerName || thread.externalThreadId}</span>
          <Badge>{thread.status}</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {thread.replyable !== false && (
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleAi}
              title="Turn the AI off to answer this buyer yourself. The shop switch must also be on."
            >
              AI {thread.aiEnabled ? 'on' : 'off'}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={toggleStatus}>
            {thread.status === 'open' ? 'Close' : 'Reopen'}
          </Button>
        </div>
      </div>

      {thread.aiError && (
        <p className="border-b border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">{thread.aiError}</p>
      )}

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {thread.messages.map((m) => (
          <li key={m._id} className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.direction === 'inbound' ? 'bg-gray-100' : m.senderType === 'ai' ? 'ml-auto bg-purple-600 text-white' : 'ml-auto bg-indigo-600 text-white'}`}>
            <p>{m.text}</p>
            <p className={`mt-1 text-[11px] ${m.direction === 'inbound' ? 'text-gray-500' : 'text-indigo-200'}`}>
              {SENDER_LABEL[m.senderType] || m.senderType} · {m.sentAt && new Date(m.sentAt).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>

      {thread.replyable === false ? (
        <p className="border-t border-gray-100 px-4 py-3 text-sm text-gray-500">This is a marketplace notice. It cannot be answered.</p>
      ) : (
      <div className="border-t border-gray-100 px-4 py-3">
        {templates.length > 0 && (
          <div className="mb-2">
            <Select
              value=""
              onChange={(e) => {
                const t = templates.find((x) => x._id === e.target.value)
                if (t) setDraft(t.body)
              }}
              options={[{ value: '', label: 'Insert template…' }, ...templates.map((t) => ({ value: t._id, label: t.title }))]}
            />
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a reply to the buyer…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <Button disabled={busy || !draft.trim()} onClick={send}>{busy ? 'Sending…' : 'Send'}</Button>
        </div>
        {sendError && <p className="mt-2 text-sm text-red-600">{sendError}</p>}
      </div>
      )}
    </div>
  )
}

const SENDER_LABEL = { customer: 'Buyer', agent: 'You', ai: 'AI' }
