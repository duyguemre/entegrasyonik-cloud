/**
 * frontend/src/composables/usePageAbout.ts
 *
 * "Sayfa rehberi" AÇMA İSTEĞİ (ör. uygulama çubuğundaki "Bu sayfa hakkında"). Rehber artık sayfa içinde kalıcı bir
 * panel değil, ışık düğmesinin altında yüzen bir kart (EkPageBar): istek yalnız GÖRÜNEN sayfa çubuğunu açar ve
 * tüketilir. Kalıcı tercih YOK — eskiden "açık" tercihi hatırlanıyordu; yüzen kartta her sayfa açılışında kartın
 * kendiliğinden açılmasına yol açardı. Eski depo anahtarı bir kez temizlenir.
 */
import { ref } from 'vue'

const LEGACY_KEY = 'ek.ui.v1.pageAbout'
try {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_KEY)
} catch {
  // depo yoksa yapılacak bir şey yok
}

// Modül düzeyi: tüm sekmelerdeki EkPageBar örnekleri aynı isteği görür; görünen çubuk tüketir.
const open = ref(false)

export function usePageAbout() {
  function setOpen(value: boolean) {
    open.value = value
  }
  return { open, setOpen, toggle: () => setOpen(!open.value) }
}

/** Test yardımcısı: isteği sıfırlar. */
export function __resetPageAboutForTest() {
  open.value = false
}
