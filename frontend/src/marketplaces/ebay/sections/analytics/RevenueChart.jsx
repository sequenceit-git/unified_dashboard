/** Revenue by day (dashboard orders), previous period dotted. */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '../../../../components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '../../../../components/ui/Feedback'

export default function RevenueChart({ data, loading, error, onRetry }) {
  if (error) return <Card className="min-w-0 max-w-full"><ErrorState message={error} onRetry={onRetry} /></Card>
  if (loading) return <Card className="min-w-0 max-w-full"><Spinner /></Card>
  if (!data?.some((d) => d.revenue || d.prevRevenue)) return <Card className="min-w-0 max-w-full"><EmptyState message="No sales in this period" /></Card>
  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <h2 className="mb-2 font-semibold">Revenue by day</h2>
      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={20} />
            <YAxis tick={{ fontSize: 10 }} width={38} />
            <Tooltip />
            <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey="revenue" name="Revenue ($)" stroke="#4f46e5" dot={false} />
            <Line type="monotone" dataKey="prevRevenue" name="Previous period ($)" stroke="#94a3b8" strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
