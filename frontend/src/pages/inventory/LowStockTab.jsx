import { useAuth } from '../../auth/AuthContext'
import { queryString } from '../../lib/api'
import Badge from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { useApi } from '../../hooks/useApi'

export default function LowStockTab({ marketplace, refreshKey }) {
  const { token } = useAuth()
  const { data, loading, error, refetch } = useApi(
    token ? `/api/inventory/low-stock${queryString({ marketplace })}` : null,
    [refreshKey, marketplace],
  )

  return (
    <Card>
      <DataTable
        columns={[
          {
            key: 'image',
            label: 'Image',
            render: (r) => {
              const img = Array.isArray(r.images) && r.images[0]
              return (
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50 dark:border-slate-800 dark:bg-slate-900">
                  {img ? (
                    <img
                      src={img}
                      alt={r.title}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                    />
                  ) : (
                    <span className="text-[10px] text-gray-400">No img</span>
                  )}
                </div>
              )
            },
          },
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
