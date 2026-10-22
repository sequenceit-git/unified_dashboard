import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import RequireShopSection from '../../components/RequireShopSection'
import { useShopSection } from '../../hooks/useShopSection'
import Button from '../../components/ui/Button'
import { useApi } from '../../hooks/useApi'
import BulkModal from './BulkModal'
import CatalogTab from './CatalogTab'
import ListModal from './ListModal'
import ProductModal from './ProductModal'

export default function ProductsPage() {
  const { isAdmin, token } = useAuth()
  const section = useShopSection()
  const marketplace = section?.marketplace
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [listing, setListing] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const shopsRes = useApi(token ? '/api/shops' : null)
  const shops = shopsRes.data || []
  const shopIds = useMemo(
    () => shops.filter((shop) => shop.marketplace === marketplace).map((shop) => shop._id),
    [shops, marketplace],
  )
  const noShopForTab = !shopsRes.loading && shopIds.length === 0

  const saved = () => {
    setEditing(null)
    setShowNew(false)
    setShowBulk(false)
    setListing(null)
    setRefreshKey((k) => k + 1)
  }

  if (!section) return <RequireShopSection />

  return (
    <div className="flex flex-col">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold">{section.label} products</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowBulk(true)}>Bulk upload</Button>
            <Button onClick={() => setShowNew(true)}>New product</Button>
          </div>
        )}
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="p-4">
          <CatalogTab
            onEdit={setEditing}
            onList={setListing}
            refreshKey={refreshKey}
            shopIds={shopIds}
            disabled={noShopForTab}
            disabledMessage={`Connect ${section.label} in Settings to see its products`}
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
