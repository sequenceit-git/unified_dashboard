# Database Schema: Unified Marketplace Dashboard + AI Market Research Bot

**Stack:** MongoDB + Mongoose (MERN)
**Marketplaces:** eBay, Temu, TikTok Shop
**Principle:** keep it simple. Embed small bounded data, reference everything else. Every shop-scoped collection carries a `shopId` so RBAC is one filter.

---

## 1. Collections Overview

| # | Collection | Purpose |
| --- | ------------ | --------- |
| 1 | `users` | Super admin and sub-admin accounts |
| 2 | `shops` | Connected marketplace accounts (and encrypted tokens) |
| 3 | `products` | Master product catalog (generic schema) |
| 4 | `listings` | A product's listing on a specific shop/marketplace |
| 5 | `inventory_logs` | Stock change history |
| 6 | `orders` | Unified orders (shipping, returns, refunds embedded) |
| 7 | `customers` | Central customer database |
| 8 | `conversations` | One thread per customer per shop (unified inbox) |
| 9 | `messages` | Messages inside a conversation |
| 10 | `message_templates` | Reusable reply templates |
| 11 | `research_reports` | AI Market Research Bot runs and results |
| 12 | `sync_logs` | Sync runs, API errors, failure tracking |
| 13 | `notifications` | Low-stock and sync-failure alerts |
| 14 | `audit_logs` | Who did what |

Analytics (sales overview, revenue, marketplace comparison, product performance) are **aggregation queries on `orders`**, so no separate collection is needed for now.

---

## 2. RBAC Model

- `super_admin`: access to all shops, can create/manage sub-admins and shops, runs the research bot.
- `sub_admin`: access to **exactly one shop** (`user.shopId`). Created only by a super admin.
- Middleware rule: if `role === 'sub_admin'`, force `filter.shopId = user.shopId` on every shop-scoped query. Never trust a `shopId` from the request body or query string.

---

## 3. Schemas

All collections have `createdAt` and `updatedAt` (Mongoose `{ timestamps: true }`) unless noted.

### 3.1 `users`

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `name` | String | required |
| `email` | String | required, unique, lowercase |
| `passwordHash` | String | bcrypt/argon2, `select: false` |
| `role` | String | enum: `super_admin`, `sub_admin` |
| `shopId` | ObjectId → shops | required if `sub_admin`, null for `super_admin` |
| `createdBy` | ObjectId → users | the super admin who created this user |
| `status` | String | enum: `active`, `disabled`; default `active` |
| `lastLoginAt` | Date | |

**Indexes**

```js
{ email: 1 }                  // unique
{ shopId: 1, role: 1 }        // list sub-admins of a shop
```

---

### 3.2 `shops`

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `name` | String | display name |
| `marketplace` | String | enum: `ebay`, `temu`, `tiktok_shop` |
| `externalShopId` | String | seller/shop ID on the marketplace |
| `auth.accessTokenEnc` | String | AES-256-GCM encrypted, `select: false` |
| `auth.refreshTokenEnc` | String | encrypted, `select: false` |
| `auth.expiresAt` | Date | token expiry (used by refresh job) |
| `status` | String | enum: `connected`, `error`, `disconnected` |
| `lastSyncAt` | Date | |
| `aiReplyEnabled` | Boolean | default `false`. Toggle AI auto-replies per shop |

**Indexes**

```js
{ marketplace: 1, externalShopId: 1 }   // unique, prevents connecting the same shop twice
{ status: 1 }
{ "auth.expiresAt": 1 }                 // token refresh job
```

---

### 3.3 `products` (generic master catalog)

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `sku` | String | required, unique |
| `title` | String | required |
| `description` | String | can be AI-generated |
| `category` | String | free text for now |
| `brand` | String | |
| `images` | [String] | URLs |
| `basePrice` | Number | |
| `currency` | String | default `USD` |
| `stock` | Number | total stock, used when there are no variants |
| `lowStockThreshold` | Number | default `5` |
| `attributes` | Mixed (object) | **generic, free-form key/value**, so any product type fits |
| `variants` | [Variant] | embedded, optional |
| `status` | String | enum: `draft`, `active`, `archived` |
| `source` | String | enum: `manual`, `bulk_upload`, `research_bot` |
| `sourceReportId` | ObjectId → research_reports | set when added from a research opportunity |

