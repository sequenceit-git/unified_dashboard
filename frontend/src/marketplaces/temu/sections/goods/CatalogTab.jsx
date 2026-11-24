import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import { api, queryString } from '../../../../lib/api'
import Badge from '../../../../components/ui/Badge'
import DataTable from '../../../../components/ui/DataTable'
import { Select } from '../../../../components/ui/Input'
import Pagination from '../../../../components/ui/Pagination'
import SearchInput from '../../../../components/ui/SearchInput'
import { listingActionsFor, listingBadge, useShopProfile } from '../../../../hooks/useShopProfiles'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import { FiChevronDown, FiExternalLink } from 'react-icons/fi'
import RowActions from '../../ui/RowActions'
import { chipsFor, goodsIdOf, mainAction } from './goodsView'

const STATUSES = ['all', 'draft', 'active', 'archived']
const SORTS = [
  { value: '-createdAt', label: 'Newest first' },
  { value: 'createdAt', label: 'Oldest first' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'sku', label: 'SKU A–Z' },
  { value: '-basePrice', label: 'Price: high to low' },
  { value: 'basePrice', label: 'Price: low to high' },
  { value: '-costPrice', label: 'Base price: high to low' },
  { value: 'costPrice', label: 'Base price: low to high' },
  { value: 'stock', label: 'Stock: low to high' },
]
const money = (v) => (v != null && v !== '' ? `$${Number(v).toFixed(2)}` : '—')
const SOURCES = [
  { value: 'all', label: 'All sources' },
  { value: 'research_bot', label: 'AI Agent (Bot)' },
  { value: 'manual', label: 'Manual' },
  { value: 'marketplace_sync', label: 'Marketplace sync' },
  { value: 'url_import', label: 'Direct listing' },
]
const STOCK = [
  { value: 'all', label: 'All stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
]

function categoryLabel(name) {
  const parts = String(name || '').split(' / ').filter(Boolean)
  if (parts.length <= 2) return name
  return parts.slice(-2).join(' / ')
}

/**
 * Temu goods table: search and More filters on top (the status pills live on the page), one row per
 * goods with its Temu state, Temu's signals (traffic, certificates, price reviews) and one main button.
 */
export default function CatalogTab({ listing = 'all', signals, canRestock = true, onEdit, onList, onRestock, onChanged, refreshKey, rowPatch = null, marketplace = 'temu' }) {
  const { token } = useAuth()
  const { profile } = useShopProfile(marketplace)
  const productStatus = profile?.productForm?.productStatus || {}
  const [rows, setRows] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [source, setSource] = useState('all')
  const [category, setCategory] = useState('all')
  const [stock, setStock] = useState('all')
  const [moreOpen, setMoreOpen] = useState(false)
  const [categories, setCategories] = useState([])
  const [sort, setSort] = useState('-createdAt')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState({ text: '', error: false })
  const requestId = useRef(0)
  const filtersOn = [status, source, category, stock].filter((v) => v !== 'all').length

  useEffect(() => {
    api.get('/api/temu/goods/categories', token).then(setCategories).catch(() => {})
  }, [token])

  useEffect(() => { setPage(1) }, [listing])

  useEffect(() => {
    if (!rowPatch?._id) return
    setRows((current) => current.map((row) => (
      String(row._id) === String(rowPatch._id) ? { ...row, ...rowPatch, shopListing: row.shopListing } : row
    )))
  }, [rowPatch])

  const fetchRows = async ({ quiet = false } = {}) => {
    const id = ++requestId.current
    if (!quiet) setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/temu/goods${queryString({
        q, status, category, stock, sort, page, limit: 15, marketplace, listing,
        ...(source !== 'all' ? { source } : {}),
      })}`, token)
      if (id !== requestId.current) return
      setRows(res.data)
      setMeta({ page: res.page, pages: res.pages, total: res.total })
    } catch (e) {
      if (id !== requestId.current) return
      setError(e.message)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(fetchRows, q ? 300 : 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, source, category, stock, listing, sort, page, refreshKey, marketplace])

  useSyncReload('listings', marketplace, () => fetchRows({ quiet: true }))

  const toggleSort = (key) => {
    setSort((s) => (s === key ? `-${key}` : key))
    setPage(1)
  }

  const runShopAction = async (r, action) => {
    if (action.confirm && !window.confirm(action.confirm)) return
    setBusy(String(r._id))
    setNotice({ text: '', error: false })
    try {
      const updated = await api.post(`/api/temu/goods/${r._id}/listing-action`, { action: action.id }, token)
      requestId.current += 1
      setRows((current) => current.map((row) => (
        String(row._id) === String(r._id) ? { ...row, shopListing: { ...row.shopListing, ...updated } } : row
      )))
      fetchRows({ quiet: true })
      onChanged?.()
    } catch (err) {
      setNotice({ text: err.message, error: true })
    } finally {
      setBusy('')
    }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this product? This cannot be undone.')) return
    setNotice({ text: '', error: false })
    try {
      await api.del(`/api/temu/goods/${id}`, token)
      fetchRows()
      onChanged?.()
    } catch (err) {
      setNotice({ text: err.message, error: true })
    }
  }

  const publish = (profile?.listingActions || []).find((a) => a.id === 'publish') || { id: 'publish', label: 'Put on sale' }
  const mainFor = (r) => {
    const next = mainAction(r, { canRestock })
    const run = {
      list: () => onList(r),
      fix: () => onList(r),
      edit: () => onEdit(r),
      restock: () => onRestock(r),
      publish: () => runShopAction(r, publish),
    }[next.id]
    return { label: next.label, primary: next.id !== 'edit', busy: busy === String(r._id), onClick: run }
  }
  const menuFor = (r) => {
    const next = mainAction(r, { canRestock }).id
    const listed = ['live', 'out_of_stock', 'pending'].includes(r.shopListing?.status)
    const canDelete = !listed || r.shopListing?.status === 'ended' || r.shopListing?.status === 'error'
    return [
      ...(next !== 'edit' ? [{ label: 'Edit', onClick: () => onEdit(r) }] : []),
      // A rejected goods may point at a goods Temu already removed: no link then.
      ...(r.shopListing?.listingUrl && r.shopListing.status !== 'error' ? [{ label: 'View on Temu', onClick: () => window.open(r.shopListing.listingUrl, '_blank', 'noopener') }] : []),
      ...listingActionsFor(profile, r.shopListing).filter((a) => !(a.id === 'publish' && next === 'publish')).map((a) => ({ label: a.label, danger: a.danger, onClick: () => runShopAction(r, a) })),
      ...(canDelete ? [{ label: 'Delete', danger: true, onClick: () => remove(r._id) }] : []),
    ]
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput className="sm:max-w-md sm:flex-1" value={q} onChange={(v) => { setQ(v); setPage(1) }} placeholder="Search title, SKU or Temu goods ID…" />
        <button
          type="button"
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          className="inline-flex items-center gap-1 self-start rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-200"
        >
          More filters{filtersOn ? ` (${filtersOn})` : ''} <FiChevronDown aria-hidden="true" className={moreOpen ? 'rotate-180' : ''} />
        </button>
      </div>
      {moreOpen && (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select className="min-w-0" value={source} onChange={(e) => { setSource(e.target.value); setPage(1) }} options={SOURCES} aria-label="Source" />
          <Select
            className="min-w-0"
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1) }}
            options={[{ value: 'all', label: 'All categories' }, ...categories.map((name) => ({ value: name, label: categoryLabel(name) }))]}
            aria-label="Category"
          />
          <Select className="min-w-0" value={stock} onChange={(e) => { setStock(e.target.value); setPage(1) }} options={STOCK} aria-label="Stock" />
          <Select className="min-w-0" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} options={STATUSES.map((s) => ({ value: s, label: s === 'all' ? 'All product states' : productStatus[s] || s }))} aria-label="Product state" />
          <Select className="min-w-0" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }} options={SORTS} aria-label="Sort" />
        </div>
      )}
      {notice.text && <p className={`mb-2 text-sm ${notice.error ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{notice.text}</p>}
      <DataTable
        columns={[
          {
            key: 'title',
            label: 'Listing',
            sortable: true,
            render: (r) => {
              const img = Array.isArray(r.images) && r.images[0]
              const item = r.shopListing?.externalListingId ? goodsIdOf(r.shopListing.externalListingId) : ''
              return (
                <div className="flex min-w-[14rem] items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800">
                    {img ? <img src={img} alt="" className="h-full w-full object-cover" onError={(e) => { e.target.style.display = 'none' }} /> : <span className="text-[10px] text-gray-400">No img</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-medium">{r.title}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500 dark:text-slate-400">
                      <span>SKU {r.sku}</span>
                      {item && r.shopListing?.listingUrl && r.shopListing.status !== 'error' && (
                        <a href={r.shopListing.listingUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline dark:text-indigo-400">
                          Goods {item} <FiExternalLink size={11} aria-hidden="true" />
                        </a>
                      )}
                      {Array.isArray(r.variants) && r.variants.length > 1 && <span>{r.variants.length} variants</span>}
                      <span className={r.source === 'research_bot' ? 'text-purple-600' : ''}>{r.source === 'research_bot' ? 'AI Agent' : SOURCES.find((s) => s.value === r.source)?.label || 'Manual'}</span>
                    </p>
                  </div>
                </div>
              )
            },
          },
          {
            key: 'basePrice',
            label: 'Price',
            sortable: true,
            render: (r) => (
              <span>
                {money(r.basePrice)}
                {r.costPrice != null && r.costPrice !== '' && <span className="block text-xs text-gray-500">base {money(r.costPrice)}</span>}
              </span>
            ),
          },
          { key: 'stock', label: 'Stock', sortable: true, render: (r) => <span className={r.stock <= r.lowStockThreshold ? 'font-bold text-rose-600' : ''}>{r.stock}</span> },
          {
            key: 'listing',
            label: 'Temu',
            render: (r) => {
              const badge = listingBadge(profile, r.shopListing)
              return (
                <span className="block max-w-[14rem]">
                  {badge ? <Badge color={badge.color}>{badge.label}</Badge> : <Badge color="gray">Not listed</Badge>}
                  {r.shopListing?.status === 'error' && r.shopListing.syncError && <span className="mt-1 block line-clamp-2 text-xs text-rose-600">Temu: {r.shopListing.syncError}</span>}
                </span>
              )
            },
          },
          {
            key: 'signals',
            label: 'Temu says',
            render: (r) => {
              const chips = chipsFor(r.shopListing?.externalListingId ? signals?.goods?.[goodsIdOf(r.shopListing.externalListingId)] : null)
              if (!chips.length) return <span className="text-gray-400">—</span>
              const tone = { red: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200', amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200', blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200' }
              return <span className="flex max-w-[12rem] flex-wrap gap-1">{chips.map((c) => <span key={c.label} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone[c.tone]}`}>{c.label}</span>)}</span>
            },
          },
          { key: 'actions', label: '', render: (r) => <RowActions main={mainFor(r)} menu={menuFor(r)} /> },
        ]}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={fetchRows}
        sort={sort}
        onSort={toggleSort}
        onRowClick={onEdit}
      />
      <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />
    </div>
  )
}
