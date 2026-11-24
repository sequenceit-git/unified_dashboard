const test = require('node:test')
const assert = require('node:assert/strict')
const { buildGoodsAdd, formErrors } = require('../goodsPayload')

const TEMPLATE = {
  attributes: [
    { pid: 10, refPid: 100, templatePid: 1000, name: 'Material', required: true, multiple: false, values: [{ vid: 1, value: 'Cotton' }, { vid: 2, value: 'Polyester' }], units: [], parent: null },
    { pid: 11, refPid: 101, templatePid: 1001, name: 'Cotton share', required: true, multiple: false, values: [], units: [{ id: 5, name: '%' }], parent: { refPid: 100, vids: [1] } },
    { pid: 12, refPid: 102, templatePid: 1002, name: 'Features', required: false, multiple: true, values: [{ vid: 7, value: 'Waterproof' }, { vid: 8, value: 'Light' }], units: [], parent: null },
  ],
  variants: [{ pid: 20, refPid: 200, templatePid: 2000, parentSpecId: 3001, name: 'Color', required: true, values: [{ vid: 31, value: 'Red', specId: 9001 }, { vid: 32, value: 'Blue', specId: 9002 }], units: [], parent: null }],
  customVariants: [{ parentSpecId: 3002, name: 'Size' }],
}
const SKU = (spec, extra = {}) => ({ specs: [spec], outSkuSn: 'TEE-R', basePrice: '9.99', quantity: '12', weight: '0.4', weightUnit: 'lb', length: '10', width: '8', height: '1', volumeUnit: 'in', images: ['https://temu.img/r.jpg'], ...extra })
const RED = { parentSpecId: 3001, specId: 9001, vid: 31, value: 'Red' }
const FORM = (extra = {}) => ({
  catId: 29069, title: 'Cotton tee', description: 'Soft.', bulletPoints: ['Soft', 'Light'], outGoodsSn: 'TEE',
  images: ['https://temu.img/a.jpg', 'https://temu.img/b.jpg'], shippingTemplateId: 'T1', handlingDays: 2,
  attributes: { 1000: { vids: [1] }, 1001: { value: '95', unitId: 5 }, 1002: { vids: [7, 8] } },
  variants: [SKU(RED)], origin: { region1: 'Mainland China', region2: 'Guangdong' }, ...extra,
})

test("a single-SKU goods builds Temu's add body", () => {
  const body = buildGoodsAdd(FORM(), TEMPLATE)
  assert.deepEqual(body.goodsBasic, { catId: 29069, goodsName: 'Cotton tee', outGoodsSn: 'TEE', goodsGallery: { goodsCarouselImage: ['https://temu.img/a.jpg', 'https://temu.img/b.jpg'], detailImage: ['https://temu.img/a.jpg', 'https://temu.img/b.jpg'] } })
  assert.deepEqual(body.goodsServicePromise, { costTemplateId: 'T1', fulfillmentType: 1, shipmentLimitDay: 2 })
  assert.deepEqual(body.bulletPoints, ['Soft', 'Light'])
  assert.equal(body.goodsDesc, 'Soft.')
  assert.deepEqual(body.goodsOriginInfo, { originRegion1: 'Mainland China', originRegion2: 'Guangdong' })
  assert.deepEqual(body.goodsProperty.goodsProperties, [
    { templatePid: 1000, refPid: 100, vid: 1, value: 'Cotton' },
    { templatePid: 1001, refPid: 101, value: '95', valueUnitId: 5, valueUnit: '%' },
    { templatePid: 1002, refPid: 102, vid: 7, value: 'Waterproof' },
    { templatePid: 1002, refPid: 102, vid: 8, value: 'Light' },
    { templatePid: 2000, refPid: 200, parentSpecId: 3001, specId: 9001, vid: 31, value: 'Red' },
  ])
  assert.deepEqual(body.skuList, [{
    specIdList: [9001], outSkuSn: 'TEE-R', quantity: 12,
    price: { basePrice: { amount: '9.99', currency: 'USD' }, listPriceType: 1 },
    weight: '0.4', weightUnit: 'lb', length: '10', width: '8', height: '1', volumeUnit: 'in', images: ['https://temu.img/r.jpg'],
  }])
  assert.equal(body.goodsTrademark, undefined)
})

