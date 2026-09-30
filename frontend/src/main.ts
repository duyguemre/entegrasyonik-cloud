/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

import '../public/assets/css/site.css'
// ADR-0011 Karar 1 — token omurgası (`--ek-*` CSS değişkenleri, Vuetify'a bağlı).
import '@/design/tokens/dist/tokens.app.css'
// ADR-0015 Karar 1.3/3.1 (A1) — uygulamaya özgü türev değişkenler
// (`--ek-app-*`) ve Vuetify override katmanı (radius/odak/uppercase).
// Kademe sırası: Vuetify çekirdek → token CSS değişkenleri → bu ikisi.
import '@/design/app.css'
import '@/design/vuetify-overrides.css'
// ADR-0011 Açık Soru 1 (KARARLANDI 2026-09-27) — Inter, kendi barındırılan
// (`@fontsource/inter`, CDN YOK). `--ek-font-weight-*` ile eşleşen 4 ağırlık
// (regular/medium/semibold/bold) yüklenir.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
// Plugins
import { registerPlugins } from '@/plugins'
// Components
import App from './App.vue'
// Composables
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import { usePublicConfigStore } from '@/stores/publicConfig'

import HorizontalScrollComponent from '@/components/HorizontalScrollComponent.vue';
import ScrollComponent from '@/components/ScrollComponent.vue';
import PaginationComponent from '@/components/PaginationComponent.vue';
import ReportMenuComponent from '@/components/utility/ReportMenuComponent.vue';
import BatchMenuComponent from '@/components/utility/BatchMenuComponent.vue';
import CustomDialogComponent from '@/components/CustomDialogComponent.vue';

// ADR-0017 Karar 1.8 — global hata sınırı (frontend log/hata mimarisi).
import logger from '@/composables/logger'
import { isBenignBrowserNotice, reportUnexpectedError } from '@/composables/errorReporting'

// ADR-0015 Karar 3.6 (A5) — ECharts tema adaptörü tek noktadan kaydedilir;
// tüketiciler (`StatisticsComponent` vb.) `theme="entegrasyonik"` ile bağlanır.
import * as echarts from 'echarts/core'
import { buildEchartsTheme } from '@/design/echarts-theme'
import { semanticColorsLight } from '@/design/tokens'
echarts.registerTheme('entegrasyonik', buildEchartsTheme(semanticColorsLight))

const pinia = createPinia()
const app = createApp(App)


registerPlugins(app)

app.use(pinia)

app.component('HorizontalScrollComponent', HorizontalScrollComponent)
app.component('ScrollComponent', ScrollComponent)
app.component('PaginationComponent', PaginationComponent)
app.component('ReportMenuComponent', ReportMenuComponent)
app.component('BatchMenuComponent', BatchMenuComponent)
app.component('CustomDialogComponent', CustomDialogComponent)

// ADR-0017 Karar 1.8 — "kullanıcı iletisi ≠ teknik log": Vue hata sınırı, yakalanmamış promise
// reddi ve yakalanmamış global hatalar ORTAK `reportUnexpectedError`'ı çağırır (bkz.
// `composables/errorReporting.ts`) — teknik ayrıntı logger'a, kullanıcıya yalnızca nazik bir
// bildirim + Destek kodu (mevcut Snackbar deseni, YENİ bileşen icat edilmedi).
app.config.errorHandler = (err, instance, info) => {
  const componentName = (instance as any)?.$options?.name || (instance as any)?.$?.type?.__name || (instance as any)?.$?.type?.name
  reportUnexpectedError('Vue hata sınırı yakaladı', {
    module: 'errorHandler',
    info,
    componentName,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  })
}

window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason: any = event.reason
  reportUnexpectedError('Yakalanmamış promise reddi', {
    module: 'errorHandler',
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })
})

// Not: `capture` bayrağı verilmediği için bu dinleyici kaynak yükleme hataları
// (img/script/link) YAKALAMAZ — yalnızca script çalışma zamanı hatalarını (window'a
// kadar bubble eden) yakalar; broken image gibi durumlar için gürültülü toast riski yok.
window.addEventListener('error', (event: ErrorEvent) => {
  // Tarayıcının zararsız "ResizeObserver loop …" bildirimi (bir karede tamamlanamayan boyut gözlemi — kap sorgulu
  // kart düzeni / sekme şeridi ölçümü tetikleyebilir) bir hata DEĞİLDİR: kullanıcıya "Bir şeyler ters gitti" gösterilmez,
  // yalnız sessiz teknik kayıt (Aşama 6b).
  if (isBenignBrowserNotice(event.message)) {
    reportUnexpectedError('Zararsız tarayıcı bildirimi', { module: 'errorHandler', message: event.message }, { silent: true })
    return
  }
  reportUnexpectedError('Yakalanmamış global hata', {
    module: 'errorHandler',
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error instanceof Error ? event.error.stack : undefined,
  })
})

// FE-CFG-1 (ADR-0031) — kamu açılış yapılandırması montajdan ÖNCE bir kez alınır (3 sn zaman aşımı; alınamazsa
// güvenli varsayılanlarla açılır). Sonra 5 dk'da bir / sekme görünür olunca / rota değişiminde (eskiyse) tazelenir.
const publicConfig = usePublicConfigStore(pinia)
router.afterEach(() => { void publicConfig.ensureFresh() })
publicConfig.refresh().finally(() => {
  publicConfig.startAutoRefresh()
  app.mount('#app')
})



window.onbeforeunload = function (ev) {
  var e = ev || window.event;
  logger.debug("destroy vue", { event: e });
  app.unmount();

}
/* window.addEventListener('beforeunload', async (event)=> {
    console.log("destroy vue");
    app.unmount();
    (<any>app._instance) = undefined;
    event.preventDefault();
})
 */

/* window.addEventListener('keydown', function(event) {
    console.log("event.keyCode",event.keyCode)
    if (event.keyCode === 116 || (event.keyCode === 82 && event.ctrlKey)) {
        console.log("sdfgsdfdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd")
      console.log("destroy vue");
      app.unmount();
      (<any>app._instance) = undefined;

      event.preventDefault();
  
    }
  }); */