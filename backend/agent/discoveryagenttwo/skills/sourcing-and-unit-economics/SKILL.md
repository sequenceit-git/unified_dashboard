---
name: sourcing-and-unit-economics
description: Search wholesale supplier sources (AliExpress, Temu, 1688, Alibaba) for cheaper buy prices and calculate net profit margins.
---

# Sourcing & Unit Economics

## Purpose
Given a product and its market selling price, find where a merchant can buy it at the cheapest reliable price and calculate landed unit economics.

## Sourcing Steps
1. Search discount/wholesale platforms for the item or its OEM manufacturer:
   - `"<product core title>" site:aliexpress.com`
   - `"<product core title>" wholesale price`
   - `"<product core title>" site:temu.com`
2. Extract:
   - Lowest reliable unit buy price (`costPrice`)
   - Direct link to buy the item (`sourceUrl`)

## Financial Formulas (All in USD)
1. **Gross Margin**: `Selling Price - Cost Price`
2. **Platform & Payment Fees**: Assume standard ~15% of selling price (referral fee + payment processing).
3. **Net Profit per Unit**: `Selling Price - Cost Price - (Selling Price * 0.15)`
4. **Net Profit Margin %**: `(Net Profit / Selling Price) * 100`

## Threshold Rule
- Default minimum net margin is **15%** (or custom user threshold if specified).
- Any candidate yielding a margin below the threshold must be filtered out or flagged as unprofitable.
