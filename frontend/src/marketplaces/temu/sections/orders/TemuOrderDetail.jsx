/**
 * Temu's own view of an order in the drawer: what the buyer paid and what Temu expects to settle,
 * key dates, and the buyer's full address on request (fetched when clicked, shown only here, never
 * saved).
 */
import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api } from '../../../../lib/api'
import { useApi } from '../../../../hooks/useApi'
import Button from '../../../../components/ui/Button'
import TemuFollowUp from './TemuFollowUp'
import TemuLabel from './TemuLabel'

const money = (a) => (a ? new Intl.NumberFormat(undefined, { style: 'currency', currency: a.currency || 'USD' }).format(a.value) : '—')

export default function TemuOrderDetail({ orderId }) {
  const { token } = useAuth()
  const { data, loading, error } = useApi(orderId ? `/api/temu/orders/${orderId}/temu-detail` : null)
  const [address, setAddress] = useState(null)
  const [addressError, setAddressError] = useState('')
  const [fetching, setFetching] = useState(false)

  const showAddress = async () => {
    setFetching(true)
    setAddressError('')
    try {
      setAddress(await api.post(`/api/temu/orders/${orderId}/full-address`, {}, token))
    } catch (err) {
      setAddressError(err.message)
    } finally {
      setFetching(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-slate-100">Amounts on Temu</h3>
        {loading && <p className="mt-1 text-xs text-gray-500">Loading…</p>}
        {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
        {data && (
          <ul className="mt-1 space-y-1 text-sm">
            {data.amounts.map((l) => (
              <li key={l.label} className={`flex justify-between py-0.5 border-b border-gray-50 dark:border-slate-800/60 ${/Buyer paid|settlement/.test(l.label) ? 'font-semibold' : ''}`}>
                <span>{l.label}</span>
                <span>{money(l.amount)}</span>
              </li>
            ))}
            {data.timeline.map((t) => (
              <li key={t.label} className="flex justify-between py-0.5 text-xs text-gray-500">
                <span>{t.label}</span>
                <span>{new Date(t.time).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <TemuLabel orderId={orderId} />
      <TemuFollowUp orderId={orderId} />
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-slate-100">Buyer's full address</h3>
        {!address && (
          <div className="mt-1 flex items-center gap-2">
            <Button size="sm" variant="secondary" type="button" disabled={fetching} onClick={showAddress}>{fetching ? 'Loading…' : 'Show full address'}</Button>
            <span className="text-xs text-gray-500">Read from Temu when you click; not saved.</span>
          </div>
        )}
        {addressError && <p className="mt-1 text-xs text-rose-600">{addressError}</p>}
        {address && (
          <p className="mt-1 text-sm">
            {address.name}<br />
            {address.address}{address.phone && <><br />{address.phone}</>}
          </p>
        )}
      </div>
    </div>
  )
}
