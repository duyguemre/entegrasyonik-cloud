/**
 * frontend/src/composables/usePageAbout.ts
 *
 * DS-v2 Aşama 5 — "Sayfa hakkında" panelinin açık/kapalı tercihi. TEK tercih, tüm sayfalar (bir sayfada açılınca
 * diğerlerinde de açık gelir); varsayılan KAPALI. Kişisel kolaylık → yerel depo (`ek.ui.v1.pageAbout`); erişilemezse
 * (gizli mod, engelli depo) yalnız bellekte tutulur, sayfa yine çalışır.
 */
import { ref } from 'vue'

const KEY = 'ek.ui.v1.pageAbout'

function read(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

// Modül düzeyi: tüm sekmelerdeki EkPageBar örnekleri aynı değeri paylaşır.
const open = ref(read())

export function usePageAbout() {
  function setOpen(value: boolean) {
    open.value = value
    try {
      localStorage.setItem(KEY, value ? '1' : '0')
    } catch {
      // depo yoksa tercih yalnız bu oturumda kalır
    }
  }
  return { open, setOpen, toggle: () => setOpen(!open.value) }
}

/** Test yardımcısı: modül durumunu depodan yeniden okur. */
export function __resetPageAboutForTest() {
  open.value = read()
}
