/**
 * eBay Returns & cases: every request that needs a reply, by deadline (overdue in red), across
 * returns, cancellations, item-not-received inquiries, cases and payment disputes; one details
 * drawer per request with all its actions at the bottom, each a short popup with its fields.
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
import ReconnectNotice from '../../ReconnectNotice'
import { formatCell } from '../../sectionFormat'
import { decideActions, isOpen, kindsOf, mainAction, respondText, summaryLine } from './returnsView'

const BASE = '/api/ebay/sections/returns-cases'
const date = (v) => (v ? new Date(v).toLocaleDateString() : '—')
const MUTED = 'text-gray-500 dark:text-slate-400'

export default function ReturnsCasesPage() {
  return <ShopSectionGate sectionId="returns-cases"><ReturnsCases /></ShopSectionGate>
}

/** Approve / Decline and cancellations go to eBay's decide endpoints; everything else is a loader action. */
function useRun(token, onDone) {
  return async (action, row, value) => {
    try {
      let res
      if (action.id === 'return-approve' || action.id === 'return-decline') {
        res = await api.post(`${BASE}/decide`, {
          returnId: row.returnId,
          ...(action.id === 'return-approve' ? { orderId: row.orderId, decision: 'APPROVE' } : { decision: 'DECLINE', comments: value?.comments?.trim() || 'Return declined by policy' }),
          ...(row.returnType ? { returnType: row.returnType } : {}),
          ...(row.rawStatus ? { rawStatus: row.rawStatus } : {}),
        }, token)
      } else if (action.id === 'cancel-approve' || action.id === 'cancel-reject') {
        const trackingNumber = value?.trackingNumber?.trim()
        res = await api.post('/api/ebay/sections/cancellations/decide', { cancelId: row.cancelId, orderId: row.orderId, action: action.id === 'cancel-approve' ? 'approve' : 'reject', ...(trackingNumber ? { trackingNumber } : {}) }, token)
      } else {
        res = await api.post(`${BASE}/${action.id}`, { id: row.id, ...(value !== undefined ? { value } : {}) }, token)
      }
      onDone(res?.message || `${action.label}: done.`)
      return res || {}
    } catch (err) {
      return { error: err.message }
    }
  }
}

