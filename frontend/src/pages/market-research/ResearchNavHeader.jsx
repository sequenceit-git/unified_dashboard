import { Link, useLocation } from 'react-router-dom'
import { FiArrowLeft, FiBarChart2, FiAward, FiFileText } from 'react-icons/fi'
import Badge from '../../components/ui/Badge'
import { marketplaceBadgeColor, marketplaceLabel } from '../../lib/marketplaces'

export default function ResearchNavHeader({ reportId = 'rep-001', category = 'Home & Kitchen', niche, createdAt, marketplaces = ['tiktok_shop', 'temu', 'ebay'], extraActions }) {
  const location = useLocation()

  const tabs = [
    {
      to: `/market-research/${reportId}/analysis`,
      label: 'Market Analysis',
      icon: FiBarChart2,
      active: location.pathname.includes('/analysis'),
    },
    {
      to: `/market-research/${reportId}/recommendations`,
      label: 'Product Recommendations',
      icon: FiAward,
      active: location.pathname.includes('/recommendations'),
    },
    {
      to: `/market-research/${reportId}/report`,
      label: 'Research Report',
      icon: FiFileText,
      active: location.pathname.includes('/report'),
    },
  ]

  const formattedDate = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Recent'

  return (
    <div className="space-y-4">
      {/* Top Breadcrumb & Action Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/market-research"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-indigo-600 sm:text-sm"
        >
          <FiArrowLeft size={16} />
          <span>Back to Market Research</span>
        </Link>
        {extraActions && <div className="flex items-center gap-2">{extraActions}</div>}
      </div>

      {/* Title & Metadata Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-indigo-700">
                AI Research Report
              </span>
              <span className="text-xs text-slate-400">• Generated {formattedDate}</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {category} {niche ? <span className="text-indigo-600">({niche})</span> : null}
            </h1>
            <p className="text-xs text-slate-500 sm:text-sm">
              Cross-marketplace competitive research, revenue estimates, and opportunity validation.
            </p>
          </div>

          {/* Marketplaces Evaluated */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-slate-500">Marketplaces:</span>
            {marketplaces.map((m) => (
              <Badge key={m} color={marketplaceBadgeColor(m)}>
                {marketplaceLabel(m)}
              </Badge>
            ))}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <Link
                key={tab.label}
                to={tab.to}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
                  tab.active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
