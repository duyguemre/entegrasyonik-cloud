// NB7/NB8 sahte uçları sözleşme şekline birebir uyar (fazla alan yok), strict gövde (iç içe duyuru nesnesi dahil),
// step-up + gerekçe, durum kuralları (409), LIVE_READONLY (423), sızıntı kuralları. Kaynak: API_BACKOFFICE_NOTIFICATIONS.md.
import { describe, expect, it } from 'vitest'
import { createAdminApi } from '../src/api/client'
import { REAUTH_OPS } from '../src/api/contract'
import type { AnnouncementInput } from '../src/api/contract'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'
import { parseTids, toInput } from '../src/views/notifications/announcementText'

type Shape = Record<string, string>
function conforms(obj: unknown, shape: Shape, where: string) {
  const o = obj as Record<string, unknown>
  const keys = Object.keys(shape).map((k) => k.replace('?', ''))
  for (const key of Object.keys(o)) expect(keys, `${where}: fazla alan ${key}`).toContain(key)
  for (const [k, type] of Object.entries(shape)) {
    const key = k.replace('?', '')
    const v = o[key]
    if (v === undefined) {
      expect(k.endsWith('?'), `${where}: eksik ${key}`).toBe(true)
      continue
    }
    const actual = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v
    expect(type.split('|'), `${where}.${key} = ${actual}`).toContain(actual)
  }
}
const ANN: Shape = {
  id: 'string', kind: 'string', severity: 'string', title: 'object', body: 'object', target: 'object', audience: 'string', channels: 'object',
  startsAt: 'string', endsAt: 'string|null', dismissible: 'boolean', status: 'string', emailConsentAt: 'string|null', fanout: 'object|null',
  createdBy: 'string', updatedBy: 'string|null', scheduledBy: 'string|null', cancelledBy: 'string|null', createdAt: 'string', updatedAt: 'string',
}
const REASON = 'Destek kaydı DK-örnek: duyuru testi'
const S = 'BackofficeNotificationService/'

async function signedIn(opts: { reauth?: boolean } = {}) {
  const server = new MockAdminServer()
  const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
  await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
  await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
  if (opts.reauth === false) server.expireReauth()
  return { api, server }
}
const draft = (over: Partial<AnnouncementInput> = {}): AnnouncementInput => ({
  kind: 'release',
  title: { tr: 'Yeni özellik' },
  body: { tr: 'Toplu fiyat güncelleme yayında.' },
  target: { mode: 'plans', planCodes: ['growth'] },
  channels: { banner: true, inApp: true, email: false },
  startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  endsAt: null,
  ...over,
})

