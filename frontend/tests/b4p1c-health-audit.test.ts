// ADR-0015 B4-P1c — N7 (entegrasyon sağlığı) + N10 (denetim günlüğü) saf yardımcıları.
// Sözleşme: docs/API_TENANT_SURFACE.md §3/§4. Sentetik veri (Protokol 7).
import { describe, expect, it } from 'vitest'
import {
  apiErrorStatus, credentialState, errorCodeDistribution, healthPresentation, sortByUrgency, successRatio, summarizeHealth,
  syncInterpretation, type IntegrationHealthItem,
} from '../src/composables/useIntegrationHealthApi'
import {
  EVENT_LABELS, buildRequest, defaultRange, emptyFilters, eventKeyLabel, eventLabel, eventOptions, metaRows, parseTrDate,
  toAuditUsers, validateFilters, type AuditFilters,
} from '../src/composables/useAuditLogApi'

function item(over: Partial<IntegrationHealthItem> = {}): IntegrationHealthItem {
  return {
    integrationCode: 'trendyol', type: 'marketplace', enabled: true, credentialsConfigured: true,
    lastSuccessfulSyncAt: '2026-09-29T08:00:00.000Z', webhook: null, lastError: null, circuit: null,
    last24h: { total: 0, success: 0, error: 0, errorsByCode: {} }, health: 'no_data', ...over,
  }
}

describe('N7 entegrasyon sağlığı yardımcıları', () => {
  it('§3 uyarı (a): kimlik bilgisi girilmemişse tohumlanmış senkron tarihi "hiç bağlanmadı" yorumlanır', () => {
    expect(syncInterpretation(item({ credentialsConfigured: false }))).toBe('never')
    expect(syncInterpretation(item({ credentialsConfigured: null }))).toBe('never')
    expect(syncInterpretation(item({ credentialsConfigured: true, lastSuccessfulSyncAt: null }))).toBe('none')
    expect(syncInterpretation(item())).toBe('synced')
  })

  it('kimlik bilgisi durumu: true/false/null ayrı gösterilir (değer asla yok)', () => {
    expect(credentialState(item({ credentialsConfigured: true }))).toBe('configured')
    expect(credentialState(item({ credentialsConfigured: false }))).toBe('missing')
    expect(credentialState(item({ credentialsConfigured: null }))).toBe('no_record')
  })

  it('sunum tonu: health → EkStatusChip tonu; bilinmeyen değer sağlıklı GÖSTERİLMEZ', () => {
    expect(healthPresentation('healthy').tone).toBe('success')
    expect(healthPresentation('degraded').tone).toBe('warning')
    expect(healthPresentation('down').tone).toBe('danger')
    expect(healthPresentation('not_configured').tone).toBe('neutral')
    expect(healthPresentation('beklenmeyen').tone).toBe('neutral')
  })

  it('sorunlu olan önce sıralanır, özet sayılar ve 24 sa toplamları doğru', () => {
    const list = [
      item({ integrationCode: 'n11', health: 'healthy', last24h: { total: 10, success: 10, error: 0, errorsByCode: {} } }),
      item({ integrationCode: 'hepsiburada', health: 'down', last24h: { total: 4, success: 1, error: 3, errorsByCode: { UNAVAILABLE: 3 } } }),
      item({ integrationCode: 'pazarama', health: 'not_configured' }),
      item({ integrationCode: 'trendyol', health: 'degraded', last24h: { total: 6, success: 5, error: 1, errorsByCode: { RATE_LIMITED: 1 } } }),
    ]
    expect(sortByUrgency(list).map((i) => i.integrationCode)).toEqual(['hepsiburada', 'trendyol', 'n11', 'pazarama'])
    expect(summarizeHealth(list)).toEqual({ total: 4, healthy: 1, attention: 1, down: 1, idle: 1, calls: 20, errors: 4 })
    expect(successRatio(list[0])).toBe(1)
    expect(successRatio(list[2])).toBeNull()
  })

  it('hata kodu dağılımı: çoktan aza, en fazla 4 + "diğer"', () => {
    const it = item({ last24h: { total: 9, success: 0, error: 9, errorsByCode: { AUTH: 1, RATE_LIMITED: 4, UNAVAILABLE: 2, VALIDATION: 1, NOT_FOUND: 1 } } })
    const d = errorCodeDistribution(it)
    expect(d.map((x) => x.code)).toEqual(['RATE_LIMITED', 'UNAVAILABLE', 'AUTH', 'NOT_FOUND', 'OTHER'])
    expect(d.reduce((a, x) => a + x.count, 0)).toBe(9)
    expect(errorCodeDistribution(item())).toEqual([])
  })

  it('restapi hata nesnesinden HTTP durumu çıkarılır; başarı yanıtı hata sayılmaz', () => {
    expect(apiErrorStatus({ isAxiosError: true, response: { status: 403 } })).toBe(403)
    expect(apiErrorStatus(Object.assign(new Error('x'), { response: undefined }))).toBeNull()
    expect(apiErrorStatus(undefined)).toBeNull()
    expect(apiErrorStatus({ integrations: [] })).toBeUndefined()
  })
})

