import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api, queryString } from '../../lib/api'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import Pagination from '../../components/ui/Pagination'
import RowMenu from '../../components/ui/RowMenu'
import SearchInput from '../../components/ui/SearchInput'

export default function StockTab({ onAdjust, refreshKey }) {
  const { token, isAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('stock')
  const [page, setPage] = useState(1)

  const fetchRows = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/products${queryString({ q, sort, page, limit: 15 })}`, token)
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
  }, [q, sort, page, refreshKey])

  return (
    <Card>
      <div className="mb-3">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search SKU…" />
      </div>
      <DataTable
        columns={[
          { key: 'sku', label: 'SKU', sortable: true },
          { key: 'title', label: 'Title' },
          {
            key: 'stock', label: 'Stock', sortable: true,
            render: (r) => <span className={r.stock <= r.lowStockThreshold ? 'font-bold text-red-600' : ''}>{r.stock}</span>,
          },
          { key: 'lowStockThreshold', label: 'Threshold' },
          {
            key: 'adjust', label: '',
            render: (r) => isAdmin && (
              <span onClick={(e) => e.stopPropagation()}>
                <RowMenu items={[{ label: 'Adjust stock', onClick: () => onAdjust(r) }]} />
              </span>
            ),
          },
        ]}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={fetchRows}
        sort={sort}
        onSort={(k) => { setSort((s) => (s === k ? `-${k}` : k)); setPage(1) }}
      />
      <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />
    </Card>
  )
}
