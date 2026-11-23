import { useEffect, useState } from 'react'
import { useAuth } from '../../../../../auth/AuthContext'
import { api } from '../../../../../lib/api'
import { Input, Select } from '../../../../../components/ui/Input'

/** Searchable TikTok Shop brand selector (`brand_id` + display `brand`). */
export default function BrandPicker({ shopId, categoryId = '', brandId = '', brand = '', onChange }) {
  const { token } = useAuth()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [brands, setBrands] = useState([])
  const [status, setStatus] = useState('idle')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!shopId) return undefined
    let cancelled = false
    const params = new URLSearchParams()
    if (categoryId) params.set('categoryId', categoryId)
    if (debounced) params.set('q', debounced)
    api.get(`/api/shops/${shopId}/brands?${params.toString()}`, token)
      .then((list) => {
        if (cancelled) return
        setBrands(Array.isArray(list) ? list : [])
        setStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setBrands([])
        setStatus('error')
      })
    return () => { cancelled = true }
  }, [shopId, categoryId, debounced, token])

  const options = [
    { value: '', label: 'No brand / Unbranded' },
    ...(brandId && !brands.some((b) => b.id === brandId)
      ? [{ value: brandId, label: brand ? `${brand} (selected)` : `Brand #${brandId}` }]
      : []),
    ...brands.map((b) => ({
      value: b.id,
      label: b.authorized ? `${b.name} · Authorized` : b.name,
    })),
  ]

  const handleSelect = (nextId) => {
    if (!nextId) {
      onChange({ brandId: '', brand: brand === 'Unbranded' ? 'Unbranded' : '' })
      return
    }
    const found = brands.find((b) => b.id === nextId)
    onChange({ brandId: nextId, brand: found?.name || brand })
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-700 dark:text-slate-200">TikTok Brand</span>
        {brandId && (
          <button
            type="button"
            className="text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            onClick={() => onChange({ brandId: '', brand: '' })}
          >
            Clear brand ID
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          placeholder="Search TikTok brand name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!shopId}
        />
        <Select
          value={brandId}
          onChange={(e) => handleSelect(e.target.value)}
          options={options}
          disabled={!shopId}
        />
      </div>
      {!brandId && (
        <Input
          label="Brand text fallback (optional)"
          placeholder="Unbranded"
          value={brand}
          onChange={(e) => onChange({ brandId: '', brand: e.target.value })}
        />
      )}
      {status === 'error' && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">Could not load TikTok brands for this category; you can still list as Unbranded.</p>
      )}
    </div>
  )
}
