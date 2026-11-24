/**
 * Temu returns & refunds: open requests first (the most urgent first), cancellation requests, and a
 * details drawer per request. Temu lets apps approve only (full refund / cancellation); declining
 * or partial refunds are done in Temu Seller Center.
 */
import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api, queryString } from '../../../../lib/api'
import { useApi } from '../../../../hooks/useApi'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import RequireShopSection from '../../../../components/RequireShopSection'
import ShopSectionGate from '../../../../components/ShopSectionGate'
import { useShopSection } from '../../../../hooks/useShopSection'
import Badge from '../../../../components/ui/Badge'
import Button from '../../../../components/ui/Button'
import DataTable from '../../../../components/ui/DataTable'
import { ErrorState, Spinner } from '../../../../components/ui/Feedback'
import PageHeader from '../../ui/PageHeader'
import AttentionStrip from '../../ui/AttentionStrip'
import StatusPills from '../../ui/StatusPills'
import RowActions from '../../ui/RowActions'
import Drawer from '../../ui/Drawer'
import ActionButton from '../../ActionButton'
import SectionTable from '../../SectionTable'
import { formatCell } from '../../sectionFormat'
import { canApproveCancel, canApproveReturn, isOpenReturn, respondText, returnPills, returnsAttention, sortOpenFirst } from './returnsView'

const BASE = '/api/temu/sections/after-sales'
const date = (v) => (v ? new Date(v).toLocaleDateString() : '—')
const tone = (s) => (/refunded/i.test(s) ? 'green' : /rejected|cancel/i.test(s) ? 'gray' : /reviewing/i.test(s) ? 'blue' : 'yellow')

export default function AfterSalesPage() {
  return <ShopSectionGate sectionId="after-sales"><Returns /></ShopSectionGate>
}

function Detail({ row, onClose, onRun }) {
  const { token } = useAuth()
  const { data, loading, error, refetch } = useApi(`${BASE}/aftersales${queryString({ id: row.id })}`)
  const [address, setAddress] = useState(null)
  const [addressError, setAddressError] = useState('')
  const labelAction = (row.actions || []).find((a) => a.id === 'return-label')
  const canAddress = (row.actions || []).some((a) => a.id === 'return-address')
  const showAddress = async () => {
    setAddressError('')
    try {
      setAddress(await api.get(`${BASE}/return-address${queryString({ id: row.id })}`, token))
    } catch (err) {
      setAddressError(err.message)
    }
  }
  return (
    <Drawer
      title={`Return ${row.returnId}`}
      subtitle={<span className="flex flex-wrap items-center gap-2"><Badge color={tone(row.status)}>{row.status}</Badge><span>Order {row.order}</span></span>}
      onClose={onClose}
      footer={(
        <>
          <span className="flex flex-wrap gap-2">
            {canAddress && <Button variant="secondary" onClick={showAddress}>Buyer's address</Button>}
            {labelAction && <ActionButton action={labelAction} rowId={row.id} onRun={onRun} onDetail={() => {}} />}
          </span>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </>
      )}
    >
      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {data && (
        <div className="space-y-4">
          {data.summary?.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {data.summary.map((s) => (
                <div key={s.label} className="rounded-lg border p-3 dark:border-slate-700">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{s.label}</p>
                  <p className="mt-1 font-semibold">{s.type === 'text' ? s.value : formatCell(s.type, s.value)}</p>
                </div>
              ))}
            </div>
          )}
          {(data.tables || []).map((t) => <SectionTable key={t.id} table={t} canAct={false} />)}
        </div>
      )}
      {addressError && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{addressError}</p>}
      {address && (
        <div className="mt-4 space-y-2">
          <h3 className="font-semibold">{address.title}</h3>
          {(address.summary || []).map((s) => (
            <p key={s.label} className="text-sm"><span className="text-gray-500 dark:text-slate-400">{s.label}: </span>{s.type === 'text' ? s.value : formatCell(s.type, s.value)}</p>
          ))}
          {(address.tables || []).map((t) => <SectionTable key={t.id} table={t} canAct={false} />)}
        </div>
      )}
    </Drawer>
  )
}

