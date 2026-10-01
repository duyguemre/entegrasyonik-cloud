// Plugins
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import { resolve } from 'path';

// Utilities
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  // ADR-0017 Karar 1.8 — kaynak haritası politikası: üretimde 'hidden' (haritalar
  // ÜRETİLİR ama dağıtım artefaktından çıkarılır / herkese açık yayınlanmaz; sürüm
  // etiketiyle build çıktısı olarak saklanır, admin hata olayı detayında yalnızca
  // yerelde `dev-tools/symbolicate` ile çözülür — Aşama D). Herkese açık harita YOK.
  build: {
    sourcemap: 'hidden',
    rollupOptions: {
      output: {
        // Faz 3 T3 / Aşama 0 R13 (docs/FRONTEND_CODE_AUDIT.md §9.1, P-01/P-02): tek dosyaya
        // gömme kapatıldı — büyük bağımlılıklar ayrı vendor chunk'larına bölünüyor (bkz.
        // PRODUCT_SURFACES.md §2.10.1). SADECE her ekranda kullanılan (açılışta gerekli) büyük
        // kütüphaneler adlandırılmış chunk'lara atanır; geri kalanı (yalnız tembel rotalarda
        // kullanılanlar dahil) Rollup'ın kendi otomatik bölmesine bırakılır (`return undefined`).
        // ÖNEMLİ: `quill`/`@vueup/vue-quill` için ayrı bir 'vendor-editor' kuralı YOKTU — o kural
        // Vite'ın paylaşılan `__vitePreload` yardımcısını editor chunk'ına düşürüyor, bu da
        // `main-*.js`'in editor chunk'ını STATİK import etmesine (4. `modulepreload`) ve quill'in
        // her açılışta (yalnızca 2 ürün ekranında kullanılmasına rağmen) indirilmesine yol
        // açıyordu (P-01). Kural kaldırılınca quill, onu kullanan `ProductDefinitionView`/
        // `ProductUpdateView` ile birlikte kendi tembel chunk'ına düşer (bu ekranlar zaten
        // `stores/site/menu.ts`'te `defineAsyncComponent`/dinamik `import()` ile yükleniyor).
        // `zrender`, echarts'in bağımlılığıdır ama paket adı 'echarts' İÇERMEZ; `id.includes
        // ('echarts')` onu YAKALAMIYORDU → eski catch-all'a (`'vendor'`, main tarafından statik
        // yüklenen) düşüp echarts'i (kendisi tembel) gereksiz yere açılışa taşıyordu (P-02).
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('vuetify') || id.includes('@mdi/font')) return 'vendor-vuetify'
          if (id.includes('echarts') || id.includes('zrender')) return 'vendor-echarts'
          if (
            id.includes('/vue/') ||
            id.includes('vue-router') ||
            id.includes('pinia') ||
            id.includes('vue-i18n') ||
            id.includes('@vueuse')
          ) {
            return 'vendor-vue'
          }
          return undefined
        },
      },
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  plugins: [
    vue({
      template: { transformAssetUrls },
    }),
    // https://github.com/vuetifyjs/vuetify-loader/tree/master/packages/vite-plugin#readme
    vuetify({
      autoImport: true,
/*        styles: {
        configFile: './src/styles/integrator.scss'
      }
 */    }),
  ],
  define: { 
    'process.env': {},
/*     __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false, */
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    extensions: ['.js', '.json', '.jsx', '.mjs', '.ts', '.tsx', '.vue'],
  },
  server: {
    port: 3020,
    host:"0.0.0.0"
  },
})
