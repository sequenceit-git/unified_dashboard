/**
 * Temu promotions: activities open to join (Enrol goods at Temu's recommended activity price and
 * quantity), the ones you joined (their enrolled goods in a drawer), and ended ones.
 */
import { useState } from 'react'
import { queryString } from '../../../../lib/api'
import { useApi } from '../../../../hooks/useApi'
import RequireShopSection from '../../../../components/RequireShopSection'
import ShopSectionGate from '../../../../components/ShopSectionGate'
import { useShopSection } from '../../../../hooks/useShopSection'
import Badge from '../../../../components/ui/Badge'
import Button from '../../../../components/ui/Button'
import { EmptyState, ErrorState, Spinner } from '../../../../components/ui/Feedback'
import PageHeader from '../../ui/PageHeader'
import StatusPills from '../../ui/StatusPills'
import Drawer from '../../ui/Drawer'
import SectionTable from '../../SectionTable'
import { endsText, splitActivities } from './promotionsView'
import EnrolPanel from './EnrolPanel'

const BASE = '/api/temu/sections/promotions'
const date = (v) => (v ? new Date(v).toLocaleDateString() : '—')

export default function PromotionsPage() {
  return <ShopSectionGate sectionId="promotions"><Promotions /></ShopSectionGate>
}

function Enrolled({ activity, onClose }) {
  const { data, loading, error, refetch } = useApi(`${BASE}/enrolled${queryString({ id: activity.id })}`)
  return (
    <Drawer title={activity.name || `Activity ${activity.id}`} subtitle="Your goods in this promotion" onClose={onClose} footer={<span className="ml-auto"><Button variant="secondary" onClick={onClose}>Close</Button></span>}>
      {loading && <Spinner />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {(data?.tables || []).map((t) => <SectionTable key={t.id} table={t} canAct={false} />)}
    </Drawer>
  )
}

function Promotions() {
  const section = useShopSection()
  const [pill, setPill] = useState('open')
  const [fresh, setFresh] = useState(0)
  const [viewing, setViewing] = useState(null)
  const [enrolling, setEnrolling] = useState(null)
  const [notice, setNotice] = useState({ text: '', error: false })
  const [now, setNow] = useState(() => new Date())
  const { data, loading, error, refetch } = useApi(`${BASE}${fresh ? `?refresh=1&n=${fresh}` : ''}`)
  if (!section) return <RequireShopSection />

  const split = splitActivities(data, now)
  const reload = () => { setNow(new Date()); setFresh((n) => n + 1) }
  const enrolled = (res) => {
    setEnrolling(null)
    setNotice({ text: res?.message || 'Submitted to Temu.', error: (res?.refused || []).length > 0 })
    reload()
  }
  const tableErrors = (data?.tables || []).filter((t) => t.error)
  // Open and ended come from Temu's full list; joined from either list.
  const unknown = { open: split.failed.available, joined: split.failed.joined && split.failed.available, ended: split.failed.available }
  const countOf = (key) => (data && !unknown[key] ? split[key].length : null)
  const list = split[pill] || []
  const note = (data?.tables || []).find((t) => t.id === 'available')?.note

  return (
    <div className="space-y-3">
      <PageHeader
        title="Temu promotions"
        summary={data ? [countOf('joined') != null && `${split.joined.length} joined`, countOf('open') != null && `${split.open.length} open to join`, data.loadedAt && `updated ${new Date(data.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join(' · ') : ''}
        actions={<Button variant="secondary" disabled={loading} onClick={reload}>{loading ? 'Refreshing…' : 'Refresh'}</Button>}
      />
      {error && <ErrorState message={error} onRetry={refetch} />}
      {tableErrors.map((t) => <p key={t.id} className="text-sm text-rose-600 dark:text-rose-400">{t.title}: {t.error}</p>)}
      <StatusPills
        pills={[
          { key: 'open', label: 'Open to join', count: countOf('open') },
          { key: 'joined', label: 'Joined', count: countOf('joined') },
          { key: 'ended', label: 'Ended', count: countOf('ended') },
        ]}
        active={pill}
        onChange={setPill}
      />
      {pill === 'open' && note && <p className="text-xs text-gray-500 dark:text-slate-400">{note}</p>}
      {notice.text && <p className={`text-sm ${notice.error ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{notice.text}</p>}
      {loading && !data && <Spinner />}
      {data && !list.length && !unknown[pill] && <EmptyState message={pill === 'open' ? 'No Temu promotions open to join right now.' : pill === 'joined' ? "You haven't joined a running promotion." : 'No ended promotions.'} />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {list.map((a) => {
          const enrol = (a.actions || []).find((x) => x.id === 'enrol')
          const ends = endsText(a, now)
          return (
            <article key={a.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold">{a.name || `Activity ${a.id}`}</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{a.type || 'Promotion'}</p>
                </div>
                {a.isJoined ? <Badge color="green">Joined</Badge> : a.status ? <Badge color="blue">{a.status}</Badge> : null}
              </div>
              <p className="text-sm text-gray-600 dark:text-slate-300">
                {date(a.starts)} – {date(a.ends)}
                {ends && <span className={`ml-2 text-xs ${/today|in [1-3] day/.test(ends) ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-gray-500 dark:text-slate-400'}`}>{ends}</span>}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                {a.isJoined && <Button size="sm" variant="secondary" onClick={() => setViewing(a)}>Enrolled goods</Button>}
                {enrol && pill !== 'ended' && <Button size="sm" onClick={() => setEnrolling(a)}>Enrol goods</Button>}
                {!a.isJoined && !enrol && pill === 'open' && <span className="text-xs text-gray-500 dark:text-slate-400">{a.checked ? 'Temu allows none of your goods in it yet.' : 'Not checked yet: the dashboard looks up goods for the first 10 open promotions. Enrol in Temu Seller Center.'}</span>}
              </div>
            </article>
          )
        })}
      </div>
      {enrolling && <EnrolPanel activity={enrolling} onClose={() => setEnrolling(null)} onDone={enrolled} />}
      {viewing && <Enrolled activity={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
