import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/Feedback'

export default function RevenueChart({ data }) {
  if (!data?.length) return <Card><EmptyState message="No revenue data in range" /></Card>
  return (
    <Card>
      <h2 className="mb-2 font-semibold">Revenue & orders over time</h2>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line yAxisId="left" type="monotone" dataKey="revenue" name="Revenue ($)" stroke="#4f46e5" dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="orders" name="Orders" stroke="#10b981" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
