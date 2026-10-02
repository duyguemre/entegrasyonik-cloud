import { describe, expect, it, vi } from 'vitest'
import type { AlertRow, Announcement, DeliveryRow, DeliveryStats, NotificationCatalogItem } from '@bo/api/contract'
import { alertsVerdict, announcementNote, announcementsVerdict, catalogVerdict, deliveriesVerdict, muteUntilText, tenantHistoryVerdict } from '@bo/views/notifications/notificationsVerdict'

const NOW = Date.parse('2026-10-01T10:00:00')
const min = (n: number) => new Date(NOW + n * 60_000).toISOString()
const alert = (o: Partial<AlertRow>): AlertRow => ({ id: 'a', ruleId: 'R1', scopeKey: 'k', level: 'warning', status: 'firing', detail: {}, firstFiredAt: min(-5), lastSeenAt: min(-1), lastNotifiedAt: null, resolvedAt: null, mutedUntil: null, shadow: false, ...o })
const noop = () => {}

describe('uyarılar hükmü', () => {
  const base = { stale: false, now: NOW, retry: noop, mute: noop }
  it('sakin: etkin uyarı yok', () => {
    const v = alertsVerdict({ ...base, firing: [], failed: false })
    expect(v.tone).toBe('success')
    expect(v.attention).toEqual([])
  })
  it('kritik etkin uyarı kırmızı; süzgece götürür, susturma guarded ve ilgili ekran bağlı', () => {
    const mute = vi.fn()
    const a = alert({ ruleId: 'R4', level: 'critical' })
    const v = alertsVerdict({ ...base, mute, firing: [a], failed: false })
    expect(v.tone).toBe('error')
    expect(v.attention[0].to).toEqual({ query: { durum: 'firing', onem: 'critical' } })
    expect(v.attention[0].impact).toBeTruthy()
    expect(v.attention[0].advice).toBeTruthy()
    expect(v.actions[0].id).toBe('goto-R4')
    const m = v.actions.find((x) => x.id === 'mute-top')!
    expect(m.guarded).toBe(true)
    m.onSelect!()
    expect(mute).toHaveBeenCalledWith(a)
    expect(v.actions.find((x) => x.id === 'goto-R4')?.to).toEqual({ path: '/motor' })
  })
  it('gölge yalnız bilgi; susturma yakında bitiyorsa sarı', () => {
    expect(alertsVerdict({ ...base, firing: [alert({ shadow: true, level: 'critical' })], failed: false }).tone).toBe('success')
    const v = alertsVerdict({ ...base, firing: [alert({ level: 'critical', mutedUntil: min(30) })], failed: false })
    expect(v.tone).toBe('warning')
    expect(v.attention[0].id).toBe('mute-expiring')
    expect(alertsVerdict({ ...base, firing: [alert({ level: 'critical', mutedUntil: min(300) })], failed: false }).tone).toBe('success')
  })
  it('okunamadı: hüküm verilemez', () => {
    const v = alertsVerdict({ ...base, firing: null, failed: true })
    expect(v.tone).toBe('warning')
    expect(v.attention[0].id).toBe('unreadable-alerts')
  })
  it('susturma bitişi: aynı gün saat, değilse gün + saat', () => {
    expect(muteUntilText(new Date(NOW + 2 * 3600_000).toISOString(), NOW)).toMatch(/^bitiş 12:00$/)
    expect(muteUntilText(new Date(NOW + 30 * 3600_000).toISOString(), NOW)).toMatch(/^bitiş 2 Eki \d\d:\d\d$/)
  })
})

const stats = (dead: number, failed = 0, oldest: number | null = null, sent = 40): DeliveryStats => ({
  generatedAt: min(0),
  oldestPendingAgeSec: oldest,
  windows: { '24h': { byStatus: { sent, dead, failed, pending: 0, sending: 0, skipped: 0, suppressed: 0 }, byChannelStatus: [], byCode: [] }, '7d': { byStatus: {} as never, byChannelStatus: [], byCode: [] } },
})
const delivery = (o: Partial<DeliveryRow>): DeliveryRow => ({ id: 'd1', eventId: 'e', tid: 101, code: 'ORDER_SYNC_FAILED', channel: 'email', mode: 'instant', status: 'dead', attempts: 5, lastErrorCode: null, createdAt: min(-9), nextAttemptAt: null, sentAt: null, ...o })

describe('teslim günlüğü hükmü', () => {
  const base = { stale: false, rows: [] as DeliveryRow[], retry: noop, retryDelivery: noop }
  it('sakin', () => expect(deliveriesVerdict({ ...base, stats: stats(0), failed: false }).tone).toBe('success'))
  it('kalıcı hata sarı, eşikte kırmızı; eylemler guarded, at danger', () => {
    const d = delivery({})
    const retryDelivery = vi.fn()
    const v = deliveriesVerdict({ ...base, rows: [d], retryDelivery, stats: stats(3), failed: false })
    expect(v.tone).toBe('warning')
    expect(v.actions.find((a) => a.id === 'retry')).toMatchObject({ guarded: true })
    // yıkıcı "at" yalnız listeye götürür (onSelect yok)
    expect(v.actions.find((a) => a.id === 'discard')).toMatchObject({ danger: true, to: { query: { durum: 'dead' } } })
    expect(v.actions.find((a) => a.id === 'discard')?.onSelect).toBeUndefined()
    expect(v.attention.find((a) => a.id === 'dead')?.to).toEqual({ query: { durum: 'dead' } })
    v.actions.find((a) => a.id === 'retry')!.onSelect!()
    expect(retryDelivery).toHaveBeenCalledWith(d)
    expect(deliveriesVerdict({ ...base, stats: stats(12), failed: false }).tone).toBe('error')
  })
  it('e-posta sağlayıcı erişilemiyorsa katalogdaki test e-postasına bağlanır', () => {
    const v = deliveriesVerdict({ ...base, rows: [delivery({ lastErrorCode: 'SMTP_TIMEOUT' })], stats: stats(0), failed: false })
    expect(v.attention.find((a) => a.id === 'provider')?.to).toEqual({ path: '/bildirimler/katalog' })
  })
  it('geciken bekleyen sarı; okunamadı', () => {
    expect(deliveriesVerdict({ ...base, stats: stats(0, 0, 900), failed: false }).attention[0].to).toEqual({ path: '/motor' })
    expect(deliveriesVerdict({ ...base, stats: null, failed: true }).attention[0].id).toBe('unreadable-stats')
  })
})

