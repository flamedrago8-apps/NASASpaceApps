import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works at /NASASpaceApps/ on GitHub Pages or on any custom domain.
  base: './',
  plugins: [react()],
  server: { host: true, port: 5173 },
});
