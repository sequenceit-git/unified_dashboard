---
name: structured-research-output
description: Enforce consistent JSON schemas for marketplace metrics, product recommendations, and market analysis.
---

# Structured Research Output

## Purpose
Single source of truth for the JSON shapes the agent must emit, mirroring the
Mongoose models so persistence is mechanical.

## Schemas
- `MarketplaceResearch`: `{ reportId, categories[], productName, marketplace,
  productUrl (required), price, currency, estimatedMonthlySales, salesDataType,
  searchRanking, rankingKeyword, rating, reviewCount,
  reviewSummary: { positive[], negative[] }, sourceUrl, dataCollectedAt }`
  (+ sourcing extras for aliexpress: `moq, shippingCost, deliveryWindow, sellerTenure`).
- `ProductRecommendation`: `{ reportId, categories[], rank (1-based, unique per report),
  productName, category, marketplace, productUrl, price, currency,
  estimatedMonthlySales, estimatedMonthlyRevenue, rating, reviewCount,
  competitionLevel, estimatedProfitMarginPercent, opportunityScore,
  recommendationReason (required) }`.
- `MarketAnalysis`: `{ reportId (unique), categories[], marketOverview: { summary
  (required), demandLevel, competitionLevel, marketOutlook }, trends[]: { name,
  direction, evidence, sourceUrls[], confidence }, profitAnalysis[]: { category,
  productName, currency, estimatedSellingPrice, estimatedProductCost,
  estimatedShippingCost, estimatedMarketplaceFees, estimatedMarketingCost,
  estimatedOtherCosts, estimatedProfitPerUnit, estimatedProfitMarginPercent,
  assumptions[] }, opportunities[]: { productName, category, opportunityScore,
  demandScore, competitionScore, profitabilityScore, trendScore, reason, sourceUrls[] },
  risks[], conclusion }`.

## Rules
- Required fields are non-negotiable; unknowns are `null`, never fabricated.
- Enums exactly as in the models (`Low/Medium/High/Unknown`, `actual/estimated/unavailable`, etc.).
- Designed for OpenAI structured outputs (strict JSON schema) at implementation time.
