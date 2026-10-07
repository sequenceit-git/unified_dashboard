import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api, queryString } from '../lib/api'
import Card from '../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback'
import Pagination from '../components/ui/Pagination'
import { Select } from '../components/ui/Input'
import { useApi } from '../hooks/useApi'
import ConversationList from './inbox/ConversationList'
import ThreadView from './inbox/ThreadView'

export default function InboxPage() {
  const { token } = useAuth()
  const [shopId, setShopId] = useState('all')
  const [status, setStatus] = useState('open')
  const [page, setPage] = useState(1)
  const [convos, setConvos] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [mobileThread, setMobileThread] = useState(false)

  const shopsRes = useApi(token ? '/api/shops' : null)

  const fetchConvos = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/inbox/conversations${queryString({ shopId, status, page, limit: 20 })}`, token)
      setConvos(res.data)
      setMeta({ page: res.page, pages: res.pages, total: res.total })
      if (res.data.length && !res.data.find((c) => c._id === activeId)) setActiveId(res.data[0]._id)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchConvos() }, [shopId, status, page]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Inbox <span className="text-sm font-normal text-gray-500">(placeholder — local only)</span></h1>
      <div className="grid max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        <Select
          value={shopId}
          onChange={(e) => { setShopId(e.target.value); setPage(1) }}
          options={[{ value: 'all', label: 'All shops' }, ...((shopsRes.data || []).map((s) => ({ value: s._id, label: `${s.name} (${s.marketplace})` })))]}
        />
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          options={['open', 'closed', 'all'].map((s) => ({ value: s, label: s }))}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
        <Card className={`${mobileThread ? 'hidden lg:block' : 'block'} !p-0 overflow-hidden`}>
          {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={fetchConvos} /> :
            convos.length === 0 ? <EmptyState message="No conversations" /> : (
              <>
                <ConversationList convos={convos} activeId={activeId} onSelect={(id) => { setActiveId(id); setMobileThread(true) }} />
                <Pagination page={meta.page} pages={meta.pages} total={meta.total} onPage={setPage} />
              </>
            )}
        </Card>
        <div className={`${mobileThread ? 'block' : 'hidden lg:block'}`}>
          <ThreadView convoId={activeId} onChanged={fetchConvos} onBack={() => setMobileThread(false)} />
        </div>
      </div>
    </div>
  )
}
