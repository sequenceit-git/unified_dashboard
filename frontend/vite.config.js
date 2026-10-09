import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Frontend env comes from its own files only: frontend/.env.local, frontend/.env
// (Vite default). Never the repo-root .env — it isn't deployed, each Vercel
// project only sees its own Root Directory.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
