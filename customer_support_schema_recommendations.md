# Customer Support AI Agent — Database Schema Architecture & Recommendations

This document compares the messaging schemas of **TikTok Shop**, **eBay**, and **Temu**, audits our current MongoDB models in `backend/models/`, and outlines the exact schema enhancements required to implement the architecture defined in [`Customer_Support_AI_Agent.md`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/Customer_Support_AI_Agent.md).

---

## 1. Marketplace Chat & Messaging Schema Analysis

Each target marketplace has specific messaging models, constraints, and audit requirements:

### A. TikTok Shop (TTS Customer Service OpenAPI)

TikTok Shop uses an asynchronous conversational model with strict SLAs (24h response rate SLA):

- **Entities**:
  - `conversation_id`: Canonical thread identifier between buyer and seller.
  - `message_id`: Unique identifier per message.
  - `message_type`: `TEXT`, `IMAGE`, `PRODUCT_CARD`, `ORDER_CARD`, `SYSTEM_NOTICE`.
  - `sender_role`: `BUYER`, `SELLER`, `BOT`, `SYSTEM`.
  - `agent_mode`: Human agent vs. Automated Bot.
  - `card_content`: Rich structured JSON (e.g., product preview with SKU, price, stock; order tracking status).
  - `read_status`: `READ`, `UNREAD`, `DELIVERED`.
- **Key Constraints**: Requires recording whether a reply was human or automated bot; strict timeouts on SLA response calculations.

### B. eBay (Post-Order & Member-to-Member Messaging / Communication APIs)

eBay separates communications into **Member-to-Member (M2M)** and **Post-Order Resolution/Inquiries**:

- **Entities**:
  - `messageId` / `externalMessageId`: Unique message ID.
  - `recipientId` / `sender`: eBay user ID or pseudo-anonymized alias.
  - `itemId` / `legacyItemId`: Attached eBay listing ID.
  - `orderId`: Transaction / Order reference (required for post-order inquiries like INR - Item Not Received, Returns).
  - `messageMedia`: Attachments (limited file formats: PNG, JPG, PDF).
  - `messageType`: `ASK_SELLER_QUESTION`, `RESPONSE_TO_INQUIRY`, `CONTACT_EBAY_MEMBER`, `DISPUTE_MESSAGE`.
- **Key Constraints**: eBay actively filters PII, off-platform URLs, and emails. Outbound AI messages must not contain disallowed contact links.

### C. Temu (Seller Central Messaging & Dispute System)

Temu treats customer service through high-speed service tickets, seller-buyer instant messages, and return/after-sales tickets:

- **Entities**:
  - `session_id` / `ticket_id`: Chat session or dispute ticket.
  - `buyer_id_enc`: Anonymized buyer token.
  - `goods_id` / `sku_id`: Product SKU being referenced.
  - `sub_order_sn`: Specific line item order number.
  - `content_type`: `0` (text), `1` (image), `2` (system notice).
  - `risk_status`: Fraud/spam flag flagged by Temu's platform filter.

---

## 2. Gap Analysis of Current `backend/models/`

| Existing Model | Current State | Missing for AI Support Agent |
| :--- | :--- | :--- |
| [`Conversation.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/models/Conversation.js) | Minimal: `shopId`, `marketplace`, `customerId`, `orderId`, `status` (`open`/`closed`), `aiEnabled` | **Missing**: Active session intent/topic, SLA deadline (`slaDueAt`), sentiment score, escalation state (`auto`, `assisted`, `human_escalated`), and context flags. |
| [`Message.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/models/Message.js) | Standard: `direction`, `senderType` (`customer`/`ai`/`agent`), `text`, `deliveryStatus` | **Missing**: AI run metadata (`aiRunMetadata`: prompt tokens, latency, matched FAQ/Policy codes, confidence score, tool calls used, hallucination check status). |
| [`SupportPolicy.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/models/SupportPolicy.js) | High quality: `code`, `rules`, `marketplaces`, `summary`, `exceptions` | Ready to be queried as a Read-Only tool. |
| [`SupportFaq.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/models/SupportFaq.js) | High quality: `code`, `question`, `answer`, `handling`, `relatedPolicyCodes` | Ready to be queried as a Read-Only tool. |
| [`Product.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/models/Product.js) & [`Order.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/models/Order.js) | Complete | Ready for read-only agent tools (`searchProducts`, `getOrderDetails`). |

