/**
 * eBay Payouts: funds on top (available, processing, on hold), a pill per list (payouts,
 * transactions, order earnings, eBay bill) with that list's totals, and a payout drawer with its
 * transactions.
 */
import { useState } from 'react'
import { queryString } from '../../../../lib/api'
import { useApi } from '../../../../hooks/useApi'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import ShopSectionGate from '../../../../components/ShopSectionGate'
import Button from '../../../../components/ui/Button'
import DataTable from '../../../../components/ui/DataTable'
import { ErrorState, Spinner } from '../../../../components/ui/Feedback'
import PageHeader from '../../ui/PageHeader'
import StatusPills from '../../ui/StatusPills'
import Drawer from '../../ui/Drawer'
import SectionTable from '../../SectionTable'
import ReconnectNotice from '../../ReconnectNotice'
import { formatCell } from '../../sectionFormat'
import Pagination from '../../../../components/ui/Pagination'
import { PAYOUT_PILLS, fundsTiles, pageOf, payoutSummary, tilesFor } from './payoutsView'

const BASE = '/api/ebay/sections/payouts'
const MUTED = 'text-gray-500 dark:text-slate-400'
const tileValue = (s) => (s.type === 'money' ? formatCell('money', s.value) : s.type === 'percent' ? `${Number(s.value || 0).toFixed(1)}%` : s.type === 'text' ? String(s.value ?? '—') : Number(s.value || 0).toLocaleString())

export default function PayoutsPage() {
  return <ShopSectionGate sectionId="payouts"><Payouts /></ShopSectionGate>
}

function Tiles({ items, strong }) {
  if (!items.length) return null
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((s) => (
        <div key={`${s.tab}-${s.label}`} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className={`text-xs uppercase tracking-wide ${MUTED}`}>{s.label}</p>
          <p className={`mt-1 font-semibold ${strong ? 'text-xl' : 'text-base'}`}>{tileValue(s)}</p>
        </div>
      ))}
    </div>
  )
}

function PayoutDrawer({ row, onClose }) {
  const { data, loading, error, refetch } = useApi(`${BASE}/payout${queryString({ id: row.id })}`)
  return (
    <Drawer title={data?.title || `Payout ${row.payoutId || row.id}`} subtitle={row.date ? new Date(row.date).toLocaleDateString() : ''} onClose={onClose} footer={<span className="ml-auto"><Button size="sm" variant="secondary" onClick={onClose}>Close</Button></span>}>
      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {data?.summary?.length > 0 && <div className="mb-4"><Tiles items={data.summary} /></div>}
      {(data?.tables || []).map((t) => <SectionTable key={t.id} table={t} canAct={false} />)}
    </Drawer>
  )
}

function Payouts() {
  const [pill, setPill] = useState('payouts')
  const [page, setPage] = useState(1)
  const [fresh, setFresh] = useState(0)
  const [open, setOpen] = useState(null)
  const { data, loading, error, refetch } = useApi(`${BASE}${fresh ? `?refresh=1&n=${fresh}` : ''}`)
  // Live reloads use the cached address again (a forced Refresh must not make every sync event call eBay).
  useSyncReload(['orders'], 'ebay', () => (fresh ? setFresh(0) : refetch()))

  const tables = data?.tables || []
  const current = PAYOUT_PILLS.find((p) => p.key === pill) || PAYOUT_PILLS[0]
  const table = tables.find((t) => t.id === current.table)
  // Lists show 15 rows a page, as before.
  const paged = pageOf(table?.rows, page)
  const hasDetail = (r) => (r.actions || []).some((a) => a.id === 'payout')
  const columns = (table?.columns || [])
    .filter((c) => c.type !== 'link' || c.key)
    .map((c) => ({ key: c.key, label: c.label, render: (r) => (c.type === 'link' ? (r[c.key] ? <a href={r[c.key]} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">Open ↗</a> : null) : formatCell(c.type, r[c.key])) }))
  if (current.table === 'payouts') {
    columns.push({ key: 'actions', label: '', render: (r) => (hasDetail(r) ? <span onClick={(e) => e.stopPropagation()}><Button size="sm" variant="secondary" onClick={() => setOpen(r)}>Transactions</Button></span> : null) })
  }

  return (
    <div className="space-y-3">
      <ReconnectNotice />
      <PageHeader
        title="eBay payouts"
        summary={[payoutSummary(data?.summary), data?.loadedAt && `updated ${new Date(data.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join(' · ')}
        actions={<Button variant="secondary" disabled={loading} onClick={() => setFresh(Date.now())}>{loading ? 'Refreshing…' : 'Refresh'}</Button>}
      />
      {error && <ErrorState message={error} onRetry={refetch} />}
      <Tiles items={fundsTiles(data?.summary)} strong />
      <StatusPills
        pills={PAYOUT_PILLS.map((p) => { const t = tables.find((x) => x.id === p.table); return { key: p.key, label: p.label, count: t && !t.error ? t.rows.length : null } })}
        active={current.key}
        onChange={(k) => { setPill(k); setPage(1) }}
      />
      {data && <Tiles items={tilesFor(data.summary, table, current)} />}
      {!(error && !data) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {table?.title && <h2 className="mb-1 font-semibold">{table.title}</h2>}
          {table?.note && <p className={`mb-2 text-xs ${MUTED}`}>{table.note}</p>}
          <DataTable
            columns={columns}
            rows={paged.rows.map((r, i) => ({ ...r, _key: r.id || `${current.table}-${paged.page}-${i}` }))}
            loading={loading && !data}
            error={table?.error || ''}
            onRetry={() => setFresh(Date.now())}
            onRowClick={current.table === 'payouts' ? (r) => hasDetail(r) && setOpen(r) : undefined}
            rowKey="_key"
          />
          {paged.pages > 1 && <Pagination page={paged.page} pages={paged.pages} total={(table?.rows || []).length} onPage={setPage} />}
        </div>
      )}
      {open && <PayoutDrawer key={open.id} row={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
