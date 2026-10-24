import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { useApi } from '../../hooks/useApi'
import { api } from '../../lib/api'
import { SHOP_SECTIONS } from '../../lib/shops'
import { marketplaceLabel } from '../../lib/marketplaces'
import AiAgentSettings from './AiAgentSettings'

const CONNECTABLE = SHOP_SECTIONS.map((section) => ({ id: section.marketplace, label: section.label }))

function statusLabel(shop, configured) {
  if (shop?.status === 'connected') return 'Connected'
  if (configured) return 'Ready to connect'
  return 'Credentials needed'
}

function statusClass(shop, configured) {
  if (shop?.status === 'connected') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
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
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState(false)

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
      await api.post(`/api/shops/${shop._id}/sync`, {}, token)
      setMessage(`${shop.name} synchronized.`)
      setMessageError(false)
      shopsRes.refetch()
    } catch (err) {
      setMessage(err.message)
      setMessageError(true)
    } finally {
      setSyncingId('')
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

      <div className="grid gap-4 lg:grid-cols-3">
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
                      {connectingId === market.id ? 'Connecting…' : `Connect ${market.label}`}
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
