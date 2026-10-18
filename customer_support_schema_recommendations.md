# Slim Support Chat Schemas (v1)

Goal: the smallest schema that supports the architecture in `Customer_Support_AI_Agent_v2.md`. Anything not used by the flow is left out and can be added later. `SupportPolicy`, `SupportFaq`, `Product` and `Order` stay as they are.

Removed vs the earlier proposal: `primaryIntent`, `sentiment`, `handlingMode` (merged into `aiEnabled`), `unreadCount`, `productId`, card fields, `confidenceScore`, draft mode, and the `SupportAgentConfig` model (use a config file or env vars for now).

---

## 1. `Conversation.js`

```javascript
const mongoose = require('mongoose')

const conversationSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    marketplace: { type: String, enum: ['ebay', 'sandbox', 'manual'], required: true },

    // Who the customer is. Store eBay's stable user ID if you get one; do not rely on username.
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    externalUserId: { type: String },            // eBay user ID or username as returned by the adapter

    // Link to the marketplace thread / order (set by the eBay adapter)
    externalThreadId: { type: String },          // eBay conversationId
    externalThreadType: { type: String },        // eBay conversationType (FROM_MEMBERS / FROM_EBAY)
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    listingRef: { type: String },                // eBay item ID if the thread is about a listing

    // Lifecycle
    status: { type: String, enum: ['open', 'escalated', 'closed', 'locked'], default: 'open' },
    aiEnabled: { type: Boolean, default: true }, // a human can switch the bot off for this chat

    // Guardrail + escalation
    offTopicStrikes: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    escalationReason: { type: String },

    // History helpers
    summary: { type: String, default: '' },      // optional rolling summary (background job)
    messageCount: { type: Number, default: 0 },
    lastMessageAt: { type: Date },
    slaDueAt: { type: Date },                    // only if you track response-time metrics
  },
  { timestamps: true }
)

conversationSchema.index(
  { shopId: 1, externalThreadId: 1 },
  { unique: true, partialFilterExpression: { externalThreadId: { $type: 'string' } } }
)
conversationSchema.index({ shopId: 1, status: 1, lastMessageAt: -1 })
conversationSchema.index({ customerId: 1, status: 1 })

module.exports = mongoose.model('Conversation', conversationSchema, 'conversations')
```

---

## 2. `Message.js`

```javascript
const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },

    senderType: { type: String, enum: ['customer', 'ai', 'agent', 'system'], required: true },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // human agent
    text: { type: String, required: true },
    attachments: [{ type: String }],             // URLs, only if you support media

    // Marketplace link (set by the adapter)
    externalMessageId: { type: String },
    deliveryStatus: { type: String, enum: ['received', 'sent', 'failed'], default: 'sent' },

    // AI trace: filled only for senderType 'ai'
    ai: {
      status: { type: String, enum: ['answered', 'not_found', 'escalate', 'fixed_reply'] },
      sourceIds: [{ type: String }],             // faq / policy / product IDs used as evidence
      toolsCalled: [{ type: String }],           // tool names only
      tokensIn: { type: Number },
      tokensOut: { type: Number },
      latencyMs: { type: Number },
      flags: [{ type: String }],                 // 'spam', 'off_topic', 'blocklist_hit', 'no_evidence', 'too_long'
    },

    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

messageSchema.index({ conversationId: 1, sentAt: -1 })
messageSchema.index(
  { shopId: 1, externalMessageId: 1 },
  { unique: true, partialFilterExpression: { externalMessageId: { $type: 'string' } } }
)

module.exports = mongoose.model('Message', messageSchema, 'messages')
```

Notes:
- `direction` was dropped: it is implied by `senderType` (`customer` = inbound, everything else = outbound).
- Optional debug field: `rawPayload: Mixed` (with a TTL job) if you want to keep eBay's original response while integrating.

---

## 3. Config (not a DB model for now)

