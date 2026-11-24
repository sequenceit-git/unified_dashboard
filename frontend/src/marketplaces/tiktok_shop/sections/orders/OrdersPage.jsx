/** TikTok Shop orders: TikTok fulfillment stages as tabs, item summary, order drawer & sync. */
import { useEffect, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import { api, queryString } from '../../../../lib/api'
import Badge, { statusColor } from '../../../../components/ui/Badge'
import Button from '../../../../components/ui/Button'
import Card from '../../../../components/ui/Card'
import DataTable from '../../../../components/ui/DataTable'
import Modal from '../../../../components/ui/Modal'
import Pagination from '../../../../components/ui/Pagination'
import SearchInput from '../../../../components/ui/SearchInput'
import OrderDrawer from './OrderDrawer'

const TIKTOK_STAGES = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Awaiting shipment' },
  { key: 'processing', label: 'Awaiting collection' },
  { key: 'shipped', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'pending', label: 'Unpaid / On hold' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'returned', label: 'Returns' },
  { key: 'refunded', label: 'Refunded' },
]

export default function OrdersPage() {
  const { token } = useAuth()
  const section = useShopSection()
  const marketplace = section?.marketplace
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [error, setError] = useState('')
  const [orderStatus, setOrderStatus] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('-placedAt')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [extLookup, setExtLookup] = useState(null)

  const fetchRows = async ({ quiet = false } = {}) => {
    if (!marketplace) return
    if (!quiet) setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/tiktok/orders${queryString({ status: orderStatus, q, sort, page, limit: 15 })}`, token)
      setRows(res.data)
      setMeta({ page: res.page, pages: res.pages, total: res.total })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSyncOrders = async () => {
    setSyncing(true)
    setSyncMessage('')
    try {
      const res = await api.post('/api/tiktok/orders/sync', {}, token)
      const totalSynced = res.results?.reduce((acc, r) => acc + (r.synced || 0), 0) || 0
      const stillRunning = res.results?.some((r) => r.queued)
      setSyncMessage(stillRunning
        ? 'Sync is still running in the background. Orders refresh when it finishes.'
        : `Sync completed: ${totalSynced} orders updated from TikTok Shop`)
      setRefreshKey((k) => k + 1)
      setTimeout(() => setSyncMessage(''), 4000)
    } catch (err) {
      setError(`Sync failed: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  const lookupExternalRef = async () => {
    const val = window.prompt('Search TikTok Shop by External ERP Order Reference:', q || '')
    if (!val || !val.trim()) return
    setError('')
    try {
      const res = await api.get(`/api/tiktok/sections/orders/search-external${queryString({ id: val.trim() })}`, token)
      setExtLookup(res)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => {
    const t = setTimeout(fetchRows, q ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketplace, orderStatus, q, sort, page, refreshKey])

  useSyncReload('orders', marketplace, () => {
    if (syncing) return
    fetchRows({ quiet: true })
    if (selectedId?._id) {
      api.get(`/api/tiktok/orders/${selectedId._id}`, token).then(setSelectedId).catch(() => {})
    }
  })

  const openDetail = async (row) => {
    const full = await api.get(`/api/tiktok/orders/${row._id}`, token)
    setSelectedId(full)
  }

  if (!section) return <RequireShopSection />

  const stageLabel = (s) => TIKTOK_STAGES.find((t) => t.key === s)?.label || s

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{section.label} orders</h1>
          {syncMessage && <p className="text-xs text-emerald-600 font-medium">{syncMessage}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={lookupExternalRef} variant="secondary" size="sm">Find by external ref</Button>
          <Button onClick={handleSyncOrders} disabled={syncing} size="sm">
            {syncing ? 'Syncing...' : `Sync ${section.label}`}
          </Button>
        </div>
      </div>

      <div role="tablist" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TIKTOK_STAGES.map((stage) => {
          const on = stage.key === orderStatus
          return (
            <button
              key={stage.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => { setOrderStatus(stage.key); setPage(1) }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                on
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {stage.label}
            </button>
          )
        })}
      </div>

      <Card>
        <div className="mb-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Order ID, tracking, buyer or SKU…" />
        </div>
        <DataTable
          columns={[
            {
              key: 'externalOrderId',
              label: 'Order',
              render: (r) => (
                <span>
                  <span className="font-medium">{r.externalOrderId}</span>
                  <span className="block text-xs text-gray-500 dark:text-slate-400">{r.placedAt && new Date(r.placedAt).toLocaleDateString()}</span>
                </span>
              ),
            },
            { key: 'buyer', label: 'Buyer', render: (r) => r.buyer?.name || '—' },
            {
              key: 'items',
              label: 'Items',
              render: (r) => {
                const list = r.items || []
                if (!list.length) return '—'
                const units = list.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
                return (
                  <span className="block max-w-[16rem]">
                    <span className="line-clamp-1">{list[0].title || list[0].sku}</span>
                    <span className="text-xs text-gray-500 dark:text-slate-400">{units} unit{units === 1 ? '' : 's'}{list.length > 1 ? ` · +${list.length - 1} item${list.length > 2 ? 's' : ''}` : ''}</span>
                  </span>
                )
              },
            },
            { key: 'total', label: 'Total', sortable: true, sortKey: 'totals.total', render: (r) => `$${r.totals?.total?.toFixed(2)}` },
            { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{stageLabel(r.status)}</Badge> },
            { key: 'placedAt', label: 'Placed', sortable: true, render: (r) => r.placedAt && new Date(r.placedAt).toLocaleDateString() },
          ]}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={fetchRows}
          sort={sort}
          onSort={(k) => { setSort((s) => (s === k ? `-${k}` : k)); setPage(1) }}
          onRowClick={openDetail}
        />
        <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />
      </Card>
      {selectedId && (
        <OrderDrawer
          order={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={async () => {
            const full = await api.get(`/api/tiktok/orders/${selectedId._id}`, token)
            setSelectedId(full)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
      {extLookup && (
        <Modal title={extLookup.title || 'External reference search'} wide onClose={() => setExtLookup(null)}>
          {(extLookup.tables || []).map((t) => (
            <DataTable
              key={t.id}
              columns={t.columns}
              rows={t.rows}
              onRowClick={(r) => {
                setExtLookup(null)
                if (r.orderId) {
                  setQ(r.orderId)
                  setPage(1)
                }
              }}
            />
          ))}
        </Modal>
      )}
    </div>
  )
}
