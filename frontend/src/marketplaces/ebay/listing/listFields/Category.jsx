/** ebay listing: listFields · category (moved verbatim from ListModal.jsx) */
import { Input, Select } from '../../../../components/ui/Input'

export default function Category({ ctx }) {
  const { categories, categoryId, categorySearch, categoryState, selectedCategory, setCategoryId, setCategorySearch } = ctx
  return (
    <>
      <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            label="Search eBay categories (optional)"
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            placeholder="Auto-suggested from title; type to search…"
          />
          <Select
            label="eBay category *"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={
              categories.length
                ? categories.map((c) => ({ value: c.categoryId, label: c.path || c.categoryName }))
                : [{ value: '', label: categoryState.loading ? 'Finding categories…' : 'No category yet' }]
            }
          />
        </div>
        {selectedCategory && (
          <p className="text-[11px] text-gray-600">Category #{selectedCategory.categoryId}: {selectedCategory.path}</p>
        )}
      </div>
    </>
  )
}