describe('N10 denetim günlüğü yardımcıları', () => {
  const now = new Date(2026, 8, 29, 14, 30)

  it('tr-TR tarih ayrıştırma: geçersiz günler reddedilir', () => {
    expect(parseTrDate('29.09.2026')?.getDate()).toBe(29)
    expect(parseTrDate('31.02.2026')).toBeNull()
    expect(parseTrDate('2026-09-29')).toBeNull()
    expect(parseTrDate('')).toBeNull()
  })

  it('varsayılan aralık backend ile aynı: son 30 gün', () => {
    expect(defaultRange(now)).toEqual({ from: '30.08.2026', to: '29.09.2026' })
  })

  it('400 istemcide önlenir: sıra, 366 gün sınırı, admin.* ve biçimsiz kimlik', () => {
    const base = emptyFilters(now)
    expect(validateFilters(base)).toEqual({})
    expect(validateFilters({ ...base, from: '30.09.2026', to: '29.09.2026' }).to).toBe('auditLog.validation.order')
    expect(validateFilters({ ...base, from: '29.09.2025', to: '29.09.2026' })).toEqual({}) // 366 gün (artık yıl değil) — sınırda
    expect(validateFilters({ ...base, from: '28.09.2025', to: '29.09.2026' }).to).toBe('auditLog.validation.span')
    expect(validateFilters({ ...base, eventKey: 'event:admin.write' }).eventKey).toBeDefined()
    expect(validateFilters({ ...base, eventKey: 'event:bad value' }).eventKey).toBeDefined()
    expect(validateFilters({ ...base, userId: 'x@y' }).userId).toBeDefined()
    expect(buildRequest({ ...base, from: '31.02.2026' }, 1, 25)).toBeNull()
  })

  it('istek gövdesi yalnız dolu alanları taşır; olay grubu → eventPrefix, tekil olay → event; limit ≤100', () => {
    const f: AuditFilters = { ...emptyFilters(now), eventKey: 'prefix:user.', userId: 'u-1', result: 'fail' }
    const req = buildRequest(f, 2, 500)!
    expect(req).toMatchObject({ page: 2, limit: 100, eventPrefix: 'user.', userId: 'u-1', result: 'fail' })
    expect(req.event).toBeUndefined()
    expect(new Date(req.to).getHours()).toBe(23)
    const req2 = buildRequest({ ...emptyFilters(now), eventKey: 'event:login' }, 1, 25)!
    expect(Object.keys(req2).sort()).toEqual(['event', 'from', 'limit', 'page', 'to'])
  })

  it('olay etiketleri: bilinen → Türkçe, bilinmeyen → ham ad; admin.* seçeneği YOK', () => {
    expect(eventLabel('login')).toBe('Oturum açıldı')
    expect(eventLabel('yeni.olay')).toBe('yeni.olay')
    expect(eventKeyLabel('prefix:stock.')).toBe('Stok politikası')
    expect(Object.keys(EVENT_LABELS).some((e) => e.startsWith('admin.'))).toBe(false)
    expect(eventOptions().some((o) => o.value.includes('admin.'))).toBe(false)
  })

  it('meta: yalnız ilkel alanlar, bilinen anahtar etiketlenir', () => {
    const rows = metaRows({ roleCode: 'MANAGER', alreadyPending: true, nested: { a: 1 } as any, n: 3 })
    expect(rows).toEqual([
      { key: 'roleCode', label: 'Rol', value: 'MANAGER' },
      { key: 'alreadyPending', label: 'Zaten bekliyordu', value: 'Evet' },
      { key: 'n', label: 'n', value: '3' },
    ])
    expect(metaRows(null)).toEqual([])
  })

  it('kullanıcı adı: ad+soyad, yoksa e-posta; biçimsiz kimlik elenir', () => {
    expect(toAuditUsers({ users: [
      { _id: 'u-1', name: 'Ayşe', surname: 'Demir' },
      { _id: 'u-2', email: 'kisi@ornek.invalid' },
      { _id: 'bad id', name: 'X' },
    ] })).toEqual([{ id: 'u-1', name: 'Ayşe Demir' }, { id: 'u-2', name: 'kisi@ornek.invalid' }])
    expect(toAuditUsers(undefined)).toEqual([])
  })
})
