# `src/pages` — File Structure

One folder per app section. Each folder owns its route page plus every
component only that section uses (tabs, drawers, modals, charts).

```
pages/
├── README.md
├── auth/            # Public. Login.jsx (route: /login)
├── dashboard/       # Overview.jsx (route: /, route key: dashboard)
├── analytics/       # AnalyticsPage.jsx + RevenueChart, MarketplaceChart, TopProducts
├── products/        # ProductsPage.jsx + CatalogTab, ListingsTab, ProductModal, BulkModal, ListModal
├── inventory/       # InventoryPage.jsx + StockTab, HistoryTab, LowStockTab, AdjustModal
├── orders/          # OrdersPage.jsx + OrderDrawer.jsx
├── customers/       # CustomersPage.jsx + CustomerDrawer.jsx
├── inbox/           # InboxPage.jsx + ConversationList.jsx, ThreadView.jsx
└── sub-admins/      # Super-admin only. SubAdminManagementPage.jsx, SubAdminFormPage.jsx
                     # (routes: /sub-admins, /sub-admins/new, /sub-admins/:id/edit)
```

Folder names match the URL segment (`inbox` → `/inbox`, `sub-admins` →
`/sub-admins`). Exception: `dashboard/` serves `/` (its access key in
`backend/config/access.js` `MAIN_ROUTES` is `dashboard`). `auth/` holds
public (logged-out) pages rendered outside `DashboardLayout`.

## Conventions

- **Page component** (`*Page.jsx`, `Login.jsx`, `Overview.jsx`) = data fetching
  + layout for one route. It lives at the top of its folder.
- **Section parts** (tabs, drawers, modals, charts) = plain sibling files next
  to their page. Import them as `./PartName` — never `../pages/...`.
- **Shared UI** (buttons, tables, cards, modals, inputs) lives in
  `src/components/ui/` — do not duplicate it inside a section folder.
- **Shared logic**: API client `src/lib/api.js`, data hook `src/hooks/useApi.js`,
  constants `src/lib/marketplaces.js`, auth `src/auth/AuthContext.jsx`.
- Imports inside a section use `../../auth|components|hooks|lib/...`.
- No cross-section imports: if two sections need it, promote it to
  `src/components/`.

## Adding a new section (e.g. Reports)

1. Create `pages/reports/ReportsPage.jsx` (+ its parts beside it).
2. `src/App.jsx`: import it, add `<Route path="/reports" …>` inside the
   `ProtectedRoute` block, wrapped in `<RouteAccess route="reports">`.
3. `backend/config/access.js`: add `'reports'` to `MAIN_ROUTES`.
4. `src/components/layout/Sidebar.jsx`: add the nav link (gated by access).
5. `db-schema.md` + backend route: add the API behind `requireMainRoute('reports')`.
