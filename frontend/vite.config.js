import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Single root env: VITE_* vars live in unified_dashboard/.env (envDir: '../').
// Backend port comes from the same file so the dev proxy never drifts.
// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../', '')
  const backendPort = env.PORT || 5000
  return {
    envDir: '../',
    plugins: [react(), tailwindcss()],
    server: {
      port: Number(env.VITE_PORT) || 5173,
      proxy: {
        '/api': `http://localhost:${backendPort}`,
      },
    },
  }
})
