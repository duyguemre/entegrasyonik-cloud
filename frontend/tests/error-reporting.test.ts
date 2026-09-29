// ADR-0017 Karar 1.8 — global hata sınırı birim testi.
// `app.config.errorHandler` / `unhandledrejection` / `window.onerror` / `router.onError`
// hepsi ortak `reportUnexpectedError`'ı çağırır (bkz. `src/composables/errorReporting.ts`);
// bu test o ortak fonksiyonu doğrudan sınar: (1) `logger.error` çağrılıyor mu (teknik log),
// (2) mevcut Snackbar deseniyle kullanıcıya nazik bir bildirim + Destek kodu gösteriliyor mu,
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
import { useSnackbarStore } from '../src/stores/snackbarStore'
import { reportUnexpectedError } from '../src/composables/errorReporting'

describe('reportUnexpectedError (ADR-0017 Karar 1.8)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(logger.error).mockClear()
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

  it('kullanıcıya mevcut Snackbar deseniyle nazik bir bildirim + Destek kodu gösterir', () => {
    const snackbarStore = useSnackbarStore()
    expect(snackbarStore.snackbars).toHaveLength(0)

    reportUnexpectedError('Yakalanmamış promise reddi', { module: 'errorHandler' })

    expect(snackbarStore.snackbars).toHaveLength(1)
    const snackbar = snackbarStore.snackbars[0]
    expect(snackbar.color).toBe('error')
    expect(snackbar.text).toContain('c-testcode')
    // Ham teknik ayrıntı (yığın/izleme) kullanıcı iletisine SIZMAZ.
    expect(snackbar.text).not.toMatch(/stack|Error:/i)
  })

  it('özel `userMessage`/`color` verilirse kullanıcı iletisi ona göre değişir (ör. router chunk hatası)', () => {
    const snackbarStore = useSnackbarStore()

    reportUnexpectedError('Router hata yakaladı', { module: 'router', isChunkError: true }, {
      userMessage: 'Uygulama güncellendi, sayfa yenileniyor…',
      color: 'info',
    })

    expect(snackbarStore.snackbars).toHaveLength(1)
    expect(snackbarStore.snackbars[0]).toMatchObject({
      text: 'Uygulama güncellendi, sayfa yenileniyor…',
      color: 'info',
    })
  })

  it('`silent: true` ile kullanıcı bildirimi bastırılır ama teknik log YİNE yazılır', () => {
    const snackbarStore = useSnackbarStore()

    reportUnexpectedError('Sessiz hata', { module: 'test' }, { silent: true })

    expect(snackbarStore.snackbars).toHaveLength(0)
    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  it('Pinia aktif değilse (çok erken bootstrap hatası) sessizce geçer, hata fırlatmaz', () => {
    // @ts-expect-error — kasıtlı olarak aktif pinia'yı kaldırıyoruz (bootstrap öncesi senaryo)
    setActivePinia(undefined)

    expect(() => reportUnexpectedError('Erken hata', { module: 'test' })).not.toThrow()
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
