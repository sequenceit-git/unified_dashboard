import { useState } from 'react'
import RequireShopSection from '../../components/RequireShopSection'
import { useShopSection } from '../../hooks/useShopSection'
import Tabs from '../../components/ui/Tabs'
import AdjustModal from './AdjustModal'
import HistoryTab from './HistoryTab'
import LowStockTab from './LowStockTab'
import StockTab from './StockTab'

export default function InventoryPage() {
  const section = useShopSection()
  const marketplace = section?.marketplace
  const [tab, setTab] = useState('stock')
  const [adjusting, setAdjusting] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const saved = () => {
    setAdjusting(null)
    setRefreshKey((k) => k + 1)
  }

  if (!section) return <RequireShopSection />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">{section.label} inventory</h1>
      </div>

      <Tabs
        tabs={[
          { id: 'stock', label: 'Stock' },
          { id: 'history', label: 'History' },
          { id: 'low', label: 'Low stock' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'stock' && <StockTab marketplace={marketplace} onAdjust={setAdjusting} refreshKey={refreshKey} />}
      {tab === 'history' && <HistoryTab marketplace={marketplace} refreshKey={refreshKey} />}
      {tab === 'low' && <LowStockTab marketplace={marketplace} refreshKey={refreshKey} />}
      {adjusting && <AdjustModal product={adjusting} onClose={() => setAdjusting(null)} onSaved={saved} />}
    </div>
  )
}
