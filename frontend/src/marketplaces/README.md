# Marketplaces (frontend)

Each shop's UI lives in its folder; shared pages ask the registry instead of checking shop names
(`test/structure.test.mjs` enforces this).

```
marketplaces/
  index.js          registry: SHOPS, KEYS, getShop(key | urlId), MARKETPLACES, marketplaceLabel,
                    marketplaceBadgeColor, EVIDENCE_LABELS
  shared/actions.jsx  action-column builders (returns, cancellations, promotions)
  <key>/            ebay | tiktok_shop | temu
    index.js        label, urlId, icon, colours (theme), sidebar subsections, section files,
                    promotion / cancellation / live-update rules, listing field set and
                    validators, listing defaults, buyer links
    sections/<id>.jsx  { tableActions: { [tableId]: (row, { onAction, marketplace }) => node } }
    listing/        this shop's listing rules (validators) and form fields
```

`ShopSectionPage` adds an Action column only when the shop's section file defines
`tableActions` for that table. The action handlers (`onAction` types) stay in the page.

To add a section: add it to `subsections` in `<key>/index.js` (sidebar + sub-admin access), and a
`sections/<id>.jsx` registered under `sections` if its tables have buttons.
