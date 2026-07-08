import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache only the app shell; audio is fetched from the CDN on demand.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Demo tracks live on the CDN — cache them the first time they play
            // so later sessions (and offline use) can reuse them.
            urlPattern: /^https:\/\/demo\.sebastiaanjansen\.be\/.*\.(?:mp3|ogg|wav|m4a|flac)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-cache',
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Fri3d Scratcher',
        short_name: 'Scratcher',
        description: 'A two-deck DJ mixer with real turntable scratching, right in your browser.',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
