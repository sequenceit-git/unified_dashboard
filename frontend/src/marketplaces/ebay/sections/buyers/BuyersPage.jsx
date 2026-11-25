import { useEffect, useState } from 'react'
import { getShop } from '../../..'
import { useAuth } from '../../../../auth/AuthContext'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import { api, queryString } from '../../../../lib/api'
import DataTable from '../../../../components/ui/DataTable'
import Pagination from '../../../../components/ui/Pagination'
import SearchInput from '../../../../components/ui/SearchInput'
import CustomerDrawer from './CustomerDrawer'
import PageHeader from '../../ui/PageHeader'
import StatusPills from '../../ui/StatusPills'
import { buyerPills, buyerSummary, feedbackFrom } from './buyersView'
import { useApi } from '../../../../hooks/useApi'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import Button from '../../../../components/ui/Button'
import Badge, { statusColor } from '../../../../components/ui/Badge'
import { ErrorState } from '../../../../components/ui/Feedback'
import ActionButton from '../../ActionButton'
import ReconnectNotice from '../../ReconnectNotice'
import { formatCell } from '../../sectionFormat'

const FEEDBACK = '/api/ebay/sections/buyers'

/**
 * eBay buyers: All / Repeat buyers (with the buyer drawer: contact, orders and the feedback they
 * left, with Reply), feedback received (Reply) and orders waiting for your feedback (Leave feedback).
 * The app's route already checks access to this section (gated route).
 */
