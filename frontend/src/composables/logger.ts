/**
 * logger.ts — ADR-0017 Karar 1.8 (frontend log servisi, tek kaynak).
 *
 * Tüm uygulama kodu `console.*` YERİNE bu servisi kullanır (ESLint `no-console`
 * kuralı + mandal, bkz. `eslint.config.mjs`). Üretim derlemesinde (`import.meta.env.PROD`)
 * `debug`/`info`/`warn` konsola YAZMAZ; yalnızca `error` seviyesi geliştirici deneyimi
 * için konsola da düşer (ADR-0017 Karar 1.8). Bu dosya `no-console` kuralının TEK
 * meşru kaçış noktasıdır (aşağıdaki `console.*` çağrıları kasıtlıdır).
 *
 * Gerçek sunucu raporlama: `POST /api/client-log` (backend ucu `backend/src/api/clientLog.ts`,
 * ADR-0017 §Karar 8 Aşama B — artık VAR). `reportToServer` yalnızca `error`/`warn` seviyelerini
 * `clientLogTransport.ts`'e devreder (debug/info YEREL kalır, ADR'nin kararı — gereksiz trafik
 * olmasın). Gönderim fire-and-forget'tir: auth yoksa / ağ hatası olursa SESSİZCE yutulur, retry
 * YOK (bkz. `clientLogTransport.ts` dosya başlığı).
 */
import { sendClientLog } from '@/composables/clientLogTransport'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  [key: string]: unknown
}

const isProd = Boolean((import.meta as any)?.env?.PROD)

/**
 * ADR-0017 Karar 1.6/1.8 — backend correlation kimliği (`X-Request-Id`) ile
 * KARIŞMASIN diye istemci tarafı hatalarına ayrı, kısa bir "Destek kodu" üretir.
 * Biçim: `c-<8 hex>` (backend `X-Request-Id` UUID biçiminden görsel olarak ayrışır).
 */
export function generateSupportCode(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `c-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`
    }
  } catch {
    // yut — aşağıdaki fallback'e düş
  }
  return `c-${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}`
}

function shouldEmitToConsole(level: LogLevel): boolean {
  if (!isProd) return true
  // Üretimde yalnızca `error` konsola düşer (ADR-0017 Karar 1.8).
  return level === 'error'
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldEmitToConsole(level)) return
  const args: unknown[] = context ? [message, context] : [message]
  switch (level) {
    case 'debug':
      // eslint-disable-next-line no-console -- tek meşru çıkış noktası (bkz. dosya başlığı)
      console.debug(...args)
      break
    case 'info':
      // eslint-disable-next-line no-console -- tek meşru çıkış noktası (bkz. dosya başlığı)
      console.info(...args)
      break
    case 'warn':
      // eslint-disable-next-line no-console -- tek meşru çıkış noktası (bkz. dosya başlığı)
      console.warn(...args)
      break
    case 'error':
      // eslint-disable-next-line no-console -- tek meşru çıkış noktası (bkz. dosya başlığı)
      console.error(...args)
      break
  }
}

// ADR-0017 Karar 1.8: yalnızca `error`/`warn` sunucuya gider (debug/info asla — gereksiz
// trafik olmasın). Gerçek ağ çağrısı `clientLogTransport.ts`'e devredilir (bu dosyanın
// `logger.ts`'i import ETMEMESİ için ayrı modül — döngüsel bağımlılık YOK, dosya başlığına bkz.).
function reportToServer(level: LogLevel, message: string, context?: LogContext): void {
  if (level !== 'error' && level !== 'warn') return
  sendClientLog(level, message, context)
}

const logger = {
  debug(message: string, context?: LogContext): void {
    emit('debug', message, context)
  },
  info(message: string, context?: LogContext): void {
    emit('info', message, context)
  },
  warn(message: string, context?: LogContext): void {
    emit('warn', message, context)
    reportToServer('warn', message, context)
  },
  error(message: string, context?: LogContext): void {
    emit('error', message, context)
    reportToServer('error', message, context)
  },
}

export default logger

export function useLogger() {
  return logger
}
