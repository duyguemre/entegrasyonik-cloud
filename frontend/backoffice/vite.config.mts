import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// Backoffice (ADR-0026 Karar 1). Port 3100 — müşteri uygulaması 3000'de.
// Takma adlar:
//   @bo → backoffice/src (bu uygulamanın kendi kodu)
//   @   → frontend/src — YALNIZ @entegrasyonik/ui köprüsünden gelen DS bileşenlerinin kendi içindeki `@/design/…`
//         importları için (köprü modu, packages/ui/README.md). Backoffice kodu `@/` kullanmaz (tests/static.test.ts).
export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls } }), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      '@bo': fileURLToPath(new URL('./src', import.meta.url)),
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
    dedupe: ['vue', 'vuetify', 'pinia', 'vue-router', 'vue-i18n'],
  },
  server: { port: 3100, strictPort: true, host: '0.0.0.0' },
  preview: { port: 3101, strictPort: true },
  build: { sourcemap: 'hidden' },
})