describe('BO-N1 duyurular', () => {
  it('liste şekli + imleç + filtre; boş filtre boş liste', async () => {
    const { api } = await signedIn()
    const res = await api.call(`${S}listAnnouncements`, { limit: 2 })
    conforms(res, { items: 'array', nextCursor: 'string|null' }, 'list')
    expect(res.items).toHaveLength(2)
    for (const a of res.items) conforms(a, ANN, 'announcement')
    const next = await api.call(`${S}listAnnouncements`, { limit: 2, cursor: res.nextCursor! })
    expect(next.items.map((a) => a.id)).not.toContain(res.items[0].id)
    const active = await api.call(`${S}listAnnouncements`, { status: 'active' })
    expect(active.items.every((a) => a.status === 'active')).toBe(true)
    await expect(api.call(`${S}listAnnouncements`, { status: 'x' as never })).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    await expect(api.call(`${S}listAnnouncements`, { bogus: 1 } as never)).rejects.toMatchObject({ status: 400 })
  })

  it('oluştur → taslak; güncelle; zamanla (gelecek → scheduled); iptal; durum kuralları 409', async () => {
    const { api } = await signedIn()
    const { announcement: a } = await api.call(`${S}createAnnouncement`, { announcement: draft(), reason: REASON })
    conforms(a, ANN, 'created')
    expect(a).toMatchObject({ status: 'draft', severity: 'info', dismissible: true, audience: 'all_members', fanout: null })
    const upd = await api.call(`${S}updateAnnouncement`, { id: a.id, announcement: draft({ title: { tr: 'Güncel başlık', en: 'Updated' } }), reason: REASON })
    expect(upd.announcement.title).toEqual({ tr: 'Güncel başlık', en: 'Updated' })
    const sch = await api.call(`${S}scheduleAnnouncement`, { id: a.id, reason: REASON })
    expect(sch.announcement.status).toBe('scheduled')
    await expect(api.call(`${S}updateAnnouncement`, { id: a.id, announcement: draft(), reason: REASON })).rejects.toMatchObject({ status: 409, code: 'ANNOUNCEMENT_STATE' })
    await expect(api.call(`${S}scheduleAnnouncement`, { id: a.id, reason: REASON })).rejects.toMatchObject({ status: 409, code: 'ANNOUNCEMENT_STATE' })
    expect((await api.call(`${S}cancelAnnouncement`, { id: a.id, reason: REASON })).announcement.status).toBe('cancelled')
    await expect(api.call(`${S}cancelAnnouncement`, { id: a.id, reason: REASON })).rejects.toMatchObject({ status: 409, code: 'ANNOUNCEMENT_STATE' })
    await expect(api.call(`${S}getAnnouncement`, { id: 'f'.repeat(24) })).rejects.toMatchObject({ status: 404, code: 'ANNOUNCEMENT_NOT_FOUND' })
  })

  it('geçmiş başlangıç → hemen active; maintenance/incident kapatılamaz; e-posta onayı zorunlu', async () => {
    const { api } = await signedIn()
    const past = await api.call(`${S}createAnnouncement`, { announcement: draft({ kind: 'incident', startsAt: new Date(Date.now() - 60_000).toISOString(), dismissible: true }), reason: REASON })
    expect(past.announcement).toMatchObject({ severity: 'critical', dismissible: false })
    expect((await api.call(`${S}scheduleAnnouncement`, { id: past.announcement.id, reason: REASON })).announcement.status).toBe('active')
    const mail = await api.call(`${S}createAnnouncement`, { announcement: draft({ channels: { banner: false, inApp: true, email: true } }), reason: REASON })
    await expect(api.call(`${S}scheduleAnnouncement`, { id: mail.announcement.id, reason: REASON })).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    const ok = await api.call(`${S}scheduleAnnouncement`, { id: mail.announcement.id, emailConsent: true, reason: REASON })
    expect(ok.announcement.emailConsentAt).toEqual(expect.any(String))
  })

  it('girdi strict (iç içe dahil) + iş kuralları', async () => {
    const { api } = await signedIn()
    const bad = async (announcement: unknown) =>
      expect(api.call(`${S}createAnnouncement`, { announcement: announcement as AnnouncementInput, reason: REASON })).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    await bad({ ...draft(), extra: 1 })
    await bad({ ...draft(), target: { mode: 'all', planCodes: ['growth'], x: 1 } })
    await bad({ ...draft(), channels: { banner: false, inApp: false, email: false } })
    await bad({ ...draft(), channels: { banner: false, inApp: false, email: true } })
    await bad({ ...draft(), title: { tr: 'x'.repeat(161) } })
    await bad({ ...draft(), target: { mode: 'tenants', tids: [] } })
    await bad({ ...draft(), endsAt: new Date(Date.now() - 1).toISOString() })
  })

  it('önizleme: id ya da draft (yalnız biri); gönderim/yazma yok; html kaçışlı', async () => {
    const { api } = await signedIn()
    const list = await api.call(`${S}listAnnouncements`, {})
    const before = list.items.length
    const p = await api.call(`${S}previewAnnouncement`, { draft: draft({ title: { tr: '<script>x</script>' } }) })
    conforms(p, { banner: 'object', notification: 'object', email: 'object' }, 'preview')
    conforms(p.banner, { id: 'string', kind: 'string', severity: 'string', title: 'object', body: 'object', dismissible: 'boolean', startsAt: 'string', endsAt: 'string|null' }, 'banner')
    conforms(p.email.tr, { subject: 'string', text: 'string', html: 'string' }, 'email')
    expect(p.email.tr.html).not.toContain('<script>')
    expect(p.email.tr.html).toContain('&lt;script&gt;')
    expect(p.email.en.subject).toContain('<script>x</script>') // en yoksa tr'ye düşer (konu düz metin)
    expect((await api.call(`${S}listAnnouncements`, {})).items.length).toBe(before)
    await expect(api.call(`${S}previewAnnouncement`, { id: list.items[0].id, draft: draft() } as never)).rejects.toMatchObject({ status: 400 })
    await expect(api.call(`${S}previewAnnouncement`, {} as never)).rejects.toMatchObject({ status: 400 })
  })
})

