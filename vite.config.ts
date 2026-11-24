/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { alphaTab } from '@coderline/alphatab-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    alphaTab(),
    // The service worker and manifest (Unit 11). Builds only: in dev the registration
    // in main.tsx does nothing. See docs/units/11-pwa-offline.md.
    VitePWA({
      // A new build waits until the user reloads from the banner (appUpdate.ts),
      // never mid-practice.
      registerType: 'prompt',
      injectRegister: false,
      // The precache globs below already take the icons.
      includeManifestIcons: false,
      manifest: {
        name: 'Drum Practice Pal',
        short_name: 'Drum Pal',
        description: 'Practise drum parts from Guitar Pro tabs, with loops, speeds and a log.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The app shell, every JS chunk (alphaTab's lazy chunk, its worker and
        // worklet included), the music font and the soundfont the player loads.
        // Not the Unit 01 spike's candidate soundfonts or the other font formats.
        globPatterns: [
          '**/*.{js,css,html,svg,png,ico,webmanifest}',
          'font/Bravura.{woff2,woff}',
          'soundfont/sonivox.sf2',
        ],
        globIgnores: ['sf-candidates/**', 'font/Bravura.svg', '**/*.gp'],
        // alphaTab's chunk is ~1.3 MB and the soundfont 1.3 MB.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Any route of the SPA opens offline from the cached index.html. Only
        // navigations: a missing file is never answered with the page.
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
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
