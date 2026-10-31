import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import RequireShopSection from '../../components/RequireShopSection'
import { useShopSection } from '../../hooks/useShopSection'
import { useShopProfile } from '../../hooks/useShopProfiles'
import { api, queryString } from '../../lib/api'
import Card, { StatCard } from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import Button from '../../components/ui/Button'

const PAGE_SIZE = 15

function formatMoney(amount) {
  if (!amount || amount.value == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: amount.currency || 'USD' }).format(amount.value)
}

function formatCell(type, value) {
  if (value == null || value === '') return '—'
  switch (type) {
    case 'money': return <span className={value.value < 0 ? 'text-rose-600' : ''}>{formatMoney(value)}</span>
    case 'date': return new Date(value).toLocaleDateString()
    case 'number': return Number(value).toLocaleString()
    case 'status': return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{value}</span>
    case 'link': return <a href={value} target="_blank" rel="noreferrer" className="text-xs font-semibold text-indigo-600 hover:underline">Open</a>
    default: return <span className="line-clamp-2 max-w-md">{value}</span>
  }
}

function SectionTable({ table }) {
  const [page, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE))
  const rows = table.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((row, index) => ({ ...row, _key: `${page}-${index}` }))
  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{table.title}</h2>
        <span className="text-xs text-gray-500">{table.rows.length} total</span>
      </div>
      {table.note && <p className="mb-3 text-xs text-gray-500">{table.note}</p>}
      {table.error ? (
        <ErrorState message={table.error} />
      ) : (
        <DataTable
          rowKey="_key"
          rows={rows}
          columns={table.columns.map((column) => ({ ...column, render: (row) => formatCell(column.type, row[column.key]) }))}
        />
      )}
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-gray-500">{page} / {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </Card>
  )
}

/** Renders any shop-specific section (returns, finances, promotions...) from its profile. */
export default function ShopSectionPage() {
  const { sectionId } = useParams()
  const { token, hasRoute } = useAuth()
  const shopSection = useShopSection()
  const { profile, error: profileError } = useShopProfile(shopSection?.marketplace)
  const section = profile?.sections.find((item) => item.id === sectionId)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const canOpen = section && hasRoute(section.route) && section.available !== false
  const load = async ({ refresh = false } = {}) => {
    setLoading(true)
    setError('')
    try {
      setData(await api.get(`/api/shops/sections/${sectionId}${queryString({ marketplace: shopSection.marketplace, refresh: refresh ? 1 : undefined })}`, token))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setData(null)
    if (canOpen) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, shopSection?.marketplace, canOpen])

  if (!shopSection) return <RequireShopSection />
  if (profileError) return <ErrorState message={profileError} />
  if (!profile) return <Spinner />
  if (!section) return <EmptyState message={`${profile.label} doesn't have this section.`} />
  if (!hasRoute(section.route)) return <EmptyState message={`You don't have access to ${section.label}.`} />
  if (section.available === false) {
    return <EmptyState message={`${section.label} isn't available for ${profile.label}: ${section.reason}.`} />
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{profile.label} {section.label.toLowerCase()}</h1>
        <div className="flex items-center gap-3">
          {data?.loadedAt && <span className="text-xs text-gray-500">Updated {new Date(data.loadedAt).toLocaleTimeString()}</span>}
          <Button variant="secondary" size="sm" onClick={() => load({ refresh: true })} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        </div>
      </div>
      {error && <ErrorState message={error} onRetry={() => load({ refresh: true })} />}
      {!data && loading && <Spinner />}
      {data && (
        <>
          {data.summary?.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.summary.map((item) => (
                <StatCard
                  key={item.label}
                  label={item.label}
                  value={item.type === 'money' ? formatMoney(item.value) : Number(item.value || 0).toLocaleString()}
                />
              ))}
            </div>
          )}
          {data.tables.map((table) => <SectionTable key={table.id} table={table} />)}
        </>
      )}
    </div>
  )
}
