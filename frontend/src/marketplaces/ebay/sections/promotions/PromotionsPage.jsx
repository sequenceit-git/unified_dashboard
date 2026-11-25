/**
 * eBay Promotions: Running / Scheduled / Ended with each promotion's results inline (orders, items
 * sold, sales), ⋯ Listings, Pause / Resume where eBay allows it, Delete; New promotion as steps.
 */
import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api, queryString } from '../../../../lib/api'
import { useApi } from '../../../../hooks/useApi'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import ShopSectionGate from '../../../../components/ShopSectionGate'
import Badge, { statusColor } from '../../../../components/ui/Badge'
import Button from '../../../../components/ui/Button'
import DataTable from '../../../../components/ui/DataTable'
import { ErrorState, Spinner } from '../../../../components/ui/Feedback'
import PageHeader from '../../ui/PageHeader'
import StatusPills from '../../ui/StatusPills'
import RowActions from '../../ui/RowActions'
import Drawer from '../../ui/Drawer'
import SectionTable from '../../SectionTable'
import { formatCell } from '../../sectionFormat'
import NewPromotionPanel from './components/NewPromotionPanel'
import { pauseAction, promotionPills, promotionRows } from './promotionsView'

const BASE = '/api/ebay/sections/promotions'
const date = (v) => (v ? new Date(v).toLocaleDateString() : '—')
const MUTED = 'text-gray-500 dark:text-slate-400'

export default function PromotionsPage() {
  return <ShopSectionGate sectionId="promotions"><Promotions /></ShopSectionGate>
}

function Listings({ row, onClose }) {
  const { data, loading, error, refetch } = useApi(`${BASE}/items${queryString({ id: row.id })}`)
  return (
    <Drawer title={row.name} subtitle="Listings in this promotion" onClose={onClose} footer={<span className="ml-auto"><Button size="sm" variant="secondary" onClick={onClose}>Close</Button></span>}>
      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {(data?.tables || []).map((t) => <SectionTable key={t.id} table={t} canAct={false} />)}
    </Drawer>
  )
}

function Promotions() {
  const { token } = useAuth()
  const [pill, setPill] = useState('')
  const [fresh, setFresh] = useState(0)
  const [notice, setNotice] = useState({ text: '', error: false })
  const [busy, setBusy] = useState('')
  const [viewing, setViewing] = useState(null)
  const [creating, setCreating] = useState(false)
  const { data, loading, error, refetch } = useApi(`${BASE}${fresh ? `?refresh=1&n=${fresh}` : ''}`)
  // Live reloads use the cached address again (a forced Refresh must not make every sync event call eBay).
  useSyncReload(['orders', 'listings'], 'ebay', () => (fresh ? setFresh(0) : refetch()))

  const rows = promotionRows(data)
  const pills = promotionPills(rows)
  const active = pill || (rows?.some((r) => r.state === 'running') ? 'running' : 'all')
  const shown = (rows || []).filter((r) => active === 'all' || r.state === active)
  const promotionsT = (data?.tables || []).find((t) => t.id === 'promotions')
  const resultsT = (data?.tables || []).find((t) => t.id === 'results')
  const s = Object.fromEntries((data?.summary || []).map((x) => [x.label, x]))
  const reload = () => setFresh(Date.now())
  const done = (text, isError = false) => { setPill(active); setNotice({ text, error: isError }); reload() }

  const act = async (row, key, request, confirmText) => {
    if (busy || !window.confirm(confirmText)) return
    setBusy(`${row.id}:${key}`)
    try {
      const res = await request()
      done(res?.message || 'Done.')
    } catch (err) {
      setNotice({ text: err.message, error: true })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="eBay promotions"
        summary={[
          rows && `${rows.filter((r) => r.state === 'running').length} running · ${rows.filter((r) => r.state === 'scheduled').length} scheduled`,
          s['Sales from promotions'] && `${formatCell('money', s['Sales from promotions'].value)} sales from promotions`,
          s['Sales lift'] && `${Number(s['Sales lift'].value).toFixed(1)}% lift`,
        ].filter(Boolean).join(' · ')}
        actions={<>
          <Button onClick={() => setCreating(true)}>+ New promotion</Button>
          <Button variant="secondary" disabled={loading} onClick={reload}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
        </>}
      />
      {error && <ErrorState message={error} onRetry={refetch} />}
      <StatusPills pills={pills} active={active} onChange={setPill} />
      {notice.text && <p className={`text-sm ${notice.error ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{notice.text}</p>}
      {resultsT?.error && <p className={`text-xs ${MUTED}`}>Results couldn't be loaded: {resultsT.error}</p>}
      {!(error && !data) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <DataTable
            columns={[
              { key: 'name', label: 'Promotion', render: (r) => <span className="block max-w-[280px]"><span className="block truncate font-medium">{r.name}</span><span className={`text-xs ${MUTED}`}>{r.type}</span></span> },
              { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge> },
              { key: 'dates', label: 'Dates', render: (r) => <span className="text-sm">{date(r.start)} – {date(r.end)}</span> },
              {
                key: 'result',
                label: 'Results',
                render: (r) => (r.result
                  ? <span className="text-sm">{formatCell('money', r.result.promotionSales)} <span className={`text-xs ${MUTED}`}>· {r.result.orders} orders · {r.result.items} sold{r.result.lift != null ? ` · ${r.result.lift}% lift` : ''}</span></span>
                  : <span className="text-gray-400">—</span>),
              },
              {
                key: 'actions',
                label: '',
                render: (r) => {
                  const pause = pauseAction(r)
                  const del = (r.actions || []).find((a) => a.id === 'delete')
                  return (
                    <RowActions
                      main={pause
                        ? { label: pause.label, primary: pause.verb === 'resume', busy: busy === `${r.id}:${pause.verb}`, onClick: () => act(r, pause.verb, () => api.post(`${BASE}/${r.promotionId}/${pause.verb}`, {}, token), `${pause.label} promotion "${r.name}"?`) }
                        : { label: 'Listings', onClick: () => setViewing(r) }}
                      menu={[
                        ...(pause ? [{ label: 'Listings', onClick: () => setViewing(r) }] : []),
                        ...(del ? [{ label: 'Delete', onClick: () => act(r, 'delete', () => api.post(`${BASE}/delete`, { id: r.id }, token), del.confirm || `Delete promotion "${r.name}"?`) }] : []),
                      ]}
                    />
                  )
                },
              },
            ]}
            rows={shown.map((r) => ({ ...r, _key: r.id }))}
            loading={loading && !data}
            error={promotionsT?.error || ''}
            onRetry={reload}
            onRowClick={setViewing}
            rowKey="_key"
          />
        </div>
      )}
      {viewing && <Listings row={viewing} onClose={() => setViewing(null)} />}
      {creating && <NewPromotionPanel onClose={() => setCreating(false)} onDone={(text) => { setCreating(false); done(text) }} />}
    </div>
  )
}
