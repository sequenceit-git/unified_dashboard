import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FiPlus,
  FiTrendingUp,
  FiCheckCircle,
  FiDownload,
  FiFilter,
} from 'react-icons/fi'
import { TbBrandOpenai } from 'react-icons/tb'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Spinner, EmptyState } from '../../components/ui/Feedback'
import Discovery2Overview from './Discovery2Overview'
import Discovery2Sidebar from './Discovery2Sidebar'
import OpportunityCard2 from './OpportunityCard2'
import NewRunModal from './NewRunModal'
import AgentProgressBar from './AgentProgressBar'

const TERMINAL_STATUSES = new Set(['completed', 'failed'])
const POLL_INTERVAL_MS = 2500

export default function ProductDiscovery2Page() {
  const { token, isAdmin } = useAuth()

  const [reports, setReports] = useState([])
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [loadingReports, setLoadingReports] = useState(true)
  const [loadingRecs, setLoadingRecs] = useState(false)
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('All')

  // Modal & Run State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')
  const [notification, setNotification] = useState('')
  const [pollingId, setPollingId] = useState(null)

  // ── Load all reports ─────────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    try {
      const res = await api.get('/api/research/reports', token)
      if (Array.isArray(res)) {
        setReports(res)
        if (res.length > 0 && !selectedReportId) {
          setSelectedReportId(res[0]._id)
        }
      }
    } catch {
      // silent
    } finally {
      setLoadingReports(false)
    }
  }, [token, selectedReportId])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  // ── Polling hook for active run ──────────────────────────────────────────
  const pollTimerRef = useRef(null)
  useEffect(() => {
    if (!pollingId || !token) return
    const poll = async () => {
      try {
        const data = await api.get(`/api/research/status/${pollingId}`, token)
        setReports((prev) =>
          prev.map((r) => (r._id === data._id ? { ...r, ...data } : r)),
        )
        if (TERMINAL_STATUSES.has(data.status)) {
          setPollingId(null)
          if (data.status === 'completed') {
            setNotification('Research run completed! New opportunities are ready.')
            setTimeout(() => setNotification(''), 5000)
            // Force recs to reload by briefly resetting selectedReportId
            setSelectedReportId(null)
            setTimeout(() => setSelectedReportId(data._id), 50)
          }
          loadReports()
        }
      } catch {
        setPollingId(null)
      }
    }

    poll()
    pollTimerRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [pollingId, token, loadReports])

  // ── Load recommendations for selected report ─────────────────────────────
  useEffect(() => {
    if (!selectedReportId || !token) return

    let isMounted = true
    const fetchRecs = async () => {
      setLoadingRecs(true)
      try {
        const res = await api.get(`/api/research/recommendations/${selectedReportId}`, token)
        if (isMounted) {
          setRecommendations(Array.isArray(res) ? res : [])
        }
      } catch {
        if (isMounted) setRecommendations([])
      } finally {
        if (isMounted) setLoadingRecs(false)
      }
    }

    fetchRecs()
    return () => {
      isMounted = false
    }
  }, [selectedReportId, token])

  // ── Start new research run ───────────────────────────────────────────────
  const handleLaunchRun = async (params) => {
    setIsSubmitting(true)
    setModalError('')
    try {
      const res = await api.post('/api/research/generate', params, token)
      setIsModalOpen(false)
      setNotification('Research job queued! Scanning marketplaces…')
      setTimeout(() => setNotification(''), 5000)
      if (res._id) {
        setPollingId(res._id)
        setSelectedReportId(res._id)
      }
      loadReports()
    } catch (err) {
      setModalError(err.message || 'Failed to trigger research run.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Export handlers ──────────────────────────────────────────────────────
  const handleExport = async (format = 'xlsx') => {
    if (!selectedReportId) return
    try {
      const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
      const url = `${BASE}/api/research/export/${selectedReportId}?format=${format}`
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = `product_recommendations_${selectedReportId.slice(-8)}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      alert(`Export failed: ${err.message}`)
    }
  }

  // ── Add Opportunity to Product Catalog ────────────────────────────────────
  const handleAddToCatalog = async ({ reportId, rank, title, price, stock }) => {
    try {
      const res = await api.post(
        '/api/research/add-to-catalog',
        { reportId, rank, title, price, stock },
        token,
      )
      if (res.product?._id) {
        setRecommendations((prev) =>
          prev.map((opp) =>
            opp.rank === rank ? { ...opp, addedProductId: res.product._id } : opp,
          ),
        )
        setNotification(`"${title}" successfully added to Products catalog!`)
        setTimeout(() => setNotification(''), 4000)
      }
    } catch (err) {
      alert(`Failed to add product to catalog: ${err.message}`)
    }
  }

  // ── Stats calculation ────────────────────────────────────────────────────
  const overviewStats = {
    totalReports: reports.length,
    totalRecommendations: recommendations.length,
    highScoreCount: recommendations.filter((r) => (r.opportunityScore ?? 0) >= 80).length,
    lastRunDate: reports[0]?.createdAt || null,
  }

  // Helper to extract category cleanly from an opportunity item
  const getOppCategory = (r) => {
    return (r?.category || r?.metrics?.category || '').trim()
  }

  // Categories list: Start with 'All', then collect all distinct categories in the report, supplemented by standard defaults
  const activeReportCategories = Array.from(
    new Set(recommendations.map(getOppCategory).filter(Boolean))
  )

  const DEFAULT_CATEGORIES = [
    'Home & Kitchen',
    'Electronics',
    'Sports & Fitness',
    'Beauty & Personal Care',
    'Accessories',
    'Pet Supplies',
  ]

  // Combine unique categories found + defaults, preserving nice order
  const dynamicCategories = [
    'All',
    ...Array.from(new Set([...activeReportCategories, ...DEFAULT_CATEGORIES])),
  ]

  // Count items per category in current report (normalized lowercase comparison)
  const categoryCounts = recommendations.reduce((acc, r) => {
    const cat = getOppCategory(r)
    if (cat) {
      acc[cat] = (acc[cat] || 0) + 1
      const lower = cat.toLowerCase()
      acc[lower] = (acc[lower] || 0) + 1
    }
    return acc
  }, {})

  // Filter recommendations matching the selected pill (handles exact or case-insensitive match)
  const filteredRecommendations = activeCategoryFilter === 'All'
    ? recommendations
    : recommendations.filter((r) => {
        const cat = getOppCategory(r).toLowerCase()
        const target = activeCategoryFilter.toLowerCase()
        return cat === target || cat.includes(target) || target.includes(cat)
      })

  const selectedReport = reports.find((r) => r._id === selectedReportId)
  const activeRunningReport = reports.find(
    (r) => (r._id === pollingId || r.status === 'running' || r.status === 'queued')
  )

  return (
    <div className="space-y-6">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-sm ring-1 ring-emerald-500/20">
              <TbBrandOpenai size={20} />
            </span>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-700/10">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                ChatGPT Powered
              </span>
              <span className="hidden text-xs text-gray-400 sm:inline">•</span>
              <span className="hidden text-xs font-medium text-gray-500 sm:inline">
                Autonomous Multi-Marketplace Intelligence
              </span>
            </div>
          </div>
          <h1 className="page-heading mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
            Product Discovery 2
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time market signals, profit margin analytics, and multi-channel opportunity discovery.
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button onClick={() => { setIsModalOpen(true); setModalError('') }} size="md" className="flex items-center gap-2">
              <TbBrandOpenai size={17} />
              <span>Launch AI Research</span>
            </Button>
          </div>
        )}
      </div>

      {/* ── Active Agent Workflow Loading Bar ────────────────────────────── */}
      {activeRunningReport && (
        <AgentProgressBar report={activeRunningReport} />
      )}

      {/* ── Notification Banner ──────────────────────────────────────────── */}
      {notification && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-xs">
          <span className="flex items-center gap-2">
            <FiCheckCircle className="text-emerald-600" size={17} />
            {notification}
          </span>
          <button onClick={() => setNotification('')} className="text-emerald-700 hover:text-emerald-950 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* ── KPI Overview ─────────────────────────────────────────────────── */}
      <Discovery2Overview stats={overviewStats} loading={loadingReports} />

      {/* ── Main Layout: Sidebar (Dates) + Content (Product Cards) ────────── */}
      <div className="flex flex-col gap-6 md:flex-row">
        {/* Left inner sidebar with date list */}
        <Discovery2Sidebar
          reports={reports}
          selectedReportId={selectedReportId}
          onSelectReport={(id) => {
            setSelectedReportId(id)
            setActiveCategoryFilter('All')
          }}
        />

        {/* Right product opportunities content */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Controls bar: Category filter pills + Export buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 text-xs font-semibold text-gray-500 mr-1">
                <FiFilter size={13} />
                <span>Category:</span>
              </span>
              {dynamicCategories.map((cat) => {
                const count = cat === 'All' ? recommendations.length : (categoryCounts[cat] || categoryCounts[cat.toLowerCase()] || 0)
                const isSelected = activeCategoryFilter.toLowerCase() === cat.toLowerCase()
                return (
                  <button
                    key={cat}
                    onClick={() => setActiveCategoryFilter(cat)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{cat}</span>
                    {count > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                          isSelected ? 'bg-indigo-500 text-white' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}

              {/* Download CSV button right beside categories (placeholder) */}
              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 hover:border-gray-300 hover:bg-gray-100 transition shadow-2xs"
                title="Download CSV for current report"
              >
                <FiDownload size={13} className="text-gray-500" />
                <span>Download CSV</span>
              </button>
            </div>

            {recommendations.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleExport('xlsx')}
                  className="flex items-center gap-1.5"
                >
                  <FiDownload size={13} />
                  <span>Excel (.xlsx)</span>
                </Button>
              </div>
            )}
          </div>

          {/* Selected run metadata notice */}
          {selectedReport && (
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-purple-50/50 p-4 text-xs text-indigo-950 shadow-xs flex items-center justify-between">
              <div>
                <span className="font-bold text-indigo-700 uppercase tracking-wider text-[11px] block">
                  Report Run Details
                </span>
                <span className="text-gray-600">
                  Triggered on {new Date(selectedReport.createdAt).toLocaleString()} • Target categories:{' '}
                  <strong>{selectedReport.params?.categories?.join(', ') || 'All'}</strong>
                </span>
              </div>
              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-800">
                {filteredRecommendations.length} {filteredRecommendations.length === 1 ? 'Product' : 'Products'}
              </span>
            </div>
          )}

          {/* Cards Grid */}
          {loadingRecs ? (
            <div className="py-16 text-center">
              <Spinner />
              <p className="mt-2 text-xs text-gray-500">Loading product recommendations…</p>
            </div>
          ) : filteredRecommendations.length === 0 ? (
            <EmptyState
              title={
                selectedReport?.status === 'running' || selectedReport?.status === 'queued'
                  ? 'AI Agent is actively discovering opportunities…'
                  : 'No product recommendations found'
              }
              message={
                selectedReport?.status === 'running' || selectedReport?.status === 'queued'
                  ? 'The agentic loop is evaluating margins and ranking top candidates above. Your product cards will render automatically once complete.'
                  : reports.length === 0
                  ? 'Launch your first AI Research Run to discover opportunities.'
                  : 'No products match the selected category filter.'
              }
            />
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredRecommendations.map((opp) => (
                <OpportunityCard2
                  key={opp._id || `${opp.rank}-${opp.title || opp.productName}`}
                  opportunity={opp}
                  reportId={selectedReportId}
                  onAddToCatalog={handleAddToCatalog}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Pop-up for New Run ──────────────────────────────────────── */}
      <NewRunModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleLaunchRun}
        isSubmitting={isSubmitting}
        error={modalError}
      />
    </div>
  )
}
