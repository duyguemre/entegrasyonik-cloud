// Ekran durum katmanı (DOM'suz): imleçli liste / kaynak durumları, hata → ileti eşlemesi, gerekçe + step-up akışı,
// ve REAUTH_OPS'un backend `admin/stepUp.ts` REAUTH_RPCS ile uyumu (backend salt okunur; kanıt olarak okunur).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AdminApiError, createAdminApi } from '../src/api/client'
import { REAUTH_OPS } from '../src/api/contract'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'
import { useCursorList } from '../src/composables/useCursorList'
import { useResource } from '../src/composables/useResource'
import { checkReason, useGuardedAction } from '../src/composables/useGuardedAction'
import { describeError } from '../src/utils/errors'

const err = (status: number, code: string, error = 'Sunucu iletisi.') => new AdminApiError(status, { error, code })
const deferred = <T>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((a, b) => ((resolve = a), (reject = b)))
  return { promise, resolve, reject }
}

describe('useCursorList', () => {
  it('loading → ready → daha fazla (aynı imleç geri gönderilir) → listenin sonu', async () => {
    const seen: Array<string | undefined> = []
    const list = useCursorList<number>(async (cursor) => {
      seen.push(cursor)
      return cursor ? { items: [3, 4], nextCursor: null } : { items: [1, 2], nextCursor: 'c1' }
    })
    expect(list.phase.value).toBe('loading')
    await list.reload()
    expect(list.phase.value).toBe('ready')
    expect(list.hasMore.value).toBe(true)
    await list.loadMore()
    expect(list.items.value).toEqual([1, 2, 3, 4])
    expect(list.hasMore.value).toBe(false)
    expect(seen).toEqual([undefined, 'c1'])
  })

  it('boş → empty; 503 → degraded; 500 → error; daha fazla hatası listeyi silmez', async () => {
    const empty = useCursorList<number>(async () => ({ items: [], nextCursor: null }))
    await empty.reload()
    expect(empty.phase.value).toBe('empty')

    const down = useCursorList<number>(async () => Promise.reject(err(503, 'QUEUE_UNAVAILABLE', 'Kuyruk şu an kullanılamıyor.')))
    await down.reload()
    expect(down.phase.value).toBe('degraded')
    expect(down.error.value?.message).toBe('Kuyruk şu an kullanılamıyor — Birkaç dakika sonra yeniden deneyin; sürerse Altyapı ekranından bağımlılık durumunu kontrol edin.')

    const broken = useCursorList<number>(async () => Promise.reject(err(500, 'INTERNAL')))
    await broken.reload()
    expect(broken.phase.value).toBe('error')

    let n = 0
    const partial = useCursorList<number>(async () => (n++ === 0 ? { items: [1], nextCursor: 'x' } : Promise.reject(err(0, 'NETWORK', 'Sunucuya ulaşılamadı.'))))
    await partial.reload()
    await partial.loadMore()
    expect(partial.items.value).toEqual([1])
    expect(partial.phase.value).toBe('ready')
    expect(partial.moreError.value?.kind).toBe('network')
  })

  it('filtre değişince eski (yavaş) yanıt yok sayılır', async () => {
    const slow = deferred<{ items: string[]; nextCursor: null }>()
    let call = 0
    const list = useCursorList<string>(() => (call++ === 0 ? slow.promise : Promise.resolve({ items: ['yeni'], nextCursor: null })))
    const first = list.reload()
    await list.reload()
    slow.resolve({ items: ['eski'], nextCursor: null })
    await first
    expect(list.items.value).toEqual(['yeni'])
  })

  it('removeWhere son satırda boş duruma geçer', async () => {
    const list = useCursorList<number>(async () => ({ items: [1], nextCursor: null }))
    await list.reload()
    list.removeWhere((x) => x === 1)
    expect(list.phase.value).toBe('empty')
  })
})

describe('useResource', () => {
  it('404 → notFound, 503 → degraded; yenileme hatasında veri korunur (stale)', async () => {
    const nf = useResource(async () => Promise.reject(err(404, 'SUBSCRIPTION_NOT_FOUND', 'Abonelik bulunamadı.')))
    await nf.load()
    expect(nf.phase.value).toBe('notFound')
    let ok = true
    const r = useResource(async () => (ok ? { v: 1 } : Promise.reject(err(503, 'INFRA_UNAVAILABLE'))))
    await r.load()
    ok = false
    await r.load()
    expect(r.phase.value).toBe('ready')
    expect(r.data.value).toEqual({ v: 1 })
    expect(r.stale.value).toBe(true)
  })
})

describe('describeError — "<ne oldu> — <ne yapılmalı>"', () => {
  it.each([
    [err(423, 'LIVE_READONLY', 'Canlı salt-okuma kipinde bu işlem kapalı.'), 'readonly', 'Canlı salt-okuma kipinde bu işlem kapalı — Canlı salt-okuma kipi kapatıldığında yeniden deneyin.'],
    [err(504, 'QUERY_TIMEOUT', 'Sorgu süre sınırını aştı.'), 'timeout', 'Sorgu süre sınırını aştı — Daha dar bir zaman aralığı seçip yeniden deneyin.'],
    [err(409, 'SUBSCRIPTION_CHANGED', 'Abonelik eş zamanlı değişti.'), 'conflict', 'Abonelik eş zamanlı değişti — Güncel durumu görmek için listeyi yenileyin.'],
    [err(409, 'TRIAL_NOT_ACTIVE', 'Deneme süresi uzatılamaz.'), 'conflict', 'Deneme süresi uzatılamaz — Yalnız süren deneme ya da denemesi bitip askıya alınmış kartsız abonelik uzatılabilir; sayfayı yenileyin.'],
    [err(404, 'JOB_NOT_FOUND', 'İş bulunamadı.'), 'notFound', 'İş bulunamadı — Kayıt başka bir işlemle kaldırılmış olabilir; listeyi yenileyin.'],
  ])('%#', (e, kind, message) => {
    const d = describeError(e)
    expect(d.kind).toBe(kind)
    expect(d.message).toBe(message)
  })

  it('step-up iptali ve ham olmayan hata', () => {
    const e = err(401, 'REAUTH_REQUIRED')
    e.cancelled = true
    expect(describeError(e).title).toBe('Yeniden doğrulama yapılmadı')
    expect(describeError(new Error('TypeError: x is undefined')).message).not.toMatch(/TypeError/)
  })
})

