import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/Feedback'

export default function RevenueChart({ data }) {
  if (!data?.length) return <Card className="min-w-0 max-w-full"><EmptyState message="No revenue data in range" /></Card>
  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <h2 className="mb-2 font-semibold">Revenue & orders over time</h2>
      <div className="h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={20} />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={38} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={32} />
            <Tooltip />
            <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
            <Line yAxisId="left" type="monotone" dataKey="revenue" name="Revenue ($)" stroke="#4f46e5" dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="orders" name="Orders" stroke="#10b981" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
