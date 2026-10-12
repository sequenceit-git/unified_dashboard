import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api } from '../../lib/api'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import AdjustModal from './AdjustModal'
import HistoryTab from './HistoryTab'
import LowStockTab from './LowStockTab'
import StockTab from './StockTab'

export default function InventoryPage() {
  const { token, isAdmin } = useAuth()
  const [tab, setTab] = useState('stock')
  const [adjusting, setAdjusting] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  const saved = () => {
    setAdjusting(null)
    setRefreshKey((k) => k + 1)
  }

  const handleSyncStock = async () => {
    setSyncing(true)
    setSyncMessage('')
    try {
      const res = await api.post('/api/inventory/sync', {}, token)
      setSyncMessage(`Stock pushed: ${res.synced} marketplace listings updated`)
      setRefreshKey((k) => k + 1)
      setTimeout(() => setSyncMessage(''), 4000)
    } catch (err) {
      setSyncMessage(`Failed: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          {syncMessage && <p className="text-xs text-emerald-600 font-medium">{syncMessage}</p>}
        </div>
        {isAdmin && (
          <Button onClick={handleSyncStock} disabled={syncing} size="sm">
            {syncing ? 'Pushing...' : '↻ Push Stock to Channels'}
          </Button>
        )}
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
      {tab === 'stock' && <StockTab onAdjust={setAdjusting} refreshKey={refreshKey} />}
      {tab === 'history' && <HistoryTab refreshKey={refreshKey} />}
      {tab === 'low' && <LowStockTab refreshKey={refreshKey} />}
      {adjusting && <AdjustModal product={adjusting} onClose={() => setAdjusting(null)} onSaved={saved} />}
    </div>
  )
}
