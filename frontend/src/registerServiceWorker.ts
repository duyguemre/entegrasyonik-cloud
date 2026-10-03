// Service Worker kaydı (R7 / T-18, G-03).
//
// Eskiden `index.html` içinde SATIR İÇİ bir <script> idi; CSP `script-src 'self'` satır içi betiği
// engelleyeceği için modüle taşındı (davranış AYNI: sayfa yüklenince `/service-worker.js` kaydedilir).
// Kayıt hatası uygulamayı etkilemez; sessizce yutulur (yeni `console.*` eklenmez — ADR-0017 D logger'ı gelecek).
if ('serviceWorker' in navigator) {
  const register = () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // kayıt başarısız: SW olmadan çalışmaya devam edilir
    })
  }
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register)
}
