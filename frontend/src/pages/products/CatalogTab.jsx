import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api, queryString } from '../../lib/api'
import Badge, { statusColor } from '../../components/ui/Badge'
import DataTable from '../../components/ui/DataTable'
import { Select } from '../../components/ui/Input'
import Pagination from '../../components/ui/Pagination'
import RowMenu from '../../components/ui/RowMenu'
import SearchInput from '../../components/ui/SearchInput'
import { EmptyState } from '../../components/ui/Feedback'

const STATUSES = ['all', 'draft', 'active', 'archived']
const SOURCES = [
  { value: 'all', label: 'All sources' },
  { value: 'research_bot', label: 'AI Agent (Bot)' },
  { value: 'manual', label: 'Manual' },
  { value: 'bulk_upload', label: 'Bulk upload' },
  { value: 'marketplace_sync', label: 'Marketplace sync' },
]
const STOCK = [
  { value: 'all', label: 'All stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
]

export default function CatalogTab({ onEdit, onList, refreshKey, shopIds = [], disabled = false, disabledMessage = '' }) {
  const { token, isAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [source, setSource] = useState('all')
  const [category, setCategory] = useState('all')
  const [stock, setStock] = useState('all')
  const [categories, setCategories] = useState([])
  const [sort, setSort] = useState('-createdAt')
  const [page, setPage] = useState(1)

  useEffect(() => {
    api.get('/api/products/categories', token).then(setCategories).catch(() => {})
  }, [token])

  const fetchRows = async () => {
    if (disabled) return
    setLoading(true)
    setError('')
    try {
      const base = {
        q,
        status,
        category,
        stock,
        sort,
        page,
        limit: 15,
        ...(source !== 'all' ? { source } : {}),
      }
      let res
      if (shopIds.length <= 1) {
        res = await api.get(
          `/api/products${queryString({ ...base, shop: shopIds[0] })}`,
          token,
        )
      } else {
        const parts = await Promise.all(
          shopIds.map((id) =>
            api.get(`/api/products${queryString({ ...base, shop: id })}`, token),
          ),
        )
        const seen = new Map()
        for (const p of parts) {
          for (const r of p.data || []) {
            if (!seen.has(r._id)) seen.set(r._id, r)
          }
        }
        res = { data: [...seen.values()], page: 1, pages: 1, total: seen.size }
      }
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
  }, [q, status, source, category, stock, sort, page, refreshKey, disabled, shopIds.join(',')])

  const toggleSort = (key) => {
    setSort((s) => (s === key ? `-${key}` : key))
    setPage(1)
  }

  const remove = async (id) => {
    if (!window.confirm('Archive this product?')) return
    await api.del(`/api/products/${id}`, token)
    fetchRows()
  }

  if (disabled) return <EmptyState message={disabledMessage || 'Nothing to show'} />

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search title or SKU…" />
        <div className="flex flex-wrap gap-2">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} options={STATUSES.map((s) => ({ value: s, label: s }))} />
          <Select value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }} options={SOURCES} />
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]} />
          <Select value={stock} onChange={(e) => { setStock(e.target.value); setPage(1) }} options={STOCK} />
        </div>
      </div>
      <DataTable
        columns={[
          {
            key: 'image',
            label: 'Image',
            render: (r) => {
              const img = Array.isArray(r.images) && r.images[0]
              return (
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                  {img ? (
                    <img
                      src={img}
                      alt={r.title}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  ) : (
                    <span className="text-[10px] text-gray-400">No img</span>
                  )}
                </div>
              )
            },
          },
          { key: 'sku', label: 'SKU', sortable: true },
          { key: 'title', label: 'Title', sortable: true },
          { key: 'basePrice', label: 'Price', sortable: true, render: (r) => `$${r.basePrice}` },
          {
            key: 'stock', label: 'Stock', sortable: true,
            render: (r) => <span className={r.stock <= r.lowStockThreshold ? 'font-bold text-red-600' : ''}>{r.stock}</span>,
          },
          {
            key: 'source',
            label: 'Source',
            render: (r) => {
              const isAi = r.source === 'research_bot'
              return (
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                    isAi
                      ? 'bg-purple-50 text-purple-700 ring-1 ring-inset ring-purple-700/20'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {isAi ? 'AI Agent' : r.source || 'Manual'}
                </span>
              )
            },
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
    </div>
  )
}
