import { useEffect, useState } from 'react'
import { getShop } from '../../marketplaces'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { isFirstLoad, useApi } from '../../hooks/useApi'
import { useLiveEvents } from '../../hooks/useLiveEvents'
import { useShopProfiles } from '../../hooks/useShopProfiles'
import { api } from '../../lib/api'
import { allowedShopSections } from '../../hooks/useShopSection'
import { marketplaceLabel } from '../../marketplaces'
import AccountSettings from './AccountSettings'
import AiAgentSettings from './AiAgentSettings'

function statusLabel(shop, configured, isAdmin) {
  if (shop?.status === 'connected') return 'Connected'
  if (shop?.status === 'error') return 'Needs reconnecting'
  if (!isAdmin) return 'Not connected'
  if (configured) return 'Ready to connect'
  return 'Credentials needed'
}

function statusClass(shop, configured, isAdmin) {
  if (shop?.status === 'connected') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
  if (shop?.status === 'error') return 'bg-red-50 text-red-700 ring-red-600/20'
  if (!isAdmin) return 'bg-gray-100 text-gray-600 ring-gray-500/20'
  if (configured) return 'bg-blue-50 text-blue-700 ring-blue-600/20'
  return 'bg-amber-50 text-amber-700 ring-amber-600/20'
}

