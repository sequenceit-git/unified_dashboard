/** ebay listing: productFields · identifier (moved verbatim from ProductModal.jsx) */
import EbayIdentifierField from '../IdentifierField'

export default function Identifier({ ctx }) {
  const { form, setForm, variants } = ctx
  return (
    <>
      {variants.length === 0 && (
        <EbayIdentifierField
          value={form.identifierCode}
          onChange={(val) => setForm((prev) => ({ ...prev, identifierCode: val }))}
        />
      )}
    </>
  )
}