---

## 3. Recommended New & Updated Schemas

To implement the architecture in `Customer_Support_AI_Agent.md`, we recommend:

1. **Enhancing `Conversation.js`** with support lifecycle and escalation fields.
2. **Enhancing `Message.js`** with rich message payload and AI trace metadata.
3. **Adding a New Model**: `SupportAgentAudit.js` (or embedding run logs into messages for tracking prompt iterations, safety violations, and SLA compliance).

---

### Schema 1: Enhanced `Conversation.js`

```javascript
const mongoose = require('mongoose')

const conversationSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
    marketplace: { type: String, enum: ['ebay', 'tiktok_shop', 'temu', 'sandbox', 'manual'], required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    externalThreadId: { type: String, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    
    // Conversation Lifecycle & AI Routing
    status: { 
      type: String, 
      enum: ['open', 'pending_customer', 'pending_agent', 'resolved', 'closed'], 
      default: 'open' 
    },
    handlingMode: {
      type: String,
      enum: ['auto', 'assisted', 'human_only'],
      default: 'auto',
      // 'auto': AI replies immediately
      // 'assisted': AI creates a draft; human must click send
      // 'human_only': AI is disabled for this conversation
    },
    aiEnabled: { type: Boolean, default: true },
    
    // Agent Topic & Context
    primaryIntent: { 
      type: String, 
      enum: [
        'order_status', 
        'item_not_received', 
        'return_refund', 
        'product_inquiry', 
        'cancellation', 
        'shipping_address_change', 
        'general', 
        'spam_out_of_scope'
      ], 
      default: 'general' 
    },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative', 'urgent'], default: 'neutral' },
    
    // SLA & Compliance (Crucial for TikTok 24h & eBay response time metrics)
    slaDueAt: { type: Date },
    lastCustomerMessageAt: { type: Date },
    lastMessageAt: { type: Date },
    lastMessagePreview: { type: String },
    unreadCount: { type: Number, default: 0 },
    
    // Escalation flag
    escalated: { type: Boolean, default: false },
    escalationReason: { type: String },
  },
  { timestamps: true }
)

conversationSchema.index({ shopId: 1, externalThreadId: 1 }, { unique: true, sparse: true })
conversationSchema.index({ shopId: 1, status: 1, lastMessageAt: -1 })
conversationSchema.index({ handlingMode: 1, status: 1 })
conversationSchema.index({ customerId: 1 })
conversationSchema.index({ orderId: 1 })

module.exports = mongoose.model('Conversation', conversationSchema, 'conversations')
```

---

### Schema 2: Enhanced `Message.js`

