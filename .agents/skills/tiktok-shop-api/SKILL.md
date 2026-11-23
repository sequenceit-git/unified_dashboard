---
name: tiktok-shop-api
description: >-
  Connect TikTok Shop Open API to this dashboard. Use with the official TTS
  Open Toolkit skills (tts-openapi-guide, tts-developer-onboarding-guide,
  tts-open-toolkit) when adding a tiktok_shop connector, signing requests, or
  calling Partner Center and sandbox APIs.
---

# TikTok Shop API

This dashboard connects our own United States TikTok Shop. Use the US Partner Center at `https://partner.us.tiktokshop.com` and the seller-developed custom app path. Do not build an ISV app for other sellers, and do not target UK, EU, or other shop regions.

TikTok Shop does not publish a Shop MCP server. TikTok for Business MCP is the Ads API (`business-api.tiktok.com`); do not use it for shop orders, products, or seller OAuth.

The official integration system is `@tts-open-toolkit/cli` (`tts_open_toolkit`). Its skills are installed in this project:

- `tts-developer-onboarding-guide` — Partner Center app, redirect URL, scopes, launch
- `tts-openapi-guide` — current method, path, and schema. Read its OAS before choosing an endpoint
- `tts-openapi-faq-index` — auth, signature, token, order, product, and webhook failures
- `tts-openapi-sandbox-materials` — sandbox orders and SKUs via the CLI
- `tts-open-toolkit` — `auth`, `devapi`, `app`, `sandbox`, `openapi`
- `tts-open-platform-glossary` — shop, seller, and logistics terms

## How to call the API

1. Read `tts-openapi-guide` and pick the highest applicable six-digit version. Do not hardcode an older path such as `202309` unless that guide selects it.
2. Use `tts_open_toolkit` for Partner Center OAuth, DevAPI, and sandbox (`npx @tts-open-toolkit/cli`). Login stores tokens in Windows DPAPI, not in the repo.
3. Sign shop calls the way Partner Center documents: HMAC-SHA256, key = app secret, string = `app_secret + path + sorted query (exclude sign and access_token) + exact body + app_secret`, lowercase hex. Send `x-tts-access-token`. Shop calls need `shop_cipher` from Get Authorized Shops.

## This dashboard

All TikTok Shop code lives in `backend/marketplaces/tiktok_shop/` (registered as `tiktok_shop`, the `Shop.marketplace` value; the id `tiktok` is only a URL alias):
- `client.js` (signing, auth, `call`), `orders.js`, `listings.js`, `promotions.js`, `finance.js`, `inbox.js`, `analytics.js`; `service.js` puts them on one object
- `webhooks.js`, `profile.js` (sidebar sections + access probes), `sections/` (one file per section), `hooks.js` (TikTok steps in the shared sync), `scripts/smoke.js` (`npm run smoke:tiktok`), `test/`
- Frontend: `frontend/src/marketplaces/tiktok_shop/` (section buttons, listing fields and rules)

The shared core (`backend/services/marketplace/`) never checks for TikTok by name; add behaviour through the adapter in `index.js` (see `backend/marketplaces/README.md`).

`TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET` and `TIKTOK_SHOP_SERVICE_ID` are read in `backend/marketplaces/tiktok_shop/config.js`. Authorize with the seller link from Partner Center (`service_id` plus `state`). Persist access token, refresh token, expiry, and `shop_cipher` on `Shop.auth`. Do not log secrets.
