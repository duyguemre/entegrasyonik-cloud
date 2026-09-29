/**
 * clientLogTransport.ts — ADR-0017 Karar 1.8 (`POST /api/client-log` gerçek nakliyesi).
 *
 * `logger.ts`'in `reportToServer()`'ı bu modülü çağırır. Backend sözleşmesi
 * (`backend/src/api/clientLog.ts`): alan beyaz listesi
 * `{level, msg, errName?, stack?(≤30 satır), route?, reqId?, appVer?, platform?, ts?, context?}`,
 * yanıt `204`/`400`/`401`/`413`, **AUTH GEREKLİ** (kimliksiz sayfalar zaten 401 alır — bu modül
 * o durumu sessizce yutar, döngüye/yeniden denemeye girmez).
 *
 * BİLİNÇLİ TASARIM — döngüsel bağımlılık YOK: `restapi.ts` zaten `logger`'ı hata loglaması için
 * kullanıyor (`restapi.ts` → `logger.ts`); bu modül `restapi.ts`'i (veya paylaşılan axios
 * örneğini) KULLANMAZ, kendi minimal `fetch` çağrısını yapar. `logger.ts` → `clientLogTransport.ts`
 * TEK YÖNLÜDÜR; bu dosya `logger.ts`'i asla import ETMEZ (aksi halde hata gönderiminin kendisi
 * hata loglayıp sonsuz döngü üretebilirdi).
 */
import { apiBaseUrl } from '@/config/env'
import type { LogContext, LogLevel } from '@/composables/logger'

export type ClientLogLevel = Extract<LogLevel, 'error' | 'warn'>

const CLIENT_LOG_URL = `${apiBaseUrl}client-log`
const MAX_BODY_BYTES = 7 * 1024 // backend sınırı 8 KB — güvenlik payı bırakılır
const MAX_STACK_LINES = 30
const MAX_STACK_CHARS = 4000
const MAX_MSG_CHARS = 500
const MAX_CONTEXT_KEYS = 20
const MAX_CONTEXT_VALUE_CHARS = 300
const DEDUP_WINDOW_MS = 60_000

// İstemcide redaksiyon (ADR-0017 Karar 1.8: "istemcide redaksiyon ... + sunucuda ikinci
// redaksiyon") — backend zaten ikinci savunma hattını uyguluyor (`redactFreeText`), bu yalnızca
// ilk hattır; desenler kasıtlı olarak basit/kaba tutulur (yanlış negatif > yanlış pozitif riski
// backend'in ikinci hattıyla telafi edilir).
const REDACT_PATTERNS: Array<[RegExp, string | ((m: string) => string)]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, '[REDACTED_EMAIL]'],
  [/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]'],
  [/[?&](token|password|secret|apiKey|key)=[^&\s]+/gi, (m: string) => m.slice(0, m.indexOf('=') + 1) + '[REDACTED]'],
]

const FORBIDDEN_CONTEXT_KEY = /password|token|secret|apikey|authorization|cookie|dbconfig/i

function redactText(input: string): string {
  let out = input
  for (const [pattern, replacement] of REDACT_PATTERNS) {
    out = typeof replacement === 'function' ? out.replace(pattern, replacement) : out.replace(pattern, replacement)
  }
  return out
}

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value
}

function clampStack(stack: string | undefined): string | undefined {
  if (typeof stack !== 'string' || !stack) return undefined
  const lines = stack.split('\n').slice(0, MAX_STACK_LINES)
  return clamp(redactText(lines.join('\n')), MAX_STACK_CHARS)
}

/** Beyaz liste DIŞI serbest `context`: yalnızca ilkel değerler, sır anahtarları ATILIR, boyut sınırlanır. */
function sanitizeContext(context: LogContext | undefined): Record<string, unknown> | undefined {
  if (!context) return undefined
  const out: Record<string, unknown> = {}
  let count = 0
  for (const [key, value] of Object.entries(context)) {
    if (count >= MAX_CONTEXT_KEYS) break
    if (key === 'stack' || key === 'errName') continue // ayrı alanlara taşındı, tekrar gönderilmez
    if (FORBIDDEN_CONTEXT_KEY.test(key)) continue
    if (value === undefined) continue
    if (typeof value === 'string') {
      out[key] = redactText(clamp(value, MAX_CONTEXT_VALUE_CHARS))
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[key] = value
    } else {
      // Nesne/dizi/Error: PII riski taşıyabilecek derin veri sunucuya GÖNDERİLMEZ, yalnızca türü.
      out[key] = value instanceof Error ? '[Error]' : Array.isArray(value) ? '[array]' : '[object]'
    }
    count++
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function extractStack(context: LogContext | undefined): string | undefined {
  const raw = context?.stack
  if (typeof raw === 'string') return raw
  const err = context?.error
  if (err instanceof Error && typeof err.stack === 'string') return err.stack
  return undefined
}

function extractErrName(context: LogContext | undefined): string | undefined {
  const raw = context?.errName ?? context?.name
  if (typeof raw === 'string') return raw
  const err = context?.error
  if (err instanceof Error) return err.name
  return undefined
}

function detectPlatform(): 'web' | 'electron' {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' && /electron/i.test(navigator.userAgent)) {
      return 'electron'
    }
  } catch {
    // yut — aşağıdaki varsayılana düş
  }
  return 'web'
}

/**
 * Geçerli rota konumu, PARAMETRESİZ (rota adı + eşleşen path deseni — gerçek parametre
 * DEĞERLERİ değil). Dinamik `import('@/router')` — `restapi.ts`'teki AYNI desen (döngüsel
 * bağımlılık önleme, dosya başlığı yorumu).
 */
