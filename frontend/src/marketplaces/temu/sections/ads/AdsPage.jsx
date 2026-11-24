/**
 * Temu ads: last 30 days' spend, ad sales, ROAS and orders; needs attention (ads losing money,
 * ads with no orders); ads by goods (Budget & ROAS, details drawer); results per product; New ads
 * as steps. When the shop's Temu connection has no Ads, the page says so instead of an error.
 */
import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api, queryString } from '../../../../lib/api'
import { useApi } from '../../../../hooks/useApi'
import RequireShopSection from '../../../../components/RequireShopSection'
import ShopSectionGate from '../../../../components/ShopSectionGate'
import { useShopSection } from '../../../../hooks/useShopSection'
import Button from '../../../../components/ui/Button'
import DataTable from '../../../../components/ui/DataTable'
import { ErrorState, Spinner } from '../../../../components/ui/Feedback'
import PageHeader from '../../ui/PageHeader'
import AttentionStrip from '../../ui/AttentionStrip'
import StatusPills from '../../ui/StatusPills'
import Drawer from '../../ui/Drawer'
import ActionButton from '../../ActionButton'
import SectionTable from '../../SectionTable'
import { formatCell } from '../../sectionFormat'
import { adsAttention, adsOff, bySpend, roasTone } from './adsView'
import NewAdsPanel from './NewAdsPanel'

const BASE = '/api/temu/sections/ads'
const usd = (v) => (v == null ? '—' : formatCell('money', typeof v === 'object' ? v : { value: v, currency: 'USD' }))
const num = (v) => (v == null ? '—' : Number(v).toLocaleString())
const TONE = { bad: 'font-semibold text-rose-600 dark:text-rose-400', ok: 'text-amber-700 dark:text-amber-300', good: 'font-semibold text-emerald-700 dark:text-emerald-400' }
const product = (r) => <span><span className="font-medium">{r.title || `Goods ${r.goodsId}`}</span>{r.title && <span className="block text-xs text-gray-500 dark:text-slate-400">Goods {r.goodsId}</span>}</span>

export default function AdsPage() {
  return <ShopSectionGate sectionId="ads"><Ads /></ShopSectionGate>
}

function AdDetail({ row, onClose }) {
  const { data, loading, error, refetch } = useApi(`${BASE}/ad${queryString({ id: row.id })}`)
  return (
    <Drawer title={row.title || `Goods ${row.goodsId}`} subtitle="Ad settings, last 30 days and changes" onClose={onClose} footer={<span className="ml-auto"><Button variant="secondary" onClick={onClose}>Close</Button></span>}>
      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(data.summary || []).map((s) => (
              <div key={s.label} className="rounded-lg border p-3 dark:border-slate-700">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">{s.label}</p>
                <p className="mt-1 font-semibold">{s.value == null ? '—' : formatCell(s.type, s.value)}</p>
              </div>
            ))}
          </div>
          {(data.tables || []).map((t) => <SectionTable key={t.id} table={t} canAct={false} />)}
        </div>
      )}
    </Drawer>
  )
}

