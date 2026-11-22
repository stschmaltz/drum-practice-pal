/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { alphaTab } from '@coderline/alphatab-vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), alphaTab()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    // Lets phones and tablets on the same Wi-Fi reach the dev server.
    host: true,
  },
  build: {
    // alphaTab's core is ~1.3 MB minified (310 kB gzip). It's lazy-loaded with the player
    // routes, so the default 500 kB warning only flags something we've already accepted.
    chunkSizeWarningLimit: 1400,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.ts'],
  },
});