**Variant (embedded)**

| Field | Type | Notes |
| ------- | ------ | ------- |
| `sku` | String | unique per product |
| `options` | Mixed (object) | e.g. `{ color: "red", size: "M" }` |
| `price` | Number | overrides `basePrice` |
| `stock` | Number | |

> Stock rule: if `variants` exist, variant `stock` is the source of truth. Otherwise use the product `stock`.

**Indexes**

```js
{ sku: 1 }                               // unique
{ "variants.sku": 1 }                    // sparse, lookup from marketplace orders
{ status: 1, category: 1 }               // catalog filters
{ title: "text", sku: "text" }           // search box
{ stock: 1 }                             // low-stock query
```

---

### 3.4 `listings`

A product listed on a shop. One product can have many listings (one per shop).

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `productId` | ObjectId → products | required |
| `shopId` | ObjectId → shops | required |
| `marketplace` | String | denormalized for fast filtering |
| `externalListingId` | String | marketplace's item/product ID |
| `price` | Number | per-shop price override (optional) |
| `status` | String | enum: `pending`, `live`, `paused`, `error`, `ended` |
| `syncError` | String | last error message |
| `lastSyncedAt` | Date | |

**Indexes**

```js
{ productId: 1, shopId: 1 }              // unique, one listing per product per shop
{ shopId: 1, status: 1 }                 // shop's listing tab
{ shopId: 1, externalListingId: 1 }      // match inbound marketplace data
```

---

### 3.5 `inventory_logs`

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `productId` | ObjectId → products | |
| `variantSku` | String | optional |
| `shopId` | ObjectId → shops | optional (null for manual or global change) |
| `change` | Number | `+10`, `-1` |
| `stockBefore` | Number | |
| `stockAfter` | Number | |
| `reason` | String | enum: `sale`, `return`, `manual`, `sync`, `restock` |
| `refId` | ObjectId | order ID etc. |
| `createdBy` | ObjectId → users | null for system |
| `createdAt` | Date | no `updatedAt` (append-only) |

**Indexes**

```js
{ productId: 1, createdAt: -1 }          // per-product history
{ shopId: 1, createdAt: -1 }
```

---

### 3.6 `orders`

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `shopId` | ObjectId → shops | required |
| `marketplace` | String | denormalized |
| `externalOrderId` | String | required |
| `customerId` | ObjectId → customers | |
| `status` | String | enum: `pending`, `paid`, `processing`, `shipped`, `delivered`, `cancelled`, `returned`, `refunded` |
| `items` | [OrderItem] | embedded snapshot |
| `buyer` | `{ name, email, phone }` | snapshot at order time |
| `shippingAddress` | Mixed (object) | |
| `totals` | `{ subtotal, shipping, tax, discount, total, currency }` | |
| `shipping` | `{ carrier, trackingNumber, shippedAt, deliveredAt }` | |
| `returns` | [Return] | embedded, usually 0 or 1 |
| `placedAt` | Date | marketplace order time |

**OrderItem (embedded):** `productId`, `sku`, `title`, `quantity`, `unitPrice`

**Return (embedded):** `reason`, `status` (`requested`, `approved`, `received`, `rejected`), `refundAmount`, `refundedAt`, `requestedAt`

**Indexes**

```js
{ shopId: 1, externalOrderId: 1 }        // unique, makes order sync idempotent
{ shopId: 1, placedAt: -1 }              // order list + sales over time
{ shopId: 1, status: 1, placedAt: -1 }   // status filters
{ customerId: 1, placedAt: -1 }          // customer order history
{ "items.productId": 1, placedAt: -1 }   // product performance
{ "shipping.trackingNumber": 1 }         // sparse, tracking lookup
```

