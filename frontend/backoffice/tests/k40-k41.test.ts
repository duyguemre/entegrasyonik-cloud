// K40 (hata ayrıntısından eylem metni) ve K41 (destek oturumu 30 dk, geri sayım bitiş anından) önyüz birimleri.
import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { AdminApiError } from '../src/api/client'
import { IMPERSONATION_SESSION_MINUTES } from '../src/api/contract'
import { formatCountdown, toMs, useCountdown } from '../src/composables/useCountdown'
import { describeError } from '../src/utils/errors'

describe('K40 TRIAL_EXTENSION_LIMIT iletisi', () => {
  it('details.remainingDays eyleme yansır; hak dolduysa ücretli plan önerilir; details yoksa genel sınır metni', () => {
    const mk = (details?: Record<string, unknown>) => new AdminApiError(409, { error: 'Toplam deneme uzatma sınırı 60 gün; kalan 15 gün.', code: 'TRIAL_EXTENSION_LIMIT', details })
    const d = describeError(mk({ remainingDays: 15, usedDays: 45, maxTotalDays: 60 }))
    expect(d.kind).toBe('conflict')
    expect(d.action).toBe('En fazla 15 gün daha uzatabilirsiniz; gün sayısını düşürün.')
    expect(d.details).toEqual({ remainingDays: 15, usedDays: 45, maxTotalDays: 60 })
    expect(describeError(mk({ remainingDays: 0, maxTotalDays: 60 })).action).toMatch(/60 günlük uzatma hakkı doldu/)
    expect(describeError(mk()).action).toMatch(/60 günü aşamaz/)
  })
  it('details dizi/ilkel gelirse yok sayılır', () => {
    const e = new AdminApiError(409, { error: 'x', code: 'CONFLICT', details: 'metin' as unknown as Record<string, unknown> })
    expect(e.details).toBeUndefined()
  })
})

describe('K41 geri sayım', () => {
  it('sabit 30 dk', () => expect(IMPERSONATION_SESSION_MINUTES).toBe(30))
  it('formatCountdown: mm:ss, saat, negatif → 00:00, yukarı yuvarlama', () => {
    expect(formatCountdown(30 * 60_000)).toBe('30:00')
    expect(formatCountdown(61_001)).toBe('01:02')
    expect(formatCountdown(3_600_000 + 5_000)).toBe('1:00:05')
    expect(formatCountdown(-5)).toBe('00:00')
  })
  it('toMs: ISO, ms, geçersiz', () => {
    expect(toMs('2026-10-01T10:00:00.000Z')).toBe(Date.parse('2026-10-01T10:00:00.000Z'))
    expect(toMs(5)).toBe(5)
    expect(toMs('bozuk')).toBeNull()
    expect(toMs(null)).toBeNull()
  })
  it('useCountdown bitiş anından sayar; istemci süre eklemez; bitiş değişince yeniden kurulur', async () => {
    let now = 1_000_000
    const end = ref<string | number | null>(now + 18 * 60_000)
    const c = useCountdown(end, () => now)
    expect(c.text.value).toBe('18:00')
    expect(c.active.value).toBe(true)
    now += 18 * 60_000
    end.value = now - 1
    await nextTick()
    expect(c.active.value).toBe(false)
    expect(c.text.value).toBe('00:00')
    c.stop()
  })
})
