import { useState } from 'react'
import { FiExternalLink } from 'react-icons/fi'
import Badge from '../../components/ui/Badge'
import Modal from '../../components/ui/Modal'
import { EVIDENCE_LABELS, marketplaceBadgeColor, marketplaceLabel } from '../../lib/marketplaces'

function money(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : null
}

function pushUrl(list, url) {
  const href = typeof url === 'string' ? url.trim() : ''
  if (!/^https?:\/\//i.test(href) || list.includes(href)) return
  list.push(href)
}

function pushSource(list, source) {
  const href = typeof source?.url === 'string' ? source.url.trim() : ''
  if (!/^https:\/\//i.test(href) || list.some((item) => item.url === href)) return
  list.push({ ...source, url: href, label: source.label || marketplaceLabel(source.place) })
}

export function productFacts(opportunity) {
  const images = []
  pushUrl(images, opportunity.image)
  ;(opportunity.images || []).forEach((url) => pushUrl(images, url))
  ;(opportunity.sources || []).forEach((source) => pushUrl(images, source.imageUrl))

  const sources = []
  if (opportunity.linksVerified) {
    ;(opportunity.sources || []).forEach((source) => pushSource(sources, source))
  }

  return {
    images,
    places: sources,
    description: opportunity.description || '',
  }
}

function Fact({ label, value }) {
  if (value == null || value === '') return null
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  )
}

export default function ProductDetailModal({ opportunity, onClose }) {
  const facts = productFacts(opportunity)
  const [activeImage, setActiveImage] = useState(0)
  const title = opportunity.title || opportunity.productName || 'Product details'
  const marketplace = opportunity.marketplace || 'ebay'
  const description = facts.description
  const highlights = Array.isArray(opportunity.highlights) ? opportunity.highlights.filter(Boolean) : []
  const specs = Array.isArray(opportunity.specs) ? opportunity.specs.filter((spec) => spec?.name && spec?.value) : []
  const storedNotes = opportunity.aiNotes || opportunity.recommendationReason || ''
  const notes = /margin|profit|unit cost|landed|supplier|sourcing|wholesale/i.test(storedNotes) ? '' : storedNotes
  const complaints = Array.isArray(opportunity.validation?.topComplaints) ? opportunity.validation.topComplaints : []
  const sell = money(opportunity.price ?? opportunity.metrics?.averagePrice ?? opportunity.metrics?.price)
  const low = money(opportunity.validation?.ebayPriceLow)
  const high = money(opportunity.validation?.ebayPriceHigh)
  const rating = opportunity.rating ?? opportunity.metrics?.rating
  const reviews = opportunity.reviewCount ?? opportunity.metrics?.reviewCount
  const monthly = opportunity.metrics?.monthlySales || opportunity.metrics?.salesVolume || opportunity.estimatedMonthlySales
  const image = String(facts.images[activeImage] || facts.images[0] || '').replace(/\/s-l\d+\./i, '/s-l960.')

  return (
    <Modal title={title} onClose={onClose} size="5xl">
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div>
          {image ? (
            <img src={image} alt="" className="aspect-square w-full rounded-xl border border-gray-200 object-cover" />
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 text-center text-sm text-gray-500">
              No product images were saved for this result.
            </div>
          )}
          {facts.images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {facts.images.map((url, index) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${index === activeImage ? 'border-indigo-500' : 'border-gray-200'}`}
                >
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={marketplaceBadgeColor(marketplace)}>{marketplaceLabel(marketplace)}</Badge>
            {opportunity.category && <span className="text-sm text-gray-500">{opportunity.category}</span>}
            {opportunity.brand && <span className="text-sm text-gray-500">{opportunity.brand}</span>}
            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
              Score {opportunity.opportunityScore ?? '—'}/100
            </span>
          </div>

          <section>
            <h3 className="text-sm font-bold text-gray-900">About this product</h3>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              {description || 'No product description was saved for this result. Run the search again to collect listing details.'}
            </p>
          </section>

          {highlights.length > 0 && (
            <section>
              <h3 className="text-sm font-bold text-gray-900">Features</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {highlights.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          )}

          {specs.length > 0 && (
            <section>
              <h3 className="text-sm font-bold text-gray-900">Specifications</h3>
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {specs.map((spec) => (
                  <div key={`${spec.name}-${spec.value}`} className="rounded-lg border border-gray-200 px-3 py-2">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{spec.name}</dt>
                    <dd className="mt-0.5 text-sm text-gray-900">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Fact label="Sell price" value={sell} />
            <Fact
              label="Evidence"
              value={opportunity.evidenceTier ? `${opportunity.evidenceTier} · ${EVIDENCE_LABELS[opportunity.evidenceTier] || ''}` : null}
            />
            <Fact label="Best seller" value={opportunity.demandSignal} />
            <Fact label="Official rank" value={opportunity.officialRank} />
            <Fact label="Price range" value={low || high ? `${low || '—'} – ${high || '—'}` : null} />
            <Fact label="Monthly sales" value={monthly != null ? `${Number(monthly).toLocaleString()} units` : null} />
            <Fact label="Competition" value={opportunity.validation?.competitionLevel || opportunity.competitionLevel} />
            <Fact label="Demand" value={opportunity.validation?.demandTier} />
            <Fact label="Rating" value={rating != null ? `★ ${rating}${reviews ? ` (${reviews})` : ''}` : null} />
            <Fact label="Confidence" value={opportunity.confidence && opportunity.confidence !== 'unverified' ? opportunity.confidence : null} />
          </div>

          {opportunity.confidenceReason && (
            <p className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">Confidence: </span>
              {opportunity.confidenceReason}
            </p>
          )}

          {notes && (
            <section className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Why this product</h3>
              <p className="mt-1 text-sm leading-relaxed text-indigo-950">{notes}</p>
            </section>
          )}

          {complaints.length > 0 && (
            <section>
              <h3 className="text-sm font-bold text-gray-900">Review complaints</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-600">
                {complaints.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          )}
        </div>
      </div>

      <section className="mt-6 border-t border-gray-100 pt-5">
        <h3 className="text-sm font-bold text-gray-900">Where it is selling</h3>
        <p className="mt-1 text-xs text-gray-500">
          {opportunity.linksVerified
            ? 'United States product pages confirmed live for this product when the search ran.'
            : 'Links from this older search were not confirmed. Run a new search to get verified US links.'}
        </p>
        {facts.places.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {facts.places.map((source) => (
              <li key={source.url} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {source.label}
                    <span className="ml-2 text-xs font-medium uppercase text-gray-400">US</span>
                  </p>
                  <p className="truncate text-xs text-gray-500">{source.url}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {money(source.price) && <span className="text-sm font-semibold text-gray-800">{money(source.price)}</span>}
                  <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                    Open <FiExternalLink size={14} />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-gray-500">No verified US listing.</p>
        )}
      </section>
    </Modal>
  )
}
