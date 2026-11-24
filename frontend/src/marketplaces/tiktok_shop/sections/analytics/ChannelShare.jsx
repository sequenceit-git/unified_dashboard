/** Where GMV came from: TikTok videos, LIVE or the product card. */
import Card from '../../../../components/ui/Card'

const COLORS = { video: 'bg-indigo-500', live: 'bg-rose-500', productCard: 'bg-emerald-500' }

export default function ChannelShare({ channels }) {
  return (
    <Card className="min-w-0">
      <h2 className="mb-3 font-semibold">Where sales come from</h2>
      {!channels && <p className="text-sm text-gray-500">TikTok isn't sharing this data</p>}
      {channels && (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800" aria-hidden="true">
            {channels.map((c) => <div key={c.key} className={COLORS[c.key]} style={{ width: `${c.share}%` }} />)}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {channels.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${COLORS[c.key]}`} />{c.label}</span>
                <span className="tabular-nums">{c.share}% · ${c.amount.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
