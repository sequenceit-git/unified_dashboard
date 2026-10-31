/**
 * Inbox auto-reply. Connected shops are synced on a timer; a new buyer message gets an AI
 * answer when the shop switch (Shop.aiReplyEnabled) and the conversation switch
 * (Conversation.aiEnabled) are both on. Refunds, complaints and anything the shop data
 * cannot answer are handed to a person instead.
 */

const OpenAI = require('openai')
const Shop = require('../models/Shop')
const Conversation = require('../models/Conversation')
const Message = require('../models/Message')
const Listing = require('../models/Listing')
const marketplaceManager = require('./marketplace')
const { getAiConfig } = require('./aiSettings')

const HANDOFF = 'HANDOFF'
const MAX_MESSAGE_AGE_MS = 24 * 60 * 60 * 1000
const MARKETPLACE_LABEL = { ebay: 'eBay', tiktok_shop: 'TikTok Shop' }

async function productList(shop) {
  const listings = await Listing.find({ shopId: shop._id })
    .populate('productId', 'title basePrice stock')
    .limit(40)
    .lean()
  return listings
    .filter((listing) => listing.productId)
    .map((listing) => {
      const product = listing.productId
      const price = listing.price ?? product.basePrice
      const stock = product.stock > 0 ? `${product.stock} in stock` : 'out of stock'
      return `- ${product.title}${price ? ` | $${price}` : ''} | ${stock}`
    })
    .join('\n')
}

function instructions(shop, products) {
  return [
    `You answer buyer messages for "${shop.name}", a ${MARKETPLACE_LABEL[shop.marketplace] || shop.marketplace} shop in the United States.`,
    "Reply in the buyer's language, politely and briefly (under 120 words), as plain text without markdown.",
    'Use only facts from the conversation and the product list. Never invent order status, tracking numbers, delivery dates or shop policies.',
    'Never promise refunds, returns, replacements, discounts or compensation, and never move the buyer off the marketplace.',
    `Reply with exactly ${HANDOFF} and nothing else when the buyer asks for a refund, return, cancellation or replacement; reports a damaged, wrong, missing or fake item; is upset; mentions a dispute, claim or legal action; or asks something the facts here cannot answer.`,
    'Sign off as the shop team. If the buyer asks whether they are talking to a bot, say it is an automated assistant and a person can follow up.',
    products ? `Products in this shop:\n${products}` : 'No product list is available.',
  ].join('\n')
}

async function writeReply(shop, history) {
  const { apiKey, model } = await getAiConfig()
  if (!apiKey) throw new Error('OpenAI API key is not configured. Add it in Settings > AI agent.')
  const transcript = history
    .filter((message) => message.text)
    .slice(-15)
    .map((message) => `${message.direction === 'inbound' ? 'Buyer' : 'Shop'}: ${message.text}`)
    .join('\n')
  const response = await new OpenAI({ apiKey }).responses.create({
    model,
    instructions: instructions(shop, await productList(shop)),
    input: `Conversation so far:\n${transcript}\n\nWrite the shop's next reply.`,
  })
  return (response.output_text || '').trim()
}

/** Saves marketplace messages we have not stored yet; they are history, never reply triggers. */
async function storeHistory(shop, convo, history) {
  for (const message of history) {
    if (!message.externalMessageId) continue
    await Message.updateOne(
      { shopId: shop._id, externalMessageId: message.externalMessageId },
      {
        $setOnInsert: {
          conversationId: convo._id,
          shopId: shop._id,
          direction: message.direction,
          senderType: message.senderType,
          text: message.text,
          externalMessageId: message.externalMessageId,
          sentAt: message.sentAt,
          deliveryStatus: 'delivered',
          aiHandled: true,
        },
      },
      { upsert: true },
    )
  }
}

/** Pulls recent marketplace messages into the thread; failures leave the stored thread as is. */
async function refreshThread(shop, convo) {
  try {
    await storeHistory(shop, convo, await marketplaceManager.getThreadHistory(shop, convo))
  } catch (err) {
    console.warn(`[inbox] ${shop.name}: could not load thread ${convo.externalThreadId}: ${err.message}`)
  }
}

async function failConversation(convo, aiError, extra = {}) {
  await Conversation.updateOne({ _id: convo._id }, { aiError, ...extra })
}

