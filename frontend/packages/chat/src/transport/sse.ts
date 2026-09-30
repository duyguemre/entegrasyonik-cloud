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

export interface SseTransportOptions {
  /** Örn. `https://api.entegrasyonik.com/api/agent` (sonda `/` olmadan da olur). */
  baseUrl: string
  fetchImpl?: typeof fetch
  headers?: Record<string, string>
  /** Yedek hata metinlerinin dili (sunucu metni yoksa). */
  locale?: () => Locale
}

type ErrorEnvelope = { code?: unknown; message?: unknown; supportCode?: unknown; retryAfterSec?: unknown }

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
    message: (code === 'PROTOCOL' ? undefined : safeText(body?.message, 300)) ?? turnErrorMessage(code, locale),
    retryable: RETRYABLE.has(code),
  }
  const supportCode = safeText(body?.supportCode, 64)
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

  async function json<S extends z.ZodTypeAny>(path: string, schema: S | null, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<z.infer<S>> {
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
      const code = mapHttpError(response.status, envelope)
      const err = buildError(code, locale(), envelope)
      const retryAfter = Number(response.headers.get('Retry-After'))
      throw new ChatTransportError(code, err.message, response.status, err.supportCode, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined)
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
    try {
      while (!finished) {
        let chunk: ReadableStreamReadResult<Uint8Array>
        try {
          chunk = await reader.read()
        } catch (error) {
          if (isAbort(error, signal)) return
          break // bağlantı koptu → aşağıda STREAM_INTERRUPTED
        }
        if (chunk.done) break
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

  const setup: ChatSetupApi = {
    status: (signal) => json('/provider', ProviderStatusSchema, 'GET', undefined, signal),
    save: (req) => json('/provider', ProviderStatusSchema, 'PUT', req),
    test: (req) => json('/provider/test', ProviderTestResultSchema, 'POST', req),
    remove: () => json('/provider', ProviderStatusSchema, 'DELETE'),
    consent: (req) => json('/provider/consent', ProviderStatusSchema, 'POST', req),
  }

  return {
    kind: 'sse',
    info: (signal) => json('/info', AgentInfoSchema, 'GET', undefined, signal),
    sendTurn: (req, signal) => stream('/turns', req, signal),
    confirm: (req, signal) => stream('/confirm', req, signal),
    more: (req, signal) => json('/more', MoreResultSchema, 'POST', req, signal),
    reset: async (conversationId) => {
      await json(`/conversations/${encodeURIComponent(conversationId)}`, null, 'DELETE')
    },
    setup,
  }
}
