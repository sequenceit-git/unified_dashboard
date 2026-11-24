/**
 * A Temu section page: `/api/temu/sections/<sectionId>` shown as pill tabs of tiles and tables.
 * Loader actions post to `/api/temu/sections/<sectionId>/<action>` (`{ id, value }`); detail actions
 * read `GET …/<action>?id=` and open a read-only view. Props: `ownTabs` ([{ id, label, render }],
 * placed first, shown even when Temu's API for the section isn't available), `renderRowActions(table,
 * ctx)` for the page's existing buttons, `headerActions(ctx)`, `children(ctx)`.
 */
import { useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import RequireShopSection from '../../components/RequireShopSection'
import { useShopSection } from '../../hooks/useShopSection'
import { useShopProfile } from '../../hooks/useShopProfiles'
import { useSyncReload } from '../../hooks/useLiveEvents'
import { api, queryString } from '../../lib/api'
import { StatCard } from '../../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import SectionTable from './SectionTable'
import { formatMoney } from './sectionFormat'
import { pageMode, sectionTabs } from './sectionTabs'

const shownValue = (t) => (t.type === 'money' ? formatMoney(t.value) : t.type === 'percent' ? `${Number(t.value || 0).toFixed(1)}%` : t.type === 'text' ? String(t.value ?? '—') : Number(t.value || 0).toLocaleString())

function Pills({ tabs, active, onPick }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          onClick={() => onPick(t.id)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${t.id === active ? 'bg-orange-500 text-white shadow-sm' : 'bg-orange-50 text-orange-800 hover:bg-orange-100 dark:bg-orange-950/40 dark:text-orange-200'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function Tiles({ items }) {
  if (!items?.length) return null
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{items.map((t) => <StatCard key={t.label} label={t.label} value={shownValue(t)} sub={t.sub} />)}</div>
}

export default function SectionView({ sectionId, title, ownTabs = [], renderRowActions, headerActions, children }) {
  const { token, hasRoute, isAdmin, user } = useAuth()
  const shopSection = useShopSection()
  const { profile, error: profileError } = useShopProfile(shopSection?.marketplace)
  const section = profile?.sections.find((s) => s.id === sectionId)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState('')
  const [detail, setDetail] = useState(null)

  const allowed = isAdmin || !Array.isArray(user?.allowedSections) || user.allowedSections.length === 0
    || user.allowedSections.includes(sectionId) || user.allowedSections.includes(`${shopSection?.marketplace}:${sectionId}`)
  const mode = pageMode(section, ownTabs)
  const canLoad = section && hasRoute(section.route) && allowed && mode === 'full'
  const base = `/api/temu/sections/${sectionId}`

  const load = async ({ refresh = false } = {}) => {
    setLoading(true)
    setError('')
    try {
      setData(await api.get(`${base}${queryString({ refresh: refresh ? 1 : undefined })}`, token))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  const reload = () => load({ refresh: true })
  const ctx = { token, reload, setError, setLoading, setNotice, canAct: isAdmin || allowed }

  /** `{ error }` keeps the action's dialog open with the message; otherwise the page reloads. */
  const onRun = async (action, id, value) => {
    setNotice('')
    try {
      const res = await api.post(`${base}/${action.id}`, { id, ...(value !== undefined ? { value } : {}) }, token)
      setNotice(res?.message || `${action.label}: done.`)
      await reload()
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  }
  const onDetail = async (action, id) => {
    setError('')
    try {
      setDetail(await api.get(`${base}/${action.id}${queryString({ id })}`, token))
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => {
    setData(null)
    if (canLoad) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSection?.marketplace, canLoad])

  useSyncReload(['orders', 'listings'], shopSection?.marketplace, () => {
    if (canLoad && !loading) load()
  })

  if (!shopSection) return <RequireShopSection />
  if (profileError) return <ErrorState message={profileError} />
  if (!profile) return <Spinner />
  if (!section) return <EmptyState message={`${profile.label} doesn't have this section.`} />
  if (!hasRoute(section.route) || !allowed) return <EmptyState message={`You don't have access to ${section.label}.`} />
  if (mode === 'unavailable') return <EmptyState message={`${section.label} isn't available for ${profile.label}: ${section.reason}.`} />

  const tabs = [...ownTabs.map((t) => ({ ...t, own: true })), ...sectionTabs(data && { ...data, label: section.label })]
  const current = tabs.find((t) => t.id === active) || tabs[0]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold">{title || `${profile.label} ${section.label.toLowerCase()}`}</h1>
        <div className="flex items-center gap-3">
          {data?.loadedAt && <span className="text-xs text-gray-500">Updated {new Date(data.loadedAt).toLocaleTimeString()}</span>}
          {headerActions?.(ctx)}
          {mode === 'full' && <Button variant="secondary" size="sm" onClick={reload} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>}
        </div>
      </div>
      {mode === 'own-tabs-only' && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">Temu's own {section.label.toLowerCase()} data isn't available for {profile.label}: {section.reason}.</p>}
      {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}
      {error && <ErrorState message={error} onRetry={reload} />}
      {tabs.length > 1 && <Pills tabs={tabs} active={current?.id} onPick={setActive} />}
      {current?.own && current.render()}
      {!current?.own && !data && loading && <Spinner />}
      {!current?.own && current && (
        <>
          <Tiles items={current.summary} />
          {current.tables.map((table) => (
            <SectionTable key={table.id} table={table} canAct={ctx.canAct} renderRowActions={renderRowActions && ((t) => renderRowActions(t, ctx))} onRun={onRun} onDetail={onDetail} />
          ))}
        </>
      )}
      {detail && (
        <Modal title={detail.title || 'Details'} wide onClose={() => setDetail(null)}>
          <div className="space-y-4">
            <Tiles items={detail.summary} />
            {(detail.tables || []).map((table) => <SectionTable key={table.id} table={table} canAct={false} />)}
          </div>
        </Modal>
      )}
      {children?.(ctx)}
    </div>
  )
}
