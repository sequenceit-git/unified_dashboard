import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { marketplaceLabel } from '../../lib/marketplaces'
import Card from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/Feedback'

export default function MarketplaceChart({ data }) {
  const rows = (data || []).map((d) => ({ ...d, name: marketplaceLabel(d.marketplace) }))
  if (!rows.length) return <Card className="min-w-0 max-w-full"><EmptyState message="No marketplace data" /></Card>
  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <h2 className="mb-2 font-semibold">Marketplace comparison</h2>
      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={rows} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} width={38} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="revenue" name="Revenue ($)" fill="#4f46e5" />
            <Bar dataKey="orders" name="Orders" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
