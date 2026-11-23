import { useEffect, useState } from 'react'
import { useAuth } from '../../../../auth/AuthContext'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import { useShopProfile } from '../../../../hooks/useShopProfiles'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import { api, queryString } from '../../../../lib/api'
import { StatCard } from '../../../../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../../../../components/ui/Feedback'
import Button from '../../../../components/ui/Button'

import { formatMoney } from './sectionFormat'
import SectionTable from './components/SectionTable'

export default function AfterSalesPage() {
  const sectionId = 'after-sales'
  const { token, hasRoute, isAdmin, user } = useAuth()
  const shopSection = useShopSection()
  const { profile, error: profileError } = useShopProfile(shopSection?.marketplace)
  const section = profile?.sections.find((item) => item.id === sectionId)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
      setData(await api.get(`/api/temu/sections/${sectionId}${queryString({ refresh: refresh ? 1 : undefined })}`, token))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async (type, row) => {
    if (type === 'cancel-approve') {
      if (!window.confirm(`Approve cancellation for Order ${row.orderId || row.cancelId}?`)) return
      setLoading(true)
      try {
        await api.post('/api/temu/sections/cancellations/decide', { cancelId: row.cancelId, orderId: row.orderId, action: 'approve' }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'return-approve') {
      if (!window.confirm(`Approve return request for Order ${row.orderId || row.returnId}?`)) return
      setLoading(true)
      try {
        await api.post('/api/temu/sections/after-sales/decide', {
          returnId: row.returnId,
          orderId: row.orderId,
          decision: 'APPROVE',
          ...(row.returnType ? { returnType: row.returnType } : {}),
          ...(row.rawStatus ? { rawStatus: row.rawStatus } : {}),
        }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold">{profile.label} {section.label.toLowerCase()}</h1>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {data.summary.map((item) => (
                <StatCard
                  key={item.label}
                  label={item.label}
                  value={item.type === 'money' ? formatMoney(item.value) : Number(item.value || 0).toLocaleString()}
                />
              ))}
            </div>
          )}
          {data.tables.map((table) => (
            <SectionTable
              key={table.id}
              table={table}
              marketplace={shopSection.marketplace}
              onAction={handleAction}
              canAct={isAdmin || isAllowed}
            />
          ))}
        </>
      )}

    </div>
  )
}
