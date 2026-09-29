import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from '../src/composables/useToast'

/** ADR-0015 Karar 6.1 — useToast birim testleri: <=3 eşzamanlı toast, hata kapanmaz, diğerleri 4sn sonra kapanır. */
describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    const { toasts, dismissToast } = useToast()
    // Paylaşılan (modül-düzeyi) durumu testler arasında temizle.
    for (const t of [...toasts]) dismissToast(t.id)
    vi.useRealTimers()
  })

  it('showToast bir toast ekler', () => {
    const { toasts, showToast } = useToast()
    showToast({ tone: 'success', message: 'Kaydedildi.' })
    expect(toasts).toHaveLength(1)
    expect(toasts[0].tone).toBe('success')
  })

  it('aynı anda en fazla 3 toast görünür — en eski otomatik düşer', () => {
    const { toasts, showToast } = useToast()
    showToast({ tone: 'info', message: '1' })
    showToast({ tone: 'info', message: '2' })
    showToast({ tone: 'info', message: '3' })
    showToast({ tone: 'info', message: '4' })
    expect(toasts).toHaveLength(3)
    expect(toasts.map((t) => t.message)).toEqual(['2', '3', '4'])
  })

  it('error tonundaki toast 4sn sonra OTOMATİK kapanmaz', () => {
    const { toasts, showToast } = useToast()
    showToast({ tone: 'error', message: 'Hata oluştu.' })
    vi.advanceTimersByTime(10_000)
    expect(toasts).toHaveLength(1)
  })

  it('success/info/warning tonundaki toast 4sn sonra otomatik kapanır', () => {
    const { toasts, showToast } = useToast()
    showToast({ tone: 'success', message: 'Kaydedildi.' })
    expect(toasts).toHaveLength(1)
    vi.advanceTimersByTime(4001)
    expect(toasts).toHaveLength(0)
  })

  it('dismissToast belirli bir toast\'u elle kapatır', () => {
    const { toasts, showToast, dismissToast } = useToast()
    const id = showToast({ tone: 'warning', message: 'Uyarı.' })
    dismissToast(id)
    expect(toasts).toHaveLength(0)
  })
})
