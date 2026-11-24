/** Impressions and page views by day (eBay's traffic report). */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '../../../../components/ui/Card'
import { Spinner } from '../../../../components/ui/Feedback'

export default function TrafficChart({ days, loading, error }) {
  if (loading) return <Card className="min-w-0"><Spinner /></Card>
  if (error) return null
  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <h2 className="mb-2 font-semibold">Traffic by day</h2>
      {!days?.length && <p className="text-sm text-gray-500">No traffic in this period</p>}
      {days?.length > 0 && (
        <div className="h-56 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={days} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={20} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={42} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={32} />
              <Tooltip />
              <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
              <Line yAxisId="left" type="monotone" dataKey="impressions" name="Impressions" stroke="#4f46e5" dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="views" name="Page views" stroke="#10b981" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
