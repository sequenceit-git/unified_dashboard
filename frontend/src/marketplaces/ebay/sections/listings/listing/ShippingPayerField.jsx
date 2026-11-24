import { Input } from '../../../../../components/ui/Input'
import { validateShippingPayer } from './shippingPayer'

/**
 * eBay "Who pays shipping": the buyer (a flat cost, or eBay's calculated rate) or free shipping
 * paid by the seller. Read-only when the listing uses an eBay shipping policy.
 */
export default function EbayShippingPayerField({ value, onChange, type = value?.type || 'Flat' }) {
  const paidBy = value?.paidBy === 'seller' ? 'seller' : 'buyer'
  const err = validateShippingPayer(value, type)
  const set = (patch) => onChange({ ...value, ...patch })

  if (value?.policy) {
    return (
      <div className="space-y-1 rounded-lg border border-gray-200 bg-gray-50/70 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/40">
        <p className="font-semibold text-gray-700 dark:text-slate-200">Who pays shipping</p>
        <p className="text-gray-600 dark:text-slate-300">
          {paidBy === 'seller' ? 'Free shipping (you pay).' : 'The buyer pays.'} This listing uses your eBay shipping policy "{value.policy}": change it in Seller Hub.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <p className="text-xs font-semibold text-gray-700 dark:text-slate-200">Who pays shipping</p>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="ebay-shipping-payer" checked={paidBy === 'buyer'} onChange={() => set({ paidBy: 'buyer' })} />
          Buyer pays shipping
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="ebay-shipping-payer" checked={paidBy === 'seller'} onChange={() => set({ paidBy: 'seller', cost: '' })} />
          Free shipping (I pay)
        </label>
      </div>
      {paidBy === 'buyer' && type !== 'Calculated' && (
        <Input
          label="Shipping cost ($)"
          type="number"
          step="0.01"
          min="0.01"
          value={value?.cost ?? ''}
          onChange={(e) => set({ paidBy: 'buyer', cost: e.target.value })}
        />
      )}
      {paidBy === 'buyer' && type === 'Calculated' && <p className="text-xs text-gray-500">The buyer pays eBay's calculated rate.</p>}
      {paidBy === 'seller' && <p className="text-xs text-gray-500">The standard service is free to the buyer; faster services keep their prices.</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}
