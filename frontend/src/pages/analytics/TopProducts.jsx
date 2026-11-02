import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'

export default function TopProducts({ rows, loading, error, onRetry }) {
  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <h2 className="mb-2 font-semibold">Product performance</h2>
      <div className="w-full min-w-0 overflow-x-auto">
        <DataTable
          columns={[
            { key: 'sku', label: 'SKU' },
            { key: 'title', label: 'Title' },
            { key: 'qty', label: 'Sold' },
            { key: 'revenue', label: 'Revenue', render: (r) => `$${r.revenue.toFixed(2)}` },
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
