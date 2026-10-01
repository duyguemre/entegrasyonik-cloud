import { describe, expect, it, vi } from 'vitest'
import type { AuditRecord, IssueGroup } from '@bo/api/contract'
import { logCenterVerdict, RISING_FACTOR } from '@bo/views/logCenterVerdict'
import { auditVerdict, VOLUME_MIN } from '@bo/views/auditVerdict'

const NOW = Date.parse('2026-10-01T12:00:00Z')
const H = 3_600_000
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString()

const group = (o: Partial<IssueGroup> & { fp: string }): IssueGroup => ({
  title: `Sorun ${o.fp}`,
  level: 'error',
  src: 'worker',
  category: 'order',
  status: 'open',
  count: 5,
  tenantCount: 2,
  firstSeen: iso(200),
  lastSeen: iso(1),
  isNew: false,
  daily: { '20260930': 5, '20261001': 5 },
  ...o,
})

const base = () => ({ issues: [] as IssueGroup[], failed: false, tid: null, now: NOW, retry: vi.fn() })

describe('log merkezi hükmü', () => {
  it('sakin: açık kritik/hata yok', () => {
    const v = logCenterVerdict({ ...base(), issues: [group({ fp: 'w', level: 'warn' })] })
    expect(v.tone).toBe('success')
    expect(v.summary).toContain('Açık kritik ya da hata grubu yok')
    expect(v.attention).toEqual([])
  })

  it('kırmızı: açık kritik grup; madde grubu çekmecede açar, süzgeç level=fatal', () => {
    const b = base()
    const g = group({ fp: 'f1', level: 'fatal', count: 40 })
    const v = logCenterVerdict({ ...b, issues: [g, group({ fp: 'e1' })] })
    expect(v.tone).toBe('error')
    expect(v.attention[0].id).toBe('fatal-open')
    expect(v.attention[0].to).toEqual({ query: { level: 'fatal', fp: 'f1', sekme: 'sorunlar' } })
    expect(v.attention[0].impact).toBeTruthy()
    expect(v.attention[0].advice).toBeTruthy()
    expect(v.attention[0].onSelect).toBeUndefined()
    expect(v.actions[0].id).toBe('triage')
    expect(v.actions.some((a) => a.guarded || a.danger)).toBe(false)
  })

  it('üstlenilmiş kritik grup sarıdır', () => {
    const v = logCenterVerdict({ ...base(), issues: [group({ fp: 'f', level: 'fatal', status: 'acknowledged' })] })
    expect(v.tone).toBe('warning')
    expect(v.attention[0].id).toBe('fatal-owned')
  })

  it('sarı: son 24 saatte yeni hata grubu ve yükselen grup', () => {
    const b = base()
    const fresh = group({ fp: 'n', firstSeen: iso(5), isNew: true })
    const rising = group({ fp: 'r', daily: { '20260930': 10, '20261001': 10 * RISING_FACTOR + 5 } })
    const v = logCenterVerdict({ ...b, issues: [fresh, rising, group({ fp: 'steady' })] })
    expect(v.tone).toBe('warning')
    expect(v.attention.map((a) => a.id)).toEqual(['new-24h', 'rising', 'top-category'])
    expect(v.attention[1].to).toEqual({ query: { level: 'error,fatal', fp: 'r', sekme: 'sorunlar' } })
  })

  it('en çok etkilenen kategori olay toplamına göre; kategori süzgecine bağlı', () => {
    const b = base()
    const v = logCenterVerdict({ ...b, issues: [group({ fp: 'a', category: 'order', count: 3 }), group({ fp: 'b', category: 'billing', count: 30 })] })
    const info = v.attention.find((a) => a.id === 'top-category')!
    expect(info.tone).toBe('info')
    expect(info.title).toContain('Faturalama')
    expect(info.to).toEqual({ query: { level: 'error,fatal', category: 'billing', sirala: 'count', sekme: 'sorunlar' } })
  })

  it('eylemler: ilgili ekrana geç bağlantısı kategoriye göre', () => {
    const v = logCenterVerdict({ ...base(), issues: [group({ fp: 'a', category: 'platform' })] })
    expect(v.actions.find((a) => a.id === 'screen')?.to).toBe('/altyapi')
  })

  it('tid kapsamı: özet "Müşteri #N için" der; sorun grupları da müşteri kapsamlı ve yaklaşık', () => {
    const v = logCenterVerdict({ ...base(), tid: { tid: 105, errors: 4, warns: 1 } })
    expect(v.summary.startsWith('Müşteri #105 için')).toBe(true)
    expect(v.summary).toContain('Müşterinin sorun gruplarında (yaklaşık)')
    expect(v.note).toContain('başka müşterinin grubu da görünebilir')
    expect(v.attention[0].impact).toContain('yaklaşık')
    expect(v.attention[0].id).toBe('tenant-errors')
    expect(v.attention[0].to).toEqual({ query: { tid: '105', level: 'error,fatal', sekme: 'akis' } })
    expect(v.actions.find((a) => a.id === 'tenant')?.to).toBe('/musteriler/105')
  })

  it('okunamadı: sağlıklı denmez', () => {
    const b = base()
    const v = logCenterVerdict({ ...b, issues: null, failed: true })
    expect(v.tone).toBe('warning')
    expect(v.summary).toContain('okunamadı')
    v.attention[0].onSelect!()
    expect(b.retry).toHaveBeenCalled()
  })

  it('sakin durumda denetlenenler listelenir; her madde bağlantılı', () => {
    expect(logCenterVerdict(base()).checks?.length).toBeGreaterThan(0)
    const v = logCenterVerdict({ ...base(), issues: [group({ fp: 'f', level: 'fatal' }), group({ fp: 'n', firstSeen: iso(3) })] })
    expect(v.attention.every((a) => !!a.to)).toBe(true)
  })
})

