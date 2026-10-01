// MOB-06 — backoffice service worker kaydı (desen: uygulamanın MOB-01 `registerServiceWorker.ts`'i).
// Ayrı modül (CSP `script-src 'self'`: satır içi betik yok). Kayıt hatası paneli etkilemez; sessizce yutulur.
// Geliştirmede (`vite dev`: modüller önbelleğe girmesin, sahte /admin-api) SW KAYDEDİLMEZ.
// Güncelleme: yeni SW `waiting` → `pwaState.waitingWorker` → `PwaPrompts.vue` "Yeni sürüm hazır";
// yönetici "Yenile" deyince SKIP_WAITING → `controllerchange` → tek yenileme.
import { pwaState, type InstallPromptEvent } from './pwa/pwaState'

function trackWaiting(reg: ServiceWorkerRegistration) {
  if (reg.waiting && navigator.serviceWorker.controller) pwaState.waitingWorker = reg.waiting
  reg.addEventListener('updatefound', () => {
    const next = reg.installing
    if (!next) return
    next.addEventListener('statechange', () => {
      // İlk kurulumda (controller yok) bildirim gösterilmez; yalnız gerçek güncelleme.
      if (next.state === 'installed' && navigator.serviceWorker.controller) pwaState.waitingWorker = next
    })
  })
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault() // tarayıcının kendi bandı yerine sakin kurulum kartı (PwaPrompts.vue)
  pwaState.installEvent = event as InstallPromptEvent
})
window.addEventListener('appinstalled', () => {
  pwaState.installEvent = null
})

if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !pwaState.waitingWorker) return
    reloaded = true
    window.location.reload()
  })
  const register = () => {
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/' })
      .then(trackWaiting)
      .catch(() => {
        // kayıt başarısız: SW olmadan çalışmaya devam edilir
      })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register)
}