---

### 3.7 `customers`

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `name` | String | |
| `email` | String | may be missing or masked on some marketplaces |
| `phone` | String | |
| `identities` | [Identity] | marketplace-wise mapping |
| `orderCount` | Number | denormalized, updated on new order |
| `totalSpent` | Number | denormalized |
| `lastOrderAt` | Date | |

**Identity (embedded):** `shopId`, `marketplace`, `externalBuyerId`, `username`

**Indexes**

```js
{ "identities.shopId": 1, "identities.externalBuyerId": 1 }   // unique, find/create from marketplace data
{ email: 1 }                                                  // sparse
{ lastOrderAt: -1 }
{ name: "text", email: "text" }                               // customer search
```

---

### 3.8 `conversations`

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `shopId` | ObjectId → shops | required |
| `marketplace` | String | |
| `customerId` | ObjectId → customers | |
| `externalThreadId` | String | marketplace thread ID |
| `orderId` | ObjectId → orders | optional, if tied to an order |
| `status` | String | enum: `open`, `closed`; default `open` |
| `aiEnabled` | Boolean | default `true`. Set to `false` when a human takes over |
| `lastMessageAt` | Date | |
| `lastMessagePreview` | String | first ~100 chars |
| `unreadCount` | Number | default `0` |

**Indexes**

```js
{ shopId: 1, externalThreadId: 1 }       // unique
{ shopId: 1, status: 1, lastMessageAt: -1 }   // inbox list (main query)
{ customerId: 1 }
```

---

### 3.9 `messages`

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `conversationId` | ObjectId → conversations | required |
| `shopId` | ObjectId → shops | denormalized for RBAC filtering |
| `direction` | String | enum: `inbound`, `outbound` |
| `senderType` | String | enum: `customer`, `ai`, `agent` |
| `senderUserId` | ObjectId → users | only when `agent` |
| `text` | String | |
| `attachments` | [String] | URLs |
| `externalMessageId` | String | for de-duplication |
| `deliveryStatus` | String | enum: `sent`, `failed`; for outbound |
| `sentAt` | Date | |

**Indexes**

```js
{ conversationId: 1, sentAt: 1 }                  // load a thread in order
{ shopId: 1, externalMessageId: 1 }               // unique + sparse, de-duplicate polled/webhook messages
```

---

### 3.10 `message_templates`

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `shopId` | ObjectId → shops | null = global template |
| `title` | String | |
| `body` | String | supports placeholders like `{{customerName}}` |
| `createdBy` | ObjectId → users | |

**Indexes**

```js
{ shopId: 1 }
```

---

### 3.11 `research_reports` (AI Market Research Bot)

One document per bot run. Opportunities are embedded (bounded to roughly the top 20 to 50 per run).

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `runBy` | ObjectId → users | or null for scheduled run |
| `trigger` | String | enum: `manual`, `scheduled` |
| `params` | `{ marketplaces: [String], category, keywords: [String] }` | |
| `status` | String | enum: `queued`, `running`, `completed`, `failed` |
| `error` | String | |
| `summary` | String | AI-written overview |
| `opportunities` | [Opportunity] | best/most-selling list |
| `email` | `{ to: [String], sentAt, status }` | email delivery to the client |
| `startedAt` / `finishedAt` | Date | |

**Opportunity (embedded)**

| Field | Type | Notes |
| ------- | ------ | ------- |
| `rank` | Number | |
| `title` | String | |
| `marketplace` | String | |
| `sourceUrl` | String | |
| `image` | String | |
| `metrics` | Mixed | `{ salesVolume, searchRank, price, reviewCount, rating }` |
| `estimatedMargin` | Number | percent |
| `opportunityScore` | Number | 0 to 100 |
| `aiNotes` | String | |
| `addedProductId` | ObjectId → products | set when added to the catalog |

**Indexes**

```js
{ createdAt: -1 }                         // report list
{ status: 1, createdAt: -1 }
{ "opportunities.addedProductId": 1 }     // sparse
```

