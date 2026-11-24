/** Today's GMV by hour, from TikTok. */
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '../../../../components/ui/Card'

export default function TodayByHour({ table }) {
  const rows = (table?.rows || []).map((h) => ({ hour: h.hour, gmv: h.gmv?.value || 0, orders: h.orders, visitors: h.visitors }))
  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <h2 className="mb-2 font-semibold">Today by hour</h2>
      {table?.error && <p className="text-sm text-gray-500">{table.error}</p>}
      {!table?.error && !rows.length && <p className="text-sm text-gray-500">No sales yet today</p>}
      {rows.length > 0 && (
        <div className="h-48 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={rows} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={2} />
              <YAxis tick={{ fontSize: 10 }} width={38} />
              <Tooltip />
              <Bar dataKey="gmv" name="GMV ($)" fill="#4f46e5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
