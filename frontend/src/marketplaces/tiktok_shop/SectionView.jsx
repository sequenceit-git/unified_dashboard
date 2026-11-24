/**
 * A TikTok Shop section page: loads `/api/tiktok/sections/<sectionId>`, checks access, and shows the
 * loader's tiles and tables grouped into tabs. Loader actions: row/table actions post to
 * `/api/tiktok/sections/<sectionId>/<action>` with `{ id, value }`; detail actions
 * (`detail: true`) read `GET …/<action>?id=` and open a read-only view (`{ title, summary, tables }`).
 *
 * Props: `extraTabs` [{ id, label, render }] go first (a page's own content, e.g. Analytics' sales
 * charts); `renderRowActions(table, ctx)` → `(row) => node` for the page's existing buttons;
 * `headerActions(ctx)`, `children(ctx)` for its own header buttons and dialogs.
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
import Tabs from '../../components/ui/Tabs'
import SectionTable from './SectionTable'
import { formatMoney } from './sectionFormat'
import { sectionTabs } from './sectionTabs'

function tileValue(item) {
  if (item.type === 'money') return formatMoney(item.value)
  if (item.type === 'percent') return `${Number(item.value || 0).toFixed(1)}%`
  if (item.type === 'text') return String(item.value ?? '—')
  return Number(item.value || 0).toLocaleString()
}

function Tiles({ items }) {
  if (!items?.length) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => <StatCard key={item.label} label={item.label} value={tileValue(item)} sub={item.sub} />)}
    </div>
  )
}

export default function SectionView({ sectionId, title, extraTabs = [], renderRowActions, headerActions, children }) {
  const { token, hasRoute, isAdmin, user } = useAuth()
  const shopSection = useShopSection()
  const { profile, error: profileError } = useShopProfile(shopSection?.marketplace)
  const section = profile?.sections.find((item) => item.id === sectionId)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('')
  const [detail, setDetail] = useState(null)

  const isAllowed = isAdmin || !Array.isArray(user?.allowedSections) || user.allowedSections.length === 0
    || user.allowedSections.includes(sectionId) || user.allowedSections.includes(`${shopSection?.marketplace}:${sectionId}`)
  const canOpen = section && hasRoute(section.route) && section.available !== false && isAllowed
  const base = `/api/tiktok/sections/${sectionId}`

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
  const ctx = { token, reload, setError, setLoading, setNotice, canAct: isAdmin || isAllowed }

  /** Posts a loader action; false keeps its dialog open (with what was typed) after an error. */
  const onRun = async (action, id, value) => {
    setError('')
    setNotice('')
    try {
      const res = await api.post(`${base}/${action.id}`, { id, ...(value !== undefined ? { value } : {}) }, token)
      setNotice(res?.message || `${action.label}: done.`)
      await reload()
      return true
    } catch (err) {
      setError(err.message)
      return false
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
    if (canOpen) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSection?.marketplace, canOpen])

  useSyncReload(['orders', 'listings'], shopSection?.marketplace, () => {
    if (canOpen && !loading) load()
  })

  if (!shopSection) return <RequireShopSection />
  if (profileError) return <ErrorState message={profileError} />
  if (!profile) return <Spinner />
  if (!section) return <EmptyState message={`${profile.label} doesn't have this section.`} />
  if (!hasRoute(section.route) || !isAllowed) return <EmptyState message={`You don't have access to ${section.label}.`} />
  if (section.available === false) return <EmptyState message={`${section.label} isn't available for ${profile.label}: ${section.reason}.`} />

  const tabs = [...extraTabs.map((t) => ({ ...t, own: true })), ...sectionTabs(data && { ...data, label: section.label })]
  const current = tabs.find((t) => t.id === tab) || tabs[0]
  const tableProps = { canAct: ctx.canAct, onRun, onDetail }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold">{title || `${profile.label} ${section.label.toLowerCase()}`}</h1>
        <div className="flex items-center gap-3">
          {data?.loadedAt && <span className="text-xs text-gray-500">Updated {new Date(data.loadedAt).toLocaleTimeString()}</span>}
          {headerActions?.(ctx)}
          <Button variant="secondary" size="sm" onClick={reload} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</Button>
        </div>
      </div>
      {notice && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{notice}</p>}
      {error && <ErrorState message={error} onRetry={reload} />}
      {tabs.length > 1 && <Tabs tabs={tabs.map(({ id, label }) => ({ id, label }))} active={current?.id} onChange={setTab} />}
      {current?.own && current.render()}
      {!current?.own && !data && loading && <Spinner />}
      {!current?.own && current && (
        <>
          <Tiles items={current.summary} />
          {current.tables.map((table) => (
            <SectionTable key={table.id} table={table} renderRowActions={renderRowActions && ((t) => renderRowActions(t, ctx))} {...tableProps} />
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
