/**
 * Any eBay section page: loads `/api/ebay/sections/<sectionId>`, checks access, and shows the
 * loader's summary tiles and tables as tabs (sectionTabs). Row actions sent by the loader post to
 * `/api/ebay/sections/<sectionId>/<action>`; a page's own buttons come in through `tableActions` +
 * `onAction(type, row, ctx)`. `extraTabs` ([{ id, label, render }]) go first: a page keeps its own
 * content (e.g. Analytics' sales charts) as the first tab.
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
import Tabs from '../../components/ui/Tabs'
import SectionTable from './SectionTable'
import ReconnectNotice from './ReconnectNotice'
import { formatMoney } from './sectionFormat'
import { sectionTabs } from './sectionTabs'

export default function SectionView({ sectionId, title, extraTabs = [], tableActions, onAction, headerActions, children, reconnectNotice = false }) {
  const { token, hasRoute, isAdmin, user } = useAuth()
  const shopSection = useShopSection()
  const { profile, error: profileError } = useShopProfile(shopSection?.marketplace)
  const section = profile?.sections.find((item) => item.id === sectionId)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('')

  const isAllowed =
    isAdmin ||
    !Array.isArray(user?.allowedSections) ||
    user.allowedSections.length === 0 ||
    user.allowedSections.includes(sectionId) ||
    user.allowedSections.includes(`${shopSection?.marketplace}:${sectionId}`)
  const canOpen = section && hasRoute(section.route) && section.available !== false && isAllowed

  const load = async ({ refresh = false } = {}) => {
    setLoading(true)
    setError('')
    try {
      setData(await api.get(`/api/ebay/sections/${sectionId}${queryString({ refresh: refresh ? 1 : undefined })}`, token))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  const reload = () => load({ refresh: true })
  const ctx = { token, reload, setError, setLoading, setNotice, isAllowed: isAdmin || isAllowed }

  const runAction = async (action, row, value) => {
    setError('')
    setNotice('')
    try {
      const result = await api.post(`/api/ebay/sections/${sectionId}/${action.id}`, { id: row.id, ...(value !== undefined ? { value } : {}) }, token)
      setNotice(result?.message || `${action.label}: done.`)
      await reload()
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
  if (section.available === false) {
    return <EmptyState message={`${section.label} isn't available for ${profile.label}: ${section.reason}.`} />
  }

  const dataTabs = sectionTabs(data && { ...data, label: section.label })
  const tabs = [...extraTabs.map((t) => ({ ...t, extra: true })), ...dataTabs]
  const current = tabs.find((t) => t.id === activeTab) || tabs[0]

  return (
    <div className="space-y-4">
      {reconnectNotice && <ReconnectNotice />}
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
      {tabs.length > 1 && <Tabs tabs={tabs.map(({ id, label }) => ({ id, label }))} active={current?.id} onChange={setActiveTab} />}
      {current?.extra && current.render()}
      {!current?.extra && !data && loading && <Spinner />}
      {!current?.extra && current && (
        <>
          {current.summary.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {current.summary.map((item) => (
                <StatCard
                  key={item.label}
                  label={item.label}
                  value={item.type === 'money' ? formatMoney(item.value) : item.type === 'percent' ? `${Number(item.value || 0).toFixed(1)}%` : item.type === 'text' ? String(item.value ?? '—') : Number(item.value || 0).toLocaleString()}
                />
              ))}
            </div>
          )}
          {current.tables.map((table) => (
            <SectionTable
              key={table.id}
              table={table}
              tableActions={tableActions}
              onAction={(type, row) => onAction?.(type, row, ctx)}
              runAction={runAction}
              canAct={ctx.isAllowed}
              marketplace={shopSection.marketplace}
            />
          ))}
        </>
      )}
      {children?.(ctx)}
    </div>
  )
}
