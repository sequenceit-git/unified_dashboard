# MERN Starter (React + Express + Mongo)

## Structure
- `frontend/` — React (Vite) + React Router + Tailwind CSS v4
- `backend/` — Express + Mongoose + CORS + dotenv

## Run

One root env file: copy `.env.example` → `.env` at the repo root and fill in secrets.
Backend (`server.js`, `seed.js`) and frontend (Vite `envDir`) both read from there.

Backend:
```sh
cd backend
npm install
npm run dev            # http://localhost:5000
```

Frontend:
```sh
cd frontend
npm install
npm run dev            # http://localhost:5173
```

- Vite proxies `/api` → `http://localhost:5000` (see `frontend/vite.config.js`).
- Health check: `GET /api/health`.
- Items example: `GET /api/items`, `POST /api/items { "name": "..." }`.....
