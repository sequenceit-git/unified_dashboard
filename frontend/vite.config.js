import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// VITE_* values come from the repo-root .env, the same file as the backend.
// https://vite.dev/config/
export default defineConfig({
  envDir: root,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
})
