import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const base = '/emrot-lots-phone/'

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'assets/cars/**/*'],
      manifest: {
        name: 'Legacy of the Spy Phone',
        short_name: 'Spy Phone',
        description: 'Tilt the phone to reveal hidden numbers on car photos.',
        theme_color: '#0a0a0f',
        background_color: '#0a0a0f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,webp,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
})
