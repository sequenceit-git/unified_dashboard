---
name: supplier-research-and-verification
description: Search wholesale supplier directories, verify manufacturer legitimacy, pricing breaks, MOQ, and flag risks.
---

# Supplier Research & Verification

## Purpose
Identify manufacturing partners and vet legitimacy across wholesale platforms (Alibaba, Made-in-China, 1688, Thomasnet) to ground unit costs and flag sourcing risks.

## Steps
1. **Search & Directory Discovery**:
   - Query supplier directories for the exact product or generic equivalent.
   - Extract key terms: MOQ, quantity tiers, FOB/EXW/DDP shipping terms, lead times, and customization (OEM/ODM) capabilities.
2. **Vetting & Credibility Screening**:
   - Verify business history, tenure (minimum 2–3+ years preferred), verified factory certifications (ISO9001, CE, RoHS, FDA).
   - Check transaction volume, verified buyer reviews, and on-time delivery track record.
3. **Red Flag Detection**:
   - Brand-new accounts with inflated review profiles.
   - Unit prices dramatically below raw-material parity.
   - Unwillingness to provide sample units or third-party audit reports.
4. **Actionable Sourcing Assessment**:
   - Assign risk verdict: `verified`, `caution`, or `reject`.
   - Feed viable landed costs into profitability analysis.

## Output (JSON Structure)
```json
{
  "supplierName": "Shenzhen Precision Tech Co., Ltd.",
  "platform": "Alibaba",
  "supplierUrl": "https://example.com/supplier",
  "unitPrice": 4.80,
  "moq": 500,
  "leadTimeDays": 20,
  "shippingTerms": "FOB Shenzhen",
  "verificationStatus": "verified",
  "certifications": ["ISO9001", "CE"],
  "riskNotes": "Established manufacturer with 6-year history; verified trade assurance transactions."
}
```

## Rules
- Distinguish between verified manufacturers and third-party trading middlemen.
- Reject suppliers showing signals of counterfeit or unverified claims.
