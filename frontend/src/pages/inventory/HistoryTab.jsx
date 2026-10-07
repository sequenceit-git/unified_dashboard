import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api, queryString } from '../../lib/api'
import Badge from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { Select } from '../../components/ui/Input'
import Pagination from '../../components/ui/Pagination'

const REASONS = ['all', 'sale', 'return', 'manual', 'sync', 'restock']

export default function HistoryTab({ refreshKey }) {
  const { token } = useAuth()
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('all')
  const [direction, setDirection] = useState('all')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)

  const fetchRows = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/inventory/logs${queryString({ reason, direction, q, from, to: to ? `${to}T23:59:59.999Z` : '', page, limit: 15 })}`, token)
      setRows(res.data)
      setMeta({ page: res.page, pages: res.pages, total: res.total })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRows() }, [reason, direction, q, from, to, page, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="SKU, product, variant…" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        <Select value={reason} onChange={(e) => { setReason(e.target.value); setPage(1) }} options={REASONS.map((r) => ({ value: r, label: r }))} />
        <Select value={direction} onChange={(e) => { setDirection(e.target.value); setPage(1) }} options={[{ value: 'all', label: 'All changes' }, { value: 'increase', label: 'Increases' }, { value: 'decrease', label: 'Decreases' }]} />
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1) }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" aria-label="From date" />
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1) }} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" aria-label="To date" />
      </div>
      <DataTable
        columns={[
          { key: 'createdAt', label: 'When', render: (r) => new Date(r.createdAt).toLocaleString() },
          { key: 'product', label: 'Product', render: (r) => r.productId ? `${r.productId.sku} · ${r.productId.title}` : '—' },
          { key: 'variantSku', label: 'Variant', render: (r) => r.variantSku || '—' },
          { key: 'change', label: 'Change', render: (r) => <span className={r.change < 0 ? 'text-red-600' : 'text-green-700'}>{r.change > 0 ? `+${r.change}` : r.change}</span> },
          { key: 'stockAfter', label: 'After', render: (r) => `${r.stockBefore} → ${r.stockAfter}` },
          { key: 'reason', label: 'Reason', render: (r) => <Badge>{r.reason}</Badge> },
          { key: 'createdBy', label: 'By', render: (r) => r.createdBy?.name || r.createdBy?.email || 'System' },
        ]}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={fetchRows}
      />
      <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />
    </Card>
  )
}
