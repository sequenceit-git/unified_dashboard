/** tiktok_shop listing: productFields · listPrice (moved verbatim from ProductModal.jsx) */
import { Input } from '../../../../../../components/ui/Input'

export default function ListPrice({ ctx }) {
  const { form, set, variants } = ctx
  return (
    <>
      {variants.length === 0 && (
        <Input
          label="MSRP / List price ($)"
          type="number"
          step="0.01"
          min="0"
          max="7600"
          value={form.listPrice ?? ''}
          onChange={set('listPrice')}
          placeholder="Optional strikethrough price"
        />
      )}
    </>
  )
}
