# Unified Dashboard (EcomPilot)

One dashboard for running **eBay**, **TikTok Shop** and **Temu** stores together: a single catalog, unified orders, customers, inventory and analytics, stock kept in sync across shops, a shared inbox with an AI auto-reply, and an AI product-discovery agent. Sub-admins get per-shop, per-section access.

Live at `https://manage.ecompilot.si`.

## Stack

- **Backend:** Node 24, Express 5, Mongoose 9 (MongoDB), BullMQ + Redis for sync jobs, OpenAI for the inbox bot and discovery agent.
- **Frontend:** React 19, Vite, React Router, Tailwind CSS v4, Recharts.
- **Hosting:** Docker Compose behind Traefik, with MongoDB Atlas.

## Local setup

```sh
npm run install:all     # root, backend and frontend dependencies
cp .env.example .env    # then fill in the values (variable list below)
npm run dev             # backend on :5001, frontend on :5173 (Vite proxies /api)
npm run seed            # optional: seed an admin user and sample data
```

## Environment variables

Every variable lives in the repo-root `.env`. Docker reads it with `env_file: ./.env`. Values are never committed. Only the names are listed here.

| Area | Variables |
|---|---|
| Server | `PORT`, `NODE_ENV`, `CLIENT_URL`, `PUBLIC_URL`, `DOMAIN` (Traefik host rule) |
| Database / queue | `MONGODB_URL` (or `MONGO_URI`), `REDIS_URL`, `SYNC_WORKER_INLINE`, `SYNC_CONCURRENCY` |
| Auth & secrets | `JWT_SECRET`, `JWT_EXPIRES_IN`, `SETTINGS_SECRET`, `PII_ENCRYPTION_KEY` |
| First admin (seed) | `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD` |
| Sync schedule | `ORDER_AUTO_SYNC`, `ORDER_SYNC_MINUTES`, `ORDER_BACKUP_MINUTES`, `LISTING_AUTO_SYNC`, `LISTING_SYNC_MINUTES`, `LISTING_BACKUP_MINUTES`, `INBOX_AUTO_SYNC`, `INBOX_SYNC_MINUTES`, `INBOX_BACKUP_MINUTES`, `ACCESS_AUTO_CHECK` |
| eBay | `EBAY_ENV`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_DEV_ID`, `EBAY_RUNAME`, `EBAY_ACCESS_TOKEN`, `EBAY_NOTIFY_URL`, `EBAY_NOTIFY_EVENTS`, `EBAY_DELETION_ENDPOINT`, `EBAY_VERIFICATION_TOKEN` |
| TikTok Shop | `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET`, `TIKTOK_SHOP_SERVICE_ID`, `TIKTOK_WEBHOOK_URL` |
| Temu | `TEMU_APP_KEY`, `TEMU_APP_SECRET` |
| AI | `OPENAI_API_KEY` (or `OPENAI_API`), `OPENAI_MODEL` |
| Frontend (build time) | `VITE_API_URL` |

## Deploy

Production runs on a VPS with Docker Compose (`mongo`, `redis`, `backend`, `frontend`) behind Traefik. The data lives in MongoDB Atlas. Marketplace sync jobs run **inside the `backend` container** (`SYNC_WORKER_INLINE=true`, queued in Redis). There is no separate worker container.

```sh
git pull
docker compose up -d --build backend            # add `frontend` when UI code changed
docker compose exec backend npm run smoke:ebay  # or smoke:tiktok / smoke:temu: live read-only API checks
```

Marketplace webhooks: `POST /api/ebay/notifications`, `/api/ebay/deletion`, `/api/tiktok/webhooks`, `/api/temu/webhooks`.

## Tests

```sh
cd backend && npm test      # node --test; marketplace APIs are stubbed, no network or database
cd frontend && npm run build && npm run lint
```

## Folder map

> Target layout. The restructure in [`docs/restructure-plan.md`](docs/restructure-plan.md) is in progress; until it finishes, shop code still partly lives in `backend/services/marketplace/`.

```
backend/
  marketplaces/<ebay|tiktok_shop|temu>/   all code for one shop: API client, orders, listings,
                                          webhooks, profile, sections/ (one file per sidebar section), scripts/, test/
  services/marketplace/                   shared sync core (no shop names inside)
  services/core/                          cache, redis, sync queue, events, notifications
  services/<domain>/                      catalog, sales, inbox, research, auth, analytics, system
  routes/                                 thin HTTP layer
  models/ middleware/ utils/ agent/discovery/
frontend/src/
  marketplaces/<shop>/                    sections/ (buttons per section), listing/ (form fields + validation), settings
  pages/ components/ hooks/ lib/          shared pages and UI
```

## Docs

- [`docs/features.md`](docs/features.md): feature scope
- [`docs/design.md`](docs/design.md): UI design system
- [`docs/discovery-agent.md`](docs/discovery-agent.md): product discovery agent architecture
- [`docs/restructure-plan.md`](docs/restructure-plan.md): codebase restructure plan and progress
- `.agents/skills/`: marketplace API notes for AI coding agents (`.cursor/skills` links here)
