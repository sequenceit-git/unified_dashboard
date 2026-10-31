import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import RequireShopSection from '../../components/RequireShopSection'
import { useShopSection } from '../../hooks/useShopSection'
import { useShopProfile } from '../../hooks/useShopProfiles'
import Button from '../../components/ui/Button'
import CatalogTab from './CatalogTab'
import DirectListModal from './DirectListModal'
import { hasDirectListingWork, useDirectListing } from '../../hooks/useDirectListing'
import ListModal from './ListModal'
import ProductModal from './ProductModal'

export default function ProductsPage() {
  const { isAdmin } = useAuth()
  const section = useShopSection()
  const marketplace = section?.marketplace
  const { profile } = useShopProfile(marketplace)
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showDirect, setShowDirect] = useState(false)
  const [listing, setListing] = useState(null)
  const [listPrefill, setListPrefill] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [rowPatch, setRowPatch] = useState(null)
  const { session: directSession } = useDirectListing(marketplace)
  const directWork = hasDirectListingWork(marketplace)

  const saved = (product) => {
    setEditing(null)
    setShowNew(false)
    setShowDirect(false)
    setListing(null)
    setListPrefill(null)
    setRowPatch(product?._id ? product : null)
    setRefreshKey((k) => k + 1)
  }

  const created = (product, extra = null) => {
    saved()
    if (product?._id && !extra?.listed) {
      setListing(product)
      setListPrefill(extra)
    }
  }

  if (!section) return <RequireShopSection />
  const pageLabel = profile?.sections.find((item) => item.id === 'products')?.label || 'Products'
  const listAction = profile?.productForm?.listAction || `List on ${section.label}`

  return (
    <div className="flex flex-col">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold">{section.label} {pageLabel.toLowerCase()}</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowDirect(true)}>
              {directSession.fetching ? 'Direct listing…' : directWork ? 'Continue listing' : 'Direct listing'}
            </Button>
            <Button onClick={() => setShowNew(true)}>New product</Button>
          </div>
        )}
      </div>
      {isAdmin && directWork && !showDirect && (
        <button
          type="button"
          onClick={() => setShowDirect(true)}
          className="mt-3 w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-sm text-indigo-900 hover:bg-indigo-100"
        >
          {directSession.fetching
            ? 'Direct listing is still reading the product page. Click to watch it finish — the request was not cancelled.'
            : 'A Direct listing draft is waiting. Click to continue from where you left off.'}
        </button>
      )}
      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="p-4">
          <CatalogTab
            onEdit={setEditing}
            onList={setListing}
            refreshKey={refreshKey}
            rowPatch={rowPatch}
            marketplace={marketplace}
            listLabel={listAction}
          />
        </div>
      </div>
      {(showNew || editing) && (
        <ProductModal
          product={editing || null}
          marketplace={marketplace}
          onClose={() => { setShowNew(false); setEditing(null) }}
          onSaved={editing ? saved : created}
          onListingChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {showDirect && <DirectListModal shopLabel={section.label} marketplace={marketplace} onClose={() => setShowDirect(false)} onCreated={created} />}
      {listing && (
        <ListModal
          product={listing}
          marketplace={marketplace}
          prefill={listPrefill}
          onClose={() => { setListing(null); setListPrefill(null); setRefreshKey((k) => k + 1) }}
          onSaved={saved}
        />
      )}
    </div>
  )
}
