/** eBay List form field groups (split by step): condition & brand, SKU & identifier, variations, offers, shipping. */
import { DISPATCH_TIMES, isNewCondition } from '../rules'
import { Input, Select } from '../../../../../../components/ui/Input'
import EbayIdentifierField from '../IdentifierField'
import EbayBestOfferField from '../BestOfferField'
import EbayShippingPayerField from '../ShippingPayerField'
import VariantEditor from '../../components/VariantEditor'

export function ConditionBrand({ ctx }) {
  const { brand, condition, conditionDescription, ebayConditionOptions, ebayRules, mpn, setBrand, setCondition, setConditionDescription, setMpn } = ctx
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {ebayRules.conditionEnabled !== 'Disabled' && (
          <Select
            label={`Condition${ebayRules.conditionEnabled === 'Required' ? ' *' : ''}`}
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            options={ebayConditionOptions}
          />
        )}
        <Input label="Brand *" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Apple, Nike, Unbranded" />
        <Input label="MPN (optional)" value={mpn} onChange={(e) => setMpn(e.target.value)} placeholder="Manufacturer Part Number" />
      </div>
      {ebayRules.conditionEnabled !== 'Disabled' && !isNewCondition(condition) && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Condition description ({conditionDescription.length}/1000)</label>
          <textarea
            rows={2}
            maxLength={1000}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900"
            value={conditionDescription}
            onChange={(e) => setConditionDescription(e.target.value)}
            placeholder="Describe wear, scratches, or missing accessories…"
          />
        </div>
      )}
    </>
  )
}

export function SkuIdentifier({ ctx }) {
  const { activeVariants, ebayRules, identifierCode, sellerSku, setIdentifierCode, setSellerSku } = ctx
  if (activeVariants.length > 0) return null
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Input label="Seller SKU" maxLength={50} value={sellerSku} onChange={(e) => setSellerSku(e.target.value)} />
      <div className="sm:col-span-2">
        <EbayIdentifierField required={ebayRules.upcEnabled === 'Required'} value={identifierCode} onChange={setIdentifierCode} />
      </div>
    </div>
  )
}

export function Variations({ ctx }) {
  const { ebayRules, images, price, product, salesAttributes, sellerSku, setVariants, shopId, stock, variants } = ctx
  if (ebayRules.variationsEnabled === false) {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">This eBay category does not support multi-variation listings.</p>
  }
  return (
    <VariantEditor
      key={`ebay-${product._id}-${shopId}`}
      marketplace="ebay"
      variants={variants}
      onChange={setVariants}
      salesSchema={salesAttributes}
      listingImages={images}
      defaultPrice={price}
      defaultStock={stock}
      baseSku={sellerSku || product.sku || 'EBAY'}
      requireStock
    />
  )
}

export function Offers({ ctx }) {
  const { activeVariants, bestOffer, ebayRules, price, setBestOffer, summaryPrice } = ctx
  if (ebayRules.bestOfferEnabled === false) return null
  return <EbayBestOfferField value={bestOffer} onChange={setBestOffer} minPrice={activeVariants.length > 0 ? summaryPrice : Number(price)} />
}

export function ShippingFields({ ctx }) {
  const { dispatchTimeMax, ebayShipping, setDispatchTimeMax, setEbayShipping } = ctx
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <EbayShippingPayerField value={ebayShipping} onChange={setEbayShipping} />
      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <Select label="Handling time" value={dispatchTimeMax} onChange={(e) => setDispatchTimeMax(e.target.value)} options={DISPATCH_TIMES} />
      </div>
    </div>
  )
}
