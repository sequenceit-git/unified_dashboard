# MERN Starter (React + Express + Mongo)

## Structure
- `frontend/` — React (Vite) + React Router + Tailwind CSS v4
- `backend/` — Express + Mongoose + CORS + dotenv

## Run

Backend:
```sh
cd backend
npm install
cp .env.example .env   # edit MONGO_URI
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
- Items example: `GET /api/items`, `POST /api/items { "name": "..." }`.
