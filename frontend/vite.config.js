import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        merchant: resolve(__dirname, 'merchant.html'),
        support: resolve(__dirname, 'support.html'),
      },
    },
  },
  server: {
    // Allow CORS for backend API calls
    cors: true,
  },
})
