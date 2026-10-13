---
name: product-discovery-search
description: Search e-commerce marketplaces (eBay, Temu, Amazon, Walmart) to identify popular, high-velocity trending product candidates.
---

# Product Discovery Search

## Purpose
Given a target category, niche, and marketplaces, identify trending and high-velocity candidate products currently in demand.

## Search Strategy
1. Formulate specific search queries focusing on actual consumer demand:
   - `best sellers <category> <niche> site:<marketplace>`
   - `most sold <category> 2026 site:<marketplace>`
   - `trending items <category> <marketplace>`
2. Extract candidate items with:
   - Product title (clean, normalized, brand + core keyword)
   - Marketplace observed on (e.g. `ebay`, `temu`, `amazon`, `walmart`)
   - Current observable selling price (USD)
   - Real URL to the active listing

## Constraints
- Never return placeholder URLs (`example.com`, `#`, fake paths).
- Focus on products with active customer reviews and observable purchase badges ("1K+ bought past month", "Hot item", etc.).
- Exclude hyper-saturated commodities or brand-gated electronics (e.g., official Apple, Nike) where reselling margins are nonexistent.