test('variants become skuList with their spec ids', () => {
  const custom = { parentSpecId: 3002, specId: 7777, value: 'XL' }
  const body = buildGoodsAdd(FORM({ variants: [SKU(RED), SKU({ parentSpecId: 3001, specId: 9002, vid: 32, value: 'Blue' }, { outSkuSn: 'TEE-B', listPrice: '19.99' }), { ...SKU(RED, { outSkuSn: 'TEE-RXL' }), specs: [RED, custom] }], brand: { brandId: 1, trademarkId: 2 }, taxCode: 'A1' }), TEMPLATE)
  assert.deepEqual(body.skuList.map((s) => s.specIdList), [[9001], [9002], [9001, 7777]])
  assert.deepEqual(body.skuList[1].price, { basePrice: { amount: '9.99', currency: 'USD' }, listPrice: { amount: '19.99', currency: 'USD' } })
  const specs = body.goodsProperty.goodsProperties.filter((p) => p.specId)
  assert.deepEqual(specs.map((p) => p.specId), [9001, 9002, 7777])
  assert.deepEqual(specs[2], { parentSpecId: 3002, specId: 7777, value: 'XL' })
  assert.deepEqual(body.goodsTrademark, { brandId: 1, trademarkId: 2 })
  assert.deepEqual(body.taxCodeInfo, { itemTaxCode: 'A1' })
})

test('a child attribute is sent only when its parent value triggers it', () => {
  const body = buildGoodsAdd(FORM({ attributes: { 1000: { vids: [2] }, 1001: { value: '95', unitId: 5 } } }), TEMPLATE)
  assert.deepEqual(body.goodsProperty.goodsProperties.filter((p) => !p.specId).map((p) => p.templatePid), [1000])
  // Not triggered → its "required" doesn't apply.
  assert.deepEqual(formErrors(FORM({ attributes: { 1000: { vids: [2] } } }), TEMPLATE), [])
  assert.deepEqual(formErrors(FORM({ attributes: { 1000: { vids: [1] } } }), TEMPLATE), [{ field: 'attributes.1001', message: 'Cotton share is required.' }])
})

test('missing required attributes, a long title and listPrice below basePrice are listed by field', () => {
  const errors = formErrors(FORM({
    title: 'x'.repeat(501), attributes: {}, bulletPoints: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], images: [], shippingTemplateId: '',
    variants: [SKU(RED, { listPrice: '5', quantity: '1000000' }), SKU(RED, { images: [], weight: '' })],
  }), TEMPLATE)
  assert.deepEqual(errors.map((e) => e.field), [
    'title', 'bulletPoints', 'images', 'shippingTemplateId', 'attributes.1000',
    'variants.0.listPrice', 'variants.0.quantity', 'variants.1.weight', 'variants.1.images', 'variants.1.specs',
  ])
  assert.equal(errors.find((e) => e.field === 'variants.1.specs').message, 'Two SKUs have the same variant values.')
  assert.deepEqual(formErrors(FORM({ catId: null, variants: [] }), TEMPLATE).map((e) => e.field), ['catId', 'variants'])
})

test('amounts are whole units, not cents', () => {
  const sku = buildGoodsAdd(FORM({ variants: [SKU(RED, { basePrice: 12.5, listPrice: '20' })] }), TEMPLATE).skuList[0]
  assert.deepEqual(sku.price, { basePrice: { amount: '12.50', currency: 'USD' }, listPrice: { amount: '20.00', currency: 'USD' } })
  assert.throws(() => buildGoodsAdd(FORM({ title: '' }), TEMPLATE), (e) => e.status === 400 && e.problems.some((p) => p.field === 'title'))
})

