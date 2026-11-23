/** ebay listing: productFields · mpn (moved verbatim from ProductModal.jsx) */
import { Input } from '../../../../components/ui/Input'

export default function Mpn({ ctx }) {
  const { form, set } = ctx
  return (
    <>
      <Input label="MPN (optional)" value={form.mpn} onChange={set('mpn')} placeholder="Manufacturer Part Number" />
    </>
  )
}