function Detail({ row, kind, run, onClose }) {
  const detail = kind.detail && (row.actions || []).some((a) => a.id === kind.detail)
  const { data, loading, error, refetch } = useApi(detail ? `${BASE}/${kind.detail}${queryString({ id: row.id })}` : null)
  const actions = [...decideActions(row, kind.key), ...(row.actions || []).filter((a) => !a.detail)]
  const due = respondText(row)
  const fields = [
    ['Order', row.orderId], ['Buyer', row.buyer], ['Item', row.item || row.itemId], ['Reason', row.reason],
    ['Refund', row.refund && formatCell('money', row.refund)], ['Claim', row.claim && formatCell('money', row.claim)], ['Amount', row.amount && formatCell('money', row.amount)],
    ['Opened', date(row.created || row.opened)],
  ].filter(([, v]) => v)
  return (
    <Drawer
      title={`${kind.label.replace(/s$/, '')} ${row[kind.idKey] || row.id}`}
      subtitle={(
        <span className="flex flex-wrap items-center gap-2">
          <Badge color={statusColor(row.status)}>{row.status || '—'}</Badge>
          {due && <span className={due.late ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>respond {due.text}</span>}
        </span>
      )}
      onClose={onClose}
      footer={(
        <>
          <span className="flex flex-wrap gap-2">
            {actions.map((a) => <ActionButton key={a.id} action={a} row={row} run={run} onDetail={() => {}} />)}
            {!actions.length && <span className={`text-xs ${MUTED}`}>Nothing to do on this one.</span>}
          </span>
          <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
        </>
      )}
    >
      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {fields.map(([k, v]) => <div key={k}><dt className={`text-xs ${MUTED}`}>{k}</dt><dd className="font-medium">{v}</dd></div>)}
        </dl>
        {row.url && <a href={row.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">Open on eBay ↗</a>}
        {loading && <Spinner />}
        {error && <ErrorState message={error} onRetry={refetch} />}
        {data?.summary?.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {data.summary.map((s) => (
              <div key={s.label} className="rounded-lg border p-3 dark:border-slate-700">
                <p className={`text-xs uppercase tracking-wide ${MUTED}`}>{s.label}</p>
                <p className="mt-1 font-semibold">{s.type === 'text' ? s.value : formatCell(s.type, s.value)}</p>
              </div>
            ))}
          </div>
        )}
        {(data?.tables || []).map((t) => <SectionTable key={t.id} table={t} canAct={false} />)}
      </div>
    </Drawer>
  )
}

function ReturnsCases() {
  const { token } = useAuth()
  const [pill, setPill] = useState('')
  const [fresh, setFresh] = useState(0)
  const [open, setOpen] = useState(null)
  const [notice, setNotice] = useState('')
  const [now] = useState(() => new Date())
  const { data, loading, error, refetch } = useApi(`${BASE}${fresh ? `?refresh=1&n=${fresh}` : ''}`)
  useSyncReload(['orders', 'listings'], 'ebay', () => refetch())

  const kinds = kindsOf(data)
  const reload = () => { setNotice(''); setFresh(Date.now()) }
  // Opens on the first kind with something to answer.
  const active = pill || kinds.find((k) => k.open)?.key || 'returns'
  const kind = kinds.find((k) => k.key === active)
  // After an action the page stays on this kind (it doesn't jump when the last open one closes).
  const run = useRun(token, (message) => { setPill(active); setOpen(null); setFresh(Date.now()); setNotice(message) })
  // The drawer keeps the kind it was opened on, whatever the pills do meanwhile.
  const openRow = (r) => { setPill(active); setOpen({ row: r, kindKey: active }) }
  const openKind = open && kinds.find((k) => k.key === open.kindKey)

  return (
    <div className="space-y-3">
      <ReconnectNotice />
      <PageHeader
        title="eBay returns & cases"
        summary={[summaryLine(kinds, now), data?.loadedAt && `updated ${new Date(data.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join(' · ')}
        actions={<Button variant="secondary" disabled={loading} onClick={reload}>{loading ? 'Refreshing…' : 'Refresh'}</Button>}
      />
      {error && <ErrorState message={error} onRetry={refetch} />}
      <StatusPills pills={kinds.map((k) => ({ key: k.key, label: k.open ? `${k.label} · ${k.open} open` : k.label, count: k.count }))} active={active} onChange={setPill} />
      {notice && <p className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
      {!(error && !data) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {kind?.note && <p className={`mb-2 text-xs ${MUTED}`}>{kind.note}</p>}
          <DataTable
            columns={[
              { key: 'id', label: 'Request', render: (r) => <span><span className="font-medium">{r[kind.idKey] || r.id}</span>{r.orderId && <span className={`block text-xs ${MUTED}`}>Order {r.orderId}</span>}</span> },
              { key: 'buyer', label: 'Buyer / item', render: (r) => <span className="block max-w-[240px]"><span className="block truncate">{r.buyer || '—'}</span>{(r.item || r.itemId) && <span className={`block truncate text-xs ${MUTED}`}>{r.item || `Item ${r.itemId}`}</span>}</span> },
              { key: 'reason', label: 'Reason', render: (r) => <span className="block max-w-[260px] truncate" title={r.reason}>{r.reason || '—'}</span> },
              { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status || '—'}</Badge> },
              { key: 'respondBy', label: 'Respond by', render: (r) => { const t = isOpen(r, kind.key) ? respondText(r, now) : null; return t ? <span className={t.late ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>{t.text}</span> : <span className="text-gray-400">—</span> } },
              {
                key: 'actions',
                label: '',
                render: (r) => {
                  const main = mainAction(r, kind.key)
                  return (
                    <span className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {main.decide
                        ? <ActionButton action={decideActions(r, kind.key)[0]} row={r} run={run} onDetail={() => {}} />
                        : <Button size="sm" variant={main.primary ? 'primary' : 'secondary'} onClick={() => openRow(r)}>{main.label}</Button>}
                      {main.decide && <Button size="sm" variant="secondary" onClick={() => openRow(r)}>Details</Button>}
                    </span>
                  )
                },
              },
            ]}
            rows={(kind?.rows || []).map((r) => ({ ...r, _key: r.id }))}
            loading={loading && !data}
            error={kind?.error || ''}
            onRetry={reload}
            onRowClick={openRow}
            rowKey="_key"
          />
        </div>
      )}
      {open && openKind && <Detail key={open.row.id} row={open.row} kind={openKind} run={run} onClose={() => setOpen(null)} />}
    </div>
  )
}
