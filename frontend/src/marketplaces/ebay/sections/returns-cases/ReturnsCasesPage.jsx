/** eBay Returns & cases: returns and cancellations (own buttons) plus the loader's row actions. */
import SectionView from '../../SectionView'
import sectionActions from './tableActions'
import { api } from '../../../../lib/api'

async function send(ctx, path, body) {
  ctx.setLoading(true)
  try {
    await api.post(path, body, ctx.token)
    await ctx.reload()
  } catch (e) {
    ctx.setError(e.message)
  } finally {
    ctx.setLoading(false)
  }
}

async function handleAction(type, row, ctx) {
  if (type === 'cancel-approve') {
    if (!window.confirm(`Approve cancellation for Order ${row.orderId || row.cancelId}?`)) return
    return send(ctx, '/api/ebay/sections/cancellations/decide', { cancelId: row.cancelId, orderId: row.orderId, action: 'approve' })
  }
  if (type === 'cancel-reject') {
    const tracking = window.prompt(
      `Reject cancellation for Order ${row.orderId || row.cancelId}? Enter the shipment tracking number (required by eBay if already shipped):`,
      '',
    )
    if (tracking === null) return
    const trackingNumber = tracking.trim() || undefined
    return send(ctx, '/api/ebay/sections/cancellations/decide', { cancelId: row.cancelId, orderId: row.orderId, action: 'reject', ...(trackingNumber ? { trackingNumber } : {}) })
  }
  if (type === 'return-approve') {
    if (!window.confirm(`Approve return request for Order ${row.orderId || row.returnId}?`)) return
    return send(ctx, '/api/ebay/sections/returns-cases/decide', {
      returnId: row.returnId,
      orderId: row.orderId,
      decision: 'APPROVE',
      ...(row.returnType ? { returnType: row.returnType } : {}),
      ...(row.rawStatus ? { rawStatus: row.rawStatus } : {}),
    })
  }
  if (type === 'return-decline') {
    const reason = window.prompt(`Decline return for Order ${row.orderId || row.returnId}? Enter optional reason:`, 'Return declined by policy')
    if (reason === null) return
    return send(ctx, '/api/ebay/sections/returns-cases/decide', {
      returnId: row.returnId,
      decision: 'DECLINE',
      comments: reason,
      ...(row.returnType ? { returnType: row.returnType } : {}),
      ...(row.rawStatus ? { rawStatus: row.rawStatus } : {}),
    })
  }
}

export default function ReturnsCasesPage() {
  return <SectionView sectionId="returns-cases" reconnectNotice tableActions={sectionActions.tableActions} onAction={handleAction} />
}
