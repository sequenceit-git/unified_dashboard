/** ebay listing: productFields · conditionDescription (moved verbatim from ProductModal.jsx) */
import { isNewCondition } from '../rules'

export default function ConditionDescription({ ctx }) {
  const { form, set } = ctx
  return (
    <>
      {!isNewCondition(form.condition) && (
        <div>
          <label className="block mb-1 text-xs font-semibold text-gray-600">
            Condition description ({form.conditionDescription.length}/1000)
          </label>
          <textarea
            rows={2}
            maxLength={1000}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-2xs outline-none transition placeholder:text-gray-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
            placeholder="Describe cosmetic wear, included accessories, or defects…"
            value={form.conditionDescription}
            onChange={set('conditionDescription')}
          />
        </div>
      )}
    </>
  )
}
