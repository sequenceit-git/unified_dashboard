import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { marketplaceLabel } from '../../lib/marketplaces'
import Card from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/Feedback'

export default function MarketplaceChart({ data }) {
  const rows = (data || []).map((d) => ({ ...d, name: marketplaceLabel(d.marketplace) }))
  if (!rows.length) return <Card><EmptyState message="No marketplace data" /></Card>
  return (
    <Card>
      <h2 className="mb-2 font-semibold">Marketplace comparison</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="revenue" name="Revenue ($)" fill="#4f46e5" />
            <Bar dataKey="orders" name="Orders" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