function Returns() {
  const section = useShopSection()
  const { token } = useAuth()
  const [pill, setPill] = useState('open')
  const [fresh, setFresh] = useState(0)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState({ text: '', error: false })
  const [open, setOpen] = useState(null)
  // When the page was opened: due dates are measured against it.
  const [now] = useState(() => new Date())
  const { data, loading, error, refetch } = useApi(`${BASE}${fresh ? `?refresh=1&n=${fresh}` : ''}`)
  useSyncReload('orders', section?.marketplace, () => refetch())
  if (!section) return <RequireShopSection />

  const table = (id) => (data?.tables || []).find((t) => t.id === id)
  const returns = table('returns') && !table('returns').error ? table('returns').rows : null
  const cancels = table('cancellations') && !table('cancellations').error ? table('cancellations').rows : null
  const pills = returnPills(returns, cancels)
  const reload = () => setFresh((n) => n + 1)

  const decide = async (key, path, body, confirmText) => {
    if (!window.confirm(confirmText)) return
    setBusy(key)
    setNotice({ text: '', error: false })
    try {
      await api.post(path, body, token)
      setNotice({ text: 'Done. Temu may take a moment to show the new status.', error: false })
      reload()
    } catch (err) {
      setNotice({ text: err.message, error: true })
    } finally {
      setBusy('')
    }
  }
  const onRun = async (action, id, value) => {
    try {
      const res = await api.post(`${BASE}/${action.id}`, { id, ...(value !== undefined ? { value } : {}) }, token)
      setNotice({ text: res?.message || `${action.label}: done.`, error: false })
      setOpen(null)
      reload()
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  }

  const rows = sortOpenFirst(returns || []).filter((r) => (pill === 'open' ? isOpenReturn(r.status) : pill === 'closed' ? !isOpenReturn(r.status) : true))
  const openCount = pills[0].count

  return (
    <div className="space-y-3">
      <PageHeader
        title="Temu returns & refunds"
        summary={returns ? [`${openCount} open`, cancels && pills[1].count ? `${pills[1].count} cancellation request${pills[1].count === 1 ? '' : 's'}` : '', data?.loadedAt && `updated ${new Date(data.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join(' · ') : ''}
        actions={<Button variant="secondary" disabled={loading} onClick={reload}>{loading ? 'Refreshing…' : 'Refresh'}</Button>}
      />
      {error && <ErrorState message={error} onRetry={refetch} />}
      <AttentionStrip items={returnsAttention(returns, cancels, now)} onPick={(i) => setPill(i.pill)} />
      <StatusPills pills={pills} active={pill} onChange={setPill} />
      <p className="text-xs text-gray-500 dark:text-slate-400">Temu lets the dashboard approve returns (full refund) and cancellations only. Decline or refund part in Temu Seller Center.</p>
      {notice.text && <p className={`text-sm ${notice.error ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{notice.text}</p>}
      {!(error && !data) && <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {pill === 'cancellations' ? (
          <DataTable
            columns={[
              { key: 'cancelId', label: 'Request', render: (r) => <span><span className="font-medium">{r.cancelId}</span><span className="block text-xs text-gray-500 dark:text-slate-400">Order {r.orderId}</span></span> },
              { key: 'status', label: 'Status', render: (r) => <Badge color={tone(r.status)}>{r.status}</Badge> },
              { key: 'items', label: 'Items' },
              { key: 'opened', label: 'Opened', render: (r) => date(r.opened) },
              {
                key: 'actions',
                label: '',
                render: (r) => (canApproveCancel(r.status)
                  ? <RowActions main={{ label: 'Approve', primary: true, busy: busy === `c:${r.cancelId}`, onClick: () => decide(`c:${r.cancelId}`, '/api/temu/sections/cancellations/decide', { cancelId: r.cancelId, orderId: r.orderId, action: 'approve' }, `Approve cancellation for order ${r.orderId || r.cancelId}?`) }} />
                  : <span className="text-xs text-gray-400">Processed</span>),
              },
            ]}
            rows={(cancels || []).map((r) => ({ ...r, _key: r.cancelId }))}
            loading={loading && !data}
            error={table('cancellations')?.error || ''}
            onRetry={reload}
            rowKey="_key"
          />
        ) : (
          <DataTable
            columns={[
              { key: 'returnId', label: 'Request', render: (r) => <span><span className="font-medium">{r.returnId}</span><span className="block text-xs text-gray-500 dark:text-slate-400">Order {r.order}</span></span> },
              { key: 'status', label: 'Status', render: (r) => <Badge color={tone(r.status)}>{r.status}</Badge> },
              { key: 'opened', label: 'Opened', render: (r) => date(r.opened) },
              {
                key: 'respondBy',
                label: 'Respond by',
                render: (r) => { const t = respondText(r, now); return t ? <span className={t.late ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>{t.text}</span> : <span className="text-gray-400">—</span> },
              },
              {
                key: 'actions',
                label: '',
                render: (r) => (
                  <RowActions
                    main={canApproveReturn(r.status)
                      ? { label: 'Approve & refund', primary: true, busy: busy === `r:${r.returnId}`, onClick: () => decide(`r:${r.returnId}`, '/api/temu/sections/after-sales/decide', { returnId: r.returnId, orderId: r.orderId, decision: 'APPROVE', ...(r.returnType ? { returnType: r.returnType } : {}), ...(r.rawStatus ? { rawStatus: r.rawStatus } : {}) }, `Approve the return and refund order ${r.orderId || r.returnId} in full?`) }
                      : /platform reviewing/i.test(r.status) ? { label: 'Temu reviewing', onClick: () => setOpen(r) } : { label: 'Details', onClick: () => setOpen(r) }}
                    menu={canApproveReturn(r.status) ? [{ label: 'Details', onClick: () => setOpen(r) }] : []}
                  />
                ),
              },
            ]}
            rows={rows.map((r) => ({ ...r, _key: r.id }))}
            loading={loading && !data}
            error={table('returns')?.error || ''}
            onRetry={reload}
            onRowClick={setOpen}
            rowKey="_key"
          />
        )}
      </div>}
      {open && <Detail row={open} onClose={() => setOpen(null)} onRun={onRun} />}
    </div>
  )
}
