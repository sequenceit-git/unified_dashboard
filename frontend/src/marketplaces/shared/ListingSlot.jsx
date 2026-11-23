import { getShop } from '../index'

/**
 * Renders one shop-specific part of a listing dialog: the component the shop registers under
 * `listing[form][name]` in src/marketplaces/<key>/index.js, or `children` when the shop has none.
 * `ctx` carries the dialog's state and setters that the part reads.
 */
export default function ListingSlot({ marketplace, form, name, ctx, children = null }) {
  const Part = getShop(marketplace)?.listing?.[form]?.[name]
  return Part ? <Part ctx={ctx} /> : children
}
