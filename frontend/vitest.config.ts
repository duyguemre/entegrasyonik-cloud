import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// ADR-0011 Karar 4 — Vitest (birim/statik + tema characterization).
// Ayrı bir config dosyası: `vite.config.mts`'e dokunmuyoruz (T1a kapsamı
// yalnızca test/tooling ekler, mevcut build/dev yapılandırmasını değiştirmez).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    css: false,
    server: {
      deps: {
        // vuetify + @mdi/font CSS/labs alt-modülleri node_modules'ta
        // externalize edilirse Vite'ın CSS/asset dönüşümünden geçmez
        // ("Unknown file extension .css" hatası). Bunları Vite'a transform
        // ettirerek (css:false ile no-op'a indirerek) gerçek vuetify.ts'i
        // değiştirmeden içe aktarabiliyoruz.
        inline: [/vuetify/, /@mdi\/font/],
      },
    },
  },
})
