import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { Input } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { useApi } from '../../hooks/useApi'

const EMPTY_FORM = {
  name: '',
  username: '',
  password: '',
}

export default function SubAdminFormPage() {
  const { token } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)
  const usersRes = useApi(editing && token ? '/api/auth/users' : null)
  const existing = editing ? usersRes.data?.find((user) => user._id === id) : null
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name || '',
        username: existing.username || existing.email || '',
        password: '',
      })
    }
  }, [existing])

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  const save = async (event) => {
    event.preventDefault()
    setError('')
    if (!form.name.trim() || !form.username.trim()) return setError('Name and username are required.')
    if (!editing && !form.password) return setError('Password is required.')
    setBusy(true)
    try {
      const body = {
        name: form.name.trim(),
        username: form.username.trim(),
      }
      if (form.password) body.password = form.password
      if (editing) await api.patch(`/api/auth/users/${id}`, body, token)
      else await api.post('/api/auth/users', { ...body, role: 'sub_admin' }, token)
      navigate('/sub-admins', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (editing && usersRes.loading) return <Spinner />
  if (editing && (usersRes.error || !existing)) return <ErrorState message={usersRes.error || 'Sub-admin not found'} />

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/sub-admins" className="text-sm font-semibold text-indigo-600 hover:underline">← Sub-admins</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold">{editing ? 'Edit sub-admin' : 'Create sub-admin'}</h1>
      </div>
      <form onSubmit={save}>
        <Card>
          <div className="space-y-4">
            <Input label="Name" value={form.name} onChange={(e) => update('name', e.target.value)} required />
            <Input label="Username" value={form.username} onChange={(e) => update('username', e.target.value)} autoComplete="off" required />
            <Input label={editing ? 'Password (optional)' : 'Password'} type="password" value={form.password} onChange={(e) => update('password', e.target.value)} autoComplete="new-password" required={!editing} />
          </div>
        </Card>
        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Link to="/sub-admins"><Button type="button" variant="secondary">Cancel</Button></Link>
          <Button type="submit" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save' : 'Create sub-admin'}</Button>
        </div>
      </form>
    </div>
  )
}
