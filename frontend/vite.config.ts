/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work from any sub-path (GitHub Pages serves it at /<repo>/).
// fs.allow '..' lets the dev server read the shared JSON data in ../backend.
// VITE_TILES=off is the single-file build for sandboxed hosts (tools/build-artifact.mjs): no code splitting.
const singleFile = process.env.VITE_TILES === 'off';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  build: singleFile ? { rollupOptions: { output: { inlineDynamicImports: true } } } : {},
  test: { environment: 'node' },
});
