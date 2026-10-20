/**
 * Customer Support AI Agent Core Orchestrator
 * Implements Customer_Support_AI_Agent v2 architecture:
 * deterministic code gates -> OpenAI tool loop -> deterministic output validation.
 *
 * Sandbox scope:
 *  - conversations carry `channel: 'sandbox'`
 *  - tools are scoped to the selected shop / marketplace
 *  - buyer + seller views share the same Conversation2/Message2 records
 */

const OpenAI = require('openai')
const Conversation2 = require('../../models/conversation_2')
const Message2 = require('../../models/message_2')
const Product = require('../../models/Product')
const limits = require('../../config/supportLimits')
const { withRetry } = require('../../utils/retry')
const { evaluateInboundMessage, evaluateAssistantOutput } = require('./guardrails')
const {
  searchFaqPolicies,
  searchProducts,
  getProductDetails,
  getOrderDetails,
} = require('./tools')

const FALLBACK_MODEL = 'gpt-4o-mini'

const MARKETPLACE_LABELS = {
  ebay: 'eBay',
  tiktok_shop: 'TikTok Shop',
  temu: 'Temu',
  sandbox: 'Sandbox',
  manual: 'Manual',
}

function getOpenAIClient() {
  const apiKey = (process.env.OPENAI_API || process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('OpenAI API key is missing. Please configure OPENAI_API or OPENAI_API_KEY.')
  }
  // maxRetries: 0 because withRetry handles 429/5xx with backoff.
  return new OpenAI({ apiKey, timeout: 30000, maxRetries: 0 })
}

/**
 * Tool definitions exposed to OpenAI.
 */
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'searchFaqPolicies',
      description:
        'Search approved store FAQs and policies (shipping, returns, refunds, warranty, payment). Returns ranked snippets with sourceIds and a handling flag.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keywords to search, e.g. "returns", "delivery days", "shipping cost".',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchProducts',
      description: 'Search the active product catalog by name, brand, category, or SKU. Returns up to 5 matches.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Product keywords, e.g. "fragrance", "watch", "wireless mouse".',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getProductDetails',
      description: 'Get price, stock, category, and specs for one product by productId or SKU.',
      parameters: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'The product ID or SKU.',
          },
        },
        required: ['itemId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getOrderDetails',
      description: 'Look up one order by its marketplace order number (for example 24-15256-84153). Returns status, carrier, tracking number, and line items.',
      parameters: {
        type: 'object',
        properties: {
          orderRef: {
            type: 'string',
            description: 'The marketplace order number, with or without a leading #.',
          },
        },
        required: ['orderRef'],
        additionalProperties: false,
      },
    },
  },
]

const SUPPORT_REPLY_SCHEMA = {
  name: 'support_reply',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      status: { type: 'string', enum: ['answered', 'not_found', 'escalate'] },
      sourceIds: { type: 'array', items: { type: 'string' } },
    },
    required: ['answer', 'status', 'sourceIds'],
    additionalProperties: false,
  },
}

function buildCompletionParams(model, messages) {
  const isGpt5 = /^gpt-5/i.test(model)
  const params = {
    model,
    messages,
    tools: TOOL_DEFINITIONS,
    tool_choice: 'auto',
    response_format: { type: 'json_schema', json_schema: SUPPORT_REPLY_SCHEMA },
  }
  if (isGpt5) {
    params.max_completion_tokens = 700
    params.reasoning_effort = 'low'
  } else {
    params.max_tokens = 700
  }
  return params
}

/**
 * Calls the model with retry. If the provider rejects GPT-5-only options or
 * structured outputs, retry once with a relaxed parameter set.
 */
async function createCompletion(openai, model, messages) {
  const params = buildCompletionParams(model, messages)
  try {
    return await withRetry(() => openai.chat.completions.create(params), {
      maxAttempts: 3,
      baseDelayMs: 600,
    })
  } catch (err) {
    const status = err.status || err.statusCode
    const text = String(err.message || '')
    const relaxable =
      status === 400 &&
      /(response_format|json_schema|reasoning_effort|max_completion_tokens|max_tokens|unsupported parameter)/i.test(text)

    if (!relaxable) throw err

    const relaxed = { ...params }
    delete relaxed.response_format
    delete relaxed.reasoning_effort
    delete relaxed.max_completion_tokens
    relaxed.max_tokens = 700

    console.warn('[SupportAgent] Retrying without structured-output/GPT-5 options:', text)
    return withRetry(() => openai.chat.completions.create(relaxed), {
      maxAttempts: 2,
      baseDelayMs: 600,
    })
  }
}

