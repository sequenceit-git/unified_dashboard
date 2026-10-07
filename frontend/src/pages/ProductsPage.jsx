import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import Button from '../components/ui/Button'
import Tabs from '../components/ui/Tabs'
import BulkModal from './products/BulkModal'
import CatalogTab from './products/CatalogTab'
import ListModal from './products/ListModal'
import ListingsTab from './products/ListingsTab'
import ProductModal from './products/ProductModal'

export default function ProductsPage() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('catalog')
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [listing, setListing] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const saved = () => {
    setEditing(null)
    setShowNew(false)
    setShowBulk(false)
    setListing(null)
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold">Products</h1>
        {isAdmin && tab === 'catalog' && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowBulk(true)}>Bulk upload</Button>
            <Button onClick={() => setShowNew(true)}>New product</Button>
          </div>
        )}
      </div>
      <Tabs
        tabs={[{ id: 'catalog', label: 'Catalog' }, { id: 'listings', label: 'By marketplace' }]}
        active={tab}
        onChange={setTab}
      />
      {tab === 'catalog' ? (
        <CatalogTab onEdit={setEditing} onList={setListing} refreshKey={refreshKey} />
      ) : (
        <ListingsTab />
      )}
      {(showNew || editing) && (
        <ProductModal product={editing || null} onClose={() => { setShowNew(false); setEditing(null) }} onSaved={saved} />
      )}
      {showBulk && <BulkModal onClose={() => setShowBulk(false)} onSaved={saved} />}
      {listing && <ListModal product={listing} onClose={() => setListing(null)} onSaved={saved} />}
    </div>
  )
}
