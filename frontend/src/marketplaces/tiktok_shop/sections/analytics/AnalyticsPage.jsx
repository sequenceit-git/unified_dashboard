/**
 * TikTok Shop analytics: shop health first, then sales against the previous period, then why —
 * where sales come from, traffic, top products and today by hour.
 */
import { useMemo, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import { queryString } from '../../../../lib/api'
import { Select } from '../../../../components/ui/Input'
import { useApi } from '../../../../hooks/useApi'
import ShopHealth from './ShopHealth'
import ResultTiles from './ResultTiles'
import RevenueChart from './RevenueChart'
import ChannelShare from './ChannelShare'
import TrafficChart from './TrafficChart'
import TopSkus from './TopSkus'
import TodayByHour from './TodayByHour'
import DetailModal from './DetailModal'
import { PERIODS, channelShare, healthView, periodRanges, today, totals, trafficRows, withPrevious } from './analyticsView'

export default function AnalyticsPage() {
  const { token } = useAuth()
  const section = useShopSection()
  const [days, setDays] = useState('30')
  const [detail, setDetail] = useState(null)
  // Both periods end on TikTok's latest day with data (it lags a day or two), so neither looks short.
  const [endDay, setEndDay] = useState(() => today())
  const { current, previous } = useMemo(() => periodRanges(days, endDay), [days, endDay])
  const url = (path, range) => (token ? `/api/tiktok/analytics/${path}${queryString({ from: range.from, to: range.to })}` : null)

  const perf = useApi(url('performance', current))
  const prevPerf = useApi(url('performance', previous))
  const summary = useApi(url('summary', current))
  const prevSummary = useApi(url('summary', previous))
  const loader = useApi(token ? '/api/tiktok/sections/analytics' : null)

  const latest = perf.data?.source === 'tiktok' ? perf.data.latestDate : null
  // Adjusting state from fetched data during render (React's documented pattern); it only ever moves earlier.
  if (latest && latest < endDay) setEndDay(latest)

  if (!section) return <RequireShopSection />

  // A period from TikTok and one from the dashboard's orders measure different things: no change then.
  const comparable = Boolean(perf.data && prevPerf.data && perf.data.source === prevPerf.data.source)
  const now = totals(perf.data?.days)
  const before = comparable ? totals(prevPerf.data?.days) : {}
  const fromTikTok = perf.data?.source === 'tiktok'
  const traffic = trafficRows(perf.data?.days)
  const health = healthView(loader.data)
  const table = (id) => (loader.data?.tables || []).find((t) => t.id === id)
  const perfLoading = perf.loading || prevPerf.loading || Boolean(latest && latest < endDay)
  const perfError = perf.error || prevPerf.error || ''
  const retryPerf = () => { perf.refetch(); prevPerf.refetch() }

  return (
    <div className="max-w-full min-w-0 space-y-4 overflow-x-hidden">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{section.label} analytics</h1>
          {latest && <p className="text-xs text-gray-500">{current.from} to {current.to} · TikTok has data up to {latest}</p>}
          {perf.data && !fromTikTok && <p className="text-xs text-gray-500">TikTok isn't sharing its analytics: figures come from the dashboard's orders.</p>}
        </div>
        <div className="w-full sm:w-44">
          <Select value={days} onChange={(e) => setDays(e.target.value)} options={PERIODS} aria-label="Analytics period" />
        </div>
      </div>

      <ShopHealth health={health} loading={loader.loading} error={loader.error} onRetry={loader.refetch} onDiagnose={(id) => setDetail({ action: 'metric', id })} />

      <ResultTiles
        now={now}
        before={before}
        profit={summary.data?.profit ?? null}
        prevProfit={comparable ? prevSummary.data?.profit ?? null : null}
        loading={perfLoading || summary.loading || prevSummary.loading}
        error={perfError}
        onRetry={retryPerf}
        traffic={fromTikTok && traffic.length > 0}
      />

      <RevenueChart
        data={perf.data ? withPrevious(perf.data.days, comparable ? prevPerf.data?.days : [], days, current.from) : null}
        loading={perfLoading}
        error={perfError}
        onRetry={retryPerf}
      />

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <ChannelShare channels={channelShare(perf.data?.days)} loading={perfLoading} />
        <TrafficChart rows={traffic} loading={perfLoading} />
      </div>

      <TopSkus table={table('skus')} loading={loader.loading} error={loader.error} onRetry={loader.refetch} onDetails={(id) => setDetail({ action: 'sku', id })} />

      <TodayByHour table={table('hourly')} />

      {detail && <DetailModal action={detail.action} id={detail.id} onClose={() => setDetail(null)} />}
    </div>
  )
}
