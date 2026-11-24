/**
 * A product found by Product Discovery, shaped for this shop: the title rewritten to this shop's
 * rules and length (by the AI when it is set up, otherwise cut cleanly at a word).
 */
const OpenAI = require('openai')
const { getAiConfig } = require('../../services/system/aiSettings')
const profile = require('./profile')

const RULES = 'Temu US goods title, at most 250 characters: what the item is first, then the key attributes (material, size, colour, quantity, use). No brand names you are not sure the seller owns, no promotional words (hot sale, best, free shipping), no emojis, no special symbols, no ALL CAPS, no repeated keywords.'

/** The longest start of `text` within `max` characters that ends on a whole word. */
function fitWords(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max + 1)
  const end = cut.lastIndexOf(' ')
  return (end > 0 ? cut.slice(0, end) : clean.slice(0, max)).replace(/[\s,;:&/-]+$/, '')
}

async function aiTitle({ title, description, brand }, max) {
  const { apiKey, model } = await getAiConfig({ purpose: 'listing' })
  if (!apiKey) return null
  const client = new OpenAI({ apiKey })
  const res = await client.responses.create({
    model,
    instructions: `Write one product title. ${RULES} Use only facts given. Reply with JSON only: { "title": "..." }.`,
    input: JSON.stringify({ title, brand, description: String(description || '').slice(0, 2000), maxCharacters: max }),
  })
  const text = String(res.output_text || '').replace(/^```(?:json)?|```$/g, '').trim()
  try {
    const out = String(JSON.parse(text).title || '').replace(/\s+/g, ' ').trim()
    return out && out.length <= max ? out : null
  } catch {
    return null
  }
}

async function researchListing({ title, description = '', brand = '' }) {
  const max = profile.productForm?.titleMax || 80
  const ai = await aiTitle({ title, description, brand }, max).catch(() => null)
  return { title: ai || fitWords(title, max), aiTitle: Boolean(ai) }
}

module.exports = { researchListing, fitWords }
