/**
 * frontend/src/composables/useDeviceInput.ts
 *
 * MOB-02/MOB-03 — cihaz girişleri (kamerayla fotoğraf, barkod okuma) yalnız telefon/tablette görünür:
 * mobil genişlik (< 768, kabukla aynı eşik) YA DA birincil işaretçi dokunmatik (tablet). Masaüstü kabuğunda
 * (Electron) kamera izni politikası gereği reddedilir → hiç gösterilmez. Masaüstü tarayıcıda gizli; aynı işler
 * dosya seçimi ve arama kutusuyla zaten yapılır.
 */
import { computed } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { useShellBreakpoints } from '@/composables/useShellBreakpoints'
import { isDesktopShell } from '@/pwa/pwaState'

export function useDeviceInput() {
  const { isMobile } = useShellBreakpoints()
  const coarse = useMediaQuery('(pointer: coarse)')
  const desktopShell = isDesktopShell()
  const showDeviceInput = computed(() => !desktopShell && (isMobile.value || coarse.value))
  return { showDeviceInput }
}
