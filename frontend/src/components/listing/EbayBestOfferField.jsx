import { Input } from '../ui/Input'
import { validateBestOffer } from '../../lib/ebayListing'

/** eBay Best Offer toggle and optional auto-accept / auto-decline thresholds. */
export default function EbayBestOfferField({ value, onChange, minPrice = null }) {
  const enabled = Boolean(value?.enabled)
  const autoAcceptPrice = value?.autoAcceptPrice ?? ''
  const minOfferPrice = value?.minOfferPrice ?? ''
  const err = validateBestOffer(value, minPrice)

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-slate-200 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange({
            enabled: e.target.checked,
            autoAcceptPrice: e.target.checked ? autoAcceptPrice : '',
            minOfferPrice: e.target.checked ? minOfferPrice : '',
          })}
        />
        Accept Best Offers on eBay
      </label>
      {enabled && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input
            label="Auto-accept offers of at least ($)"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Optional"
            value={autoAcceptPrice}
            onChange={(e) => onChange({ ...value, enabled: true, autoAcceptPrice: e.target.value })}
          />
          <Input
            label="Auto-decline offers below ($)"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Optional"
            value={minOfferPrice}
            onChange={(e) => onChange({ ...value, enabled: true, minOfferPrice: e.target.value })}
          />
        </div>
      )}
      {err && <p className="text-[11px] font-medium text-red-600">{err}</p>}
    </div>
  )
}
