import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api, queryString } from '../../lib/api'
import { MARKETPLACES } from '../../lib/marketplaces'
import Badge, { statusColor } from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { Input, Select } from '../../components/ui/Input'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import Tabs from '../../components/ui/Tabs'
import OrderDrawer from './OrderDrawer'

const STATUSES = ['all', 'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'refunded']

export default function OrdersPage() {
  const { token } = useAuth()
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [marketplace, setMarketplace] = useState('all')
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('-placedAt')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchRows = async () => {
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

  useEffect(() => {
    const t = setTimeout(fetchRows, q ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketplace, status, q, sort, page, refreshKey])

  const openDetail = async (row) => {
    const full = await api.get(`/api/orders/${row._id}`, token)
    setSelectedId(full)
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Orders</h1>
      <Tabs tabs={MARKETPLACES} active={marketplace} onChange={(m) => { setMarketplace(m); setPage(1) }} />
      <Card>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Order ID, tracking, buyer…" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} options={STATUSES.map((s) => ({ value: s, label: s }))} />
        </div>
        <DataTable
          columns={[
            { key: 'externalOrderId', label: 'Order' },
            { key: 'marketplace', label: 'Market' },
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
