import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/rpc': {
        // Swapped to Blast API because Dwellir is currently down
        target: 'https://sui-testnet.public.blastapi.io',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/rpc/, '')
      }
    }
  }
})