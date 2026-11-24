/** TikTok Shop packages: ship or get a label (own buttons), plus the loader's tabs and actions. */
import SectionView from '../../SectionView'
import sectionActions from './tableActions'
import { api } from '../../../../lib/api'

/** The page's own buttons (tableActions.jsx) call this with the section context. */
async function handleAction(type, row, ctx) {
  const { token, setLoading, setError } = ctx
  const load = () => ctx.reload()

    if (type === 'fulfillment-ship') {
      if (!window.confirm(`Mark package ${row.packageId} as ready to ship (Drop-off) on TikTok Shop?`)) return
      setLoading(true)
      try {
        await api.post(`/api/tiktok/sections/packages/${row.packageId}/ship`, { handoverMethod: 'DROP_OFF' }, token)
        load({ refresh: true })
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
      return
    }
    if (type === 'fulfillment-label') {
      setLoading(true)
      try {
        const doc = await api.get(`/api/tiktok/sections/packages/${row.packageId}/label`, token)
        const url = doc.doc_url || doc.url || doc.shipping_document_url
        if (url) {
          window.open(url, '_blank')
        } else {
          setError('No document download URL was returned for this package.')
        }
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

export default function PackagesPage() {
  return <SectionView sectionId="packages" renderRowActions={renderRowActions} />
}
