import { promotionActions } from '../../shared/actions'

/** TikTok Shop deactivates promotions; a deactivated one can't be resumed. */
const actions = promotionActions({ pauseLabel: 'Deactivate', skip: (row, isPaused) => isPaused })

export default {
  tableActions: { promotions: actions, activities: actions },
}
