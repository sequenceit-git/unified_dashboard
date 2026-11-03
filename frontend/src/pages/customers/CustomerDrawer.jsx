import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Badge, { statusColor } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'

export default function CustomerDrawer({ customer, onClose, onSaved }) {
  const { token } = useAuth()
  const ebayIdentity = (customer.identities || []).find((i) => i.marketplace === 'ebay')
  const buyerUsername =
    ebayIdentity?.username ||
    customer.identities?.[0]?.username ||
    customer.identities?.[0]?.externalBuyerId ||
    (!customer.name?.includes(' ') ? customer.name : '')
  const defaultEmail =
    customer.email || (buyerUsername ? `${buyerUsername.toLowerCase()}@members.ebay.com` : '')

  const [name, setName] = useState(customer.name || '')
  const [email, setEmail] = useState(defaultEmail)
  const [phone, setPhone] = useState(customer.phone || '')
  const [street, setStreet] = useState(customer.address?.street || '')
  const [city, setCity] = useState(customer.address?.city || '')
  const [state, setState] = useState(customer.address?.state || '')
  const [zip, setZip] = useState(customer.address?.zip || '')
  const [country, setCountry] = useState(customer.address?.country || 'US')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.patch(
        `/api/customers/${customer._id}`,
        {
          name,
          email,
          phone,
          address: { street, city, state, zip, country },
        },
        token,
      )
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
        {/* Quick Contact & Action Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {email ? (
            <a
              href={`mailto:${email}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 transition-colors"
            >
              ✉️ {email}
            </a>
          ) : null}
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 transition-colors"
            >
              📞 {phone}
            </a>
          ) : null}
          {ebayIdentity?.username ? (
            <a
              href={`https://www.ebay.com/usr/${encodeURIComponent(ebayIdentity.username)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 transition-colors"
            >
              ↗ View on eBay (@{ebayIdentity.username})
            </a>
          ) : null}
        </div>

        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

          <div className="sm:col-span-3 border-t border-gray-100 pt-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Shipping Address</h4>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <Input label="Street" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Address line 1" />
              </div>
              <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input label="State" value={state} onChange={(e) => setState(e.target.value)} />
                <Input label="ZIP" value={zip} onChange={(e) => setZip(e.target.value)} />
              </div>
            </div>
          </div>

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
              <li key={i} className="flex justify-between items-center rounded bg-gray-50 px-2.5 py-1.5">
                <span className="font-medium">{idn.marketplace} · @{idn.username}</span>
                {idn.marketplace === 'ebay' && (
                  <a
                    href={`https://www.ebay.com/usr/${encodeURIComponent(idn.username)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    View profile ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-semibold">Order history</h3>
          <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">
            {(customer.orders || []).map((o) => (
              <li key={o._id} className="flex justify-between items-center rounded bg-gray-50 px-2 py-1">
                <span className="font-mono text-xs">{o.externalOrderId}</span>
                <span><Badge color={statusColor(o.status)}>{o.status}</Badge> ${o.totals?.total?.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  )
}
