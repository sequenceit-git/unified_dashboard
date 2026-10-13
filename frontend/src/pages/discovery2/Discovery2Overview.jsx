import { StatCard } from '../../components/ui/Card'

export default function Discovery2Overview({ stats = {}, loading = false }) {
  const {
    totalReports = 0,
    totalRecommendations = 0,
    highScoreCount = 0,
    lastRunDate = null,
  } = stats

  const formattedDate = lastRunDate
    ? new Date(lastRunDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'No runs yet'

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Total Recommendations"
        value={loading ? '…' : totalRecommendations}
        sub="Across Analyzed Runs"
      />
      <StatCard
        label="High Potential (≥80)"
        value={loading ? '…' : highScoreCount}
        sub="Top Tier Opportunity Score"
      />
      <StatCard
        label="Research Reports"
        value={loading ? '…' : totalReports}
        sub="Multi-Marketplace Runs"
      />
      <StatCard
        label="Last Research Run"
        value={loading ? '…' : formattedDate}
        sub="Latest Market Scan"
      />
    </div>
  )
}
