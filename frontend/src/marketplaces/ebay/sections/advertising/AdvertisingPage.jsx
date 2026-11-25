/**
 * eBay Promoted Listings: campaigns by state (Pause / Resume on the row), a campaign drawer with its
 * ads and every action (add / remove listings with eBay's suggestions, ad rate, rename, budget, copy,
 * end), New campaign as steps, and ad reports (request, view, delete).
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
import Drawer from '../../ui/Drawer'
import ActionButton from '../../ActionButton'
import SectionTable from '../../SectionTable'
import { formatCell } from '../../sectionFormat'
import NewCampaignPanel from './NewCampaignPanel'
import { campaignListings, campaignPills, campaignRows, splitActions } from './advertisingView'

const BASE = '/api/ebay/sections/advertising'
const date = (v) => (v ? new Date(v).toLocaleDateString() : '—')
const MUTED = 'text-gray-500 dark:text-slate-400'

export default function AdvertisingPage() {
  return <ShopSectionGate sectionId="advertising"><Advertising /></ShopSectionGate>
}

/** Posts a loader action; `{ error }` keeps its popup open with what was typed. */
function useRun(token, onDone) {
  return async (action, row, value) => {
    try {
      const res = await api.post(`${BASE}/${action.id}`, { id: row.id, ...(value !== undefined ? { value } : {}) }, token)
      onDone(res?.message || `${action.label}: done.`)
      return res || {}
    } catch (err) {
      return { error: err.message }
    }
  }
}

function DetailDrawer({ title, subtitle, path, actions, row, run, onClose }) {
  const { data, loading, error, refetch } = useApi(path)
  return (
    <Drawer
      title={data?.title || title}
      subtitle={subtitle}
      onClose={onClose}
      footer={<>
        <span className="flex flex-wrap gap-2">{(actions || []).map((a) => <ActionButton key={a.id} action={a} row={row} run={run} onDetail={() => {}} />)}</span>
        <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
      </>}
    >
      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {data?.summary?.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          {data.summary.map((s) => <div key={s.label} className="rounded-lg border p-3 dark:border-slate-700"><p className={`text-xs uppercase tracking-wide ${MUTED}`}>{s.label}</p><p className="mt-1 font-semibold">{s.type === 'text' ? s.value : formatCell(s.type, s.value)}</p></div>)}
        </div>
      )}
      {(data?.tables || []).map((t) => <SectionTable key={t.id} table={t} canAct={false} />)}
    </Drawer>
  )
}

