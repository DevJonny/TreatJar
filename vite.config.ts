import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// `base` must match the GitHub Pages project path (github.com/DevJonny/TreatJar
// is served from https://devjonny.github.io/TreatJar/). It is hardcoded rather
// than env-gated so that `dev` serves from the same path production does — a
// runtime fetch of a public/ file that forgets import.meta.env.BASE_URL then
// fails locally instead of only in production.
export default defineConfig({
  base: '/TreatJar/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Treat Jar',
        short_name: 'Treat Jar',
        description: 'A themed reward jar — earn treats, watch the tokens pile up.',
        start_url: '/TreatJar/',
        scope: '/TreatJar/',
        display: 'standalone',
        // Locked to portrait: the jar is a tall vessel and the pile is laid out
        // against the viewport height. Landscape gives it a letterbox to fall in.
        orientation: 'portrait',
        background_color: '#1b1a17',
        theme_color: '#1b1a17',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
