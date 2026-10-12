import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  FiDownload,
  FiExternalLink,
  FiAward,
  FiStar,
  FiCheckCircle,
} from 'react-icons/fi'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { useAuth } from '../../../auth/AuthContext'
import { api } from '../../../lib/api'
import Button from '../../../components/ui/Button'
import Card, { StatCard } from '../../../components/ui/Card'
import Badge from '../../../components/ui/Badge'
import { marketplaceBadgeColor, marketplaceLabel } from '../../../lib/marketplaces'
import ResearchNavHeader from '../ResearchNavHeader'
import { FALLBACK_PRODUCT_RECOMMENDATIONS } from '../researchData'

export default function ProductRecommendationsPage() {
  const { reportId } = useParams()
  const { token } = useAuth()
  const [recommendations, setRecommendations] = useState(FALLBACK_PRODUCT_RECOMMENDATIONS)
  const [downloadSuccess, setDownloadSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let isMounted = true
    const fetchData = async () => {
      try {
        setLoading(true)
        const res = await api.get(`/api/research/recommendations/${reportId}`, token)
        if (isMounted && Array.isArray(res) && res.length > 0) {
          setRecommendations(res)
        }
      } catch {
        // Graceful fallback to bundled recommendations
      } finally {
        if (isMounted) setLoading(false)
      }
    }
    fetchData()
    return () => { isMounted = false }
  }, [reportId, token])

  // Export as CSV functionality
  const handleExportCSV = () => {
    const headers = [
      'Rank', 'Product Name', 'Category', 'Marketplace', 'Price (USD)',
      'Estimated Monthly Sales', 'Estimated Monthly Revenue', 'Rating', 'Review Count',
      'Competition Level', 'Profit Margin (%)', 'Opportunity Score (0-100)',
      'Recommendation Reason', 'Product URL',
    ]

    const rows = recommendations.map((r) => [
      r.rank,
      `"${(r.productName || '').replace(/"/g, '""')}"`,
      `"${r.category || ''}"`,
      r.marketplace || '',
      r.price ?? '',
      r.estimatedMonthlySales ?? '',
      r.estimatedMonthlyRevenue ?? '',
      r.rating ?? '',
      r.reviewCount ?? '',
      r.competitionLevel || '',
      r.estimatedProfitMarginPercent ?? '',
      r.opportunityScore ?? '',
      `"${(r.recommendationReason || '').replace(/"/g, '""')}"`,
      `"${r.productUrl || ''}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', `product_recommendations_${reportId || 'report'}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setDownloadSuccess(true)
    setTimeout(() => setDownloadSuccess(false), 3500)
  }

  // Aggregate metrics
  const totalRev = recommendations.reduce((sum, r) => sum + (r.estimatedMonthlyRevenue || 0), 0)
  const avgScore = recommendations.length
    ? Math.round(recommendations.reduce((sum, r) => sum + (r.opportunityScore || 0), 0) / recommendations.length)
    : 0
  const avgMargin = recommendations.length
    ? (recommendations.reduce((sum, r) => sum + (r.estimatedProfitMarginPercent || 0), 0) / recommendations.length).toFixed(1)
    : 0

  // Chart data
  const chartData = recommendations.map((r) => ({
    name: `#${r.rank} ${r.productName.slice(0, 16)}…`,
    fullName: r.productName,
    score: r.opportunityScore || 0,
    margin: r.estimatedProfitMarginPercent || 0,
    sales: r.estimatedMonthlySales || 0,
  }))

  const getCompetitionBadge = (level) => {
    if (level === 'Low') return 'green'
    if (level === 'Medium') return 'amber'
    return 'red'
  }

  return (
    <div className="space-y-6">
      {/* Header with Export CSV button */}
      <ResearchNavHeader
        reportId={reportId}
        category={recommendations[0]?.category || 'Home & Kitchen'}
        extraActions={
          <Button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <FiDownload size={15} />
            <span>Export as CSV</span>
          </Button>
        }
      />

      {/* CSV Export Success Message */}
      {downloadSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm transition">
          <FiCheckCircle className="shrink-0 text-emerald-600" size={18} />
          <span>Product recommendations CSV downloaded successfully!</span>
        </div>
      )}

      {/* High-level KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Top Ranked Products" value={recommendations.length} sub="Filtered by opportunity threshold" />
        <StatCard label="Average Opportunity Score" value={`${avgScore} / 100`} sub="Algorithmic market potential" />
        <StatCard label="Est. Monthly Revenue Pool" value={`$${totalRev.toLocaleString()}`} sub="Across analyzed product listings" />
        <StatCard label="Average Profit Margin" value={`${avgMargin}%`} sub="Net margin before marketing" />
      </div>

      {/* Visual Chart: Opportunity Score & Margin Comparison */}
      <Card>
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Ranked Opportunities Comparison</h2>
            <p className="text-xs text-slate-500">Visual comparison of Opportunity Score vs. Estimated Profit Margin %</p>
          </div>
          <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            Top {recommendations.length} Products
          </span>
        </div>
        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} interval={0} angle={-10} textAnchor="end" />
              <YAxis tick={{ fontSize: 11, fill: '#64748B' }} domain={[0, 100]} />
              <Tooltip
                formatter={(val, name) => [
                  name === 'score' ? `${val}/100` : `${val}%`,
                  name === 'score' ? 'Opportunity Score' : 'Profit Margin',
                ]}
                labelFormatter={(name, items) => items?.[0]?.payload?.fullName || name}
                contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '12px' }}
              />
              <Bar dataKey="score" fill="#4F46E5" radius={[6, 6, 0, 0]} name="Opportunity Score" />
              <Bar dataKey="margin" fill="#10B981" radius={[6, 6, 0, 0]} name="Profit Margin %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Main Recommendations Table */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Recommended Product Catalog</h2>
            <p className="text-xs text-slate-500">Ranked by opportunity score, estimated demand velocity, and margin potential.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleExportCSV} className="hidden sm:flex items-center gap-1.5">
            <FiDownload size={14} />
            <span>Download CSV</span>
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50/80">
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3 font-semibold text-center w-12">Rank</th>
                <th className="px-4 py-3 font-semibold">Product Title & Link</th>
                <th className="px-3 py-3 font-semibold">Marketplace</th>
                <th className="px-3 py-3 font-semibold">Retail Price</th>
                <th className="px-3 py-3 font-semibold">Monthly Sales / Rev</th>
                <th className="px-3 py-3 font-semibold">Rating</th>
                <th className="px-3 py-3 font-semibold">Competition</th>
                <th className="px-3 py-3 font-semibold">Margin</th>
                <th className="px-3 py-3 font-semibold text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recommendations.map((item) => (
                <tr key={item._id || item.rank} className="transition hover:bg-slate-50/70">
                  <td className="px-3 py-3.5 text-center">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-50 font-bold text-xs text-indigo-700 mx-auto">
                      #{item.rank}
                    </span>
                  </td>

                  <td className="px-4 py-3.5">
                    <div className="max-w-xs">
                      <a
                        href={item.productUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="group inline-flex items-center gap-1 font-semibold text-slate-900 hover:text-indigo-600 transition"
                      >
                        <span className="truncate">{item.productName}</span>
                        <FiExternalLink size={12} className="opacity-0 group-hover:opacity-100 transition shrink-0" />
                      </a>
                      <p className="mt-0.5 text-xs leading-normal text-slate-500 line-clamp-2">
                        {item.recommendationReason}
                      </p>
                    </div>
                  </td>

                  <td className="px-3 py-3.5">
                    <Badge color={marketplaceBadgeColor(item.marketplace)}>
                      {marketplaceLabel(item.marketplace)}
                    </Badge>
                  </td>

                  <td className="px-3 py-3.5 font-semibold text-slate-800">
                    ${item.price?.toFixed(2)}
                  </td>

                  <td className="px-3 py-3.5">
                    <span className="font-semibold text-slate-900">{item.estimatedMonthlySales?.toLocaleString()} units</span>
                    <span className="block text-xs text-emerald-600 font-medium">
                      ${item.estimatedMonthlyRevenue?.toLocaleString()}/mo
                    </span>
                  </td>

                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-1">
                      <FiStar size={13} className="text-amber-500 fill-amber-500" />
                      <span className="font-semibold text-slate-800">{item.rating?.toFixed(1)}</span>
                      <span className="text-xs text-slate-400">({item.reviewCount?.toLocaleString()})</span>
                    </div>
                  </td>

                  <td className="px-3 py-3.5">
                    <Badge color={getCompetitionBadge(item.competitionLevel)}>
                      {item.competitionLevel}
                    </Badge>
                  </td>

                  <td className="px-3 py-3.5">
                    <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      {item.estimatedProfitMarginPercent}%
                    </span>
                  </td>

                  <td className="px-3 py-3.5 text-right">
                    <div className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-2.5 py-1 text-xs font-black text-indigo-700">
                      <FiAward size={13} />
                      <span>{item.opportunityScore}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
