// FE-R4 A3 — bildirim penceresi: store `loading` (ilk açılış iskeleti) + `listError` (hata durumu) + liste davranışı sabit.
// Karakterizasyon: liste/sayım alanları ve idsPayload gövdeleri DEĞİŞMEDİ; yeni olan yalnız `loading`'in
// `fetchNotifications` süresince true olması (eskiden hiç set edilmiyordu → iskelet hiç görünmezdi).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const api = { get: vi.fn(), post: vi.fn() }
vi.mock('@/composables/restapi', () => ({ default: () => api }))
vi.mock('@/composables/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@entegrasyonik/ui/composables/useToast', () => ({ useToast: () => ({ show: vi.fn(), warning: vi.fn(), error: vi.fn() }) }))
vi.mock('@/composables/useNotificationStream', () => ({ useNotificationStream: () => ({ start: vi.fn(), stop: vi.fn() }) }))

const { useNotificationDrawerStore } = await import('@/stores/notificationDrawer')

describe('notificationDrawer store — liste ve yükleniyor bayrağı', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.get.mockReset()
    api.post.mockReset()
  })

  it('fetchNotifications: istek sürerken loading=true, sonra false; liste + sayım yanıttan', async () => {
    let resolveGet: (v: unknown) => void = () => {}
    api.get.mockReturnValue(new Promise((r) => (resolveGet = r)))
    const store = useNotificationDrawerStore()
    expect(store.loading).toBe(false)
    const pending = store.fetchNotifications()
    expect(store.loading).toBe(true)
    resolveGet({ result: true, data: [{ _id: 'n1' }], unreadCount: 4 })
    await pending
    expect(store.loading).toBe(false)
    expect(store.notifications).toEqual([{ _id: 'n1' }])
    expect(store.unreadCount).toBe(4)
    expect(api.get).toHaveBeenCalledWith('NotificationService')
  })

  it('fetchNotifications hata verirse loading yine false olur, liste korunur', async () => {
    api.get.mockRejectedValue(new Error('ağ'))
    const store = useNotificationDrawerStore()
    store.notifications = [{ _id: 'eski' }]
    await store.fetchNotifications()
    expect(store.loading).toBe(false)
    expect(store.notifications).toEqual([{ _id: 'eski' }])
    expect(store.listError).toBe(true)
    // Sonraki başarılı istek hata bayrağını temizler.
    api.get.mockResolvedValue({ result: true, data: [], unreadCount: 0 })
    await store.fetchNotifications()
    expect(store.listError).toBe(false)
  })

  it('başarısız yanıt (result yok / boş) da hata sayılır, liste korunur', async () => {
    api.get.mockResolvedValue(undefined)
    const store = useNotificationDrawerStore()
    store.notifications = [{ _id: 'eski' }]
    await store.fetchNotifications()
    expect(store.listError).toBe(true)
    expect(store.notifications).toEqual([{ _id: 'eski' }])
  })

  it('okundu / sil gövdeleri değişmedi: tekil → notificationIds, boş → all', async () => {
    api.post.mockResolvedValue({ result: true })
    api.get.mockResolvedValue({ result: true, data: [], unreadCount: 0 })
    const store = useNotificationDrawerStore()
    await store.markAsRead('a')
    await store.markAsRead()
    await store.deleteNotification('b')
    await store.deleteNotification()
    // Değişiklik sonrası çekmece kapalıyken yalnız rozet sayımı tazelenir (getUnreadCount) — burada süzülür.
    const writes = api.post.mock.calls.filter((c) => c[0] !== 'NotificationService/getUnreadCount')
    expect(writes.map((c) => [c[0], c[1]])).toEqual([
      ['NotificationService/markAsRead', { notificationIds: ['a'] }],
      ['NotificationService/markAsRead', { all: true }],
      ['NotificationService/delete', { notificationIds: ['b'] }],
      ['NotificationService/delete', { all: true }],
    ])
  })
})

describe('bildirim penceresi bileşeni — FE-R4 A3 kuralları (kaynak)', () => {
  const src = readFileSync(resolve(__dirname, '../src/components/user/NotificationDrawerComponent.vue'), 'utf8')

  it('ham renk yok (yalnız semantik token) → dark hazır', () => {
    const style = src.slice(src.indexOf('<style'))
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(style).not.toMatch(/rgba?\(/)
  })

  it('eylem adları ve sabit metinler korunur (spec çapaları)', () => {
    for (const anchor of [
      'aria-label="Tümünü okundu işaretle"',
      'label="Bildirim işlemleri"',
      'aria-label="Kapat"',
      '`Okundu işaretle: ${view(item).title}`',
      '`Sil: ${view(item).title}`',
      '`Detayları gör: ${view(item).title}`',
      'Tümünü gör',
      'Henüz bildiriminiz yok',
      'aria-label="Zorunlu bildirim"',
    ]) {
      expect(src, anchor).toContain(anchor)
    }
  })

  it('ilk yükleme iskeleti / hata durumu yalnız liste boşken (tazelemede liste titremez); keyframe yok', () => {
    expect(src).toMatch(/initialLoading = computed\(\(\) => notificationStore\.loading && !items\.value\.length && !notificationStore\.listError\)/)
    expect(src).toMatch(/<EkProblemState v-else-if="listFailed"/)
    expect(src).not.toMatch(/@keyframes/)
  })
})