/**
 * Execute a named read-only tool with the conversation's shop/marketplace scope.
 */
async function executeTool(name, args, context) {
  try {
    switch (name) {
      case 'searchFaqPolicies':
        return await searchFaqPolicies(args.query, { marketplace: context.marketplace })
      case 'searchProducts':
        return await searchProducts(args.query, { shopId: context.shopId })
      case 'getProductDetails':
        return await getProductDetails(args.itemId, { shopId: context.shopId })
      case 'getOrderDetails':
        return await getOrderDetails(args.orderRef, { shopId: context.shopId })
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return { error: `Tool execution failed: ${err.message}` }
  }
}

function collectToolState(result, sourceIds, toolState) {
  const items = Array.isArray(result) ? result : [result]
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (item.sourceId) sourceIds.add(String(item.sourceId))
    if (item.handling === 'human_required') toolState.requiresHuman = true
    if (item.handling === 'assisted') toolState.assisted = true
  }
}

function parseFinalJson(rawContent) {
  const raw = String(rawContent || '').trim()
  if (!raw) return null

  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(cleaned)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    // Fall through to plain-text fallback below.
  }

  // Relaxed mode (no structured output) may return plain text. Accept it only
  // when it is not a malformed JSON blob.
  if (raw && !raw.startsWith('{') && !raw.startsWith('[')) {
    return { answer: raw, status: null, sourceIds: null }
  }
  return null
}

/**
 * Load recent history within the configured token budget.
 * The current customer message is the newest row and is always included.
 */
async function loadHistory(conversationId) {
  const rows = await Message2.find({ conversationId })
    .sort({ sentAt: -1 })
    .limit(Math.max(limits.historyMessages * 2, 16))
    .lean()

  const selected = []
  let tokens = 0
  for (const row of rows) {
    const estimate = Math.ceil(String(row.text || '').length / 4)
    if (selected.length && tokens + estimate > limits.historyTokenBudget) break
    selected.push(row)
    tokens += estimate
  }

  return selected.reverse().map((row) => ({
    role: row.senderType === 'customer' ? 'user' : 'assistant',
    content: String(row.text || ''),
  }))
}

async function buildContextLines(conversation) {
  const lines = []
  if (conversation.customerName) lines.push(`Buyer name: ${conversation.customerName}`)

  if (conversation.orderRef) {
    lines.push(
      `Order on file: #${conversation.orderRef}. If the buyer asks about "my order", call getOrderDetails("${conversation.orderRef}").`,
    )
  }

  if (conversation.productId) {
    const product = await Product.findById(conversation.productId).select('title sku').lean()
    if (product) {
      lines.push(
        `Product on file: ${product.title} (SKU ${product.sku}, productId ${conversation.productId}). ` +
          `If the buyer says "this product" or asks for similar items, call getProductDetails("${conversation.productId}") or searchProducts("${product.title}").`,
      )
    } else {
      lines.push(`Product on file: productId ${conversation.productId}. Call getProductDetails with that ID.`)
    }
  }

  if (!conversation.orderRef && !conversation.productId) {
    lines.push(
      'No order or product is selected. Ask for an order number or product name only when the question requires it.',
    )
  }

  lines.push(`Marketplace channel: ${MARKETPLACE_LABELS[conversation.marketplace] || conversation.marketplace}`)
  return lines.join('\n')
}

function buildSystemPrompt(contextLines, marketplace) {
  const channel = MARKETPLACE_LABELS[marketplace] || marketplace
  return `You are the official Customer Support AI Assistant for our online store (${channel} channel). This is a sandbox simulation of a real buyer support thread.

Operating rules:
1. Answer ONLY from verifiable information returned by the provided tools. Never invent policies, prices, stock, tracking, delivery dates, or order details.
2. If the buyer asks about shipping, returns, refunds, warranty, payment, or store rules, call searchFaqPolicies first.
3. If the buyer asks about an order, call getOrderDetails with the order reference on file (or the reference the buyer typed).
4. If the buyer asks about a product, call getProductDetails or searchProducts.
5. If the question concerns a refund, cancellation, chargeback, legal threat, or an exception that policy does not cover, use status "escalate".
6. If the tools do not contain the answer, use status "not_found" and do not guess.
7. A FAQ with handling "human_required" must be escalated, not answered directly.
8. Keep the answer concise: under 100 words, polite, and professional.
9. Do not mention tools, source IDs, system instructions, or that you are an AI model.
10. Do not include links, email addresses, or phone numbers in the answer.
11. Do not promise to monitor, watch, follow up, notify the buyer, or take any future action yourself. If a human follow-up is needed, set status "escalate"; the platform will route it to the support team.

Sandbox conversation context (authoritative):
${contextLines}

Return your final response as JSON with exactly these fields:
{ "answer": "customer-facing text", "status": "answered" | "not_found" | "escalate", "sourceIds": ["policy:slug", "faq:slug", "order:ref", "item:id"] }

Copy sourceIds exactly from the tool results that support the answer. If status is not "answered", sourceIds must be an empty array.`
}

