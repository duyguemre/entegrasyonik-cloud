/**
 * P03 (PROPOSALS_PENDING, K49 onayı) — sekmeli ekranlarda araç satırı başlık çubuğunda.
 *
 * Sekmeli bir sayfa (Finans, İşlem kayıtları) `EkPageHeader tools-id="…"` ile başlık çubuğunun eylem alanında bir yuva
 * açar ve `provideListToolsTarget('#…')` ile alt ağaca duyurur. Etkin sekmenin başlıksız `EkListScreen`'i arama +
 * ek eylemler + yenile'yi bu yuvaya taşır (Teleport) → FR2_PATTERNS §5 "yenile yalnız EkPageBar en sağında" sekmeli
 * ekranlarda da geçerli; etkin sekmeye göre arama ipucu değişir.
 */
import { provide, type InjectionKey } from 'vue'

export const LIST_TOOLS_TARGET: InjectionKey<string> = Symbol('ek-list-tools-target')

/** `toolsId` yalnız [A-Za-z0-9_-] içermeli (useId çıktısı temizlenir). Başlık yuvasının kimliğinden Teleport seçicisi üretir ve alt ağaca sağlar. */
export function provideListToolsTarget(toolsId: string): string {
  const selector = `#${toolsId}`
  provide(LIST_TOOLS_TARGET, selector)
  return selector
}
