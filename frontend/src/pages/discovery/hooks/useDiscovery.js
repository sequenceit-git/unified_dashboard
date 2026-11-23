/** Product Discovery state: reports, polling a running search, filters, exports and adding to the catalog (moved from ProductDiscoveryPage). */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import { api } from '../../../lib/api'
import { marketplaceLabel } from '../../../marketplaces'

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'stopped'])
const POLL_INTERVAL_MS = 2500

export function useDiscovery() {
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
  const [listing, setListing] = useState(null)

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

  // Saves the product, then opens that shop's own List form (its categories and required fields).
  const markListed = (rank, marketplace) => setRecommendations((prev) =>
    prev.map((opp) => (opp.rank === rank
      ? {
          ...opp,
          listedShops: [...new Set([...(opp.listedShops || []), marketplace])],
          relistShops: (opp.relistShops || []).filter((item) => item !== marketplace),
        }
      : opp)),
  )

  // The product's listing on this shop ended: put that same listing back on sale.
  const relistOnShop = async ({ reportId, rank, title, marketplace }) => {
    const shop = marketplaceLabel(marketplace)
    if (!window.confirm(`"${title}" already has an ended ${shop} listing. Relist it on ${shop} with your current stock?`)) return
    try {
      await api.post('/api/research/relist', { reportId, rank, marketplace }, token)
      markListed(rank, marketplace)
      setNotification(`"${title}" is back on sale on ${shop}.`)
      setTimeout(() => setNotification(''), 5000)
    } catch (err) {
      alert(err.message)
    }
  }

  const handleListShop = async ({ reportId, rank, title, price, marketplace, relist }) => {
    if (relist) return relistOnShop({ reportId, rank, title, marketplace })
    try {
      const res = await api.post('/api/research/add-to-catalog', { reportId, rank, title, price, marketplace }, token)
      if (!res.product?._id) return
      setRecommendations((prev) =>
        prev.map((opp) => (opp.rank === rank ? { ...opp, addedProductId: res.product._id } : opp)),
      )
      if (res.canList) {
        setListing({ product: res.product, marketplace, rank })
      } else {
        setNotification(res.message)
        setTimeout(() => setNotification(''), 6000)
      }
    } catch (err) {
      // Listed meanwhile (another user, or the same item in another research run): show it as listed.
      if (/already listed/i.test(err.message || '')) markListed(rank, marketplace)
      // The server found an ended listing for it: offer to relist instead.
      if (/relist it instead/i.test(err.message || '')) {
        setRecommendations((prev) => prev.map((opp) => (opp.rank === rank
          ? { ...opp, relistShops: [...new Set([...(opp.relistShops || []), marketplace])] }
          : opp)))
        return relistOnShop({ reportId, rank, title, marketplace })
      }
      alert(err.message)
    }
  }

  const listed = () => {
    const { rank, marketplace, product } = listing
    markListed(rank, marketplace)
    setListing(null)
    setNotification(`"${product.title}" listed.`)
    setTimeout(() => setNotification(''), 5000)
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

  return {
    token,
    isAdmin,
    reports,
    setReports,
    selectedReportId,
    setSelectedReportId,
    recommendations,
    setRecommendations,
    loadingReports,
    setLoadingReports,
    loadingRecs,
    setLoadingRecs,
    activeCategoryFilter,
    setActiveCategoryFilter,
    isModalOpen,
    setIsModalOpen,
    isSubmitting,
    setIsSubmitting,
    modalError,
    setModalError,
    notification,
    setNotification,
    pollingId,
    setPollingId,
    selectedProduct,
    setSelectedProduct,
    stopping,
    setStopping,
    listing,
    setListing,
    loadReports,
    pollTimerRef,
    handleLaunchRun,
    handleExport,
    handleStop,
    handleDeleteReport,
    markListed,
    relistOnShop,
    handleListShop,
    listed,
    overviewStats,
    getOppCategory,
    dynamicCategories,
    categoryCounts,
    filteredRecommendations,
    selectedReport,
    activeRunningReport,
    openLaunch,
    runInProgress,
    hasResults,
  }
}
