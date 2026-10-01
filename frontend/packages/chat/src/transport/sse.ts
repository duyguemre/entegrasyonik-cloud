/**
 * `sse` taşıyıcısı (CHAT_UI_CONTRACT.md §3.1) — web (`<api>/api/agent`), backoffice (`<api>/admin-api/agent`) ve
 * Electron masaüstü (aynı web derlemesi, K36) için TEK uygulama; yalnız `baseUrl` farklıdır.
 *
 * - Kimlik çerezle gelir (`credentials: 'include'`); taşıyıcı token taşımaz.
 * - Tur/onay: `POST` + `Accept: text/event-stream`, gövde satır satır ayrıştırılır (`sseParser`), her `data`
 *   `ServerEventSchema.safeParse` ile doğrulanır. Geçersiz olay → `PROTOCOL` hatası (ham içerik loglanmaz/gösterilmez).
 * - SSE başlamadan gelen HTTP hatası → tek `error` olayı (401/403/409/423/429/503 eşlemesi).
 * - Akış `turn.end`/`error` gelmeden kapanırsa → `STREAM_INTERRUPTED` (retryable).
 * - `signal.abort()` = durdur: istek iptal edilir, olay üretilmez.
 */
import { turnErrorMessage } from '../i18n'
import {
  AgentInfoSchema,
  CHAT_ERROR_CODES,
  MoreResultSchema,
  ProviderStatusSchema,
  ProviderTestResultSchema,
  ServerEventSchema,
  type ChatErrorCode,
  type Locale,
  type ServerEvent,
  type TurnError,
} from '../protocol/v1'
import { createSseParser, SseEventTooLargeError } from './sseParser'
import { ChatTransportError, type ChatSetupApi, type ChatTransport } from './types'
import type { z } from 'zod'

export { ChatTransportError }

export interface SseTransportOptions {
  /** Örn. `https://api.entegrasyonik.com/api/agent` (sonda `/` olmadan da olur). */
  baseUrl: string
  fetchImpl?: typeof fetch
  headers?: Record<string, string>
  /** Yedek hata metinlerinin dili (sunucu metni yoksa). */
  locale?: () => Locale
  /**
   * Kurulum YAZMA isteklerine (PUT/DELETE /provider) eklenecek alanlar (backoffice: `{ reason }`, BR-4). Fırlatırsa istek
   * atılmaz ve hata `setup` çağırana iletilir.
   */
  setupWriteExtras?: () => Record<string, unknown>
  /** `401 REAUTH_REQUIRED` (step-up) gelince çağrılır; `true` dönerse istek BİR kez yinelenir (backoffice reauth diyaloğu). */
  reauth?: () => Promise<boolean>
}

/** Backend zarfı `{error, code, requestId}` (ApiManager) -> UI `{message, code, supportCode}`; UI adları da kabul edilir. */
type ErrorEnvelope = { code?: unknown; message?: unknown; error?: unknown; supportCode?: unknown; requestId?: unknown; retryAfterSec?: unknown; upgradeUrl?: unknown }

const RETRYABLE: ReadonlySet<ChatErrorCode> = new Set([
  'RATE_LIMITED', 'MAINTENANCE', 'UNAVAILABLE', 'TIMEOUT', 'STREAM_INTERRUPTED', 'OFFLINE', 'INTERNAL', 'LLM_RATE_LIMITED', 'LLM_UNAVAILABLE',
])
const SETUP_CODES: ReadonlySet<ChatErrorCode> = new Set(['LLM_KEY_INVALID', 'LLM_MODEL_UNAVAILABLE', 'SETUP_REQUIRED'])

function isChatErrorCode(value: unknown): value is ChatErrorCode {
  return typeof value === 'string' && (CHAT_ERROR_CODES as readonly string[]).includes(value)
}