describe('BO-N2 teslim günlüğü + katalog', () => {
  it('istatistik şekli', async () => {
    const { api } = await signedIn()
    const s = await api.call(`${S}getDeliveryStats`, {})
    conforms(s, { generatedAt: 'string', oldestPendingAgeSec: 'number|null', windows: 'object' }, 'stats')
    for (const w of ['24h', '7d'] as const) {
      conforms(s.windows[w], { byStatus: 'object', byChannelStatus: 'array', byCode: 'array' }, `window.${w}`)
      expect(Object.keys(s.windows[w].byStatus).sort()).toEqual(['dead', 'failed', 'pending', 'sending', 'sent', 'skipped', 'suppressed'])
    }
  })

  it('teslim satırı: adres/kullanıcı/metin YOK; süzgeçler; retry/discard durum kuralları; 423', async () => {
    const { api, server } = await signedIn()
    const res = await api.call(`${S}listDeliveries`, { limit: 200 })
    const ROW = { id: 'string', eventId: 'string', tid: 'number', code: 'string', channel: 'string', mode: 'string', status: 'string', attempts: 'number', lastErrorCode: 'string|null', createdAt: 'string', nextAttemptAt: 'string|null', sentAt: 'string|null' }
    for (const d of res.items) conforms(d, ROW, 'delivery')
    const flat = JSON.stringify(res)
    expect(flat.includes('@'), 'e-posta adresi').toBe(false)
    expect(/"(email|to|address|userId|recipients?|message|params|title|body)":/.test(flat), 'yasak alan').toBe(false)
    expect(res.items.some((d) => d.tid === 0)).toBe(true)
    const dead = (await api.call(`${S}listDeliveries`, { status: 'dead' })).items
    expect(dead.length).toBeGreaterThan(0)
    const byEvent = await api.call(`${S}listDeliveries`, { eventId: dead[0].eventId })
    expect(byEvent.items.every((d) => d.eventId === dead[0].eventId)).toBe(true)
    server.setLiveReadonly(true)
    await expect(api.call(`${S}retryDelivery`, { id: dead[0].id, reason: REASON })).rejects.toMatchObject({ status: 423 })
    server.setLiveReadonly(false)
    expect(await api.call(`${S}retryDelivery`, { id: dead[0].id, tid: dead[0].tid || undefined, reason: REASON })).toEqual({ id: dead[0].id, ok: true })
    await expect(api.call(`${S}retryDelivery`, { id: dead[0].id, reason: REASON })).rejects.toMatchObject({ status: 409, code: 'DELIVERY_STATE' })
    expect(await api.call(`${S}discardDelivery`, { id: dead[0].id, reason: REASON })).toEqual({ id: dead[0].id, ok: true })
    await expect(api.call(`${S}discardDelivery`, { id: dead[0].id, reason: REASON })).rejects.toMatchObject({ status: 409, code: 'DELIVERY_STATE' })
    const sending = (await api.call(`${S}listDeliveries`, { status: 'sending' })).items[0]
    await expect(api.call(`${S}discardDelivery`, { id: sending.id, reason: REASON })).rejects.toMatchObject({ code: 'DELIVERY_STATE' })
    await expect(api.call(`${S}retryDelivery`, { id: 'a'.repeat(24), reason: REASON })).rejects.toMatchObject({ status: 404, code: 'DELIVERY_NOT_FOUND' })
    await expect(api.call(`${S}listDeliveries`, { code: 'kucuk' })).rejects.toMatchObject({ status: 400 })
  })

  it('katalog + şablon önizleme (params strict, ileti değer içermez) + test e-postası (adres yok, 503, 423)', async () => {
    const { api, server } = await signedIn()
    const { items } = await api.call(`${S}getCatalog`, {})
    for (const c of items) {
      conforms(c, { code: 'string', category: 'string', severities: 'array', mandatory: 'boolean', defaultChannels: 'object', permission: 'string', retention: 'string', surface: 'string', titleKey: 'string', bodyKey: 'string', grouped: 'boolean', legacy: 'boolean', example: 'object' }, 'catalog')
    }
    const inApp = await api.call(`${S}previewTemplate`, { code: 'ORDER_SYNC_FAILED', locale: 'tr', channel: 'inApp' })
    conforms(inApp, { channel: 'string', locale: 'string', title: 'string', message: 'string', actionPath: 'string|null', severity: 'string' }, 'inApp')
    expect(inApp.channel === 'inApp' && inApp.message).toContain('UPSTREAM_TIMEOUT')
    const mail = await api.call(`${S}previewTemplate`, { code: 'ORDER_SYNC_FAILED', locale: 'en', channel: 'email', params: { integ: 'n11', errorCode: 'X', corrId: 'c-2' } })
    conforms(mail, { channel: 'string', locale: 'string', subject: 'string', text: 'string', html: 'string' }, 'email')
    const err = await api.call(`${S}previewTemplate`, { code: 'ORDER_SYNC_FAILED', locale: 'tr', channel: 'inApp', params: { integ: 'gizli-deger', extra: 'x' } }).catch((e) => e)
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION' })
    expect(err.message).not.toContain('gizli-deger')
    const sent = await api.call(`${S}sendTestEmail`, { reason: REASON })
    expect(sent).toEqual({ sent: true })
    server.setNotifyEmail(false)
    await expect(api.call(`${S}sendTestEmail`, { reason: REASON })).rejects.toMatchObject({ status: 503, code: 'NOTIFY_EMAIL_UNAVAILABLE' })
    server.setLiveReadonly(true)
    await expect(api.call(`${S}sendTestEmail`, { reason: REASON })).rejects.toMatchObject({ status: 423 })
  })
})