---

### 3.12 `sync_logs`

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `shopId` | ObjectId → shops | |
| `type` | String | enum: `products`, `inventory`, `orders`, `messages`, `token_refresh` |
| `status` | String | enum: `success`, `failed`, `partial` |
| `error` | `{ code, message, httpStatus }` | API error monitoring |
| `attempt` | Number | retry count |
| `stats` | `{ fetched, created, updated, failed }` | |
| `startedAt` / `finishedAt` | Date | |

**Indexes**

```js
{ shopId: 1, startedAt: -1 }
{ status: 1, startedAt: -1 }
{ startedAt: 1 }   // TTL: expireAfterSeconds = 7776000 (90 days)
```

---

### 3.13 `notifications`

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `shopId` | ObjectId → shops | null = visible to super admin only |
| `type` | String | enum: `low_stock`, `sync_failed`, `token_expiring`, `report_ready` |
| `title` / `message` | String | |
| `refId` | ObjectId | product, sync log, report... |
| `isRead` | Boolean | default `false` |

**Indexes**

```js
{ shopId: 1, isRead: 1, createdAt: -1 }
{ createdAt: 1 }   // TTL: expireAfterSeconds = 2592000 (30 days)
```

---

### 3.14 `audit_logs`

| Field | Type | Notes |
| ------- | ------ | ------- |
| `_id` | ObjectId | |
| `userId` | ObjectId → users | |
| `shopId` | ObjectId → shops | optional |
| `action` | String | e.g. `product.update`, `user.create`, `order.refund` |
| `entity` | String | collection name |
| `entityId` | ObjectId | |
| `meta` | Mixed | changed fields, etc. |
| `ip` | String | |
| `createdAt` | Date | append-only |

**Indexes**

```js
{ userId: 1, createdAt: -1 }
{ entity: 1, entityId: 1, createdAt: -1 }
{ shopId: 1, createdAt: -1 }
{ createdAt: 1 }   // TTL: expireAfterSeconds = 15552000 (180 days)
```

---

## 4. Relationships

```
users ──(sub_admin)──> shops
shops ──< listings >── products
shops ──< orders >── customers
orders.items ──> products
shops ──< conversations >── customers
conversations ──< messages
products ──< inventory_logs
research_reports.opportunities ──> products (when added to catalog)
```

---

## 5. Design Notes

1. **Embed vs reference:** order items, returns, variants, customer identities and report opportunities are embedded because they are small and always read with the parent. Messages and inventory logs are separate because they grow without bound.
2. **Idempotent syncing:** the unique indexes on `(shopId, externalOrderId)`, `(shopId, externalThreadId)` and `(shopId, externalMessageId)` mean re-running a sync never creates duplicates. Use `bulkWrite` with `upsert`.
3. **Stock updates:** use atomic `$inc` (`findOneAndUpdate` with `{ stock: { $gte: qty } }`) to avoid overselling. Log every change in `inventory_logs`.
4. **Tokens:** encrypt marketplace tokens (AES-256-GCM, key in env or secret manager) and keep `select: false`. Never return them to the client.
5. **Shop scoping:** `shopId` is denormalized onto `messages` and `orders` on purpose, so RBAC filtering never needs a join.
6. **Products are global, visibility is per shop:** sub-admins see products through `listings` for their own shop only.
7. **Analytics:** start with aggregation pipelines on `orders` (`$group` by day and marketplace). If dashboards get slow, add a `daily_stats` collection later; it is not needed now.
8. **Backups:** handled at the infra level (MongoDB Atlas backups, or `mongodump` cron on the VPS). No schema changes needed.
9. **Generic products:** use `attributes` (free-form object) and `variants[].options` for anything product-specific. Once the product type is decided, add a typed schema or validation for those fields.
10. **Env/cost note:** AI usage costs are excluded from the budget per the agreement. Consider storing `aiTokensUsed` on messages or reports later if you need to bill the client for it.
