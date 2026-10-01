/**
 * frontend/src/plugins/noFormHistory.ts
 *
 * Tarayıcı form geçmişi (Chrome'un "daha önce girilen değerler" listesi) seçim ve filtre alanlarında kapalı:
 * kategori/marka gibi listeli alanlarda bu liste uygulamanın kendi seçenek menüsünün ÖNÜNE açılıp seçimi zorlaştırıyordu.
 * Vuetify 3.8'de `autocomplete` için genel varsayılan yok → odak/işaretçi anında (Chrome listeyi açmadan önce) alanın
 * `<input>`'una `autocomplete="off"` verilir. Kapsam: v-autocomplete / v-combobox / v-select ve filtre paneli (`.ek-filter`)
 * alanları. Bilerek ayarlanmış alanlar (ör. giriş: `autocomplete="email"`) DOKUNULMAZ.
 */
const SCOPE = '.v-autocomplete, .v-combobox, .v-select, .ek-filter'

function disableHistory(event: Event) {
  const el = event.target
  if (!(el instanceof HTMLInputElement)) return
  if (el.hasAttribute('autocomplete') && el.getAttribute('autocomplete') !== 'off') return
  if (!el.closest(SCOPE)) return
  el.setAttribute('autocomplete', 'off')
}

export function installNoFormHistory() {
  if (typeof document === 'undefined') return
  document.addEventListener('pointerdown', disableHistory, true)
  document.addEventListener('focusin', disableHistory, true)
}
