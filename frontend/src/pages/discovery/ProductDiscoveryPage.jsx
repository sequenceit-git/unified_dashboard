import { useState, useEffect, useCallback, useRef } from 'react'
import {
  FiTrendingUp,
  FiCheckCircle,
  FiDownload,
  FiAlertTriangle,
} from 'react-icons/fi'
import { TbBrandOpenai } from 'react-icons/tb'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import { Spinner, EmptyState } from '../../components/ui/Feedback'
import DiscoveryOverview from './DiscoveryOverview'
import DiscoverySidebar from './DiscoverySidebar'
import OpportunityCard from './OpportunityCard'
import ProductDetailModal from './ProductDetailModal'
import NewRunModal from './NewRunModal'
import AgentProgressBar from './AgentProgressBar'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stopped'])
const POLL_INTERVAL_MS = 2500

export default function ProductDiscoveryPage() {
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
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [stopping, setStopping] = useState(false)

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
            setSelectedReportId(null)
            setTimeout(() => setSelectedReportId(data._id), 50)
          }
          if (data.status === 'stopped') {
            setNotification('Search stopped. Products found so far were saved.')
            setTimeout(() => setNotification(''), 5000)
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
  const handleStop = async () => {
    if (!activeRunningReport || stopping) return
    setStopping(true)
    try {
      const data = await api.post(`/api/research/stop/${activeRunningReport._id}`, {}, token)
      setReports((prev) => prev.map((item) => (item._id === data._id ? { ...item, ...data } : item)))
      setPollingId(null)
      setNotification('Search stopped. Products found so far were saved.')
      setTimeout(() => setNotification(''), 5000)
      setSelectedReportId(null)
      setTimeout(() => setSelectedReportId(data._id), 50)
    } catch (err) {
      alert(err.message || 'Could not stop this search.')
      loadReports()
    } finally {
      setStopping(false)
    }
  }

  const handleDeleteReport = async (report) => {
    const when = report.createdAt ? new Date(report.createdAt).toLocaleString() : 'this'
    if (!window.confirm(`Delete the research run from ${when}?`)) return
    try {
      await api.del(`/api/research/reports/${report._id}`, token)
      const remaining = reports.filter((item) => item._id !== report._id)
      setReports(remaining)
      if (selectedReportId === report._id) {
        setSelectedReportId(remaining[0]?._id || null)
        setRecommendations([])
        setSelectedProduct(null)
      }
    } catch (err) {
      alert(err.message || 'Could not delete this research run.')
    }
  }

  const handleListShop = async ({ reportId, rank, title, price, stock, marketplace }) => {
    try {
      const res = await api.post(
        '/api/research/add-to-catalog',
        { reportId, rank, title, price, stock, marketplace },
        token,
      )
      if (res.product?._id) {
        setRecommendations((prev) =>
          prev.map((opp) =>
            opp.rank === rank
              ? { ...opp, addedProductId: res.product._id, listedShops: res.listedShops || opp.listedShops }
              : opp,
          ),
        )
        setNotification(res.message || `"${title}" saved.`)
        setTimeout(() => setNotification(''), 5000)
      }
    } catch (err) {
      alert(err.message)
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

  const dynamicCategories = [
    'All',
    ...Array.from(new Set(recommendations.map(getOppCategory).filter(Boolean))),
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

  const openLaunch = () => {
    setIsModalOpen(true)
    setModalError('')
  }

  const runInProgress = selectedReport?.status === 'running' || selectedReport?.status === 'queued'
  const hasResults = filteredRecommendations.length > 0

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-heading text-2xl font-bold text-gray-900 sm:text-3xl">Product Discovery</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-700/10">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
              ChatGPT
            </span>
          </div>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            Find best-selling and viral products, then save the ones worth listing.
          </p>
        </div>

        {isAdmin && (
          <Button onClick={openLaunch} size="md" className="flex items-center gap-2 self-start sm:self-auto">
            <TbBrandOpenai size={17} />
            <span>Launch AI Research</span>
          </Button>
        )}
      </div>

      {/* ── Active Agent Workflow Loading Bar ────────────────────────────── */}
      {activeRunningReport && (
        <AgentProgressBar report={activeRunningReport} onStop={handleStop} stopping={stopping} />
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
      <DiscoveryOverview stats={overviewStats} loading={loadingReports} />

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs sm:p-5">
        <DiscoverySidebar
          reports={reports}
          selectedReportId={selectedReportId}
          onSelectReport={(id) => {
            setSelectedReportId(id)
            setActiveCategoryFilter('All')
          }}
          onDeleteReport={handleDeleteReport}
        />

        {reports.length === 0 && !loadingReports ? (
          <div className="flex flex-col items-center px-4 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
              <FiTrendingUp size={22} />
            </span>
            <h2 className="mt-4 text-lg font-bold text-gray-900">No research runs yet</h2>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Start a run to find best-selling and viral products.
            </p>
            {isAdmin && (
              <Button onClick={openLaunch} className="mt-5 flex items-center gap-2">
                <TbBrandOpenai size={17} />
                Launch AI Research
              </Button>
            )}
          </div>
        ) : (
          <div className={reports.length ? 'mt-5 border-t border-gray-100 pt-5' : ''}>
            {hasResults && (
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  {dynamicCategories.map((cat) => {
                    const count = cat === 'All' ? recommendations.length : (categoryCounts[cat] || categoryCounts[cat.toLowerCase()] || 0)
                    const isSelected = activeCategoryFilter.toLowerCase() === cat.toLowerCase()
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategoryFilter(cat)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {cat}
                        {count > 0 ? ` ${count}` : ''}
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => handleExport('csv')} className="flex items-center gap-1.5">
                    <FiDownload size={13} />
                    CSV
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleExport('xlsx')} className="flex items-center gap-1.5">
                    <FiDownload size={13} />
                    Excel
                  </Button>
                </div>
              </div>
            )}

            {selectedReport && (
              <p className="mb-4 text-xs text-gray-500">
                {new Date(selectedReport.createdAt).toLocaleString()}
                {' · '}
                {selectedReport.params?.categories?.join(', ') || 'All categories'}
                {' · '}
                {filteredRecommendations.length} {filteredRecommendations.length === 1 ? 'product' : 'products'}
              </p>
            )}

            {selectedReport?.status === 'failed' && (
              <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <FiAlertTriangle className="mt-0.5 shrink-0 text-red-600" size={17} />
                <div className="min-w-0">
                  <p className="font-semibold">This research run failed</p>
                  <p className="mt-0.5 break-words">{selectedReport.error || 'The run stopped without an error message. Check the backend log.'}</p>
                </div>
              </div>
            )}

            {selectedReport?.status === 'completed' && selectedReport.summary && (
              <p className="mb-4 rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">{selectedReport.summary}</p>
            )}

            {loadingRecs || loadingReports ? (
              <div className="py-16 text-center">
                <Spinner />
                <p className="mt-2 text-xs text-gray-500">Loading recommendations…</p>
              </div>
            ) : !hasResults && selectedReport?.status === 'failed' ? null : !hasResults ? (
              <EmptyState
                message={
                  runInProgress
                    ? 'This run is still scanning. Products will show up here when it finishes.'
                    : selectedReport?.status === 'stopped'
                      ? 'This search was stopped before any products were saved.'
                      : activeCategoryFilter !== 'All'
                        ? `No products in ${activeCategoryFilter}.`
                        : 'This run did not return any products.'
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredRecommendations.map((opp) => (
                  <OpportunityCard
                    key={opp._id || `${opp.rank}-${opp.title || opp.productName}`}
                    opportunity={opp}
                    reportId={selectedReportId}
                    onListShop={handleListShop}
                    onOpen={() => setSelectedProduct(opp)}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Modal Pop-up for New Run ──────────────────────────────────────── */}
      {selectedProduct && (
        <ProductDetailModal opportunity={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}

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
