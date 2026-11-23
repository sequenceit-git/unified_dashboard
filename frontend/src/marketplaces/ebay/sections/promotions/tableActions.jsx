import { promotionActions } from './rowActions'

/** eBay can only pause/resume threshold discounts; markdown sales have no pause. */
const actions = promotionActions({ skip: (row) => /markdown|item price/i.test(String(row.type || '')) })

export default {
  tableActions: { promotions: actions, activities: actions },
}
