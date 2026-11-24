import { useState } from 'react'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import Button from '../../../../components/ui/Button'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../../auth/AuthContext'
import { useApi } from '../../../../hooks/useApi'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import PageHeader from '../../ui/PageHeader'
import AttentionStrip from '../../ui/AttentionStrip'
import StatusPills from '../../ui/StatusPills'
import AdjustModal from '../inventory/AdjustModal'
import { attentionItems, signalTotals, statusPills, summaryLine } from './goodsView'
import CatalogTab from './CatalogTab'
import ComplianceTab from './ComplianceTab'
import Tabs from '../../../../components/ui/Tabs'
import DirectListModal from './DirectListModal'
import { hasDirectListingWork, useDirectListing } from './hooks/useDirectListing'
import ListModal from './ListModal'
import ProductModal from './ProductModal'

export default function GoodsPage() {
  const section = useShopSection()
  const marketplace = section?.marketplace
  const navigate = useNavigate()
  const { user, isAdmin, hasRoute } = useAuth()
  const [pill, setPill] = useState('all')
  const [restocking, setRestocking] = useState(null)
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showDirect, setShowDirect] = useState(false)
  const [listing, setListing] = useState(null)
  const [listPrefill, setListPrefill] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [rowPatch, setRowPatch] = useState(null)
  const [tab, setTab] = useState('catalog')
  const [showNewTemu, setShowNewTemu] = useState(false)
  const { session: directSession } = useDirectListing(marketplace)
  const directWork = hasDirectListingWork(marketplace)
  const counts = useApi(`/api/temu/goods/counts?k=${refreshKey}`)
  useSyncReload('listings', marketplace, () => counts.refetch())
  // Temu's traffic, certificate and price-review signals per goods (cached on the server).
  const signals = useApi('/api/temu/goods/signals')
  const totals = signalTotals(signals.data)
  // Restock changes stock through Inventory: users without it change stock in the goods form instead.
  const sections = Array.isArray(user?.allowedSections) ? user.allowedSections : []
  const canRestock = hasRoute('inventory') && (isAdmin || !sections.length || sections.includes('inventory') || sections.includes('temu:inventory'))

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
  const pick = (item) => {
    if (item.pill) { setTab('catalog'); setPill(item.pill) }
    else if (item.tab) setTab(item.tab)
    else if (item.to) navigate(item.to)
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="Temu goods"
        summary={summaryLine(counts.data, totals)}
        actions={(
          <>
            <Button variant="secondary" onClick={() => setShowDirect(true)}>
              {directSession.fetching ? '✨ Direct listing…' : directWork ? '✨ Continue listing' : '✨ Direct listing'}
            </Button>
            <Button onClick={() => setShowNewTemu(true)}>+ New goods on Temu</Button>
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
      <AttentionStrip items={attentionItems(counts.data, totals)} onPick={pick} />
      {signals.data?.unavailable?.length > 0 && (
        <p className="text-xs text-gray-500">Temu didn't share: {signals.data.unavailable.join(', ')}.</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {tab === 'catalog' ? <StatusPills pills={pills} active={active.key} onChange={setPill} /> : <span />}
        <Tabs tabs={[{ id: 'catalog', label: 'Goods' }, { id: 'compliance', label: 'Compliance' }]} active={tab} onChange={setTab} />
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        {tab === 'compliance' ? <ComplianceTab /> : (
          <CatalogTab
            listing={active.listing}
            signals={signals.data}
            canRestock={canRestock}
            onEdit={setEditing}
            onList={setListing}
            onRestock={setRestocking}
            onChanged={() => counts.refetch()}
            refreshKey={refreshKey}
            rowPatch={rowPatch}
            marketplace={marketplace}
          />
        )}
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
      {showNewTemu && (
        <ListModal product={null} marketplace={marketplace} onClose={() => { setShowNewTemu(false); setRefreshKey((k) => k + 1) }} onSaved={() => setRefreshKey((k) => k + 1)} />
      )}
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
