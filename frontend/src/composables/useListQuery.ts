/**
 * X-01 / F-CL3a — sunucu sayfalamalı liste ekranlarının ortak sorgu durumu.
 *
 * Kapsam bilinçli olarak dar: filtre formu, son sorgulanan filtreler (çipler için), sıralama, sayfa,
 * yükleme/hata, BAYAT YANIT koruması (istek sıra numarası: yalnız son isteğin yanıtı yazılır) ve
 * debounce'lu arama (V-02). İstek gövdesini ve yanıt eşlemesini EKRAN kurar (`fetch`) — servis
 * sözleşmeleri ekranlar arasında farklıdır; `listPayload` yalnız ortak `{pagination, sort, filter}`
 * biçimini üretir. Kolon/çip/kayıtlı görünüm/eylem mantığı ekranda kalır.
 *
 * Ayrıntı: frontend/DESIGN_SYSTEM.md §19.
 */
import { getCurrentScope, onScopeDispose, ref, shallowRef, type Ref } from 'vue'

/** Grid/Vuetify sıralama öğesi (sunucu alan adı + yön). */
export interface ListSort { key: string; order: 'asc' | 'desc' }

/** `fetch`'e verilen anlık sorgu. */
export interface ListQuery<F> { filters: F; page: number; limit: number; sortBy: ListSort[] }

/** `fetch` dönüşü. `null` → yanıtta liste yok, mevcut satırlar korunur. Hata için FIRLAT. */
export type ListPage<T> = { items: T[]; total: number } | null

export interface UseListQueryOptions<F extends { globalSearch: string }, T> {
  /** Boş filtre formu (sıfırlamada da kullanılır). */
  filters: () => F
  fetch: (query: ListQuery<F>) => Promise<ListPage<T>>
  sortBy?: ListSort[]
  limit?: number
  /** Arama kutusu gecikmesi (ms). Plan V-02: 350. */
  debounceMs?: number
}

export const LIST_SEARCH_DEBOUNCE_MS = 350

/** Dizileri kopyalayan sığ klon (filtre değerleri düz: metin, tarih metni, kod dizisi). */
function snapshot<F extends object>(f: F): F {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(f)) out[k] = Array.isArray(v) ? [...v] : v
  return out as F
}

/** Ortak sunucu gövdesi: `{ pagination:{page,limit}, sort:{field,direction}, filter }` (Order/Claim/Customer). */
export function listPayload<F extends object>(q: ListQuery<F>) {
  return {
    pagination: { page: q.page, limit: q.limit },
    sort: { field: q.sortBy[0]?.key, direction: q.sortBy[0]?.order },
    filter: { ...q.filters },
  }
}

export function useListQuery<F extends { globalSearch: string }, T = any>(options: UseListQueryOptions<F, T>) {
  const filters = ref(options.filters()) as Ref<F>
  /** Son SORGULANAN filtreler — aktif filtre çipleri/kayıtlı görünüm bundan okunur. */
  const applied = ref(snapshot(filters.value)) as Ref<F>
  const sortBy = ref<ListSort[]>(options.sortBy ? [...options.sortBy] : [])
  const page = ref(1)
  const limit = ref(options.limit ?? 25)
  const total = ref(0)
  const items = ref<T[]>([]) as Ref<T[]>
  const loading = ref(false)
  /** Son isteğin hatası (restApi hata dönüşü ya da istisna); başarıda `null`. */
  const error = shallowRef<unknown>(null)

  const debounceMs = options.debounceMs ?? LIST_SEARCH_DEBOUNCE_MS
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  /** Yükle. `resetPage` → ilk sayfa. Bekleyen debounce'lu aramayı da karşılar (tekrar istek atılmaz). */
  async function load(resetPage = false): Promise<void> {
    clearTimer()
    if (resetPage) page.value = 1
    const id = ++seq
    loading.value = true
    error.value = null
    applied.value = snapshot(filters.value)
    try {
      const res = await options.fetch({ filters: filters.value, page: page.value, limit: limit.value, sortBy: sortBy.value })
      if (id !== seq) return
      if (res) {
        items.value = res.items
        total.value = res.total
      }
    } catch (e) {
      if (id !== seq) return
      error.value = e ?? new Error('list request failed')
    } finally {
      if (id === seq) loading.value = false
    }
  }

  /** Arama kutusu (her tuş): değeri yazar, `debounceMs` sonra ilk sayfadan yükler. */
  function search(value: string) {
    filters.value.globalSearch = value
    clearTimer()
    timer = setTimeout(() => { timer = undefined; void load(true) }, debounceMs)
  }

  /** Enter / temizle: bekleyen aramayı hemen çalıştırır. */
  function submitSearch() {
    return load(true)
  }

  function setPage(n: number) {
    page.value = n
    return load()
  }

  function setPageSize(n: number) {
    limit.value = n
    return load(true)
  }

  function setSort(next: ListSort[]) {
    sortBy.value = next
    return load(true)
  }

  function resetFilters() {
    filters.value = options.filters()
    return load(true)
  }

  /** Bekleyen aramayı ve uçuştaki isteğin yanıtını yok sayar. */
  function cancel() {
    clearTimer()
    seq++
    loading.value = false
  }

  if (getCurrentScope()) onScopeDispose(cancel)

  return { filters, applied, sortBy, page, limit, total, items, loading, error, load, search, submitSearch, setPage, setPageSize, setSort, resetFilters, cancel }
}
