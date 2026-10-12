import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'

export default function OpportunityCard({ opportunity, reportId, onAddToCatalog, isAdmin }) {
  const [adding, setAdding] = useState(false)
  const isAdded = Boolean(opportunity.addedProductId)

  const handleAdd = async () => {
    if (isAdded || adding) return
    setAdding(true)
    try {
      await onAddToCatalog({
        reportId,
        rank: opportunity.rank,
        title: opportunity.title,
        price: opportunity.metrics?.averagePrice || opportunity.metrics?.price,
        stock: 100,
      })
    } finally {
      setAdding(false)
    }
  }

  const score = opportunity.opportunityScore || 75
  const scoreBadgeColor =
    score >= 85 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
    score >= 70 ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
    'bg-amber-100 text-amber-800 border-amber-200'

  const marketColor =
    opportunity.marketplace === 'tiktok_shop' ? 'purple' :
    opportunity.marketplace === 'temu' ? 'yellow' : 'blue'

  const marketName =
    opportunity.marketplace === 'tiktok_shop' ? 'TikTok Shop' :
    opportunity.marketplace === 'temu' ? 'Temu' : 'eBay'

  return (
    <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-xs transition hover:shadow-md">
      <div className="space-y-4">
        {/* Header with Rank & Marketplace */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              #{opportunity.rank}
            </span>
            <Badge color={marketColor}>{marketName}</Badge>
            {opportunity.metrics?.category && (
              <span className="text-xs text-gray-400 font-medium">{opportunity.metrics.category}</span>
            )}
          </div>
          <div className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${scoreBadgeColor}`}>
            Score: {score}/100
          </div>
        </div>

        {/* Product Image & Title */}
        <div className="flex gap-4">
          {opportunity.image && (
            <img
              src={opportunity.image}
              alt={opportunity.title}
              className="h-20 w-20 shrink-0 rounded-lg object-cover border border-gray-100"
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold text-gray-900" title={opportunity.title}>
              {opportunity.title}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>
                Sell: <strong className="text-gray-900">${opportunity.metrics?.averagePrice || opportunity.metrics?.price || 19.99}</strong>
              </span>
              {opportunity.metrics?.estimatedCost && (
                <span>
                  Cost: <strong className="text-gray-900">${opportunity.metrics.estimatedCost}</strong>
                </span>
              )}
              <span>
                Margin: <strong className="text-emerald-600 font-bold">+{opportunity.estimatedMargin}%</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Signals and Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-2.5 text-center text-xs">
          <div>
            <p className="text-gray-400 font-medium">Est. Monthly</p>
            <p className="font-semibold text-gray-800">{opportunity.metrics?.monthlySales || opportunity.metrics?.salesVolume || '1,200'} units</p>
          </div>
          <div>
            <p className="text-gray-400 font-medium">Competition</p>
            <p className="font-semibold text-gray-800">{opportunity.metrics?.competitorCount || 15} sellers</p>
          </div>
          <div>
            <p className="text-gray-400 font-medium">Rating</p>
            <p className="font-semibold text-gray-800">★ {opportunity.metrics?.rating || 4.6}</p>
          </div>
        </div>

        {/* AI Strategic Analysis */}
        {opportunity.aiNotes && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">AI Agent Rationale</p>
            <p className="mt-1 text-xs text-indigo-950 leading-relaxed">{opportunity.aiNotes}</p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
        {opportunity.sourceUrl ? (
          <a
            href={opportunity.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Source Signal ↗
          </a>
        ) : (
          <span />
        )}

        {isAdmin && (
          <div>
            {isAdded ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                ✓ Added to Catalog
              </span>
            ) : (
              <Button size="sm" onClick={handleAdd} disabled={adding}>
                {adding ? 'Adding…' : '+ Add to Catalog'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
