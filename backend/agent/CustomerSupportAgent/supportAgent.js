/**
 * Customer Support AI Agent Core Orchestrator
 * Implements Customer_Support_AI_Agent v2 architecture:
 * Code-controlled deterministic flow + OpenAI Agents / Tools loop.
 */

const OpenAI = require('openai')
const Conversation2 = require('../../models/conversation_2')
const Message2 = require('../../models/message_2')
const limits = require('../../config/supportLimits')
const { evaluateInboundMessage, evaluateAssistantOutput } = require('./guardrails')
const {
  searchFaqPolicies,
  searchProducts,
  getProductDetails,
  getOrderDetails,
} = require('./tools')

function getOpenAIClient() {
  const apiKey = (process.env.OPENAI_API || process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('OpenAI API key is missing. Please configure OPENAI_API or OPENAI_API_KEY.')
  }
  return new OpenAI({ apiKey })
}

/**
 * Tool definitions exposed to OpenAI
 */
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'searchFaqPolicies',
      description: 'Search approved store FAQ and policies (e.g. shipping time, returns, refunds, warranty, payment options). Returns policy snippets with sourceIds.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keywords to search policies, e.g. "returns", "delivery days", "shipping cost"',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchProducts',
      description: 'Search product catalog by name, brand, or category. Returns up to 5 matching products.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Product keywords, e.g. "desk lamp", "wireless mouse"',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getProductDetails',
      description: 'Get detailed specs, price, and stock for a specific product by its ID or SKU.',
      parameters: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'The product ID or SKU',
          },
        },
        required: ['itemId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getOrderDetails',
      description: 'Look up customer order tracking status, shipping carrier, and line items.',
      parameters: {
        type: 'object',
        properties: {
          orderRef: {
            type: 'string',
            description: 'The order number, e.g. "112-2938471" or "1001"',
          },
        },
        required: ['orderRef'],
      },
    },
  },
]

/**
 * Execute a named tool call
 */
async function executeTool(name, args) {
  try {
    switch (name) {
      case 'searchFaqPolicies':
        return await searchFaqPolicies(args.query)
      case 'searchProducts':
        return await searchProducts(args.query)
      case 'getProductDetails':
        return await getProductDetails(args.itemId)
      case 'getOrderDetails':
        return await getOrderDetails(args.orderRef)
      default:
        return { error: `Unknown tool: ${name}` }
    }
  } catch (err) {
    return { error: `Tool execution failed: ${err.message}` }
  }
}

/**
 * Main Runner for the Customer Support AI Agent
 */
