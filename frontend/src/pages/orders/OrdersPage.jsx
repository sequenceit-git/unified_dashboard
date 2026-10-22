import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import RequireShopSection from '../../components/RequireShopSection'
import { useShopSection } from '../../hooks/useShopSection'
import { api, queryString } from '../../lib/api'
import { marketplaceLabel } from '../../lib/marketplaces'
import Badge, { statusColor } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { Select } from '../../components/ui/Input'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import OrderDrawer from './OrderDrawer'

const STATUSES = ['all', 'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded']

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
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('-placedAt')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchRows = async () => {
    if (!marketplace) return
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/orders${queryString({ marketplace, status, q, sort, page, limit: 15 })}`, token)
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
      const res = await api.post('/api/orders/sync', { marketplace }, token)
      const totalSynced = res.results?.reduce((acc, r) => acc + (r.synced || 0), 0) || 0
      setSyncMessage(`Sync completed: ${totalSynced} orders updated from marketplaces`)
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
  }, [marketplace, status, q, sort, page, refreshKey])

  const openDetail = async (row) => {
    const full = await api.get(`/api/orders/${row._id}`, token)
    setSelectedId(full)
  }

  if (!section) return <RequireShopSection />

  return (
    <div className="space-y-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">{section.label} orders</h1>
          {syncMessage && <p className="text-xs text-emerald-600 font-medium">{syncMessage}</p>}
        </div>
        <Button onClick={handleSyncOrders} disabled={syncing} size="sm">
          {syncing ? 'Syncing...' : `Sync ${section.label}`}
        </Button>
      </div>
      <Card>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">

          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Order ID, tracking, buyer…" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} options={STATUSES.map((s) => ({ value: s, label: s }))} />
        </div>
        <DataTable
          columns={[
            { key: 'externalOrderId', label: 'Order' },
            { key: 'marketplace', label: 'Market', render: (row) => marketplaceLabel(row.marketplace) },
            { key: 'buyer', label: 'Buyer', render: (r) => r.buyer?.name || '—' },
            { key: 'total', label: 'Total', sortable: true, sortKey: 'totals.total', render: (r) => `$${r.totals?.total?.toFixed(2)}` },
            { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge> },
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
            const full = await api.get(`/api/orders/${selectedId._id}`, token)
            setSelectedId(full)
            setRefreshKey((k) => k + 1)
          }}
        />
      )}
    </div>
  )
}
