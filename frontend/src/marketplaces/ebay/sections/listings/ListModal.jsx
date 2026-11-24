import { useListForm } from './hooks/useListForm'
import Button from '../../../../components/ui/Button'
import { Input, Select } from '../../../../components/ui/Input'
import { useState } from 'react'
import { marketplaceLabel } from '../../..'
import ImageDropzone from '../../../../components/ui/ImageDropzone'
import AttributeField from './components/AttributeField'
import ListSubtitle from './listing/listFields/Subtitle'
import ListCategory from './listing/listFields/Category'
import { ConditionBrand, Offers, ShippingFields, SkuIdentifier, Variations } from './listing/listFields/Details'
import StepPanel, { Step } from '../../ui/StepPanel'
import StepProblems from '../../ui/StepProblems'
import { LIST_STEPS } from './listing/listSteps'
import ListImageNote from './listing/listFields/ImageNote'

export default function ListModal({ product, marketplace: sectionMarketplace, prefill = null, onClose, onSaved }) {
  const [step, setStep] = useState('details')
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
    description,
    setDescription,
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
    categoryId,
    categoryState,
    attributeError,
    aiFill,
    problems,
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
    slotCtx,
  } = useListForm({ product, marketplace: sectionMarketplace, prefill, onSaved, onBlocked: setStep })
  const card = 'space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900'
  const badSteps = new Set(problems.map((p) => p.step))
  const ready = selectedShop && caps.canList
  const failed = product.shopListing?.status === 'error' && product.shopListing?.syncError

  return (
    <StepPanel
      title={`List "${product.title}"`}
      steps={LIST_STEPS}
      active={step}
      onStep={setStep}
      problemSteps={badSteps}
      onClose={onClose}
      actions={(
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="ebay-list-form" disabled={busy || !ready}>
            {busy ? 'Publishing…' : selectedShop ? `List on ${selectedShop.name}` : 'List on eBay'}
          </Button>
        </>
      )}
    >
      <form id="ebay-list-form" noValidate onSubmit={submit} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault() }}>
        {failed && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <strong>eBay refused the last try:</strong> {product.shopListing.syncError}
          </div>
        )}
        {shopsRes.data && !shops.length && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {sectionMarketplace ? `No ${marketplaceLabel(sectionMarketplace)} shop is connected. Connect it in Settings first.` : 'No shop is connected. Connect one in Settings first.'}
          </p>
        )}
        {selectedShop && !caps.canList && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">{caps.note || `Listing on ${marketplaceLabel(marketplace)} is not available.`}</div>
        )}

        <Step id="details" active={step}>
          <StepProblems problems={problems} step="details" />
          <div className={card}>
            {shops.length > 1 ? (
              <Select
                label="Shop *"
                value={shopId}
                onChange={(e) => handleShopChange(e.target.value)}
                options={[
                  { value: '', label: 'Choose a shop…' },
                  ...shops.map((s) => ({ value: s._id, label: `${s.name}${sectionMarketplace ? '' : ` (${marketplaceLabel(s.marketplace)})`}${s.listing?.canList ? '' : ' · listing not available'}` })),
                ]}
              />
            ) : selectedShop ? (
              <p className="text-sm text-gray-600 dark:text-slate-300">Listing on <strong>{selectedShop.name}</strong> ({marketplaceLabel(selectedShop.marketplace)})</p>
            ) : null}
            {ready && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
                {caps.apiName && <span className="rounded bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200">{caps.apiName}</span>}
                {caps.note && <span>{caps.note}</span>}
              </div>
            )}
            <div>
              <div className="flex items-center justify-between">
                <span className="mb-1 text-xs font-semibold text-gray-700 dark:text-slate-300">Listing title *</span>
                <span className={`text-xs font-medium ${title.length > titleMax ? 'font-bold text-red-600' : title.length > titleMax * 0.9 ? 'text-amber-600' : 'text-gray-500'}`}>{title.length}/{titleMax}</span>
              </div>
              <input
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={titleMax}
              />
            </div>
            <ListSubtitle ctx={slotCtx} />
            <ConditionBrand ctx={slotCtx} />
            <div>
              <span className="mb-1 block text-xs font-semibold text-gray-700 dark:text-slate-300">Description</span>
              <textarea
                rows={4}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Product features, sizing notes, materials…"
              />
            </div>
          </div>
          <div className={card}>
            <ImageDropzone images={images} onChange={setImages} label={`Photos (up to ${caps.maxImages || 12})`} maxImages={caps.maxImages || 12} />
            <ListImageNote ctx={slotCtx} />
          </div>
        </Step>

        <Step id="category" active={step}>
          <StepProblems problems={problems} step="category" />
          <div className={card}>
            <ListCategory ctx={slotCtx} />
            {categoryState.error && <p className="text-xs text-red-600">{categoryState.error}</p>}
          </div>
          {aiFill.busy && <p className="text-xs text-indigo-600 dark:text-indigo-300">✨ AI is filling the specifics from what Product Discovery found…</p>}
          {!aiFill.busy && aiFill.asked > 0 && !aiFill.error && (
            <p className="rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">
              ✨ AI filled {aiFill.filled.length} of {aiFill.asked} empty required or recommended specifics from what Product Discovery found. Check them before listing.
            </p>
          )}
          {aiFill.error && <p className="text-xs text-amber-700 dark:text-amber-300">AI couldn't fill the specifics: {aiFill.error}</p>}
          {(required.length > 0 || extraNames.length > 0) && (
            <div className={card}>
              <span className="block text-sm font-semibold">Required by eBay for this category</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {required.map((attr) => (
                  <AttributeField key={attr.id} attr={attr} requiredOverride value={aspects[attr.id] || ''} onChange={(value) => setAspect(attr.id, value)} />
                ))}
                {extraNames.map((name) => (
                  <Input key={name} label={`${name} *`} value={aspects[name] || ''} onChange={(e) => setAspect(name, e.target.value)} />
                ))}
              </div>
            </div>
          )}
          {optional.length > 0 && (
            <details className={card}>
              <summary className="cursor-pointer text-sm font-semibold">More details buyers filter by ({optional.length} optional)</summary>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {optional.slice(0, 30).map((attr) => (
                  <AttributeField key={attr.id} attr={attr} value={aspects[attr.id] || ''} onChange={(value) => setAspect(attr.id, value)} />
                ))}
              </div>
            </details>
          )}
          {attributeError && <p className="text-xs text-red-600">{attributeError}</p>}
        </Step>

        <Step id="price" active={step}>
          <StepProblems problems={problems} step="price" />
          <div className={card}>
            {activeVariants.length === 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Price ($) *" type="number" step="0.01" min="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
                <Input label="Stock to list *" type="number" min="1" step="1" value={stock} onChange={(e) => setStock(e.target.value)} />
              </div>
            ) : (
              <p className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
                <strong>{activeVariants.length} variations</strong> · from <strong>${summaryPrice.toFixed(2)}</strong> · <strong>{summaryStock}</strong> units in total
              </p>
            )}
            <SkuIdentifier ctx={slotCtx} />
          </div>
          <div className={card}><Variations ctx={slotCtx} /></div>
          <Offers ctx={slotCtx} />
        </Step>

        <Step id="shipping" active={step}>
          <StepProblems problems={problems} step="shipping" />
          <ShippingFields ctx={slotCtx} />
          {caps.packageDetails && (
            <div className={card}>
              <span className="block text-sm font-semibold">Package</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input label="Weight (lbs)" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} />
                <Input label="Length (in)" type="number" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} />
                <Input label="Width (in)" type="number" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} />
                <Input label="Height (in)" type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} />
              </div>
            </div>
          )}
        </Step>

        <Step id="review" active={step}>
          {problems.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/40">
              <p className="mb-1 text-sm font-semibold text-rose-800 dark:text-rose-200">Fix these before listing</p>
              <ul className="space-y-1 text-sm">
                {problems.map((p) => (
                  <li key={`${p.step}:${p.message}`}>
                    <button type="button" className="text-left text-rose-700 underline-offset-2 hover:underline dark:text-rose-300" onClick={() => setStep(p.step)}>
                      {LIST_STEPS.find((x) => x.id === p.step)?.label}: {p.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={`${card} flex gap-4`}>
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
              {images[0] ? <img src={images[0]} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-gray-400">No photo</span>}
            </div>
            <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-gray-500">Title</dt><dd className="truncate">{title || '—'}</dd>
              <dt className="text-gray-500">Category</dt><dd>{categoryId || '—'}</dd>
              <dt className="text-gray-500">Price</dt><dd>{activeVariants.length ? `from $${summaryPrice.toFixed(2)}` : price ? `$${Number(price).toFixed(2)}` : '—'}</dd>
              <dt className="text-gray-500">Stock</dt><dd>{activeVariants.length ? summaryStock : stock}</dd>
              <dt className="text-gray-500">Photos</dt><dd>{images.length}</dd>
            </dl>
          </div>
          <p className="text-xs text-gray-500">eBay checks the listing when you list it; anything it refuses is shown here with its reason.</p>
        </Step>

        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      </form>
    </StepPanel>
  )
}
