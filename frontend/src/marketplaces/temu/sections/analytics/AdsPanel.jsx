/** Temu Ads (last 30 days): shown only when Temu returns ad data for the shop. */
import Card from '../../../../components/ui/Card'

const amount = (v) => (v == null ? '—' : `$${Number(v?.value ?? v).toFixed(2)}`)

export default function AdsPanel({ spend, share }) {
  return (
    <Card className="min-w-0">
      <h2 className="mb-2 font-semibold">Ads <span className="text-xs font-normal text-gray-500">(last 30 days)</span></h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-xs uppercase tracking-wide text-gray-500">Ad spend</p><p className="mt-1 text-xl font-bold">{amount(spend)}</p></div>
        <div><p className="text-xs uppercase tracking-wide text-gray-500">Sales from ads</p><p className="mt-1 text-xl font-bold">{share == null ? '—' : `${share}%`}</p></div>
      </div>
    </Card>
  )
}
