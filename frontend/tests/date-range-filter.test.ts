// FR3 madde 10 (fe-r3a) — tarih sütunu olan listelerde TUTARLI tarih aralığı filtresi (EkDateRange).
// Saf mantık (hazır aralıklar, çip metni) + sözleşme: backend'i tarih aralığı kabul eden listeler EkDateRange kullanır;
// liste ekranında ayrı ayrı "Başlangıç/Bitiş" EkDateField çifti açılmaz.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dateRangePresets, formatDateRange, matchPreset, normalizeDay, toIsoDay } from '../packages/ui/src/components/dateRange'

const FE = join(__dirname, '..')
const read = (p: string) => readFileSync(join(FE, p), 'utf8')

describe('dateRange — hazır aralıklar (yerel takvim günü, bitiş dahil)', () => {
  const today = new Date(2026, 9, 1, 15, 30) // 1 Ekim 2026, öğleden sonra

  it('Bugün / Son 7 / Son 30 / Bu ay / Geçen ay', () => {
    const map = Object.fromEntries(dateRangePresets(today).map((p) => [p.key, [p.start, p.end]]))
    expect(map.today).toEqual(['2026-10-01', '2026-10-01'])
    expect(map.last7).toEqual(['2026-09-25', '2026-10-01'])
    expect(map.last30).toEqual(['2026-09-02', '2026-10-01'])
    expect(map.thisMonth).toEqual(['2026-10-01', '2026-10-01'])
    expect(map.lastMonth).toEqual(['2026-09-01', '2026-09-30'])
  })

  it('ay/yıl sınırı: Ocak başında geçen ay = önceki yılın Aralık ayı; artık yıl Şubatı', () => {
    const jan = Object.fromEntries(dateRangePresets(new Date(2027, 0, 3)).map((p) => [p.key, [p.start, p.end]]))
    expect(jan.lastMonth).toEqual(['2026-12-01', '2026-12-31'])
    const mar = Object.fromEntries(dateRangePresets(new Date(2028, 2, 10)).map((p) => [p.key, [p.start, p.end]]))
    expect(mar.lastMonth).toEqual(['2028-02-01', '2028-02-29'])
  })

  it('seçili aralık hazır aralıkla eşleşir; gün UTC kaymasız', () => {
    expect(matchPreset('2026-09-25', '2026-10-01', today)).toBe('last7')
    expect(matchPreset('2026-09-24', '2026-10-01', today)).toBeUndefined()
    expect(toIsoDay(new Date(2026, 9, 1, 0, 5))).toBe('2026-10-01')
    expect(normalizeDay(new Date(2026, 9, 1, 23, 59))).toBe('2026-10-01')
    expect(normalizeDay('2026-10-01T21:00:00.000Z')).toBe('2026-10-01')
    expect(normalizeDay(undefined)).toBeUndefined()
  })

  it('etkin filtre çipi metni', () => {
    expect(formatDateRange('2026-09-01', '2026-09-30')).toBe('01.09.2026 – 30.09.2026')
    expect(formatDateRange('2026-09-01', '2026-09-01')).toBe('01.09.2026')
    expect(formatDateRange('2026-09-01', null)).toBe('01.09.2026 sonrası')
    expect(formatDateRange(undefined, '2026-09-30')).toBe('30.09.2026 öncesi')
    expect(formatDateRange(null, null)).toBe('')
  })
})

describe('EkDateRange — sözleşme', () => {
  const src = read('packages/ui/src/components/EkDateRange.vue')

  it('iki EkDateField birbirini sınırlar, ızgarada iki kolon, hazır aralık menüsü erişilebilir adlı', () => {
    expect(src).toMatch(/:max="end \|\| undefined"/)
    expect(src).toMatch(/:min="start \|\| undefined"/)
    expect(src).toMatch(/class="ek-date-range ek-span-2"/)
    expect(src).toMatch(/:aria-label="`\$\{label\}: hazır aralıklar`"/)
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })

  it('backend tarih aralığı kabul eden listeler EkDateRange kullanır (Sipariş, İade, Fatura, Mesaj, Finans, Gönderim kayıtları, Destek)', () => {
    const screens = [
      'src/views/secure/OrderListView.vue',
      'src/views/secure/ClaimListView.vue',
      'src/views/secure/InvoiceListView.vue',
      'src/views/secure/MessageListView.vue',
      'src/views/secure/FinancialListView.vue',
      'src/components/logListView/ExportLogList.vue',
      'src/views/secure/supports/TicketListView.vue',
    ]
    for (const s of screens) expect(read(s), s).toMatch(/<EkDateRange v-model:start="[^"]+" v-model:end="[^"]+"/)
  })

  it('liste ekranlarında ayrı Başlangıç/Bitiş EkDateField çifti yok (tek bileşen)', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (p.endsWith('.vue')) out.push(p)
      }
      return out
    }
    const offenders = walk(join(FE, 'src'))
      .filter((f) => !f.includes(`${sep}dev${sep}`))
      .filter((f) => /<EkDateField[^>]*v-model="[^"]*startDate"[\s\S]*?<EkDateField[^>]*v-model="[^"]*endDate"/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(FE, f))
    expect(offenders).toEqual([])
  })
})
