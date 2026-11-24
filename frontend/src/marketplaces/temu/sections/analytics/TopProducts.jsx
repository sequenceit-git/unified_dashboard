/** Best-selling Temu goods in the period, with Temu's traffic warning when it limits a goods. */
import Card from '../../../../components/ui/Card'
import DataTable from '../../../../components/ui/DataTable'

export default function TopProducts({ rows, loading, error, onRetry, traffic }) {
  const warningFor = (r) => (r.goodsIds || []).map((id) => traffic?.get(String(id))).find(Boolean)
  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <h2 className="mb-2 font-semibold">Top goods</h2>
      <div className="w-full min-w-0 overflow-x-auto">
        <DataTable
          columns={[
            { key: 'title', label: 'Goods', render: (r) => <span>{r.title || r.sku}<span className="block text-xs text-gray-500">{r.sku}</span></span> },
            { key: 'qty', label: 'Sold' },
            { key: 'revenue', label: 'Revenue', render: (r) => `$${r.revenue.toFixed(2)}` },
            {
              key: 'temu',
              label: 'Temu',
              render: (r) => {
                const w = warningFor(r)
                return w ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">⚠ {w}</span> : null
              },
            },
          ]}
          rows={rows || []}
          loading={loading}
          error={error}
          onRetry={onRetry}
          rowKey="productId"
        />
      </div>
    </Card>
  )
}
