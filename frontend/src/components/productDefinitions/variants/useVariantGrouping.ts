/**
 * frontend/src/components/productDefinitions/variants/useVariantGrouping.ts
 *
 * B1 — varyant SEÇENEK GRUPLAMA deseninin tek kaynağı. Ürün güncelle varyant ızgarası (`grid/VariantGrid.vue`) ve ürün
 * listesindeki satır altı varyant listesi (`ProductVariantListComponent.vue`) aynı sırayı ve aynı rowspan'lı grup hücresini
 * (`VariantGroupCell.vue`) kullanır:
 *   · grup sırası = grup seçeneğinin (ör. Renk) TANIM sırası (alfabetik değil),
 *   · grup içi = seçili kolon sıralaması, yoksa kalan seçeneklerin tanım sırası (S, M, L, XL),
 *   · gruplama / rowspan hesabı `grid/variantSheet.ts` (`groupRows`, `windowRowspans`) — burada yeniden yazılmaz.
 * Saf kısım (`sortGrouped`) Vue'dan bağımsızdır (`tests/b1-variant-grouping.test.ts`).
 */
import { useChoicesStore } from '@/stores/choicesStore'
import { choiceOrderComparator, groupRows, type GroupedRow } from './grid/variantSheet'

type Cmp<T> = (a: T, b: T) => number

export interface SortGroupedOptions<T> {
  /** Grup karşılaştırıcısı (grup seçeneğinin tanım sırası). */
  groupCmp: Cmp<T>
  /** Grup içi kolon sıralaması (yönü uygulanmış); eşitlikte `fallback`. */
  cmp?: Cmp<T> | null
  /** Seçenek tanım sırası (tüm seçenekler). */
  fallback: Cmp<T>
  /** Tüm sırayı ters çevir (seçenek kolonunda azalan yön) — gruplar ardışık kalır. */
  reverse?: boolean
}

/** Grupları bozmadan sıralar: önce grup, sonra kolon, sonra seçenek tanım sırası. */
export function sortGrouped<T>(list: readonly T[], o: SortGroupedOptions<T>): T[] {
  const out = [...list].sort((a, b) => o.groupCmp(a, b) || (o.cmp ? o.cmp(a, b) : 0) || o.fallback(a, b))
  return o.reverse ? out.reverse() : out
}

/** Varyantın grup seçeneği: ızgarada ilk seçenek; listede ayırıcı (`slicer`) seçenek, yoksa ilk. */
export type GroupChoiceOf = (v: any) => { choiceId?: string; choiceValueId?: string } | undefined

export const firstChoice: GroupChoiceOf = (v) => v?.choices?.[0]

export function useVariantGrouping(groupChoiceOf: GroupChoiceOf = firstChoice) {
  const choicesStore = useChoicesStore()

  const valueOrder = (choiceId: string, valueId: string) => {
    const values = choicesStore.getChoiceValues(choiceId as any) as any[] | undefined
    const i = values ? values.findIndex((x: any) => x._id === valueId) : -1
    return i < 0 ? 9999 : i
  }
  const valueTitle = (valueId: string) => choicesStore.getDirectChoiceValueTitle(valueId) || ''
  const byChoices = choiceOrderComparator(valueOrder, valueTitle)

  const groupCmp = (a: any, b: any) => {
    const x = groupChoiceOf(a); const y = groupChoiceOf(b)
    if (!x?.choiceId || !y?.choiceId) return 0
    return valueOrder(x.choiceId, x.choiceValueId as string) - valueOrder(y.choiceId, y.choiceValueId as string)
      || valueTitle(x.choiceValueId as string).localeCompare(valueTitle(y.choiceValueId as string), 'tr')
  }

  const groupKeyOf = (v: any) => groupChoiceOf(v)?.choiceValueId ?? ''

  /** Grup hücresi metni (ör. "Siyah"). */
  const groupLabel = (v: any) => {
    const c = groupChoiceOf(v)
    return c?.choiceId ? (choicesStore.getChoiceValueName(c.choiceId as any, c.choiceValueId) || '—') : '—'
  }

  /** Grup kolonu başlığı (ör. "Renk"). */
  const groupTitle = (variants: any[] | undefined, fallback = 'Grup') => {
    const first = variants?.find((v) => groupChoiceOf(v)?.choiceId)
    return (first && choicesStore.getChoiceTitle(groupChoiceOf(first)!.choiceId as any)) || fallback
  }

  function order<T>(list: readonly T[], cmp?: Cmp<T> | null, reverse = false): T[] {
    return sortGrouped(list, { groupCmp, cmp, fallback: byChoices, reverse })
  }

  function group<T>(ordered: T[]): GroupedRow<T>[] {
    return groupRows(ordered, groupKeyOf)
  }

  return { valueOrder, valueTitle, byChoices, groupCmp, groupKeyOf, groupLabel, groupTitle, order, group }
}
