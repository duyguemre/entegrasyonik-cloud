/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 *
 * ADR-0011 Karar 1 (Faz 3 T2) — tema tanımı artık `src/design/vuetify-theme.ts`
 * (o da `src/design/tokens/**`'ten kurulur) üzerinden gelir. Ölü Vuetify 2
 * yapılandırması (`options.customProperties`, iç içe `themes: {duygu1,
 * secondary}`, `variables.font-size-root`) silindi — ADR Bağlam madde 3-4'te
 * ölü olduğu doğrulandı, davranış değişmedi (bkz. `theme-snapshot.baseline.json`
 * karakterizasyon testi).
 *
 * ADR-0015 Karar 3.1 (A1) — `defaults: vuetifyDefaults` eklendi (bileşen
 * ailesi başına tek kaynak, bkz. `src/design/vuetify-defaults.ts`). `label`
 * prop'u ve `getByLabel(...)` spec çapaları DEĞİŞMEDİ (Karar 5.1 Ek A).
 */

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
// ADR-0011 Açık Soru 1 — Vuetify'ın derlenmiş CSS'inde gömülü "Roboto"
// referanslarını `--ek-font-sans` (Inter) token'ına yönlendirir; bkz. dosya
// başı yorumu (kademe sırası + `!important` gerekçesi).
import '@/design/vuetify-font-overrides.css'
import { tr } from 'vuetify/locale' // Türkçe dil dosyasını içe aktar

// Composables
import { createVuetify } from 'vuetify'

import { VTreeview } from 'vuetify/labs/VTreeview'

import { lightTheme, darkTheme } from '@/design/vuetify-theme'
import { vuetifyDefaults } from '@/design/vuetify-defaults'

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  locale: {
    locale: 'tr',       // Varsayılan dil
    fallback: 'en',     // Hata durumunda dönüş dili
    messages: { tr },   // Dil paketlerini kaydet
  },
  components: {
    VTreeview,
  },
  icons: {
    defaultSet: "mdi",
  },
  defaults: vuetifyDefaults,

  display: {
    thresholds: {
      xs: 0, // Küçük ekranlar için
      sm: 600, // Küçük orta ekranlar için
      md: 960, // Orta ekranlar için
      lg: 1600, // Büyük ekranlar için (varsayılan)
      xl: 1920 // Çok büyük ekranlar için
    },
  },

  theme: {
    defaultTheme: 'lightTheme',
    themes: {
      lightTheme,
      darkTheme,
    },
  },
})
