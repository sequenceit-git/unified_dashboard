import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api, queryString } from '../../../../lib/api'
import Card from '../../../../components/ui/Card'
import DataTable from '../../../../components/ui/DataTable'
import Pagination from '../../../../components/ui/Pagination'
import RowActions from '../../ui/RowActions'
import SearchInput from '../../../../components/ui/SearchInput'
import { useSyncReload } from '../../../../hooks/useLiveEvents'

/** Products and their stock; `stock` filters to low or out of stock. */
export default function StockTab({ marketplace, stock = 'all', onAdjust, onHistory, onTotal, refreshKey }) {
  const { token } = useAuth()
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('stock')
  const [page, setPage] = useState(1)
  const requestId = useRef(0)

  useEffect(() => {
    setPage(1)
    setRows([])
    setLoading(true)
  }, [marketplace, stock])

  const fetchRows = async ({ quiet = false } = {}) => {
    const id = ++requestId.current
    if (!quiet) setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/ebay/listings${queryString({ q, sort, page, limit: 15, listed: 1, ...(stock !== 'all' ? { stock } : {}) })}`, token)
      if (id !== requestId.current) return
      setRows(res.data)
      setMeta({ page: res.page, pages: res.pages, total: res.total })
      if (stock === 'all' && !q) onTotal?.(res.total)
      // A row that left the filter (e.g. restocked) can empty the last page: go back one.
      if (res.page > 1 && !res.data.length) setPage(Math.max(1, res.pages))
    } catch (e) {
      if (id !== requestId.current) return
      setError(e.message)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(fetchRows, q ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketplace, stock, q, sort, page, refreshKey])

  useSyncReload(['listings', 'orders'], marketplace === 'all' ? '' : marketplace, () => fetchRows({ quiet: true }))

  return (
    <Card>
      <div className="mb-3">
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search SKU or title…" />
      </div>
      <DataTable
        columns={[
          {
            key: 'image',
            label: 'Image',
            render: (r) => {
              const img = Array.isArray(r.images) && r.images[0]
              return (
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-slate-800 dark:bg-slate-900">
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
          { key: 'title', label: 'Title' },
          {
            key: 'stock', label: 'Stock', sortable: true,
            render: (r) => <span className={r.stock <= r.lowStockThreshold ? 'font-bold text-red-600' : ''}>{r.stock}</span>,
          },
          { key: 'lowStockThreshold', label: 'Threshold' },
          {
            key: 'adjust', label: '',
            render: (r) => (
              <span onClick={(e) => e.stopPropagation()}>
                <RowActions main={{ label: 'Adjust', primary: r.stock <= r.lowStockThreshold, onClick: () => onAdjust(r) }} menu={[{ label: 'History', onClick: () => onHistory(r) }]} />
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