/** HTTP durum + hata zarfı → sohbet hata kodu. Zarftaki kod tanınıyorsa o önceliklidir (ör. 429 QUOTA_EXCEEDED). */
export function mapHttpError(status: number, body: ErrorEnvelope | null): ChatErrorCode {
  const code = body?.code
  if (status === 400 && code === 'PROTOCOL') return 'PROTOCOL'
  if (isChatErrorCode(code)) return code
  if (status === 401) return 'UNAUTHENTICATED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 409) return 'TURN_IN_PROGRESS'
  if (status === 423) return 'LIVE_READONLY'
  if (status === 429) return 'RATE_LIMITED'
  if (status === 503) return 'MAINTENANCE'
  if (status === 504) return 'TIMEOUT'
  if (status === 400 || status === 422) return 'VALIDATION'
  return 'INTERNAL'
}

function safeText(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : undefined
}

function buildError(code: ChatErrorCode, locale: Locale, body?: ErrorEnvelope | null): TurnError {
  const error: TurnError = {
    code,
    // PROTOCOL/UNAUTHENTICATED'de kendi eylem metnimiz ("sayfayı yenileyin") önceliklidir.
    message: (code === 'PROTOCOL' ? undefined : safeText(body?.message ?? body?.error, 300)) ?? turnErrorMessage(code, locale),
    retryable: RETRYABLE.has(code),
  }
  const supportCode = safeText(body?.supportCode ?? body?.requestId, 64)
  if (supportCode) error.supportCode = supportCode
  if (SETUP_CODES.has(code)) error.action = { kind: 'setup' }
  else if (error.retryable) error.action = { kind: 'retry' }
  return error
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return !!signal?.aborted || (error instanceof DOMException && error.name === 'AbortError') || (error as { name?: string })?.name === 'AbortError'
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

async function readEnvelope(response: Response): Promise<ErrorEnvelope | null> {
  try {
    const body = (await response.json()) as unknown
    return body && typeof body === 'object' ? (body as ErrorEnvelope) : null
  } catch {
    return null
  }
}

export function createSseTransport(options: SseTransportOptions): ChatTransport {
  const base = options.baseUrl.replace(/\/+$/, '')
  const doFetch: typeof fetch = options.fetchImpl ?? ((...args) => fetch(...args))
  const locale = options.locale ?? (() => 'tr' as const)

  function init(method: string, body?: unknown, accept = 'application/json', signal?: AbortSignal): RequestInit {
    const headers: Record<string, string> = { Accept: accept, ...options.headers }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    return { method, credentials: 'include', headers, body: body === undefined ? undefined : JSON.stringify(body), signal }
  }

  async function json<S extends z.ZodTypeAny>(path: string, schema: S | null, method = 'GET', body?: unknown, signal?: AbortSignal, retried = false): Promise<z.infer<S>> {
    let response: Response
    try {
      response = await doFetch(`${base}${path}`, init(method, body, 'application/json', signal))
    } catch (error) {
      if (isAbort(error, signal)) throw error
      const code: ChatErrorCode = offline() ? 'OFFLINE' : 'UNAVAILABLE'
      throw new ChatTransportError(code, turnErrorMessage(code, locale()))
    }
    if (!response.ok) {
      const envelope = await readEnvelope(response)
      if (response.status === 401 && envelope?.code === 'REAUTH_REQUIRED' && options.reauth && !retried && (await options.reauth())) {
        return json(path, schema, method, body, signal, true)
      }
      const code = mapHttpError(response.status, envelope)
      const err = buildError(code, locale(), envelope)
      const header = Number(response.headers.get('Retry-After'))
      const fromBody = Number(envelope?.retryAfterSec)
      const retryAfter = Number.isFinite(header) && header > 0 ? header : Number.isFinite(fromBody) && fromBody > 0 ? fromBody : undefined
      throw new ChatTransportError(code, err.message, response.status, err.supportCode, retryAfter)
    }
    if (!schema || response.status === 204) return undefined as z.infer<S>
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new ChatTransportError('PROTOCOL', turnErrorMessage('PROTOCOL', locale()), response.status)
    }
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new ChatTransportError('PROTOCOL', turnErrorMessage('PROTOCOL', locale()), response.status)
    return parsed.data
  }

  async function* stream(path: string, body: unknown, signal: AbortSignal): AsyncGenerator<ServerEvent> {
    let response: Response
    try {
      response = await doFetch(`${base}${path}`, init('POST', body, 'text/event-stream', signal))
    } catch (error) {
      if (isAbort(error, signal)) return
      yield { type: 'error', error: buildError(offline() ? 'OFFLINE' : 'UNAVAILABLE', locale()) }
      return
    }
    if (!response.ok) {
      const envelope = await readEnvelope(response)
      yield { type: 'error', error: buildError(mapHttpError(response.status, envelope), locale(), envelope) }
      return
    }
    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', error: buildError('STREAM_INTERRUPTED', locale()) }
      return
    }
    const decoder = new TextDecoder()
    const parser = createSseParser()
    let finished = false
    // Abort okuyucuyu da iptal eder: bekleyen `read()` hemen döner (gövde sinyale bağlı olmasa bile takılmaz).
    const onAbort = () => {
      reader.cancel().catch(() => undefined)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      while (!finished) {
        let chunk: ReadableStreamReadResult<Uint8Array>
        try {
          chunk = await reader.read()
        } catch (error) {
          if (isAbort(error, signal)) return
          break // bağlantı koptu → aşağıda STREAM_INTERRUPTED
        }
        if (chunk.done || signal.aborted) break
        let frames
        try {
          frames = parser.push(decoder.decode(chunk.value, { stream: true }))
        } catch (error) {
          if (error instanceof SseEventTooLargeError) {
            yield { type: 'error', error: buildError('PROTOCOL', locale()) }
            return
          }
          throw error
        }
        for (const frame of frames) {
          let data: unknown
          try {
            data = JSON.parse(frame.data)
          } catch {
            yield { type: 'error', error: buildError('PROTOCOL', locale()) }
            return
          }
          const parsed = ServerEventSchema.safeParse(data)
          if (!parsed.success) {
            yield { type: 'error', error: buildError('PROTOCOL', locale()) }
            return
          }
          yield parsed.data
          if (parsed.data.type === 'turn.end' || parsed.data.type === 'error') {
            finished = true
            break
          }
        }
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
      if (!finished || signal.aborted) {
        try {
          await reader.cancel()
        } catch {
          /* zaten kapalı */
        }
      }
      reader.releaseLock?.()
    }
    if (!finished && !signal.aborted) yield { type: 'error', error: buildError('STREAM_INTERRUPTED', locale()) }
  }

  const extras = (): Record<string, unknown> => options.setupWriteExtras?.() ?? {}
  const setup: ChatSetupApi = {
    status: (signal) => json('/provider', ProviderStatusSchema, 'GET', undefined, signal),
    // PUT: sunucu önce sağlayıcıyı sınar; başarısızsa 422 + ProviderTestResult -> hata kodu (LLM_*) ile ChatTransportError.
    save: async (req) => json('/provider', ProviderStatusSchema, 'PUT', { ...req, ...extras() }),
    test: (req) => json('/provider/test', ProviderTestResultSchema, 'POST', req),
    // DELETE 204 döner (gövde yok): güncel durum ayrıca okunur.
    remove: async () => {
      await json('/provider', null, 'DELETE', Object.keys(extras()).length ? extras() : undefined)
      return json('/provider', ProviderStatusSchema, 'GET')
    },
    consent: (req) => json('/provider/consent', ProviderStatusSchema, 'POST', req),
  }

  return {
    kind: 'sse',
    info: (signal) => json(`/info?locale=${locale()}`, AgentInfoSchema, 'GET', undefined, signal),
    sendTurn: (req, signal) => stream('/turns', req, signal),
    confirm: (req, signal) => stream('/confirm', req, signal),
    more: (req, signal) => json('/more', MoreResultSchema, 'POST', req, signal),
    reset: async (conversationId) => {
      await json(`/conversations/${encodeURIComponent(conversationId)}`, null, 'DELETE')
    },
    setup,
  }
}
