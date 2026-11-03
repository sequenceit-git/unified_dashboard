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
    setSelected(await api.get(`/api/customers/${row._id}${queryString({ marketplace })}`, token))
  }

  if (!section) return <RequireShopSection />

  return (
    <div className="space-y-4">
      <h1 className="text-xl sm:text-2xl font-bold">{section.label} customers</h1>
      <Card>
        <div className="mb-3">
          <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search name, email, phone…" />
        </div>
        <DataTable
          columns={[
            {
              key: 'name',
              label: 'Name',
              render: (r) => {
                const username = r.identities?.[0]?.username || r.identities?.[0]?.externalBuyerId
                const showUsername = username && username !== r.name
                return (
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 truncate">{r.name || username || 'Customer'}</div>
                    {showUsername ? (
                      <div className="text-[11px] text-gray-500 font-mono truncate">@{username}</div>
                    ) : null}
                  </div>
                )
              },
            },
            {
              key: 'email',
              label: 'Email / Contact',
              render: (r) => {
                const username =
                  r.identities?.[0]?.username ||
                  r.identities?.[0]?.externalBuyerId ||
                  (!r.name?.includes(' ') ? r.name : '')
                const email =
                  r.email || (marketplace === 'ebay' && username ? `${username.toLowerCase()}@members.ebay.com` : '')
                const phone = r.phone
                const location = [r.address?.city, r.address?.state].filter(Boolean).join(', ')

                return (
                  <div className="space-y-0.5 text-xs min-w-0">
                    {email ? (
                      <div className="font-mono text-gray-900 dark:text-gray-200 truncate max-w-[260px]" title={email}>
                        {email}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-gray-500 dark:text-gray-400 text-[11px]">
                      {phone ? (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <span className="opacity-70">📞</span>
                          <span>{phone}</span>
                        </span>
                      ) : null}
                      {location ? (
                        <span className="inline-flex items-center gap-1 truncate max-w-[160px]" title={location}>
                          <span className="opacity-70">📍</span>
                          <span>{location}</span>
                        </span>
                      ) : null}
                      {!email && !phone && !location && <span className="text-gray-400">—</span>}
                    </div>
                  </div>
                )
              },
            },
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
