/**
 * Deterministic Guardrails & Scope Gate
 * Implements Stage [1], [4], and [8] of Customer_Support_AI_Agent v2 architecture.
 * Evaluates inputs and outputs in pure code without burning LLM tokens.
 */

const limits = require('../../config/supportLimits')

// Patterns for spam and off-platform redirection (Strictly forbidden on eBay & e-commerce)
const SPAM_LINK_REGEX = /(https?:\/\/|www\.|\.xyz|\.ru|\.top|t\.me\/|wa\.me\/|discord\.gg\/)/i
const CRYPTO_SPAM_REGEX = /(crypto|bitcoin|forex|free gift card|cash app|send eth|invest now)/i
const PROMPT_INJECTION_REGEX =
  /(ignore\s+(all\s+)?(previous|prior)\s+instructions|system\s+prompt|reveal\s+your\s+prompt|disregard\s+rules|you\s+are\s+now\s+in\s+dan\s+mode|roleplay\s+as)/i

// Keywords that indicate legal dispute, chargeback, or immediate escalation
const DISPUTE_REGEX = /(chargeback|lawyer|attorney|sue\s+you|stolen\s+card|fraudulent\s+charge|report\s+to\s+police)/i

/**
 * Validate customer inbound message before LLM execution
 */
function evaluateInboundMessage(text, conversation) {
  const flags = []

  // Check 1: Length check
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      allowed: false,
      flag: 'empty_message',
      fixedReply: 'Please provide a question or message so we can assist you.',
    }
  }

  const cleanText = text.trim()
  if (cleanText.length > limits.maxMessageChars) {
    return {
      allowed: false,
      flag: 'too_long',
      fixedReply: `Your message exceeds the maximum allowed length (${limits.maxMessageChars} characters). Please shorten your inquiry.`,
    }
  }

  // Check 2: Conversation lock check
  if (conversation?.status === 'locked' || (conversation?.lockedUntil && new Date(conversation.lockedUntil) > new Date())) {
    return {
      allowed: false,
      flag: 'conversation_locked',
      fixedReply: limits.fixedReplies.locked,
    }
  }

  // Check 3: External link / phishing spam
  if (SPAM_LINK_REGEX.test(cleanText) || CRYPTO_SPAM_REGEX.test(cleanText)) {
    flags.push('spam')
    return {
      allowed: false,
      strike: true,
      flag: 'spam',
      fixedReply: limits.fixedReplies.spam,
    }
  }

  // Check 4: Prompt injection detection
  if (PROMPT_INJECTION_REGEX.test(cleanText)) {
    flags.push('prompt_injection')
    return {
      allowed: false,
      strike: true,
      flag: 'prompt_injection',
      fixedReply: limits.fixedReplies.off_topic,
    }
  }

  // Check 5: Severe dispute / legal escalation (Does not consume model tokens; escalates cleanly)
  if (DISPUTE_REGEX.test(cleanText)) {
    flags.push('dispute')
    return {
      allowed: true, // we still proceed to record it, but flag it for immediate escalation
      escalateImmediate: true,
      flags,
      fixedReply:
        "Your message regarding this dispute has been prioritized and routed directly to our senior management team for immediate review.",
    }
  }

  return {
    allowed: true,
    flags,
  }
}

/**
 * Validate AI Assistant output before sending to customer
 * (Stage [8] Output Validation)
 */
function evaluateAssistantOutput(output, executedTools = []) {
  const errors = []
  const { answer = '', status = 'not_found', sourceIds = [] } = output

  // Rule 1: If answered, sourceIds must not be empty
  if (status === 'answered' && (!Array.isArray(sourceIds) || sourceIds.length === 0)) {
    errors.push('no_evidence')
  }

  // Rule 2: Word limit check (~120 words)
  const wordCount = answer.trim().split(/\s+/).filter(Boolean).length
  if (wordCount > limits.maxReplyWords + 30) {
    errors.push('too_long')
  }

  // Rule 3: Blocked promise phrases ("we guarantee", "full refund", etc.)
  const lowerAnswer = answer.toLowerCase()
  for (const phrase of limits.blockedPromisePhrases) {
    if (lowerAnswer.includes(phrase)) {
      errors.push(`blocked_phrase:${phrase}`)
      break
    }
  }

  // Rule 4: If status is escalate or not_found, use sanitized fallback
  if (status === 'escalate' || status === 'not_found' || errors.length > 0) {
    return {
      passed: false,
      sanitizedStatus: status === 'answered' ? 'escalate' : status,
      flags: errors,
      fallbackAnswer:
        "I've passed this inquiry to our customer support team so they can review the details and follow up with you directly.",
    }
  }

  return {
    passed: true,
    flags: [],
  }
}

module.exports = {
  evaluateInboundMessage,
  evaluateAssistantOutput,
}
