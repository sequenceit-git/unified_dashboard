/** TikTok Shop promotions: deactivate and create (own buttons), plus the loader's tabs. */
import { useState } from 'react'
import SectionView from '../../SectionView'
import sectionActions from './tableActions'
import { api } from '../../../../lib/api'
import Button from '../../../../components/ui/Button'
import PromotionModal from './components/PromotionModal'

/** The page's own buttons (tableActions.jsx) call this with the section context. */
async function handleAction(type, row, ctx) {
  const { token, setLoading, setError } = ctx
  const load = () => ctx.reload()

    if (type === 'promo-pause') {
      const title = row.title || row.name || 'this promotion'
      if (!window.confirm(`${'Deactivate'} promotion "${title}"?`)) return
      setLoading(true)
      try {
        await api.post(`/api/tiktok/sections/promotions/${row.promotionId}/pause`, {}, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'promo-resume') {
      const title = row.title || row.name || 'this promotion'
      if (!window.confirm(`Resume promotion "${title}"?`)) return
      setLoading(true)
      try {
        await api.post(`/api/tiktok/sections/promotions/${row.promotionId}/resume`, {}, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
}

const renderRowActions = (table, ctx) => {
  const buttons = sectionActions.tableActions?.[table.id]
  return buttons && ((row) => buttons(row, { onAction: (type, r) => handleAction(type, r, ctx), marketplace: 'tiktok_shop' }))
}

export default function PromotionsPage() {
  const [showCreatePromo, setShowCreatePromo] = useState(false)
  return (
    <SectionView
      sectionId="promotions"
      renderRowActions={renderRowActions}
      headerActions={(ctx) => ctx.canAct && <Button size="sm" onClick={() => setShowCreatePromo(true)}>+ Create promotion</Button>}
    >
      {(ctx) => showCreatePromo && (
        <PromotionModal marketplace="tiktok_shop" token={ctx.token} onClose={() => setShowCreatePromo(false)} onSuccess={ctx.reload} />
      )}
    </SectionView>
  )
}
