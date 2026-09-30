/*
 * Entegrasyonik tema önyüklemesi (ADR-0026 Karar 3.4) — EŞZAMANLI, modül olmayan betik; <head>'de CSS'ten ÖNCE.
 * İlk karede doğru tema: html[data-theme], .ek-dark ve color-scheme (tarayıcının varsayılan zemini de koyulaşır).
 * Depolama anahtarı betik etiketinin data-storage-key özniteliğinden gelir (ek-theme | ek-bo-theme).
 * Kural `themePreference.ts` ile AYNI: ?theme= > kayıtlı tercih > sistem. (Kaynak: packages/ui/src/theme/theme-boot.js;
 * uygulamaların public/ kopyaları bununla bayt bayt aynı olmalı — tests/theme-boot.test.ts.)
 */
(function () {
  var root = document.documentElement
  var script = document.currentScript
  var key = (script && script.getAttribute('data-storage-key')) || 'ek-theme'
  var mode = null
  try {
    var q = new URLSearchParams(location.search).get('theme')
    if (q === 'dark' || q === 'light') mode = q
  } catch (e) {}
  if (!mode) {
    var pref = 'system'
    try {
      var stored = localStorage.getItem(key)
      if (stored === 'light' || stored === 'dark' || stored === 'system') pref = stored
    } catch (e) {}
    if (pref === 'system') {
      mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } else {
      mode = pref
    }
  }
  root.setAttribute('data-theme', mode)
  if (mode === 'dark') root.classList.add('ek-dark')
  root.style.colorScheme = mode
})()
