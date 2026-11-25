/**
 * eBay Best offers: offers from buyers by expiry (offer vs your price, Accept / Counter / Decline),
 * and listings with watchers you can send an offer to. Counter and Send offer show your price, the
 * offer and your margin.
 */
import { useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api } from '../../../../lib/api'
import { useApi } from '../../../../hooks/useApi'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import ShopSectionGate from '../../../../components/ShopSectionGate'
import Button from '../../../../components/ui/Button'
import DataTable from '../../../../components/ui/DataTable'
import { ErrorState } from '../../../../components/ui/Feedback'
import PageHeader from '../../ui/PageHeader'
import StatusPills from '../../ui/StatusPills'
import RowActions from '../../ui/RowActions'
import OfferModal from './components/OfferModal'
import CounterModal from './components/CounterModal'
import { bySoonest, expiresText, summaryLine } from './offersView'

const BASE = '/api/ebay/sections/offers'
const usd = (m) => (m?.value == null ? '—' : `$${Number(m.value).toFixed(2)}`)
const MUTED = 'text-gray-500 dark:text-slate-400'

export default function OffersPage() {
  return <ShopSectionGate sectionId="offers"><Offers /></ShopSectionGate>
}

function Offers() {
  const { token } = useAuth()
  const [pill, setPill] = useState('')
  const [fresh, setFresh] = useState(0)
  const [notice, setNotice] = useState({ text: '', error: false })
  const [busy, setBusy] = useState('')
  const [countering, setCountering] = useState(null)
  const [sending, setSending] = useState(null)
  const [now] = useState(() => new Date())
  const { data, loading, error, refetch } = useApi(`${BASE}${fresh ? `?refresh=1&n=${fresh}` : ''}`)
  useSyncReload(['orders', 'listings'], 'ebay', () => refetch())

  const table = (id) => (data?.tables || []).find((t) => t.id === id)
  const offersT = table('bestOffers')
  const eligibleT = table('eligible')
  const offers = offersT && !offersT.error ? bySoonest(offersT.rows) : null
  const eligible = eligibleT && !eligibleT.error ? eligibleT.rows : null
  // Opens on offers when there are some, else on sending offers.
  const active = pill || (offers?.length || !eligible?.length ? 'offers' : 'send')
  const reload = () => setFresh(Date.now())
  const done = (text, isError = false) => { setNotice({ text, error: isError }); reload() }

  const decide = async (row, action, confirmText) => {
    if (!window.confirm(confirmText)) return
    setBusy(`${row.id}:${action}`)
    try {
      const res = await api.post(`${BASE}/${action}`, { id: row.id }, token)
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
        title="eBay best offers"
        summary={[summaryLine(offers, eligible ? eligible.length : null, now), data?.loadedAt && `updated ${new Date(data.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join(' · ')}
        actions={<Button variant="secondary" disabled={loading} onClick={reload}>{loading ? 'Refreshing…' : 'Refresh'}</Button>}
      />
      {error && <ErrorState message={error} onRetry={refetch} />}
      <StatusPills
        pills={[
          { key: 'offers', label: 'Offers from buyers', count: offers ? offers.length : null },
          { key: 'send', label: 'Send offers to watchers', count: eligible ? eligible.length : null },
        ]}
        active={active}
        onChange={setPill}
      />
      {notice.text && <p className={`text-sm ${notice.error ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{notice.text}</p>}
      {!(error && !data) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {active === 'offers' ? (
            <>
              {offersT?.note && <p className={`mb-2 text-xs ${MUTED}`}>{offersT.note}</p>}
              <DataTable
                columns={[
                  { key: 'title', label: 'Item', render: (r) => <span className="block max-w-[260px]"><span className="block truncate font-medium">{r.title || `Item ${r.itemId}`}</span><span className={`text-xs ${MUTED}`}>Item {r.itemId}{r.quantity > 1 ? ` · ${r.quantity} units` : ''}</span></span> },
                  { key: 'buyer', label: 'Buyer', render: (r) => <span className="block max-w-[220px]"><span>{r.buyer || '—'}</span>{r.message && <span className={`block truncate text-xs ${MUTED}`} title={r.message}>“{r.message}”</span>}</span> },
                  {
                    key: 'price',
                    label: 'Offer vs your price',
                    render: (r) => (
                      <span>
                        <span className="font-semibold">{usd(r.price)}</span>
                        {r.listPrice && <span className={`ml-1 text-xs ${MUTED}`}>of {usd(r.listPrice)}</span>}
                        {r.belowPrice != null && <span className={`ml-1 text-xs font-semibold ${r.belowPrice > 20 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-700 dark:text-amber-300'}`}>−{r.belowPrice}%</span>}
                      </span>
                    ),
                  },
                  { key: 'expires', label: 'Expires', render: (r) => { const t = expiresText(r, now); return t ? <span className={t.soon ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>{t.text}</span> : '—' } },
                  {
                    key: 'actions',
                    label: '',
                    render: (r) => (
                      <RowActions
                        main={{ label: 'Accept', primary: true, busy: busy === `${r.id}:offer-accept`, onClick: () => decide(r, 'offer-accept', `Accept ${r.buyer || 'the buyer'}'s offer of ${usd(r.price)} on item ${r.itemId}?`) }}
                        menu={[
                          { label: 'Counter…', onClick: () => setCountering(r) },
                          { label: 'Decline', onClick: () => decide(r, 'offer-decline', `Decline ${r.buyer || 'the buyer'}'s offer on item ${r.itemId}?`) },
                        ]}
                      />
                    ),
                  },
                ]}
                rows={(offers || []).map((r) => ({ ...r, _key: r.id }))}
                loading={loading && !data}
                error={offersT?.error || ''}
                onRetry={reload}
                rowKey="_key"
              />
            </>
          ) : (
            <>
              {eligibleT?.note && <p className={`mb-2 text-xs ${MUTED}`}>{eligibleT.note}</p>}
              <DataTable
                columns={[
                  { key: 'title', label: 'Item', render: (r) => <span className="block max-w-[320px]"><span className="block truncate font-medium">{r.title || `Item ${r.listingId}`}</span><span className={`text-xs ${MUTED}`}>Item {r.listingId}{r.sku ? ` · ${r.sku}` : ''}</span></span> },
                  { key: 'listPrice', label: 'Your price', render: (r) => usd(r.listPrice) },
                  { key: 'url', label: '', render: (r) => (r.url ? <a href={r.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline dark:text-indigo-400">View on eBay ↗</a> : null) },
                  { key: 'actions', label: '', render: (r) => <RowActions main={{ label: 'Send offer', primary: true, onClick: () => setSending(r) }} /> },
                ]}
                rows={(eligible || []).map((r) => ({ ...r, _key: r.listingId }))}
                loading={loading && !data}
                error={eligibleT?.error || ''}
                onRetry={reload}
                rowKey="_key"
              />
            </>
          )}
        </div>
      )}
      {countering && <CounterModal offer={countering} onClose={() => setCountering(null)} onDone={(text) => { setCountering(null); done(text) }} />}
      {sending && <OfferModal item={sending} token={token} onClose={() => setSending(null)} onSuccess={() => done('Offer sent to the buyers watching this item.')} />}
    </div>
  )
}