describe('BO-N3 tenant geçmişi + NB8 uyarılar', () => {
  it('geçmiş yalnız meta veri; boş müşteri boş liste', async () => {
    const { api } = await signedIn()
    const res = await api.call(`${S}getTenantHistory`, { tid: 101 })
    expect(res.items.length).toBeGreaterThan(0)
    for (const r of res.items) {
      conforms(r, { id: 'string', at: 'string', code: 'string', category: 'string', severity: 'string', count: 'number', recipientCount: 'number', inAppCount: 'number', emailQueued: 'number', suppressedCount: 'number', emailStatus: 'object' }, 'history')
    }
    expect(await api.call(`${S}getTenantHistory`, { tid: 102 })).toEqual({ items: [], nextCursor: null })
    await expect(api.call(`${S}getTenantHistory`, { tid: 0 })).rejects.toMatchObject({ status: 400 })
  })

  it('uyarı şekli, süzgeç, sustur/kaldır, çözülmüş uyarı 404', async () => {
    const { api } = await signedIn()
    const res = await api.call(`${S}listAlerts`, { status: 'firing' })
    for (const a of res.items) {
      conforms(a, { id: 'string', ruleId: 'string', scopeKey: 'string', level: 'string', status: 'string', detail: 'object', firstFiredAt: 'string', lastSeenAt: 'string', lastNotifiedAt: 'string|null', resolvedAt: 'string|null', mutedUntil: 'string|null', shadow: 'boolean' }, 'alert')
      for (const v of Object.values(a.detail)) expect(['string', 'number']).toContain(typeof v)
    }
    const a = res.items.find((x) => !x.mutedUntil)!
    const m = await api.call(`${S}muteAlert`, { ruleId: a.ruleId, scopeKey: a.scopeKey, hours: 4, reason: REASON })
    conforms(m, { ruleId: 'string', scopeKey: 'string', mutedUntil: 'string|null' }, 'mute')
    expect(Date.parse(m.mutedUntil!)).toBeGreaterThan(Date.now() + 3.9 * 3_600_000)
    expect((await api.call(`${S}muteAlert`, { ruleId: a.ruleId, scopeKey: a.scopeKey, hours: 0, reason: REASON })).mutedUntil).toBeNull()
    await expect(api.call(`${S}muteAlert`, { ruleId: a.ruleId, scopeKey: a.scopeKey, hours: 337, reason: REASON })).rejects.toMatchObject({ status: 400 })
    const resolved = (await api.call(`${S}listAlerts`, { status: 'resolved' })).items[0]
    await expect(api.call(`${S}muteAlert`, { ruleId: resolved.ruleId, scopeKey: resolved.scopeKey, hours: 1, reason: REASON })).rejects.toMatchObject({ status: 404, code: 'ALERT_NOT_FOUND' })
  })
})