const ann = (o: Partial<Announcement>): Announcement =>
  ({ id: 'a'.repeat(24), title: { tr: 'Bakım' }, status: 'active', startsAt: min(-60), endsAt: null, channels: { banner: true, inApp: true, email: false }, fanout: null, ...o }) as Announcement

describe('duyurular hükmü', () => {
  const base = { stale: false, now: NOW, retry: noop }
  it('boş: sakin; yayında/planlı bilgi', () => {
    expect(announcementsVerdict({ ...base, items: [], failed: false }).summary).toContain('planlı duyuru yok')
    const v = announcementsVerdict({ ...base, items: [ann({}), ann({ status: 'scheduled', startsAt: min(60) })], failed: false })
    expect(v.tone).toBe('success')
    expect(v.attention.map((a) => a.tone)).toEqual(['info', 'info'])
  })
  it('geçmiş tarihli planlı sarı ve duyuruya bağlı; yeni duyuru eylemi', () => {
    const late = ann({ status: 'scheduled', startsAt: min(-10) })
    const v = announcementsVerdict({ ...base, items: [late], failed: false })
    expect(v.tone).toBe('warning')
    expect(v.attention[0].to).toBe(`/sistem/duyurular/${late.id}`)
    expect(v.actions[0]).toMatchObject({ id: 'new', to: '/sistem/duyurular/yeni' })
    const live = announcementsVerdict({ ...base, items: [ann({})], failed: false })
    expect(live.attention[0].to).toEqual({ query: { durum: 'active' } })
  })
  it('dağıtımı takılan yayın sarı; detay notu', () => {
    const a = ann({ fanout: { done: false, tenants: 3, notified: 1 } })
    expect(announcementsVerdict({ ...base, items: [a], failed: false }).tone).toBe('warning')
    expect(announcementNote(a, NOW)?.tone).toBe('warning')
    expect(announcementNote(ann({ status: 'ended' }), NOW)).toBeNull()
  })
  it('okunamadı', () => expect(announcementsVerdict({ ...base, items: null, failed: true }).attention[0].id).toBe('unreadable-announcements'))
})

const cat = (o: Partial<NotificationCatalogItem>): NotificationCatalogItem =>
  ({ code: 'X', mandatory: false, legacy: false, defaultChannels: { inApp: true, email: 'instant' }, ...o }) as NotificationCatalogItem

describe('katalog hükmü', () => {
  const base = { stale: false, emailUnavailable: false, retry: noop, testMail: noop }
  it('sakin; test e-postası guarded', () => {
    const v = catalogVerdict({ ...base, items: [cat({})], failed: false })
    expect(v.tone).toBe('success')
    expect(v.checks?.length).toBeGreaterThan(0)
    expect(v.actions[0].id).toBe('test-mail')
    expect(v.actions.find((a) => a.id === 'test-mail')?.guarded).toBe(true)
  })
  it('e-posta kapalı ya da zorunlu kodda e-posta yok → sarı', () => {
    expect(catalogVerdict({ ...base, emailUnavailable: true, items: [cat({})], failed: false }).attention[0].to).toMatchObject({ path: '/bildirimler/teslimler' })
    const m = catalogVerdict({ ...base, items: [cat({ code: 'PAYMENT_FAILED', mandatory: true, defaultChannels: { inApp: true, email: 'off' } })], failed: false })
    expect(m.tone).toBe('warning')
    expect(m.attention[0].to).toEqual({ query: { ara: 'PAYMENT_FAILED' } })
  })
  it('okunamadı', () => expect(catalogVerdict({ ...base, items: null, failed: true }).tone).toBe('warning'))
})

describe('müşteri geçmişi hükmü', () => {
  it('müşteri seçilmediyse bilgi tonu', () => {
    const v = tenantHistoryVerdict({ tid: null, rows: null, failed: false, retry: noop })
    expect(v.tone).toBe('info')
    expect(v.summary).toContain('Müşteri seçin')
  })
  it('başarısız e-posta teslimi → teslimlere bağlı sarı; temiz → sakin', () => {
    const v = tenantHistoryVerdict({ tid: 101, rows: [{ id: 'e', emailStatus: { failed: 2, sent: 1 } }], failed: false, retry: noop })
    expect(v.tone).toBe('warning')
    expect(v.attention[0].to).toEqual({ path: '/bildirimler/teslimler', query: { tid: '101', durum: 'failed' } })
    expect(tenantHistoryVerdict({ tid: 101, rows: [], failed: false, retry: noop }).tone).toBe('success')
    expect(tenantHistoryVerdict({ tid: 101, rows: null, failed: true, retry: noop }).attention[0].id).toBe('unreadable-history')
  })
})
