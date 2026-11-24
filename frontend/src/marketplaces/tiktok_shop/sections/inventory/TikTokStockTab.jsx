/** Stock TikTok holds per SKU and warehouse, next to the dashboard's stock: spot a sync that went wrong. */
import Card from '../../../../components/ui/Card'
import DataTable from '../../../../components/ui/DataTable'
import { ErrorState, Spinner } from '../../../../components/ui/Feedback'
import Button from '../../../../components/ui/Button'
import { useApi } from '../../../../hooks/useApi'

export default function TikTokStockTab() {
  const { data, loading, error, refetch } = useApi('/api/tiktok/inventory/tiktok-stock')
  const rows = (data || []).map((r, i) => ({ ...r, _key: `${r.tiktokSkuId}-${i}` }))
  const mismatches = rows.filter((r) => r.mismatch).length
  const columns = [
    { key: 'sku', label: 'SKU' },
    { key: 'product', label: 'Product', render: (r) => r.product || <span className="text-gray-400">Not in the dashboard</span> },
    { key: 'warehouses', label: 'On TikTok by warehouse', render: (r) => (r.warehouses.length ? r.warehouses.map((w) => `${w.name}: ${w.available}`).join(', ') : '—') },
    { key: 'tiktokTotal', label: 'On TikTok', render: (r) => r.tiktokTotal.toLocaleString() },
    { key: 'dashboardStock', label: 'In the dashboard', render: (r) => (r.dashboardStock == null ? '—' : r.dashboardStock.toLocaleString()) },
    { key: 'mismatch', label: '', render: (r) => (r.mismatch ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">Different</span> : null) },
  ]
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Stock on TikTok</h2>
          <p className="text-xs text-gray-500">{data ? `${mismatches} of ${rows.length} SKUs differ from the dashboard.` : 'Read live from TikTok Shop.'}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={refetch} disabled={loading}>{loading ? 'Loading…' : 'Check again'}</Button>
      </div>
      {error && <ErrorState message={error} onRetry={refetch} />}
      {loading && !data && <Spinner />}
      {data && <DataTable rowKey="_key" rows={rows} columns={columns} />}
    </Card>
  )
}
