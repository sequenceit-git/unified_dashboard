/** tiktok_shop listing: productFields · identifier (moved verbatim from ProductModal.jsx) */
import IdentifierCodeField from '../IdentifierCodeField'

export default function Identifier({ ctx }) {
  const { form, setForm, variants } = ctx
  return (
    <>
      {variants.length === 0 && (
        <IdentifierCodeField
          value={form.identifierCode}
          onChange={(val) => setForm((prev) => ({ ...prev, identifierCode: val }))}
        />
      )}
    </>
  )
}