async function getCurrentRouteLocation(): Promise<string | undefined> {
  try {
    const { default: router } = await import('@/router')
    const current = router?.currentRoute?.value
    if (!current) return undefined
    const name = typeof current.name === 'string' ? current.name : undefined
    const pattern = current.matched?.map(r => r.path).filter(Boolean).join('/') || undefined
    if (name && pattern) return `${name}:${pattern}`
    return name ?? pattern ?? undefined
  } catch {
    return undefined
  }
}

function byteLength(s: string): number {
  try {
    return new TextEncoder().encode(s).length
  } catch {
    return s.length
  }
}

interface ClientLogBody {
  level: ClientLogLevel
  msg: string
  errName?: string
  stack?: string
  route?: string
  appVer?: string
  platform: 'web' | 'electron'
  ts: string
  context?: Record<string, unknown>
}

/** Gövdeyi 8 KB sınırına kademeli olarak sığdırır (önce context, sonra stack, en son msg kırpılır). */
function buildBodyWithinLimit(body: ClientLogBody): string {
  let candidate: ClientLogBody = body
  let json = JSON.stringify(candidate)
  if (byteLength(json) <= MAX_BODY_BYTES) return json

  candidate = { ...candidate, context: undefined }
  json = JSON.stringify(candidate)
  if (byteLength(json) <= MAX_BODY_BYTES) return json

  candidate = { ...candidate, stack: candidate.stack ? clamp(candidate.stack, 500) : undefined }
  json = JSON.stringify(candidate)
  if (byteLength(json) <= MAX_BODY_BYTES) return json

  candidate = { ...candidate, stack: undefined, msg: clamp(candidate.msg, 200) }
  return JSON.stringify(candidate)
}

// Taşkın denetimi (ADR-0017 K3/1.5 ruhu — frontend'de eşdeğeri henüz yoktu, burada eklendi):
// aynı parmak izi 60 sn içinde tekrar gönderilmez (gereksiz ağ trafiği + backend rate limit'ini
// (20/5dk) boşa harcamamak için istemci tarafında ERKEN kesim).
const lastSentAt = new Map<string, number>()

function shouldSuppress(fingerprint: string): boolean {
  const now = Date.now()
  const last = lastSentAt.get(fingerprint)
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) return true
  lastSentAt.set(fingerprint, now)
  // Bellek üst sınırı: makul olmayan büyümeyi önle (tek sayfa oturumunda binlerce farklı hata olası değil).
  if (lastSentAt.size > 500) {
    const oldestKey = lastSentAt.keys().next().value
    if (oldestKey !== undefined) lastSentAt.delete(oldestKey)
  }
  return false
}

/**
 * ADR-0017 Karar 1.8 — `error`/`warn` loglarını `POST /api/client-log`'a gönderir.
 * Fire-and-forget: çağıran BEKLEMEZ, hata/başarı çağırana asla yansımaz (`logger.error/warn`
 * kendi konsol çıktısını zaten üretti — bu yalnızca EK bir sunucu kopyasıdır).
 * - Auth yoksa (401) SESSİZCE yutulur, retry YOK.
 * - Ağ hatası/başka bir HTTP hatası da SESSİZCE yutulur, retry YOK.
 * - Aynı parmak izi 60 sn içinde tekrar GÖNDERİLMEZ (yukarıdaki taşkın denetimi).
 */
export function sendClientLog(level: ClientLogLevel, message: string, context?: LogContext): void {
  if (typeof fetch !== 'function') return // eski/özel ortam (ör. SSR benzeri) — sessizce atla

  const errName = extractErrName(context)
  const fingerprint = `${level}::${errName ?? ''}::${message}`
  if (shouldSuppress(fingerprint)) return

  void (async () => {
    try {
      const route = await getCurrentRouteLocation()
      const body: ClientLogBody = {
        level,
        msg: clamp(redactText(message), MAX_MSG_CHARS),
        errName,
        stack: clampStack(extractStack(context)),
        route,
        // appVer: build zamanında sürüm enjekte eden bir mekanizma YOK (vite.config.mts bu görevin
        // kapsamı dışında -- BAŞKA ajanların çalıştığı build/kabuk dosyalarına dokunulmadı); alan
        // "varsa" gönderilir sözleşmesine uyarak BİLİNÇLİ olarak atlanır.
        platform: detectPlatform(),
        ts: new Date().toISOString(),
        context: sanitizeContext(context),
      }

      const payload = buildBodyWithinLimit(body)

      // reqId KASITLI olarak gönderilmiyor: backend `getRequestId()` (kendi AsyncLocalStorage
      // correlation'ı) HER ZAMAN esas alınır (bkz. clientLog.ts:117); istemcide "son bilinen
      // X-Request-Id"yi güvenilir biçimde yakalamak `restapi.ts`'e (paylaşılan axios interceptor)
      // dokunmayı gerektirirdi (görev kapsamı DIŞI — başka ajanlar orada çalışıyor olabilir).
      await fetch(CLIENT_LOG_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // oturum çerezi (HTTP-only JWT) — kimliksizse backend 401 döner, aşağıda yutulur
        body: payload,
        keepalive: true, // sayfa kapanırken de en iyi çaba ile gönderilsin
      })
      // Yanıt (204/400/401/413) KASITLI olarak İNCELENMEZ: hepsi aynı şekilde sessizce sonlanır,
      // retry YOK (ADR-0017 Karar 1.8 — "basit fire-and-forget").
    } catch {
      // Ağ hatası/reddi: SESSİZCE yut. Kullanıcıya hiçbir şey gösterilmez, yerel log zaten var.
    }
  })()
}
