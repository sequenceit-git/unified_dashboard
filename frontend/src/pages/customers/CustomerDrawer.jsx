import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Badge, { statusColor } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'

export default function CustomerDrawer({ customer, onClose, onSaved }) {
  const { token } = useAuth()
  const [name, setName] = useState(customer.name || '')
  const [email, setEmail] = useState(customer.email || '')
  const [phone, setPhone] = useState(customer.phone || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.patch(`/api/customers/${customer._id}`, { name, email, phone }, token)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={customer.name || 'Customer'} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {error && <p className="text-sm text-red-600 sm:col-span-3">{error}</p>}
          <div className="sm:col-span-3">
            <Button type="submit" size="sm" disabled={busy}>Save</Button>
          </div>
        </form>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded bg-gray-50 p-2"><p className="font-bold">{customer.orderCount}</p><p className="text-xs text-gray-500">Orders</p></div>
          <div className="rounded bg-gray-50 p-2"><p className="font-bold">${customer.totalSpent?.toFixed(2)}</p><p className="text-xs text-gray-500">Spent</p></div>
          <div className="rounded bg-gray-50 p-2"><p className="font-bold">{customer.identities?.length || 0}</p><p className="text-xs text-gray-500">Shops</p></div>
        </div>

        <div>
          <h3 className="font-semibold">Marketplace identities</h3>
          <ul className="mt-1 space-y-1">
            {(customer.identities || []).map((idn, i) => (
              <li key={i} className="flex justify-between rounded bg-gray-50 px-2 py-1">
                <span>{idn.marketplace} · {idn.username}</span>
                <span className="text-gray-500">{idn.externalBuyerId}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-semibold">Order history</h3>
          <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
            {(customer.orders || []).map((o) => (
              <li key={o._id} className="flex justify-between rounded bg-gray-50 px-2 py-1">
                <span>{o.externalOrderId}</span>
                <span><Badge color={statusColor(o.status)}>{o.status}</Badge> ${o.totals?.total?.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  )
}
