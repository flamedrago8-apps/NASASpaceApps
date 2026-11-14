import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  // Relative base so the build works at /NASASpaceApps/ on GitHub Pages or on any custom domain.
  base: './',
  plugins: [react()],
  resolve: { alias: { '@conduit/core': path.resolve(__dirname, '../core/src/index.ts') } },
  server: { host: true, port: 5173, fs: { allow: ['..'] } },
});