async function runSupportAgent({
  conversationId,
  text,
  senderName = 'Buyer',
  orderRef = '',
  marketplace = 'ebay',
  shopId = null,
}) {
  const startTime = Date.now()

  // [1] & [3] Conversation lookup or creation
  let conversation = null
  if (conversationId) {
    conversation = await Conversation2.findById(conversationId)
  }

  if (!conversation) {
    conversation = await Conversation2.create({
      marketplace: marketplace || 'ebay',
      shopId: shopId || null,
      customerName: senderName || 'Buyer',
      orderRef: orderRef || '',
      status: 'open',
      aiEnabled: true,
      lastMessageAt: new Date(),
    })
  }

  // Save the customer's message immediately before invoking the model
  const customerMessage = await Message2.create({
    conversationId: conversation._id,
    shopId: conversation.shopId,
    senderType: 'customer',
    senderName: senderName || conversation.customerName || 'Buyer',
    text: text.trim(),
    deliveryStatus: 'received',
    sentAt: new Date(),
  })

  // [4] Deterministic scope / spam gate
  const inboundCheck = evaluateInboundMessage(text, conversation)
  if (!inboundCheck.allowed) {
    let updateFields = { lastMessageAt: new Date(), lastMessagePreview: inboundCheck.fixedReply }

    if (inboundCheck.strike) {
      const newStrikes = (conversation.offTopicStrikes || 0) + 1
      updateFields.offTopicStrikes = newStrikes
      if (newStrikes >= limits.maxStrikes) {
        updateFields.status = 'locked'
        updateFields.lockedUntil = new Date(Date.now() + 60 * 60 * 1000) // 1-hour cooldown
      }
    }

    await Conversation2.findByIdAndUpdate(conversation._id, {
      $set: updateFields,
      $inc: { messageCount: 2 },
    })

    const aiMsg = await Message2.create({
      conversationId: conversation._id,
      shopId: conversation.shopId,
      senderType: 'ai',
      senderName: 'Support Assistant',
      text: inboundCheck.fixedReply,
      ai: {
        status: 'fixed_reply',
        sourceIds: [],
        toolsCalled: [],
        latencyMs: Date.now() - startTime,
        flags: [inboundCheck.flag],
      },
    })

    return {
      answer: inboundCheck.fixedReply,
      status: 'fixed_reply',
      sourceIds: [],
      toolsCalled: [],
      conversationId: conversation._id,
      messageId: aiMsg._id,
      conversationStatus: updateFields.status || conversation.status,
    }
  }

  if (inboundCheck.escalateImmediate) {
    await Conversation2.findByIdAndUpdate(conversation._id, {
      $set: {
        status: 'escalated',
        escalationReason: 'Dispute / legal keyword flagged',
        lastMessageAt: new Date(),
        lastMessagePreview: inboundCheck.fixedReply,
      },
      $inc: { messageCount: 2 },
    })

    const aiMsg = await Message2.create({
      conversationId: conversation._id,
      shopId: conversation.shopId,
      senderType: 'ai',
      senderName: 'Support Assistant',
      text: inboundCheck.fixedReply,
      ai: {
        status: 'escalate',
        sourceIds: [],
        toolsCalled: [],
        latencyMs: Date.now() - startTime,
        flags: inboundCheck.flags,
      },
    })

    return {
      answer: inboundCheck.fixedReply,
      status: 'escalate',
      sourceIds: [],
      toolsCalled: [],
      conversationId: conversation._id,
      messageId: aiMsg._id,
      conversationStatus: 'escalated',
    }
  }

  // Check if AI is manually disabled for this conversation
  if (conversation.aiEnabled === false) {
    return {
      answer: limits.fixedReplies.ai_disabled,
      status: 'fixed_reply',
      sourceIds: [],
      toolsCalled: [],
      conversationId: conversation._id,
      conversationStatus: conversation.status,
    }
  }

  // [5] Load history (last 8 messages)
  const history = await Message2.find({ conversationId: conversation._id })
    .sort({ sentAt: -1 })
    .limit(limits.historyMessages)
    .lean()

  const formattedHistory = history.reverse().map((m) => ({
    role: m.senderType === 'customer' ? 'user' : 'assistant',
    content: m.text,
  }))

  // [6] Build System Prompt and invoke OpenAI
  const systemPrompt = `You are the official Customer Support AI Assistant for our eBay & Online Store.
Strict operating guidelines:
1. Answer ONLY using verifiable information returned by the provided tools.
2. If the user asks about store policies (returns, shipping, refunds, warranties), call searchFaqPolicies.
3. If the user asks about an order (e.g. order tracking or status), call getOrderDetails with the order reference.
4. If the user asks about products, call searchProducts or getProductDetails.
5. NEVER make promises regarding refunds, discounts, cancellations, or custom delivery dates. For refund or cancellation demands, reply with status "escalate".
6. If the answer cannot be found in the tools, set status "not_found" and do NOT hallucinate or guess.
7. Keep your answer concise (under 100 words), polite, and professional.
8. ALWAYS return your final response in this exact JSON structure:
{
  "answer": "Your customer-facing response text here",
  "status": "answered" | "not_found" | "escalate",
  "sourceIds": ["policy:slug", "faq:slug", "order:ref", "item:id"]
}
Only output the JSON object. Do not include markdown code block formatting like \`\`\`json.`

  const messages = [
    { role: 'system', content: systemPrompt },
    ...formattedHistory,
  ]

  const openai = getOpenAIClient()
  const modelName = process.env.SUPPORT_AGENT_MODEL || 'gpt-5-mini'

  const executedTools = []
  const collectedSourceIds = new Set()
  let totalTokensIn = 0
  let totalTokensOut = 0

  let currentMessages = [...messages]
  let turns = 0
  let finalJson = null

  while (turns < limits.maxToolTurns) {
    turns++
    let response = null
    try {
      response = await openai.chat.completions.create({
        model: modelName,
        messages: currentMessages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        temperature: 0.2,
      })
    } catch (apiErr) {
      // Fallback to gpt-4o-mini if gpt-5-mini is unavailable on this API key tier
      console.warn(`[SupportAgent] Model ${modelName} error (${apiErr.message}). Retrying with gpt-4o-mini...`)
      response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: currentMessages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        temperature: 0.2,
      })
    }

    if (response?.usage) {
      totalTokensIn += response.usage.prompt_tokens || 0
      totalTokensOut += response.usage.completion_tokens || 0
    }

    const choice = response?.choices?.[0]
    const message = choice?.message

    if (message?.tool_calls && message.tool_calls.length > 0) {
      currentMessages.push(message)
      for (const call of message.tool_calls) {
        const toolName = call.function.name
        let args = {}
        try {
          args = JSON.parse(call.function.arguments || '{}')
        } catch {
          args = {}
        }

        executedTools.push(toolName)
        const toolResult = await executeTool(toolName, args)

        // Harvest source IDs if present
        if (Array.isArray(toolResult)) {
          toolResult.forEach((item) => {
            if (item.sourceId) collectedSourceIds.add(item.sourceId)
          })
        } else if (toolResult?.sourceId) {
          collectedSourceIds.add(toolResult.sourceId)
        }

        currentMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(toolResult),
        })
      }
    } else {
      // No more tool calls; parse final output
      const rawContent = message?.content || ''
      try {
        const cleaned = rawContent.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
        finalJson = JSON.parse(cleaned)
      } catch {
        finalJson = {
          answer: rawContent,
          status: collectedSourceIds.size > 0 ? 'answered' : 'not_found',
          sourceIds: Array.from(collectedSourceIds),
        }
      }
      break
    }
  }

  // Ensure default structure
  if (!finalJson) {
    finalJson = {
      answer: "I couldn't locate specific information for this inquiry in our store records.",
      status: 'not_found',
      sourceIds: Array.from(collectedSourceIds),
    }
  }

  // [8] Output validation (in code)
  const validation = evaluateAssistantOutput(finalJson, executedTools)
  let finalAnswer = finalJson.answer
  let finalStatus = finalJson.status
  let flags = validation.flags || []

  if (!validation.passed) {
    finalAnswer = validation.fallbackAnswer
    finalStatus = validation.sanitizedStatus
    // Update conversation to escalated so human agent picks it up
    await Conversation2.findByIdAndUpdate(conversation._id, {
      $set: { status: 'escalated', escalationReason: `Validation check: ${flags.join(', ') || 'not_found'}` },
    })
  }

  // [9] Save Assistant Message with AI trace
  const aiMessage = await Message2.create({
    conversationId: conversation._id,
    shopId: conversation.shopId,
    senderType: 'ai',
    senderName: 'Support Assistant',
    text: finalAnswer,
    deliveryStatus: 'sent',
    ai: {
      status: finalStatus,
      sourceIds: finalJson.sourceIds || Array.from(collectedSourceIds),
      toolsCalled: executedTools,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      latencyMs: Date.now() - startTime,
      flags,
    },
    sentAt: new Date(),
  })

  // Update conversation stats
  await Conversation2.findByIdAndUpdate(conversation._id, {
    $set: {
      lastMessageAt: new Date(),
      lastMessagePreview: finalAnswer.slice(0, 100),
    },
    $inc: { messageCount: 2 },
  })

  return {
    success: true,
    answer: finalAnswer,
    status: finalStatus,
    sourceIds: finalJson.sourceIds || Array.from(collectedSourceIds),
    toolsCalled: executedTools,
    latencyMs: Date.now() - startTime,
    conversationId: conversation._id,
    messageId: aiMessage._id,
    conversationStatus: !validation.passed ? 'escalated' : conversation.status,
  }
}

module.exports = {
  runSupportAgent,
}
