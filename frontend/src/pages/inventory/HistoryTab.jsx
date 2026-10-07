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
  const [page, setPage] = useState(1)

  const fetchRows = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/inventory/logs${queryString({ reason, page, limit: 15 })}`, token)
      setRows(res.data)
      setMeta({ page: res.page, pages: res.pages, total: res.total })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchRows() }, [reason, page, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <div className="mb-3 max-w-xs">
        <Select value={reason} onChange={(e) => { setReason(e.target.value); setPage(1) }} options={REASONS.map((r) => ({ value: r, label: r }))} />
      </div>
      <DataTable
        columns={[
          { key: 'createdAt', label: 'When', render: (r) => new Date(r.createdAt).toLocaleString() },
          { key: 'change', label: 'Change', render: (r) => <span className={r.change < 0 ? 'text-red-600' : 'text-green-700'}>{r.change > 0 ? `+${r.change}` : r.change}</span> },
          { key: 'stockAfter', label: 'After', render: (r) => `${r.stockBefore} → ${r.stockAfter}` },
          { key: 'reason', label: 'Reason', render: (r) => <Badge>{r.reason}</Badge> },
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
