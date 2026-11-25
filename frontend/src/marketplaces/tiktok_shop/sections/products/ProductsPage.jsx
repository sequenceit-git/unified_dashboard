import { useState } from 'react'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import { useShopProfile } from '../../../../hooks/useShopProfiles'
import Button from '../../../../components/ui/Button'
import { useApi } from '../../../../hooks/useApi'
import { useAuth } from '../../../../auth/AuthContext'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import AttentionStrip from '../../ui/AttentionStrip'
import StatusPills from '../../ui/StatusPills'
import AdjustModal from '../inventory/AdjustModal'
import { attentionItems, statusPills, summaryLine } from './listView'
import SectionView from '../../SectionView'
import CatalogTab from './CatalogTab'
import DirectListModal from './DirectListModal'
import { hasDirectListingWork, useDirectListing } from './hooks/useDirectListing'
import ListModal from './ListModal'
import ProductModal from './ProductModal'

/**
 * TikTok Shop products: summary, needs attention (failed to list, live but out of stock), status pills
 * and one main button per row; TikTok's Listing quality, Opportunities and Shop readiness tabs stay.
 */
export default function ProductsPage() {
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
  const [pill, setPill] = useState('all')
  const [restocking, setRestocking] = useState(null)
  const { user, isAdmin, hasRoute } = useAuth()
  const counts = useApi(`/api/tiktok/products/counts?k=${refreshKey}`)
  useSyncReload('listings', marketplace, () => counts.refetch())
  // Restock changes stock through Inventory: users without it change stock in the product form instead.
  const sections = Array.isArray(user?.allowedSections) ? user.allowedSections : []
  const canRestock = hasRoute('inventory') && (isAdmin || !sections.length || sections.includes('inventory') || sections.includes('tiktok_shop:inventory'))
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
  const pills = statusPills(counts.data)
  const active = pills.find((p) => p.key === pill) || pills[0]

  const catalogTab = {
    id: 'catalog',
    label: 'Catalog',
    render: () => (
      <div className="space-y-3">
        {directWork && !showDirect && (
          <button
            type="button"
            onClick={() => setShowDirect(true)}
            className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-sm text-indigo-900 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100"
          >
            {directSession.fetching
              ? 'Direct listing is still reading the product page. Click to watch it finish — the request was not cancelled.'
              : 'A Direct listing draft is waiting. Click to continue from where you left off.'}
          </button>
        )}
        {counts.data && <p className="text-sm text-gray-500 dark:text-slate-400">{summaryLine(counts.data)}</p>}
        <AttentionStrip items={attentionItems(counts.data)} onPick={(item) => setPill(item.pill)} />
        <StatusPills pills={pills} active={active.key} onChange={setPill} />
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <CatalogTab
            listing={active.listing}
            canRestock={canRestock}
            onEdit={setEditing}
            onList={setListing}
            onRestock={setRestocking}
            onChanged={() => counts.refetch()}
            refreshKey={refreshKey}
            rowPatch={rowPatch}
            marketplace={marketplace}
            listLabel={listAction}
          />
        </div>
      </div>
    ),
  }

  return (
    <SectionView
      sectionId="products"
      title={`${section.label} ${pageLabel.toLowerCase()}`}
      extraTabs={[catalogTab]}
      headerActions={() => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowDirect(true)}>
            {directSession.fetching ? '✨ Direct listing…' : directWork ? '✨ Continue listing' : '✨ Direct listing'}
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)}>+ New product</Button>
        </div>
      )}
    >
      {() => (
        <>
          {restocking && (
            <AdjustModal
              product={restocking}
              onClose={() => setRestocking(null)}
              onSaved={() => { setRestocking(null); setRefreshKey((k) => k + 1) }}
            />
          )}
          {(showNew || editing) && (
            <ProductModal
              product={editing}
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
        </>
      )}
    </SectionView>
  )
}
