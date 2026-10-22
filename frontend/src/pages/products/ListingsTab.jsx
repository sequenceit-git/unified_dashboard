import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { MARKETPLACES, marketplaceLabel } from '../../lib/marketplaces'

import Badge, { statusColor } from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { Select } from '../../components/ui/Input'
import Tabs from '../../components/ui/Tabs'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback'
import { useApi } from '../../hooks/useApi'

// Sub-tabs per marketplace → shop picker → products listed on that shop.
export default function ListingsTab() {
  const { token } = useAuth()
  const [marketplace, setMarketplace] = useState('all')
  const shopsRes = useApi(token ? '/api/shops' : null)
  const shops = (shopsRes.data || []).filter((s) => marketplace === 'all' || s.marketplace === marketplace)
  const [shopId, setShopId] = useState('')
  const current = shopId || shops[0]?._id || ''
  const prods = useApi(token && current ? `/api/products?shop=${current}&limit=50` : null, [current])

  return (
    <div className="space-y-3">
      <Tabs tabs={MARKETPLACES} active={marketplace} onChange={(m) => { setMarketplace(m); setShopId('') }} />
      <Card>
        {shopsRes.loading ? <Spinner /> : shopsRes.error ? <ErrorState message={shopsRes.error} /> :
          shops.length === 0 ? <EmptyState message="No shops connected yet" /> : (
            <>
              <div className="mb-3 max-w-xs">
                <Select
                  label={`Shop (${marketplaceLabel(marketplace)})`}
                  value={current}
                  onChange={(e) => setShopId(e.target.value)}
                  options={shops.map((s) => ({ value: s._id, label: `${s.name} · ${s.status}` }))}
                />
              </div>
              {prods.loading ? <Spinner /> : prods.error ? <ErrorState message={prods.error} onRetry={prods.refetch} /> : (
                <DataTable
                  columns={[
                    {
                      key: 'image',
                      label: 'Image',
                      render: (r) => {
                        const img = Array.isArray(r.images) && r.images[0]
                        return (
                          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50">
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
                    { key: 'basePrice', label: 'Price', render: (r) => (r.basePrice != null ? `$${Number(r.basePrice).toFixed(2)}` : '—') },
                    { key: 'costPrice', label: 'Base price', render: (r) => (r.costPrice != null && r.costPrice !== '' ? `$${Number(r.costPrice).toFixed(2)}` : '—') },
                    { key: 'status', label: 'Status', render: (r) => <Badge color={statusColor(r.status)}>{r.status}</Badge> },
                  ]}
                  rows={prods.data?.data || []}
                />
              )}
            </>
          )}
      </Card>
    </div>
  )
}
