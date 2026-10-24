import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built dashboard opens from any folder or static host.
  base: './',
  plugins: [react()],
  // Sample traces live in ../samples and are bundled in at build time.
  server: { fs: { allow: ['..'] } },
})
