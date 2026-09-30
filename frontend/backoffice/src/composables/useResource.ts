/**
 * Tek okumalı kaynak durumu (panolar, detaylar): `loading` → `ready` | `error` | `degraded` (503) | `notFound` (404).
 * Yenilemede mevcut veri korunur (`refreshing`), hatada son iyi veri silinmez (`stale`). Eski yanıtlar yok sayılır.
 */
import { ref, shallowRef } from 'vue'
import { describeError, type DescribedError } from '@bo/utils/errors'

export type ResourcePhase = 'loading' | 'ready' | 'error' | 'degraded' | 'notFound'

export function useResource<T>(fetcher: () => Promise<T>) {
  const data = shallowRef<T | null>(null)
  const phase = ref<ResourcePhase>('loading')
  const error = shallowRef<DescribedError | null>(null)
  const refreshing = ref(false)
  /** Hata sonrası ekranda kalan veri eski mi? */
  const stale = ref(false)
  const loadedAt = ref<number | null>(null)
  let seq = 0

  async function load() {
    const my = ++seq
    if (data.value) refreshing.value = true
    else phase.value = 'loading'
    error.value = null
    try {
      const res = await fetcher()
      if (my !== seq) return
      data.value = res
      phase.value = 'ready'
      stale.value = false
      loadedAt.value = Date.now()
    } catch (e) {
      if (my !== seq) return
      const d = describeError(e)
      error.value = d
      if (data.value) {
        stale.value = true
      } else {
        phase.value = d.kind === 'unavailable' ? 'degraded' : d.kind === 'notFound' ? 'notFound' : 'error'
      }
    } finally {
      if (my === seq) refreshing.value = false
    }
  }

  /** Yazma sonrası yerel güncelleme. */
  function set(next: T) {
    data.value = next
    phase.value = 'ready'
  }

  return { data, phase, error, refreshing, stale, loadedAt, load, set }
}

export type Resource<T> = ReturnType<typeof useResource<T>>
