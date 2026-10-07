import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import { Select } from '../../components/ui/Input'

export default function ThreadView({ convoId, onChanged }) {
  const { token } = useAuth()
  const [thread, setThread] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState('')
  const [templates, setTemplates] = useState([])
  const [busy, setBusy] = useState(false)

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

  useEffect(() => { setDraft(''); load() }, [convoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!draft.trim()) return
    setBusy(true)
    try {
      await api.post(`/api/inbox/conversations/${convoId}/messages`, { text: draft }, token)
      setDraft('')
      await load()
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  const toggleStatus = async () => {
    await api.patch(`/api/inbox/conversations/${convoId}`, { status: thread.status === 'open' ? 'closed' : 'open' }, token)
    await load()
    onChanged()
  }

  if (!convoId) return <Card><EmptyState message="Select a conversation" /></Card>
  if (loading) return <Card><Spinner /></Card>
  if (error) return <Card><ErrorState message={error} onRetry={load} /></Card>

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-2">
          <Badge>{thread.status}</Badge>
          <Badge color="blue">{thread.marketplace}</Badge>
        </div>
        <Button variant="secondary" size="sm" onClick={toggleStatus}>
          {thread.status === 'open' ? 'Close' : 'Reopen'}
        </Button>
      </div>

      <ul className="max-h-80 space-y-2 overflow-y-auto">
        {thread.messages.map((m) => (
          <li key={m._id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.direction === 'inbound' ? 'bg-gray-100' : 'ml-auto bg-indigo-600 text-white'}`}>
            <p>{m.text}</p>
            <p className={`mt-1 text-[11px] ${m.direction === 'inbound' ? 'text-gray-500' : 'text-indigo-200'}`}>
              {m.senderType} · {m.sentAt && new Date(m.sentAt).toLocaleString()}
            </p>
          </li>
        ))}
      </ul>

      {templates.length > 0 && (
        <div className="mt-3">
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

      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a reply… (stored locally — marketplace send needs §2.1)"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
        <Button disabled={busy || !draft.trim()} onClick={send}>Send</Button>
      </div>
    </Card>
  )
}
