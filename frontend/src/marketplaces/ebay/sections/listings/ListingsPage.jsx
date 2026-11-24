import { useState } from 'react'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import Button from '../../../../components/ui/Button'
import { useApi } from '../../../../hooks/useApi'
import PageHeader from '../../ui/PageHeader'
import AttentionStrip from '../../ui/AttentionStrip'
import StatusPills from '../../ui/StatusPills'
import AdjustModal from '../inventory/AdjustModal'
import CatalogTab from './CatalogTab'
import { attentionItems, statusPills, summaryLine, trafficByItem } from './listView'
import DirectListModal from './DirectListModal'
import { hasDirectListingWork, useDirectListing } from './hooks/useDirectListing'
import ListModal from './ListModal'
import ProductModal from './ProductModal'

export default function ListingsPage() {
  const section = useShopSection()
  const marketplace = section?.marketplace
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showDirect, setShowDirect] = useState(false)
  const [listing, setListing] = useState(null)
  const [listPrefill, setListPrefill] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [rowPatch, setRowPatch] = useState(null)
  const [pill, setPill] = useState('all')
  const [restocking, setRestocking] = useState(null)
  const counts = useApi(`/api/ebay/listings/counts?k=${refreshKey}`)
  // 30-day views per eBay item, from the same listing traffic as Analytics (left out when not allowed).
  const analytics = useApi('/api/ebay/sections/analytics')
  const traffic = trafficByItem((analytics.data?.tables || []).find((t) => t.id === 'traffic')?.rows)
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
  const pills = statusPills(counts.data)
  const active = pills.find((p) => p.key === pill) || pills[0]

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="eBay listings"
        summary={summaryLine(counts.data)}
        actions={(
          <>
            <Button variant="secondary" onClick={() => setShowDirect(true)}>
              {directSession.fetching ? '✨ Direct listing…' : directWork ? '✨ Continue listing' : '✨ Direct listing'}
            </Button>
            <Button onClick={() => setShowNew(true)}>+ New product</Button>
          </>
        )}
      />
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
      <AttentionStrip items={attentionItems(counts.data)} onPick={(item) => setPill(item.pill)} />
      <StatusPills pills={pills} active={active.key} onChange={setPill} />
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <CatalogTab
          listing={active.listing}
          traffic={traffic}
          onEdit={setEditing}
          onList={setListing}
          onRestock={setRestocking}
          onChanged={() => counts.refetch()}
          refreshKey={refreshKey}
          rowPatch={rowPatch}
          marketplace={marketplace}
        />
      </div>
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
    </div>
  )
}
