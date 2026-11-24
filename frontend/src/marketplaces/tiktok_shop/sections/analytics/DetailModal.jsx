/** A TikTok analytics drill-down (metric diagnosis or SKU details) in a modal, read-only. */
import { useApi } from '../../../../hooks/useApi'
import { queryString } from '../../../../lib/api'
import Modal from '../../../../components/ui/Modal'
import { ErrorState, Spinner } from '../../../../components/ui/Feedback'
import SectionTable from '../../SectionTable'
import { formatCell } from '../../sectionFormat'

export default function DetailModal({ action, id, onClose }) {
  const { data, loading, error, refetch } = useApi(`/api/tiktok/sections/analytics/${action}${queryString({ id })}`)
  return (
    <Modal title={data?.title || 'Details'} wide onClose={onClose}>
      {loading && <Spinner />}
      {!loading && error && <ErrorState message={error} onRetry={refetch} />}
      {!loading && !error && data && (
        <div className="space-y-4">
          {data.summary?.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {data.summary.map((s) => (
                <div key={s.label} className="rounded-lg border p-3 dark:border-slate-700">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{s.label}</p>
                  <p className="mt-1 font-semibold">{s.type === 'text' ? s.value : formatCell(s.type, s.value)}</p>
                </div>
              ))}
            </div>
          )}
          {(data.tables || []).map((t) => <SectionTable key={t.id} table={t} canAct={false} />)}
        </div>
      )}
    </Modal>
  )
}
