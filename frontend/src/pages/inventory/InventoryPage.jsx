import { useState } from 'react'
import Tabs from '../../components/ui/Tabs'
import AdjustModal from './AdjustModal'
import HistoryTab from './HistoryTab'
import LowStockTab from './LowStockTab'
import StockTab from './StockTab'

export default function InventoryPage() {
  const [tab, setTab] = useState('stock')
  const [adjusting, setAdjusting] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const saved = () => {
    setAdjusting(null)
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Inventory</h1>
      <Tabs
        tabs={[
          { id: 'stock', label: 'Stock' },
          { id: 'history', label: 'History' },
          { id: 'low', label: 'Low stock' },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'stock' && <StockTab onAdjust={setAdjusting} refreshKey={refreshKey} />}
      {tab === 'history' && <HistoryTab refreshKey={refreshKey} />}
      {tab === 'low' && <LowStockTab refreshKey={refreshKey} />}
      {adjusting && <AdjustModal product={adjusting} onClose={() => setAdjusting(null)} onSaved={saved} />}
    </div>
  )
}
