/** Product page views and visitors by day (TikTok's traffic data). */
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '../../../../components/ui/Card'
import { Spinner } from '../../../../components/ui/Feedback'

export default function TrafficChart({ rows, loading }) {
  if (loading) return <Card className="min-w-0"><Spinner /></Card>
  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <h2 className="mb-2 font-semibold">Traffic</h2>
      {!rows.length && <p className="text-sm text-gray-500">TikTok isn't sharing this data</p>}
      {rows.length > 0 && (
        <div className="h-56 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={rows} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={20} />
              <YAxis tick={{ fontSize: 10 }} width={38} />
              <Tooltip />
              <Legend wrapperStyle={{ paddingTop: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="pageViews" name="Page views" stroke="#4f46e5" dot={false} />
              <Line type="monotone" dataKey="visitors" name="Visitors" stroke="#10b981" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
