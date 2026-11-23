/** ebay listing: productFields · pricingExtras (moved verbatim from ProductModal.jsx) */
import { DISPATCH_TIMES } from '../rules'
import { Select } from '../../../../../../components/ui/Input'
import EbayBestOfferField from '../BestOfferField'

export default function PricingExtras({ ctx }) {
  const { form, set, setForm, variants } = ctx
  return (
    <>
      <div className="space-y-3 border-t border-gray-100 pt-3">
        <EbayBestOfferField
          value={form.bestOffer}
          onChange={(val) => setForm((prev) => ({ ...prev, bestOffer: val }))}
          minPrice={variants.length > 0
            ? Math.min(...(variants.map((v) => Number(v.price)).filter((p) => Number.isFinite(p) && p > 0)))
            : Number(form.basePrice)}
        />
        <Select
          label="Handling time"
          value={form.dispatchTimeMax}
          onChange={set('dispatchTimeMax')}
          options={DISPATCH_TIMES}
        />
      </div>
    </>
  )
}
