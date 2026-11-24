/**
 * eBay analytics: what needs attention, then sales and traffic against the previous period, then
 * why — revenue and traffic by day, each listing's traffic, and the seller level.
 */
import { useMemo, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import { queryString } from '../../../../lib/api'
import { Select } from '../../../../components/ui/Input'
import { useApi } from '../../../../hooks/useApi'
import ReconnectNotice from '../../ReconnectNotice'
import NeedsAttention from './NeedsAttention'
import { SalesTiles, TrafficTiles } from './ResultTiles'
import RevenueChart from './RevenueChart'
import TrafficChart from './TrafficChart'
import ListingsTable from './ListingsTable'
import SellerLevel from './SellerLevel'
import DetailModal from './DetailModal'
import { EBAY_TZ, PERIODS, attentionItems, fillDays, periodRanges, trafficTotals, withPrevious, yesterday } from './analyticsView'

export default function AnalyticsPage() {
  const { token } = useAuth()
  const section = useShopSection()
  const [days, setDays] = useState('30')
  const [detail, setDetail] = useState(null)
  // Whole days ending yesterday (eBay's traffic has no today), moved to eBay's last traffic day if earlier.
  const [endDay, setEndDay] = useState(() => yesterday())
  const { current, previous } = useMemo(() => periodRanges(days, endDay), [days, endDay])
  const url = (path, range, extra = {}) => (token ? `/api/ebay/analytics/${path}${queryString({ from: range.from, to: range.to, ...extra })}` : null)

  // Sales use eBay's days (US Pacific) so they cover the same days as eBay's traffic.
  const summary = useApi(url('summary', current, { tz: EBAY_TZ }))
  const prevSummary = useApi(url('summary', previous, { tz: EBAY_TZ }))
  const revenue = useApi(url('revenue', current, { tz: EBAY_TZ }))
  const prevRevenue = useApi(url('revenue', previous, { tz: EBAY_TZ }))
  const traffic = useApi(url('traffic', current))
  const prevTraffic = useApi(url('traffic', previous))
  const inv = useApi(token ? '/api/ebay/analytics/inventory' : null)
  const loader = useApi(token ? '/api/ebay/sections/analytics' : null)

  // Adjusting state from fetched data during render (React's documented pattern); it only moves earlier.
  const latest = traffic.data?.latestDate || null
  if (latest && latest < endDay) setEndDay(latest)

  if (!section) return <RequireShopSection />

  const table = (id) => (loader.data?.tables || []).find((t) => t.id === id)
  const standards = table('standards')
  const service = table('service')
  const items = attentionItems({ standards: standards?.rows, service: service?.rows, inventory: inv.data })
  const checkError = loader.error || standards?.error || service?.error || inv.error || ''
  const salesLoading = summary.loading || prevSummary.loading
  const settling = Boolean(latest && latest < endDay)
  const trafficLoading = traffic.loading || prevTraffic.loading || settling
  const retryTraffic = () => { traffic.refetch(); prevTraffic.refetch() }
  const trafficError = traffic.error || prevTraffic.error || ''

  return (
    <div className="max-w-full min-w-0 space-y-4 overflow-x-hidden">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{section.label} analytics</h1>
          <p className="text-xs text-gray-500">{current.from} to {current.to} (US Pacific days, as eBay counts them){latest && <> · eBay traffic up to {latest}</>}</p>
        </div>
        <div className="w-full sm:w-44">
          <Select value={days} onChange={(e) => setDays(e.target.value)} options={PERIODS} aria-label="Analytics period" />
        </div>
      </div>

      <ReconnectNotice />

      <NeedsAttention items={items} loading={loader.loading || inv.loading} error={checkError} onRetry={() => { loader.refetch(); inv.refetch() }} onDetail={setDetail} />

      <SalesTiles now={summary.data} before={prevSummary.data} loading={salesLoading} error={summary.error || prevSummary.error || ''} onRetry={() => { summary.refetch(); prevSummary.refetch() }} />
      <TrafficTiles now={trafficTotals(traffic.data?.days)} before={trafficTotals(prevTraffic.data?.days)} loading={trafficLoading} error={trafficError} onRetry={retryTraffic} />

      <RevenueChart
        data={revenue.data ? withPrevious(revenue.data, prevRevenue.data, days, current.from) : null}
        loading={revenue.loading || prevRevenue.loading || settling}
        error={revenue.error || prevRevenue.error || ''}
        onRetry={() => { revenue.refetch(); prevRevenue.refetch() }}
      />
      <TrafficChart days={traffic.data ? fillDays(traffic.data.days, current.from, current.to) : null} loading={trafficLoading} error={trafficError} />

      <ListingsTable table={table('traffic')} loading={loader.loading} error={loader.error} onRetry={loader.refetch} />

      <SellerLevel standards={standards} service={service} loading={loader.loading} error={loader.error} onRetry={loader.refetch} onDetail={setDetail} />

      {detail && <DetailModal action={detail.action} id={detail.id} onClose={() => setDetail(null)} />}
    </div>
  )
}
