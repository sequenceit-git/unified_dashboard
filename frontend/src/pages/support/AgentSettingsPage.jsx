import { FiDatabase, FiSliders } from 'react-icons/fi'
import Card, { StatCard } from '../../components/ui/Card'
import { ErrorState, Spinner } from '../../components/ui/Feedback'
import { useApi } from '../../hooks/useApi'

// Sections that will be configurable once the settings spec is finalized.
const PLANNED_SECTIONS = [
  { title: 'Agent Identity & Tone', description: 'Name, persona, greeting, and writing style for customer replies.' },
  { title: 'Escalation Rules', description: 'When the agent hands a conversation to a human — fraud, legal, high-value claims.' },
  { title: 'Auto-Reply Scope', description: 'Which categories the agent may answer on its own versus draft for approval.' },
  { title: 'Marketplace Overrides', description: 'Per-channel behavior for eBay, TikTok Shop, and Temu.' },
  { title: 'Working Hours & SLAs', description: 'Business hours, first-response targets, and after-hours behavior.' },
  { title: 'Knowledge Base Sync', description: 'How policies and FAQs are seeded, versioned, and refreshed.' },
]

function ComingSoonPill() {
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Coming soon</span>
  )
}

function CategoryList({ title, rows }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing seeded yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.category} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
              <span className="truncate text-sm font-medium text-gray-700">{row.category}</span>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-200">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function AgentSettingsPage() {
  const { data, loading, error, refetch } = useApi('/api/support/overview')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">AI Agent Settings</h1>
          <ComingSoonPill />
        </div>
        <p className="text-xs text-gray-500">Configuration options will be added here — the knowledge base below is already live.</p>
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Support policies" value={data?.policies ?? 0} sub="Active policy documents in the knowledge base" />
            <StatCard label="FAQ entries" value={data?.faqs ?? 0} sub="Common customer questions with approved answers" />
            <StatCard
              label="Knowledge categories"
              value={data?.categories ?? 0}
              sub={data?.lastUpdated ? `Last updated ${new Date(data.lastUpdated).toLocaleDateString()}` : 'No entries yet'}
            />
          </div>

          <Card>
            <div className="mb-4 flex items-center gap-2">
              <FiDatabase size={15} className="text-indigo-600" />
              <h2 className="text-sm font-semibold text-gray-900">Knowledge base</h2>
              <span className="text-xs text-gray-400">— seeded from backend/seed/support/</span>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <CategoryList title="Policies by category" rows={data?.policiesByCategory ?? []} />
              <CategoryList title="FAQs by category" rows={data?.faqsByCategory ?? []} />
            </div>
          </Card>
        </>
      )}

      <div>
        <div className="mb-3 flex items-center gap-2">
          <FiSliders size={15} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Planned configuration</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PLANNED_SECTIONS.map((section) => (
            <Card key={section.title} className="opacity-80">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-gray-800">{section.title}</p>
                <ComingSoonPill />
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{section.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
