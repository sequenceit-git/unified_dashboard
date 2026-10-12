import { useState, useEffect, useRef, useCallback } from 'react'
import {
  FiChevronUp,
  FiPlus,
  FiTrendingUp,
  FiCheckCircle,
  FiSearch,
  FiLoader,
  FiAlertTriangle,
  FiX,
  FiZap,
} from 'react-icons/fi'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import MarketResearchPageTable from './MarketResearchPageTable'

// ─── Category suggestions ──────────────────────────────────────────────────
const CATEGORY_SUGGESTIONS = [
  'Home & Kitchen',
  'Electronics',
  'Beauty & Personal Care',
  'Sports & Fitness',
  'Pet Supplies',
  'Toys & Games',
  'Office & Stationery',
  'Baby & Toddler',
  'Health & Wellness',
  'Outdoor & Garden',
  'Clothing & Accessories',
  'Automotive',
]

// ─── Polling constants ─────────────────────────────────────────────────────
const TERMINAL_STATUSES = new Set(['completed', 'failed'])
const POLL_INTERVAL_MS = 4000

// ─── Polling hook ──────────────────────────────────────────────────────────
function useReportPoller(reportId, token, onUpdate) {
  const timerRef = useRef(null)

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  useEffect(() => {
    if (!reportId || !token) return

    const poll = async () => {
      try {
        const data = await api.get(`/api/research/status/${reportId}`, token)
        onUpdate(data)
        if (TERMINAL_STATUSES.has(data.status)) stop()
      } catch {
        stop()
      }
    }

    poll()
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS)
    return stop
  }, [reportId, token, onUpdate, stop])
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function MarketResearchPage() {
  const { token } = useAuth()

  const [reports, setReports]           = useState([])
  const [isFormOpen, setIsFormOpen]     = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError]               = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [pollingId, setPollingId]       = useState(null)

  // Form fields
  const [selectedCategories, setSelectedCategories] = useState([])
  const [categoryInput, setCategoryInput]           = useState('')
  const [niche, setNiche]                           = useState('')
  const [instructions, setInstructions]             = useState('')

  // ── Load reports ────────────────────────────────────────────────────────
  const loadReports = useCallback(async () => {
    try {
      const res = await api.get('/api/research/reports', token)
      if (Array.isArray(res) && res.length > 0) setReports(res)
    } catch { /* silent */ }
  }, [token])

  useEffect(() => { loadReports() }, [loadReports])

  // ── Polling callback ─────────────────────────────────────────────────────
  const handlePollUpdate = useCallback((updated) => {
    setReports((prev) =>
      prev.map((r) => (r._id === updated._id ? { ...r, ...updated } : r)),
    )
    if (TERMINAL_STATUSES.has(updated.status)) {
      setPollingId(null)
      if (updated.status === 'completed') {
        setSuccessMessage('Research completed! Results are now available.')
        setTimeout(() => setSuccessMessage(''), 6000)
      }
      loadReports()
    }
  }, [loadReports])

  useReportPoller(pollingId, token, handlePollUpdate)

  // ── Category tag helpers ─────────────────────────────────────────────────
  const addCategory = (cat) => {
    const trimmed = cat.trim()
    if (!trimmed || selectedCategories.includes(trimmed)) return
    setSelectedCategories((prev) => [...prev, trimmed])
    setCategoryInput('')
  }

  const removeCategory = (cat) =>
    setSelectedCategories((prev) => prev.filter((c) => c !== cat))

  const handleCategoryKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && categoryInput.trim()) {
      e.preventDefault()
      addCategory(categoryInput)
    }
    if (e.key === 'Backspace' && !categoryInput && selectedCategories.length) {
      setSelectedCategories((prev) => prev.slice(0, -1))
    }
  }

  // ── Submit form ──────────────────────────────────────────────────────────
  const handleGenerate = async (e) => {
    e.preventDefault()
    const finalCategories = [...selectedCategories]
    if (categoryInput.trim()) finalCategories.push(categoryInput.trim())
    if (!finalCategories.length) {
      setError('Please add at least one product category.')
      return
    }

    setError('')
    setIsSubmitting(true)
    try {
      const res = await api.post(
        '/api/research/generate',
        { categories: finalCategories, niche: niche.trim(), instructions: instructions.trim() },
        token,
      )
      setReports((prev) => [res, ...prev])
      setPollingId(res._id)
      setSelectedCategories([])
      setCategoryInput('')
      setNiche('')
      setInstructions('')
      setIsFormOpen(false)
    } catch (err) {
      setError(err.message || 'Failed to start research. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Excel download ───────────────────────────────────────────────────────
  const handleExcelDownload = async (reportId) => {
    try {
      const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
      const res = await fetch(`${BASE}/api/research/export/${reportId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Export failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `product_recommendations_${reportId.slice(-8)}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Excel export failed: ${err.message}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
              <FiTrendingUp size={18} />
            </span>
            <h1 className="page-heading text-2xl font-bold text-gray-900 sm:text-3xl">
              Market Research
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-gray-500">
            Generate AI-powered market research reports across Amazon, Walmart, eBay, TikTok Shop, Temu and more.
          </p>
        </div>

        <Button
          onClick={() => { setIsFormOpen((p) => !p); setError('') }}
          className="flex items-center justify-center gap-2 self-start sm:self-auto"
          disabled={isSubmitting}
        >
          {isFormOpen ? (
            <><FiChevronUp size={16} /><span>Minimize form</span></>
          ) : (
            <><FiPlus size={16} /><span>New Research Run</span></>
          )}
        </Button>
      </div>

      {/* ── Success notification ─────────────────────────────────────────── */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm">
          <FiCheckCircle className="shrink-0 text-emerald-600" size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* ── Collapsible form ─────────────────────────────────────────────── */}
      {isFormOpen && (
        <Card className="border-indigo-100 bg-gradient-to-br from-white via-indigo-50/20 to-white shadow-sm">
          <form onSubmit={handleGenerate} className="space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">New Market Research Run</h2>
                <p className="text-xs text-gray-500">
                  Add one or more categories. The AI agent will research each across all major marketplaces.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="text-xs font-semibold text-gray-400 hover:text-gray-700"
              >
                Close
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5">
                <FiAlertTriangle size={14} className="shrink-0 text-red-500" />
                <p className="text-xs font-semibold text-red-600">{error}</p>
              </div>
            )}

            {/* Category tag input */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-gray-700">
                1. Product Categories <span className="text-red-500">*</span>
                <span className="ml-1 text-xs font-normal text-gray-400">(press Enter or comma to add)</span>
              </label>

              <div className="flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10">
                {selectedCategories.map((cat) => (
                  <span
                    key={cat}
                    className="flex items-center gap-1 rounded-md bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800"
                  >
                    {cat}
                    <button
                      type="button"
                      onClick={() => removeCategory(cat)}
                      className="ml-0.5 rounded text-indigo-500 hover:text-indigo-900"
                    >
                      <FiX size={11} />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value)}
                  onKeyDown={handleCategoryKeyDown}
                  onBlur={() => { if (categoryInput.trim()) addCategory(categoryInput) }}
                  placeholder={selectedCategories.length === 0 ? 'e.g., Home & Kitchen' : 'Add another…'}
                  className="min-w-[160px] flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                />
              </div>

              {/* Quick-pick suggestions */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {CATEGORY_SUGGESTIONS.filter((c) => !selectedCategories.includes(c)).slice(0, 8).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => addCategory(cat)}
                    className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-600 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    + {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Niche */}
              <div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                    2. Product Niche / Focus <span className="text-xs font-normal text-gray-400">(optional)</span>
                  </span>
                  <input
                    type="text"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    placeholder="e.g., portable blenders"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  />
                </label>
              </div>

              {/* Info hint */}
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-indigo-200 bg-indigo-50/40 px-3 py-2.5 text-xs text-indigo-700">
                <FiZap size={14} className="shrink-0" />
                <span>
                  The AI will research <strong>{selectedCategories.length || '?'}</strong>{' '}
                  {selectedCategories.length === 1 ? 'category' : 'categories'} across 7 marketplaces
                  and generate up to <strong>30 ranked recommendations</strong>.
                </span>
              </div>
            </div>

            {/* Instructions */}
            <div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                  3. Additional Instructions <span className="text-xs font-normal text-gray-400">(optional)</span>
                </span>
                <textarea
                  rows={3}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g., Target profit margin > 40%. Focus on USB-C models. Avoid saturated Amazon categories."
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button type="button" variant="secondary" onClick={() => setIsFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="flex items-center gap-1.5" disabled={isSubmitting}>
                {isSubmitting ? (
                  <><FiLoader size={14} className="animate-spin" /><span>Starting…</span></>
                ) : (
                  <><FiSearch size={14} /><span>Start Research</span></>
                )}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ── Reports table (extracted component) ─────────────────────────── */}
      <MarketResearchPageTable
        reports={reports}
        onExcelDownload={handleExcelDownload}
      />
    </div>
  )
}
