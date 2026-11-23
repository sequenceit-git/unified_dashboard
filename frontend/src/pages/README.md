# `src/pages` — File Structure

Pages that are not about one shop (login, overview, market research, settings, sub-admins).
Each folder owns its route page plus every component only that page uses.

Shop pages (analytics, products, inventory, orders, customers, inbox, returns, …) are not here:
each shop has its own copies in `src/marketplaces/<key>/sections/<section>/`, served at
`/<shop>/<section>` (see `src/marketplaces/README.md`).

```
pages/
├── README.md
├── auth/            # Public. Login.jsx (route: /login)
├── dashboard/       # Overview.jsx (route: /, route key: dashboard)
├── discovery/       # ProductDiscoveryPage.jsx (route: /market-research, route key: market-research)
├── settings/        # SettingsPage.jsx (route: /settings)
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
  marketplace registry `src/marketplaces/` (see its README), auth `src/auth/AuthContext.jsx`.
- **Shop pages and everything they use** live in `src/marketplaces/<key>/`, never here and
  never as `marketplace === '...'` checks.
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
