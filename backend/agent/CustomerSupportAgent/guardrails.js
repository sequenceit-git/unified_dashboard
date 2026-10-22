/**
 * Deterministic guardrails and scope gate.
 * Implements stages [1], [4] and [8] of the support architecture.
 * All checks here are pure code and cost zero model tokens.
 */

const limits = require('../../config/supportLimits')

// Links and known spam/phishing patterns.
const SPAM_LINK_REGEX = /(https?:\/\/|www\.|\.xyz|\.ru|\.top|t\.me\/|wa\.me\/|discord\.gg\/)/i
const CRYPTO_SPAM_REGEX =
  /(crypto\s*(giveaway|investment|offer)|bitcoin\s*(giveaway|investment)|forex|free gift card|cash app|send eth|invest now)/i
const PROMPT_INJECTION_REGEX =
  /(ignore\s+(all\s+)?(previous|prior)\s+instructions|system\s+prompt|reveal\s+your\s+prompt|disregard\s+rules|you\s+are\s+now\s+in\s+dan\s+mode|roleplay\s+as)/i

// Legal dispute, chargeback, or immediate escalation.
const DISPUTE_REGEX =
  /(chargeback|lawyer|attorney|sue\s+you|stolen\s+card|fraudulent\s+charge|report\s+to\s+police)/i

// Pure greetings/acknowledgements do not need a model call or evidence.
const GREETING_REGEX = /^(hello|hi|hey|good morning|good afternoon|good evening)(\s+there)?(\s*,?\s*how are you\??)?[!. ]*$/i
const COURTESY_REGEX = /^(thanks|thank you|thx|ok|okay|great|perfect|got it|understood|bye|goodbye)[,!. ]*((so|very)\s+much)?(thanks)?[,!. ]*(bye|goodbye)?[!. ]*$/i

// eBay forbids taking buyers off-platform. Block links, emails and phone numbers
// in the assistant's answer. Order numbers are not phone numbers.
const EXTERNAL_CONTACT_REGEX =
  /(https?:\/\/|www\.|[\w.+-]+@[\w-]+\.[a-z]{2,}|\+?\d{1,3}[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/i

const VALID_STATUSES = new Set(['answered', 'not_found', 'escalate'])

function isLockActive(conversation) {
  if (!conversation) return false
  const lockedUntil = conversation.lockedUntil ? new Date(conversation.lockedUntil) : null
  if (lockedUntil && lockedUntil > new Date()) return true
  // Backwards compatibility for conversations locked before lockedUntil existed.
  return conversation.status === 'locked' && !lockedUntil
}

/**
 * Validate the customer's inbound message before any model call.
 */
function evaluateInboundMessage(text, conversation) {
  const flags = []

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

  if (isLockActive(conversation)) {
    return {
      allowed: false,
      flag: 'conversation_locked',
      fixedReply: limits.fixedReplies.locked,
    }
  }

  if (GREETING_REGEX.test(cleanText)) {
    return {
      allowed: false,
      flag: 'greeting',
      fixedReply: limits.fixedReplies.greeting,
    }
  }

  if (COURTESY_REGEX.test(cleanText)) {
    return {
      allowed: false,
      flag: 'courtesy',
      fixedReply: limits.fixedReplies.courtesy,
    }
  }

  if (SPAM_LINK_REGEX.test(cleanText) || CRYPTO_SPAM_REGEX.test(cleanText)) {
    flags.push('spam')
    return {
      allowed: false,
      strike: true,
      flag: 'spam',
      fixedReply: limits.fixedReplies.spam,
    }
  }

  if (PROMPT_INJECTION_REGEX.test(cleanText)) {
    flags.push('prompt_injection')
    return {
      allowed: false,
      strike: true,
      flag: 'prompt_injection',
      fixedReply: limits.fixedReplies.off_topic,
    }
  }

  if (DISPUTE_REGEX.test(cleanText)) {
    flags.push('dispute')
    return {
      allowed: true,
      escalateImmediate: true,
      flags,
      fixedReply: limits.fixedReplies.escalated,
    }
  }

  return { allowed: true, flags }
}

/**
 * Validate the assistant output before it is shown to the buyer.
 *
 * `context.collectedSourceIds` is the set of source IDs actually returned by
 * tools in this run. Any source ID the model invented is rejected.
 */
function evaluateAssistantOutput(output, context = {}) {
  const {
    collectedSourceIds = [],
    requiresHuman = false,
    assisted = false,
  } = context

  const flags = []
  const answer = typeof output?.answer === 'string' ? output.answer.trim() : ''
  const status = output?.status
  const sourceIds = Array.isArray(output?.sourceIds) ? output.sourceIds.map(String) : []

  if (requiresHuman) flags.push('human_required_source')
  if (!VALID_STATUSES.has(status)) flags.push('invalid_status')
  if (!answer) flags.push('empty_answer')

  const wordCount = answer.split(/\s+/).filter(Boolean).length
  if (wordCount > limits.maxReplyWords) flags.push('too_long')

  const lowerAnswer = answer.toLowerCase()
  for (const phrase of limits.blockedPromisePhrases) {
    if (lowerAnswer.includes(phrase)) {
      flags.push(`blocked_phrase:${phrase}`)
      break
    }
  }

  if (EXTERNAL_CONTACT_REGEX.test(answer)) {
    flags.push('external_contact')
  }

  if (status === 'answered') {
    if (!sourceIds.length) {
      flags.push('no_evidence')
    } else {
      const allowed = new Set(collectedSourceIds.map(String))
      if (!allowed.size) {
        flags.push('no_evidence')
      } else if (sourceIds.some((id) => !allowed.has(id))) {
        flags.push('unknown_source')
      }
    }
  }

  if (status === 'not_found' || status === 'escalate') {
    flags.push(`status_${status}`)
  }

  // Assisted answers are allowed but must be visible to the seller for review.
  if (assisted) flags.push('assisted_source')

  const hardFailures = flags.filter((flag) => flag !== 'assisted_source')
  if (hardFailures.length > 0) {
    return {
      passed: false,
      // Every validation failure ends with a human follow-up, so the
      // conversation and the stored AI message are both marked escalated.
      sanitizedStatus: 'escalate',
      flags,
      fallbackAnswer: limits.fixedReplies.escalated,
    }
  }

  return {
    passed: true,
    sanitizedStatus: status,
    flags,
  }
}

module.exports = {
  evaluateInboundMessage,
  evaluateAssistantOutput,
}
