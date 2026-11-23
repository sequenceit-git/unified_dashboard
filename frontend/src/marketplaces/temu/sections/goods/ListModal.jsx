import { useListForm } from './hooks/useListForm'
import Button from '../../../../components/ui/Button'
import { Input, Select } from '../../../../components/ui/Input'
import Modal from '../../../../components/ui/Modal'
import { marketplaceLabel } from '../../..'
import ImageDropzone from '../../../../components/ui/ImageDropzone'
import AttributeField from './components/AttributeField'
import { CONDITIONS } from './listingConditions'

export default function ListModal({ product, marketplace: sectionMarketplace, prefill = null, onClose, onSaved }) {
  const {
    shopsRes,
    shops,
    shopId,
    selectedShop,
    marketplace,
    caps,
    price,
    setPrice,
    stock,
    setStock,
    title,
    setTitle,
    condition,
    setCondition,
    brand,
    setBrand,
    weight,
    setWeight,
    length,
    setLength,
    width,
    setWidth,
    height,
    setHeight,
    images,
    setImages,
    categories,
    categoryId,
    setCategoryId,
    categoryState,
    attributeError,
    aspects,
    error,
    busy,
    titleMax,
    handleShopChange,
    activeVariants,
    required,
    optional,
    extraNames,
    setAspect,
    summaryPrice,
    summaryStock,
    submit,
    selectedCategory,
  } = useListForm({ product, marketplace: sectionMarketplace, prefill, onSaved })
  return (
    <Modal title={`List "${product.title}"`} onClose={onClose} size="4xl" wide>
      <form onSubmit={submit} className="space-y-4">
        {shopsRes.data && !shops.length && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {sectionMarketplace
              ? `No ${marketplaceLabel(sectionMarketplace)} shop is connected. Connect it in Settings first.`
              : 'No shop is connected. Connect one in Settings first.'}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {shops.length > 1 ? (
            <Select
              label="Shop *"
              value={shopId}
              onChange={(e) => handleShopChange(e.target.value)}
              options={[
                { value: '', label: 'Choose a shop…' },
                ...shops.map((s) => ({
                  value: s._id,
                  label: `${s.name}${sectionMarketplace ? '' : ` (${marketplaceLabel(s.marketplace)})`}${s.listing?.canList ? '' : ' · listing not available'}`,
                })),
              ]}
            />
          ) : selectedShop ? (
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-gray-600">Shop</span>
              <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-800">
                {selectedShop.name} ({marketplaceLabel(selectedShop.marketplace)})
              </p>
            </div>
          ) : null}
          {caps.canList && activeVariants.length === 0 && (
            <>
              <Input label="Price ($) *" type="number" step="0.01" min="0.01" max={undefined} value={price} onChange={(e) => setPrice(e.target.value)} required />
              <Input label="Stock to list *" type="number" min="1" max={undefined} step="1" value={stock} onChange={(e) => setStock(e.target.value)} required />
            </>
          )}
          {caps.canList && activeVariants.length > 0 && (
            <div className="sm:col-span-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-900 flex items-center justify-between">
              <span><strong>{activeVariants.length} variants</strong> configured below</span>
              <span>From <strong>${summaryPrice.toFixed(2)}</strong> · <strong>{summaryStock}</strong> total units</span>
            </div>
          )}
        </div>

        {selectedShop && !caps.canList && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
            {caps.note || `Listing on ${marketplaceLabel(marketplace)} is not available.`}
          </div>
        )}

        {selectedShop && caps.canList && (
          <div className="space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-900">
                {marketplaceLabel(marketplace)} listing
              </span>
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">{caps.apiName}</span>
            </div>
            {caps.note && <p className="text-xs text-gray-600">{caps.note}</p>}

            <div>
              <div className="flex items-center justify-between">
                <span className="mb-1 text-xs font-semibold text-gray-700">Listing Title *</span>
                <span className={`text-xs font-medium ${title.length > titleMax ? 'font-bold text-red-600' : title.length > titleMax * 0.9 ? 'text-amber-600' : 'text-gray-500'}`}>
                  {title.length}/{titleMax}
                </span>
              </div>
              <input
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={titleMax}
                required
              />
            </div>

            <>
                  {caps.categorySearch && (
                    <Select
                      label={`${marketplaceLabel(marketplace)} category *`}
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      options={
                        categories.length
                          ? categories.map((c) => ({ value: c.categoryId, label: c.path || c.categoryName }))
                          : [{ value: '', label: categoryState.loading ? 'Finding categories from the title…' : 'No category yet' }]
                      }
                    />
                  )}
                  {caps.categoryAutoPick && (
                    <p className="text-xs text-gray-700">
                      <span className="font-semibold">Category: </span>
                      {categoryState.loading ? 'Asking for a suggestion…' : selectedCategory?.path || 'Picked when you publish'}
                    </p>
                  )}
                </>
            {categoryState.error && <p className="text-xs text-red-600">{categoryState.error}</p>}

            {caps.condition && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select label="Condition" value={condition} onChange={(e) => setCondition(e.target.value)} options={CONDITIONS} />
                <Input label="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Apple, Nike, Unbranded" />
              </div>}

            {(required.length > 0 || extraNames.length > 0) && (
              <div className="border-t border-indigo-100 pt-2">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">Required by {marketplaceLabel(marketplace)} for this category</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {required.map((attr) => (
                    <AttributeField
                      key={attr.id}
                      attr={attr}
                      requiredOverride
                      value={aspects[attr.id] || ''}
                      onChange={(value) => setAspect(attr.id, value)}
                    />
                  ))}
                  {extraNames.map((name) => (
                    <Input key={name} label={`${name} *`} value={aspects[name] || ''} onChange={(e) => setAspect(name, e.target.value)} />
                  ))}
                </div>
              </div>
            )}
            {optional.length > 0 && (
              <details className="border-t border-indigo-100 pt-2">
                <summary className="cursor-pointer text-xs font-semibold text-gray-700">
                  More details buyers filter by ({optional.length} optional)
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {optional.slice(0, 30).map((attr) => (
                    <AttributeField key={attr.id} attr={attr} value={aspects[attr.id] || ''} onChange={(value) => setAspect(attr.id, value)} />
                  ))}
                </div>
              </details>
            )}
            {attributeError && <p className="text-xs text-red-600">{attributeError}</p>}

            {caps.packageDetails && (
              <div className="border-t border-indigo-100 pt-2">
                <span className="mb-1.5 block text-xs font-semibold text-gray-700">Package Dimensions &amp; Weight</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Input label="Weight (lbs)" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                  <Input label="Length (in)" type="number" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} />
                  <Input label="Width (in)" type="number" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} />
                  <Input label="Height (in)" type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} />
                </div>
              </div>
            )}

          </div>
        )}

        {caps.canList && (
          <div>
            <ImageDropzone images={images} onChange={setImages} label={`Listing Images (up to ${caps.maxImages || 12})`} maxImages={caps.maxImages || 12} />
            {images.length === 0 && <p className="mt-1 text-xs text-amber-600">At least 1 image is needed to publish.</p>}
          </div>
        )}

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={busy || !selectedShop || !caps.canList || title.length > titleMax || (caps.categorySearch && !categoryId)}
          >
            {busy
              ? ('Publishing…')
              : selectedShop
                ? (`Publish to ${selectedShop.name}`)
                : 'List Product'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
