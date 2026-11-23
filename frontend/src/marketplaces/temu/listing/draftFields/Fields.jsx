/** temu listing: Direct listing draft fields (moved verbatim from DirectListModal.jsx) */
import { Input } from '../../../../components/ui/Input'
import ImageDropzone from '../../../../components/ui/ImageDropzone'

export default function DraftFields({ ctx }) {
  const { categoryField, draft, maxImages, set, setDraftImages, stock, textareaClass, titleField, update } = ctx
  return (
    <>
      <div className="space-y-3">
        {titleField}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label="Your price ($) *" type="number" step="0.01" min="0.01" value={draft.price} onChange={set('price')} />
          <Input label="Stock *" type="number" min="0" step="1" value={stock} onChange={(e) => update({ stock: e.target.value })} />
          <Input label="Brand" value={draft.brand} onChange={set('brand')} />
        </div>
        {categoryField}
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-gray-600">Description</span>
          <textarea rows={6} className={textareaClass} value={draft.description} onChange={set('description')} />
        </div>
        <ImageDropzone images={draft.images} onChange={setDraftImages} maxImages={maxImages} label={`Images (up to ${maxImages})`} />
      </div>
    </>
  )
}
