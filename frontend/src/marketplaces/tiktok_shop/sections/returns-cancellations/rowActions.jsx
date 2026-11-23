/**
 * Action-column building blocks for shop section tables. Each shop's section file picks the
 * variant that matches what its marketplace API allows.
 */
import Button from '../../../../components/ui/Button'

const processed = <span className="text-xs text-gray-400">Processed</span>

/** Approve / Reject buttons for a cancellation request; `canReject: false` hides Reject. */
export function cancellationActions({ canReject = true } = {}) {
  return (row, { onAction }) => {
    const status = String(row.status || '')
    const isOpen = /pending|requested|open|waiting/i.test(status)
    const closed = !isOpen && /closed|complete|finish|reject|declined|approved|cancel|success|refunded/i.test(status)
    if (closed) return processed
    return (
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={() => onAction('cancel-approve', row)}>
          Approve
        </Button>
        {canReject && (
          <Button size="sm" variant="secondary" onClick={() => onAction('cancel-reject', row)}>
            Reject
          </Button>
        )}
      </div>
    )
  }
}

/** Approve / Decline buttons for a return; `reviewingLabel` replaces them while the platform reviews. */
export function returnActions({ approveLabel = 'Approve', canDecline = true, reviewingLabel = '' } = {}) {
  return (row, { onAction }) => {
    const status = String(row.status || '')
    if (reviewingLabel && /platform reviewing/i.test(status)) return <span className="text-xs text-gray-400">{reviewingLabel}</span>
    const isActionable = /pending|requested|open|buyer shipped|package shipped/i.test(status)
    const closed = !isActionable && /closed|complete|finish|reject|declined|approved|refund|awaiting buyer|cancel|success/i.test(status)
    if (closed) return processed
    return (
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={() => onAction('return-approve', row)}>
          {approveLabel}
        </Button>
        {canDecline && (
          <Button size="sm" variant="secondary" onClick={() => onAction('return-decline', row)}>
            Decline
          </Button>
        )}
      </div>
    )
  }
}

/**
 * Pause / Resume for a promotion. `skip(row, isPaused)` hides the button for promotions the
 * marketplace can't pause or resume; `pauseLabel` is the shop's word for pausing.
 */
export function promotionActions({ pauseLabel = 'Pause', skip = () => false } = {}) {
  return (row, { onAction }) => {
    if (!row.promotionId) return null
    if (/ended|cancel|finish|expired/i.test(String(row.status || ''))) return null
    const isPaused = /pause|deactivate/i.test(String(row.status || ''))
    if (skip(row, isPaused)) return null
    return (
      <Button
        size="sm"
        variant={isPaused ? 'primary' : 'secondary'}
        onClick={() => onAction(isPaused ? 'promo-resume' : 'promo-pause', row)}
      >
        {isPaused ? 'Resume' : pauseLabel}
      </Button>
    )
  }
}
