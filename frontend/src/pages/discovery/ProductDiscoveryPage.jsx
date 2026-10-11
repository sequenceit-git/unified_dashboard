import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api, queryString } from '../../lib/api'
import { useApi } from '../../hooks/useApi'
import { StatCard } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import OpportunityCard from './OpportunityCard'
import RunDiscoveryModal from './RunDiscoveryModal'

const CATEGORY_TABS = [
  { id: 'All', label: 'All Categories' },
  { id: 'Home & Kitchen', label: 'Home & Kitchen' },
  { id: 'Electronics', label: 'Electronics' },
  { id: 'Sports & Fitness', label: 'Sports & Fitness' },
  { id: 'Beauty & Personal Care', label: 'Beauty & Personal Care' },
  { id: 'Accessories', label: 'Accessories' },
  { id: 'Pet Supplies', label: 'Pet Supplies' },
]

export default function ProductDiscoveryPage() {
  const { token, isAdmin } = useAuth()
  const [activeCategory, setActiveCategory] = useState('All')
  const [modalOpen, setModalOpen] = useState(false)
  const [runningAgent, setRunningAgent] = useState(false)
  const [notification, setNotification] = useState('')

  // 1. Fetch overview stats
  const overviewRes = useApi(token ? '/api/discovery/overview' : null)
  // 2. Fetch trending opportunities
  const trendingRes = useApi(token ? `/api/discovery/trending${queryString({ category: activeCategory })}` : null, [activeCategory])

  const overview = overviewRes.data || {}
  const trending = trendingRes.data || {}
  const opportunities = trending.opportunities || []

  const showNotification = (msg) => {
    setNotification(msg)
    setTimeout(() => setNotification(''), 4500)
  }

  // Run discovery agent
  const handleRunAgent = async (params) => {
    setRunningAgent(true)
    try {
      await api.post('/api/discovery/run', params, token)
      setModalOpen(false)
      showNotification('AI Market Research Agent run completed! Opportunities updated.')
      trendingRes.refetch()
      overviewRes.refetch()
    } catch (err) {
      alert(`Agent run failed: ${err.message}`)
    } finally {
      setRunningAgent(false)
    }
  }

  // Add discovered opportunity to product catalog
  const handleAddToCatalog = async ({ reportId, rank, title, price, stock }) => {
    try {
      const res = await api.post(
        '/api/discovery/add-to-catalog',
        { reportId: reportId || trending.reportId, rank, title, price, stock },
        token,
      )
      showNotification(`"${res.product.title}" has been added to your Product Catalog with SKU ${res.product.sku}!`)
      trendingRes.refetch()
      overviewRes.refetch()
    } catch (err) {
      alert(`Failed to add to catalog: ${err.message}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 animate-pulse"></span>
              Autonomous AI Market Agent
            </span>
          </div>
          <h1 className="page-heading mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
            Product Discovery
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time market signals, profit margin analytics, and opportunity discovery across eBay, TikTok Shop, and Temu.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button onClick={() => setModalOpen(true)} size="md">
              ✦ Launch AI Agent
            </Button>
          </div>
        )}
      </div>

      {/* Floating Notification Alert */}
      {notification && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-xs flex items-center justify-between">
          <span>✓ {notification}</span>
          <button onClick={() => setNotification('')} className="text-emerald-600 hover:text-emerald-900">✕</button>
        </div>
      )}

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Top Opportunities"
          value={overviewRes.loading ? '…' : (overview.latestOpportunitiesCount ?? opportunities.length)}
          sub="Discovered by Agent"
        />
        <StatCard
          label="High Potential (≥80)"
          value={overviewRes.loading ? '…' : (overview.highPotentialCount ?? 0)}
          sub="Exceptional Demand & Margin"
        />
        <StatCard
          label="Catalog Products Added"
          value={overviewRes.loading ? '…' : (overview.productsAddedFromBot ?? 0)}
          sub="Direct from AI Agent"
        />
        <StatCard
          label="AI Research Reports"
          value={overviewRes.loading ? '…' : (overview.totalReports ?? 0)}
          sub={overview.lastRunAt ? `Last: ${new Date(overview.lastRunAt).toLocaleDateString()}` : 'Ready to run'}
        />
      </div>

      {/* Category Tabs */}
      <div className="space-y-4">
        <Tabs tabs={CATEGORY_TABS} active={activeCategory} onChange={setActiveCategory} />

        {trending.summary && (
          <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-purple-50/50 p-4 text-xs sm:text-sm text-indigo-950 shadow-xs">
            <span className="font-bold text-indigo-700 uppercase tracking-wider text-[11px] block mb-1">
              Latest Agent Market Intelligence
            </span>
            {trending.summary}
          </div>
        )}

        {/* Content Section */}
        {trendingRes.loading ? (
          <Spinner />
        ) : trendingRes.error ? (
          <ErrorState message={trendingRes.error} onRetry={trendingRes.refetch} />
        ) : opportunities.length === 0 ? (
          <EmptyState
            title="No opportunities found"
            message="No products found matching the selected category. Launch the AI agent to discover new opportunities."
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {opportunities.map((opp) => (
              <OpportunityCard
                key={`${opp.rank}-${opp.title}`}
                opportunity={opp}
                reportId={trending.reportId}
                onAddToCatalog={handleAddToCatalog}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <RunDiscoveryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onRun={handleRunAgent}
        running={runningAgent}
      />
    </div>
  )
}
