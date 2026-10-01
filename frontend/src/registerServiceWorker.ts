// Service Worker kaydı (R7 / T-18, G-03; MOB-01).
//
// Eskiden `index.html` içinde SATIR İÇİ bir <script> idi; CSP `script-src 'self'` satır içi betiği
// engelleyeceği için modüle taşındı. Kayıt hatası uygulamayı etkilemez; sessizce yutulur.
// MOB-01: geliştirmede (Vite modülleri önbelleğe girmesin) ve masaüstü kabuğunda (Electron, DESK-00) SW KAYDEDİLMEZ.
// Güncelleme: yeni SW `waiting` durumuna geçince `pwaState.waitingWorker` dolar → `PwaPrompts.vue` "Yeni sürüm hazır" der;
// kullanıcı "Yenile" deyince SKIP_WAITING → `controllerchange` → tek yenileme.
import { pwaState, isDesktopShell, type InstallPromptEvent } from './pwa/pwaState'

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

if (!isDesktopShell()) {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault() // tarayıcının kendi bandı yerine sakin kurulum kartı (PwaPrompts.vue)
    pwaState.installEvent = event as InstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    pwaState.installEvent = null
  })
}

if ('serviceWorker' in navigator && !import.meta.env.DEV && !isDesktopShell()) {
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !pwaState.waitingWorker) return
    reloaded = true
    window.location.reload()
  })
  const register = () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(trackWaiting)
      .catch(() => {
        // kayıt başarısız: SW olmadan çalışmaya devam edilir
      })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register)
}