function Advertising() {
  const { token } = useAuth()
  const [pill, setPill] = useState('')
  const [fresh, setFresh] = useState(0)
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(null)
  const [report, setReport] = useState(null)
  const [creating, setCreating] = useState(false)
  const { data, loading, error, refetch } = useApi(`${BASE}${fresh ? `?refresh=1&n=${fresh}` : ''}`)
  // Live reloads use the cached address again (a forced Refresh must not make every sync event call eBay).
  useSyncReload(['orders', 'listings'], 'ebay', () => (fresh ? setFresh(0) : refetch()))

  const rows = campaignRows(data)
  const campaignsT = (data?.tables || []).find((t) => t.id === 'campaigns')
  const reportsT = (data?.tables || []).find((t) => t.id === 'reports')
  const reports = reportsT && !reportsT.error ? reportsT.rows : null
  const active = pill || (rows?.some((r) => r.state === 'running') ? 'running' : 'all')
  const shown = (rows || []).filter((r) => active === 'all' || r.state === active)
  const s = Object.fromEntries((data?.summary || []).map((x) => [x.label, x.value]))
  const requestReport = (reportsT?.actions || []).find((a) => a.id === 'request-report')
  const canCreate = (campaignsT?.actions || []).some((a) => a.id === 'create')
  const reload = () => setFresh(Date.now())
  // After an action: the drawer closes, the page stays on its pill and reloads.
  const run = useRun(token, (message) => { setPill(active); setOpen(null); setReport(null); setNotice(message); reload() })
  const openRow = open && (rows || []).find((r) => r.id === open)

  return (
    <div className="space-y-3">
      <PageHeader
        title="eBay Promoted Listings"
        summary={[rows && `${s.Running ?? 0} running · ${s.Paused ?? 0} paused · ${s['Ended (last 90 days)'] ?? 0} ended in the last 90 days`, data?.loadedAt && `updated ${new Date(data.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join(' · ')}
        actions={<>
          {canCreate && <Button onClick={() => setCreating(true)}>+ New campaign</Button>}
          <Button variant="secondary" disabled={loading} onClick={reload}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
        </>}
      />
      {error && <ErrorState message={error} onRetry={refetch} />}
      <StatusPills pills={campaignPills(rows, reports)} active={active} onChange={setPill} />
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      {!(error && !data) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {active === 'reports' ? (
            <>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className={`text-xs ${MUTED}`}>{reportsT?.note} Spend, sales and return on ad spend per campaign come from these reports.</p>
                {requestReport && <ActionButton action={requestReport} row={{ id: '' }} run={run} onDetail={() => {}} />}
              </div>
              <DataTable
                columns={[
                  { key: 'type', label: 'Report', render: (r) => <span><span className="font-medium">{r.type}</span>{r.period && <span className={`block text-xs ${MUTED}`}>{r.period}</span>}</span> },
                  { key: 'status', label: 'Status', render: (r) => <span><Badge color={statusColor(r.status)}>{r.status}</Badge>{r.message && <span className={`block text-xs ${MUTED}`}>{r.message}</span>}</span> },
                  { key: 'requested', label: 'Requested', render: (r) => date(r.requested) },
                  {
                    key: 'actions',
                    label: '',
                    render: (r) => (
                      <span className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                        {(r.actions || []).some((a) => a.id === 'report') && <Button size="sm" onClick={() => setReport(r)}>View</Button>}
                        {(r.actions || []).filter((a) => !a.detail).map((a) => <ActionButton key={a.id} action={a} row={r} run={run} onDetail={() => {}} />)}
                      </span>
                    ),
                  },
                ]}
                rows={(reports || []).map((r) => ({ ...r, _key: r.id }))}
                loading={loading && !data}
                error={reportsT?.error || ''}
                onRetry={reload}
                rowKey="_key"
              />
            </>
          ) : (
            <>
              {campaignsT?.note && <p className={`mb-2 text-xs ${MUTED}`}>{campaignsT.note}</p>}
              <DataTable
                columns={[
                  { key: 'name', label: 'Campaign', render: (r) => <span className="block max-w-[280px]"><span className="block truncate font-medium">{r.name}</span><span className={`text-xs ${MUTED}`}>{r.type}</span></span> },
                  { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge> },
                  { key: 'cost', label: 'Ad rate / budget', render: (r) => (r.rate != null ? `${r.rate}% of sale` : r.budget ? `${formatCell('money', r.budget)} a day` : '—') },
                  { key: 'dates', label: 'Dates', render: (r) => <span className="text-sm">{date(r.start)} – {r.end ? date(r.end) : 'no end'}</span> },
                  {
                    key: 'actions',
                    label: '',
                    render: (r) => {
                      const { quick } = splitActions(r)
                      return (
                        <span className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {quick && <ActionButton action={quick} row={r} run={run} onDetail={() => {}} />}
                          <Button size="sm" variant={quick ? 'secondary' : 'primary'} onClick={() => { setPill(active); setOpen(r.id) }}>Open</Button>
                        </span>
                      )
                    },
                  },
                ]}
                rows={shown.map((r) => ({ ...r, _key: r.id }))}
                loading={loading && !data}
                error={campaignsT?.error || ''}
                onRetry={reload}
                onRowClick={(r) => { setPill(active); setOpen(r.id) }}
                rowKey="_key"
              />
            </>
          )}
        </div>
      )}
      {openRow && (() => {
        const { ads, campaign } = splitActions(openRow)
        return (
          <DetailDrawer
            key={openRow.id}
            title={openRow.name}
            subtitle={<span className="flex flex-wrap items-center gap-2"><Badge color={statusColor(openRow.status)}>{openRow.status}</Badge><span>{openRow.type}</span>{openRow.rate != null && <span>· {openRow.rate}% ad rate</span>}</span>}
            path={`${BASE}/ads${queryString({ id: openRow.id })}`}
            actions={[...ads, ...campaign]}
            row={openRow}
            run={run}
            onClose={() => setOpen(null)}
          />
        )
      })()}
      {report && <DetailDrawer key={report.id} title={report.type} subtitle={report.period} path={`${BASE}/report${queryString({ id: report.id })}`} actions={[]} row={report} run={run} onClose={() => setReport(null)} />}
      {creating && <NewCampaignPanel options={campaignListings(data)} onClose={() => setCreating(false)} onDone={(text) => { setCreating(false); setPill(active); setNotice(text); reload() }} />}
    </div>
  )
}
