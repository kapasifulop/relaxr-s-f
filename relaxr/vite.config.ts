import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.ELECTRON === "true" ? './' : ".",
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['electron', 'fs', 'path']
    }
  },
  optimizeDeps: {
    exclude: ['electron', 'fs', 'path']
  }
})
