# Platforms (master sections 1 and 6.1)

## 1.1 Marketplaces (public discovery possible, data varies by region and access)

| Platform | Strongest public signals | Typical limits |
|---|---|---|
| Amazon | Best Sellers rank per category, Movers & Shakers, "bought in past month" badge, Best Seller badge, review count and rating | Rank is relative within a category and marketplace domain; "bought in past month" is a rounded floor figure, not exact sales |
| eBay | "Sold" counts on listings, sold/completed listings filter, Terapeak (seller tools, access varies) | Sold count may be per listing, multi-variation, or lifetime; deep APIs are restricted |
| Etsy | "Bestseller" badge, shop and listing sales counts, favorites, review count | Badge criteria are platform-defined and may be shop-level; counts can be lifetime |
| Temu | Per-product "sold" count, review count, rating, badges such as "Best seller" or "Top rated" shown on product pages | No public sales API for research; counts are platform-displayed, vary by region, may be lifetime, and listings change fast |
| TikTok Shop | Per-product "sold" count, rating, reviews, shop ratings, in-app trending and ranking surfaces, creator/affiliate engagement; Seller Center and Partner/Affiliate APIs for authorized accounts | Public data differs by country and by whether TikTok Shop is live in that region; app-only surfaces may not be reachable; engagement does not equal sales |
| Wish | Product "sold" and rating indicators where shown | Verify the platform is operating and accessible in the target region before relying on it |

## 1.2 Storefront and commerce platforms (merchant-level data, not a universal leaderboard)

Adobe Commerce/Magento, BigCommerce, Ecwid by Lightspeed, OpenCart, Salesforce Commerce Cloud, PrestaShop, Shift4Shop, Shopify, Square, Squarespace, VTEX, Wix, WooCommerce.

- These hold data for **individual merchants**. There is no public cross-store best-seller list.
- Valid uses: (a) analyze the user's **own connected store** through authorized APIs or exports; (b) inspect individual public storefronts the user names, only for public signals (for example a store's own "Best sellers" collection or sort order). Treat a store's self-curated best-seller label as a **weak signal (Tier 4)** unless the merchant discloses the sorting basis.
- Never imply that a platform-wide sales ranking exists for these.

## 1.3 Not a shopping platform

Zendesk is customer-service software. Inspect it only if the user has authorized access and support-ticket signals (product complaints, return reasons, question volume) are relevant to validating a product. Otherwise mark "Not applicable".

## 1.4 Platform status check (do this first)

Before research, confirm each requested platform is **operating, accessible, and relevant in the target region** (for example, some platforms are not available in all countries, change ownership, or restrict public pages). If not verifiable, report "Unverified availability" and do not fabricate data.

## 6.1 Platform-specific validation notes

- **Amazon:** Record marketplace domain, category path, and rank type (overall vs. subcategory). Treat "bought in past month" as a rounded lower-bound indicator. Rank fluctuates hourly; note observation time. Variation parents can inflate review counts across children.
- **eBay:** Distinguish listing-level sold count from item-level sales; check whether sold figures cover multi-variation or multi-quantity listings. Prefer completed/sold listings with dates and prices.
- **Etsy:** The Bestseller badge is platform-defined and can be time-windowed; shop-level sales do not equal listing-level sales. Check for made-to-order or personalized items that are not scalable.
- **Temu:** Displayed "sold" figures and badges can be region-specific, may be cumulative, and listings, sellers, and prices change quickly and often. Record the exact wording and region/site. Verify price in the target currency, shipping cost and delivery estimate, and whether the same item appears under multiple listings or sellers. Judge review authenticity (photos, verified-purchase style indicators, review dates) and flag mismatched reviews. Temu lacks a public research API; do not claim API-verified data unless the user has authorized seller access.
- **TikTok Shop:** Confirm TikTok Shop is available in the target country. Separate three things: (a) **sales evidence** (shop "sold" counts, authorized Seller Center or API data), (b) **popularity evidence** (views, likes, shares, creator videos, affiliate activity), and (c) **estimates** from third-party analytics. Views and engagement are T4 and must never be described as sales. Check video dates, whether virality is tied to a single creator or paid promotion, product listing rating, shop rating, and stock status. Content trends decay quickly, so apply gate G8 strictly. Use only permitted public pages and the user's authorized accounts; do not bypass app-only or login-gated surfaces.
- **Wish:** Confirm the service is operating in the target region and the data is current before including it.
- **Storefront platforms (Shopify, WooCommerce, BigCommerce, Wix, Squarespace, Square, Ecwid, Magento, PrestaShop, OpenCart, Shift4Shop, Salesforce Commerce Cloud, VTEX):** Use authorized order or product reports for the connected store only. Specify date range, order statuses included (exclude cancelled, refunded, and test orders unless the user wants them), net vs. gross figures, and currency. Do not expose customer personal data; use aggregates.