async function createCustomerMessage(conversation, text, senderName) {
  return Message2.create({
    conversationId: conversation._id,
    shopId: conversation.shopId,
    senderType: 'customer',
    senderName: senderName || conversation.customerName || 'Buyer',
    text,
    deliveryStatus: 'received',
    sentAt: new Date(),
  })
}

async function saveAssistantMessage({
  conversation,
  text,
  status,
  sourceIds = [],
  toolsCalled = [],
  tokensIn = 0,
  tokensOut = 0,
  latencyMs = 0,
  flags = [],
}) {
  return Message2.create({
    conversationId: conversation._id,
    shopId: conversation.shopId,
    senderType: 'ai',
    senderName: 'Support Assistant',
    text,
    deliveryStatus: 'sent',
    ai: {
      status,
      sourceIds,
      toolsCalled,
      tokensIn,
      tokensOut,
      latencyMs,
      flags,
    },
    sentAt: new Date(),
  })
}

/**
 * Save a deterministic reply, update conversation counters, and return the API shape.
 */
async function finishFixedReply({
  conversation,
  text,
  status = 'fixed_reply',
  flags = [],
  conversationUpdate = {},
  customerMessageCount = 1,
  startTime,
}) {
  const update = {
    lastMessageAt: new Date(),
    lastMessagePreview: text.slice(0, 100),
    ...conversationUpdate,
  }

  await Conversation2.findByIdAndUpdate(conversation._id, {
    $set: update,
    $inc: { messageCount: customerMessageCount + 1 },
  })

  const aiMessage = await saveAssistantMessage({
    conversation,
    text,
    status,
    flags,
    latencyMs: Date.now() - startTime,
  })

  return {
    success: true,
    answer: text,
    status,
    sourceIds: [],
    toolsCalled: [],
    latencyMs: Date.now() - startTime,
    conversationId: conversation._id,
    messageId: aiMessage._id,
    conversationStatus: update.status || conversation.status,
  }
}

/**
 * Main Runner for the Customer Support AI Agent.
 */
