# Marketplaces (frontend)

Each shop is self-contained. Its pages, every section and sub-section, and all their parts live in
its own folder; the three shops share no page code, even where the screens look alike. Shared code
outside this folder only holds building blocks (`src/components/ui`, layout, `src/lib/api.js`,
auth, `useApi`, `useShopSection`, `useShopProfiles`, live events) and reaches a shop only through
the registry. `test/structure.test.mjs` enforces all of this.

```
marketplaces/
  index.js            registry: SHOPS, KEYS, getShop(key | urlId), marketplaceLabel,
                      marketplaceBadgeColor, EVIDENCE_LABELS
  <key>/              ebay | tiktok_shop | temu
    index.js          label, urlId, icon, colours (theme), sidebar subsections, `pages`
                      (section id → page, loaded on first visit), `ListModal`, promotion /
                      cancellation / live-update settings, listing defaults, buyer links
    sections/
      <section>/      one folder per sidebar section, named after its id
        <Section>Page.jsx   the page (route /<urlId>/<section>)
        components/ hooks/  its sub-parts
        tableActions.jsx    action columns for its tables, when it has buttons
        rowActions.jsx      the action-cell builders those use
      listings/ (eBay), products/ (TikTok Shop), goods/ (Temu)
                      the shop's products page, CatalogTab, ListModal, ProductModal, DirectListModal,
                      hooks/, components/ (VariantEditor, AttributeField),
                      listing/ (rules.js validators and this shop's listing fields)
```

## Routes

`src/App.jsx` builds `/<urlId>/<section>` for every entry in each shop's `pages`. Analytics,
products, inventory, orders, customers and inbox sit behind the main-route permission and the
section gate; the other sections check access on their page. Old URLs (`/orders?shop=ebay`,
`/shop/returns?shop=tiktok`) redirect to the new ones.

## Adding a section to a shop

1. Add it to `subsections` in `<key>/index.js` (sidebar + sub-admin access) and to the backend
   profile (`backend/marketplaces/<key>/profile.js`).
2. Create `<key>/sections/<section>/<Section>Page.jsx` (+ its parts) and register it under `pages`.

Another shop wanting the same section gets its own copy in its own folder.

## Section names

Each shop names its sections after its own API, so the same kind of page has a different name per
shop: eBay `listings`, `payouts`, `buyers`, `returns-cases`, `messages`; TikTok Shop `packages`,
`finance`, `videos-live`, `returns-cancellations` (no Inbox or Creators: the shop's TikTok app is an
E-commerce connector without the Customer Service and Affiliate Seller scopes); Temu `goods`,
`shipping`, `price-reviews`, `after-sales`. The folder, URL (`/<urlId>/<id>`), sidebar id and API path use that
name. `renamedSections` on the shop maps the older generic names to them; `lib/shopRoutes.js`
redirects old URLs, gates pages by their main route (`products`, `orders`, `inbox`, …, which stay
app-wide), and finds the same section on another shop.
