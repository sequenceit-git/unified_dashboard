/** Temu's stock per SKU (own warehouse; pre-sale apart) next to the dashboard's: spot stock that drifted. */
import Card from '../../../../components/ui/Card'
import DataTable from '../../../../components/ui/DataTable'
import { ErrorState, Spinner } from '../../../../components/ui/Feedback'
import Button from '../../../../components/ui/Button'
import { useApi } from '../../../../hooks/useApi'

export default function TemuStockTab() {
  const { data, loading, error, refetch } = useApi('/api/temu/inventory/temu-stock')
  const rows = (data || []).map((r) => ({ ...r, _key: `${r.goodsId}:${r.skuId}` }))
  const off = rows.filter((r) => r.mismatch).length
  const columns = [
    { key: 'sku', label: 'SKU code' },
    { key: 'product', label: 'Product', render: (r) => r.product || <span className="text-gray-400">Not in the dashboard</span> },
    { key: 'ids', label: 'Temu goods / SKU', render: (r) => `${r.goodsId} / ${r.skuId}` },
    { key: 'temuStock', label: 'On Temu', render: (r) => r.temuStock.toLocaleString() },
    { key: 'preSale', label: 'Pre-sale', render: (r) => (r.preSale ? r.preSale.toLocaleString() : '—') },
    { key: 'dashboardStock', label: 'In the dashboard', render: (r) => (r.dashboardStock == null ? '—' : r.dashboardStock.toLocaleString()) },
    { key: 'mismatch', label: '', render: (r) => (r.mismatch ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800 dark:bg-orange-950/50 dark:text-orange-200">Different</span> : null) },
  ]
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Stock on Temu</h2>
          <p className="text-xs text-gray-500">{data ? `${off} of ${rows.length} SKUs differ from the dashboard.` : 'Read live from Temu.'}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={refetch} disabled={loading}>{loading ? 'Loading…' : 'Check again'}</Button>
      </div>
      {error && <ErrorState message={error} onRetry={refetch} />}
      {loading && !data && <Spinner />}
      {data && <DataTable rowKey="_key" rows={rows} columns={columns} />}
    </Card>
  )
}
