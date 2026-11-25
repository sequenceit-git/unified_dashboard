/**
 * Temu price reviews: reviews waiting for your answer first (Temu code 101), all reviews, Temu's
 * price guide (your price vs Temu's recommendation, highest above first) and current prices.
 * Answering a review is done in Temu Seller Center (the dashboard doesn't call Temu's accept/decline).
 */
import { useState } from 'react'
import { useApi } from '../../../../hooks/useApi'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import RequireShopSection from '../../../../components/RequireShopSection'
import ShopSectionGate from '../../../../components/ShopSectionGate'
import { useShopSection } from '../../../../hooks/useShopSection'
import Badge from '../../../../components/ui/Badge'
import Button from '../../../../components/ui/Button'
import DataTable from '../../../../components/ui/DataTable'
import { ErrorState } from '../../../../components/ui/Feedback'
import PageHeader from '../../ui/PageHeader'
import AttentionStrip from '../../ui/AttentionStrip'
import StatusPills from '../../ui/StatusPills'
import { formatCell } from '../../sectionFormat'
import { priceAttention, priceCounts, pricePills, priceSummary } from './pricesView'

const money = (v) => formatCell('money', v)

export default function PriceReviewsPage() {
  return <ShopSectionGate sectionId="price-reviews"><PriceReviews /></ShopSectionGate>
}

function PriceReviews() {
  const section = useShopSection()
  const [pill, setPill] = useState('waiting')
  const [fresh, setFresh] = useState(0)
  const { data, loading, error, refetch } = useApi(`/api/temu/sections/price-reviews${fresh ? `?refresh=1&n=${fresh}` : ''}`)
  // Live reloads use the cached address again (a forced Refresh must not make every sync event call the shop's API).
  useSyncReload('listings', section?.marketplace, () => (fresh ? setFresh(0) : refetch()))
  if (!section) return <RequireShopSection />

  const table = (id) => (data?.tables || []).find((t) => t.id === id)
  const c = priceCounts(data)
  // Reviews Temu didn't load: open on the price guide instead of an empty "Waiting for you".
  const active = (pill === 'waiting' || pill === 'reviews') && table('reviews')?.error && !table('pricing')?.error ? 'guide' : pill
  const reload = () => setFresh((n) => n + 1)
  const reviewCols = [
    { key: 'product', label: 'Product', render: (r) => <span><span className="font-medium">{r.product || '—'}</span><span className="block text-xs text-gray-500 dark:text-slate-400">Goods {r.goodsId} · review {r.id}</span></span> },
    { key: 'status', label: 'Status', render: (r) => <Badge color={r.waiting ? 'yellow' : /approved|confirmed/i.test(r.status) ? 'green' : /reject|refus/i.test(r.status) ? 'red' : 'blue'}>{r.status}</Badge> },
    { key: 'yourPrice', label: 'Price in review', render: (r) => money(r.yourPrice) },
    { key: 'suggested', label: 'Temu suggests', render: (r) => money(r.suggested) },
  ]
  const reviews = table('reviews')
  const shown = (reviews?.rows || []).filter((r) => (active === 'waiting' ? r.waiting : true)).map((r) => ({ ...r, _key: String(r.id) }))

  return (
    <div className="space-y-3">
      <PageHeader
        title="Temu price reviews"
        summary={[priceSummary(c), data?.loadedAt && `updated ${new Date(data.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join(' · ')}
        actions={<Button variant="secondary" disabled={loading} onClick={reload}>{loading ? 'Refreshing…' : 'Refresh'}</Button>}
      />
      {error && <ErrorState message={error} onRetry={refetch} />}
      <AttentionStrip items={priceAttention(c)} onPick={(i) => setPill(i.pill)} />
      <StatusPills pills={pricePills(c)} active={active} onChange={setPill} />
      {!(error && !data) && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          {(active === 'waiting' || active === 'reviews') && (
            <>
              {active === 'waiting' && <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">Answer these in Temu Seller Center → Price management (confirm Temu's price, keep yours, or set a new price after a rejection). They leave this list on the next refresh.</p>}
              <DataTable columns={reviewCols} rows={shown} loading={loading && !data} error={reviews?.error || ''} onRetry={reload} rowKey="_key" />
            </>
          )}
          {active === 'guide' && (
            <>
              <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">{table('pricing')?.note || "SKUs priced above Temu's recommendation come first: they are the ones a price review is most likely to reject."}</p>
              <DataTable
                columns={[
                  { key: 'product', label: 'Product', render: (r) => <span><span className="font-medium">{r.product || '—'}</span><span className="block text-xs text-gray-500 dark:text-slate-400">Goods {r.goodsId} · SKU {r.skuId}</span></span> },
                  { key: 'current', label: 'Your price', render: (r) => money(r.current) },
                  { key: 'recommended', label: 'Temu recommends', render: (r) => money(r.recommended) },
                  { key: 'difference', label: 'Difference', render: (r) => (r.difference == null ? '—' : <span className={r.difference > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}>{r.difference > 0 ? '+' : ''}{r.difference}%</span>) },
                ]}
                rows={(table('pricing')?.rows || []).map((r) => ({ ...r, _key: String(r.id) }))}
                loading={loading && !data}
                error={table('pricing')?.error || ''}
                onRetry={reload}
                rowKey="_key"
              />
            </>
          )}
          {active === 'current' && (
            <>
            <h3 className="mb-2 text-sm font-semibold">{table('catalog')?.title || 'Current goods prices'}</h3>
            <DataTable
              columns={(table('catalog')?.columns || []).map((col) => ({ key: col.key, label: col.label, render: (r) => formatCell(col.type, r[col.key]) }))}
              rows={(table('catalog')?.rows || []).map((r, i) => ({ ...r, _key: `${r.goods}-${r.sku}-${i}` }))}
              loading={loading && !data}
              error={table('catalog')?.error || ''}
              onRetry={reload}
              rowKey="_key"
            />
            </>
          )}
        </div>
      )}
    </div>
  )
}
