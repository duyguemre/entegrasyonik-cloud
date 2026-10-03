// [eslesme-fiyat WP2, Ek C P0-1/B-3c] "Seçenek eşlemesinden doldur" — TEK KAYNAK `AttributeMappings` (eski `Categories.platforms` /
// `Choices.platforms` alanları backend'de YOK; eski kod hep "Eşlenecek seçenek değeri bulunamadı" diyordu). Kural sunucu
// çözümleyicisiyle (backend `integration/catalog/attributeResolver.ts`) aynı: yerel seçenek → eşlenmiş platform özelliği → eşlenmiş değer;
// formda/İçe aktarmada girilmiş değer ÖNCELİKLİ (üzerine yazılmaz). Saf fonksiyon (vitest).
import type { StoredAttr } from './channelAttributes'

export interface MappingRow {
  integrationCode: string
  localCategoryId: unknown
  isCategoryMapping?: boolean
  platformAttributeId?: string | null
  platformAttributeName?: string
  localChoiceId?: unknown
  values?: Array<{ localValueId: unknown; platformValueId?: string | null; platformValueName?: string }>
}

const filled = (v: any) => !(v === undefined || v === null || v === '' || (typeof v === 'object' && !v.attributeValue && !v.attributeValueId))

/** Varyantları YERİNDE tamamlar; eklenen değer sayısını ve hiç eşlemesi olmayan yerel seçenek kimliklerini döner. */
export function fillFromMappings(variants: any[], code: string, localCategoryId: unknown, mappings: MappingRow[]): { filled: number; unmappedChoiceIds: string[] } {
  const rows = mappings.filter((m) => m.integrationCode === code && !m.isCategoryMapping && m.platformAttributeId
    && String(m.localCategoryId) === String(localCategoryId) && m.localChoiceId)
  const mappedChoices = new Set(rows.map((m) => String(m.localChoiceId)))
  const unmapped = new Set<string>()
  let count = 0
  for (const variant of variants || []) {
    for (const ch of variant?.choices || []) if (ch?.choiceId && !mappedChoices.has(String(ch.choiceId))) unmapped.add(String(ch.choiceId))
    for (const m of rows) {
      const mine = (variant?.choices || []).find((c: any) => String(c?.choiceId) === String(m.localChoiceId))
      if (!mine) continue
      const val = (m.values || []).find((v) => String(v.localValueId) === String(mine.choiceValueId))
      if (!val) continue
      variant.platforms = variant.platforms || {}
      variant.platforms[code] = variant.platforms[code] || {}
      const attrs = (variant.platforms[code].attributes = variant.platforms[code].attributes || {})
      const key = String(m.platformAttributeId)
      if (filled(attrs[key])) continue
      const stored: StoredAttr = { attributeName: m.platformAttributeName || '', attributeValue: String(val.platformValueName ?? ''), attributeValueId: val.platformValueId ? String(val.platformValueId) : '' }
      attrs[key] = stored
      count++
    }
  }
  return { filled: count, unmappedChoiceIds: [...unmapped] }
}
