/** ebay listing: listFields · subtitle (moved verbatim from ListModal.jsx) */
import { Input } from '../../../../components/ui/Input'

export default function Subtitle({ ctx }) {
  const { setSubtitle, subtitle, subtitleMax } = ctx
  return (
    <>
      <Input
        label={`Subtitle (optional, ${subtitle.length}/${subtitleMax} — extra eBay fee may apply)`}
        maxLength={subtitleMax}
        value={subtitle}
        onChange={(e) => setSubtitle(e.target.value)}
        placeholder="Extra keywords displayed under the eBay title"
      />
    </>
  )
}
