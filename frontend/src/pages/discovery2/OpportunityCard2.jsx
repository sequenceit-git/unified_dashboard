import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { marketplaceBadgeColor, marketplaceLabel } from '../../lib/marketplaces'
import { FiExternalLink, FiAlertTriangle, FiDollarSign, FiShoppingBag } from 'react-icons/fi'

export default function OpportunityCard2({ opportunity, reportId, onAddToCatalog, isAdmin }) {
  const [adding, setAdding] = useState(false)
  const isAdded = Boolean(opportunity.addedProductId)

  const score = opportunity.opportunityScore ?? 75
  const scoreBadgeColor =
    score >= 85 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
    score >= 70 ? 'bg-indigo-100 text-indigo-800 border-indigo-200' :
    'bg-amber-100 text-amber-800 border-amber-200'

  const marketplace = opportunity.marketplace || 'ebay'
  const marketColor = marketplaceBadgeColor(marketplace)
  const marketName = marketplaceLabel(marketplace)

  const title = opportunity.title || opportunity.productName || 'Untitled Opportunity'
  const category = opportunity.category || opportunity.metrics?.category || ''
  
  const sellPriceNum = opportunity.price != null
    ? Number(opportunity.price)
    : opportunity.metrics?.averagePrice || opportunity.metrics?.price
      ? Number(opportunity.metrics.averagePrice || opportunity.metrics.price)
      : null
  const sellPrice = sellPriceNum != null ? `$${sellPriceNum.toFixed(2)}` : '—'

  const costNum = opportunity.metrics?.estimatedCost != null ? Number(opportunity.metrics.estimatedCost) : null
  const cost = costNum != null ? `$${costNum.toFixed(2)}` : null

  const netProfitNum = opportunity.metrics?.netProfit != null ? Number(opportunity.metrics.netProfit) : null
  const netProfit = netProfitNum != null ? `$${netProfitNum.toFixed(2)}` : null

  const margin = opportunity.estimatedMargin != null
    ? opportunity.estimatedMargin
    : opportunity.estimatedProfitMarginPercent != null
      ? opportunity.estimatedProfitMarginPercent
      : null

  const monthlySales = opportunity.metrics?.monthlySales || opportunity.metrics?.salesVolume || opportunity.estimatedMonthlySales
  const competition = opportunity.competitionLevel || (opportunity.metrics?.competitorCount ? `${opportunity.metrics.competitorCount} sellers` : 'Medium')
  const rating = opportunity.rating ?? opportunity.metrics?.rating ?? null
  const reviewCount = opportunity.reviewCount ?? opportunity.metrics?.reviewCount ?? null
  const rationale = opportunity.aiNotes || opportunity.recommendationReason || ''
  
  // Both URLs
  const supplierUrl = opportunity.sourceUrl || opportunity.sourcing?.buyUrl || ''
  const marketplaceUrl = opportunity.listingUrl || ''

  // Confidence & defect risk signals
  const confidence = opportunity.confidence || 'unverified'
  const highDefectRisk = opportunity.validation?.highDefectRisk
  const topComplaints = Array.isArray(opportunity.validation?.topComplaints) ? opportunity.validation.topComplaints : []

  const handleAdd = async () => {
    if (isAdded || adding || !onAddToCatalog) return
    setAdding(true)
    try {
      await onAddToCatalog({
        reportId,
        rank: opportunity.rank || 1,
        title,
        price: sellPriceNum != null ? sellPriceNum : 24.99,
        stock: 0,
      })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-xs transition hover:shadow-md">
      <div className="space-y-4">
        {/* Header with Rank, Marketplace & Confidence */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              #{opportunity.rank || 1}
            </span>
            <Badge color={marketColor}>{marketName}</Badge>
            {category && (
              <span className="text-xs text-gray-400 font-medium truncate max-w-[120px]" title={category}>
                {category}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {confidence && confidence !== 'unverified' && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
                {confidence}
              </span>
            )}
            <div className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${scoreBadgeColor}`}>
              Score: {score}/100
            </div>
          </div>
        </div>

        {/* Product Image + Title & Financial Metrics */}
        <div className="flex gap-4">
          {opportunity.image && (
            <img
              src={opportunity.image}
              alt={title}
              className="h-20 w-20 shrink-0 rounded-lg object-cover border border-gray-100"
              onError={(e) => {
                e.target.style.display = 'none'
              }}
            />
          )}
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold text-gray-900" title={title}>
              {title}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <span>
                Sell: <strong className="text-gray-900">{sellPrice}</strong>
              </span>
              {cost && (
                <span>
                  Cost: <strong className="text-gray-900">{cost}</strong>
                </span>
              )}
              {netProfit && (
                <span className="flex items-center text-emerald-700 font-medium">
                  Profit: <strong className="ml-0.5">{netProfit}</strong>
                </span>
              )}
              {margin != null && (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  +{margin}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Signals and Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-2.5 text-center text-xs">
          <div>
            <p className="text-gray-400 font-medium">Est. Monthly</p>
            <p className="font-semibold text-gray-800">
              {monthlySales != null ? `${Number(monthlySales).toLocaleString()} units` : '—'}
            </p>
          </div>
          <div>
            <p className="text-gray-400 font-medium">Competition</p>
            <p className="font-semibold text-gray-800">{competition}</p>
          </div>
          <div>
            <p className="text-gray-400 font-medium">Rating</p>
            <p className="font-semibold text-gray-800">
              ★ {rating != null ? rating : '—'}
              {reviewCount ? ` (${reviewCount})` : ''}
            </p>
          </div>
        </div>

        {/* Quality Complaints / High Defect Warning if any */}
        {highDefectRisk && (
          <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-xs text-amber-900">
            <FiAlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={13} />
            <div>
              <span className="font-bold">Defect Risk Noted:</span>{' '}
              {topComplaints.length > 0 ? topComplaints.slice(0, 2).join('; ') : 'Frequent complaints detected in reviews.'}
            </div>
          </div>
        )}

        {/* AI Strategic Analysis / Rationale */}
        {rationale && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">AI Agent Rationale</p>
            <p className="mt-1 text-xs text-indigo-950 leading-relaxed">{rationale}</p>
          </div>
        )}
      </div>

      {/* Footer Actions: Both Links (Marketplace + Supplier) and Add to Catalog */}
      <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {supplierUrl && (
            <a
              href={supplierUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
              title="Open wholesale purchase / supplier listing"
            >
              <FiShoppingBag size={12} />
              <span>Buy Link ↗</span>
            </a>
          )}
          {marketplaceUrl && (
            <a
              href={marketplaceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
              title="View customer listing on retail marketplace"
            >
              <FiExternalLink size={12} />
              <span>Live Listing ↗</span>
            </a>
          )}
        </div>

        {isAdmin && (
          <div>
            {isAdded ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
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
