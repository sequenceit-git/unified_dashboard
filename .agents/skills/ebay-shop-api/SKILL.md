---
name: ebay-shop-api
description: >-
  Integrate eBay Sell APIs into this dashboard. Use when connecting an eBay
  shop, changing EBAY_* env vars, editing backend/services/marketplace/ebay.js,
  or calling the official eBay MCP server (@ebay/npm-public-api-mcp).
---

# eBay shop API

This dashboard connects our own United States eBay shop. Use marketplace `EBAY_US`, currency `USD`, and category tree `0`. Do not add other eBay sites.

eBay publishes an official MCP server. This project registers it as `ebay-api` in `.cursor/mcp.json` (`npx -y @ebay/npm-public-api-mcp`). Credentials come from `backend/.env` (`EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`). Do not copy those values into git.

## Use the official MCP for reads

Tools: `query_ebay_api` (find the OpenAPI operation) then `call_ebay_api` (execute it). Prompt: `interpret_user_request`.

Official limits, from the eBay MCP README:

- Production only. Sandbox is not supported.
- REST calls are GET only. POST, PUT, and DELETE are rejected.
- Default token mode in this project is `application` (public Browse, taxonomy, catalog). Seller inventory, orders, and account data need user-token mode: set `EBAY_TOKEN_TYPE=user` and `EBAY_REFRESH_TOKEN` on the MCP server. Scopes come from that refresh token.

If `query_ebay_api` / `call_ebay_api` are not connected, say so and use the dashboard service below. Do not switch to an unofficial eBay MCP.

## Dashboard writes and shop sync

Seller connect, listing publish, stock, price, fulfillment, and refunds stay in this repo because the official MCP cannot write.

- Service: `backend/services/marketplace/ebay.js`
- Registry: `backend/services/marketplace/index.js` key `ebay`
- Config: `backend/config/marketplaces.js` key `ebay`
- Shop id: `ebay`
- Connect: `GET /api/shops/oauth/connect/ebay`, return to `/settings?connected=ebay`

Keep these methods: `getAuthUrl`, `exchangeCode`, `refreshToken`, `getOrders`, `getInventory`, `createListing`, `updateStock`, `updatePrice`, `createShippingFulfillment`, `getCategories`, `getItemAspects`, `issueRefund`, `getFinances`, `getApplicationToken`, `getItemDetails`.

OAuth hosts come from config (`api.ebay.com` / `auth.ebay.com`, or sandbox when `EBAY_ENV=SANDBOX`). Authorize at `{authBaseUrl}/oauth2/authorize`. Exchange and refresh at `POST {apiBaseUrl}/identity/v1/oauth2/token` with HTTP Basic auth. Config scopes are `sell.inventory`, `sell.fulfillment`, `sell.account`, `sell.finances`.

Store tokens on `Shop.auth`. Do not log them. Map eBay fulfillment status into the order enum in `backend/models/Order.js`.
