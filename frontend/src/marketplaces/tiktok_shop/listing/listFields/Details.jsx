/** tiktok_shop listing: listFields · details (moved verbatim from ListModal.jsx) */
import { Input } from '../../../../components/ui/Input'
import BrandPicker from '../BrandPicker'
import IdentifierCodeField from '../IdentifierCodeField'
import VariantEditor from '../../../../components/listing/VariantEditor'

export default function Details({ ctx }) {
  const { activeVariants, brand, brandId, categoryId, identifierCode, listPrice, price, product, salesAttributes, sellerSku, setBrand, setBrandId, setIdentifierCode, setListPrice, setSellerSku, setVariants, shopId, stock, variants } = ctx
  return (
    <>
      <>
        <BrandPicker
          shopId={shopId}
          categoryId={categoryId}
          brandId={brandId}
          brand={brand}
          onChange={({ brandId: nextId, brand: nextBrand }) => {
            setBrandId(nextId)
            setBrand(nextBrand)
          }}
        />

        {activeVariants.length === 0 && (
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-2">
            <Input
              label="MSRP / List price ($)"
              type="number"
              step="0.01"
              min="0"
              max="7600"
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value)}
              placeholder="Optional strikethrough price"
            />
            <Input
              label="Seller SKU"
              maxLength={50}
              value={sellerSku}
              onChange={(e) => setSellerSku(e.target.value)}
            />
            <div className="sm:col-span-2">
              <IdentifierCodeField
                value={identifierCode}
                onChange={setIdentifierCode}
              />
            </div>
          </div>
        )}

        <VariantEditor
          key={`${product._id}-${shopId}`}
          variants={variants}
          onChange={setVariants}
          salesSchema={salesAttributes}
          defaultPrice={price}
          defaultStock={stock}
          baseSku={sellerSku || product.sku || 'TTS'}
          requireStock
        />
      </>
    </>
  )
}
