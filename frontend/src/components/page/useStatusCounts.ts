/**
 * frontend/src/components/page/useStatusCounts.ts
 *
 * FE-LOCAL-1046 — bölüm panoları için "anahtar başına kayıt sayısı" yükleyicisi. Özel istatistik ucu olmayan
 * listelerde (fatura, mesaj) sayılar LİSTE UCUNDAN alınır: her anahtar için aynı uç, o süzmeyle ve `limit: 1` ile
 * çağrılır; backend'in döndürdüğü toplam kayıt sayısı (`totalNumberOfRecords`) okunur. Uydurma / tahmini sayı yok;
 * çağrı başarısızsa o anahtar `null` kalır (ekranda "—").
 */
import { ref, type Ref } from 'vue'

export interface StatusCounts<K extends string> {
  counts: Ref<Record<K, number | null>>
  loading: Ref<boolean>
  load: () => Promise<void>
}

export function useStatusCounts<K extends string>(keys: readonly K[], fetchCount: (key: K) => Promise<number | null>): StatusCounts<K> {
  const empty = () => Object.fromEntries(keys.map((k) => [k, null])) as Record<K, number | null>
  const counts = ref(empty()) as Ref<Record<K, number | null>>
  const loading = ref(true)
  let seq = 0

  const load = async () => {
    const mine = ++seq
    loading.value = true
    const results = await Promise.all(
      keys.map(async (k) => {
        try {
          return await fetchCount(k)
        } catch {
          return null
        }
      }),
    )
    if (mine !== seq) return
    counts.value = Object.fromEntries(keys.map((k, i) => [k, results[i]])) as Record<K, number | null>
    loading.value = false
  }

  return { counts, loading, load }
}

/** Liste yanıtından toplam kayıt sayısı; hata nesnesi / beklenmeyen gövde → null. */
export function totalOf(res: any): number | null {
  if (!res || res.isAxiosError || res.response) return null
  const n = Number(res.totalNumberOfRecords)
  return Number.isFinite(n) ? n : null
}
