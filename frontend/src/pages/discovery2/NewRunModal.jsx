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

  const marketplaces = [
    { id: 'ebay', label: 'eBay', defaultBadge: 'Default' },
    { id: 'tiktok', label: 'TikTok Shop' },
    { id: 'temu', label: 'Temu' },
  ]

  return (
    <Modal title="Launch New Research Run" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-gray-500">
          Choose what to look for on the left, and where you sell on the right.
        </p>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-600">
            <FiAlertTriangle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:gap-0">
          <div className="space-y-4 lg:pr-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">What to find</p>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Product Categories <span className="text-red-500">*</span>
                <span className="ml-1 font-normal text-gray-400">(Enter or comma to add)</span>
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

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Product Niche / Focus <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g., ergonomic desk accessories, portable blenders"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Custom Instructions <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                rows={4}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g., Focus on lightweight products under $40, exclude fragile glass items…"
                className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div className="space-y-4 border-t border-gray-100 pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Where to sell</p>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-gray-700">Target marketplaces</label>
                <span className="text-[11px] font-medium text-indigo-600">Also checks Amazon, Walmart, Alibaba</span>
              </div>
              <div className="grid gap-2">
                {marketplaces.map((market) => {
                  const isChecked = targetMarketplaces.includes(market.id)
                  return (
                    <label
                      key={market.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
                        isChecked
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleMarketplace(market.id)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="flex-1">{market.label}</span>
                      {market.defaultBadge && (
                        <span className="rounded bg-indigo-200/60 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">
                          {market.defaultBadge}
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-gray-700">Minimum net profit margin</label>
                <span className="text-[11px] font-medium text-emerald-600">Strict filter</span>
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
                <span className="text-xs text-gray-500">% after fees and landed cost</span>
              </div>
            </div>

            <p className="flex items-center gap-1.5 text-xs text-indigo-700">
              <FiZap size={13} />
              At least one marketplace stays selected.
            </p>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={onClose} type="button" disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || (!selectedCategories.length && !categoryInput.trim())}>
            {isSubmitting ? 'Starting Run…' : 'Start Research'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
