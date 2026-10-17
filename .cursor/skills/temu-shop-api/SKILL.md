---
name: temu-shop-api
description: >-
  Integrate the Temu seller Open API into this dashboard. Use when connecting
  a Temu shop, adding TEMU_* env vars, signing router requests, or creating
  backend/services/marketplace/temu.js. Temu does not publish an MCP server.
---

# Temu shop API

This dashboard connects our own United States Temu shop. Use only the US local-seller path. Do not call the EU or global routers, and do not use the cross-border Seller Center.

Temu does not publish an MCP server. Do not connect a third-party Temu MCP. Use the US Partner Platform directly: [partner-us.temu.com](https://partner-us.temu.com/documentation).

## Request system

Every call is `POST` with `content-type: application/json` to `https://openapi-b-us.temu.com/openapi/router`. The API name is the `type` field, not a URL path.

Common body fields: `type`, `app_key`, `timestamp` (10-digit unix seconds, within 300 seconds of now), `access_token`, `data_type` = `JSON`, `sign`. Optional `version` (default V1).

Signature (`sign_method=md5`), from the Partner Platform signature guide: sort parameter keys except `sign`, concatenate `key + value` with no separators, wrap with `app_secret` on both ends, MD5, uppercase hex. Sign the same JSON you send, including nested business fields. Do not log `app_secret`, `access_token`, or `code`.

## Authorization

US local seller callback: `https://seller.temu.com/open-platform/client-manage/authorization?appKey={appKey}&redirect_uri={callback}&state={state}`. Set the app `redirect_url` in the US Partner console before this URL works.

Callback query: `app_key`, `callback_host`, `code`, `state`. Exchange `code` with `type` `bg.open.accesstoken.create`. On that first call, `access_token` is the `code`. The response includes `mall_id` and `access_token`. `callback_host` for this shop is `openapi-b-us.temu.com`.

Confirm the goods, order, and inventory `type` names in the app's region API list before coding. Do not invent method names. `bg.local.goods.detail.query` is a documented local-goods read; order and stock methods must come from that same console.

## This dashboard

Add `backend/services/marketplace/temu.js` and register it as `temu`. Config key `temu` in `backend/config/marketplaces.js` with `TEMU_APP_KEY`, `TEMU_APP_SECRET`, and region fixed to `us`.

Match the eBay service methods: `getAuthUrl`, `exchangeCode`, `refreshToken`, `getOrders`, `getInventory`, `createListing`, `updateStock`, `updatePrice`. Dispatch sync, stock, and price with `shop.marketplace`.

`getAuthUrl` builds the US local-seller authorization URL above. Store the token and `mall_id` on `Shop.auth` and set `status` to `connected`. Map Temu order states into `pending | paid | processing | shipped | delivered | cancelled | returned | refunded`.
