/** eBay Promotions: pause/resume and create, plus the loader's tabs (e.g. results). */
import { useState } from 'react'
import SectionView from '../../SectionView'
import Button from '../../../../components/ui/Button'
import sectionActions from './tableActions'
import PromotionModal from './components/PromotionModal'
import { api } from '../../../../lib/api'

async function handleAction(type, row, ctx) {
  const verb = type === 'promo-pause' ? 'pause' : type === 'promo-resume' ? 'resume' : null
  if (!verb) return
  const title = row.title || row.name || 'this promotion'
  if (!window.confirm(`${verb === 'pause' ? 'Pause' : 'Resume'} promotion "${title}"?`)) return
  ctx.setLoading(true)
  try {
    await api.post(`/api/ebay/sections/promotions/${row.promotionId}/${verb}`, {}, ctx.token)
    await ctx.reload()
  } catch (e) {
    ctx.setError(e.message)
  } finally {
    ctx.setLoading(false)
  }
}

export default function PromotionsPage() {
  const [showCreatePromo, setShowCreatePromo] = useState(false)
  return (
    <SectionView
      sectionId="promotions"
      tableActions={sectionActions.tableActions}
      onAction={handleAction}
      headerActions={(ctx) => ctx.isAllowed && <Button size="sm" onClick={() => setShowCreatePromo(true)}>+ Create promotion</Button>}
    >
      {(ctx) => showCreatePromo && (
        <PromotionModal marketplace="ebay" token={ctx.token} onClose={() => setShowCreatePromo(false)} onSuccess={ctx.reload} />
      )}
    </SectionView>
  )
}
