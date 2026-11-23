/** ebay listing: productFields · subtitle (moved verbatim from ProductModal.jsx) */
import { Input } from '../../../../../../components/ui/Input'

export default function Subtitle({ ctx }) {
  const { form, set, subtitleMax } = ctx
  return (
    <>
      <Input
        className="sm:col-span-2"
        label={`Subtitle (optional, ${form.subtitle.length}/${subtitleMax} — extra eBay fee may apply)`}
        maxLength={subtitleMax}
        value={form.subtitle}
        onChange={set('subtitle')}
        placeholder="Supplemental keywords shown beneath title"
      />
    </>
  )
}
