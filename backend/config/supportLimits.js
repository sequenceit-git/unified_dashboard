/**
 * Customer Support AI Agent limits and configuration rules
 * (Customer_Support_AI_Agent v2)
 */
module.exports = {
  maxMessageChars: 800,
  maxMessagesPerConversation: 40,
  rateLimit: {
    perSessionPerMin: 10,
    perSessionPerHour: 40,
    perIpPerMin: 30,
  },
  maxStrikes: 3,
  historyMessages: 8,
  historyTokenBudget: 1500,
  maxReplyWords: 120,
  maxToolTurns: 3,
  blockedPromisePhrases: [
    'we guarantee',
    'i guarantee',
    'full refund',
    '100% refund',
    'i promise',
    'we promise',
    'free replacement',
    'discount code',
  ],
  signOff: 'Best regards,\nCustomer Care Team',
  fixedReplies: {
    spam: "I can only assist with verified product, order, shipping, and store policy inquiries.",
    off_topic: "I am a dedicated store customer support assistant. I can only help with our products, orders, shipping, and store policies.",
    locked: "This conversation has been temporarily locked due to repeated invalid requests. Please contact customer support directly or try again later.",
    escalated: "I've passed your request to our senior support team. A representative will review this and follow up with you shortly.",
    ai_disabled: "AI assistance is currently paused for this conversation. A human support specialist will assist you.",
  },
}
