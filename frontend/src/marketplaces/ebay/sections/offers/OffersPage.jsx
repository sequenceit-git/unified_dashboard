/** eBay Best offers: listings with interested buyers (Send offer) plus the loader's tabs and actions. */
import { useState } from 'react'
import SectionView from '../../SectionView'
import sectionActions from './tableActions'
import OfferModal from './components/OfferModal'

export default function OffersPage() {
  const [activeOfferItem, setActiveOfferItem] = useState(null)
  return (
    <SectionView
      sectionId="offers"
      tableActions={sectionActions.tableActions}
      onAction={(type, row) => { if (type === 'offer') setActiveOfferItem(row) }}
    >
      {(ctx) => activeOfferItem && (
        <OfferModal item={activeOfferItem} token={ctx.token} onClose={() => setActiveOfferItem(null)} onSuccess={ctx.reload} />
      )}
    </SectionView>
  )
}
