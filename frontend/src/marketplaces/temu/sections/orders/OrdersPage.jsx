import { useEffect, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import { api, queryString } from '../../../../lib/api'
import Badge, { statusColor } from '../../../../components/ui/Badge'
import Button from '../../../../components/ui/Button'
import DataTable from '../../../../components/ui/DataTable'
import Pagination from '../../../../components/ui/Pagination'
import SearchInput from '../../../../components/ui/SearchInput'
import OrderDrawer from './OrderDrawer'
import ShipTogether from './ShipTogether'
import { useApi } from '../../../../hooks/useApi'
import PageHeader from '../../ui/PageHeader'
import AttentionStrip from '../../ui/AttentionStrip'
import StatusPills from '../../ui/StatusPills'
import RowActions from '../../ui/RowActions'
import { attentionItems, mainAction, orderPills, shipByText, summaryLine } from './ordersView'

export default function OrdersPage() {
  const [showCombine, setShowCombine] = useState(false)
  const { token } = useAuth()
  const section = useShopSection()
  const marketplace = section?.marketplace
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [error, setError] = useState('')
  const [pill, setPill] = useState('toShip')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('-placedAt')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const counts = useApi(`/api/temu/orders/counts?k=${refreshKey}`)
  // Orders Temu lets you ship in one package (for Needs attention).
  const combine = useApi('/api/temu/orders/temu-ship-together')
  const pills = orderPills(counts.data)
  const active = pills.find((p) => p.key === pill) || pills.find((p) => p.key === 'all')

  const fetchRows = async ({ quiet = false } = {}) => {
    if (!marketplace) return
    if (!quiet) setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/temu/orders${queryString({ ...active.query, q, sort, page, limit: 15 })}`, token)
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
      const res = await api.post('/api/temu/orders/sync', {}, token)
      const totalSynced = res.results?.reduce((acc, r) => acc + (r.synced || 0), 0) || 0
      const stillRunning = res.results?.some((r) => r.queued)
      setSyncMessage(stillRunning
        ? 'Sync is still running in the background. Orders refresh when it finishes.'
        : `Sync completed: ${totalSynced} orders updated from marketplaces`)
      setRefreshKey((k) => k + 1)
      setTimeout(() => setSyncMessage(''), 4000)
    } catch (err) {
      setError(`Sync failed: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(fetchRows, q ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketplace, active.key, q, sort, page, refreshKey])

  useSyncReload('orders', marketplace, () => {
    if (syncing) return
    fetchRows({ quiet: true })
    counts.refetch()
    if (selectedId?._id) {
      api.get(`/api/temu/orders/${selectedId._id}`, token).then(setSelectedId).catch(() => {})
    }
  })

  const openDetail = async (row) => {
    const full = await api.get(`/api/temu/orders/${row._id}`, token)
    setSelectedId(full)
  }

  if (!section) return <RequireShopSection />

  const now = new Date()
  const pick = (item) => (item.combine ? setShowCombine(true) : (setPill(item.pill), setPage(1)))

  return (
    <div className="space-y-3">
      <PageHeader
        title="Temu orders"
        summary={summaryLine(counts.data)}
        actions={(
          <>
            <Button onClick={() => setShowCombine(true)} variant="secondary">Ship together</Button>
            <Button onClick={handleSyncOrders} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Temu'}</Button>
          </>
        )}
      />
      {syncMessage && <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{syncMessage}</p>}
      <AttentionStrip items={attentionItems(counts.data, combine.data?.groups?.length || 0)} onPick={pick} />
      <StatusPills pills={pills} active={active.key} onChange={(k) => { setPill(k); setPage(1) }} />
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3">
          <SearchInput className="sm:max-w-md" value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Order, tracking, buyer or SKU…" />
        </div>
        <DataTable
          columns={[
            {
              key: 'externalOrderId',
              label: 'Order',
              sortable: true,
              sortKey: 'placedAt',
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
                const items = r.items || []
                if (!items.length) return '—'
                const units = items.reduce((t, i) => t + (Number(i.quantity) || 0), 0)
                return (
                  <span className="block max-w-[16rem]">
                    <span className="line-clamp-1">{items[0].title || items[0].sku}</span>
                    <span className="text-xs text-gray-500 dark:text-slate-400">{units} unit{units === 1 ? '' : 's'}{items.length > 1 ? ` · ${items.length - 1} more item${items.length > 2 ? 's' : ''}` : ''}</span>
                  </span>
                )
              },
            },
            { key: 'total', label: 'Total', sortable: true, sortKey: 'totals.total', render: (r) => (r.totals?.total ? `$${r.totals.total.toFixed(2)}` : '—') },
            {
              key: 'shipBy',
              label: 'Ship by',
              render: (r) => {
                const t = shipByText(r, now)
                return t ? <span className={t.late ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>{t.text}</span> : <span className="text-gray-400">—</span>
              },
            },
            { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status === 'paid' ? 'To ship' : r.status}</Badge> },
            { key: 'actions', label: '', render: (r) => { const a = mainAction(r); return <RowActions main={{ label: a.label, primary: a.primary, onClick: () => openDetail(r) }} /> } },
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
      </div>
      {selectedId && (
        <OrderDrawer
          order={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={async () => {
            const full = await api.get(`/api/temu/orders/${selectedId._id}`, token)
            setSelectedId(full)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
      {showCombine && <ShipTogether onClose={() => setShowCombine(false)} />}
    </div>
  )
}
