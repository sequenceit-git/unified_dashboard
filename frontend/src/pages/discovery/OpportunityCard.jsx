import { useState } from 'react'
import Badge from '../../components/ui/Badge'
import { EVIDENCE_LABELS, marketplaceBadgeColor, marketplaceLabel } from '../../lib/marketplaces'
import { productFacts } from './ProductDetailModal'
import { SHOP_SECTIONS } from '../../lib/shops'
import { FiExternalLink, FiAlertTriangle } from 'react-icons/fi'

export default function OpportunityCard({ opportunity, reportId, onListShop, onOpen, isAdmin }) {
  const [adding, setAdding] = useState(false)
  const listedShops = opportunity.listedShops || []

  const score = opportunity.opportunityScore
  const scoreBadgeColor =
    score == null ? 'bg-gray-100 text-gray-600 border-gray-200' :
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
  const rating = opportunity.rating ?? opportunity.metrics?.rating ?? null
  const reviewCount = opportunity.reviewCount ?? opportunity.metrics?.reviewCount ?? null
  const sourceLinks = productFacts(opportunity).places
  const rawImage = opportunity.image || (Array.isArray(opportunity.images) ? opportunity.images.find(Boolean) : '')
  const imageUrl = rawImage ? String(rawImage).replace(/\/s-l\d+\./i, '/s-l960.') : ''

  // Confidence & defect risk signals
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
      className="flex cursor-pointer gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
      onClick={onOpen}
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center px-1 text-center text-[10px] text-gray-400">No image</div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
              {opportunity.rank || 1}
            </span>
            <Badge color={marketColor}>{marketName}</Badge>
            {category && (
              <span className="truncate text-[11px] text-gray-400" title={category}>{category}</span>
            )}
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${scoreBadgeColor}`}>
            {score ?? '—'}/100
          </span>
        </div>

        <h3 className="mt-1 line-clamp-1 text-sm font-semibold text-gray-900" title={title}>{title}</h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
          <span><strong className="text-gray-900">{sellPrice}</strong></span>
          <span>★ {rating != null ? rating : '—'}{reviewCount ? ` (${reviewCount})` : ''}</span>
          {monthlySales != null && <span>{Number(monthlySales).toLocaleString()} sold</span>}
          {opportunity.evidenceTier && (
            <span title={EVIDENCE_LABELS[opportunity.evidenceTier]}>{opportunity.evidenceTier}</span>
          )}
          {highDefectRisk && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-amber-700" title={topComplaints.slice(0, 2).join('; ')}>
              <FiAlertTriangle size={11} /> Risk
            </span>
          )}
        </div>

        {opportunity.demandSignal && (
          <p className="mt-1 truncate text-[11px] font-semibold text-indigo-700">{opportunity.demandSignal}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1" onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={onOpen} className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800">
            Details
          </button>
          {sourceLinks.slice(0, 3).map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-gray-500 hover:text-gray-700"
              title={source.url}
            >
              <FiExternalLink size={11} />
              {source.label}
            </a>
          ))}
          {isAdmin && (
            <select
              value=""
              onChange={handleList}
              disabled={adding || listedShops.length === SHOP_SECTIONS.length}
              className="ml-auto max-w-[8.5rem] rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-gray-800 outline-none focus:border-indigo-500"
            >
              <option value="">{adding ? 'Listing…' : 'List on shop'}</option>
              {SHOP_SECTIONS.map((section) => (
                <option key={section.id} value={section.marketplace} disabled={listedShops.includes(section.marketplace)}>
                  {listedShops.includes(section.marketplace) ? `${section.label} · listed` : section.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  )
}
