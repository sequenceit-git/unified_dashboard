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
