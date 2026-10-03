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
 * P16 (PROPOSALS_PENDING, K49 onayı): aynı kök hatadan doğan ardışık beklenmeyen hatalar (ör. menü isteği 500 →
 * router + promise reddi + bileşen hatası) kısa bir pencerede TEK bildirimde toplanır ve TEK Destek kodu taşır.
 * Yalnız varsayılan ileti toplanır; çağıranın kendi iletisi (`userMessage`) her zaman gösterilir.
 */
export const UNEXPECTED_ERROR_COALESCE_MS = 4000
let lastNotice: { code: string; at: number } | null = null

/** Testler için: toplama penceresini sıfırlar. */
export function resetUnexpectedErrorCoalescing(): void {
  lastNotice = null
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
  const now = Date.now()
  const coalesce =
    !options.userMessage && !options.silent && lastNotice !== null && now - lastNotice.at < UNEXPECTED_ERROR_COALESCE_MS
  const supportCode = coalesce && lastNotice ? lastNotice.code : generateSupportCode()
  logger.error(logMessage, { ...context, supportCode, ...(coalesce ? { coalesced: true } : {}) })

  if (coalesce && lastNotice) {
    // Aynı pencerede ikinci/üçüncü hata: bildirim zaten ekranda; pencere son hatadan itibaren uzar.
    lastNotice.at = now
    return supportCode
  }
  if (!options.silent && !options.userMessage) lastNotice = { code: supportCode, at: now }

  if (!options.silent) {
    try {
      const snackbarStore = useSnackbarStore()
      // FE-LOCAL-1050: genel hata bildirimi üç parça — başlık, ne yapılacağı, kopyalanabilir destek kodu.
      snackbarStore.addSnackbar(
        options.userMessage
          ? { text: options.userMessage, color: options.color ?? 'error', timeout: 6000 }
          : {
              title: 'Bir şeyler ters gitti',
              text: 'İşlem tamamlanamadı. Yeniden deneyin; sorun sürerse destek kodunu bize iletin.',
              code: supportCode,
              color: options.color ?? 'error',
              timeout: 6000,
            },
      )
    } catch {
      // Pinia/snackbar store henüz hazır değilse (ör. çok erken bootstrap hatası) sessizce geç —
      // hata zaten logger'a yazıldı, kullanıcı bildirimi burada "en iyi çaba" niteliğindedir.
    }
  }

  return supportCode
}
