import { describe, expect, it } from 'vitest'
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatDate,
  formatDateTime,
  formatRelative,
  formatDuration,
  formatPhone,
} from '../src/composables/format'

/** ADR-0015 Karar 6.3 — tek biçimlendirici birim testleri (tr-TR sabit, PLATFORM_BASELINE.md C5). */
describe('formatMoney', () => {
  it('varsayılan TRY para birimiyle "₺4.590,25" üretir', () => {
    expect(formatMoney(4590.25)).toBe('₺4.590,25')
  })

  it('0,00 için de sembol + iki ondalık gösterir', () => {
    expect(formatMoney(0)).toBe('₺0,00')
  })

  it('geçersiz/null/boş değer için "—" döner', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
    expect(formatMoney('')).toBe('—')
    expect(formatMoney('abc')).toBe('—')
  })

  it('farklı para birimi geçilebilir (currency parametresi)', () => {
    expect(formatMoney(10, 'USD')).toContain('10,00')
  })
})

describe('formatNumber', () => {
  it('binlik ayraç "." ile "12.345" üretir', () => {
    expect(formatNumber(12345)).toBe('12.345')
  })

  it('geçersiz değer için "—" döner', () => {
    expect(formatNumber(null)).toBe('—')
    expect(formatNumber('abc')).toBe('—')
  })
})

describe('formatPercent', () => {
  it('Türkçe yazımda yüzde işareti önde: "%5,0"', () => {
    expect(formatPercent(0.05)).toBe('%5,0')
  })

  it('geçersiz değer için "—" döner', () => {
    expect(formatPercent(null)).toBe('—')
  })
})

describe('formatDate', () => {
  it('"20.09.2026" biçiminde (dd.MM.yyyy) üretir', () => {
    expect(formatDate(new Date(2026, 8, 20))).toBe('20.09.2026')
  })

  it('ISO string girdisini de kabul eder', () => {
    expect(formatDate('2026-09-05T00:00:00.000Z')).toMatch(/^\d{2}\.\d{2}\.2026$/)
  })

  it('geçersiz tarih için "—" döner', () => {
    expect(formatDate('gecersiz-tarih')).toBe('—')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('')).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('"dd.MM.yyyy HH:mm" biçiminde üretir', () => {
    expect(formatDateTime(new Date(2026, 8, 20, 13, 15))).toBe('20.09.2026 13:15')
  })

  it('geçersiz değer için "—" döner', () => {
    expect(formatDateTime(undefined)).toBe('—')
  })
})

describe('formatRelative', () => {
  const now = new Date(2026, 8, 20, 13, 15, 0)

  it('<1 dk için "az önce"', () => {
    expect(formatRelative(new Date(now.getTime() - 10_000), now)).toBe('az önce')
  })

  it('dakika: "3 dk önce"', () => {
    expect(formatRelative(new Date(now.getTime() - 3 * 60_000), now)).toBe('3 dk önce')
  })

  it('saat: "2 sa önce"', () => {
    expect(formatRelative(new Date(now.getTime() - 2 * 3_600_000), now)).toBe('2 sa önce')
  })

  it('gün: "3 gün önce"', () => {
    expect(formatRelative(new Date(now.getTime() - 3 * 86_400_000), now)).toBe('3 gün önce')
  })

  it('geçersiz değer için "—" döner', () => {
    expect(formatRelative(null, now)).toBe('—')
  })
})

/** ADR-0020 Karar 4.2 — "Süreler insan biçiminde girilir ve gösterilir (‘30 sn’, ‘15 dk’)". */
describe('formatDuration', () => {
  it('unit="ms": tam bölünen büyük birime otomatik ölçeklenir', () => {
    expect(formatDuration(300000, 'ms')).toBe('5 dk')
    expect(formatDuration(900000, 'ms')).toBe('15 dk')
    expect(formatDuration(1000, 'ms')).toBe('1 sn')
    expect(formatDuration(3600000, 'ms')).toBe('1 sa')
    expect(formatDuration(86400000, 'ms')).toBe('1 gün')
  })

  it('unit="ms": tam bölünmeyen değer ham ms olarak kalır (yanıltıcı yuvarlama YOK)', () => {
    expect(formatDuration(1500, 'ms')).toBe('1.500 ms')
  })

  it('unit="s"/"min"/"h"/"day": kataloğun kendi biriminde, yalnızca son ek eklenir', () => {
    expect(formatDuration(15, 's')).toBe('15 sn')
    expect(formatDuration(1, 'min')).toBe('1 dk')
    expect(formatDuration(24, 'h')).toBe('24 sa')
    expect(formatDuration(14, 'day')).toBe('14 gün')
  })

  it('unit="perMin": "/dk" son eki', () => {
    expect(formatDuration(1800, 'perMin')).toBe('1.800/dk')
  })

  it('unit tanımsız/count: yalnızca formatNumber', () => {
    expect(formatDuration(30)).toBe('30')
    expect(formatDuration(30, 'count')).toBe('30')
  })

  it('geçersiz/null/boş değer için "—" döner', () => {
    expect(formatDuration(null, 'ms')).toBe('—')
    expect(formatDuration(undefined, 'min')).toBe('—')
    expect(formatDuration('abc', 's')).toBe('—')
  })
})

describe('formatPhone (DS-v2 Aşama 3)', () => {
  it('TR numarasını tek biçime getirir', () => {
    expect(formatPhone('5551112233')).toBe('+90 (555) 111 22 33')
    expect(formatPhone('05551112233')).toBe('+90 (555) 111 22 33')
    expect(formatPhone('+90 555 111 22 33')).toBe('+90 (555) 111 22 33')
    expect(formatPhone(5551112233)).toBe('+90 (555) 111 22 33')
  })
  it('biçimlenemeyen değer olduğu gibi, boş değer "—"', () => {
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958')
    expect(formatPhone('')).toBe('—')
    expect(formatPhone(null)).toBe('—')
  })
})
