import { useDirectListForm } from './hooks/useDirectListForm'
import ListingSlot from '../../marketplaces/shared/ListingSlot'
import Button from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import AttributeField from '../../components/listing/AttributeField'
import CertificationFields from '../../marketplaces/tiktok_shop/listing/CertificationFields'
import { hasAspectValue } from '../../marketplaces/tiktok_shop/listing/rules'
import { clearDirectListing } from '../../hooks/useDirectListing'
import { CONDITIONS } from '../../lib/listingConditions'

const SOURCE_LABEL = {
  ebay_api: 'Read from eBay',
  page: 'Read from the page',
  ai_web_search: 'Found by AI web search',
}

const textareaClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-base sm:text-sm shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10'

/**
 * Paste a product link, then review it in that shop's own listing format.
 */
export default function DirectListModal({ shopLabel, marketplace, onClose, onCreated }) {
  const {
    url,
    useAi,
    fetching,
    draft,
    stock,
    listPrice,
    sellerSku,
    brandId,
    subtitle,
    conditionDescription,
    mpn,
    dispatchTimeMax,
    bestOffer,
    identifierCode,
    sizeChart,
    saveMode,
    weight,
    length,
    width,
    height,
    aspects,
    extras,
    categories,
    categoryId,
    categorySearch,
    categoryState,
    fillingAttributes,
    certifications,
    error,
    saving,
    profile,
    shop,
    layout,
    titleMax,
    subtitleMax,
    maxImages,
    packageRequired,
    isTikTok,
    isEbay,
    update,
    fetchDetails,
    set,
    setAspect,
    setExtra,
    setDraftImages,
    rules,
    parsedEbayRules,
    activeVariants,
    productSchema,
    salesSchema,
    required,
    optional,
    selectedCategory,
    summaryPrice,
    summaryStock,
    create,
  } = useDirectListForm({ shopLabel, marketplace, onCreated })
  const categoryField = (
    <>
      {layout.category === 'search' ? (
        isEbay ? (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                label="Search eBay categories (optional)"
                value={categorySearch || ''}
                onChange={(e) => update({ categorySearch: e.target.value })}
                placeholder="Auto-suggested from title; search to override…"
              />
              <Select
                label={`${shopLabel} category *`}
                value={categoryId}
                onChange={(e) => update({ categoryId: e.target.value })}
                options={
                  categories.length
                    ? categories.map((item) => ({ value: item.categoryId, label: item.path || item.categoryName }))
                    : [{ value: '', label: categoryState.loading ? 'Finding categories…' : 'No category yet' }]
                }
              />
            </div>
            {selectedCategory && (
              <p className="text-[11px] text-gray-600">Category #{selectedCategory.categoryId}: {selectedCategory.path}</p>
            )}
          </div>
        ) : (
          <Select
            label={`${shopLabel} category *`}
            value={categoryId}
            onChange={(e) => update({ categoryId: e.target.value })}
            options={
              categories.length
                ? categories.map((item) => ({ value: item.categoryId, label: item.path || item.categoryName }))
                : [{ value: '', label: categoryState.loading ? 'Finding categories from the title…' : 'No category yet' }]
            }
          />
        )
      ) : layout.category === 'auto-search' ? (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              label="Search TikTok categories (optional)"
              value={categorySearch || ''}
              onChange={(e) => update({ categorySearch: e.target.value })}
              placeholder="Auto-picked from title; search to override…"
            />
            <Select
              label={`${shopLabel} category *`}
              value={categoryId}
              onChange={(e) => update({ categoryId: e.target.value })}
              options={
                categories.length
                  ? categories.map((item) => ({
                      value: item.categoryId,
                      label: `${item.recommended ? 'Recommended: ' : ''}${item.path || item.categoryName}`,
                    }))
                  : [{ value: '', label: categoryState.loading ? 'Finding categories…' : 'No category yet' }]
              }
            />
          </div>
          {selectedCategory && (
            <p className="text-[11px] text-gray-600">
              Leaf ID {selectedCategory.categoryId}: {selectedCategory.path}
            </p>
          )}
        </div>
      ) : layout.category === 'auto' ? (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <span className="font-semibold">Category: </span>
          {categoryState.loading ? 'Asking TikTok for a suggestion…' : selectedCategory?.path || draft?.category || 'Picked when you publish'}
        </p>
      ) : (
        <Input label="Category" value={draft.category} onChange={set('category')} />
      )}
      {categoryState.error && <p className="text-xs text-red-600">{categoryState.error}</p>}
    </>
  )

  const packageFields = (
    <div className={`space-y-2 rounded-lg p-3 ${packageRequired ? 'border border-indigo-200 bg-indigo-50/50' : 'border border-gray-200 bg-gray-50/70'}`}>
      <div>
        <p className="text-xs font-semibold text-gray-700">Package{packageRequired ? ' *' : ''}</p>
        <p className="text-[11px] text-gray-500">{layout.packageNote}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input label="Weight (lbs)" type="number" step="0.1" min={packageRequired ? '0.01' : undefined} value={weight} onChange={(e) => update({ weight: e.target.value })} required={packageRequired} />
        <Input label="Length (in)" type="number" step="0.1" value={length} onChange={(e) => update({ length: e.target.value })} required={packageRequired} />
        <Input label="Width (in)" type="number" step="0.1" value={width} onChange={(e) => update({ width: e.target.value })} required={packageRequired} />
        <Input label="Height (in)" type="number" step="0.1" value={height} onChange={(e) => update({ height: e.target.value })} required={packageRequired} />
      </div>
    </div>
  )

  const specificsFields = layout.specifics && (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700">{layout.specifics.label}</p>
        <p className="text-[11px] text-gray-500">{layout.specifics.hint}</p>
      </div>
      {required.length > 0 && (
        <div className="grid grid-cols-1 gap-2">
          {required.map((attr) => (
            <AttributeField
              key={attr.id}
              attr={attr}
              requiredOverride
              value={aspects[attr.id] || ''}
              onChange={(value) => setAspect(attr.id, value)}
            />
          ))}
        </div>
      )}
      {optional.length > 0 && (
        <>
          {fillingAttributes && <p className="text-xs text-gray-500">Filling {layout.specifics.label.toLowerCase()} with GPT-5 mini…</p>}
          <details open={optional.some((attr) => hasAspectValue(aspects[attr.id])) || fillingAttributes}>
            <summary className="cursor-pointer text-xs font-semibold text-gray-700">More {layout.specifics.label.toLowerCase()} buyers filter by ({optional.length})</summary>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {optional.slice(0, 30).map((attr) => (
                <AttributeField key={attr.id} attr={attr} value={aspects[attr.id] || ''} onChange={(value) => setAspect(attr.id, value)} />
              ))}
            </div>
          </details>
        </>
      )}
      <CertificationFields
        rules={rules.certifications}
        aspects={aspects}
        schema={productSchema}
        files={certifications}
        onChange={(id, value) => update((current) => ({ certifications: { ...current.certifications, [id]: value } }))}
      />
      {extras.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-gray-600">From the product page</p>
          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {extras.map((row, index) => (
              <div key={`${row.name}-${index}`} className="flex gap-1.5">
                <input className={`${textareaClass} w-2/5`} value={row.name} onChange={(e) => setExtra(index, 'name', e.target.value)} />
                <input className={`${textareaClass} flex-1`} value={row.value} onChange={(e) => setExtra(index, 'value', e.target.value)} />
                <button type="button" className="px-1 text-sm text-gray-400 hover:text-red-600" onClick={() => update((current) => ({ extras: current.extras.filter((_, i) => i !== index) }))}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!productSchema.length && extras.length === 0 && (
        <p className="text-xs text-gray-500">
          {categoryState.loading ? `Loading ${layout.specifics.label.toLowerCase()} for this ${shopLabel} category…` : `None found yet. ${shopLabel} will ask for any it still needs when you list.`}
        </p>
      )}
    </div>
  )

  const titleField = draft ? (
    <Input
      label={`Title * (${draft.title.length}/${titleMax})`}
      value={draft.title}
      onChange={set('title')}
      maxLength={titleMax}
    />
  ) : null

  const ebayConditionOptions = parsedEbayRules.conditions.length
    ? parsedEbayRules.conditions.map((c) => ({ value: c.id, label: c.name }))
    : CONDITIONS

  // State the shop's draft fields read (src/marketplaces/<key>/listing/draftFields/).
  const slotCtx = {
    activeVariants,
    bestOffer,
    brandId,
    categoryField,
    categoryId,
    conditionDescription,
    dispatchTimeMax,
    draft,
    ebayConditionOptions,
    identifierCode,
    layout,
    listPrice,
    maxImages,
    mpn,
    packageFields,
    parsedEbayRules,
    rules,
    salesSchema,
    saveMode,
    sellerSku,
    set,
    setDraftImages,
    shop,
    sizeChart,
    specificsFields,
    stock,
    subtitle,
    subtitleMax,
    summaryPrice,
    summaryStock,
    textareaClass,
    titleField,
    update,
  }
  const draftFields = draft && <ListingSlot marketplace={marketplace} form="draftFields" name="fields" ctx={slotCtx} />

  return (
    <Modal title={`Direct listing · ${shopLabel}`} onClose={onClose} size="5xl" closeOnBackdrop={!fetching && !saving}>
      <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-900">
        <p className="font-semibold">{shopLabel} listing format</p>
        <p className="mt-0.5">{profile?.productForm?.directIntro || layout.intro}</p>
        {layout.note && <p className="mt-1 text-indigo-800">{layout.note}</p>}
        {layout.apiName && <p className="mt-1 text-[11px] text-indigo-700">Uses {layout.apiName}</p>}
      </div>

      <form onSubmit={fetchDetails} className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Product link"
              type="url"
              value={url}
              onChange={(e) => update({ url: e.target.value })}
              placeholder="https://www.ebay.com/itm/…, an Amazon page, a brand store page…"
              required
            />
          </div>
          <Button type="submit" disabled={fetching || !url.trim()}>
            {fetching ? 'Reading the page…' : draft ? 'Fetch again' : 'Fetch details'}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={useAi} disabled={fetching} onChange={(e) => update({ useAi: e.target.checked })} />
          Use AI (GPT-5 mini) to clean up the title and description, fill in {layout.specifics?.label?.toLowerCase() || 'details'}, and look the page up if the site blocks it
        </label>
        {fetching && <p className="text-xs text-gray-500">Reading the page with GPT-5 mini. You can close this window — the request keeps running.</p>}
      </form>

      {draft && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700">{SOURCE_LABEL[draft.source] || draft.source}</span>
            {draft.aiUsed && <span className="rounded bg-purple-100 px-2 py-0.5 font-medium text-purple-700">Cleaned up by AI</span>}
            <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="truncate text-indigo-600 hover:underline">{draft.sourceUrl}</a>
          </div>
          {draft.warnings?.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              {draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}
          {draftFields}
        </div>
      )}

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-3">
        {(draft || url) && !fetching && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              clearDirectListing(marketplace)
              onClose()
            }}
          >
            Start over
          </Button>
        )}
        <Button variant="secondary" type="button" onClick={onClose}>{fetching || draft || url ? 'Hide' : 'Cancel'}</Button>
        {draft && (
          <Button type="button" onClick={create} disabled={saving || fetching}>
            {saving
              ? (layout.canList ? (isTikTok && saveMode === 'AS_DRAFT' ? 'Saving draft…' : 'Publishing…') : 'Saving…')
              : (layout.canList ? (isTikTok && saveMode === 'AS_DRAFT' ? `Save draft to ${shopLabel}` : layout.listAction) : `Save to ${shopLabel}`)}
          </Button>
        )}
      </div>
    </Modal>
  )
}