const rec = (o: Partial<AuditRecord> & { id: string }): AuditRecord => ({ at: iso(2), event: 'backoffice.write', result: 'ok', ...o })
const abase = () => ({ records: [] as AuditRecord[], failed: false, now: NOW, retry: vi.fn() })

describe('denetim hükmü', () => {
  it('sakin: bilgi tonu, sayılar özette', () => {
    const v = auditVerdict({
      ...abase(),
      records: [rec({ id: '1' }), rec({ id: '2', event: 'backoffice.sensitive_read' }), rec({ id: '3', event: 'impersonation.start' })],
    })
    expect(v.tone).toBe('info')
    expect(v.summary).toContain('1 yönetim yazması, 1 hassas okuma, 1 destek oturumu')
    expect(v.actions.map((a) => a.id)).toEqual(['writes', 'sessions', 'reads'])
    expect(v.actions.every((a) => !a.guarded)).toBe(true)
  })

  it('boş gün', () => {
    expect(auditVerdict(abase()).summary).toBe('Son 24 saatte denetim kaydı yok.')
  })

  it('sarı: reddedilen işlem; bağlantı result=fail & 24 saat; başarısız giriş anılır', () => {
    const b = abase()
    const v = auditVerdict({ ...b, records: [rec({ id: '1', event: 'login', result: 'fail' }), rec({ id: '2', result: 'fail' })] })
    expect(v.tone).toBe('warning')
    expect(v.attention[0].id).toBe('denied')
    expect(v.attention[0].impact).toContain('giriş')
    expect(v.attention[0].to).toEqual({ query: { result: 'fail', range: '24h' } })
    expect(v.attention[0].impact && v.attention[0].advice).toBeTruthy()
    expect(v.actions[0].id).toBe('denied')
    expect(v.checks?.length).toBeGreaterThan(0)
  })

  it('sarı: hatalı işlem', () => {
    const v = auditVerdict({ ...abase(), records: [rec({ id: '1', result: 'error' })] })
    expect(v.attention[0].id).toBe('errored')
  })

  it('sarı: alışılmadık hacim (taban 6 günün ortalaması)', () => {
    const today = Array.from({ length: VOLUME_MIN }, (_, i) => rec({ id: `t${i}` }))
    const prev = Array.from({ length: 6 }, (_, i) => rec({ id: `p${i}`, at: iso(30 + i * 4) }))
    const v = auditVerdict({ ...abase(), records: [...today, ...prev] })
    expect(v.attention.map((a) => a.id)).toContain('volume')
    const few = auditVerdict({ ...abase(), records: today.slice(0, 5) })
    expect(few.attention.map((a) => a.id)).not.toContain('volume')
  })

  it('kesilmiş liste "en az" der; okunamadı sağlıklı demez', () => {
    expect(auditVerdict({ ...abase(), records: [rec({ id: '1' })], truncated: true }).summary).toContain('en az 1 yönetim')
    const b = abase()
    const v = auditVerdict({ ...b, records: null, failed: true })
    expect(v.tone).toBe('warning')
    expect(v.summary).toContain('okunamadı')
  })
})