export default function SettingsPage() {
  const { token, isAdmin, user } = useAuth()
  const visibleMarkets = allowedShopSections(user, isAdmin).map((section) => ({ id: section.marketplace, label: section.label }))
  const configsRes = useApi(token && isAdmin ? '/api/shops/configs' : null)
  const shopsRes = useApi(token ? '/api/shops' : null)
  const shops = shopsRes.data || []
  const { profiles, refresh: refreshProfiles, reload: reloadProfiles } = useShopProfiles()
  const [searchParams, setSearchParams] = useSearchParams()
  const [connectingId, setConnectingId] = useState('')
  const [syncingId, setSyncingId] = useState('')
  const [liveId, setLiveId] = useState('')
  const [checkingAccessId, setCheckingAccessId] = useState('')
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState(false)

  // A sync finished on the worker (or the first sync after a connect): show the new "Last sync".
  useLiveEvents((event) => {
    if (event.type !== 'sync') return
    if (event.kind === 'access') reloadProfiles().catch(() => {})
    if (['full', 'listings', 'orders', 'live'].includes(event.kind)) shopsRes.refetch()
  })

  const connectedMarketplace = searchParams.get('connected')
  const oauthError = searchParams.get('error')

  useEffect(() => {
    if (connectedMarketplace) {
      setMessage(`${marketplaceLabel(connectedMarketplace)} was connected.`)
      setMessageError(false)
      shopsRes.refetch()
      refreshProfiles().catch(() => {})
      setSearchParams({}, { replace: true })
    } else if (oauthError) {
      setMessage(oauthError)
      setMessageError(true)
      setSearchParams({}, { replace: true })
    }
  }, [connectedMarketplace, oauthError])

  const shopFor = (marketplace) => shops.find((shop) => shop.marketplace === marketplace)

  const handleConnect = async (marketplace) => {
    setConnectingId(marketplace)
    setMessage('')
    try {
      const res = await api.get(`/api/shops/oauth/connect/${marketplace}`, token)
      if (res?.url) window.location.href = res.url
    } catch (err) {
      setMessage(err.message)
      setMessageError(true)
      setConnectingId('')
    }
  }

  const handleSync = async (shop) => {
    setSyncingId(shop._id)
    setMessage('')
    try {
      const res = await api.post(`/api/shops/${shop._id}/sync`, {}, token)
      const result = res?.result || {}
      const error = result.error || result.orders?.error || result.listings?.error
      if (error) {
        setMessage(`${shop.name}: ${error}`)
        setMessageError(true)
      } else {
        setMessage(result.queued
          ? `${shop.name} is still syncing in the background. Pages update when it finishes.`
          : `${shop.name} synchronized.`)
        setMessageError(false)
      }
      shopsRes.refetch()
    } catch (err) {
      setMessage(err.message)
      setMessageError(true)
    } finally {
      setSyncingId('')
    }
  }

  const handleLiveUpdates = async (shop) => {
    setLiveId(shop._id)
    setMessage('')
    try {
      const res = await api.post(`/api/shops/${shop._id}/live-updates`, {}, token)
      const result = res?.result || {}
      if (result.liveUpdates === 'on') {
        setMessage(`Live updates are on for ${shop.name}. New sales and messages now arrive within seconds.`)
        setMessageError(false)
      } else if (result.queued) {
        setMessage(`Turning on live updates for ${shop.name}…`)
        setMessageError(false)
      } else {
        setMessage(result.reason || result.error || result.skipped || 'Live updates could not be turned on.')
        setMessageError(true)
      }
      shopsRes.refetch()
    } catch (err) {
      setMessage(err.message)
      setMessageError(true)
    } finally {
      setLiveId('')
    }
  }

  const handleCheckAccess = async (shop) => {
    setCheckingAccessId(shop._id)
    setMessage('')
    try {
      const list = await refreshProfiles()
      const profile = list?.find((item) => item.marketplace === shop.marketplace)
      const locked = (profile?.sections || []).filter((section) => section.available === false)
      if (locked.length) {
        setMessage(`${shop.name}: still locked — ${locked.map((section) => `${section.label} (${section.reason})`).join(', ')}. Reconnect the shop to grant newly enabled scopes.`)
        setMessageError(true)
      } else {
        setMessage(`${shop.name}: all sections unlocked.`)
        setMessageError(false)
      }
      shopsRes.refetch()
    } catch (err) {
      setMessage(err.message)
      setMessageError(true)
    } finally {
      setCheckingAccessId('')
    }
  }

  // Only the first load: a shop's sync refetches in the background without blanking the page.
  if (isFirstLoad(shopsRes) || (isAdmin && isFirstLoad(configsRes))) return <Spinner />
  if (shopsRes.error) return <ErrorState message={shopsRes.error} onRetry={shopsRes.refetch} />

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Workspace</p>
        <h1 className="page-heading mt-1 text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-sm text-gray-500">Your sign-in details, marketplace shops and the AI agent.</p>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-3.5 py-2 text-sm font-semibold ${
            messageError
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {message}
        </div>
      )}

      <AccountSettings />

      {isAdmin && configsRes.error && <ErrorState message={configsRes.error} onRetry={configsRes.refetch} />}

      {visibleMarkets.length === 0 && !isAdmin && (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          No marketplace shops are assigned to this account.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleMarkets.map((market) => {
          const shop = shopFor(market.id)
          const configured = Boolean(configsRes.data?.[market.id]?.configured)
          const environment = configsRes.data?.[market.id]?.environment
          const connected = shop?.status === 'connected'
          const profile = profiles?.find((item) => item.marketplace === market.id)
          const lockedSections = connected ? (profile?.sections || []).filter((section) => section.available === false) : []
          return (
            <Card key={market.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{market.label}</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {shop?.name || `${market.label} shop`}
                    {environment ? ` · ${environment}` : ''}
                  </p>
                </div>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusClass(shop, configured, isAdmin)}`}>
                  {statusLabel(shop, configured, isAdmin)}
                </span>
              </div>

              {shop?.lastSyncAt && (
                <p className="mt-3 text-xs text-gray-500">
                  Last sync {new Date(shop.lastSyncAt).toLocaleString()}
                </p>
              )}

              {connected && getShop(shop.marketplace)?.liveUpdates && (
                shop.liveUpdates?.enabled ? (
                  <p className="mt-2 text-xs font-medium text-emerald-700">Live updates on: {getShop(shop.marketplace).liveUpdates.pushes} arrive within seconds.</p>
                ) : (
                  <p className="mt-2 text-xs text-amber-700">
                    Live updates off{shop.liveUpdates?.error ? `: ${shop.liveUpdates.error}` : '.'} New {getShop(shop.marketplace).liveUpdates.arrives} arrive with the regular sync.
                  </p>
                )
              )}

              {lockedSections.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Locked sections: {lockedSections.map((section) => `${section.label} (${section.reason || 'scope needed'})`).join(', ')}. Enable these scopes in Partner Center, then click Reconnect.
                </p>
              )}

              {shop?.status === 'error' && (
                <p className="mt-3 text-xs text-red-700">
                  {shop.authError || 'The shop login stopped working.'} Reconnect the shop to resume syncing.
                </p>
              )}

              {!configured && isAdmin && (
                <p className="mt-3 text-xs text-amber-700">
                  Add the {market.label} client id and secret before connecting this shop.
                </p>
              )}

              {!isAdmin && (
                <p className="mt-3 text-xs text-gray-500">A super admin connects shops for this workspace.</p>
              )}

              {isAdmin && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {configured && !connected && (
                    <Button onClick={() => handleConnect(market.id)} disabled={connectingId === market.id}>
                      {connectingId === market.id ? 'Connecting…' : shop?.status === 'error' ? `Reconnect ${market.label}` : `Connect ${market.label}`}
                    </Button>
                  )}
                  {connected && (
                    <>
                      <Button variant="secondary" onClick={() => handleConnect(market.id)} disabled={connectingId === market.id}>
                        {connectingId === market.id ? 'Connecting…' : 'Reconnect'}
                      </Button>
                      <Button variant="secondary" onClick={() => handleSync(shop)} disabled={syncingId === shop._id}>
                        {syncingId === shop._id ? 'Syncing…' : 'Sync shop'}
                      </Button>
                      <Button variant="secondary" onClick={() => handleCheckAccess(shop)} disabled={checkingAccessId === shop._id}>
                        {checkingAccessId === shop._id ? 'Checking…' : 'Check access'}
                      </Button>
                      {getShop(shop.marketplace)?.liveUpdates && !shop.liveUpdates?.enabled && (
                        <Button variant="secondary" onClick={() => handleLiveUpdates(shop)} disabled={liveId === shop._id}>
                          {liveId === shop._id ? 'Turning on…' : 'Turn on live updates'}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {isAdmin && <AiAgentSettings />}
    </div>
  )
}
