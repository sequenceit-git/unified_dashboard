/**
 * Temu inventory: what needs restocking first (Temu's stock check, out of stock, running low), the
 * goods with Adjust and their History, and every stock change.
 */
import { useState } from 'react'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import { useApi } from '../../../../hooks/useApi'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import PageHeader from '../../ui/PageHeader'
import AttentionStrip from '../../ui/AttentionStrip'
import StatusPills from '../../ui/StatusPills'
import Drawer from '../../ui/Drawer'
import AdjustModal from './AdjustModal'
import HistoryTab from './HistoryTab'
import StockTab from './StockTab'
import TemuStockCheck from './TemuStockCheck'
import { inventoryAttention, inventoryPills, inventorySummary } from './inventoryView'

export default function InventoryPage() {
  const section = useShopSection()
  const marketplace = section?.marketplace
  const [pill, setPill] = useState('all')
  const [adjusting, setAdjusting] = useState(null)
  const [history, setHistory] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [total, setTotal] = useState(null)
  const stock = useApi(`/api/temu/analytics/inventory?k=${refreshKey}`)
  useSyncReload(['listings', 'orders'], marketplace, () => stock.refetch())

  const saved = () => {
    setAdjusting(null)
    setRefreshKey((k) => k + 1)
  }

  if (!section) return <RequireShopSection />

  return (
    <div className="space-y-3">
      <PageHeader title="Temu inventory" summary={inventorySummary(stock.data, total)} />
      <TemuStockCheck key={refreshKey} />
      <AttentionStrip items={inventoryAttention(stock.data)} onPick={(item) => setPill(item.pill)} />
      <StatusPills pills={inventoryPills(stock.data, total)} active={pill} onChange={setPill} />
      <div>
        {pill === 'history'
          ? <HistoryTab marketplace={marketplace} refreshKey={refreshKey} />
          : <StockTab marketplace={marketplace} stock={pill} onAdjust={setAdjusting} onHistory={setHistory} onTotal={setTotal} refreshKey={refreshKey} />}
      </div>
      {adjusting && <AdjustModal product={adjusting} onClose={() => setAdjusting(null)} onSaved={saved} />}
      {history && (
        <Drawer title={`Stock history · ${history.sku}`} subtitle={history.title} onClose={() => setHistory(null)}>
          <HistoryTab marketplace={marketplace} refreshKey={refreshKey} productId={history._id} />
        </Drawer>
      )}
    </div>
  )
}
