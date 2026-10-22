# Sandbox Order Material Recipes

Use these recipes only for sandbox order material. Replace placeholders with
values returned by the typed commands or with known sandbox fixture values.

## Inspect Authentication

```bash
tts_open_toolkit auth status --json
```

If no usable profile exists:

```bash
tts_open_toolkit auth login
```

## Select a Shop and In-Stock SKU

The CLI currently lists existing sandbox products but cannot create one. Create
the product manually from the TTSPC sandbox page when needed, then continue
with the commands below. CLI product creation is coming soon.

```bash
tts_open_toolkit sandbox shop list \
  --region-code <region-code> \
  --json

tts_open_toolkit sandbox product list \
  --shop-id <shop-id> \
  --json
```

Read `products[].product_id`, `products[].sku_list[].id`, and
`products[].sku_list[].stock_count`. Select a SKU with enough stock for the
requested quantity and keep the request within the returned `limits`.

## Recipe: Create a Fresh Order

Create one order unless the user explicitly asks for more:

```bash
tts_open_toolkit sandbox order create \
  --shop-id <shop-id> \
  --item <product-id>:<sku-id>:1 \
  --order-count 1 \
  --logistics-service-id <known-sandbox-logistics-service-id> \
  --payment-method <known-sandbox-payment-method> \
  --json
```

Capture `created[].order_id`, `failed[]`, and `request_id`. If any order ID was
created, keep it even when another batch item failed or the command exits
nonzero.

Read the created order:

```bash
tts_open_toolkit sandbox order list \
  --shop-id <shop-id> \
  --page-size 10 \
  --json
```

Retry this read for up to 30 seconds when the new order is not indexed yet. Do
not create another order during the retry window.

## Recipe: Advance One State

```bash
tts_open_toolkit sandbox order transition <order-id> \
  --shop-id <shop-id> \
  --json
```

Record `before_status`, `after_status`, `transitioned`,
`transition_request_id`, and `query_request_id`. Then run `order list` again to
verify the visible state.

## Recipe: Reach a Requested State

1. Read the current canonical state.
2. Stop immediately when it matches the requested state.
3. Run one `order transition`.
4. Verify and re-read the state.
5. Repeat only while the state changes and remains non-terminal.

Do not hard-code the complete transition graph. Treat the CLI's verified
`after_status` as authoritative for the next decision.

## Troubleshooting

| Symptom | Safe response |
|---|---|
| SKU is sold out | Select another SKU with sufficient `stock_count`; retry create only if `created` is empty. |
| Create contains both `created` and `failed` | Keep every created order ID; do not rerun the whole batch. |
| New order is absent from the first list | Retry `order list --page-size 10` for up to 30 seconds. |
| Transition times out or says not found | Re-read the order before retrying a mutation. |
| CLI rejects an unknown state | Stop; never substitute a numeric backend status. |
| Quantity or page size exceeds a limit | Use the limit returned by the CLI; keep order-list page size at `10`. |
