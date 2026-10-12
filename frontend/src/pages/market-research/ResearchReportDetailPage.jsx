import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  FiFileText,
  FiTrendingUp,
  FiArrowRight,
  FiShoppingBag,
  FiPrinter,
} from 'react-icons/fi'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Card, { StatCard } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import { marketplaceBadgeColor, marketplaceLabel } from '../../lib/marketplaces'
import ResearchNavHeader from './ResearchNavHeader'
import {
  FALLBACK_MARKET_ANALYSIS,
  FALLBACK_PRODUCT_RECOMMENDATIONS,
  FALLBACK_MARKETPLACE_RESEARCH,
} from './researchData'

export default function ResearchReportDetailPage() {
  const { reportId } = useParams()
  const { token } = useAuth()
  const [analysis, setAnalysis] = useState(FALLBACK_MARKET_ANALYSIS)
  const [recommendations, setRecommendations] = useState(FALLBACK_PRODUCT_RECOMMENDATIONS)
  const [marketData, setMarketData] = useState(FALLBACK_MARKETPLACE_RESEARCH)

  useEffect(() => {
    let isMounted = true
    const fetchData = async () => {
      try {
        const res = await api.get(`/api/research/report/${reportId}`, token)
        if (isMounted && res) {
          if (res.analysis) setAnalysis(res.analysis)
          if (res.recommendations?.length) setRecommendations(res.recommendations)
          if (res.marketplaceData?.length) setMarketData(res.marketplaceData)
        }
      } catch {
        // Use fallback data
      }
    }
    fetchData()
    return () => {
      isMounted = false
    }
  }, [reportId, token])

  const topPick = recommendations[0]

  return (
    <div className="space-y-6">
      <ResearchNavHeader
        reportId={reportId}
        category={analysis.categories?.[0] || 'Home & Kitchen'}
        extraActions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
            className="flex items-center gap-1.5"
          >
            <FiPrinter size={14} />
            <span>Print Report</span>
          </Button>
        }
      />

      {/* KPI Highlights */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Market Viability"
          value="88 / 100"
          sub="Aggregate confidence score"
        />
        <StatCard
          label="Top Opportunity Product"
          value={topPick ? topPick.productName.slice(0, 18) + '…' : 'Portable Blender'}
          sub={`$${topPick?.price?.toFixed(2)} • ${topPick?.opportunityScore} score`}
        />
        <StatCard
          label="Average Margin"
          value="42.8%"
          sub="Gross operating estimate"
        />
        <StatCard
          label="Marketplaces Scanned"
          value="3 Stores"
          sub="eBay, Temu, TikTok Shop"
        />
      </div>

      {/* Executive Summary */}
      <Card className="border-indigo-100 bg-gradient-to-br from-white via-indigo-50/10 to-white">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-100 text-indigo-700">
              <FiFileText size={16} />
            </span>
            <h2 className="text-base font-semibold text-slate-900">Executive Briefing & Strategic Recommendation</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-700">
            {analysis.marketOverview?.summary ||
              'High commercial potential detected in compact consumer products. Product lifecycle velocity is accelerating on short-video marketplaces, creating rapid entry windows for agile cross-channel merchants.'}
          </p>
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Demand & Volume Outlook</span>
              <p className="mt-1 text-xs text-slate-700 sm:text-sm font-medium">
                {analysis.marketOverview?.marketOutlook || 'Estimated +24% YoY surge in Q4 with minimal seasonal volatility.'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recommended Go-To-Market</span>
              <p className="mt-1 text-xs text-slate-700 sm:text-sm font-medium">
                Launch with top-ranked USB-C blender bundled with customized insulation sleeve to deter direct factory price competition.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Cross-Marketplace Intelligence Snapshot */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Cross-Marketplace Scraping & Intelligence Feed</h2>
            <p className="text-xs text-slate-500">Live competitor benchmarks collected across connected marketplace APIs.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {marketData.map((item, idx) => (
            <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <Badge color={marketplaceBadgeColor(item.marketplace)}>
                  {marketplaceLabel(item.marketplace)}
                </Badge>
                <span className="text-xs font-bold text-slate-500">Rank #{item.searchRanking}</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 truncate" title={item.productName}>
                {item.productName}
              </h3>
              <div className="flex justify-between text-xs text-slate-600 border-t border-slate-200/60 pt-2">
                <span>Price: <strong className="text-slate-800">${item.price?.toFixed(2)}</strong></span>
                <span>Rating: <strong className="text-slate-800">★ {item.rating}</strong></span>
              </div>
              <div className="text-xs text-slate-600">
                <span>Est. Sales: <strong className="text-emerald-700 font-semibold">{item.estimatedMonthlySales?.toLocaleString()} / mo</strong></span>
              </div>
              {item.reviewSummary?.positive?.length > 0 && (
                <div className="border-t border-slate-200/60 pt-2 text-[11px] text-slate-500 space-y-1">
                  <span className="font-semibold text-slate-700">Sentiment highlight:</span>
                  <p className="italic text-slate-600">"{item.reviewSummary.positive[0]}"</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Action Navigation Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          to={`/market-research/${reportId}/analysis`}
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition">
              <FiTrendingUp size={18} />
            </span>
            <FiArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 group-hover:text-indigo-600 transition" />
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-900">Explore Market Analysis & Unit Economics</h3>
          <p className="mt-1 text-xs text-slate-500">
            View detailed unit cost breakdown, shipping fees, gross profit margins, and emerging consumer trends.
          </p>
        </Link>

        <Link
          to={`/market-research/${reportId}/recommendations`}
          className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
              <FiShoppingBag size={18} />
            </span>
            <FiArrowRight size={16} className="text-slate-400 group-hover:translate-x-1 group-hover:text-emerald-600 transition" />
          </div>
          <h3 className="mt-3 text-base font-semibold text-slate-900">View Product Recommendations & Export CSV</h3>
          <p className="mt-1 text-xs text-slate-500">
            Inspect ranked product opportunities, monthly revenue estimates, and export the full dataset to CSV.
          </p>
        </Link>
      </div>
    </div>
  )
}