async function runSupportAgent({
  conversationId,
  text,
  texts,
  senderName = 'Buyer',
  persona = 'jane_doe',
  orderRef = '',
  productId = null,
  shopId = null,
  marketplace = 'ebay',
  createdBy = null,
  channel = 'sandbox',
}) {
  const startTime = Date.now()
  const messageTexts = (Array.isArray(texts) ? texts : [text])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
  if (!messageTexts.length) throw new Error('Message text is required')

  // Combined text is used only for the deterministic inbound gate. Each
  // message is still stored as its own row.
  const cleanText = messageTexts.join('\n')

  // [1] Conversation lookup or creation.
  let conversation = null
  if (conversationId) {
    conversation = await Conversation2.findById(conversationId)
  }

  if (!conversation) {
    conversation = await Conversation2.create({
      marketplace: marketplace || 'ebay',
      channel: channel || 'sandbox',
      sandboxPersona: persona || 'jane_doe',
      createdBy: createdBy || null,
      shopId: shopId || null,
      customerName: senderName || 'Buyer',
      orderRef: orderRef || '',
      productId: productId || null,
      status: 'open',
      aiEnabled: true,
      lastMessageAt: new Date(),
    })
  } else {
    const updates = { channel: channel || conversation.channel || 'sandbox' }
    if (senderName) updates.customerName = senderName
    if (!conversation.sandboxPersona) updates.sandboxPersona = persona || 'jane_doe'
    if (orderRef !== undefined && orderRef !== null) updates.orderRef = String(orderRef)
    if (productId !== undefined) updates.productId = productId || null
    if (shopId) updates.shopId = shopId
    if (marketplace) updates.marketplace = marketplace
    if (createdBy && !conversation.createdBy) updates.createdBy = createdBy

    // Expire an old lock automatically so the buyer can try again.
    if (conversation.status === 'locked') {
      const lockedUntil = conversation.lockedUntil ? new Date(conversation.lockedUntil) : null
      if (!lockedUntil || lockedUntil <= new Date()) {
        updates.status = 'open'
        updates.lockedUntil = null
        updates.offTopicStrikes = 0
      }
    }

    await Conversation2.findByIdAndUpdate(conversation._id, { $set: updates })
    Object.assign(conversation, updates)
  }

  // Save every customer message immediately, before any model call.
  const customerMessages = []
  for (const messageText of messageTexts) {
    customerMessages.push(await createCustomerMessage(conversation, messageText, senderName))
  }
  const customerMessageCount = customerMessages.length

  // [2] Hard message cap.
  if ((conversation.messageCount || 0) + customerMessageCount > limits.maxMessagesPerConversation) {
    return finishFixedReply({
      conversation,
      text: limits.fixedReplies.locked,
      flags: ['message_limit'],
      conversationUpdate: {
        status: 'locked',
        lockedUntil: new Date(Date.now() + limits.maxMessagesLockDurationMs),
        escalationReason: 'Conversation message limit reached',
      },
      customerMessageCount,
      startTime,
    })
  }

  // [4] Deterministic scope / spam gate.
  // If every message in the batch is only a greeting or acknowledgement, reply
  // with the canned small-talk response instead of paying for an AI turn.
  const perMessageChecks = messageTexts.map((messageText) =>
    evaluateInboundMessage(messageText, conversation),
  )
  const allSmallTalk = perMessageChecks.every(
    (check) => !check.allowed && (check.flag === 'greeting' || check.flag === 'courtesy'),
  )
  if (allSmallTalk) {
    const smallTalk =
      perMessageChecks.find((check) => check.flag === 'greeting') || perMessageChecks[0]
    return finishFixedReply({
      conversation,
      text: smallTalk.fixedReply,
      flags: [smallTalk.flag],
      customerMessageCount,
      startTime,
    })
  }

  const inboundCheck = evaluateInboundMessage(cleanText, conversation)
  if (!inboundCheck.allowed) {
    if (inboundCheck.flag === 'conversation_locked') {
      return finishFixedReply({
        conversation,
        text: inboundCheck.fixedReply,
        flags: [inboundCheck.flag],
        customerMessageCount,
        startTime,
      })
    }

    const conversationUpdate = {}
    if (inboundCheck.strike) {
      const newStrikes = (conversation.offTopicStrikes || 0) + 1
      conversationUpdate.offTopicStrikes = newStrikes
      if (newStrikes >= limits.maxStrikes) {
        conversationUpdate.status = 'locked'
        conversationUpdate.lockedUntil = new Date(Date.now() + limits.lockDurationMs)
        conversationUpdate.escalationReason = 'Repeated invalid or off-topic messages'
      }
    }

    return finishFixedReply({
      conversation,
      text: inboundCheck.fixedReply,
      flags: [inboundCheck.flag],
      conversationUpdate,
      customerMessageCount,
      startTime,
    })
  }

  if (inboundCheck.escalateImmediate) {
    return finishFixedReply({
      conversation,
      text: inboundCheck.fixedReply,
      status: 'escalate',
      flags: inboundCheck.flags || [],
      conversationUpdate: {
        status: 'escalated',
        escalationReason: 'Dispute or legal keyword flagged',
      },
      customerMessageCount,
      startTime,
    })
  }

  // Human has taken over this conversation.
  if (conversation.aiEnabled === false) {
    return finishFixedReply({
      conversation,
      text: limits.fixedReplies.ai_disabled,
      flags: ['ai_disabled'],
      customerMessageCount,
      startTime,
    })
  }

  // [5] Load history within the token budget.
  const formattedHistory = await loadHistory(conversation._id)

  // [6] Build the system prompt with sandbox order/product context.
  const contextLines = await buildContextLines(conversation)
  const systemPrompt = buildSystemPrompt(contextLines, conversation.marketplace)
  const messages = [{ role: 'system', content: systemPrompt }, ...formattedHistory]

  let openai
  try {
    openai = getOpenAIClient()
  } catch (err) {
    console.error('[SupportAgent] OpenAI client unavailable:', err.message)
    return finishFixedReply({
      conversation,
      text: limits.fixedReplies.escalated,
      status: 'escalate',
      flags: ['openai_unavailable'],
      conversationUpdate: {
        status: 'escalated',
        escalationReason: 'AI provider unavailable',
      },
      customerMessageCount,
      startTime,
    })
  }

  // [7] Tool loop + structured output.
  let activeModel = process.env.SUPPORT_AGENT_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini'
  const executedTools = []
  const collectedSourceIds = new Set()
  const toolState = { requiresHuman: false, assisted: false }
  const toolContext = { shopId: conversation.shopId, marketplace: conversation.marketplace }

  let totalTokensIn = 0
  let totalTokensOut = 0
  let finalJson = null
  const currentMessages = [...messages]
  let turns = 0

  try {
    while (turns < limits.maxToolTurns) {
      turns++

      let response
      try {
        response = await createCompletion(openai, activeModel, currentMessages)
      } catch (err) {
        const status = err.status || err.statusCode
        const modelIssue = status === 404 || status === 400
        if (activeModel !== FALLBACK_MODEL && modelIssue) {
          console.warn(`[SupportAgent] ${activeModel} failed (${err.message}). Falling back to ${FALLBACK_MODEL}.`)
          activeModel = FALLBACK_MODEL
          response = await createCompletion(openai, activeModel, currentMessages)
        } else {
          throw err
        }
      }

      if (response?.usage) {
        totalTokensIn += response.usage.prompt_tokens || 0
        totalTokensOut += response.usage.completion_tokens || 0
      }

      const message = response?.choices?.[0]?.message
      if (!message) {
        finalJson = null
        break
      }

      if (message.tool_calls?.length) {
        currentMessages.push(message)
        for (const call of message.tool_calls) {
          const toolName = call.function?.name
          let args = {}
          try {
            args = JSON.parse(call.function?.arguments || '{}')
          } catch {
            args = {}
          }

          executedTools.push(toolName)
          const toolResult = await executeTool(toolName, args, toolContext)
          collectToolState(toolResult, collectedSourceIds, toolState)

          currentMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(toolResult),
          })
        }
        continue
      }

      finalJson = parseFinalJson(message.content)
      break
    }
  } catch (err) {
    console.error('[SupportAgent] Model/tool loop failed:', err)
    return finishFixedReply({
      conversation,
      text: limits.fixedReplies.escalated,
      status: 'escalate',
      flags: ['model_error'],
      conversationUpdate: {
        status: 'escalated',
        escalationReason: `AI provider error: ${String(err.message || err).slice(0, 160)}`,
      },
      customerMessageCount,
      startTime,
    })
  }

  if (!finalJson) {
    finalJson = {
      answer: '',
      status: 'not_found',
      sourceIds: [],
    }
  }

  // [8] Output validation.
  const validation = evaluateAssistantOutput(finalJson, {
    collectedSourceIds: Array.from(collectedSourceIds),
    requiresHuman: toolState.requiresHuman,
    assisted: toolState.assisted,
  })

  let finalAnswer = finalJson.answer
  let finalStatus = finalJson.status
  let finalSourceIds = Array.isArray(finalJson.sourceIds) ? finalJson.sourceIds.map(String) : []
  let flags = validation.flags || []

  if (!validation.passed) {
    finalAnswer = validation.fallbackAnswer
    finalStatus = validation.sanitizedStatus
    finalSourceIds = []
  } else if (finalStatus === 'answered') {
    finalSourceIds = Array.from(new Set(finalSourceIds))
    if (!finalAnswer.includes('Customer Care Team')) {
      finalAnswer = `${finalAnswer}\n\n${limits.signOff}`
    }
  }

  const conversationUpdate = {
    lastMessageAt: new Date(),
    lastMessagePreview: String(finalAnswer).slice(0, 100),
  }
  if (!validation.passed) {
    conversationUpdate.status = 'escalated'
    conversationUpdate.escalationReason = `Validation: ${flags.join(', ') || 'unverified answer'}`
  } else if (conversation.status === 'closed') {
    conversationUpdate.status = 'open'
  }

  // [9] Save the assistant message with its AI trace.
  const aiMessage = await saveAssistantMessage({
    conversation,
    text: finalAnswer,
    status: finalStatus,
    sourceIds: finalSourceIds,
    toolsCalled: executedTools,
    tokensIn: totalTokensIn,
    tokensOut: totalTokensOut,
    latencyMs: Date.now() - startTime,
    flags,
  })

  await Conversation2.findByIdAndUpdate(conversation._id, {
    $set: conversationUpdate,
    $inc: { messageCount: customerMessageCount + 1 },
  })

  return {
    success: true,
    answer: finalAnswer,
    status: finalStatus,
    sourceIds: finalSourceIds,
    toolsCalled: executedTools,
    latencyMs: Date.now() - startTime,
    conversationId: conversation._id,
    messageId: aiMessage._id,
    conversationStatus: conversationUpdate.status || conversation.status,
  }
}

module.exports = {
  runSupportAgent,
}
