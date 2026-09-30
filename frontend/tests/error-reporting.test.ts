// ADR-0017 Karar 1.8 — global hata sınırı birim testi.
// `app.config.errorHandler` / `unhandledrejection` / `window.onerror` / `router.onError`
// hepsi ortak `reportUnexpectedError`'ı çağırır (bkz. `src/composables/errorReporting.ts`);
// bu test o ortak fonksiyonu doğrudan sınar: (1) `logger.error` çağrılıyor mu (teknik log),
// (2) tek toast deseniyle (Aşama 6b) kullanıcıya nazik bir bildirim + Destek kodu gösteriliyor mu,
// (3) `silent` seçeneğinde bildirim bastırılıyor ama log YİNE yazılıyor mu.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../src/composables/logger', () => {
  const error = vi.fn()
  return {
    default: { error, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
    generateSupportCode: () => 'c-testcode',
  }
})

import logger from '../src/composables/logger'
import { useToast } from '../src/composables/useToast'
import { reportUnexpectedError } from '../src/composables/errorReporting'

describe('reportUnexpectedError (ADR-0017 Karar 1.8)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(logger.error).mockClear()
    const { toasts, dismissToast } = useToast()
    for (const t of [...toasts]) dismissToast(t.id)
  })

  it('teknik ayrıntıyı logger.error ile yazar (context + üretilen Destek kodu)', () => {
    const supportCode = reportUnexpectedError('Vue hata sınırı yakaladı', {
      module: 'errorHandler',
      message: 'boom',
    })

    expect(supportCode).toBe('c-testcode')
    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith(
      'Vue hata sınırı yakaladı',
      expect.objectContaining({ module: 'errorHandler', message: 'boom', supportCode: 'c-testcode' })
    )
  })

  // Aşama 6b (Standart 1): eski snackbar görünümü kaldırıldı; `snackbarStore.addSnackbar` tek toast kaynağına
  // (`useToast`) yönlenir — iddialar aynı (ton, Destek kodu, ham ayrıntı sızmaz), yalnız okunan durum değişti.
  it('kullanıcıya tek toast deseniyle nazik bir bildirim + Destek kodu gösterir', () => {
    const { toasts } = useToast()
    expect(toasts).toHaveLength(0)

    reportUnexpectedError('Yakalanmamış promise reddi', { module: 'errorHandler' })

    expect(toasts).toHaveLength(1)
    const toast = toasts[0]
    expect(toast.tone).toBe('error')
    expect(toast.message).toContain('c-testcode')
    // Ham teknik ayrıntı (yığın/izleme) kullanıcı iletisine SIZMAZ.
    expect(toast.message).not.toMatch(/stack|Error:/i)
  })

  it('özel `userMessage`/`color` verilirse kullanıcı iletisi ona göre değişir (ör. router chunk hatası)', () => {
    const { toasts } = useToast()

    reportUnexpectedError('Router hata yakaladı', { module: 'router', isChunkError: true }, {
      userMessage: 'Uygulama güncellendi, sayfa yenileniyor…',
      color: 'info',
    })

    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ message: 'Uygulama güncellendi, sayfa yenileniyor…', tone: 'info' })
  })

  it('`silent: true` ile kullanıcı bildirimi bastırılır ama teknik log YİNE yazılır', () => {
    const { toasts } = useToast()

    reportUnexpectedError('Sessiz hata', { module: 'test' }, { silent: true })

    expect(toasts).toHaveLength(0)
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it('Pinia aktif değilse (çok erken bootstrap hatası) sessizce geçer, hata fırlatmaz', () => {
    // @ts-expect-error — kasıtlı olarak aktif pinia'yı kaldırıyoruz (bootstrap öncesi senaryo)
    setActivePinia(undefined)

    expect(() => reportUnexpectedError('Erken hata', { module: 'test' })).not.toThrow()
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
