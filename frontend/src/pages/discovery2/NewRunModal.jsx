import { useState } from 'react'
import { FiX, FiZap, FiAlertTriangle } from 'react-icons/fi'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'

const CATEGORY_SUGGESTIONS = [
  'Home & Kitchen',
  'Electronics',
  'Sports & Fitness',
  'Beauty & Personal Care',
  'Accessories',
  'Pet Supplies',
]

export default function NewRunModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  error = '',
}) {
  const [selectedCategories, setSelectedCategories] = useState(['Home & Kitchen'])
  const [categoryInput, setCategoryInput] = useState('')
  const [niche, setNiche] = useState('')
  const [minMargin, setMinMargin] = useState('15')
  const [targetMarketplaces, setTargetMarketplaces] = useState(['ebay'])
  const [instructions, setInstructions] = useState('')

  if (!isOpen) return null

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

  const toggleMarketplace = (market) => {
    setTargetMarketplaces((prev) => {
      if (prev.includes(market)) {
        // Prevent unchecking all
        if (prev.length <= 1) return prev
        return prev.filter((m) => m !== market)
      }
      return [...prev, market]
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const finalCategories = [...selectedCategories]
    if (categoryInput.trim() && !finalCategories.includes(categoryInput.trim())) {
      finalCategories.push(categoryInput.trim())
    }
    onSubmit({
      categories: finalCategories,
      niche: niche.trim(),
      targetMarketplaces,
      minMargin: Number(minMargin) || 15,
      instructions: instructions.trim(),
    })
  }

  return (
    <Modal title="Launch New Research Run" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">
          Specify target categories and niche focus. The AI Agent will scan marketplaces, analyze competition, and identify product opportunities.
        </p>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600">
            <FiAlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Category Tag Input */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Product Categories <span className="text-red-500">*</span>
            <span className="ml-1 text-xs font-normal text-gray-400">(press Enter or comma to add)</span>
          </label>
          <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
            {selectedCategories.map((cat) => (
              <span
                key={cat}
                className="flex items-center gap-1 rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800"
              >
                {cat}
                <button
                  type="button"
                  onClick={() => removeCategory(cat)}
                  className="rounded text-indigo-500 hover:text-indigo-900"
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
              className="min-w-[140px] flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>

          {/* Category quick suggestions */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CATEGORY_SUGGESTIONS.filter((c) => !selectedCategories.includes(c)).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => addCategory(cat)}
                className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              >
                + {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Niche Input */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            Product Niche / Focus <span className="text-xs font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={niche}
            onChange={(e) => setNiche(e.target.value)}
            placeholder="e.g., ergonomic desk accessories, portable blenders"
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Target Marketplaces */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="block text-xs font-semibold text-gray-700">
              Target Marketplaces <span className="text-xs font-normal text-gray-400">(where client sells)</span>
            </label>
            <span className="text-[11px] font-medium text-indigo-600">Cross-checks Amazon, Walmart, Alibaba</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {[
              { id: 'ebay', label: 'eBay', defaultBadge: 'Default' },
              { id: 'tiktok', label: 'TikTok Shop' },
              { id: 'temu', label: 'Temu' },
            ].map((m) => {
              const isChecked = targetMarketplaces.includes(m.id)
              return (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    isChecked
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-2xs'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleMarketplace(m.id)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>{m.label}</span>
                  {m.defaultBadge && (
                    <span className="rounded bg-indigo-200/60 px-1.5 py-0.2 text-[10px] font-bold text-indigo-800">
                      {m.defaultBadge}
                    </span>
                  )}
                </label>
              )
            })}
          </div>
        </div>

        {/* Minimum Profit Margin Target */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-semibold text-gray-700">
              Minimum Net Profit Margin (%)
            </label>
            <span className="text-[11px] font-medium text-emerald-600">Strict filter threshold</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="5"
              max="85"
              value={minMargin}
              onChange={(e) => setMinMargin(e.target.value)}
              className="w-24 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            <span className="text-xs text-gray-500">% net profit after marketplace fees & landed costs</span>
          </div>
        </div>

        {/* Instructions */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-semibold text-gray-700">
              Custom Instructions <span className="text-xs font-normal text-gray-400">(optional)</span>
            </label>
          </div>
          <textarea
            rows={2}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g., Focus on lightweight products under $40, exclude fragile glass items…"
            className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-1.5 text-xs text-indigo-700">
            <FiZap size={13} />
            <span>Multi-marketplace analysis</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} type="button" disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || (!selectedCategories.length && !categoryInput.trim())}>
              {isSubmitting ? 'Starting Run…' : 'Start Research'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
