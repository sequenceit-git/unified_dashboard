/**
 * Temu analytics: is anything wrong (Needs attention), then how the shop sells (results vs the
 * previous period, revenue by day, top goods), store health, and ads once Temu Ads is on.
 */
import { useMemo, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import { queryString } from '../../../../lib/api'
import { Select } from '../../../../components/ui/Input'
import { useApi } from '../../../../hooks/useApi'
import RevenueChart from './RevenueChart'
import TopProducts from './TopProducts'
import NeedsAttention from './NeedsAttention'
import ResultTiles from './ResultTiles'
import StoreHealth from './StoreHealth'
import AdsPanel from './AdsPanel'
import { PERIODS, attentionItems, insights, periodRanges, trafficByGoods, viewerZone, withPrevious } from './analyticsView'

const TZ = viewerZone()

export default function AnalyticsPage() {
  const { token } = useAuth()
  const section = useShopSection()
  const [days, setDays] = useState('30')
  const { current, previous } = useMemo(() => periodRanges(days), [days])
  const url = (path, range, extra = {}) => (token ? `/api/temu/analytics/${path}${queryString({ from: range.from, to: range.to, ...extra })}` : null)

  const summary = useApi(url('summary', current))
  const prevSummary = useApi(url('summary', previous))
  const revenue = useApi(url('revenue', current, { tz: TZ }))
  const prevRevenue = useApi(url('revenue', previous, { tz: TZ }))
  const top = useApi(url('products', current, { limit: 10 }))
  const inv = useApi(token ? '/api/temu/analytics/inventory' : null)
  const temu = useApi(token ? '/api/temu/sections/analytics' : null)

  if (!section) return <RequireShopSection />

  const health = insights(temu.data)
  const returnsPer100 = health.tile('returns-per-100')
  const items = attentionItems({ traffic: health.traffic, inventory: inv.data, returnsPer100 })
  const checkError = temu.error || health.trafficError || inv.error || ''
  const retryChecks = () => { temu.refetch(); inv.refetch() }
  const resultsError = summary.error || prevSummary.error || ''

  return (
    <div className="max-w-full min-w-0 space-y-4 overflow-x-hidden">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <h1 className="text-xl font-bold sm:text-2xl">{section.label} analytics</h1>
        <div className="w-full sm:w-44">
          <Select value={days} onChange={(e) => setDays(e.target.value)} options={PERIODS} aria-label="Analytics period" />
        </div>
      </div>

      <NeedsAttention items={items} loading={temu.loading || inv.loading} error={checkError} onRetry={retryChecks} />

      <ResultTiles
        current={summary.data}
        previous={prevSummary.data}
        loading={summary.loading || prevSummary.loading}
        error={resultsError}
        onRetry={() => { summary.refetch(); prevSummary.refetch() }}
        returnsPer100={returnsPer100}
      />

      <RevenueChart
        data={revenue.data ? withPrevious(revenue.data, prevRevenue.data, days, current.from) : null}
        loading={revenue.loading || prevRevenue.loading}
        error={revenue.error || prevRevenue.error || ''}
        onRetry={() => { revenue.refetch(); prevRevenue.refetch() }}
      />

      <div className="grid min-w-0 gap-3 lg:grid-cols-2">
        <TopProducts rows={top.data} loading={top.loading} error={top.error} onRetry={top.refetch} traffic={trafficByGoods(health.traffic)} />
        <StoreHealth
          tags={health.tags}
          tagsError={health.tagsError}
          cancelsPer100={health.tile('cancels-per-100')}
          loading={temu.loading}
          error={temu.error}
          onRetry={temu.refetch}
        />
      </div>

      {health.adsShown && <AdsPanel spend={health.tile('ad-spend')} share={health.tile('ad-share')} />}
    </div>
  )
}
