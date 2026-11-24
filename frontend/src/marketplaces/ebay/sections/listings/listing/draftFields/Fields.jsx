/** eBay Direct listing draft fields, split by step: what was found, price & variations, shipping. */
import { DISPATCH_TIMES, isNewCondition } from '../rules'
import { Input, Select } from '../../../../../../components/ui/Input'
import ImageDropzone from '../../../../../../components/ui/ImageDropzone'
import EbayIdentifierField from '../IdentifierField'
import EbayBestOfferField from '../BestOfferField'
import EbayShippingPayerField from '../ShippingPayerField'
import VariantEditor from '../../components/VariantEditor'

/** Title, subtitle, condition, brand, description and photos as read from the page. */
export function FoundFields({ ctx }) {
  const { conditionDescription, draft, ebayConditionOptions, maxImages, mpn, parsedEbayRules, set, setDraftImages, subtitle, subtitleMax, textareaClass, titleField, update } = ctx
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        {titleField}
        <Input
          label={`Subtitle (optional, ${(subtitle || '').length}/${subtitleMax} — extra eBay fee may apply)`}
          maxLength={subtitleMax}
          value={subtitle || ''}
          onChange={(e) => update({ subtitle: e.target.value })}
          placeholder="Supplemental keywords displayed under title"
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {parsedEbayRules.conditionEnabled !== 'Disabled' && (
            <Select
              label={`Condition${parsedEbayRules.conditionEnabled === 'Required' ? ' *' : ''}`}
              value={draft.condition || 'NEW'}
              onChange={set('condition')}
              options={ebayConditionOptions}
            />
          )}
          <Input label="Brand *" value={draft.brand} onChange={set('brand')} />
          <Input label="MPN (optional)" value={mpn || ''} onChange={(e) => update({ mpn: e.target.value })} placeholder="Manufacturer Part Number" />
        </div>
        {parsedEbayRules.conditionEnabled !== 'Disabled' && !isNewCondition(draft.condition) && (
          <div>
            <span className="mb-1 block text-xs font-semibold text-gray-600">Condition description ({(conditionDescription || '').length}/1000)</span>
            <textarea
              rows={2}
              maxLength={1000}
              className={textareaClass}
              value={conditionDescription || ''}
              onChange={(e) => update({ conditionDescription: e.target.value })}
              placeholder="Describe wear, scratches, or missing accessories…"
            />
          </div>
        )}
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-gray-600">Description</span>
          <textarea rows={8} className={textareaClass} value={draft.description} onChange={set('description')} />
        </div>
      </div>
      <ImageDropzone images={draft.images} onChange={setDraftImages} maxImages={maxImages} label={`Photos (up to ${maxImages})`} />
    </div>
  )
}

/** Price, stock, SKU, identifier, variations and Best Offer. */
export function PriceFields({ ctx }) {
  const { activeVariants, bestOffer, draft, identifierCode, parsedEbayRules, salesSchema, sellerSku, set, stock, summaryPrice, summaryStock, update } = ctx
  return (
    <div className="space-y-3">
      {activeVariants.length === 0 ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input label="Your price ($) *" type="number" step="0.01" min="0.01" value={draft.price} onChange={set('price')} />
            <Input label="Stock *" type="number" min="1" step="1" value={stock} onChange={(e) => update({ stock: e.target.value })} />
            <Input label="Seller SKU (optional)" maxLength={50} value={sellerSku || ''} onChange={(e) => update({ sellerSku: e.target.value })} placeholder="Auto-generated" />
          </div>
          <EbayIdentifierField required={parsedEbayRules.upcEnabled === 'Required'} value={identifierCode} onChange={(val) => update({ identifierCode: val })} />
        </>
      ) : (
        <p className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-900">
          <strong>{activeVariants.length} variations</strong> · from <strong>${summaryPrice.toFixed(2)}</strong> · <strong>{summaryStock}</strong> units
        </p>
      )}
      {draft.sourcePrice && <p className="text-xs text-gray-500">The page sells it for ${Number(draft.sourcePrice).toFixed(2)}. That is saved as the base price.</p>}
      {parsedEbayRules.variationsEnabled !== false ? (
        <VariantEditor
          key={`ebay-${draft.sourceUrl || 'direct'}`}
          marketplace="ebay"
          variants={activeVariants}
          onChange={(next) => update({ variants: next })}
          salesSchema={salesSchema}
          listingImages={draft.images}
          defaultPrice={draft.price}
          defaultStock={stock}
          baseSku={sellerSku || 'EBAY'}
          requireStock
        />
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">This eBay category does not support multi-variation listings.</p>
      )}
      {parsedEbayRules.bestOfferEnabled !== false && (
        <EbayBestOfferField value={bestOffer} onChange={(val) => update({ bestOffer: val })} minPrice={activeVariants.length > 0 ? summaryPrice : Number(draft.price)} />
      )}
    </div>
  )
}

/** Who pays shipping, handling time and the package. */
export function ShippingFields({ ctx }) {
  const { dispatchTimeMax, ebayShipping, layout, packageFields, update } = ctx
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <EbayShippingPayerField value={ebayShipping} onChange={(val) => update({ ebayShipping: val })} />
        <div className="rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          <Select label="Handling time" value={dispatchTimeMax || ''} onChange={(e) => update({ dispatchTimeMax: e.target.value })} options={DISPATCH_TIMES} />
        </div>
      </div>
      {layout.package === 'optional' && <details><summary className="cursor-pointer text-xs font-semibold text-gray-700 dark:text-slate-200">Package for calculated shipping (optional)</summary><div className="mt-2">{packageFields}</div></details>}
      {layout.package === 'required' && packageFields}
    </div>
  )
}
