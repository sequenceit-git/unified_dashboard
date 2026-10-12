import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import Card, { StatCard } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import { useApi } from '../../hooks/useApi'
import { api } from '../../lib/api'

export default function Overview() {
  const { token, isAdmin } = useAuth()
  const { data, loading, error, refetch } = useApi(token ? '/api/dashboard/overview' : null)
  const configsRes = useApi(token && isAdmin ? '/api/shops/configs' : null)
  const configs = configsRes.data
  const shopsRes = useApi(token ? '/api/shops' : null)
  const shops = shopsRes.data || []

  const [searchParams, setSearchParams] = useSearchParams()
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [connecting, setConnecting] = useState(false)

  const connectedMarketplace = searchParams.get('connected')
  const oauthError = searchParams.get('error')

  useEffect(() => {
    if (connectedMarketplace) {
      setSyncMsg(`${connectedMarketplace.toUpperCase()} store was connected successfully!`)
      shopsRes.refetch()
      refetch()
    }
  }, [connectedMarketplace])

  const handleConnect = async (marketplace) => {
    setConnecting(true)
    try {
      const res = await api.get(`/api/shops/oauth/connect/${marketplace}`, token)
      if (res?.url) {
        window.location.href = res.url
      }
    } catch (err) {
      alert(`Failed to start connection: ${err.message}`)
    } finally {
      setConnecting(false)
    }
  }

  const handleSyncAll = async () => {
    setSyncingAll(true)
    setSyncMsg('')
    try {
      await api.post('/api/shops/sync-all', {}, token)
      setSyncMsg('All connected stores (orders, customers, and product listings) synchronized successfully!')
      refetch()
      setTimeout(() => setSyncMsg(''), 5000)
    } catch (err) {
      setSyncMsg(`Sync failed: ${err.message}`)
    } finally {
      setSyncingAll(false)
    }
  }

  if (loading) return <Spinner />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) return <EmptyState />

  const cards = [
    { label: 'Orders', value: data.counts.orders, to: '/orders' },
    { label: 'Products', value: data.counts.products, to: '/products' },
    { label: 'Customers', value: data.counts.customers, to: '/customers' },
    { label: 'Open conversations', value: data.counts.conversations, to: '/inbox' },
    { label: 'Shops', value: data.counts.shops, to: '/products' },
    { label: 'Low-stock alerts', value: data.counts.notifications, to: '/inventory' },
  ]

  const getShopForMarketplace = (id) => shops.find((s) => s.marketplace === id)

  const marketplaces = [
    {
      id: 'ebay',
      name: 'eBay',
      configured: configs?.ebay?.configured,
      connected: getShopForMarketplace('ebay')?.status === 'connected',
      detail: configs?.ebay?.configured
        ? `Configured (${configs.ebay.environment})`
        : 'Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET in .env',
    },
  ]

  return (
    <div className="space-y-7">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Workspace overview</p>
        <h1 className="page-heading mt-1 text-3xl font-bold text-gray-900">Good morning, here’s your pulse.</h1>
        <p className="mt-2 text-sm text-gray-500">Track your stores, orders, and customer activity from one place.</p>
      </div>

      <Link
        to="/discovery"
        className="group flex flex-col justify-between gap-4 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 p-5 text-white shadow-lg transition hover:shadow-xl sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl font-bold backdrop-blur-xs">
            ✦
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white text-base">Autonomous AI Product Discovery Agent</h2>
              <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                Live Signals
              </span>
            </div>
            <p className="mt-0.5 text-xs text-indigo-200">
              Scan high-velocity sales trends, analyze profit margins, and import winning products directly into your catalog.
            </p>
          </div>
        </div>
        <div className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-indigo-900 shadow-sm transition group-hover:bg-indigo-50">
          Open Product Discovery →
        </div>
      </Link>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} to={c.to}>
            <StatCard label={c.label} value={c.value} />
          </Link>
        ))}
      </div>

      <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/50">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-100 text-sm text-indigo-700">✦</span>
              <div>
                <h2 className="font-semibold text-gray-900">eBay Marketplace API Integration Status</h2>
                <p className="mt-1 text-sm leading-6 text-gray-600">
                  Direct gateway for eBay. Manage OAuth tokens, inventory synchronization, and order pipelines.
                </p>
              </div>
            </div>
            {isAdmin && (
              <Button size="sm" onClick={handleSyncAll} disabled={syncingAll}>
                {syncingAll ? 'Syncing Channels…' : '↻ Sync All Store Data'}
              </Button>
            )}
          </div>

          {syncMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">
              ✓ {syncMsg}
            </div>
          )}

          {oauthError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800">
              ✕ Connection error: {oauthError}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {marketplaces.map((m) => (
              <div key={m.id} className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">{m.name}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.connected
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
                          : m.configured
                            ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-600/20'
                            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20'
                      }`}
                    >
                      {m.connected ? '● Connected' : m.configured ? 'API Ready' : 'Credentials Needed'}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{m.detail}</p>
                </div>

                {isAdmin && m.configured && !m.connected && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full text-xs"
                      onClick={() => handleConnect(m.id)}
                      disabled={connecting}
                    >
                      {connecting ? 'Connecting…' : `Connect ${m.name} Store →`}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}