test('Temu US: weight in lb and size in inches with one decimal, within US limits; price from $0.02', () => {
  const sku = buildGoodsAdd(FORM({ variants: [SKU(RED, { weight: '0.44', weightUnit: 'kg', length: '10.06', volumeUnit: 'cm' })] }), TEMPLATE).skuList[0]
  assert.deepEqual([sku.weight, sku.weightUnit, sku.length, sku.volumeUnit], ['0.4', 'lb', '10.1', 'in'])
  const fields = (v) => formErrors(FORM({ variants: [SKU(RED, v)] }), TEMPLATE).map((e) => e.field)
  assert.deepEqual(fields({ weight: '0.04' }), ['variants.0.weight'])
  assert.deepEqual(fields({ weight: '10000' }), ['variants.0.weight'])
  assert.deepEqual(fields({ height: '1000' }), ['variants.0.size'])
  assert.deepEqual(fields({ basePrice: '0.01' }), ['variants.0.basePrice'])
})

// Guide 20: "Power Supply" (controlType 1) → "Operating Voltage" via parentTemplatePid + templatePropertyValueParentList.
const { mapTemplate } = require('../goodsTemplate')
const POWER = mapTemplate({ templateInfo: { goodsProperties: [
  { pid: 1425, refPid: 1561, templatePid: 891917, name: 'Power Supply', required: true, controlType: 1, parentTemplatePid: 0, showCondition: null, templatePropertyValueParentList: null, isSale: false, values: [{ vid: 36627, value: 'Use Without Electricity' }, { vid: 36789, value: 'Battery Powered (with Plug)' }] },
  { pid: 1500, refPid: 1600, templatePid: 900001, name: 'Operating Voltage', required: true, controlType: 1, parentTemplatePid: 891917, showCondition: null, isSale: false,
    templatePropertyValueParentList: [{ parentVids: [36789], vids: [501, 502] }], values: [{ vid: 501, value: '110V' }, { vid: 502, value: '220V' }, { vid: 503, value: '12V' }] },
] } })

test('a child attribute linked by parentTemplatePid applies only when its parent value triggers it', () => {
  const volt = POWER.attributes[1]
  assert.deepEqual(volt.parent, { templatePid: 891917, vids: [36789], allowed: [{ parentVids: [36789], vids: [501, 502] }] })
  const base = { ...FORM(), attributes: { 1000: { vids: [1] }, 1001: { value: '95', unitId: 5 } } }
  const t = { ...TEMPLATE, attributes: [...TEMPLATE.attributes, ...POWER.attributes] }
  assert.deepEqual(formErrors({ ...base, attributes: { ...base.attributes, 891917: { vids: [36627] } } }, t), [])
  assert.deepEqual(formErrors({ ...base, attributes: { ...base.attributes, 891917: { vids: [36789] } } }, t), [{ field: 'attributes.900001', message: 'Operating Voltage is required.' }])
  assert.deepEqual(formErrors({ ...base, attributes: { ...base.attributes, 891917: { vids: [36789] }, 900001: { vids: [503] } } }, t), [{ field: 'attributes.900001', message: '12V is not allowed for Operating Voltage with this Power Supply.' }])
  const body = buildGoodsAdd({ ...base, attributes: { ...base.attributes, 891917: { vids: [36627] }, 900001: { vids: [501] } } }, t)
  assert.ok(!body.goodsProperty.goodsProperties.some((p) => p.templatePid === 900001))
})

test('an attribute with units needs a unit', () => {
  assert.deepEqual(formErrors(FORM({ attributes: { 1000: { vids: [1] }, 1001: { value: '95' } } }), TEMPLATE), [{ field: 'attributes.1001', message: 'Choose a unit for Cotton share.' }])
})
