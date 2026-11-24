/** TikTok Shop returns and cancellations: approve/reject (own buttons), plus the loader's tabs and actions. */
import SectionView from '../../SectionView'
import sectionActions from './tableActions'
import { api } from '../../../../lib/api'

/** The page's own buttons (tableActions.jsx) call this with the section context. */
async function handleAction(type, row, ctx) {
  const { token, setLoading, setError } = ctx
  const load = () => ctx.reload()

    if (type === 'cancel-approve') {
      if (!window.confirm(`Approve cancellation for Order ${row.orderId || row.cancelId}?`)) return
      setLoading(true)
      try {
        await api.post('/api/tiktok/sections/cancellations/decide', { cancelId: row.cancelId, orderId: row.orderId, action: 'approve' }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'cancel-reject') {
      if (!window.confirm(`Reject cancellation for Order ${row.orderId || row.cancelId}?`)) {
        return
      }
      setLoading(true)
      try {
        await api.post('/api/tiktok/sections/cancellations/decide', {
          cancelId: row.cancelId,
          orderId: row.orderId,
          action: 'reject',
        }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'return-approve') {
      if (!window.confirm(`Approve return request for Order ${row.orderId || row.returnId}?`)) return
      setLoading(true)
      try {
        await api.post('/api/tiktok/sections/returns-cancellations/decide', {
          returnId: row.returnId,
          orderId: row.orderId,
          decision: 'APPROVE',
          ...(row.returnType ? { returnType: row.returnType } : {}),
          ...(row.rawStatus ? { rawStatus: row.rawStatus } : {}),
        }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'return-decline') {
      const reason = window.prompt(`Decline return for Order ${row.orderId || row.returnId}? Enter optional reason:`, 'Return declined by policy')
      if (reason === null) return
      setLoading(true)
      try {
        await api.post('/api/tiktok/sections/returns-cancellations/decide', {
          returnId: row.returnId,
          decision: 'DECLINE',
          comments: reason,
          ...(row.returnType ? { returnType: row.returnType } : {}),
          ...(row.rawStatus ? { rawStatus: row.rawStatus } : {}),
        }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
}

const renderRowActions = (table, ctx) => {
  const buttons = sectionActions.tableActions?.[table.id]
  return buttons && ((row) => buttons(row, { onAction: (type, r) => handleAction(type, r, ctx), marketplace: 'tiktok_shop' }))
}

export default function ReturnsCancellationsPage() {
  return <SectionView sectionId="returns-cancellations" renderRowActions={renderRowActions} />
}
