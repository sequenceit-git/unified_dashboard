import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import RequireShopSection from '../../components/RequireShopSection'
import { useShopSection } from '../../hooks/useShopSection'
import { api, queryString } from '../../lib/api'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import Pagination from '../../components/ui/Pagination'
import SearchInput from '../../components/ui/SearchInput'
import CustomerDrawer from './CustomerDrawer'

export default function CustomersPage() {
  const { token } = useAuth()
  const section = useShopSection()
  const marketplace = section?.marketplace
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('-lastOrderAt')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)

  const fetchRows = async () => {
    if (!marketplace) return
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/customers${queryString({ marketplace, q, sort, page, limit: 15 })}`, token)
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
  }, [marketplace, q, sort, page])

  const open = async (row) => {
    setSelected(await api.get(`/api/customers/${row._id}`, token))
  }

  if (!section) return <RequireShopSection />

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">{section.label} customers</h1>
      <Card>
        <div className="mb-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search name, email, phone…" />
        </div>
        <DataTable
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'email', label: 'Email' },
            { key: 'orderCount', label: 'Orders', sortable: true },
            { key: 'totalSpent', label: 'Spent', sortable: true, render: (r) => `$${r.totalSpent?.toFixed(2)}` },
            { key: 'lastOrderAt', label: 'Last order', sortable: true, render: (r) => r.lastOrderAt && new Date(r.lastOrderAt).toLocaleDateString() },
          ]}
          rows={rows}
          loading={loading}
          error={error}
          onRetry={fetchRows}
          sort={sort}
          onSort={(k) => { setSort((s) => (s === k ? `-${k}` : k)); setPage(1) }}
          onRowClick={open}
        />
        <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />
      </Card>
      {selected && (
        <CustomerDrawer
          customer={selected}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(await api.get(`/api/customers/${selected._id}`, token))
            fetchRows()
          }}
        />
      )}
    </div>
  )
}
