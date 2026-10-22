import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import { marketplaceBadgeColor, marketplaceLabel } from '../../lib/marketplaces'
import { SHOP_SECTIONS } from '../../lib/shops'
import { FiExternalLink, FiAlertTriangle } from 'react-icons/fi'

export default function OpportunityCard({ opportunity, reportId, onListShop, onOpen, isAdmin }) {
  const [adding, setAdding] = useState(false)
  const listedShops = opportunity.listedShops || []

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

  const monthlySales = opportunity.metrics?.monthlySales || opportunity.metrics?.salesVolume || opportunity.estimatedMonthlySales
  const competition = opportunity.competitionLevel || (opportunity.metrics?.competitorCount ? `${opportunity.metrics.competitorCount} sellers` : 'Medium')
  const rating = opportunity.rating ?? opportunity.metrics?.rating ?? null
  const reviewCount = opportunity.reviewCount ?? opportunity.metrics?.reviewCount ?? null
  const storedNotes = opportunity.aiNotes || opportunity.recommendationReason || ''
  const rationale = /margin|profit|unit cost|landed|supplier|sourcing|wholesale/i.test(storedNotes) ? '' : storedNotes
  
  const marketplaceUrl = opportunity.listingUrl || ''
  const rawImage = opportunity.image || (Array.isArray(opportunity.images) ? opportunity.images.find(Boolean) : '')
  const imageUrl = rawImage ? String(rawImage).replace(/\/s-l\d+\./i, '/s-l960.') : ''

  // Confidence & defect risk signals
  const confidence = opportunity.confidence || 'unverified'
  const highDefectRisk = opportunity.validation?.highDefectRisk
  const topComplaints = Array.isArray(opportunity.validation?.topComplaints) ? opportunity.validation.topComplaints : []

  const handleList = async (event) => {
    const marketplace = event.target.value
    event.target.value = ''
    if (!marketplace || adding || !onListShop || listedShops.includes(marketplace)) return
    setAdding(true)
    try {
      await onListShop({
        reportId,
        rank: opportunity.rank || 1,
        title,
        price: sellPriceNum != null ? sellPriceNum : 24.99,
        stock: 0,
        marketplace,
      })
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      className="flex cursor-pointer flex-col justify-between rounded-xl border border-gray-200 bg-white p-5 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
      onClick={onOpen}
    >
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

        <div className="overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="aspect-[4/3] w-full object-cover"
            />
          ) : (
            <div className="grid aspect-[4/3] w-full place-items-center px-4 text-center text-xs text-gray-400">
              No product image
            </div>
          )}
        </div>

        <div>
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold text-gray-900" title={title}>
              {title}
            </h3>
            {opportunity.description && (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">{opportunity.description}</p>
            )}
            {Array.isArray(opportunity.specs) && opportunity.specs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {opportunity.specs.slice(0, 3).map((spec) => (
                  <span key={`${spec.name}-${spec.value}`} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                    {spec.name}: {spec.value}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <span>
                Price: <strong className="text-gray-900">{sellPrice}</strong>
              </span>
              {opportunity.demandSignal && (
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-semibold text-indigo-700">
                  {opportunity.demandSignal}
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
      <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3">
          <button type="button" onClick={onOpen} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
            View details
          </button>
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
          <div className="min-w-[150px]">
            <select
              value=""
              onChange={handleList}
              disabled={adding || listedShops.length === SHOP_SECTIONS.length}
              className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 outline-none focus:border-indigo-500"
            >
              <option value="">{adding ? 'Listing…' : 'List on shop'}</option>
              {SHOP_SECTIONS.map((section) => (
                <option key={section.id} value={section.marketplace} disabled={listedShops.includes(section.marketplace)}>
                  {listedShops.includes(section.marketplace) ? `${section.label} · listed` : section.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  )
}
