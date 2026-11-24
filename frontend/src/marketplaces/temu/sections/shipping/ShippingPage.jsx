/**
 * Temu shipping: what's waiting to ship, the labels bought with Temu (failed ones first), Temu's US
 * carriers and services, and the shop's warehouses and freight templates. Each order row opens the
 * order (buy, print or retry its label there).
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import RequireShopSection from '../../../../components/RequireShopSection'
import { useShopSection } from '../../../../hooks/useShopSection'
import { useApi } from '../../../../hooks/useApi'
import { useSyncReload } from '../../../../hooks/useLiveEvents'
import { StatCard } from '../../../../components/ui/Card'
import Badge from '../../../../components/ui/Badge'
import DataTable from '../../../../components/ui/DataTable'
import { ErrorState } from '../../../../components/ui/Feedback'
import PageHeader from '../../ui/PageHeader'
import StatusPills from '../../ui/StatusPills'
import RowActions from '../../ui/RowActions'
import { labelRows, orderOf, shippingTiles } from './shippingView'

const date = (v) => (v ? new Date(v).toLocaleDateString() : '—')

export default function ShippingPage() {
  const section = useShopSection()
  const navigate = useNavigate()
  const [pill, setPill] = useState('awaiting')
  const { data, loading, error, refetch } = useApi('/api/temu/sections/shipping')
  useSyncReload('orders', section?.marketplace, () => refetch())
  if (!section) return <RequireShopSection />

  const t = shippingTiles(data)
  const table = (id) => (data?.tables || []).find((x) => x.id === id)
  const openOrder = (row) => { const sn = orderOf(row); if (sn) navigate(`/temu/orders?q=${encodeURIComponent(sn)}`) }
  const show = (v) => (loading && !data ? '…' : v == null ? '—' : v)
  const pills = [
    { key: 'awaiting', label: 'Awaiting shipment', count: t.awaiting },
    { key: 'labels', label: 'Labels', count: table('labels')?.rows?.length ?? null },
    { key: 'carriers', label: 'Carriers & services', count: null },
    { key: 'setup', label: 'Warehouses & templates', count: null },
  ]
  const card = 'rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900'
  const tableError = (id) => table(id)?.error || ''

  return (
    <div className="space-y-3">
      <PageHeader
        title="Temu shipping"
        summary={data ? `${t.awaiting ?? 0} awaiting shipment · ${t.boughtToday ?? 0} labels today${t.failed ? ` · ${t.failed} failed` : ''}` : ''}
      />
      {error && <ErrorState message={error} onRetry={refetch} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Awaiting shipment" value={show(t.awaiting)} />
        <StatCard label="Labels bought today" value={show(t.boughtToday)} />
        <StatCard label="Failed labels" value={show(t.failed)} sub={t.failed ? 'Open the order to buy again' : ''} />
        <StatCard label="Not printed yet" value={show(t.notPrinted)} />
      </div>
      <StatusPills pills={pills} active={pill} onChange={setPill} />
      <div className={card}>
        {pill === 'awaiting' && (
          <DataTable
            columns={[
              { key: 'order', label: 'Order' },
              { key: 'placed', label: 'Placed', render: (r) => date(r.placed) },
              { key: 'items', label: 'Items', render: (r) => <span className="line-clamp-2 max-w-md">{r.items || '—'}</span> },
              { key: 'actions', label: '', render: (r) => <RowActions main={{ label: 'Ship', primary: true, onClick: () => openOrder(r) }} /> },
            ]}
            rows={(table('unshipped')?.rows || []).map((r) => ({ ...r, _key: r.order }))}
            loading={loading && !data}
            error={tableError('unshipped')}
            onRetry={refetch}
            rowKey="_key"
          />
        )}
        {pill === 'labels' && (
          <>
            <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">Labels bought with Temu in the last 30 days. Open the order to print, retry or book a pickup.</p>
            <DataTable
              columns={[
                { key: 'packageSn', label: 'Package', render: (r) => <span><span className="font-medium">{r.packageSn}</span><span className="block text-xs text-gray-500 dark:text-slate-400">{r.orders}</span></span> },
                { key: 'carrier', label: 'Carrier', render: (r) => <span>{r.carrier || '—'}<span className="block text-xs text-gray-500 dark:text-slate-400">{r.tracking}</span></span> },
                { key: 'status', label: 'Label', render: (r) => <Badge color={r.status === 'Failed' ? 'red' : r.status === 'Bought' ? 'green' : 'blue'}>{r.status}</Badge> },
                { key: 'printed', label: 'Printed' },
                { key: 'created', label: 'Bought', render: (r) => date(r.created) },
                { key: 'actions', label: '', render: (r) => <RowActions main={{ label: r.status === 'Failed' ? 'Buy again' : 'Open order', primary: r.status === 'Failed', onClick: () => openOrder(r) }} /> },
              ]}
              rows={labelRows(table('labels')?.rows).map((r) => ({ ...r, _key: r.packageSn }))}
              loading={loading && !data}
              error={tableError('labels')}
              onRetry={refetch}
              rowKey="_key"
            />
          </>
        )}
        {pill === 'carriers' && (
          <DataTable
            columns={[{ key: 'carrier', label: 'Carrier' }, { key: 'service', label: 'Service' }]}
            rows={(table('carriers')?.rows || []).map((r, i) => ({ ...r, _key: `${r.carrier}-${r.service}-${i}` }))}
            loading={loading && !data}
            error={tableError('carriers')}
            onRetry={refetch}
            rowKey="_key"
          />
        )}
        {pill === 'setup' && (
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 text-sm font-semibold">Warehouses</h3>
              <DataTable
                columns={[{ key: 'name', label: 'Name' }, { key: 'id', label: 'Warehouse ID' }, { key: 'default', label: 'Default' }]}
                rows={(table('warehouses')?.rows || []).map((r) => ({ ...r, _key: String(r.id) }))}
                loading={loading && !data}
                error={tableError('warehouses')}
                onRetry={refetch}
                rowKey="_key"
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Freight templates</h3>
              <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">Temu goods use one of these; make or change them in Temu Seller Center.</p>
              <DataTable
                columns={[{ key: 'name', label: 'Name' }, { key: 'id', label: 'Template ID' }]}
                rows={(table('templates')?.rows || []).map((r) => ({ ...r, _key: String(r.id) }))}
                loading={loading && !data}
                error={tableError('templates')}
                onRetry={refetch}
                rowKey="_key"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
