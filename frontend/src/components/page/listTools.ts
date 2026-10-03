/**
 * P03 (PROPOSALS_PENDING, K49 onayı) — sekmeli ekranlarda araç satırı başlık çubuğunda.
 *
 * Sekmeli bir sayfa (Finans, İşlem kayıtları) `EkPageHeader tools-id="…"` ile başlık çubuğunun eylem alanında bir yuva
 * açar ve `provideListToolsTarget('#…')` ile alt ağaca duyurur. Etkin sekmenin başlıksız `EkListScreen`'i arama +
 * ek eylemler + yenile'yi bu yuvaya taşır (Teleport) → FR2_PATTERNS §5 "yenile yalnız EkPageBar en sağında" sekmeli
 * ekranlarda da geçerli; etkin sekmeye göre arama ipucu değişir.
 */
import { computed, provide, ref, shallowRef, type ComputedRef, type InjectionKey, type Ref, type ShallowRef } from 'vue'

export const LIST_TOOLS_TARGET: InjectionKey<string> = Symbol('ek-list-tools-target')

/** `toolsId` yalnız [A-Za-z0-9_-] içermeli (useId çıktısı temizlenir). Başlık yuvasının kimliğinden Teleport seçicisi üretir ve alt ağaca sağlar. */
export function provideListToolsTarget(toolsId: string): string {
  const selector = `#${toolsId}`
  provide(LIST_TOOLS_TARGET, selector)
  return selector
}

/**
 * FE-LOCAL-1047 — sekmeli ekranda "Yenile" düğmesi yok: sayfa ADINA tıklamak etkin sekmenin listesini yeniler (tek
 * başlıklı listelerle aynı davranış). Sayfa `provideListRefreshHub()` ile merkezi kurar ve başlığına
 * `refreshable` / `refreshing` / `@refresh="hub.run"` bağlar; etkin sekmenin başlıksız `EkListScreen`'i kendini kaydeder.
 */
export interface ListRefreshHub {
  handler: ShallowRef<(() => void) | null>
  loading: Ref<boolean>
  available: ComputedRef<boolean>
  run: () => void
}

export const LIST_REFRESH_HUB: InjectionKey<ListRefreshHub> = Symbol('ek-list-refresh-hub')

export function provideListRefreshHub(): ListRefreshHub {
  const handler = shallowRef<(() => void) | null>(null)
  const loading = ref(false)
  const hub: ListRefreshHub = { handler, loading, available: computed(() => !!handler.value), run: () => handler.value?.() }
  provide(LIST_REFRESH_HUB, hub)
  return hub
}
