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

  const handleSubmit = (e) => {
    e.preventDefault()
    const finalCategories = [...selectedCategories]
    if (categoryInput.trim() && !finalCategories.includes(categoryInput.trim())) {
      finalCategories.push(categoryInput.trim())
    }
    onSubmit({
      categories: finalCategories,
      niche: niche.trim(),
      instructions: instructions.trim(),
    })
  }

  return (
    <Modal title="Launch New Research Run" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <p className="text-sm text-gray-500">
          Choose what to find. The search looks for best-selling US products on its own, not for one shop.
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
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">Where it searches</p>
            <p className="text-sm text-gray-600">
              US best sellers on eBay, Amazon, Walmart, Temu, TikTok Shop, Etsy, and Wish, plus independent US stores
              on Shopify, WooCommerce, BigCommerce, and other store platforms.
            </p>
            <p className="text-sm text-gray-600">
              It returns the top 20 products, each with at least 4 confirmed US listings. List any of them in your eBay, TikTok Shop, or Temu shop from its card.
            </p>
            <p className="flex items-center gap-1.5 text-xs text-indigo-700">
              <FiZap size={13} />
              Every source link is checked before it is shown.
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