export default function BuyersPage() {
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
  const [notice, setNotice] = useState('')
  const [fresh, setFresh] = useState(0)
  const fb = useApi(`${FEEDBACK}${fresh ? `?refresh=1&n=${fresh}` : ''}`)
  const fbTable = (id) => (fb.data?.tables || []).find((t) => t.id === id)
  const received = fbTable('received')
  const awaiting = fbTable('awaiting')
  // eBay is asked for 50 entries at a time: a full page reads "50+".
  const countOf = (t) => (t && !t.error ? (t.rows.length >= 50 ? '50+' : t.rows.length) : null)
  const fbCounts = fb.data ? { received: countOf(received), awaiting: countOf(awaiting) } : null
  const positive = (fb.data?.summary || []).find((s) => s.label === 'Positive feedback')?.value ?? null
  // Reply / Leave feedback: the section's own actions; the feedback reloads fresh after one.
  const run = async (action, row, value) => {
    try {
      const res = await api.post(`${FEEDBACK}/${action.id}`, { id: row.id, ...(value !== undefined ? { value } : {}) }, token)
      setNotice(res?.message || `${action.label}: done.`)
      setFresh(Date.now())
      return res || {}
    } catch (err) {
      return { error: err.message }
    }
  }

  const fetchRows = async () => {
    if (!marketplace) return
    setLoading(true)
    setError('')
    setOpenError('')
    try {
      const res = await api.get(`/api/ebay/buyers${queryString({ q, sort, page, limit: 15, repeat: pill === 'repeat' ? 1 : undefined })}`, token)
      setRows(res.data)
      setCounts(res.counts || null)
      setMeta({ page: res.page, pages: res.pages, total: res.total })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Only All / Repeat change the buyer list (not the feedback pills).
  const repeatOnly = pill === 'repeat'
  useEffect(() => {
    const t = setTimeout(fetchRows, q ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketplace, q, sort, page, repeatOnly])

  // After an orders sync: buyers and feedback update (the cached address again after a forced Refresh).
  useSyncReload(['orders'], 'ebay', () => { if (fresh) setFresh(0); else fb.refetch(); fetchRows() })

  const open = async (row) => {
    setOpenError('')
    try {
      setSelected(await api.get(`/api/ebay/buyers/${row._id}`, token))
    } catch (e) {
      setOpenError(e.message)
    }
  }

  if (!section) return <RequireShopSection />

  return (
    <div className="space-y-3">
      <ReconnectNotice />
      <PageHeader
        title="eBay buyers"
        summary={[buyerSummary(counts, q, positive), fb.data?.loadedAt && `updated ${new Date(fb.data.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join(' · ')}
        actions={<Button variant="secondary" disabled={fb.loading} onClick={() => { setNotice(''); setFresh(Date.now()); fetchRows() }}>{fb.loading ? 'Refreshing…' : 'Refresh'}</Button>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusPills pills={buyerPills(counts, fbCounts)} active={pill} onChange={(k) => { setPill(k); setPage(1); setNotice('') }} />
        {(pill === 'all' || pill === 'repeat') && <div className="w-full sm:w-72"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search name, email, phone…" /></div>}
      </div>
      {openError && <p className="text-sm text-rose-600 dark:text-rose-400">{openError}</p>}
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      {fb.error && (pill === 'received' || pill === 'awaiting') && <ErrorState message={fb.error} onRetry={fb.refetch} />}
      {(pill === 'received' || pill === 'awaiting') && !(fb.error && !fb.data) && (() => {
        const t = pill === 'received' ? received : awaiting
        const tiles = pill === 'received' ? (fb.data?.summary || []).filter((s) => s.tab === 'Feedback') : []
        return (
          <div className="space-y-3">
            {tiles.length > 0 && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {tiles.map((s) => <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">{s.label}</p><p className="mt-1 text-lg font-semibold">{s.type === 'percent' ? `${Number(s.value || 0).toFixed(1)}%` : Number(s.value || 0).toLocaleString()}</p></div>)}
              </div>
            )}
            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              {t?.note && <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">{t.note}</p>}
              <DataTable
                columns={pill === 'received'
                  ? [
                    { key: 'date', label: 'Date', render: (r) => (r.date ? new Date(r.date).toLocaleDateString() : '—') },
                    { key: 'buyer', label: 'Buyer' },
                    { key: 'rating', label: 'Rating', render: (r) => <Badge color={statusColor(r.rating)}>{r.rating}</Badge> },
                    { key: 'comment', label: 'Comment', render: (r) => <span className="block max-w-[320px]"><span className="block">{r.comment}</span>{r.item && <span className="block truncate text-xs text-gray-500 dark:text-slate-400">{r.item}</span>}{r.reply && <span className="block text-xs text-gray-500 dark:text-slate-400">Your reply: {r.reply}</span>}</span> },
                    { key: 'actions', label: '', render: (r) => <span onClick={(e) => e.stopPropagation()}>{(r.actions || []).map((a) => <ActionButton key={a.id} action={a} row={r} run={run} onDetail={() => {}} />)}</span> },
                  ]
                  : [
                    { key: 'item', label: 'Item', render: (r) => <span className="block max-w-[360px]"><span className="block truncate font-medium">{r.item || '—'}</span><span className="text-xs text-gray-500 dark:text-slate-400">Listing {r.listingId}</span></span> },
                    { key: 'price', label: 'Price', render: (r) => (r.price ? formatCell('money', r.price) : '—') },
                    { key: 'actions', label: '', render: (r) => <span onClick={(e) => e.stopPropagation()}>{(r.actions || []).map((a) => <ActionButton key={a.id} action={a} row={r} run={run} onDetail={() => {}} />)}</span> },
                  ]}
                rows={(t?.rows || []).map((r) => ({ ...r, _key: r.id }))}
                loading={fb.loading && !fb.data}
                error={t?.error || ''}
                onRetry={() => setFresh(Date.now())}
                rowKey="_key"
              />
            </div>
          </div>
        )
      })()}
      {(pill === 'all' || pill === 'repeat') && <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
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
      </div>}
      {selected && (
        <CustomerDrawer
          customer={selected}
          feedback={feedbackFrom(received && !received.error ? received.rows : [], selected)}
          feedbackError={received?.error || fb.error || ''}
          run={run}
          notice={notice}
          onClose={() => setSelected(null)}
          onSaved={async () => {
            setSelected(await api.get(`/api/ebay/buyers/${selected._id}`, token))
            fetchRows()
          }}
        />
      )}
    </div>
  )
}
