import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { MARKETPLACES } from '../lib/marketplaces'
import Button from '../components/ui/Button'
import Tabs from '../components/ui/Tabs'
import { useApi } from '../hooks/useApi'
import BulkModal from './products/BulkModal'
import CatalogTab from './products/CatalogTab'
import ListModal from './products/ListModal'
import ProductModal from './products/ProductModal'

export default function ProductsPage() {
  const { isAdmin, token } = useAuth()
  const [marketplace, setMarketplace] = useState('all')
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [listing, setListing] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const shopsRes = useApi(token ? '/api/shops' : null)
  const shops = shopsRes.data || []
  const shopIds = marketplace === 'all' ? [] : shops.filter((s) => s.marketplace === marketplace).map((s) => s._id)
  const noShopForTab = marketplace !== 'all' && !shopsRes.loading && shopIds.length === 0

  const saved = () => {
    setEditing(null)
    setShowNew(false)
    setShowBulk(false)
    setListing(null)
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold">Products</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowBulk(true)}>Bulk upload</Button>
            <Button onClick={() => setShowNew(true)}>New product</Button>
          </div>
        )}
      </div>
      <Tabs
        tabs={MARKETPLACES}
        active={marketplace}
        onChange={setMarketplace}
      />
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="p-4">
          <CatalogTab
            onEdit={setEditing}
            onList={setListing}
            refreshKey={refreshKey}
            shopIds={shopIds}
            disabled={noShopForTab}
            disabledMessage="No shop connected for this marketplace"
          />
        </div>
      </div>
      {(showNew || editing) && (
        <ProductModal product={editing || null} onClose={() => { setShowNew(false); setEditing(null) }} onSaved={saved} />
      )}
      {showBulk && <BulkModal onClose={() => setShowBulk(false)} onSaved={saved} />}
      {listing && <ListModal product={listing} onClose={() => setListing(null)} onSaved={saved} />}
    </div>
  )
}
