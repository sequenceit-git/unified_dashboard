/** tiktok_shop listing: Direct listing draft fields (moved verbatim from DirectListModal.jsx) */
import { SAVE_MODES } from '../rules'
import { Input, Select } from '../../../../../../components/ui/Input'
import ImageDropzone from '../../../../../../components/ui/ImageDropzone'
import BrandPicker from '../BrandPicker'
import IdentifierCodeField from '../IdentifierCodeField'
import SizeChartField from '../SizeChartField'
import VariantEditor from '../../components/VariantEditor'

export default function DraftFields({ ctx }) {
  const { activeVariants, brandId, categoryField, categoryId, draft, identifierCode, listPrice, maxImages, packageFields, rules, salesSchema, saveMode, sellerSku, set, setDraftImages, shop, sizeChart, specificsFields, stock, summaryPrice, summaryStock, textareaClass, titleField, update } = ctx
  return (
    <>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {titleField}
          {activeVariants.length === 0 ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input label="Your price ($) *" type="number" step="0.01" min="0.01" max="7600" value={draft.price} onChange={set('price')} />
                <Input label="MSRP / List ($)" type="number" step="0.01" min="0" max="7600" value={listPrice ?? ''} onChange={(e) => update({ listPrice: e.target.value })} placeholder="Optional" />
                <Input label="Stock *" type="number" min="1" max="99999" step="1" value={stock} onChange={(e) => update({ stock: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Input label="Seller SKU (optional)" maxLength={50} value={sellerSku || ''} onChange={(e) => update({ sellerSku: e.target.value })} placeholder="Auto-generated if blank" />
                <div className="sm:col-span-2">
                  <IdentifierCodeField
                    value={identifierCode}
                    onChange={(val) => update({ identifierCode: val })}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-900 flex items-center justify-between">
              <span><strong>{activeVariants.length} variants</strong> configured below</span>
              <span>From <strong>${summaryPrice.toFixed(2)}</strong> · <strong>{summaryStock}</strong> units</span>
            </div>
          )}
          {draft.sourcePrice && (
            <p className="text-xs text-gray-500">The page sells it for ${Number(draft.sourcePrice).toFixed(2)}. That is saved as the base price.</p>
          )}
          {categoryField}
          <BrandPicker
            shopId={shop?._id}
            categoryId={categoryId}
            brandId={brandId || ''}
            brand={draft.brand}
            onChange={({ brandId: nextId, brand: nextBrand }) => update((cur) => ({ brandId: nextId, draft: { ...cur.draft, brand: nextBrand } }))}
          />
          <VariantEditor
            key={draft.sourceUrl || 'direct-tiktok'}
            variants={activeVariants}
            onChange={(next) => update({ variants: next })}
            salesSchema={salesSchema}
            defaultPrice={draft.price}
            defaultStock={stock}
            baseSku={sellerSku || 'TTS'}
            requireStock
          />
          {packageFields}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">Description</span>
              <span className="text-[11px] text-gray-400">{(draft.description || '').length}/10000</span>
            </div>
            <textarea rows={6} maxLength={10000} className={textareaClass} value={draft.description} onChange={set('description')} />
          </div>
        </div>
        <div className="space-y-3">
          <ImageDropzone images={draft.images} onChange={setDraftImages} maxImages={maxImages} label={`Images (up to ${maxImages})`} />
          <SizeChartField
            shopId={shop?._id}
            rules={rules}
            value={sizeChart}
            onChange={(next) => update({ sizeChart: next })}
          />
          {specificsFields}
          <Select
            label="TikTok save mode"
            value={saveMode || 'LISTING'}
            onChange={(e) => update({ saveMode: e.target.value })}
            options={SAVE_MODES}
          />
        </div>
      </div>
    </>
  )
}
