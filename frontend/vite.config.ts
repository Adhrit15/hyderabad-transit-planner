/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' makes the build work from any sub-path (GitHub Pages serves it at /<repo>/).
// fs.allow '..' lets the dev server read the shared JSON data in ../backend.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  test: { environment: 'node' },
});
