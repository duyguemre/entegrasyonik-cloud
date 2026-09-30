import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { LIST_SEARCH_DEBOUNCE_MS, listPayload, useListQuery, type ListPage, type ListQuery } from '../src/composables/useListQuery'

type F = { globalSearch: string; statuses: string[]; startDate?: string }
const empty = (): F => ({ globalSearch: '', statuses: [] })

/** Elle çözülen istekler: yanıt sırasını test belirler. */
function deferredFetch() {
  const calls: { q: ListQuery<F>; resolve: (v: ListPage<string>) => void; reject: (e: unknown) => void }[] = []
  const fetch = vi.fn((q: ListQuery<F>) => new Promise<ListPage<string>>((resolve, reject) => {
    calls.push({ q: { ...q, filters: { ...q.filters } }, resolve, reject })
  }))
  return { fetch, calls }
}

const flush = () => new Promise<void>(r => setTimeout(r, 0))

describe('useListQuery — debounce (V-02)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('tuş vuruşları tek isteğe iner; istek son değerle ve ilk sayfadan gider', async () => {
    const { fetch, calls } = deferredFetch()
    const q = useListQuery({ filters: empty, fetch })
    q.page.value = 4
    q.search('a'); q.search('ay'); q.search('ayş')
    expect(q.filters.value.globalSearch).toBe('ayş')
    await vi.advanceTimersByTimeAsync(LIST_SEARCH_DEBOUNCE_MS - 1)
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(calls[0].q.filters.globalSearch).toBe('ayş')
    expect(calls[0].q.page).toBe(1)
  })

  it('varsayılan gecikme plandaki 350 ms', () => {
    expect(LIST_SEARCH_DEBOUNCE_MS).toBe(350)
  })

  it('Enter (submitSearch) bekleyen aramayı hemen çalıştırır, zamanlayıcı ikinci istek atmaz', async () => {
    const { fetch } = deferredFetch()
    const q = useListQuery({ filters: empty, fetch })
    q.search('x')
    q.submitSearch()
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(LIST_SEARCH_DEBOUNCE_MS * 2)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('başka bir yükleme (filtre uygula) bekleyen aramayı karşılar', async () => {
    const { fetch } = deferredFetch()
    const q = useListQuery({ filters: empty, fetch })
    q.search('x')
    q.load(true)
    await vi.advanceTimersByTimeAsync(LIST_SEARCH_DEBOUNCE_MS * 2)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('kapsam kapanınca bekleyen arama iptal olur', async () => {
    const { fetch } = deferredFetch()
    const scope = effectScope()
    const q = scope.run(() => useListQuery({ filters: empty, fetch }))!
    q.search('x')
    scope.stop()
    await vi.advanceTimersByTimeAsync(LIST_SEARCH_DEBOUNCE_MS * 2)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('useListQuery — bayat yanıt', () => {
  it('yavaş eski yanıt, hızlı yeni yanıtı ezmez', async () => {
    const { fetch, calls } = deferredFetch()
    const q = useListQuery({ filters: empty, fetch })
    q.filters.value.globalSearch = 'eski'; q.load(true)
    q.filters.value.globalSearch = 'yeni'; q.load(true)
    calls[1].resolve({ items: ['yeni'], total: 1 })
    await flush()
    expect(q.items.value).toEqual(['yeni'])
    expect(q.loading.value).toBe(false)
    calls[0].resolve({ items: ['eski-1', 'eski-2'], total: 2 })
    await flush()
    expect(q.items.value).toEqual(['yeni'])
    expect(q.total.value).toBe(1)
  })

  it('eski isteğin hatası yeni başarılı yanıtı hataya çevirmez; yükleme göstergesi son isteğe aittir', async () => {
    const { fetch, calls } = deferredFetch()
    const q = useListQuery({ filters: empty, fetch })
    q.load(); q.load()
    calls[0].reject(new Error('eski'))
    await flush()
    expect(q.error.value).toBeNull()
    expect(q.loading.value).toBe(true)
    calls[1].resolve({ items: ['ok'], total: 1 })
    await flush()
    expect(q.loading.value).toBe(false)
    expect(q.items.value).toEqual(['ok'])
  })

  it('cancel uçuştaki yanıtı yok sayar', async () => {
    const { fetch, calls } = deferredFetch()
    const q = useListQuery({ filters: empty, fetch })
    q.load()
    q.cancel()
    expect(q.loading.value).toBe(false)
    calls[0].resolve({ items: ['geç'], total: 1 })
    await flush()
    expect(q.items.value).toEqual([])
  })
})

describe('useListQuery — sayfa, sıralama, sıfırlama', () => {
  it('setPage sayfayı korur; setPageSize ve setSort ilk sayfaya döner', async () => {
    const { fetch, calls } = deferredFetch()
    const q = useListQuery({ filters: empty, fetch, sortBy: [{ key: 'createdAt', order: 'desc' }], limit: 25 })
    q.setPage(3)
    expect(calls[0].q).toMatchObject({ page: 3, limit: 25, sortBy: [{ key: 'createdAt', order: 'desc' }] })
    q.setPageSize(50)
    expect(calls[1].q).toMatchObject({ page: 1, limit: 50 })
    q.setPage(2)
    q.setSort([{ key: 'total', order: 'asc' }])
    expect(calls[3].q).toMatchObject({ page: 1, sortBy: [{ key: 'total', order: 'asc' }] })
  })

  it('resetFilters formu boşaltır ve ilk sayfadan yükler; sıralama korunur', async () => {
    const { fetch, calls } = deferredFetch()
    const q = useListQuery({ filters: empty, fetch, sortBy: [{ key: 'a', order: 'asc' }] })
    q.filters.value.statuses.push('OPEN')
    q.page.value = 5
    q.resetFilters()
    expect(calls[0].q).toMatchObject({ page: 1, filters: empty(), sortBy: [{ key: 'a', order: 'asc' }] })
  })

  it('applied son sorgulanan değerlerin kopyasıdır (formda düzenleme çipi değiştirmez)', async () => {
    const { fetch } = deferredFetch()
    const q = useListQuery({ filters: empty, fetch })
    q.filters.value.statuses = ['OPEN']
    q.load()
    q.filters.value.statuses.push('CLOSED')
    expect(q.applied.value.statuses).toEqual(['OPEN'])
  })

  it('null yanıt mevcut satırları korur', async () => {
    const { fetch, calls } = deferredFetch()
    const q = useListQuery({ filters: empty, fetch })
    q.load(); calls[0].resolve({ items: ['a'], total: 1 }); await flush()
    q.load(); calls[1].resolve(null); await flush()
    expect(q.items.value).toEqual(['a'])
  })
})

describe('useListQuery — hata', () => {
  it('fırlatılan hata error\'a yazılır, satırlar korunur, sonraki yüklemede temizlenir', async () => {
    const { fetch, calls } = deferredFetch()
    const q = useListQuery({ filters: empty, fetch })
    q.load(); calls[0].resolve({ items: ['a'], total: 1 }); await flush()
    const failure = { isAxiosError: true }
    q.load(); calls[1].reject(failure); await flush()
    expect(q.error.value).toBe(failure)
    expect(q.items.value).toEqual(['a'])
    expect(q.loading.value).toBe(false)
    q.load()
    expect(q.error.value).toBeNull()
  })
})

describe('listPayload — sunucu sözleşmesi (Order/Claim: bayt-özdeş)', () => {
  it('eski prepareFilterPayload ile aynı JSON', () => {
    const filters = { globalSearch: 'x', startDate: undefined, integrationCodes: ['trendyol'], internalStatuses: [] as string[] }
    const body = listPayload({ filters, page: 2, limit: 25, sortBy: [{ key: 'dates.orderDate', order: 'desc' }] })
    const legacy = {
      pagination: { page: 2, limit: 25 },
      sort: { field: 'dates.orderDate', direction: 'desc' },
      filter: { ...filters },
    }
    expect(JSON.stringify(body)).toBe(JSON.stringify(legacy))
  })

  it('sıralama yoksa field/direction tanımsız (JSON\'da düşer)', () => {
    const body = listPayload({ filters: empty(), page: 1, limit: 25, sortBy: [] })
    expect(JSON.stringify(body.sort)).toBe('{}')
  })
})
