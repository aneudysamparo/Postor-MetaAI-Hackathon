import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The browser only talks to /api; Vite forwards it to the NestJS API so the
// Meta key and every model call stay server-side.
const API_TARGET = process.env.POSTOR_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
