import { useAuth } from '../../auth/AuthContext'
import Badge from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { useApi } from '../../hooks/useApi'

export default function LowStockTab({ refreshKey }) {
  const { token } = useAuth()
  const { data, loading, error, refetch } = useApi(token ? '/api/inventory/low-stock' : null, [refreshKey])

  return (
    <Card>
      <DataTable
        columns={[
          { key: 'sku', label: 'SKU' },
          { key: 'title', label: 'Title' },
          { key: 'stock', label: 'Stock', render: (r) => <span className="font-bold text-red-600">{r.stock}</span> },
          { key: 'lowStockThreshold', label: 'Threshold' },
          { key: 'alert', label: 'Alert', render: () => <Badge color="yellow">low_stock</Badge> },
        ]}
        rows={data || []}
        loading={loading}
        error={error}
        onRetry={refetch}
      />
    </Card>
  )
}
