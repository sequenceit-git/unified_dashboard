---
name: tts-openapi-sandbox-materials
description: Construct TikTok Shop OpenAPI test materials exclusively with TTS Open Toolkit sandbox commands. Use when a user needs a sandbox order, product or SKU selection, or an order advanced to a required canonical state for OpenAPI testing.
---

# TTS OpenAPI Sandbox Materials

Construct OpenAPI test material only with the typed `tts_open_toolkit sandbox`
commands. Read [references/order-material-recipes.md](references/order-material-recipes.md)
before preparing an order.

## Scope

Use only these commands to read or mutate test material:

- `sandbox shop list`
- `sandbox product list`
- `sandbox order create`
- `sandbox order list`
- `sandbox order transition`

`auth status` and `auth login` are permitted only as authentication
prerequisites.

Do not use account-material search, PPE headers, production business mutations,
raw `sandbox call`, or undocumented APIs. Do not pass `--version`; typed sandbox
commands use their fixed backend version internally.

## Product Prerequisite

The CLI does not currently support creating sandbox products. If no suitable
product or SKU exists, open the TTSPC sandbox page and create it manually, then
run `sandbox product list` again. Direct sandbox product creation will be
available in the CLI soon.

## Collect Inputs

Confirm:

- required canonical order state;
- region code;
- sandbox `logistics_service_id`;
- sandbox `payment_method`;
- quantity and order count, defaulting both to `1`.

Never invent `logistics_service_id` or `payment_method`. Ask for a known sandbox
fixture when either value is unavailable.

## Build the Material

1. Run `auth status --json`. Log in only when no usable OAuth profile exists.
2. List sandbox shops in the requested region and select the intended
   `shop_id`.
3. List products for that shop. Select a `product_id` and `sku_id` whose
   `stock_count` is at least the requested quantity. Respect the returned
   `limits`; do not blindly use the first SKU.
4. Create exactly one sandbox order by default. Capture the parsed output even
   when the command exits nonzero because a batch response may contain both
   `created` and `failed`.
5. If `created` contains any `order_id`, never create a second order to recover
   from a later query, indexing, or transition error.
6. Re-read the order with `sandbox order list --page-size 10`. A newly created
   order can take a short time to become visible, so retry the read for up to
   30 seconds without recreating it.
7. If the target is later than the current state, call
   `sandbox order transition <order-id>` one step at a time. Verify
   `before_status`, `after_status`, and `transitioned`, then re-read the order
   before deciding whether another transition is needed.
8. Stop when the target state is reached, a terminal state is reached, or the
   CLI rejects the transition.

Use only canonical state names:

`UNKNOWN`, `UNPAID`, `ON_HOLD`, `TO_SHIP`, `AWAITING_SHIPMENT`,
`AWAITING_COLLECTION`, `CANCEL_PENDING`, `PARTIALLY_SHIPPING`, `SHIPPED`,
`IN_TRANSIT`, `DELIVERED`, `COMPLETED`, and `CANCELLED`.

Never expose or ask the user to supply backend numeric status codes.

## Recover Safely

- Sold-out SKU: choose a SKU with sufficient `stock_count` and retry the
  failed create once, but only when no order was created.
- Delayed visibility: retry `order list`; do not recreate the order.
- Limit or unsafe-integer rejection: correct the input within the returned
  limits before mutation.
- Transition timeout or not-found response: re-read the order before deciding
  what happened; do not recreate or blindly transition again.
- No cleanup route exists in this workflow. Retain the sandbox order and record
  its ID and state.

## Return Evidence

Return a compact material record:

```yaml
material_type: sandbox_order
shop_id: "<shop-id>"
product_id: "<product-id>"
sku_id: "<sku-id>"
order_id: "<order-id>"
current_status: "<canonical-state>"
target_status: "<canonical-state>"
created_count: 1
request_ids:
  create: "<request-id>"
  transition: ["<request-id>"]
  query: ["<request-id>"]
notes: "<visibility delay, terminal state, or other relevant fact>"
```

Do not include tokens, cookies, account nicknames, or other credentials.
