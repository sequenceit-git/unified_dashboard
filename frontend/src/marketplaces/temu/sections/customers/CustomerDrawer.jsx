import { useState } from 'react'
import { getShop } from '../../..'
import { useAuth } from '../../../../auth/AuthContext'
import { api } from '../../../../lib/api'
import Badge, { statusColor } from '../../../../components/ui/Badge'
import Button from '../../../../components/ui/Button'
import { Input } from '../../../../components/ui/Input'
import { Link } from 'react-router-dom'
import Drawer from '../../ui/Drawer'
import { orderLink } from './customersView'

export default function CustomerDrawer({ customer, onClose, onSaved }) {
  const { token } = useAuth()
  const buyerIdentity = (customer.identities || []).find((i) => getShop(i.marketplace)?.buyer?.email)
  const [name, setName] = useState(customer.name || '')
  const [email, setEmail] = useState(customer.email || '')
  const displayEmail = email || (buyerIdentity?.username ? getShop(buyerIdentity.marketplace).buyer.email(buyerIdentity.username) : '')
  const [phone, setPhone] = useState(customer.phone || '')
  const [street, setStreet] = useState(customer.address?.street || '')
  const [city, setCity] = useState(customer.address?.city || '')
  const [state, setState] = useState(customer.address?.state || '')
  const [zip, setZip] = useState(customer.address?.zip || '')
  const [country] = useState(customer.address?.country || 'US')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Ask before throwing away typed changes (closing, or opening an order).
  const start = customer.address || {}
  const dirty = name !== (customer.name || '') || email !== (customer.email || '') || phone !== (customer.phone || '')
    || street !== (start.street || '') || city !== (start.city || '') || state !== (start.state || '') || zip !== (start.zip || '')
  const leaveOk = () => !dirty || window.confirm('Leave without saving the contact changes?')
  const close = () => { if (leaveOk()) onClose() }

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.patch(
        `/api/temu/customers/${customer._id}`,
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
    <Drawer
      title={customer.name || 'Customer'}
      subtitle={`${customer.orderCount || 0} order${customer.orderCount === 1 ? '' : 's'} · $${(customer.totalSpent || 0).toFixed(2)} spent${customer.orderCount >= 2 ? ' · repeat buyer' : ''}`}
      onClose={close}
      footer={<>
        <Button type="submit" form="temu-customer-form" disabled={busy}>{busy ? 'Saving…' : 'Save contact'}</Button>
        <Button variant="secondary" onClick={close}>Close</Button>
      </>}
    >
      <div className="space-y-4 text-sm">
        {/* Quick Contact & Action Chips */}
        <div className="flex flex-wrap items-center gap-2">
          {displayEmail ? (
            <a
              href={`mailto:${displayEmail}`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 transition-colors"
            >
              ✉️ {displayEmail}
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
          {buyerIdentity?.username && getShop(buyerIdentity.marketplace)?.buyer?.profileUrl ? (
            <a
              href={getShop(buyerIdentity.marketplace).buyer.profileUrl(buyerIdentity.username)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 transition-colors"
            >
              ↗ View on {getShop(buyerIdentity.marketplace).label} (@{buyerIdentity.username})
            </a>
          ) : null}
        </div>

        <h3 className="font-semibold">Contact & address</h3>
        <form id="temu-customer-form" onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />

          <div className="sm:col-span-3 border-t border-gray-100 pt-3 dark:border-slate-800">
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

          {error && <p className="text-sm text-red-600 sm:col-span-3 dark:text-rose-400">{error}</p>}
        </form>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded bg-gray-50 p-2 dark:bg-slate-800"><p className="font-bold">{customer.orderCount}</p><p className="text-xs text-gray-500 dark:text-slate-400">Orders</p></div>
          <div className="rounded bg-gray-50 p-2 dark:bg-slate-800"><p className="font-bold">${customer.totalSpent?.toFixed(2)}</p><p className="text-xs text-gray-500 dark:text-slate-400">Spent</p></div>
          <div className="rounded bg-gray-50 p-2 dark:bg-slate-800"><p className="font-bold">{customer.identities?.length || 0}</p><p className="text-xs text-gray-500 dark:text-slate-400">Shops</p></div>
        </div>

        <div>
          <h3 className="font-semibold">Marketplace identities</h3>
          <ul className="mt-1 space-y-1">
            {(customer.identities || []).map((idn, i) => (
              <li key={i} className="flex justify-between items-center rounded bg-gray-50 px-2.5 py-1.5 dark:bg-slate-800">
                <span className="font-medium">{idn.marketplace} · @{idn.username}</span>
                {getShop(idn.marketplace)?.buyer?.profileUrl && (
                  <a
                    href={getShop(idn.marketplace).buyer.profileUrl(idn.username)}
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
          <ul className="mt-1 space-y-1">
            {(customer.orders || []).map((o) => (
              <li key={o._id} className="flex flex-wrap justify-between items-center gap-2 rounded bg-gray-50 px-2 py-1 dark:bg-slate-800">
                <span>
                  {orderLink(o) ? <Link to={orderLink(o)} onClick={(e) => { if (!leaveOk()) e.preventDefault() }} className="font-mono text-xs text-indigo-600 hover:underline dark:text-indigo-400">{o.externalOrderId}</Link> : <span className="font-mono text-xs">{o.externalOrderId}</span>}
                  {(o.placedAt || o.createdAt) && <span className="ml-2 text-xs text-gray-500 dark:text-slate-400">{new Date(o.placedAt || o.createdAt).toLocaleDateString()}</span>}
                </span>
                <span><Badge color={statusColor(o.status)}>{o.status}</Badge> ${o.totals?.total?.toFixed(2)}</span>
              </li>
            ))}
            {!(customer.orders || []).length && <li className="text-xs text-gray-500 dark:text-slate-400">No orders found for this shop.</li>}
          </ul>
        </div>
      </div>
    </Drawer>
  )
}
