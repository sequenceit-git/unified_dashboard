import { useState } from 'react'
import { useDirectListForm } from './hooks/useDirectListForm'
import Button from '../../../../components/ui/Button'
import { Input, Select } from '../../../../components/ui/Input'
import StepPanel, { Step } from '../../ui/StepPanel'
import StepProblems from '../../ui/StepProblems'
import { TEMU_DIRECT_STEPS } from './listing/directSteps'
import { clearDirectListing } from './hooks/useDirectListing'
import DraftFields from './listing/draftFields/Fields'

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
    categories,
    categoryId,
    categorySearch,
    categoryState,
    error,
    problems,
    saving,
    profile,
    layout,
    titleMax,
    maxImages,
    update,
    fetchDetails,
    set,
    setDraftImages,
    selectedCategory,
    create,
  } = useDirectListForm({ shopLabel, marketplace, onCreated })
  const [step, setStep] = useState('link')
  const [advance, setAdvance] = useState(false)
  const categoryField = (
    <>
      {layout.category === 'search' ? (
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

  const titleField = draft ? (
    <Input
      label={`Title * (${draft.title.length}/${titleMax})`}
      value={draft.title}
      onChange={set('title')}
      maxLength={titleMax}
    />
  ) : null

  // State the shop's draft fields read (src/marketplaces/<key>/listing/draftFields/).
  const slotCtx = {
    categoryField,
    draft,
    maxImages,
    set,
    setDraftImages,
    stock,
    textareaClass,
    titleField,
    update,
  }
  const draftFields = draft && <DraftFields ctx={slotCtx} />

  // A successful read started on the first step moves on to checking what was found; a failed one stays.
  if (advance && !fetching && (draft || error)) {
    setAdvance(false)
    if (draft && !error && step === 'link') setStep('found')
  }
  const current = !draft ? 'link' : step
  const card = 'space-y-3 rounded-xl border border-gray-200/80 bg-white p-4 shadow-2xs dark:border-slate-800 dark:bg-slate-900'

  return (
    <StepPanel
      title={`✨ Direct listing · ${shopLabel}`}
      steps={TEMU_DIRECT_STEPS}
      active={current}
      onStep={setStep}
      problemSteps={new Set(problems.map((p) => p.step))}
      onClose={onClose}
      actions={(
        <>
          {(draft || url) && !fetching && (
            <Button variant="ghost" type="button" onClick={() => { clearDirectListing(marketplace); onClose() }}>Start over</Button>
          )}
          <Button variant="secondary" type="button" onClick={onClose}>{fetching || draft || url ? 'Hide' : 'Cancel'}</Button>
          {draft && <Button type="button" onClick={create} disabled={saving || fetching}>{saving ? 'Saving…' : 'Next: Temu details →'}</Button>}
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
        <form onSubmit={(e) => { setAdvance(true); fetchDetails(e) }} className={card}>
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
            <Button type="submit" disabled={fetching || !url.trim()}>{fetching ? 'Reading the page…' : draft ? 'Read again' : 'Read the page'}</Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
            <input type="checkbox" checked={useAi} disabled={fetching} onChange={(e) => update({ useAi: e.target.checked })} />
            Use AI (GPT-5 mini) to clean up the title and description, and look the page up if the site blocks it
          </label>
          {fetching && <p className="text-xs text-gray-500">✨ Reading the page. You can close this window — the request keeps running, and the draft waits here.</p>}
          {draft && !fetching && <p className="text-xs text-emerald-700">Done. <button type="button" className="underline" onClick={() => setStep('found')}>Check what was found →</button></p>}
        </form>
      </Step>

      <Step id="found" active={current}>
        {draft && (
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
            <div className={card}>{draftFields}</div>
            <p className="text-xs text-gray-500">Next, Temu's own form opens to choose the category, fill its properties (the AI fills what it can) and set the SKUs.</p>
          </>
        )}
      </Step>

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
    </StepPanel>
  )
}
