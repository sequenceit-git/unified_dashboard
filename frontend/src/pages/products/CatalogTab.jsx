import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api, queryString } from '../../lib/api'
import Badge, { statusColor } from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { Select } from '../../components/ui/Input'
import Pagination from '../../components/ui/Pagination'
import RowMenu from '../../components/ui/RowMenu'
import SearchInput from '../../components/ui/SearchInput'

const STATUSES = ['all', 'draft', 'active', 'archived']
const STOCK = [
  { value: 'all', label: 'All stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
]

export default function CatalogTab({ onEdit, onList, refreshKey }) {
  const { token, isAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [category, setCategory] = useState('all')
  const [stock, setStock] = useState('all')
  const [categories, setCategories] = useState([])
  const [sort, setSort] = useState('-createdAt')
  const [page, setPage] = useState(1)

  useEffect(() => {
    api.get('/api/products/categories', token).then(setCategories).catch(() => {})
  }, [token])

  const fetchRows = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(
        `/api/products${queryString({ q, status, category, stock, sort, page, limit: 15 })}`,
        token,
      )
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
  }, [q, status, category, stock, sort, page, refreshKey])

  const toggleSort = (key) => {
    setSort((s) => (s === key ? `-${key}` : key))
    setPage(1)
  }

  const remove = async (id) => {
    if (!window.confirm('Archive this product?')) return
    await api.del(`/api/products/${id}`, token)
    fetchRows()
  }

  return (
    <Card>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search title or SKU…" />
        <div className="flex gap-2">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} options={STATUSES.map((s) => ({ value: s, label: s }))} />
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
          <Select value={stock} onChange={(e) => { setStock(e.target.value); setPage(1) }} options={STOCK} />
        </div>
      </div>
      <DataTable
        columns={[
          { key: 'sku', label: 'SKU', sortable: true },
          { key: 'title', label: 'Title', sortable: true },
          { key: 'basePrice', label: 'Price', sortable: true, render: (r) => `$${r.basePrice}` },
          {
            key: 'stock', label: 'Stock', sortable: true,
            render: (r) => <span className={r.stock <= r.lowStockThreshold ? 'font-bold text-red-600' : ''}>{r.stock}</span>,
          },
          { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge> },
          {
            key: 'actions', label: '',
            render: (r) => isAdmin && (
              <span onClick={(e) => e.stopPropagation()}>
                <RowMenu
                  items={[
                    { label: 'Edit', onClick: () => onEdit(r) },
                    { label: 'List on shop', onClick: () => onList(r) },
                    { label: 'Archive', danger: true, onClick: () => remove(r._id) },
                  ]}
                />
              </span>
            ),
          },
        ]}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={fetchRows}
        sort={sort}
        onSort={toggleSort}
        onRowClick={onEdit}
      />
      <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />
    </Card>
  )
}
