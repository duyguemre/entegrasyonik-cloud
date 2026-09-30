import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// Backoffice (ADR-0026 Karar 1). Port 3100 — müşteri uygulaması 3000'de.
// Takma ad: @bo → backoffice/src (bu uygulamanın kendi kodu). Tasarım sistemi YALNIZ @entegrasyonik/ui paketinden
// gelir (tokens/theme/components/styles); müşteri uygulamasının kaynağına (`@/`) hiçbir bağ yoktur.
export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls } }), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      '@bo': fileURLToPath(new URL('./src', import.meta.url)),
    },
    dedupe: ['vue', 'vuetify', 'pinia', 'vue-router', 'vue-i18n'],
  },
  server: { port: 3100, strictPort: true, host: '0.0.0.0' },
  preview: { port: 3101, strictPort: true },
  build: { sourcemap: 'hidden' },
})
