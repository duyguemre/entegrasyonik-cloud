/**
 * İmleçli (keyset) liste durumu — /admin-api liste uçlarının ortak sözleşmesi: ilk istek imleçsiz, yanıttaki opak
 * `nextCursor` AYNI filtrelerle geri gönderilir, `null` = son sayfa, filtre değişince imleç atılır.
 *
 * Durumlar: `loading` (ilk yükleme; iskelet) → `ready` | `empty` | `error` | `degraded` (503: bağımlılık hazır değil).
 * "Daha fazla" hatası listeyi silmez (`moreError`). Eski (filtre değişiminden önceki) yanıtlar yok sayılır.
 * Saf TS + Vue reaktivitesi: DOM gerektirmez (tests/composables.test.ts).
 */
import { computed, ref, shallowRef } from 'vue'
import { describeError, type DescribedError } from '@bo/utils/errors'

export type ListPhase = 'loading' | 'ready' | 'empty' | 'error' | 'degraded'

export interface CursorPage<T> {
  items: T[]
  nextCursor: string | null | undefined
}

export function useCursorList<T>(fetchPage: (cursor: string | undefined) => Promise<CursorPage<T>>) {
  const items = shallowRef<T[]>([])
  const nextCursor = ref<string | null>(null)
  const phase = ref<ListPhase>('loading')
  const error = shallowRef<DescribedError | null>(null)
  const moreError = shallowRef<DescribedError | null>(null)
  const loadingMore = ref(false)
  const refreshing = ref(false)
  let seq = 0

  async function reload(options: { keep?: boolean } = {}) {
    const my = ++seq
    // `keep`: yenilemede mevcut satırları koru (iskelet yerine yenileme göstergesi).
    if (options.keep && (phase.value === 'ready' || phase.value === 'empty')) refreshing.value = true
    else phase.value = 'loading'
    error.value = null
    moreError.value = null
    try {
      const res = await fetchPage(undefined)
      if (my !== seq) return
      items.value = res.items
      nextCursor.value = res.nextCursor ?? null
      phase.value = res.items.length ? 'ready' : 'empty'
    } catch (e) {
      if (my !== seq) return
      const d = describeError(e)
      error.value = d
      items.value = []
      nextCursor.value = null
      phase.value = d.kind === 'unavailable' ? 'degraded' : 'error'
    } finally {
      if (my === seq) refreshing.value = false
    }
  }

  async function loadMore() {
    if (!nextCursor.value || loadingMore.value) return
    const my = seq
    loadingMore.value = true
    moreError.value = null
    try {
      const res = await fetchPage(nextCursor.value)
      if (my !== seq) return
      items.value = [...items.value, ...res.items]
      nextCursor.value = res.nextCursor ?? null
    } catch (e) {
      if (my === seq) moreError.value = describeError(e)
    } finally {
      loadingMore.value = false
    }
  }

  /** Yerel iyimser güncelleme (ör. yeniden denenen işi listeden çıkar). */
  function removeWhere(pred: (item: T) => boolean) {
    items.value = items.value.filter((i) => !pred(i))
    if (!items.value.length && !nextCursor.value) phase.value = 'empty'
  }

  return {
    items,
    nextCursor,
    phase,
    error,
    moreError,
    loadingMore,
    refreshing,
    hasMore: computed(() => !!nextCursor.value),
    reload,
    loadMore,
    removeWhere,
  }
}

export type CursorList<T> = ReturnType<typeof useCursorList<T>>
