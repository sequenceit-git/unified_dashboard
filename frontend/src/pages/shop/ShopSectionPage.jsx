import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import RequireShopSection from '../../components/RequireShopSection'
import { useShopSection } from '../../hooks/useShopSection'
import { useShopProfile } from '../../hooks/useShopProfiles'
import { api, queryString } from '../../lib/api'
import Card, { StatCard } from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'

const PAGE_SIZE = 15

function formatMoney(amount) {
  if (!amount || amount.value == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: amount.currency || 'USD' }).format(amount.value)
}

function formatCell(type, value) {
  if (value == null || value === '') return '—'
  switch (type) {
    case 'money': return <span className={value.value < 0 ? 'text-rose-600' : ''}>{formatMoney(value)}</span>
    case 'date': return new Date(value).toLocaleDateString()
    case 'number': return Number(value).toLocaleString()
    case 'status': return <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">{value}</span>
    case 'link': return <a href={value} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">Open</a>
    default: return <span className="line-clamp-2 max-w-md">{value}</span>
  }
}

function OfferModal({ item, onClose, onSuccess, token, marketplace }) {
  const [discount, setDiscount] = useState('10')
  const [message, setMessage] = useState('Thanks for watching! Here is a special discount offer on this item.')
  const [allowCounter, setAllowCounter] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const handleSend = async () => {
    setBusy(true)
    setErr('')
    try {
      await api.post('/api/shops/sections/offers/send', {
        marketplace,
        listingId: item.listingId,
        discountPercentage: Number(discount) || 10,
        message,
        allowCounterOffer: allowCounter,
      }, token)
      onSuccess?.()
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Send Offer to Interested Buyers" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/40 p-3">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{item.title || item.listingId}</p>
          <p className="text-xs text-gray-500 mt-0.5">Item ID: {item.listingId} {item.sku && `• SKU: ${item.sku}`}</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
            Discount Percentage (% off)
          </label>
          <div className="flex gap-2 mb-2">
            {['5', '10', '15', '20'].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setDiscount(pct)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition ${
                  discount === pct
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-300'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {pct}% OFF
              </button>
            ))}
          </div>
          <input
            type="number"
            min="5"
            max="80"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">eBay requires a minimum discount of 5%.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
            Custom Message (optional)
          </label>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={250}
            placeholder="Special offer for you..."
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={allowCounter}
            onChange={(e) => setAllowCounter(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>Allow buyers to submit counter-offers</span>
        </label>

        {err && <p className="text-sm text-red-600 dark:text-red-400 font-medium">{err}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !discount} onClick={handleSend}>
            {busy ? 'Sending…' : 'Send offer to buyers'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PromotionModal({ onClose, onSuccess, token, marketplace }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [discount, setDiscount] = useState('10')
  const [durationDays, setDurationDays] = useState('14')
  const [listingIds, setListingIds] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const handleCreate = async () => {
    setBusy(true)
    setErr('')
    try {
      const days = parseInt(durationDays, 10) || 14
      const startDate = new Date(Date.now() + 60000).toISOString()
      const endDate = new Date(Date.now() + days * 86400000).toISOString()
      const ids = listingIds ? listingIds.split(',').map((s) => s.trim()).filter(Boolean) : []
      await api.post('/api/shops/sections/promotions/create', {
        marketplace,
        name: name || `Sale ${new Date().toLocaleDateString()}`,
        description: description || 'Special Store Discount',
        percentageOff: Number(discount) || 10,
        listingIds: ids,
        startDate,
        endDate,
      }, token)
      onSuccess?.()
      onClose()
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Create Store Promotion" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
            Promotion Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Summer Clearance Sale"
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
              Discount (% OFF)
            </label>
            <input
              type="number"
              min="1"
              max="80"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
              Duration
            </label>
            <select
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="7">7 Days</option>
              <option value="14">14 Days</option>
              <option value="30">30 Days</option>
              <option value="60">60 Days</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-slate-300 mb-1.5">
            Eligible Listing IDs (optional)
          </label>
          <input
            value={listingIds}
            onChange={(e) => setListingIds(e.target.value)}
            placeholder="Leave blank for entire inventory, or comma-separated item IDs"
            className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">Specify item IDs to limit the sale to specific products.</p>
        </div>

        {err && <p className="text-sm text-red-600 dark:text-red-400 font-medium">{err}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-slate-800">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !discount} onClick={handleCreate}>
            {busy ? 'Creating…' : 'Launch promotion'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function SectionTable({ table, sectionId, marketplace, onAction, canAct = true }) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE))
  const rows = table.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((row, index) => ({ ...row, _key: `${page}-${index}` }))

  let columns = table.columns.map((column) => ({
    ...column,
    render: (row) => formatCell(column.type, row[column.key]),
  }))

  if (canAct) {
    if (sectionId === 'offers' && table.id === 'eligible' && marketplace === 'ebay') {
      columns = [
        ...columns,
        {
          key: '_action',
          label: 'Action',
          render: (row) => (
            <Button size="sm" onClick={() => onAction('offer', row)}>
              Send offer
            </Button>
          ),
        },
      ]
    } else if (sectionId === 'returns' && table.id === 'cancellations') {
      columns = [
        ...columns,
        {
          key: '_action',
          label: 'Action',
          render: (row) => {
            const closed = /closed|complete|finish|reject|declined|approved|cancel/i.test(String(row.status || ''))
            if (closed) return <span className="text-xs text-gray-400">Processed</span>
            return (
              <div className="flex items-center gap-1.5">
                <Button size="sm" onClick={() => onAction('cancel-approve', row)}>
                  Approve
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onAction('cancel-reject', row)}>
                  Reject
                </Button>
              </div>
            )
          },
        },
      ]
    } else if (sectionId === 'returns' && table.id === 'returns') {
      columns = [
        ...columns,
        {
          key: '_action',
          label: 'Action',
          render: (row) => {
            const closed = /closed|complete|finish|reject|declined|approved|refund/i.test(String(row.status || ''))
            if (closed) return <span className="text-xs text-gray-400">Processed</span>
            return (
              <div className="flex items-center gap-1.5">
                <Button size="sm" onClick={() => onAction('return-approve', row)}>
                  {marketplace === 'temu' ? 'Approve & refund' : 'Approve'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onAction('return-decline', row)}>
                  Decline
                </Button>
              </div>
            )
          },
        },
      ]
    } else if (sectionId === 'promotions' && (table.id === 'promotions' || table.id === 'activities')) {
      columns = [
        ...columns,
        {
          key: '_action',
          label: 'Action',
          render: (row) => {
            if (!row.promotionId) return null
            const isPaused = /pause|deactivate/i.test(String(row.status || ''))
            return (
              <Button
                size="sm"
                variant={isPaused ? 'primary' : 'secondary'}
                onClick={() => onAction(isPaused ? 'promo-resume' : 'promo-pause', row)}
              >
                {isPaused ? 'Resume' : marketplace === 'tiktok_shop' ? 'Deactivate' : 'Pause'}
              </Button>
            )
          },
        },
      ]
    } else if (sectionId === 'fulfillment' && table.id === 'packages' && marketplace === 'tiktok_shop') {
      columns = [
        ...columns,
        {
          key: '_action',
          label: 'Action',
          render: (row) => (
            <Button size="sm" variant="secondary" onClick={() => onAction('fulfillment-label', row)}>
              Get label
            </Button>
          ),
        },
      ]
    }
  }

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{table.title}</h2>
        <span className="text-xs text-gray-500">{table.rows.length} total</span>
      </div>
      {table.note && <p className="mb-3 text-xs text-gray-500">{table.note}</p>}
      {table.error ? (
        <ErrorState message={table.error} />
      ) : (
        <DataTable
          rowKey="_key"
          rows={rows}
          columns={columns}
        />
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-gray-500">{page} / {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </Card>
  )
}

/** Renders any shop-specific section (returns, finances, promotions...) from its profile. */
export default function ShopSectionPage() {
  const { sectionId } = useParams()
  const { token, hasRoute, isAdmin, user } = useAuth()
  const shopSection = useShopSection()
  const { profile, error: profileError } = useShopProfile(shopSection?.marketplace)
  const section = profile?.sections.find((item) => item.id === sectionId)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [activeOfferItem, setActiveOfferItem] = useState(null)
  const [showCreatePromo, setShowCreatePromo] = useState(false)

  const isAllowed =
    isAdmin ||
    !Array.isArray(user?.allowedSections) ||
    user.allowedSections.length === 0 ||
    user.allowedSections.includes(sectionId) ||
    user.allowedSections.includes(`${shopSection?.marketplace}:${sectionId}`)
  const canOpen = section && hasRoute(section.route) && section.available !== false && isAllowed
  const load = async ({ refresh = false } = {}) => {
    setLoading(true)
    setError('')
    try {
      setData(await api.get(`/api/shops/sections/${sectionId}${queryString({ marketplace: shopSection.marketplace, refresh: refresh ? 1 : undefined })}`, token))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (type, row) => {
    if (type === 'offer') {
      setActiveOfferItem(row)
      return
    }
    if (type === 'promo-pause') {
      const title = row.title || row.name || 'this promotion'
      if (!window.confirm(`${shopSection.marketplace === 'tiktok_shop' ? 'Deactivate' : 'Pause'} promotion "${title}"?`)) return
      setLoading(true)
      try {
        await api.post(`/api/shops/sections/promotions/${row.promotionId}/pause`, { marketplace: shopSection.marketplace }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'promo-resume') {
      const title = row.title || row.name || 'this promotion'
      if (!window.confirm(`Resume promotion "${title}"?`)) return
      setLoading(true)
      try {
        await api.post(`/api/shops/sections/promotions/${row.promotionId}/resume`, { marketplace: shopSection.marketplace }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'fulfillment-label') {
      setLoading(true)
      try {
        const doc = await api.get(`/api/shops/sections/fulfillment/${row.packageId}/label?marketplace=${shopSection.marketplace}`, token)
        const url = doc.doc_url || doc.url || doc.shipping_document_url
        if (url) {
          window.open(url, '_blank')
        } else {
          setError('No document download URL was returned for this package.')
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'cancel-approve') {
      if (!window.confirm(`Approve cancellation for Order ${row.orderId || row.cancelId}?`)) return
      setLoading(true)
      try {
        await api.post('/api/shops/sections/cancellations/decide', { marketplace: shopSection.marketplace, cancelId: row.cancelId, action: 'approve' }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'cancel-reject') {
      if (!window.confirm(`Reject cancellation for Order ${row.orderId || row.cancelId}?`)) return
      setLoading(true)
      try {
        await api.post('/api/shops/sections/cancellations/decide', { marketplace: shopSection.marketplace, cancelId: row.cancelId, action: 'reject' }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'return-approve') {
      if (!window.confirm(`Approve return request for Order ${row.orderId || row.returnId}?`)) return
      setLoading(true)
      try {
        await api.post('/api/shops/sections/returns/decide', { marketplace: shopSection.marketplace, returnId: row.returnId, decision: 'APPROVE' }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'return-decline') {
      const reason = window.prompt(`Decline return for Order ${row.orderId || row.returnId}? Enter optional reason:`, 'Return declined by policy')
      if (reason === null) return
      setLoading(true)
      try {
        await api.post('/api/shops/sections/returns/decide', { marketplace: shopSection.marketplace, returnId: row.returnId, decision: 'DECLINE', comments: reason }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
  }

  useEffect(() => {
    setData(null)
    if (canOpen) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, shopSection?.marketplace, canOpen])

  if (!shopSection) return <RequireShopSection />
  if (profileError) return <ErrorState message={profileError} />
  if (!profile) return <Spinner />
  if (!section) return <EmptyState message={`${profile.label} doesn't have this section.`} />
  if (!hasRoute(section.route) || !isAllowed) return <EmptyState message={`You don't have access to ${section.label}.`} />
  if (section.available === false) {
    return <EmptyState message={`${section.label} isn't available for ${profile.label}: ${section.reason}.`} />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold">{profile.label} {section.label.toLowerCase()}</h1>
        <div className="flex items-center gap-3">
          {data?.loadedAt && <span className="text-xs text-gray-500">Updated {new Date(data.loadedAt).toLocaleTimeString()}</span>}
          {(isAdmin || isAllowed) && (shopSection.marketplace === 'ebay' || shopSection.marketplace === 'tiktok_shop') && sectionId === 'promotions' && (
            <Button size="sm" onClick={() => setShowCreatePromo(true)}>+ Create promotion</Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => load({ refresh: true })} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        </div>
      </div>
      {error && <ErrorState message={error} onRetry={() => load({ refresh: true })} />}
      {!data && loading && <Spinner />}
      {data && (
        <>
          {data.summary?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {data.summary.map((item) => (
                <StatCard
                  key={item.label}
                  label={item.label}
                  value={item.type === 'money' ? formatMoney(item.value) : Number(item.value || 0).toLocaleString()}
                />
              ))}
            </div>
          )}
          {data.tables.map((table) => (
            <SectionTable
              key={table.id}
              table={table}
              sectionId={sectionId}
              marketplace={shopSection.marketplace}
              onAction={handleAction}
              canAct={isAdmin || isAllowed}
            />
          ))}
        </>
      )}

      {activeOfferItem && (
        <OfferModal
          item={activeOfferItem}
          marketplace={shopSection.marketplace}
          token={token}
          onClose={() => setActiveOfferItem(null)}
          onSuccess={() => load({ refresh: true })}
        />
      )}

      {showCreatePromo && (
        <PromotionModal
          marketplace={shopSection.marketplace}
          token={token}
          onClose={() => setShowCreatePromo(false)}
          onSuccess={() => load({ refresh: true })}
        />
      )}
    </div>
  )
}