function Ads() {
  const section = useShopSection()
  const { token } = useAuth()
  const [pill, setPill] = useState('ads')
  const [focus, setFocus] = useState('')
  const [fresh, setFresh] = useState(0)
  const [viewing, setViewing] = useState(null)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState({ text: '', error: false })
  const { data, loading, error, refetch } = useApi(`${BASE}${fresh ? `?refresh=1&n=${fresh}` : ''}`)
  if (!section) return <RequireShopSection />

  const reload = () => setFresh((n) => n + 1)
  const table = (id) => (data?.tables || []).find((t) => t.id === id)
  const goodsTable = table('goods')
  const off = data?.adsOff || adsOff(goodsTable)
  const rows = goodsTable && !goodsTable.error ? bySpend(goodsTable.rows) : null
  const report = table('goodsReport')
  const createAction = (goodsTable?.actions || []).find((a) => a.id === 'create-ad')
  const options = createAction?.input?.fields?.find((f) => f.name === 'goods')?.options || []
  const s = Object.fromEntries((data?.summary || []).map((x) => [x.label, x.value]))
  const onRun = async (action, id, value) => {
    try {
      const res = await api.post(`${BASE}/${action.id}`, { id, ...(value !== undefined ? { value } : {}) }, token)
      setNotice({ text: res?.message || `${action.label}: done.`, error: false })
      reload()
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  }
  const created = (res) => {
    setCreating(false)
    setNotice({ text: res?.message || 'Submitted to Temu.', error: (res?.refused || []).length > 0 })
    reload()
  }
  const shownRows = (rows || []).filter((r) => {
    const spent = (r.spend?.value || 0) > 0
    return focus === 'losing' ? spent && r.roas != null && Number(r.roas) < 1 : focus === 'noOrders' ? spent && !Number(r.orders) : true
  })

  return (
    <div className="space-y-3">
      <PageHeader
        title="Temu ads"
        summary={off ? '' : [data && s['Ad spend'] != null && `${usd(s['Ad spend'])} spent`, data && s.ROAS != null && `ROAS ${s.ROAS}`, data && 'last 30 days', data?.loadedAt && `updated ${new Date(data.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join(' · ')}
        actions={<>
          {options.length > 0 && !off && <Button onClick={() => setCreating(true)}>+ New ads</Button>}
          <Button variant="secondary" disabled={loading} onClick={reload}>{loading ? 'Refreshing…' : 'Refresh'}</Button>
        </>}
      />
      {error && <ErrorState message={error} onRetry={refetch} />}
      {loading && !data && <Spinner />}
      {data && off && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-semibold">Temu Ads isn't on for this shop</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">Turn on ads in Temu Seller Center, and allow the ad methods (temu.searchrec.ad.*) for the app in the Temu partner account. Then reconnect the shop in Settings and come back here.</p>
          {goodsTable?.error && <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">Temu said: {goodsTable.error}</p>}
        </div>
      )}
      {data && !off && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[{ k: 'Ad spend', v: usd(s['Ad spend']) }, { k: 'Ad sales', v: usd(s['Ad sales']) }, { k: 'ROAS', v: s.ROAS == null ? '—' : s.ROAS, tone: TONE[roasTone(s.ROAS)] }, { k: 'Orders from ads', v: num(s.Orders) }].map((t) => (
              <div key={t.k} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">{t.k}</p>
                <p className={`mt-1 text-lg font-semibold ${t.tone || ''}`}>{t.v}</p>
              </div>
            ))}
          </div>
          <AttentionStrip items={adsAttention(rows)} onPick={(i) => { setPill('ads'); setFocus(i.id) }} />
          <StatusPills
            pills={[{ key: 'ads', label: 'Ads by goods', count: rows ? rows.length : null }, { key: 'report', label: 'Results per product', count: report && !report.error ? report.rows.length : null }]}
            active={pill}
            onChange={(k) => { setPill(k); setFocus('') }}
          />
          {notice.text && <p className={`text-sm ${notice.error ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{notice.text}</p>}
          <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            {pill === 'ads' && (
              <>
                {focus && <p className="mb-2 text-sm">Showing {focus === 'losing' ? 'ads earning less than they spend' : 'ads with spend and no orders'} · <button type="button" className="text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setFocus('')}>Show all</button></p>}
                {rows && !rows.length && !goodsTable?.error && <p className="mb-2 text-sm text-gray-500 dark:text-slate-400">No ads ran in the last 30 days.{options.length ? ' Use + New ads to start one.' : ''}</p>}
                <DataTable
                  columns={[
                    { key: 'product', label: 'Product', render: product },
                    { key: 'spend', label: 'Spend', render: (r) => usd(r.spend) },
                    { key: 'sales', label: 'Ad sales', render: (r) => usd(r.sales) },
                    { key: 'orders', label: 'Orders', render: (r) => num(r.orders) },
                    { key: 'roas', label: 'ROAS', render: (r) => (r.roas == null ? '—' : <span className={TONE[roasTone(r.roas)]}>{r.roas}</span>) },
                    { key: 'impressions', label: 'Impressions', render: (r) => num(r.impressions) },
                    { key: 'clicks', label: 'Clicks', render: (r) => num(r.clicks) },
                    {
                      key: 'actions',
                      label: '',
                      render: (r) => {
                        const edit = (r.actions || []).find((a) => a.id === 'edit-ad')
                        return (
                          <span className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                            {edit && <ActionButton action={{ ...edit, label: 'Edit' }} rowId={r.id} onRun={onRun} onDetail={() => {}} />}
                            <Button size="sm" variant="secondary" onClick={() => setViewing(r)}>Details</Button>
                          </span>
                        )
                      },
                    },
                  ]}
                  rows={shownRows.map((r) => ({ ...r, _key: r.id }))}
                  loading={false}
                  error={goodsTable?.error || ''}
                  onRetry={reload}
                  onRowClick={setViewing}
                  rowKey="_key"
                />
              </>
            )}
            {pill === 'report' && (
              <>
                {report?.note && <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">{report.title}. {report.note}</p>}
                <DataTable
                  columns={[
                    { key: 'product', label: 'Product', render: product },
                    { key: 'impressions', label: 'Impressions', render: (r) => num(r.impressions) },
                    { key: 'clicks', label: 'Clicks', render: (r) => num(r.clicks) },
                    { key: 'ctr', label: 'CTR %', render: (r) => (r.ctr == null ? '—' : `${r.ctr}%`) },
                    { key: 'carts', label: 'Add to cart', render: (r) => num(r.carts) },
                    { key: 'orders', label: 'Orders', render: (r) => num(r.orders) },
                    { key: 'sales', label: 'Ad sales', render: (r) => usd(r.sales) },
                    { key: 'spend', label: 'Spend', render: (r) => usd(r.spend) },
                    { key: 'roas', label: 'ROAS', render: (r) => (r.roas == null ? '—' : <span className={TONE[roasTone(r.roas)]}>{r.roas}</span>) },
                  ]}
                  rows={(report?.rows || []).map((r) => ({ ...r, _key: r.goodsId }))}
                  loading={false}
                  error={report?.error || ''}
                  onRetry={reload}
                  rowKey="_key"
                />
              </>
            )}
          </div>
        </>
      )}
      {viewing && <AdDetail row={viewing} onClose={() => setViewing(null)} />}
      {creating && <NewAdsPanel options={options} onClose={() => setCreating(false)} onDone={created} />}
    </div>
  )
}
