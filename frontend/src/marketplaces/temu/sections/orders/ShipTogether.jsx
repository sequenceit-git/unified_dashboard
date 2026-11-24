/** Temu's groups of orders that can ship in one package, and packages not shipped yet. */
import { useApi } from '../../../../hooks/useApi'
import Modal from '../../../../components/ui/Modal'
import { EmptyState, ErrorState, Spinner } from '../../../../components/ui/Feedback'

export default function ShipTogether({ onClose }) {
  const { data, loading, error, refetch } = useApi('/api/temu/orders/temu-ship-together')
  return (
    <Modal title="Ship together" wide onClose={onClose}>
      {loading && !data ? <Spinner /> : error ? <ErrorState message={error} onRetry={refetch} /> : (
        <div className="space-y-4 text-sm">
          <section>
            <h3 className="mb-1 font-semibold">Orders Temu lets you ship in one package</h3>
            {data.groups.length ? data.groups.map((g, i) => (
              <p key={i} className="rounded border px-2 py-1">{g.orders.map((o) => o.parentOrderSn).join(' + ')}</p>
            )) : <EmptyState message="No orders to combine right now." />}
          </section>
          {data.unshippedPackages.length > 0 && (
            <section>
              <h3 className="mb-1 font-semibold">Packages not shipped yet</h3>
              <ul>{data.unshippedPackages.map((p) => <li key={p.packageSn}>{p.packageSn} · {p.carrier} {p.trackingNumber} · {p.orders.join(', ')}</li>)}</ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}