describe('yazan uçlar: step-up + gerekçe (REAUTH_OPS ile backend REAUTH_RPCS aynı küme)', () => {
  const WRITES = ['createAnnouncement', 'updateAnnouncement', 'scheduleAnnouncement', 'cancelAnnouncement', 'retryDelivery', 'discardDelivery', 'sendTestEmail', 'muteAlert'].map((o) => `${S}${o}`)
  it('hepsi REAUTH_OPS içinde; okuma uçları değil', () => {
    for (const op of WRITES) expect(REAUTH_OPS as readonly string[]).toContain(op)
    expect((REAUTH_OPS as readonly string[]).filter((o) => o.startsWith(S)).sort()).toEqual([...WRITES].sort())
  })
  it('step-up yoksa 401 REAUTH_REQUIRED; gerekçe kısa ise 400', async () => {
    const { api } = await signedIn({ reauth: false })
    await expect(api.call(`${S}sendTestEmail`, { reason: REASON })).rejects.toMatchObject({ status: 401, code: 'REAUTH_REQUIRED' })
    const { api: api2 } = await signedIn()
    await expect(api2.call(`${S}sendTestEmail`, { reason: 'kısa' })).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    // Okuma step-up istemez.
    await expect(api.call(`${S}getCatalog`, {})).resolves.toBeTruthy()
  })
})

describe('düzenleyici yardımcıları', () => {
  it('parseTids: ayırıcılar, #, tekrar, geçersiz', () => {
    expect(parseTids('101, 102\n#107 102;abc -3')).toEqual({ tids: [101, 102, 107], invalid: ['abc', '-3'] })
  })
  it('toInput: sunucu alanları atılır (strict gövde)', async () => {
    const { api } = await signedIn()
    const a = (await api.call(`${S}listAnnouncements`, {})).items[0]
    expect(Object.keys(toInput(a)).sort()).toEqual(['audience', 'body', 'channels', 'dismissible', 'endsAt', 'kind', 'severity', 'startsAt', 'target', 'title'])
    await expect(api.call(`${S}previewAnnouncement`, { draft: toInput(a) })).resolves.toBeTruthy()
  })
})
