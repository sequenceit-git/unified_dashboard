import { useEffect, useState } from 'react'
import { getShop } from '../../..'
import { useAuth } from '../../../../auth/AuthContext'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import { api, queryString } from '../../../../lib/api'
import ShopSectionGate from '../../../../components/ShopSectionGate'
import DataTable from '../../../../components/ui/DataTable'
import Pagination from '../../../../components/ui/Pagination'
import SearchInput from '../../../../components/ui/SearchInput'
import CustomerDrawer from './CustomerDrawer'
import PageHeader from '../../ui/PageHeader'
import StatusPills from '../../ui/StatusPills'
import { customerPills, customerSummary } from './customersView'

export default function CustomersPage() {
  return <ShopSectionGate sectionId="customers"><Customers /></ShopSectionGate>
}

function Customers() {
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
  const [pill, setPill] = useState('all')
  const [counts, setCounts] = useState(null)
  const [openError, setOpenError] = useState('')

  const fetchRows = async () => {
    if (!marketplace) return
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/temu/customers${queryString({ q, sort, page, limit: 15, repeat: pill === 'repeat' ? 1 : undefined })}`, token)
      setRows(res.data)
      setCounts(res.counts || null)
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
  }, [marketplace, q, sort, page, pill])

  const open = async (row) => {
    setOpenError('')
    try {
      setSelected(await api.get(`/api/temu/customers/${row._id}`, token))
    } catch (e) {
      setOpenError(e.message)
    }
  }

  if (!section) return <RequireShopSection />

  return (
    <div className="space-y-3">
      <PageHeader title="Temu customers" summary={customerSummary(counts)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusPills pills={customerPills(counts)} active={pill} onChange={(k) => { setPill(k); setPage(1) }} />
        <div className="w-full sm:w-72"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search name, email, phone…" /></div>
      </div>
      {openError && <p className="text-sm text-rose-600 dark:text-rose-400">{openError}</p>}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
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
                  r.email || (getShop(marketplace)?.buyer?.email && username ? getShop(marketplace).buyer.email(username) : '')
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
            { key: 'orderCount', label: 'Orders', sortable: true, render: (r) => <span>{r.orderCount}{r.orderCount >= 2 && <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">repeat</span>}</span> },
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
      </div>
      {selected && (
        <CustomerDrawer
          customer={selected}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(await api.get(`/api/temu/customers/${selected._id}`, token))
            fetchRows()
          }}
        />
      )}
    </div>
  )
}