describe('useGuardedAction: gerekçe + step-up akışı (gerçek istemci + sahte API)', () => {
  async function setup(reauth: 'ok' | 'cancel') {
    const server = new MockAdminServer()
    const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
    await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
    await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
    server.expireReauth()
    let dialogs = 0
    api.setHooks({
      requestReauth: async () => {
        dialogs++
        if (reauth === 'cancel') return false
        await api.call('BackofficeAuthService/reauth', { password: MOCK_ACCOUNTS.password, code: '222222' })
        return true
      },
    })
    return { api, server, dialogs: () => dialogs }
  }

  it('kısa gerekçe istemcide reddedilir (istek gitmez)', async () => {
    let calls = 0
    const a = useGuardedAction(async () => calls++)
    a.open(1)
    await a.confirm('  kısa  ')
    expect(calls).toBe(0)
    expect(a.error.value?.message).toBe('Gerekçe en az 10 karakter olmalı.')
    expect(checkReason('x'.repeat(501))).toMatch(/en çok 500/)
  })

  it('REAUTH_REQUIRED → diyalog → doğrulama → istek bir kez yenilenir → başarı, diyalog kapanır', async () => {
    const { api, dialogs } = await setup('ok')
    const done: unknown[] = []
    const a = useGuardedAction((tid: number, reason) => api.call('BackofficeBillingService/extendTrial', { tid, days: 3, reason }), (r) => done.push(r))
    a.open(103)
    await a.confirm('  Destek kaydı #örnek: deneme uzatma  ')
    expect(dialogs()).toBe(1)
    expect(a.isOpen.value).toBe(false)
    expect(done).toHaveLength(1)
    expect(a.error.value).toBeNull()
  })

  it('step-up diyaloğundan vazgeçilirse işlem uygulanmaz, diyalog açık kalır ve neden söylenir', async () => {
    const { api } = await setup('cancel')
    const a = useGuardedAction((tid: number, reason) => api.call('BackofficeTenantService/cancelDeletion', { tid, reason }))
    a.open(111)
    await a.confirm('Müşteri vazgeçti, destek kaydı #örnek')
    expect(a.isOpen.value).toBe(true)
    expect(a.error.value?.kind).toBe('cancelled')
    expect((await api.call('BackofficeTenantService/getLifecycle', { tid: 111 })).status).toBe('DELETION_PENDING')
  })

  it('salt-okuma kipinde (423) hata diyalogda kalır', async () => {
    const { api, server } = await setup('ok')
    server.setLiveReadonly(true)
    const a = useGuardedAction((tid: number, reason) => api.call('BackofficeBillingService/changePlan', { tid, planCode: 'starter', reason }))
    a.open(101)
    await a.confirm('Plan düşürme talebi, destek kaydı #örnek')
    expect(a.isOpen.value).toBe(true)
    expect(a.error.value?.kind).toBe('readonly')
  })
})

describe('REAUTH_OPS ↔ backend REAUTH_RPCS', () => {
  const src = readFileSync(join(__dirname, '..', '..', '..', 'backend', 'src', 'api', 'admin', 'stepUp.ts'), 'utf8')
  const block = /REAUTH_RPCS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/.exec(src)?.[1] ?? ''
  const backend = [...block.matchAll(/'([A-Za-z]+Service\/[A-Za-z]+)'/g)].map((m) => m[1])

  it('önyüz listesi backend kümesinin alt kümesi; önyüzde kullanılan tüm step-up yazmaları listede', () => {
    expect(backend.length).toBeGreaterThan(10)
    for (const op of REAUTH_OPS) expect(backend, op).toContain(op)
    const unused = backend.filter((op) => !(REAUTH_OPS as readonly string[]).includes(op))
    // Önyüzde kullanılmayanlar (bilinçli): setIntake (entegrasyon ayar ekranı Aşama 3), TenantDataService/cancelDeletion (eski yol).
    expect(unused.sort()).toEqual(['IntegrationConfigService/setIntake', 'TenantDataService/cancelDeletion'])
  })
})

describe('sahte API hata kolu', () => {
  it('failOps(önek) → 500 INTERNAL; null ile kapanır', async () => {
    const server = new MockAdminServer()
    const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
    await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
    await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
    server.failOps('BackofficeBillingService/')
    const list = useCursorList((cursor) => api.call('BackofficeBillingService/listSubscriptions', { cursor }))
    await list.reload()
    expect(list.phase.value).toBe('error')
    expect(list.error.value?.message).toBe('Beklenmeyen bir hata oluştu — Yeniden deneyin; sürerse istek kimliğiyle bildirin.')
    server.failOps(null)
    await list.reload()
    expect(list.phase.value).toBe('ready')
  })
})
