import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import { marketplaceLabel } from '../../lib/marketplaces'
import Badge, { statusColor } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'


const NEXT = {
  pending: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: ['returned'],
  returned: ['refunded'],
  cancelled: [],
  refunded: [],
}

export default function OrderDrawer({ order, onClose, onSaved }) {
  const { token, isAdmin } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tracking, setTracking] = useState(order.shipping?.trackingNumber || '')
  const [returnReason, setReturnReason] = useState('')

  const mutate = async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const setStatus = (status) => mutate(() => api.patch(`/api/orders/${order._id}/status`, { status }, token))

  const saveTracking = () =>
    mutate(() => api.patch(`/api/orders/${order._id}/shipping`, { trackingNumber: tracking }, token))

  const addReturn = () =>
    mutate(() => api.post(`/api/orders/${order._id}/returns`, { reason: returnReason }, token))

  const setReturnStatus = (index, status) =>
    mutate(() => api.patch(`/api/orders/${order._id}/returns/${index}`, { status }, token))

  return (
    <Modal title={`Order ${order.externalOrderId}`} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge color={statusColor(order.status)}>{order.status}</Badge>
          <Badge color="blue">{marketplaceLabel(order.marketplace)}</Badge>
        </div>

        <div>
          <h3 className="font-semibold">Items</h3>
          <ul className="mt-1 space-y-1">
            {order.items.map((it, i) => (
              <li key={i} className="flex justify-between">
                <span>{it.title} × {it.quantity}</span>
                <span>${(it.quantity * it.unitPrice).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-right font-semibold">Total: ${order.totals?.total?.toFixed(2)}</p>
        </div>

        <div>
          <h3 className="font-semibold">Shipping & tracking</h3>
          <p className="text-gray-600">{order.shipping?.carrier} · {order.shipping?.trackingNumber || '—'}</p>
          <div className="mt-2 flex gap-2">
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Tracking number"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <Button variant="secondary" disabled={busy} onClick={saveTracking}>Save</Button>
          </div>
        </div>

        <div>
          <h3 className="font-semibold">Status</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {(NEXT[order.status] || []).map((s) => (
              <Button key={s} size="sm" variant="secondary" disabled={busy} onClick={() => setStatus(s)}>
                → {s}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold">Returns & refunds</h3>
          {(order.returns || []).map((r, i) => (
            <div key={i} className="mt-1 flex items-center justify-between rounded bg-gray-50 p-2">
              <span>{r.reason} <Badge color={statusColor(r.status)}>{r.status}</Badge></span>
              {isAdmin && r.status === 'requested' && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setReturnStatus(i, 'approved')}>
                  Approve
                </Button>
              )}
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <input
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Return reason"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <Button variant="secondary" disabled={busy || !returnReason} onClick={addReturn}>Request</Button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  )
}
