import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { Input } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import { api } from '../../lib/api'
import { useApi } from '../../hooks/useApi'

const ROUTES = [
  ['dashboard', 'Dashboard'],
  ['analytics', 'Analytics'],
  ['market-research', 'AI Market Research'],
  ['products', 'Products'],
  ['inventory', 'Inventory'],
  ['orders', 'Orders'],
  ['customers', 'Customers'],
  ['inbox', 'Inbox'],
]

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  profileImageUrl: '',
  shopIds: [],
  mainRoutes: [],
}

export default function SubAdminFormPage() {
  const { token } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)
  const usersRes = useApi(editing && token ? '/api/auth/users' : null)
  const shopsRes = useApi(token ? '/api/shops' : null)
  const shops = shopsRes.data || []
  const existing = editing ? usersRes.data?.find((user) => user._id === id) : null
  const [form, setForm] = useState(EMPTY_FORM)
  const [step, setStep] = useState('form')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name || '',
        email: existing.email || '',
        password: '',
        confirmPassword: '',
        profileImageUrl: existing.profileImageUrl || '',
        shopIds: (existing.shopIds || []).map(String),
        mainRoutes: existing.mainRoutes || [],
      })
    }
  }, [existing])

  const shopGroups = shops.reduce((groups, shop) => {
    const key = shop.marketplace
    if (!groups[key]) groups[key] = []
    groups[key].push(shop)
    return groups
  }, {})

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const toggle = (key, value) => update(key, form[key].includes(value)
    ? form[key].filter((item) => item !== value)
    : [...form[key], value])

  const review = (event) => {
    event.preventDefault()
    setError('')
    if (!form.name.trim() || !form.email.trim()) return setError('Name and email are required.')
    if (!editing && !form.password) return setError('Password is required.')
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.')
    if (!form.shopIds.length) return setError('Select at least one marketplace shop.')
    if (!form.mainRoutes.length) return setError('Select at least one main route.')
    setStep('preview')
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const body = {
        name: form.name.trim(),
        email: form.email.trim(),
        profileImageUrl: form.profileImageUrl.trim(),
        shopIds: form.shopIds,
        mainRoutes: form.mainRoutes,
      }
      if (form.password) body.password = form.password
      if (editing) await api.patch(`/api/auth/users/${id}`, body, token)
      else await api.post('/api/auth/users', { ...body, role: 'sub_admin' }, token)
      navigate('/sub-admins', { replace: true })
    } catch (err) {
      setError(err.message)
      setStep('form')
    } finally {
      setBusy(false)
    }
  }

  if (editing && (usersRes.loading || shopsRes.loading)) return <Spinner />
  if (editing && (usersRes.error || !existing)) return <ErrorState message={usersRes.error || 'Sub-admin not found'} />

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/sub-admins" className="text-sm font-semibold text-indigo-600 hover:underline">← Sub-admins</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-2xl font-bold">{editing ? 'Edit sub-admin' : 'Create sub-admin'}</h1>
      </div>
      <form onSubmit={review} className="space-y-5">
        <Card>
          <h2 className="text-lg font-semibold">Account details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Full name" value={form.name} onChange={(e) => update('name', e.target.value)} required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
            <Input label={editing ? 'New password (optional)' : 'Password'} type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required={!editing} />
            <Input label={editing ? 'Confirm new password' : 'Confirm password'} type="password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} required={!editing} />
            <div className="sm:col-span-2">
              <Input label="Profile image URL (optional)" type="url" placeholder="https://..." value={form.profileImageUrl} onChange={(e) => update('profileImageUrl', e.target.value)} />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Marketplace access</h2>
          <p className="mt-1 text-sm text-gray-500">Only assigned shops and their product, order, and inbox data will be available.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries(shopGroups).map(([marketplace, marketplaceShops]) => marketplaceShops.map((shop) => (
              <label key={shop._id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${form.shopIds.includes(shop._id) ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200'}`}>
                <input type="checkbox" checked={form.shopIds.includes(shop._id)} onChange={() => toggle('shopIds', shop._id)} />
                <span><span className="block text-sm font-semibold">{shop.name}</span><span className="text-xs text-gray-500">{marketplace}</span></span>
              </label>
            )))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Main route access</h2>
          <p className="mt-1 text-sm text-gray-500">These sections will appear in the sub-admin&apos;s navigation after login.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ROUTES.map(([value, label]) => (
              <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${form.mainRoutes.includes(value) ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200'}`}>
                <input type="checkbox" checked={form.mainRoutes.includes(value)} onChange={() => toggle('mainRoutes', value)} />
                <span className="text-sm font-semibold">{label}</span>
              </label>
            ))}
          </div>
        </Card>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Link to="/sub-admins"><Button type="button" variant="secondary">Cancel</Button></Link>
          <Button type="submit">Review information</Button>
        </div>
      </form>

      {step === 'preview' && (
        <Modal title="Confirm sub-admin details" onClose={() => setStep('form')} wide>
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              {form.profileImageUrl ? <img src={form.profileImageUrl} alt="" className="h-12 w-12 rounded-full object-cover" /> : <div className="grid h-12 w-12 place-items-center rounded-full bg-indigo-100 font-bold text-indigo-700">{form.name.charAt(0).toUpperCase()}</div>}
              <div><p className="font-semibold">{form.name}</p><p className="text-gray-500">{form.email}</p></div>
            </div>
            <div><p className="font-semibold text-gray-700">Marketplace shops</p><p className="mt-1 text-gray-500">{form.shopIds.map((shopId) => shops.find((shop) => shop._id === shopId)?.name).filter(Boolean).join(', ')}</p></div>
            <div><p className="font-semibold text-gray-700">Main routes</p><p className="mt-1 text-gray-500">{form.mainRoutes.map((route) => ROUTES.find(([value]) => value === route)?.[1]).join(', ')}</p></div>
          </div>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStep('form')}>Back</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Confirm and save'}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