```javascript
// config/supportLimits.js
module.exports = {
  maxMessageChars: 800,
  maxMessagesPerConversation: 40,
  rateLimit: { perSessionPerMin: 10, perSessionPerHour: 40, perIpPerMin: 30 },
  maxStrikes: 3,
  historyMessages: 8,
  historyTokenBudget: 1500,
  maxReplyWords: 120,
  maxToolTurns: 3,
  blockedPromisePhrases: ['we guarantee', 'full refund', 'i promise', 'free replacement'],
  signOff: 'Best regards,\nCustomer Care Team',
}
```

Move this into a DB model only when the client needs to edit it from the UI.

---

## 4. eBay adapter mapping

Your schema is the source of truth. The adapter translates eBay data into it on the way in, and back to eBay on the way out. The agent never sees eBay-shaped data.

Based on eBay's current docs (checked October 2026). eBay's newer REST **Message API** (`/commerce/message/v1`, scope `commerce.message`) is the one to build on. The older Trading API calls (`GetMyMessages`, `GetMemberMessages`, `AddMemberMessageRTQ`, `AddMemberMessageAAQToPartner`) still exist, and eBay describes the Message API as their modern alternative.

| eBay Message API | Your schema | Note |
|---|---|---|
| `conversationId` | `Conversation.externalThreadId` | unique per shop |
| `conversationType` (`FROM_MEMBERS`, `FROM_EBAY`) | `Conversation.externalThreadType` | the bot should only reply to `FROM_MEMBERS`; ignore `FROM_EBAY` (system notices) |
| `reference` (type `LISTING`, id = item ID) | `Conversation.listingRef` | only the `LISTING` reference type is supported today |
| other party username / user ID | `Conversation.externalUserId` | see warning below |
| `conversationStatus` (`ACTIVE`, `ARCHIVED`, `DELETED`, `READ`, `UNREAD`) | not stored 1:1 | use only to decide what to poll; map to your own `status` |
| message text | `Message.text` | |
| message media | `Message.attachments` | optional |
| message ID (confirm field name in spec) | `Message.externalMessageId` | dedupe key |
| `sendMessage` request: `conversationId` or `otherPartyUsername`, `messageText`, optional `messageMedia`, `reference` | built from your outbound `Message` | one of `conversationId` / `otherPartyUsername` is required |

How the adapter works:
- **Polling:** `GET /commerce/message/v1/conversation` with `conversation_type=FROM_MEMBERS`, plus `conversation_status=UNREAD`, `start_time`, `limit` (default 25, max 50) and `offset`. Then `GET /conversation/{id}` for the messages. Upsert by `externalThreadId` and `externalMessageId` so re-polls never duplicate.
- **Replying:** `POST /send_message` with `conversationId` and `messageText`. Save your `Message` with `deliveryStatus: 'sent'` or `'failed'`. After a reply, call `updateConversation` to mark it read.
- **Notifications:** eBay's Notification API has a `MyMessagesM2MMessage` topic for inbound member messages, which can replace some polling if you set it up.

Warnings to design around:
1. **Usernames are going away for US users.** Per eBay's data handling update, effective September 26, 2025, select developers no longer receive usernames for US users and get an immutable user ID instead. So use `externalUserId` as the key, never assume a readable username, and do not use the username for matching to your `Customer` records.
2. **Plain text only.** In the Trading API, HTML in the message body causes an error. Keep replies as plain text, and strip HTML from FAQ and product text before it reaches the reply.
3. **eBay filters content.** Replies must not contain external links, emails or phone numbers. Add that to the validation step.
4. **Order messaging window.** On the Trading API, order-partner messages are allowed up to 90 days after the order line item is created. Check whether a similar limit applies to the Message API.
5. **Response fields.** The message-level response fields (IDs, timestamps, sender) are defined in eBay's OpenAPI spec at `developer.ebay.com/develop/api/spec/message_api.json`. Confirm the exact names there before writing the mapper.
6. **Rate limits and access.** Call limits are listed on eBay's API Call Limits page. Check that your app keyset has the `commerce.message` scope approved for production.
