import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { useApi } from '../../hooks/useApi'
import { useLiveEvents } from '../../hooks/useLiveEvents'
import { api } from '../../lib/api'
import { SHOP_SECTIONS } from '../../lib/shops'
import { marketplaceLabel } from '../../lib/marketplaces'
import AiAgentSettings from './AiAgentSettings'

const CONNECTABLE = SHOP_SECTIONS.map((section) => ({ id: section.marketplace, label: section.label }))

function statusLabel(shop, configured) {
  if (shop?.status === 'connected') return 'Connected'
  if (shop?.status === 'error') return 'Needs reconnecting'
  if (configured) return 'Ready to connect'
  return 'Credentials needed'
}

function statusClass(shop, configured) {
  if (shop?.status === 'connected') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
  if (shop?.status === 'error') return 'bg-red-50 text-red-700 ring-red-600/20'
  if (configured) return 'bg-blue-50 text-blue-700 ring-blue-600/20'
  return 'bg-amber-50 text-amber-700 ring-amber-600/20'
}

export default function SettingsPage() {
  const { token, isAdmin } = useAuth()
  const configsRes = useApi(token && isAdmin ? '/api/shops/configs' : null)
  const shopsRes = useApi(token ? '/api/shops' : null)
  const shops = shopsRes.data || []
  const [searchParams, setSearchParams] = useSearchParams()
  const [connectingId, setConnectingId] = useState('')
  const [syncingId, setSyncingId] = useState('')
  const [liveId, setLiveId] = useState('')
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState(false)

  // A sync finished on the worker (or the first sync after a connect): show the new "Last sync".
  useLiveEvents((event) => {
    if (event.type === 'sync' && ['full', 'listings', 'orders', 'live'].includes(event.kind)) shopsRes.refetch()
  })

  const connectedMarketplace = searchParams.get('connected')
  const oauthError = searchParams.get('error')

  useEffect(() => {
    if (connectedMarketplace) {
      setMessage(`${marketplaceLabel(connectedMarketplace)} was connected.`)
      setMessageError(false)
      shopsRes.refetch()
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

  if (shopsRes.loading || (isAdmin && configsRes.loading)) return <Spinner />
  if (shopsRes.error) return <ErrorState message={shopsRes.error} onRetry={shopsRes.refetch} />

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Workspace</p>
        <h1 className="page-heading mt-1 text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-sm text-gray-500">Connect marketplace shops and set up the AI agent.</p>
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

      {isAdmin && configsRes.error && <ErrorState message={configsRes.error} onRetry={configsRes.refetch} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CONNECTABLE.map((market) => {
          const shop = shopFor(market.id)
          const configured = Boolean(configsRes.data?.[market.id]?.configured)
          const environment = configsRes.data?.[market.id]?.environment
          const connected = shop?.status === 'connected'
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
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusClass(shop, configured)}`}>
                  {statusLabel(shop, configured)}
                </span>
              </div>

              {shop?.lastSyncAt && (
                <p className="mt-3 text-xs text-gray-500">
                  Last sync {new Date(shop.lastSyncAt).toLocaleString()}
                </p>
              )}

              {connected && shop.marketplace === 'ebay' && (
                shop.liveUpdates?.enabled ? (
                  <p className="mt-2 text-xs font-medium text-emerald-700">Live updates on: sales and messages arrive within seconds.</p>
                ) : (
                  <p className="mt-2 text-xs text-amber-700">
                    Live updates off{shop.liveUpdates?.error ? `: ${shop.liveUpdates.error}` : '.'} New sales and messages arrive with the regular sync.
                  </p>
                )
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
                      {shop.marketplace === 'ebay' && !shop.liveUpdates?.enabled && (
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
