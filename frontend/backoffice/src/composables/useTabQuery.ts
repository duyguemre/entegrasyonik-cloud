/** Sekme ↔ `?sekme=` eşlemesi: yenilemede/paylaşılan bağlantıda aynı sekme açılır; geçersiz değer varsayılana düşer. */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export function useTabQuery<T extends string>(values: readonly T[], fallback: T, key = 'sekme') {
  const route = useRoute()
  const router = useRouter()
  return computed<T>({
    get: () => {
      const v = route.query[key]
      return typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : fallback
    },
    set: (v) => {
      router.replace({ query: { ...route.query, [key]: v === fallback ? undefined : v } })
    },
  })
}
