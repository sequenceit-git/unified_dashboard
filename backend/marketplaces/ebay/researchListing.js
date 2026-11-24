/**
 * A product found by Product Discovery, shaped for this shop: the title rewritten to this shop's
 * rules and length (by the AI when it is set up, otherwise cut cleanly at a word).
 */
const OpenAI = require('openai')
const { getAiConfig } = require('../../services/system/aiSettings')
const profile = require('./profile')

const RULES = "eBay US search title, at most 80 characters: what the item is first, then the details buyers search for (model, size, colour, material, quantity). Add a brand only if it is the seller's own brand, never another company's brand. Plain words: no promotional words (free shipping, best, sale, wow), no ALL CAPS words, no emojis or symbols, no repeated words."

/** Promotional words, emojis and symbols marketplaces reject in titles. */
function cleanTitle(text) {
  return String(text || '')
    .replace(/\b(hot sale|free shipping|best seller|limited time|new arrival|on sale|sale|wow)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s'".,&/()+%#-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The longest start of `text` within `max` characters that ends on a whole word. */
function fitWords(text, max) {
  const clean = cleanTitle(text)
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max + 1)
  const end = cut.lastIndexOf(' ')
  return (end > 0 ? cut.slice(0, end) : clean.slice(0, max)).replace(/[\s,;:&/-]+$/, '')
}

async function aiTitle({ title, description, brand }, max) {
  const { apiKey, model } = await getAiConfig({ purpose: 'listing' })
  if (!apiKey) return null
  // A slow AI must not hold up "List on shop": give up fast and cut the title instead.
  const client = new OpenAI({ apiKey, timeout: 8000, maxRetries: 0 })
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

module.exports = { researchListing, fitWords, RULES }
