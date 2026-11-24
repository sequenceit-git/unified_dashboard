import { useState } from 'react'
import { useDirectListForm } from './hooks/useDirectListForm'
import Button from '../../../../components/ui/Button'
import { Input, Select } from '../../../../components/ui/Input'
import AttributeField from './components/AttributeField'
import { hasAspectValue } from './listing/attributes'
import { clearDirectListing } from './hooks/useDirectListing'
import { CONDITIONS } from './listingConditions'
import { FoundFields, PriceFields, ShippingFields } from './listing/draftFields/Fields'
import StepPanel, { Step } from '../../ui/StepPanel'
import StepProblems from '../../ui/StepProblems'
import { DIRECT_STEPS } from './listing/directSteps'

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
  const [step, setStep] = useState('link')
  const {
    url,
    useAi,
    fetching,
    draft,
    stock,
    sellerSku,
    subtitle,
    conditionDescription,
    mpn,
    dispatchTimeMax,
    bestOffer,
    ebayShipping,
    problems,
    identifierCode,
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
    error,
    saving,
    profile,
    layout,
    titleMax,
    subtitleMax,
    maxImages,
    packageRequired,
    update,
    fetchDetails,
    set,
    setAspect,
    setExtra,
    setDraftImages,
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
  } = useDirectListForm({ shopLabel, marketplace, onCreated, onBlocked: setStep })
  const categoryField = (
    <>
      {layout.category === 'search' ? (
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
        <Input label="Category" value={draft?.category || ''} onChange={set('category')} />
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
    categoryField,
    conditionDescription,
    dispatchTimeMax,
    draft,
    ebayShipping,
    ebayConditionOptions,
    identifierCode,
    layout,
    maxImages,
    mpn,
    packageFields,
    parsedEbayRules,
    salesSchema,
    sellerSku,
    set,
    setDraftImages,
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
  // Once the page is read, start where the work is: checking what was found.
  const current = !draft && step !== 'link' ? 'link' : step
  const badSteps = new Set(problems.map((p) => p.step))
  const card = 'space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900'
  const needDraft = <p className="text-sm text-gray-500">Read a product link first.</p>

  return (
    <StepPanel
      title={`✨ Direct listing · ${shopLabel}`}
      steps={DIRECT_STEPS}
      active={current}
      onStep={setStep}
      problemSteps={badSteps}
      onClose={onClose}
      actions={(
        <>
          {(draft || url) && !fetching && (
            <Button variant="ghost" type="button" onClick={() => { clearDirectListing(marketplace); onClose() }}>Start over</Button>
          )}
          <Button variant="secondary" type="button" onClick={onClose}>{fetching || draft || url ? 'Hide' : 'Cancel'}</Button>
          {draft && (
            <Button type="button" onClick={create} disabled={saving || fetching}>
              {saving ? (layout.canList ? 'Publishing…' : 'Saving…') : (layout.canList ? layout.listAction : `Save to ${shopLabel}`)}
            </Button>
          )}
        </>
      )}
    >
      <Step id="link" active={current}>
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
          <p className="font-semibold">{shopLabel} listing format</p>
          <p className="mt-0.5">{profile?.productForm?.directIntro || layout.intro}</p>
          {layout.note && <p className="mt-1">{layout.note}</p>}
          {layout.apiName && <p className="mt-1 text-[11px]">Uses {layout.apiName}</p>}
        </div>
        <form onSubmit={async (e) => { await fetchDetails(e); setStep('found') }} className={card}>
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
              {fetching ? 'Reading the page…' : draft ? 'Read again' : 'Read the page'}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
            <input type="checkbox" checked={useAi} disabled={fetching} onChange={(e) => update({ useAi: e.target.checked })} />
            Use AI (GPT-5 mini) to clean up the title and description, fill in {layout.specifics?.label?.toLowerCase() || 'details'}, and look the page up if the site blocks it
          </label>
          {fetching && <p className="text-xs text-gray-500">✨ Reading the page. You can close this window — the request keeps running, and the draft waits here.</p>}
          {draft && !fetching && <p className="text-xs text-emerald-700">Done. <button type="button" className="underline" onClick={() => setStep('found')}>Check what was found →</button></p>}
        </form>
      </Step>

      <Step id="found" active={current}>
        {!draft ? needDraft : (
          <>
            <StepProblems problems={problems} step="found" />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700">{SOURCE_LABEL[draft.source] || draft.source}</span>
              {draft.aiUsed && <span className="rounded bg-purple-100 px-2 py-0.5 font-medium text-purple-700">✨ AI suggested the wording</span>}
              <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="truncate text-indigo-600 hover:underline">{draft.sourceUrl}</a>
            </div>
            {draft.warnings?.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                {draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            )}
            <div className={card}><FoundFields ctx={slotCtx} /></div>
          </>
        )}
      </Step>

      <Step id="category" active={current}>
        {!draft ? needDraft : (
          <>
            <StepProblems problems={problems} step="category" />
            <div className={card}>{categoryField}</div>
            {specificsFields && <div className={card}>{specificsFields}</div>}
          </>
        )}
      </Step>

      <Step id="price" active={current}>
        {!draft ? needDraft : (
          <>
            <StepProblems problems={problems} step="price" />
            <div className={card}><PriceFields ctx={slotCtx} /></div>
            <div className={card}><ShippingFields ctx={slotCtx} /></div>
          </>
        )}
      </Step>

      <Step id="review" active={current}>
        {!draft ? needDraft : (
          <>
            {problems.length > 0 && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/40">
                <p className="mb-1 text-sm font-semibold text-rose-800 dark:text-rose-200">Fix these first</p>
                <ul className="space-y-1 text-sm">
                  {problems.map((p) => (
                    <li key={`${p.step}:${p.message}`}>
                      <button type="button" className="text-left text-rose-700 underline-offset-2 hover:underline dark:text-rose-300" onClick={() => setStep(p.step)}>
                        {DIRECT_STEPS.find((x) => x.id === p.step)?.label}: {p.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className={`${card} flex gap-4`}>
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
                {draft.images?.[0] ? <img src={draft.images[0]} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-gray-400">No photo</span>}
              </div>
              <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-gray-500">Title</dt><dd className="truncate">{draft.title || '—'}</dd>
                <dt className="text-gray-500">Category</dt><dd className="truncate">{selectedCategory?.path || categoryId || '—'}</dd>
                <dt className="text-gray-500">Price</dt><dd>{activeVariants.length ? `from $${summaryPrice.toFixed(2)}` : draft.price ? `$${Number(draft.price).toFixed(2)}` : '—'}</dd>
                <dt className="text-gray-500">Stock</dt><dd>{activeVariants.length ? summaryStock : stock}</dd>
                <dt className="text-gray-500">Photos</dt><dd>{draft.images?.length || 0}</dd>
              </dl>
            </div>
          </>
        )}
      </Step>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
    </StepPanel>
  )
}
