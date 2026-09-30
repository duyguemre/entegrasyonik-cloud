/**
 * errorReporting.ts — ADR-0017 Karar 1.8 (global hata sınırı, ortak işleyici).
 *
 * Vue `app.config.errorHandler`, `window.addEventListener('unhandledrejection'|'error')` ve
 * `router.onError` AYNI ortak fonksiyonu çağırır: teknik ayrıntı (yığın, bileşen, rota) yalnızca
 * `logger`'a yazılır; kullanıcıya yalnızca nazik bir ileti + kısa bir "Destek kodu" gösterilir
 * (mevcut Snackbar deseni — `stores/snackbarStore.ts` — YENİ bileşen icat edilmedi).
 *
 * "Kullanıcı iletisi ≠ teknik log" ayrımı ve Destek kodu biçimi (`c-<8 hex>`, backend
 * `X-Request-Id`'den KASITLI ayrışır) ADR-0017 Karar 1.6/1.8'e aittir.
 */
import logger, { generateSupportCode, type LogContext } from '@/composables/logger'
import { useSnackbarStore } from '@/stores/snackbarStore'

export interface UnexpectedErrorOptions {
  /** Kullanıcıya gösterilecek metin. Verilmezse varsayılan "Bir şeyler ters gitti…" + Destek kodu kullanılır. */
  userMessage?: string
  /** Snackbar rengi (varsayılan 'error'). */
  color?: string
  /** Kullanıcı bildirimi bastırılsın mı (ör. sayfa zaten yeniden yükleniyorsa gürültü olmasın diye). */
  silent?: boolean
}

/**
 * Ortak "beklenmeyen hata" işleyicisi. Destek kodunu üretir, `logger.error`'a yazar, mevcut
 * Snackbar deseniyle kullanıcıya nazik bir bildirim gösterir (Pinia henüz hazır değilse — ör.
 * çok erken bootstrap hatası — sessizce geçilir, hata yine de loglanmış olur) ve üretilen Destek
 * kodunu döner (çağıran, kendi logunda/testinde kullanabilir).
 */
export function reportUnexpectedError(
  logMessage: string,
  context: LogContext,
  options: UnexpectedErrorOptions = {}
): string {
  const supportCode = generateSupportCode()
  logger.error(logMessage, { ...context, supportCode })

  if (!options.silent) {
    try {
      const snackbarStore = useSnackbarStore()
      snackbarStore.addSnackbar({
        text: options.userMessage ?? `Bir şeyler ters gitti. Destek kodu: ${supportCode}`,
        color: options.color ?? 'error',
        timeout: 6000,
      })
    } catch {
      // Pinia/snackbar store henüz hazır değilse (ör. çok erken bootstrap hatası) sessizce geç —
      // hata zaten logger'a yazıldı, kullanıcı bildirimi burada "en iyi çaba" niteliğindedir.
    }
  }

  return supportCode
}

/**
 * Aşama 6b: tarayıcının zararsız bildirimleri (hata değil). "ResizeObserver loop completed with undelivered notifications"
 * / "ResizeObserver loop limit exceeded": bir karede tamamlanamayan boyut gözlemi bir sonraki karede teslim edilir;
 * kullanıcıya hata toast'ı olarak gösterilmez.
 */
export function isBenignBrowserNotice(message: unknown): boolean {
  return typeof message === 'string' && /^ResizeObserver loop (completed with undelivered notifications|limit exceeded)/.test(message)
}