```javascript
const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    senderType: { 
      type: String, 
      enum: ['customer', 'ai', 'agent', 'system'], 
      required: true 
    },
    senderUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    
    // Message Content
    text: { type: String, required: true },
    attachments: [{ type: String }],
    
    // Marketplace Rich Cards (TikTok & eBay product cards)
    cardType: { type: String, enum: ['none', 'product', 'order', 'tracking'], default: 'none' },
    cardPayload: { type: mongoose.Schema.Types.Mixed }, // { productId, sku, orderId, trackingNumber, url }
    
    // Channel / External Identifiers
    externalMessageId: { type: String },
    deliveryStatus: { type: String, enum: ['sent', 'delivered', 'failed', 'draft'], default: 'sent' },
    
    // ── AI Execution & Verification Trace (as required by Customer_Support_AI_Agent.md) ──
    aiMetadata: {
      isAiGenerated: { type: Boolean, default: false },
      scopeGatePassed: { type: Boolean, default: true },
      detectedIntent: { type: String },
      matchedFaqCodes: [{ type: String }],       // e.g. ["faq-where-is-my-order"]
      citedPolicyCodes: [{ type: String }],      // e.g. ["order-not-received"]
      toolsCalled: [{
        toolName: { type: String },              // e.g. "searchProducts", "getOrderTracking"
        input: { type: mongoose.Schema.Types.Mixed },
        outputSummary: { type: String }
      }],
      confidenceScore: { type: Number },         // 0.0 - 1.0
      requiresHumanApproval: { type: Boolean, default: false },
      tokensUsed: { type: Number },
      latencyMs: { type: Number },
      validationPassed: { type: Boolean, default: true },
      validationError: { type: String }          // e.g. "Length exceeded 250 words" or "Disallowed link"
    },

    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

messageSchema.index({ conversationId: 1, sentAt: 1 })
messageSchema.index(
  { shopId: 1, externalMessageId: 1 },
  { unique: true, partialFilterExpression: { externalMessageId: { $type: 'string' } } },
)

module.exports = mongoose.model('Message', messageSchema, 'messages')
```

---

### Schema 3 (Optional / Dedicated): `SupportAgentConfig.js`

To allow the client to customize rules per store without changing code:

```javascript
const mongoose = require('mongoose')

const supportAgentConfigSchema = new mongoose.Schema(
  {
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null }, // null = global default
    isEnabled: { type: Boolean, default: true },
    autoReplyHours: {
      mode: { type: String, enum: ['24_7', 'after_hours_only', 'business_hours_only'], default: '24_7' },
      timezone: { type: String, default: 'America/New_York' },
      businessHours: {
        start: { type: String, default: '09:00' },
        end: { type: String, default: '17:00' }
      }
    },
    thresholds: {
      minConfidenceForAutoSend: { type: Number, default: 0.85 }, // below this, becomes a draft
      maxResponseLengthWords: { type: Number, default: 180 },
    },
    blockedKeywords: [{ type: String }], // Spam filter gate words
    greetingTemplate: { type: String },
    signOffTemplate: { type: String, default: "Best regards,\nCustomer Care Team" }
  },
  { timestamps: true }
)

module.exports = mongoose.model('SupportAgentConfig', supportAgentConfigSchema, 'support_agent_configs')
```

---

## 4. How This Fits Your Flow Step-by-Step

Following `Customer_Support_AI_Agent.md`:

1. **Webhook / Sandbox Message arrives**:
   - Saves inbound customer message to `Message` with `senderType: 'customer'`.
   - Updates `Conversation.lastCustomerMessageAt` and calculates `slaDueAt` (+24h).
2. **Deterministic Scope / Spam Gate**:
   - Matches against `blockedKeywords` or spam patterns.
   - If spam/out of scope: saves canned fixed response with `aiMetadata.scopeGatePassed = false` and skips OpenAI invocation.
3. **OpenAI Agent Tools Execution (Read-Only)**:
   - Tool 1: `searchProducts({ query, category })` querying [`backend/models/Product.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/models/Product.js).
   - Tool 2: `getOrderDetails({ orderNumber, email })` querying [`backend/models/Order.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/models/Order.js).
   - Tool 3: `searchKnowledgeBase({ query, marketplace })` querying [`backend/models/SupportPolicy.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/models/SupportPolicy.js) & [`backend/models/SupportFaq.js`](file:///f:/OFFICE/US%20Client%20Automation%20Dashboard/Code%20File/backend/models/SupportFaq.js).
4. **Validation & Persistence**:
   - Checks reply length, ensures no external contact violations (eBay rule), verifies policy citations.
   - Saves assistant message to `Message` with `senderType: 'ai'` and populates `aiMetadata`.
   - If confidence < 0.85 or FAQ `handling === 'assisted'`, flags `deliveryStatus: 'draft'` so the user can review it in `/support/chat-sandbox` or `/inbox` before sending.
