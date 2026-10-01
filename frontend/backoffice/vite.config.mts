import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import { defineConfig, type Plugin } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

// MOB-06 — `dist/service-worker.js` içindeki `__BO_SW_VERSION__` yer tutucusu derleme içeriğinin karmasıyla değişir
// (desen: uygulamanın MOB-01 swVersionPlugin'i). Her yeni derlemede SW dosyası değişir → "Yeni sürüm hazır" bildirimi.
function swVersionPlugin(): Plugin {
  let outDir = 'dist'
  let root = fileURLToPath(new URL('.', import.meta.url))
  const hash = createHash('sha256')
  return {
    name: 'bo-sw-version',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
      root = c.root
    },
    generateBundle(_o, bundle) {
      for (const name of Object.keys(bundle).sort()) hash.update(name)
    },
    closeBundle() {
      const file = resolve(root, outDir, 'service-worker.js')
      if (!existsSync(file)) return
      const version = hash.digest('hex').slice(0, 12)
      writeFileSync(file, readFileSync(file, 'utf8').replace(/__BO_SW_VERSION__/g, version))
    },
  }
}

// Backoffice (ADR-0026 Karar 1). Port 3100 — müşteri uygulaması 3020'de.
// Takma ad: @bo → backoffice/src (bu uygulamanın kendi kodu). Tasarım sistemi YALNIZ @entegrasyonik/ui paketinden
// gelir (tokens/theme/components/styles); müşteri uygulamasının kaynağına (`@/`) hiçbir bağ yoktur.
export default defineConfig({
  plugins: [vue({ template: { transformAssetUrls } }), vuetify({ autoImport: true }), swVersionPlugin()],
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
