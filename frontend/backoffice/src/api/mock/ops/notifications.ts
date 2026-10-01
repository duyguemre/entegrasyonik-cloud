/**
 * Sahte BackofficeNotificationService (NB7/NB8 — API_BACKOFFICE_NOTIFICATIONS.md). Yanıt şekilleri sözleşmeyle birebir
 * (tests/notifications-contract.test.ts fazla alanı da yakalar). Sızıntı kuralları korunur: teslim satırında adres/kişi/metin
 * yok; tenant geçmişi yalnız meta veri; test e-postası adres döndürmez. Metinler örnektir.
 */
import type {
  AlertRow,
  Announcement,
  AnnouncementInput,
  AnnouncementPreview,
  AnnouncementSeverity,
  NotificationCatalogItem,
  DeliveryRow,
  DeliveryStatus,
  DeliveryWindowStats,
  TenantHistoryRow,
} from '../../contracts/notifications'
import { ALERT_MUTE_MAX_HOURS } from '../../contracts/notifications'
import { MockHttpError } from '../errors'
import { DAY, HOUR, MIN, UNHANDLED, conflict, hex24, iso, liveReadonly, notFound, page, strict, validation, type MockCtx, type MockDomain } from './context'

const OID = /^[a-f0-9]{24}$/i
const CODE = /^[A-Z][A-Z0-9_]{1,59}$/
const PLAN = /^[A-Za-z0-9_-]{1,64}$/
const KINDS = ['info', 'maintenance', 'incident', 'release'] as const
const SEVERITIES = ['info', 'warning', 'critical'] as const
const STATUSES = ['draft', 'scheduled', 'active', 'ended', 'cancelled'] as const
const DELIVERY_STATUSES: DeliveryStatus[] = ['pending', 'sending', 'sent', 'failed', 'dead', 'skipped', 'suppressed']
const ADMIN_ID = hex24(5001)

const defaultSeverity = (kind: string): AnnouncementSeverity => (kind === 'maintenance' ? 'warning' : kind === 'incident' ? 'critical' : 'info')

/** Katalog alt kümesi (backend operations/notifications/catalog.ts ile aynı kodlar/örnekler). */
const CATALOG: Array<NotificationCatalogItem & { tpl: { tr: [string, string]; en: [string, string] } }> = [
  cat('ORDER_SYNC_FAILED', 'order', ['error'], false, 'digest', 'orders:read', 'standard', 'tenant', true, { integ: 'trendyol', errorCode: 'UPSTREAM_TIMEOUT', corrId: 'c-1' },
    ['Sipariş eşitleme başarısız', '{integ} siparişleri alınamadı (hata kodu: {errorCode}). Destek kodu: {corrId}.'], ['Order sync failed', 'Orders from {integ} could not be fetched (error code: {errorCode}). Support code: {corrId}.']),
  cat('ORDER_SYNC_LAGGING', 'order', ['warning', 'critical'], false, 'instant', 'orders:read', 'standard', 'tenant', true, { integ: 'trendyol', lagMinutes: 95, level: 'warning' },
    ['Sipariş eşitleme gecikiyor', '{integ} sipariş eşitlemesi yaklaşık {lagMinutes} dakika geride.'], ['Order sync is lagging', '{integ} order sync is about {lagMinutes} minutes behind.']),
  cat('STOCK_OVERSOLD', 'stock', ['critical'], true, 'instant', 'stock:read', 'long', 'tenant', false, { integ: 'hepsiburada', lineId: 'L-1', orderId: 'O-1' },
    ['Stok aşırı satıldı', '{integ} kanalında {lineId} satırı stoktan fazla satıldı. Sipariş: {orderId}.'], ['Stock oversold', 'Line {lineId} on {integ} sold beyond stock. Order: {orderId}.']),
  cat('STOCK_LOW', 'stock', ['warning'], false, 'digest', 'stock:read', 'short', 'tenant', true, { sku: 'SKU-1', available: 3, threshold: 5 },
    ['Stok azaldı', '{sku} için kullanılabilir stok {available} (eşik {threshold}).'], ['Low stock', 'Available stock for {sku} is {available} (threshold {threshold}).']),
  cat('INTEGRATION_AUTH_FAILED', 'integration', ['critical'], true, 'instant', 'integrations:read', 'standard', 'tenant', true, { integ: 'n11' },
    ['Entegrasyon kimlik doğrulaması başarısız', '{integ} bağlantı bilgileri reddedildi; entegrasyon ayarlarını güncelleyin.'], ['Integration authentication failed', '{integ} rejected the credentials; update the integration settings.']),
  cat('INTEGRATION_ERROR_RATE_HIGH', 'integration', ['warning', 'critical'], false, 'instant', 'integrations:read', 'standard', 'tenant', true, { integ: 'trendyol', rate: 0.32, level: 'warning' },
    ['Entegrasyon hata oranı yüksek', '{integ} çağrılarının %{rate} kadarı hata veriyor.'], ['High integration error rate', '{rate} of {integ} calls are failing.']),
  cat('CATALOG_BATCH_FAILED', 'catalog', ['error'], false, 'instant', 'catalog:read', 'standard', 'tenant', false, { integ: 'pazarama', batchId: 'B-1', failed: 12 },
    ['Katalog gönderimi başarısız', '{integ} gönderiminde {failed} ürün reddedildi (paket {batchId}).'], ['Catalog batch failed', '{failed} products were rejected on {integ} (batch {batchId}).']),
  cat('SYSTEM_ANNOUNCEMENT', 'system', ['info', 'warning'], false, 'instant', 'app:use', 'standard', 'tenant', false, { announcementId: hex24(900), kind: 'info', title: 'Örnek duyuru', summary: 'Kısa özet' },
    ['Duyuru', 'Yeni bir duyuru yayınlandı. Ayrıntılar için açın.'], ['Announcement', 'A new announcement was published. Open for details.']),
  cat('PLATFORM_ALERT_FIRING', 'platform', ['warning', 'critical'], true, 'instant', 'platform', 'short', 'platform', false, { ruleId: 'R1', alertId: hex24(901) },
    ['Platform uyarısı', '{ruleId} kuralı tetiklendi (uyarı: {alertId}).'], ['Platform alert', 'Rule {ruleId} fired (alert: {alertId}).']),
  cat('PLATFORM_ALERT_DIGEST', 'platform', ['warning'], true, 'instant', 'platform', 'short', 'platform', false, { newAlertCount: 6 },
    ['Platform uyarı özeti', '{newAlertCount} yeni uyarı oluştu.'], ['Platform alert digest', '{newAlertCount} new alerts fired.']),
  cat('PLATFORM_DELIVERY_DEAD_LETTERS', 'platform', ['warning'], true, 'instant', 'platform', 'short', 'platform', false, { deadCount: 12 },
    ['Teslim edilemeyen bildirimler', 'Son saatte {deadCount} teslim kalıcı olarak başarısız oldu.'], ['Undeliverable notifications', '{deadCount} deliveries failed permanently in the last hour.']),
]

