/**
 * Sayfa hükmünün (utils/verdict.ts) kaynakları: birkaç özet okuması (`useResource`) tek yerde.
 *  - `settled`: hepsi ilk yanıtı aldı (başarılı ya da hatalı) → hüküm çizilebilir; öncesi "Durum okunuyor…".
 *  - `failed(k)`: kaynak hiç okunamadı (veri yok) → hüküm "okunamadı" maddesi yazar, "sağlıklı" demez.
 *  - `stale`: bir kaynak yenilenemedi, son iyi veri ekranda → `BoPageHeader :stale` (NT-07).
 *  - `updatedAt`: en ESKİ başarılı okuma anı (hüküm en eski kaynak kadar tazedir).
 */
import { computed } from 'vue'
import { useResource, type Resource } from '@bo/composables/useResource'

type Fetchers = Record<string, () => Promise<unknown>>
type Sources<F extends Fetchers> = { [K in keyof F]: Resource<Awaited<ReturnType<F[K]>>> }

export function useVerdictSources<F extends Fetchers>(fetchers: F) {
  const sources = Object.fromEntries(Object.entries(fetchers).map(([k, f]) => [k, useResource(f)])) as unknown as Sources<F>
  const all = () => Object.values(sources) as Array<Resource<unknown>>

  const settled = computed(() => all().every((r) => r.phase.value !== 'loading' || r.data.value !== null))
  const refreshing = computed(() => all().some((r) => r.refreshing.value || (r.phase.value === 'loading' && r.data.value === null)))
  const stale = computed(() => all().some((r) => r.stale.value))
  const updatedAt = computed(() => {
    const times = all()
      .map((r) => r.loadedAt.value)
      .filter((t): t is number => t !== null)
    return times.length ? Math.min(...times) : undefined
  })

  function failed(key: keyof F): boolean {
    const r = sources[key] as Resource<unknown>
    return r.data.value === null && r.phase.value !== 'loading'
  }

  function load() {
    return Promise.all(all().map((r) => r.load()))
  }

  return { sources, settled, refreshing, stale, updatedAt, failed, load }
}