async function replyToMessage(shop, conversationId, messageId) {
  const claimed = await Message.findOneAndUpdate(
    { _id: messageId, aiHandled: { $ne: true } },
    { aiHandled: true },
  )
  if (!claimed) return
  const convo = await Conversation.findById(conversationId)
  if (!convo || !convo.aiEnabled || convo.status !== 'open' || convo.replyable === false) return
  if (Date.now() - new Date(claimed.sentAt).getTime() > MAX_MESSAGE_AGE_MS) return
  if (shop.marketplace === 'ebay' && !shop.accountUsername) {
    return failConversation(convo, 'Auto-reply is waiting until the inbox has messages from at least two buyers, so it can tell your messages from theirs.')
  }

  try {
    let history = []
    try {
      history = await marketplaceManager.getThreadHistory(shop, convo)
      await storeHistory(shop, convo, history)
    } catch (err) {
      console.warn(`[inbox] ${shop.name}: could not load thread ${convo.externalThreadId}: ${err.message}`)
    }
    if (!history.length) {
      history = await Message.find({ conversationId: convo._id }).sort({ sentAt: 1 }).limit(30).lean()
    }
    const last = history[history.length - 1]
    if (last && last.direction === 'outbound') return

    const text = await writeReply(shop, history)
    if (!text) throw new Error('The AI returned an empty reply.')
    if (text.toUpperCase().startsWith(HANDOFF)) {
      return failConversation(convo, 'The AI passed this conversation to a person.', { aiEnabled: false })
    }

    const sent = await marketplaceManager.sendReply(shop, convo, text)
    await Message.create({
      conversationId: convo._id,
      shopId: shop._id,
      direction: 'outbound',
      senderType: 'ai',
      text,
      ...(sent.externalMessageId ? { externalMessageId: sent.externalMessageId } : {}),
      deliveryStatus: 'delivered',
      sentAt: new Date(),
      aiHandled: true,
    })
    await Conversation.updateOne(
      { _id: convo._id },
      { lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 100), unreadCount: 0, aiError: '' },
    )
  } catch (err) {
    console.warn(`[inbox] ${shop.name}: auto-reply failed for ${convo.externalThreadId}: ${err.message}`)
    await failConversation(convo, `Auto-reply failed: ${err.message}`)
  }
}

/** Syncs one shop's inbox, then answers its new buyer messages when the shop switch is on. */
async function syncAndReply(shop) {
  const { newInbound = [], ...result } = await marketplaceManager.syncInboxForShop(shop)
  result.newMessages = newInbound.length
  if (result.error || !newInbound.length) return result

  const current = await Shop.findById(shop._id)
  if (!current?.aiReplyEnabled) return result
  const latestByConversation = new Map()
  for (const item of newInbound) latestByConversation.set(String(item.conversationId), item.messageId)
  for (const [conversationId, messageId] of latestByConversation) {
    await replyToMessage(current, conversationId, messageId)
  }
  return result
}

let timer = null
let running = false
const lastErrors = new Map()

/** Production default: on. Set INBOX_AUTO_SYNC=true|false and INBOX_SYNC_MINUTES to override. */
function startInboxScheduler() {
  const enabled = process.env.INBOX_AUTO_SYNC
    ? process.env.INBOX_AUTO_SYNC === 'true'
    : process.env.NODE_ENV === 'production'
  const minutes = Number(process.env.INBOX_SYNC_MINUTES || 5)
  if (!enabled || !(minutes > 0) || timer) return

  const tick = async () => {
    if (running) return
    running = true
    try {
      const shops = await Shop.find({ status: 'connected', marketplace: { $in: Object.keys(MARKETPLACE_LABEL) } })
      for (const shop of shops) {
        const result = await syncAndReply(shop).catch((err) => ({ error: err.message }))
        const key = String(shop._id)
        if (result.error && lastErrors.get(key) !== result.error) {
          console.warn(`[inbox] ${shop.name}: ${result.error}`)
        }
        lastErrors.set(key, result.error || '')
      }
    } catch (err) {
      console.warn(`[inbox] scheduled sync failed: ${err.message}`)
    } finally {
      running = false
    }
  }

  timer = setInterval(tick, minutes * 60 * 1000)
  setTimeout(tick, 30 * 1000)
  console.log(`[inbox] Checking shop inboxes every ${minutes} minute(s)`)
}

module.exports = { syncAndReply, refreshThread, startInboxScheduler }
