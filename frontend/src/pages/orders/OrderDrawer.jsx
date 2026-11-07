import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import { marketplaceLabel } from '../../lib/marketplaces'
import Badge, { statusColor } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import { Select } from '../../components/ui/Input'

const CARRIERS = [
  { value: 'USPS', label: 'USPS' },
  { value: 'UPS', label: 'UPS' },
  { value: 'FedEx', label: 'FedEx' },
  { value: 'DHL', label: 'DHL' },
  { value: 'OnTrac', label: 'OnTrac' },
  { value: 'Other', label: 'Other' },
]

const REFUND_REASONS = [
  { value: 'BUYER_CANCEL', label: 'Buyer requested cancellation' },
  { value: 'OUT_OF_STOCK', label: 'Item out of stock' },
  { value: 'CUSTOMER_SERVICE', label: 'Customer service concession' },
  { value: 'OTHER', label: 'Other' },
]

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
  const [carrier, setCarrier] = useState(order.shipping?.carrier || 'USPS')
  const [tracking, setTracking] = useState(order.shipping?.trackingNumber || '')
  const [returnReason, setReturnReason] = useState('')

  const [showRefundForm, setShowRefundForm] = useState(false)
  const [refundAmount, setRefundAmount] = useState(order.totals?.total != null ? String(order.totals.total) : '')
  const [refundReason, setRefundReason] = useState('BUYER_CANCEL')
  const [refundComment, setRefundComment] = useState('')
  const [copied, setCopied] = useState(false)

  const buyerName = order.buyer?.name || order.customerId?.name || 'Customer'
  const buyerUsername = order.buyer?.username
    || order.customerId?.identities?.find((id) => id.marketplace === order.marketplace)?.username
    || order.customerId?.identities?.find((id) => id.marketplace === order.marketplace)?.externalBuyerId
    || ''
  const buyerEmail = order.buyer?.email || order.customerId?.email || ''
  const buyerPhone = order.buyer?.phone || order.customerId?.phone || ''

  const addr = order.shippingAddress || order.customerId?.address || {}
  const addressLines = [
    addr.street || addr.addressLine1 || addr.street1 || '',
    addr.street2 || addr.addressLine2 || '',
    [addr.city, addr.state || addr.stateOrProvince, addr.zip || addr.postalCode].filter(Boolean).join(', '),
    addr.country || addr.countryCode || '',
  ].filter(Boolean)

  const hasAddress = addressLines.length > 0
  const fullAddressText = [
    buyerName,
    ...addressLines,
    buyerPhone ? `Phone: ${buyerPhone}` : '',
  ].filter(Boolean).join('\n')

  const copyAddress = async () => {
    if (!fullAddressText) return
    try {
      await navigator.clipboard.writeText(fullAddressText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

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
    mutate(() => api.patch(`/api/orders/${order._id}/shipping`, { carrier, trackingNumber: tracking }, token))

  const cancelOrder = (reason = 'OUT_OF_STOCK') => {
    if (!window.confirm(`Cancel order ${order.externalOrderId} on ${marketplaceLabel(order.marketplace)}? This cannot be undone.`)) return
    mutate(() => api.post(`/api/orders/${order._id}/cancel`, { reason, comment: 'Cancelled by merchant' }, token))
  }

  const issueRefund = () => {
    const amountNum = Number(refundAmount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return setError('Please enter a valid refund amount.')
    }
    if (!window.confirm(`Issue a refund of $${amountNum.toFixed(2)} on ${marketplaceLabel(order.marketplace)}?`)) return
    mutate(async () => {
      await api.post(`/api/orders/${order._id}/refund`, {
        amount: amountNum,
        reason: refundReason,
        comment: refundComment || 'Merchant refund',
      }, token)
      setShowRefundForm(false)
    })
  }

  const addReturn = () =>
    mutate(() => api.post(`/api/orders/${order._id}/returns`, { reason: returnReason }, token))

  const setReturnStatus = (index, status) =>
    mutate(() => api.patch(`/api/orders/${order._id}/returns/${index}`, { status }, token))

  const canCancel = ['pending', 'paid', 'processing'].includes(order.status)
  const canRefund = order.status !== 'refunded' && order.status !== 'cancelled'

  return (
    <Modal title={`Order ${order.externalOrderId}`} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Badge color={statusColor(order.status)}>{order.status}</Badge>
            <Badge color="blue">{marketplaceLabel(order.marketplace)}</Badge>
          </div>
          {canCancel && (
            <Button
              size="sm"
              variant="secondary"
              className="text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
              disabled={busy}
              onClick={() => cancelOrder('BUYER_ASKED_CANCEL')}
            >
              Cancel order
            </Button>
          )}
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100">Items</h3>
          <ul className="mt-1 space-y-1">
            {order.items.map((it, i) => (
              <li key={i} className="flex justify-between py-0.5 border-b border-gray-50 dark:border-slate-800/60">
                <span>{it.title} × {it.quantity}</span>
                <span className="font-medium">${(it.quantity * it.unitPrice).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-right font-bold text-gray-900 dark:text-slate-100">
            Total: ${order.totals?.total?.toFixed(2)}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30 p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-200/60 dark:border-slate-800 pb-2">
            <h3 className="font-semibold text-gray-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>Buyer & shipping details</span>
            </h3>
            {hasAddress && (
              <button
                type="button"
                onClick={copyAddress}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition"
              >
                {copied ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Copied</span>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy address</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Buyer Contact Column */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block">
                Buyer
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold text-gray-900 dark:text-slate-100">{buyerName}</span>
                {buyerUsername && (
                  <span className="rounded bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 font-mono text-[11px] font-medium text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/40">
                    @{buyerUsername}
                  </span>
                )}
              </div>
              {buyerEmail && (
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300">
                  <span className="text-gray-400">✉</span>
                  <a
                    href={`mailto:${buyerEmail}`}
                    className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline break-all"
                  >
                    {buyerEmail}
                  </a>
                </div>
              )}
              {buyerPhone ? (
                <div className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-300">
                  <span className="text-gray-400">📞</span>
                  <a href={`tel:${buyerPhone}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline">
                    {buyerPhone}
                  </a>
                </div>
              ) : (
                <div className="text-xs text-gray-400 dark:text-slate-500 italic">No phone provided</div>
              )}
            </div>

            {/* Shipping Destination Column */}
            <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-gray-200/60 dark:border-slate-800 pt-2.5 md:pt-0 md:pl-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400 block">
                Ship to
              </span>
              {hasAddress ? (
                <div className="text-xs text-gray-700 dark:text-slate-300 leading-relaxed font-sans">
                  <p className="font-medium text-gray-900 dark:text-slate-100">{buyerName}</p>
                  {addressLines.map((line, idx) => (
                    <p key={idx}>{line}</p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 dark:text-slate-500 italic">No shipping address recorded</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/30 p-3 space-y-2">
          <h3 className="font-semibold text-gray-900 dark:text-slate-100">Shipping & tracking</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Carrier: <span className="font-semibold text-gray-700 dark:text-gray-300">{order.shipping?.carrier || 'None'}</span>
            {order.shipping?.trackingNumber && <> · Tracking: <span className="font-mono text-gray-700 dark:text-gray-300">{order.shipping.trackingNumber}</span></>}
            {order.shipping?.deliveredAt && <> · Delivered: <span className="text-emerald-600 dark:text-emerald-400 font-medium">{new Date(order.shipping.deliveredAt).toLocaleDateString()}</span></>}
            {!order.shipping?.deliveredAt && order.shipping?.shippedAt && <> · Shipped: <span className="text-gray-600 dark:text-gray-400">{new Date(order.shipping.shippedAt).toLocaleDateString()}</span></>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-2 pt-1">
            <Select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              options={CARRIERS}
              aria-label="Shipping Carrier"
            />
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Tracking number"
              className="rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <Button variant="secondary" disabled={busy} onClick={saveTracking}>
              Push tracking
            </Button>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 dark:text-slate-100">Status</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {(NEXT[order.status] || []).map((s) => (
              <Button key={s} size="sm" variant="secondary" disabled={busy} onClick={() => setStatus(s)}>
                → {s}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-slate-100">Returns & refunds</h3>
            {canRefund && !showRefundForm && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setShowRefundForm(true)}
              >
                Issue refund
              </Button>
            )}
          </div>

          {showRefundForm && (
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-3 space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                Issue Refund via {marketplaceLabel(order.marketplace)}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-slate-300">Amount ($)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={order.totals?.total || undefined}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <Select
                    label="Reason"
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    options={REFUND_REASONS}
                  />
                </div>
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold text-gray-600 dark:text-slate-300">Comment (optional)</span>
                <input
                  value={refundComment}
                  onChange={(e) => setRefundComment(e.target.value)}
                  placeholder="Note for refund..."
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="secondary" onClick={() => setShowRefundForm(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={busy} onClick={issueRefund}>
                  {busy ? 'Processing…' : 'Confirm refund'}
                </Button>
              </div>
            </div>
          )}

          {(order.returns || []).map((r, i) => (
            <div key={i} className="mt-1 flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50 p-2.5">
              <span>{r.reason} <Badge color={statusColor(r.status)}>{r.status}</Badge></span>
              {r.status === 'requested' && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setReturnStatus(i, 'approved')}>
                  Approve return
                </Button>
              )}
            </div>
          ))}

          <div className="mt-2 flex gap-2">
            <input
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="Internal return note / reason..."
              className="flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            <Button variant="secondary" disabled={busy || !returnReason} onClick={addReturn}>
              Request return
            </Button>
          </div>
        </div>

        {error && <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </Modal>
  )
}
