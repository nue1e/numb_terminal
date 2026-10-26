import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/sui-rpc': {
        target: 'https://fullnode.mainnet.sui.io:443',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/sui-rpc/, ''),
      },
    },
  },
})