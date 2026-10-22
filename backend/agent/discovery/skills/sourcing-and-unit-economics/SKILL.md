---
name: sourcing-and-unit-economics
description: Find reliable buy sources for one product and extract the cost inputs; the backend computes margin.
---

# Sourcing & Unit Economics

## Purpose

Find where the client can buy this product (as inventory, then ship it himself) and extract the raw cost inputs. You do NOT calculate margin; the backend does.

## Source types (classify every link)

- manufacturer_wholesale: Alibaba, domestic US wholesalers, manufacturer sites (preferred)
- retail_marketplace: AliExpress retail, Temu, Amazon, Walmart (price reference only; eBay prohibits fulfilling eBay orders directly from these)
Skip 1688 (Chinese-language, login-walled, unreliable via web search).

## Search

- "<core product title> wholesale", "<core product title> Alibaba", "<core product title> US supplier"
- Prefer a US-based supplier when price is within 20% of an overseas one (faster delivery, no import duty).

## Extract per source

unitCostUsd, moq, shipFromCountry, estimatedDeliveryDays, shippingCostPerUnitUsd (nullable), supplierType, supplierRatingOrYears (nullable), buyUrl

## Reference only (backend config, re-verify quarterly)

- eBay: 13.6% of sale total + $0.30 (order <= $10) or $0.40 (order > $10); some categories differ
- TikTok Shop: 6% referral fee (confirm in Seller Center; reported 8% from Aug 2026) + mandatory TikTok fulfillment + creator commission + refund admin fee on returns
- Temu seller fees: client to supply
- Duties: country of origin China or other non-US means add an import duty line; de minimis is suspended

## Hard rules

- Never return a link you did not open. Never invent prices; use null.
- If shipFromCountry is not US, set dutyApplies = true and let the backend estimate.
- Return the 3 best sources ranked by landed cost, not just the cheapest sticker price.
