/** TikTok's best-selling SKUs (last 30 days), each with Details. */
import Card from '../../../../components/ui/Card'
import Button from '../../../../components/ui/Button'
import DataTable from '../../../../components/ui/DataTable'
import { formatCell } from '../../sectionFormat'

export default function TopSkus({ table, loading, error, onRetry, onDetails }) {
  const rows = (table?.rows || []).slice(0, 10).map((r) => ({ ...r, _key: r.id }))
  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <h2 className="mb-2 font-semibold">Top products <span className="text-xs font-normal text-gray-500">(last 30 days)</span></h2>
      <div className="w-full min-w-0 overflow-x-auto">
        <DataTable
          columns={[
            { key: 'product', label: 'Product', render: (r) => <span>{r.product || '—'}<span className="block text-xs text-gray-500">SKU {r.skuId}</span></span> },
            { key: 'orders', label: 'Orders', render: (r) => formatCell('number', r.orders) },
            { key: 'unitsSold', label: 'Units', render: (r) => formatCell('number', r.unitsSold) },
            { key: 'gmv', label: 'GMV', render: (r) => formatCell('money', r.gmv) },
            { key: 'more', label: '', render: (r) => <Button size="sm" variant="secondary" onClick={() => onDetails(r.id)}>Details</Button> },
          ]}
          rows={rows}
          loading={loading}
          error={error || table?.error || ''}
          onRetry={onRetry}
          rowKey="_key"
        />
      </div>
    </Card>
  )
}