function cat(
  code: string, category: string, severities: string[], mandatory: boolean, email: 'off' | 'instant' | 'digest', permission: string, retention: string,
  surface: 'tenant' | 'platform', grouped: boolean, example: NotificationCatalogItem['example'], tr: [string, string], en: [string, string],
) {
  return {
    code, category, severities, mandatory, defaultChannels: { inApp: true, email }, permission, retention, surface,
    titleKey: `notifications.events.${code}.title`, bodyKey: `notifications.events.${code}.body`, grouped, legacy: false, example, tpl: { tr, en },
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const fill = (t: string, p: Record<string, unknown>) => t.replace(/\{(\w+)\}/g, (_, k: string) => (p[k] === undefined ? `{${k}}` : String(p[k])))
function emailHtml(subject: string, text: string, locale: 'tr' | 'en') {
  const foot = locale === 'tr' ? 'Bu e-posta hizmet duyurusudur. Tercihlerinizi değiştirmek için' : 'This is a service notice. To change your preferences,'
  const link = locale === 'tr' ? 'bildirim ayarları' : 'notification settings'
  return `<!doctype html><html lang="${locale}"><body><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(text).replace(/\n/g, '<br>')}</p><hr><p><small>${foot} <a href="https://example.invalid/unsubscribe">${link}</a>.</small></p></body></html>`
}

type AnnState = Announcement

/** MOB-06 sahte API: gerçek biçimli VAPID açık anahtarı (65 bayt P-256; yalnız geliştirme, özel eşi tutulmaz). */
export const MOCK_VAPID_PUBLIC = 'BFuTE875nh45zRaU0GNt1_kAw1TxLLDoCZtKauNzbRvRE_6s-mMjm-P0t2lVmXKeg5Oe-bqoRQLLqQPOY26WGTM'

export function createNotificationsMock(t0: number): MockDomain & { setEmailEnabled(v: boolean): void; setPushEnabled(v: boolean): void } {
  let emailEnabled = true
  let pushEnabled = true
  let pushDevices: Array<{ id: string; endpoint: string; deviceLabel: string | null; createdAt: string; lastSuccessAt: string | null }> = []
  let seq = 0
  const nextId = () => hex24(700_000 + ++seq)

  // ---------------------------------------------------------------- duyurular
  const base = (over: Partial<AnnState> & Pick<AnnState, 'kind' | 'title' | 'body' | 'status' | 'startsAt'>): AnnState => ({
    id: nextId(), severity: defaultSeverity(over.kind), target: { mode: 'all' }, audience: 'all_members', channels: { banner: true, inApp: true, email: false },
    endsAt: null, dismissible: over.kind === 'info' || over.kind === 'release', emailConsentAt: null, fanout: null, createdBy: ADMIN_ID, updatedBy: null,
    scheduledBy: null, cancelledBy: null, createdAt: iso(t0 - 3 * DAY), updatedAt: iso(t0 - 3 * DAY), ...over,
  })
  const announcements: AnnState[] = [
    base({
      kind: 'incident', status: 'active', startsAt: iso(t0 - 40 * MIN), title: { tr: 'Trendyol sipariş eşitlemesinde gecikme', en: 'Delay in Trendyol order sync' },
      body: { tr: 'Trendyol kaynaklı yavaşlık nedeniyle siparişler 15–20 dakika gecikmeli geliyor. Veri kaybı yok; düzeldiğinde bu duyuru kalkacak.', en: 'Orders from Trendyol arrive 15–20 minutes late due to an upstream slowdown. No data loss.' },
      target: { mode: 'all' }, scheduledBy: ADMIN_ID, fanout: { done: true, tenants: 12, notified: 31 }, createdAt: iso(t0 - 45 * MIN), updatedAt: iso(t0 - 40 * MIN),
    }),
    base({
      kind: 'maintenance', status: 'scheduled', startsAt: iso(t0 + 2 * DAY + 23 * HOUR), endsAt: iso(t0 + 3 * DAY + HOUR),
      title: { tr: 'Planlı bakım: veritabanı güncellemesi', en: 'Planned maintenance: database upgrade' },
      body: { tr: 'Bakım süresince (yaklaşık 2 saat) panelde kayıt işlemleri kapalı olacak; pazaryeri eşitlemeleri bakımdan sonra kaldığı yerden sürer.', en: 'During maintenance (about 2 hours) saving in the panel will be disabled; marketplace syncs resume afterwards.' },
      target: { mode: 'plans', planCodes: ['growth', 'enterprise'] }, channels: { banner: true, inApp: true, email: true }, emailConsentAt: iso(t0 - DAY), scheduledBy: ADMIN_ID,
      createdAt: iso(t0 - 2 * DAY), updatedAt: iso(t0 - DAY),
    }),
    base({
      kind: 'release', status: 'draft', startsAt: iso(t0 + 6 * DAY), title: { tr: 'Yeni: toplu fiyat güncelleme', en: 'New: bulk price update' },
      body: { tr: 'Ürün listesinden birden fazla kanalda fiyatı tek adımda güncelleyebilirsiniz.' }, target: { mode: 'tenants', tids: [101, 102, 107] },
      audience: 'owners_admins', channels: { banner: true, inApp: false, email: false }, createdAt: iso(t0 - 5 * HOUR), updatedAt: iso(t0 - 5 * HOUR),
    }),
    base({
      kind: 'info', status: 'ended', startsAt: iso(t0 - 12 * DAY), endsAt: iso(t0 - 5 * DAY), title: { tr: 'Destek saatleri güncellendi', en: 'Support hours updated' },
      body: { tr: 'Hafta içi 09.00–19.00 arası canlı destek veriyoruz.' }, fanout: { done: true, tenants: 12, notified: 28 }, scheduledBy: ADMIN_ID,
      createdAt: iso(t0 - 13 * DAY), updatedAt: iso(t0 - 5 * DAY),
    }),
    base({
      kind: 'maintenance', status: 'cancelled', startsAt: iso(t0 - 2 * DAY), endsAt: iso(t0 - 2 * DAY + 2 * HOUR), title: { tr: 'Planlı bakım (ertelendi)' },
      body: { tr: 'Bu bakım ileri bir tarihe ertelendi.' }, scheduledBy: ADMIN_ID, cancelledBy: ADMIN_ID, createdAt: iso(t0 - 6 * DAY), updatedAt: iso(t0 - 3 * DAY),
    }),
  ]

  function ann(id: unknown) {
    if (typeof id !== 'string' || !OID.test(id)) throw validation('id', '24 hex')
    const a = announcements.find((x) => x.id === id)
    if (!a) throw notFound('Duyuru bulunamadı.', 'ANNOUNCEMENT_NOT_FOUND')
    return a
  }
  /** Zaman penceresine göre durum ilerler (sunucudaki 60 sn işinin eşdeğeri). */
  function tickStatus(a: AnnState, now: number) {
    if (a.status === 'scheduled' && Date.parse(a.startsAt) <= now) a.status = 'active'
    if (a.status === 'active' && a.endsAt && Date.parse(a.endsAt) <= now) a.status = 'ended'
  }

  function localized(v: unknown, path: string, max: number) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw validation(path, 'nesne olmalı')
    strictNested(v as Record<string, unknown>, ['tr', 'en'], path)
    const o = v as Record<string, unknown>
    if (typeof o.tr !== 'string' || !o.tr.trim() || o.tr.length > max) throw validation(`${path}.tr`, `1..${max} karakter`)
    if (o.en !== undefined && (typeof o.en !== 'string' || !o.en.trim() || o.en.length > max)) throw validation(`${path}.en`, `1..${max} karakter`)
    return { tr: o.tr, ...(o.en ? { en: o.en } : {}) }
  }
  function strictNested(o: Record<string, unknown>, allowed: string[], path: string) {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) throw validation(`${path}.${k}`, 'bilinmeyen alan')
  }
  /** `announcementInput` (strict, iç içe de) + iş kuralları. */
  function parseInput(v: unknown): AnnouncementInput & { severity: AnnouncementSeverity; dismissible: boolean; audience: 'all_members' | 'owners_admins'; endsAt: string | null } {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw validation('announcement', 'nesne olmalı')
    const o = v as Record<string, unknown>
    strictNested(o, ['kind', 'severity', 'title', 'body', 'target', 'audience', 'channels', 'startsAt', 'endsAt', 'dismissible'], 'announcement')
    if (!KINDS.includes(o.kind as never)) throw validation('announcement.kind', 'info|maintenance|incident|release')
    if (o.severity !== undefined && !SEVERITIES.includes(o.severity as never)) throw validation('announcement.severity', 'info|warning|critical')
    const t = o.target as Record<string, unknown> | undefined
    if (!t || typeof t !== 'object') throw validation('announcement.target', 'nesne olmalı')
    strictNested(t, ['mode', 'planCodes', 'tids'], 'announcement.target')
    let target: AnnouncementInput['target']
    if (t.mode === 'all') target = { mode: 'all' }
    else if (t.mode === 'plans') {
      const codes = t.planCodes
      if (!Array.isArray(codes) || !codes.length || codes.length > 50 || !codes.every((c) => typeof c === 'string' && PLAN.test(c))) throw validation('announcement.target.planCodes', '1..50 plan kodu')
      target = { mode: 'plans', planCodes: codes as string[] }
    } else if (t.mode === 'tenants') {
      const tids = t.tids
      if (!Array.isArray(tids) || !tids.length || tids.length > 5000 || !tids.every((n) => Number.isInteger(n) && (n as number) > 0)) throw validation('announcement.target.tids', '1..5000 pozitif tam sayı')
      target = { mode: 'tenants', tids: tids as number[] }
    } else throw validation('announcement.target.mode', 'all|plans|tenants')
    const c = o.channels as Record<string, unknown> | undefined
    if (!c || typeof c !== 'object') throw validation('announcement.channels', 'nesne olmalı')
    strictNested(c, ['banner', 'inApp', 'email'], 'announcement.channels')
    if (![c.banner, c.inApp, c.email].every((b) => typeof b === 'boolean')) throw validation('announcement.channels', 'boolean')
    if (!c.banner && !c.inApp && !c.email) throw validation('announcement.channels', 'en az bir kanal')
    if (c.email && !c.inApp) throw validation('announcement.channels.inApp', 'e-posta için uygulama içi zorunlu')
    if (o.audience !== undefined && o.audience !== 'all_members' && o.audience !== 'owners_admins') throw validation('announcement.audience', 'all_members|owners_admins')
    if (typeof o.startsAt !== 'string' || Number.isNaN(Date.parse(o.startsAt))) throw validation('announcement.startsAt', 'ISO tarih')
    if (o.endsAt !== undefined && o.endsAt !== null && (typeof o.endsAt !== 'string' || Number.isNaN(Date.parse(o.endsAt)))) throw validation('announcement.endsAt', 'ISO tarih')
    if (typeof o.endsAt === 'string' && Date.parse(o.endsAt) <= Date.parse(o.startsAt)) throw validation('announcement.endsAt', 'startsAt sonrası olmalı')
    if (o.dismissible !== undefined && typeof o.dismissible !== 'boolean') throw validation('announcement.dismissible', 'boolean')
    const kind = o.kind as AnnouncementInput['kind']
    return {
      kind,
      severity: (o.severity as AnnouncementSeverity | undefined) ?? defaultSeverity(kind),
      title: localized(o.title, 'announcement.title', 160),
      body: localized(o.body, 'announcement.body', 2000),
      target,
      audience: (o.audience as 'all_members' | 'owners_admins' | undefined) ?? 'all_members',
      channels: { banner: c.banner as boolean, inApp: c.inApp as boolean, email: c.email as boolean },
      startsAt: new Date(o.startsAt).toISOString(),
      endsAt: typeof o.endsAt === 'string' ? new Date(o.endsAt).toISOString() : null,
      // maintenance/incident kapatılamaz (sunucu zorlar).
      dismissible: kind === 'maintenance' || kind === 'incident' ? false : o.dismissible !== false,
    }
  }

  function preview(src: Pick<Announcement, 'kind' | 'severity' | 'title' | 'body' | 'dismissible' | 'startsAt' | 'endsAt'> & { id?: string }): AnnouncementPreview {
    const loc = (l: 'tr' | 'en') => ({ title: (l === 'en' && src.title.en) || src.title.tr, body: (l === 'en' && src.body.en) || src.body.tr })
    const email = (l: 'tr' | 'en') => {
      const x = loc(l)
      const subject = `[Entegrasyonik] ${x.title}`
      return { subject, text: x.body, html: emailHtml(subject, x.body, l) }
    }
    return {
      banner: { id: src.id ?? '000000000000000000000000', kind: src.kind, severity: src.severity, title: src.title, body: src.body, dismissible: src.dismissible, startsAt: src.startsAt, endsAt: src.endsAt ?? null },
      notification: { tr: { title: loc('tr').title, message: loc('tr').body }, en: { title: loc('en').title, message: loc('en').body } },
      email: { tr: email('tr'), en: email('en') },
    }
  }

  // ---------------------------------------------------------------- teslimler
  const CODES = ['ORDER_SYNC_FAILED', 'ORDER_SYNC_LAGGING', 'STOCK_OVERSOLD', 'INTEGRATION_AUTH_FAILED', 'CATALOG_BATCH_FAILED', 'SYSTEM_ANNOUNCEMENT', 'PLATFORM_DELIVERY_DEAD_LETTERS']
  const ERR: Partial<Record<DeliveryStatus, string[]>> = { failed: ['SMTP_4XX', 'SMTP_TIMEOUT'], dead: ['SMTP_5XX', 'no_recipient', 'misconfigured'], skipped: ['opt_out', 'unverified', 'quiet_hours'], suppressed: ['discarded'] }
  const PATTERN: DeliveryStatus[] = ['sent', 'sent', 'sent', 'dead', 'sent', 'skipped', 'failed', 'sent', 'pending', 'sent', 'dead', 'sent', 'suppressed', 'sent', 'sending', 'sent']
  const deliveries: DeliveryRow[] = Array.from({ length: 64 }, (_, i) => {
    const status = PATTERN[i % PATTERN.length]
    const code = CODES[(i * 3) % CODES.length]
    const tid = code.startsWith('PLATFORM_') ? 0 : 101 + ((i * 5) % 12)
    const created = t0 - (i * 47 + 3) * MIN
    const errs = ERR[status]
    return {
      id: hex24(800_000 + i), eventId: hex24(810_000 + Math.floor(i / 2)), tid, code, channel: 'email' as const, mode: i % 5 === 0 ? ('digest' as const) : ('instant' as const), status,
      attempts: status === 'dead' ? 5 : status === 'failed' ? 2 : status === 'pending' ? 0 : 1,
      lastErrorCode: errs ? errs[i % errs.length] : null,
      createdAt: iso(created),
      nextAttemptAt: status === 'pending' ? iso(t0 - 90_000) : status === 'failed' ? iso(t0 + 10 * MIN) : null,
      sentAt: status === 'sent' ? iso(created + 4000) : null,
    }
  })
  function delivery(id: unknown) {
    if (typeof id !== 'string' || !OID.test(id)) throw validation('id', '24 hex')
    const d = deliveries.find((x) => x.id === id)
    if (!d) throw notFound('Teslim kaydı bulunamadı.', 'DELIVERY_NOT_FOUND')
    return d
  }
  function windowStats(since: number): DeliveryWindowStats {
    const rows = deliveries.filter((d) => Date.parse(d.createdAt) >= since)
    const byStatus = Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, 0])) as Record<DeliveryStatus, number>
    const byCode = new Map<string, Partial<Record<DeliveryStatus, number>>>()
    for (const d of rows) {
      byStatus[d.status]++
      const c = byCode.get(d.code) ?? {}
      c[d.status] = (c[d.status] ?? 0) + 1
      byCode.set(d.code, c)
    }
    const total = (s: Partial<Record<DeliveryStatus, number>>) => Object.values(s).reduce((a, b) => a + (b ?? 0), 0)
    return {
      byStatus,
      byChannelStatus: DELIVERY_STATUSES.filter((s) => byStatus[s] > 0).map((s) => ({ channel: 'email' as const, status: s, count: byStatus[s] })),
      byCode: [...byCode.entries()].map(([code, statuses]) => ({ code, statuses })).sort((a, b) => total(b.statuses) - total(a.statuses)).slice(0, 100),
    }
  }

  // ---------------------------------------------------------------- uyarılar
  const alerts: AlertRow[] = [
    { id: hex24(820_001), ruleId: 'R1', scopeKey: 'trendyol:107', level: 'critical', status: 'firing', detail: { integ: 'trendyol', tid: 107, total: 100, errors: 55, rate: 0.55 }, firstFiredAt: iso(t0 - 52 * MIN), lastSeenAt: iso(t0 - MIN), lastNotifiedAt: iso(t0 - 52 * MIN), resolvedAt: null, mutedUntil: null, shadow: false },
    { id: hex24(820_002), ruleId: 'R2', scopeKey: 'auth:n11:103', level: 'critical', status: 'firing', detail: { integ: 'n11', tid: 103, authErrors: 6 }, firstFiredAt: iso(t0 - 3 * HOUR), lastSeenAt: iso(t0 - 2 * MIN), lastNotifiedAt: iso(t0 - 3 * HOUR), resolvedAt: null, mutedUntil: iso(t0 + 5 * HOUR), shadow: false },
    { id: hex24(820_003), ruleId: 'R2', scopeKey: 'circuit:hepsiburada', level: 'warning', status: 'firing', detail: { integ: 'hepsiburada', openCircuits: 2, openForSec: 840 }, firstFiredAt: iso(t0 - 14 * MIN), lastSeenAt: iso(t0 - MIN), lastNotifiedAt: iso(t0 - 14 * MIN), resolvedAt: null, mutedUntil: null, shadow: false },
    { id: hex24(820_004), ruleId: 'R4', scopeKey: 'order-sync-queue', level: 'warning', status: 'firing', detail: { wait: 236, oldestWaitSec: 420 }, firstFiredAt: iso(t0 - 8 * MIN), lastSeenAt: iso(t0 - MIN), lastNotifiedAt: null, resolvedAt: null, mutedUntil: null, shadow: true },
    { id: hex24(820_005), ruleId: 'R7', scopeKey: 'notification-outbox', level: 'warning', status: 'resolved', detail: { dead: 12 }, firstFiredAt: iso(t0 - 26 * HOUR), lastSeenAt: iso(t0 - 24 * HOUR), lastNotifiedAt: iso(t0 - 26 * HOUR), resolvedAt: iso(t0 - 23 * HOUR), mutedUntil: null, shadow: false },
    { id: hex24(820_006), ruleId: 'R1', scopeKey: 'pazarama:105', level: 'warning', status: 'resolved', detail: { integ: 'pazarama', tid: 105, total: 40, errors: 9, rate: 0.225 }, firstFiredAt: iso(t0 - 3 * DAY), lastSeenAt: iso(t0 - 3 * DAY + HOUR), lastNotifiedAt: iso(t0 - 3 * DAY), resolvedAt: iso(t0 - 3 * DAY + 2 * HOUR), mutedUntil: null, shadow: false },
  ]

  // ---------------------------------------------------------------- tenant geçmişi (yalnız meta veri)
  function history(tid: number): TenantHistoryRow[] {
    return Array.from({ length: tid % 3 === 0 ? 0 : 14 }, (_, i) => {
      const c = CATALOG[(i + tid) % 8]
      const emailed = c.defaultChannels.email !== 'off' && i % 2 === 0
      return {
        id: hex24(830_000 + tid * 100 + i), at: iso(t0 - (i * 5 + 1) * HOUR), code: c.code, category: c.category, severity: c.severities[0],
        count: 1 + (i % 4), recipientCount: 2 + (i % 3), inAppCount: 2 + (i % 3), emailQueued: emailed ? 1 : 0, suppressedCount: i % 5 === 0 ? 1 : 0,
        emailStatus: emailed ? (i % 4 === 0 ? { sent: 1, dead: 1 } : { sent: 1 }) : {},
      }
    })
  }

  return {
    setPushEnabled(v: boolean) {
      pushEnabled = v
    },
    setEmailEnabled(v: boolean) {
      emailEnabled = v
    },
    handle(op, body, ctx: MockCtx) {
      if (!op.startsWith('BackofficeNotificationService/')) return UNHANDLED
      for (const a of announcements) tickStatus(a, ctx.now)
      switch (op) {
        case 'BackofficeNotificationService/listAnnouncements': {
          strict(body, ['status', 'kind', 'from', 'to', 'cursor', 'limit'])
          if (body.status !== undefined && !STATUSES.includes(body.status as never)) throw validation('status', 'bilinmeyen durum')
          if (body.kind !== undefined && !KINDS.includes(body.kind as never)) throw validation('kind', 'bilinmeyen tür')
          const from = body.from ? Date.parse(String(body.from)) : -Infinity
          const to = body.to ? Date.parse(String(body.to)) : Infinity
          const list = announcements
            .filter((a) => (!body.status || a.status === body.status) && (!body.kind || a.kind === body.kind) && Date.parse(a.startsAt) >= from && Date.parse(a.startsAt) <= to)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          return page(list, body)
        }
        case 'BackofficeNotificationService/getAnnouncement':
          strict(body, ['id'])
          return { announcement: ann(body.id) }
        case 'BackofficeNotificationService/createAnnouncement': {
          strict(body, ['announcement', 'reason'])
          const input = parseInput(body.announcement)
          const a: AnnState = { id: nextId(), ...input, status: 'draft', emailConsentAt: null, fanout: null, createdBy: ADMIN_ID, updatedBy: null, scheduledBy: null, cancelledBy: null, createdAt: iso(ctx.now), updatedAt: iso(ctx.now) }
          announcements.unshift(a)
          return { announcement: a }
        }
        case 'BackofficeNotificationService/updateAnnouncement': {
          strict(body, ['id', 'announcement', 'reason'])
          const a = ann(body.id)
          const input = parseInput(body.announcement)
          if (a.status !== 'draft') throw conflict('ANNOUNCEMENT_STATE', 'Yalnız taslak duyuru düzenlenebilir.')
          Object.assign(a, input, { updatedBy: ADMIN_ID, updatedAt: iso(ctx.now) })
          return { announcement: a }
        }
        case 'BackofficeNotificationService/scheduleAnnouncement': {
          strict(body, ['id', 'emailConsent', 'reason'])
          if (body.emailConsent !== undefined && typeof body.emailConsent !== 'boolean') throw validation('emailConsent', 'boolean')
          if (ctx.liveReadonly) throw liveReadonly()
          const a = ann(body.id)
          if (a.status !== 'draft') throw conflict('ANNOUNCEMENT_STATE', 'Yalnız taslak duyuru zamanlanabilir.')
          if (a.channels.email && body.emailConsent !== true) throw validation('emailConsent', 'e-posta kanalı için hizmet duyurusu onayı zorunlu')
          a.status = Date.parse(a.startsAt) > ctx.now ? 'scheduled' : 'active'
          a.scheduledBy = ADMIN_ID
          a.updatedAt = iso(ctx.now)
          if (a.channels.email) a.emailConsentAt = iso(ctx.now)
          if (a.status === 'active' && (a.channels.inApp || a.channels.email)) a.fanout = { done: false, tenants: 0, notified: 0 }
          return { announcement: a }
        }
        case 'BackofficeNotificationService/cancelAnnouncement': {
          strict(body, ['id', 'reason'])
          const a = ann(body.id)
          if (!['draft', 'scheduled', 'active'].includes(a.status)) throw conflict('ANNOUNCEMENT_STATE', 'Bitmiş ya da iptal edilmiş duyuru iptal edilemez.')
          a.status = 'cancelled'
          a.cancelledBy = ADMIN_ID
          a.updatedAt = iso(ctx.now)
          return { announcement: a }
        }
        case 'BackofficeNotificationService/previewAnnouncement': {
          strict(body, ['id', 'draft'])
          if ((body.id === undefined) === (body.draft === undefined)) throw validation('id', 'id ya da draft (yalnız biri)')
          if (body.id !== undefined) return preview(ann(body.id))
          const d = parseInput(body.draft)
          return preview(d)
        }
        case 'BackofficeNotificationService/getDeliveryStats': {
          strict(body, [])
          const pending = deliveries.filter((d) => d.status === 'pending' && d.nextAttemptAt)
          const oldest = pending.length ? Math.min(...pending.map((d) => Date.parse(d.nextAttemptAt!))) : null
          return {
            generatedAt: iso(ctx.now),
            oldestPendingAgeSec: oldest === null ? null : Math.max(0, Math.round((ctx.now - oldest) / 1000)),
            windows: { '24h': windowStats(ctx.now - DAY), '7d': windowStats(ctx.now - 7 * DAY) },
          }
        }
        case 'BackofficeNotificationService/listDeliveries': {
          strict(body, ['status', 'channel', 'tid', 'code', 'eventId', 'cursor', 'limit'])
          if (body.status !== undefined && !DELIVERY_STATUSES.includes(body.status as DeliveryStatus)) throw validation('status', 'bilinmeyen durum')
          if (body.channel !== undefined && body.channel !== 'email') throw validation('channel', 'email')
          if (body.code !== undefined && (typeof body.code !== 'string' || !CODE.test(body.code))) throw validation('code', 'SCREAMING_SNAKE')
          if (body.eventId !== undefined && (typeof body.eventId !== 'string' || !OID.test(body.eventId))) throw validation('eventId', '24 hex')
          if (body.tid !== undefined && (!Number.isInteger(body.tid) || (body.tid as number) < 1)) throw validation('tid', 'pozitif tam sayı')
          const list = deliveries.filter(
            (d) => (!body.status || d.status === body.status) && (body.tid === undefined || d.tid === body.tid) && (!body.code || d.code === body.code) && (!body.eventId || d.eventId === body.eventId),
          )
          return page(list, body)
        }
        case 'BackofficeNotificationService/retryDelivery': {
          strict(body, ['id', 'tid', 'reason'])
          if (ctx.liveReadonly) throw liveReadonly()
          const d = delivery(body.id)
          if (d.status !== 'dead' && d.status !== 'failed') throw conflict('DELIVERY_STATE', 'Yalnız kalıcı hatalı ya da başarısız teslim yeniden denenir.')
          Object.assign(d, { status: 'pending', attempts: 0, nextAttemptAt: iso(ctx.now), lastErrorCode: d.lastErrorCode })
          return { id: d.id, ok: true }
        }
        case 'BackofficeNotificationService/discardDelivery': {
          strict(body, ['id', 'tid', 'reason'])
          const d = delivery(body.id)
          if (!['pending', 'dead', 'failed', 'skipped'].includes(d.status)) throw conflict('DELIVERY_STATE', 'Bu durumdaki teslim atılamaz.')
          Object.assign(d, { status: 'suppressed', lastErrorCode: 'discarded', nextAttemptAt: null })
          return { id: d.id, ok: true }
        }
        case 'BackofficeNotificationService/getCatalog':
          strict(body, [])
          return { items: CATALOG.map(({ tpl: _tpl, ...c }) => c) }
        case 'BackofficeNotificationService/previewTemplate': {
          strict(body, ['code', 'locale', 'channel', 'params'])
          if (typeof body.code !== 'string' || !CODE.test(body.code)) throw validation('code', 'SCREAMING_SNAKE')
          if (body.locale !== 'tr' && body.locale !== 'en') throw validation('locale', 'tr|en')
          if (body.channel !== 'inApp' && body.channel !== 'email') throw validation('channel', 'inApp|email')
          const c = CATALOG.find((x) => x.code === body.code)
          if (!c) throw notFound('Bildirim kodu bulunamadı.')
          const params = (body.params ?? c.example) as Record<string, unknown>
          if (!params || typeof params !== 'object' || Array.isArray(params)) throw validation('params', 'nesne')
          // Katalog şeması (strict): yalnız örnekteki alanlar, aynı tür. İleti değer içermez (alan yolu + kural kodu).
          const bad = Object.keys(params).find((k) => !(k in c.example)) ?? Object.keys(c.example).find((k) => typeof params[k] !== typeof c.example[k])
          if (bad) throw new MockHttpError(400, 'VALIDATION', `params geçersiz: ${bad}:${bad in c.example ? 'invalid_type' : 'unrecognized_keys'}`, [{ path: `params.${bad}`, message: bad in c.example ? 'invalid_type' : 'unrecognized_keys' }])
          const [title, msg] = c.tpl[body.locale]
          const t = fill(title, params)
          const m = fill(msg, params)
          if (body.channel === 'inApp') return { channel: 'inApp', locale: body.locale, title: t, message: m, actionPath: c.category === 'order' ? '/integrations/health' : null, severity: c.severities[0] }
          const subject = `[Entegrasyonik] ${t}`
          return { channel: 'email', locale: body.locale, subject, text: m, html: emailHtml(subject, m, body.locale) }
        }
        case 'BackofficeNotificationService/sendTestEmail':
          strict(body, ['reason'])
          if (ctx.liveReadonly) throw liveReadonly()
          if (!emailEnabled) throw new MockHttpError(503, 'NOTIFY_EMAIL_UNAVAILABLE', 'E-posta gönderimi şu an kapalı.')
          return { sent: true }
        case 'BackofficeNotificationService/getTenantHistory': {
          strict(body, ['tid', 'cursor', 'limit'])
          const tid = Number(body.tid)
          if (!Number.isInteger(tid) || tid < 1) throw validation('tid', 'pozitif tam sayı')
          return page(history(tid), body)
        }
        case 'BackofficeNotificationService/listAlerts': {
          strict(body, ['status', 'level', 'ruleId', 'cursor', 'limit'])
          if (body.status !== undefined && body.status !== 'firing' && body.status !== 'resolved') throw validation('status', 'firing|resolved')
          if (body.level !== undefined && body.level !== 'warning' && body.level !== 'critical') throw validation('level', 'warning|critical')
          if (body.ruleId !== undefined && !/^R\d{1,2}$/.test(String(body.ruleId))) throw validation('ruleId', 'R<n>')
          const list = alerts
            .filter((a) => (!body.status || a.status === body.status) && (!body.level || a.level === body.level) && (!body.ruleId || a.ruleId === body.ruleId))
            .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
          return page(list, body)
        }
        // MOB-06: platform yöneticisi web push aboneliği. Açık anahtar gerçek bir P-256 VAPID açık anahtarıdır (sır değil; özel eşi YOK).
        case 'BackofficePrefsService/getPushConfig':
          strict(body, [])
          return { enabled: pushEnabled, publicKey: pushEnabled ? MOCK_VAPID_PUBLIC : null, fcm: pushEnabled, devices: pushEnabled ? pushDevices.map(({ endpoint: _e, ...d }) => d) : [] }
        case 'BackofficePrefsService/subscribePush': {
          strict(body, ['subscription', 'fcmToken', 'deviceLabel'])
          if (!pushEnabled) throw new MockHttpError(409, 'PUSH_DISABLED', 'Anlık bildirimler şu an kullanılamıyor.')
          if (!body.subscription === !body.fcmToken) throw validation('subscription', 'abonelik ya da fcmToken — yalnız biri')
          let endpoint: string
          if (body.fcmToken) {
            if (!/^[A-Za-z0-9_:-]{32,4096}$/.test(String(body.fcmToken))) throw new MockHttpError(400, 'PUSH_TOKEN_INVALID', 'Cihaz bildirim kaydı geçersiz.')
            endpoint = `fcm:${String(body.fcmToken)}`
          } else {
            const sub = body.subscription as { endpoint?: unknown } | undefined
            endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : ''
            if (!/^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//.test(endpoint)) {
              throw new MockHttpError(400, 'PUSH_ENDPOINT_NOT_ALLOWED', 'Bu tarayıcının bildirim servisi desteklenmiyor.')
            }
          }
          const existing = pushDevices.find((d) => d.endpoint === endpoint)
          if (existing) existing.deviceLabel = typeof body.deviceLabel === 'string' ? body.deviceLabel : null
          else pushDevices.unshift({ id: nextId(), endpoint, deviceLabel: typeof body.deviceLabel === 'string' ? body.deviceLabel : null, createdAt: iso(ctx.now), lastSuccessAt: null })
          return { ok: true }
        }
        case 'BackofficePrefsService/unsubscribePush': {
          strict(body, ['endpoint', 'id', 'fcmToken'])
          if ([body.endpoint, body.id, body.fcmToken].filter(Boolean).length !== 1) throw validation('endpoint', 'uç, kimlik ya da fcmToken — yalnız biri')
          const target = body.fcmToken ? `fcm:${String(body.fcmToken)}` : body.endpoint
          const before = pushDevices.length
          pushDevices = pushDevices.filter((d) => d.endpoint !== target && d.id !== body.id)
          return { removed: before - pushDevices.length }
        }
        case 'BackofficeNotificationService/muteAlert': {
          strict(body, ['ruleId', 'scopeKey', 'hours', 'reason'])
          const hours = Number(body.hours)
          if (!Number.isInteger(hours) || hours < 0 || hours > ALERT_MUTE_MAX_HOURS) throw validation('hours', `0..${ALERT_MUTE_MAX_HOURS}`)
          const a = alerts.find((x) => x.ruleId === body.ruleId && x.scopeKey === body.scopeKey && x.status === 'firing')
          if (!a) throw notFound('Uyarı bulunamadı ya da çözülmüş.', 'ALERT_NOT_FOUND')
          a.mutedUntil = hours === 0 ? null : iso(ctx.now + hours * HOUR)
          return { ruleId: a.ruleId, scopeKey: a.scopeKey, mutedUntil: a.mutedUntil }
        }
      }
      return UNHANDLED
    },
  }
}
