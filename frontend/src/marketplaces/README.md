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
    listing/        rules.js (validators), shop-only form fields, and the shop's parts of the
                    listing dialogs: listFields/ (List), productFields/ (New/Edit product),
                    draftFields/ (Direct listing)
```

`ShopSectionPage` adds an Action column only when the shop's section file defines
`tableActions` for that table. The action handlers (`onAction` types) stay in the page.

To add a section: add it to `subsections` in `<key>/index.js` (sidebar + sub-admin access), and a
`sections/<id>.jsx` registered under `sections` if its tables have buttons.

## Listing dialogs

`ListModal`, `ProductModal` and `DirectListModal` render the shop-specific parts through
`shared/ListingSlot`: `<ListingSlot marketplace={…} form="listFields" name="category" ctx={slotCtx} />`
shows the component registered at `listing.listFields.category` in the shop's `index.js`, or the
children given as the default. Each part receives the dialog's state and setters as `ctx`. A shop
that registers nothing for a slot shows the default (or nothing).
