import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { FiChevronUp, FiPlus, FiTrendingUp, FiCheckCircle, FiSearch } from 'react-icons/fi'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'

const INITIAL_REPORTS = [
  {
    id: 'rep-001',
    createdAt: new Date('2026-10-12T10:15:00'),
    category: 'Home & Kitchen',
    niche: 'Portable Blenders',
    instructions: 'Target margin > 40%, focus on USB-C rechargeable models.',
  },
  {
    id: 'rep-002',
    createdAt: new Date('2026-10-10T14:30:00'),
    category: 'Electronics',
    niche: 'Wireless Earbuds',
    instructions: 'Analyze Temu and TikTok Shop top seller ratings and returns.',
  },
  {
    id: 'rep-003',
    createdAt: new Date('2026-10-07T09:45:00'),
    category: 'Sports & Outdoors',
    niche: 'Resistance Exercise Bands',
    instructions: 'Compare competitor price points and multipack bundling.',
  },
]

function formatDate(date) {
  if (!date) return '—'
  const d = new Date(date)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MarketResearchPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const [reports, setReports] = useState(INITIAL_REPORTS)
  const [isFormOpen, setIsFormOpen] = useState(false)

  // Fetch reports from backend if available
  useEffect(() => {
    let isMounted = true
    const loadReports = async () => {
      try {
        const res = await api.get('/api/research/reports', token)
        if (isMounted && Array.isArray(res) && res.length > 0) {
          const mapped = res.map((r) => ({
            id: r._id,
            createdAt: r.createdAt || new Date(),
            category: r.params?.category || 'Marketplace Item',
            niche: r.params?.keywords?.[0] || '',
            instructions: r.summary || '',
          }))
          setReports([...mapped, ...INITIAL_REPORTS])
        }
      } catch {
        // Fallback to initial reports
      }
    }
    loadReports()
    return () => {
      isMounted = false
    }
  }, [token])

  // Form State
  const [category, setCategory] = useState('')
  const [niche, setNiche] = useState('')
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleGenerate = (e) => {
    e.preventDefault()
    if (!category.trim()) {
      setError('Product Category is required.')
      return
    }

    setError('')
    const newReport = {
      id: `rep-${Date.now()}`,
      createdAt: new Date(),
      category: category.trim(),
      niche: niche.trim(),
      instructions: instructions.trim(),
    }

    setReports([newReport, ...reports])
    setCategory('')
    setNiche('')
    setInstructions('')
    setIsFormOpen(false)
    setSuccessMessage(`Report generated for "${newReport.category}"!`)
    setTimeout(() => setSuccessMessage(''), 4000)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-50 text-indigo-600">
              <FiTrendingUp size={18} />
            </span>
            <h1 className="page-heading text-2xl font-bold text-gray-900 sm:text-3xl">Market Research</h1>
          </div>
          <p className="mt-1.5 text-sm text-gray-500">
            Generate and analyze AI market research reports across eBay, Temu, and TikTok Shop.
          </p>
        </div>

        {/* Generate a report toggle button */}
        <Button
          onClick={() => {
            setIsFormOpen((prev) => !prev)
            setError('')
          }}
          className="flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          {isFormOpen ? (
            <>
              <FiChevronUp size={16} />
              <span>Minimize form</span>
            </>
          ) : (
            <>
              <FiPlus size={16} />
              <span>Generate a report</span>
            </>
          )}
        </Button>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm transition">
          <FiCheckCircle className="shrink-0 text-emerald-600" size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Unfoldable Form (Minimized by default) */}
      {isFormOpen && (
        <Card className="border-indigo-100 bg-gradient-to-br from-white via-indigo-50/20 to-white shadow-sm">
          <form onSubmit={handleGenerate} className="space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">New Market Research Parameters</h2>
                <p className="text-xs text-gray-500">Specify your product criteria to trigger AI market data collection.</p>
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
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                {error}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Input 1: Product Category (Required) */}
              <div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                    1. Product Category <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g., Home & Kitchen"
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    required
                  />
                </label>
              </div>

              {/* Input 2: Product / Niche (Optional) */}
              <div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                    2. Product / Niche <span className="text-xs font-normal text-gray-400">(optional)</span>
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
            </div>

            {/* Input 3: Additional Instructions (Optional textarea) */}
            <div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                  3. Additional Instructions <span className="text-xs font-normal text-gray-400">(optional)</span>
                </span>
                <textarea
                  rows={3}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Enter specific goals, target margins, competitor or keyword constraints..."
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                />
              </label>
            </div>

            {/* Form Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsFormOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex items-center gap-1.5"
              >
                <FiSearch size={14} />
                <span>Generate</span>
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Reports Table Section */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Research Reports</h2>
          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
            {reports.length} {reports.length === 1 ? 'Report' : 'Reports'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-gray-50/80">
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 font-semibold">Generated Date</th>
                <th className="px-4 py-3 font-semibold">Market Analysis</th>
                <th className="px-4 py-3 font-semibold">Product Recommendation</th>
                <th className="px-4 py-3 font-semibold">Research Report</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reports.map((row) => (
                <tr key={row.id} className="transition hover:bg-gray-50/60">
                  {/* Column 1: Generated Date */}
                  <td className="px-4 py-3.5">
                    <span className="font-medium text-gray-900">
                      {formatDate(row.createdAt)}
                    </span>
                    <span className="block text-xs text-gray-500">
                      {row.category}
                      {row.niche ? ` • ${row.niche}` : ''}
                    </span>
                  </td>

                  {/* Column 2: Market Analysis */}
                  <td className="px-4 py-3.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/market-research/${row.id || 'rep-001'}/analysis`)}
                    >
                      Market Analysis
                    </Button>
                  </td>

                  {/* Column 3: Product Recommendation */}
                  <td className="px-4 py-3.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/market-research/${row.id || 'rep-001'}/recommendations`)}
                    >
                      Product Recommendation
                    </Button>
                  </td>

                  {/* Column 4: Research Report */}
                  <td className="px-4 py-3.5">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/market-research/${row.id || 'rep-001'}/report`)}
                    >
                      Research Report
                    </Button>
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
