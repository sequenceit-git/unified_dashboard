/**
 * eBay orders: to ship first (with eBay's ship-by date), needs attention (late orders, returns
 * waiting), state pills with counts, one main button per row (Add tracking / Details) and the
 * order drawer. Search can come from the link (?q=), e.g. from the Overview.
 */
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import PageHeader from '../../ui/PageHeader'
import AttentionStrip from '../../ui/AttentionStrip'
import StatusPills from '../../ui/StatusPills'
import RowActions from '../../ui/RowActions'
import OrderDrawer from './OrderDrawer'
import { attentionItems, mainAction, orderPills, shipByText, summaryLine } from './ordersView'

export default function OrdersPage() {
  const { token } = useAuth()
  const section = useShopSection()
  const marketplace = section?.marketplace
  const location = useLocation()
  const navigateTo = useNavigate()
  const linkQ = new URLSearchParams(location.search).get('q') || ''
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [counts, setCounts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState({ text: '', error: false })
  const [error, setError] = useState('')
  // A search from the link shows every state, so the order is found whatever its status.
  const [pill, setPill] = useState(linkQ ? 'all' : 'toShip')
  const [q, setQ] = useState(linkQ)
  const [sort, setSort] = useState('-placedAt')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // A new link search (?q=) while on the page: search it across every state.
  useEffect(() => {
    if (linkQ === q) return
    setQ(linkQ)
    if (linkQ) setPill('all')
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkQ])

  const pills = orderPills(counts)
  // A pill that disappears (e.g. no more late orders) falls back to To ship.
  const active = pills.some((p) => p.key === pill) ? pill : 'toShip'
  const query = pills.find((p) => p.key === active)?.query || {}

  const search = (v) => {
    setQ(v)
    setPage(1)
    navigateTo({ search: v ? `?q=${encodeURIComponent(v)}` : '' }, { replace: true })
  }

  const fetchCounts = async () => {
    if (!marketplace) return
    try {
      setCounts(await api.get('/api/ebay/orders/counts', token))
    } catch {
      setCounts((c) => c)
    }
  }

  const fetchRows = async ({ quiet = false } = {}) => {
    if (!marketplace) return
    if (!quiet) setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/ebay/orders${queryString({ ...query, q, sort, page, limit: 15 })}`, token)
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
    setNotice({ text: '', error: false })
    try {
      const res = await api.post('/api/ebay/orders/sync', {}, token)
      const totalSynced = res.results?.reduce((acc, r) => acc + (r.synced || 0), 0) || 0
      const stillRunning = res.results?.some((r) => r.queued)
      setNotice({ text: stillRunning ? 'Sync is still running in the background. Orders refresh when it finishes.' : `Sync completed: ${totalSynced} orders updated from eBay`, error: false })
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setNotice({ text: `Sync failed: ${err.message}`, error: true })
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    fetchCounts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketplace, refreshKey])

  useEffect(() => {
    const t = setTimeout(fetchRows, q ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketplace, active, q, sort, page, refreshKey])

  useSyncReload('orders', marketplace, () => {
    if (syncing) return
    fetchRows({ quiet: true })
    fetchCounts()
    if (selected?.order?._id) {
      api.get(`/api/ebay/orders/${selected.order._id}`, token).then((order) => setSelected((s) => (s ? { ...s, order } : s))).catch(() => {})
    }
  })

  const open = async (row, focus = '') => {
    try {
      setSelected({ order: await api.get(`/api/ebay/orders/${row._id}`, token), focus })
    } catch (e) {
      setNotice({ text: e.message, error: true })
    }
  }

  if (!section) return <RequireShopSection />

  const now = new Date()
  return (
    <div className="space-y-3">
      <PageHeader
        title="eBay orders"
        summary={summaryLine(counts)}
        actions={<Button onClick={handleSyncOrders} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync eBay'}</Button>}
      />
      {notice.text && <p className={`text-sm ${notice.error ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{notice.text}</p>}
      <AttentionStrip
        items={attentionItems(counts)}
        onPick={(i) => {
          if (i.returns) navigateTo('/ebay/returns-cases')
          else { setPill(i.pill); setPage(1) }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusPills pills={pills} active={active} onChange={(k) => { setPill(k); setPage(1) }} />
        <div className="w-full sm:w-72"><SearchInput value={q} onChange={search} placeholder="Order, buyer, item, tracking…" /></div>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <DataTable
          columns={[
            { key: 'placedAt', label: 'Order', sortable: true, render: (r) => <span><span className="font-medium">{r.externalOrderId}</span>{r.placedAt && <span className="block text-xs text-gray-500 dark:text-slate-400">{new Date(r.placedAt).toLocaleDateString()}</span>}</span> },
            { key: 'buyer', label: 'Buyer', render: (r) => <span><span>{r.buyer?.name || '—'}</span>{r.buyer?.username && <span className="block font-mono text-[11px] text-gray-500 dark:text-slate-400">@{r.buyer.username}</span>}</span> },
            {
              key: 'items',
              label: 'Items',
              render: (r) => {
                const items = r.items || []
                const units = items.reduce((t, it) => t + (Number(it.quantity) || 0), 0)
                return <span className="block max-w-[260px]"><span className="block truncate">{items[0]?.title || '—'}</span>{(items.length > 1 || units > 1) && <span className="text-xs text-gray-500 dark:text-slate-400">{items.length > 1 ? `+${items.length - 1} more · ` : ''}{units} units</span>}</span>
              },
            },
            { key: 'total', label: 'Total', sortable: true, sortKey: 'totals.total', render: (r) => `$${r.totals?.total?.toFixed(2)}` },
            { key: 'shipBy', label: 'Ship by', render: (r) => { const t = shipByText(r, now); return t ? <span className={t.late ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>{t.text}</span> : <span className="text-gray-400">—</span> } },
            { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge> },
            {
              key: 'actions',
              label: '',
              render: (r) => {
                const main = mainAction(r)
                return <RowActions main={{ label: main.label, primary: main.primary, onClick: () => open(r, main.id) }} menu={main.id === 'ship' ? [{ label: 'Details', onClick: () => open(r) }] : []} />
              },
            },
          ]}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={fetchRows}
          sort={sort}
          onSort={(k) => { setSort((s) => (s === k ? `-${k}` : k)); setPage(1) }}
          onRowClick={(r) => open(r)}
        />
        <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />
      </div>
      {selected && (
        <OrderDrawer
          key={selected.order._id}
          order={selected.order}
          focus={selected.focus}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            const order = await api.get(`/api/ebay/orders/${selected.order._id}`, token)
            setSelected((s) => (s ? { ...s, order } : s))
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
