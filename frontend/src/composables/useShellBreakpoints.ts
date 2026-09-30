/**
 * frontend/src/composables/useShellBreakpoints.ts
 *
 * ADR-0015 Karar 2.2 — kabuk (kenar menü/üst çubuk/sekme şeridi) kırılım
 * kararı, Vuetify `display.thresholds`'a DEĞİL, ADR-0011/ADR-0012 token
 * sabitlerine (`breakpoint.tablet=768`, `breakpoint.desktop=1024`) bağlıdır.
 *
 * `SecureLayout`/`NavigationMenu`/`ApplicationBar` aynı üç
 * kırılım hesabını AYRI AYRI (kopyalanmış) yazıyordu (ADR-0012 T4a mirası,
 * `useDisplay().width` + yerel `computed`); bu composable TEK kaynağa
 * indirger — davranış AYNIdır (aynı eşikler, aynı formül), yalnızca
 * tekilleştirilmiştir.
 */
import { computed } from 'vue'
import { useDisplay } from 'vuetify'
import { breakpoint } from '@/design/tokens'

export function useShellBreakpoints() {
  const { width } = useDisplay()
  const isMobile = computed(() => width.value < breakpoint.tablet)
  const isTablet = computed(() => width.value >= breakpoint.tablet && width.value < breakpoint.desktop)
  const isDesktop = computed(() => width.value >= breakpoint.desktop)
  return { width, isMobile, isTablet, isDesktop }
}
