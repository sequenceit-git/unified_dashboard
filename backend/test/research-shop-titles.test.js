const test = require('node:test')
const assert = require('node:assert/strict')
const { stubModules, freshRequire } = require('./helpers/stub')

const LONG = 'Ceramic Plant Pot With Drainage Hole And Saucer For Indoor Outdoor Succulents Herbs Flowers Cactus Large 8 Inch White Modern Minimalist Decor Gift Set For Plant Lovers Home Office Garden Balcony Windowsill Kitchen Living Room Bedroom Patio Porch Housewarming Birthday Christmas Mothers Day Present Great Value Pack Bundle Extra'

for (const [shop, max] of [['ebay', 80], ['tiktok_shop', 255], ['temu', 250]]) {
  test(`${shop}: without AI the title is cut at a word within ${max} characters`, async () => {
    const restore = stubModules({ '/system/aiSettings': { getAiConfig: async () => ({ apiKey: '' }) } })
    try {
      const { researchListing } = freshRequire(`marketplaces/${shop}/researchListing.js`)
      const { title } = await researchListing({ title: LONG, description: '', brand: '' })
      assert.ok(title.length <= max, `${title.length} > ${max}`)
      assert.ok(LONG.startsWith(title), 'a clean cut, no half word')
      assert.equal((await researchListing({ title: 'Short title', brand: '' })).title, 'Short title')
    } finally { restore() }
  })

  test(`${shop}: an AI title over the limit is not used`, async () => {
    const restore = stubModules({
      '/system/aiSettings': { getAiConfig: async () => ({ apiKey: 'k', model: 'm' }) },
      openai: function OpenAI() { return { responses: { create: async () => ({ output_text: JSON.stringify({ title: 'x'.repeat(max + 5) }) }) } } },
    })
    try {
      const { researchListing } = freshRequire(`marketplaces/${shop}/researchListing.js`)
      const { title } = await researchListing({ title: LONG, brand: 'Leafy' })
      assert.ok(title.length <= max && LONG.startsWith(title))
    } finally { restore() }
  })
}

for (const shop of ['ebay', 'tiktok_shop', 'temu']) {
  test(`${shop}: the AI title call gives up fast (no retries) and the fallback title is cleaned`, async () => {
    const made = []
    const restore = stubModules({
      '/system/aiSettings': { getAiConfig: async () => ({ apiKey: 'k', model: 'm' }) },
      openai: function OpenAI(opts) { made.push(opts); return { responses: { create: async () => { throw new Error('timed out') } } } },
    })
    try {
      const { researchListing } = freshRequire(`marketplaces/${shop}/researchListing.js`)
      const { title } = await researchListing({ title: '🔥 HOT SALE Ceramic Plant Pot FREE SHIPPING ⭐ White', brand: '' })
      assert.ok(made[0].timeout <= 10000 && made[0].maxRetries === 0, JSON.stringify(made[0]))
      assert.equal(title, 'Ceramic Plant Pot White')
    } finally { restore() }
  })

  test(`${shop}: the prompt never puts another company's brand first`, async () => {
    let instructions = ''
    const restore = stubModules({
      '/system/aiSettings': { getAiConfig: async () => ({ apiKey: 'k', model: 'm' }) },
      openai: function OpenAI() { return { responses: { create: async (req) => { instructions = req.instructions; return { output_text: '{"title":"Plant Pot"}' } } } } },
    })
    try {
      const { researchListing } = freshRequire(`marketplaces/${shop}/researchListing.js`)
      await researchListing({ title: 'Plant Pot', brand: 'Acme' })
      assert.doesNotMatch(instructions, /brand first/i)
      assert.match(instructions, /brand/i)
    } finally { restore() }
  })
}
