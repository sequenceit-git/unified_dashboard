import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { api, queryString } from '../../lib/api'
import { MARKETPLACES } from '../../lib/marketplaces'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import { Select } from '../../components/ui/Input'
import Pagination from '../../components/ui/Pagination'
import Tabs from '../../components/ui/Tabs'
import { useApi } from '../../hooks/useApi'
import ConversationList from './ConversationList'
import ThreadView from './ThreadView'

export default function InboxPage() {
  const { token } = useAuth()
  const [marketplace, setMarketplace] = useState('all')
  const [status, setStatus] = useState('open')
  const [page, setPage] = useState(1)
  const [convos, setConvos] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [mobileThread, setMobileThread] = useState(false)

  const shopsRes = useApi(token ? '/api/shops' : null)
  const shops = useMemo(() => shopsRes.data || [], [shopsRes.data])
  const availableMarketplaces = useMemo(() => [
    MARKETPLACES[0],
    ...MARKETPLACES.slice(1).filter((market) => shops.some((shop) => shop.marketplace === market.id)),
  ], [shops])
  const shopIds = useMemo(
    () => (marketplace === 'all' ? [] : shops.filter((s) => s.marketplace === marketplace).map((s) => s._id)),
    [shops, marketplace],
  )
  const noShopForTab = marketplace !== 'all' && !shopsRes.loading && shopIds.length === 0

  const fetchConvos = async () => {
    if (shopsRes.loading) return
    if (noShopForTab) {
      setConvos([])
      setMeta({ page: 1, pages: 1, total: 0 })
      setActiveId(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const base = { status, page, limit: 20 }
      let res
      if (marketplace === 'all' || shopIds.length <= 1) {
        res = await api.get(
          `/api/inbox/conversations${queryString({ ...base, shopId: shopIds[0] })}`,
          token,
        )
      } else {
        // Multiple shops share a marketplace: fan out locally, merge newest-first.
        const parts = await Promise.all(
          shopIds.map((id) =>
            api.get(`/api/inbox/conversations${queryString({ ...base, shopId: id })}`, token),
          ),
        )
        const merged = parts
          .flatMap((p) => p.data || [])
          .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
        res = { data: merged, page: 1, pages: 1, total: parts.reduce((n, p) => n + (p.total || 0), 0) }
      }
      setConvos(res.data)
      setMeta({ page: res.page, pages: res.pages, total: res.total })
      if (res.data.length && !res.data.find((c) => c._id === activeId)) setActiveId(res.data[0]._id)
      if (res.data.length === 0) setActiveId(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchConvos() }, [marketplace, status, page, shopsRes.loading]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-[calc(100vh-4rem-3rem)] min-h-[480px] flex-col">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold">Inbox</h1>
        <div className="w-full max-w-[180px]">
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            options={['open', 'closed', 'all'].map((s) => ({ value: s, label: s }))}
          />
        </div>
      </div>
      <Tabs
        tabs={availableMarketplaces}
        active={marketplace}
        onChange={(m) => { setMarketplace(m); setPage(1); setMobileThread(false) }}
      />
      <div className="mt-3 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className={`flex w-full min-h-0 flex-col border-r border-gray-200 sm:w-[320px] sm:shrink-0 ${mobileThread ? 'hidden sm:flex' : 'flex'}`}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading || shopsRes.loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={fetchConvos} /> :
              convos.length === 0 ? <EmptyState message={noShopForTab ? 'No shop connected for this marketplace' : 'No conversations'} /> : (
                <ConversationList convos={convos} activeId={activeId} onSelect={(id) => { setActiveId(id); setMobileThread(true) }} />
              )}
          </div>
          <div className="border-t border-gray-100 px-3">
            <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />
          </div>
        </div>
        <div className={`min-h-0 min-w-0 flex-1 ${mobileThread ? 'flex flex-col' : 'hidden sm:flex sm:flex-col'}`}>
          <ThreadView convoId={activeId} onChanged={fetchConvos} onBack={() => setMobileThread(false)} />
        </div>
      </div>
    </div>
  )
}
