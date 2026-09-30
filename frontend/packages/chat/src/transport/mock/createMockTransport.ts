/**
 * `mock` taşıyıcısı (CHAT_UI_CONTRACT.md §3.2, §6): senaryolu, deterministik, hız çarpanlı. Backend olmadan önyüzün
 * tamamını (panel, kurulum, onay akışı, hata durumları) çalıştırır; dev'de `VITE_CHAT_TRANSPORT=mock`, Playwright'ta
 * varsayılan. Her olay yayınlanmadan önce `ServerEventSchema.parse` ile doğrulanır (senaryo hatası testte yakalanır).
 */
import {
  AgentInfoSchema,
  ProviderStatusSchema,
  ServerEventSchema,
  TurnRequestSchema,
  type AgentInfo,
  type ConfirmRequest,
  type LlmProviderId,
  type MoreResult,
  type ProviderCatalogEntry,
  type ProviderErrorCode,
  type ProviderStatus,
  type ProviderTestResult,
  type ServerEvent,
  type TurnRequest,
} from '../../protocol/v1'
import { ChatTransportError, type ChatSetupApi, type ChatTransport } from '../types'
import { DEFAULT_SUGGESTIONS, FALLBACK, matchScenario, SCENARIOS, type MockScenario, type PendingMockAction, type ScenarioContext } from './scenarios'

export type MockConfigId =
  | 'enabled'
  | 'unavailable'
  | 'maintenance'
  | 'setup-required'
  | 'setup-no-permission'
  | 'consent-pending-owner'
  | 'consent-pending-admin'
  | 'read-only'

export const MOCK_CONFIG_IDS: readonly MockConfigId[] = [
  'enabled', 'unavailable', 'maintenance', 'setup-required', 'setup-no-permission', 'consent-pending-owner', 'consent-pending-admin', 'read-only',
]

export interface MockClock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export const systemClock: MockClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

export interface MockTransportOptions {
  /** `info()`/kurulum başlangıç yapılandırması (§6 "(yapılandırma)" satırları). */
  config?: MockConfigId
  scenarios?: MockScenario[]
  /** Zaman çarpanı: 1 = gerçek süreler, 0 = anında (testler). */
  speed?: number
  clock?: MockClock
  suggestions?: Array<{ id: string; text: string }>
}

export interface MockTransport extends ChatTransport {
  readonly kind: 'mock'
  /** Senaryoyu doğrudan çalıştırır (testler: `mock.run('orders-table')`). */
  run(scenarioId: string, req?: Partial<TurnRequest>, signal?: AbortSignal): AsyncIterable<ServerEvent>
  /** Test/tanılama: sunucu tarafı kurulum durumu. */
  readonly state: MockServerState
}

export interface MockServerState {
  disabled: boolean
  maintenance: boolean
  readOnly: boolean
  configured: boolean
  canConfigure: boolean
  consentRequired: boolean
  canConsent: boolean
  provider?: LlmProviderId
  model?: string
  lastTest?: ProviderStatus['lastTest']
  consent?: ProviderStatus['consent']
}

export const MOCK_CATALOG: ProviderCatalogEntry[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    models: [
      { id: 'anthropic-demo-balanced', label: 'Dengeli model (demo)', recommended: true },
      { id: 'anthropic-demo-fast', label: 'Hızlı model (demo)' },
    ],
    keyHelpUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: [
      { id: 'openai-demo-balanced', label: 'Dengeli model (demo)', recommended: true },
      { id: 'openai-demo-fast', label: 'Hızlı model (demo)' },
    ],
    keyHelpUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'google',
    label: 'Google',
    models: [
      { id: 'google-demo-balanced', label: 'Dengeli model (demo)', recommended: true },
      { id: 'google-demo-fast', label: 'Hızlı model (demo)' },
    ],
    keyHelpUrl: 'https://aistudio.google.com/app/apikey',
  },
]

export const MOCK_CONSENT_TEXT = {
  version: '2026-10-01-taslak',
  body:
    'Sohbet sırasında sorduğunuz sorular ve bu sorulara yanıt vermek için okunan hesap verileriniz (ör. sipariş, ürün, stok bilgileri; ' +
    'kişisel veriler maskelenerek) seçtiğiniz yapay zekâ sağlayıcısına gönderilir. Sağlayıcı bu verileri yurt dışındaki sunucularında ' +
    'işleyebilir. Entegrasyonik konuşmaları kalıcı olarak saklamaz. Bu metin taslaktır; nihai hukuki metin yayımlandığında yeniden onayınız istenir.',
}

function initialState(config: MockConfigId): MockServerState {
  const base: MockServerState = {
    disabled: false,
    maintenance: false,
    readOnly: false,
    configured: true,
    canConfigure: true,
    consentRequired: false,
    canConsent: true,
    provider: 'anthropic',
    model: 'anthropic-demo-balanced',
    consent: { at: '2026-09-30T08:00:00.000Z', byRole: 'owner', textVersion: MOCK_CONSENT_TEXT.version },
    lastTest: { at: '2026-09-30T08:00:00.000Z', ok: true },
  }
  switch (config) {
    case 'unavailable':
      return { ...base, disabled: true }
    case 'maintenance':
      return { ...base, maintenance: true }
    case 'read-only':
      return { ...base, readOnly: true }
    case 'setup-required':
      return { ...base, configured: false, provider: undefined, model: undefined, consent: undefined, lastTest: undefined, consentRequired: true }
    case 'setup-no-permission':
      return { ...base, configured: false, canConfigure: false, canConsent: false, provider: undefined, model: undefined, consent: undefined, lastTest: undefined, consentRequired: true }
    case 'consent-pending-owner':
      return { ...base, consentRequired: true, consent: undefined }
    case 'consent-pending-admin':
      return { ...base, consentRequired: true, canConsent: false, consent: undefined }
    default:
      return base
  }
}

const abortError = () => {
  const err = new Error('aborted')
  err.name = 'AbortError'
  return err
}

const PROVIDER_ERROR_TEXT: Record<ProviderErrorCode, string> = {
  LLM_KEY_INVALID: 'Anahtar geçersiz ya da iptal edilmiş.',
  LLM_QUOTA: 'Sağlayıcı hesabında kredi/kota kalmamış.',
  LLM_RATE_LIMITED: 'Sağlayıcı istek sınırında.',
  LLM_MODEL_UNAVAILABLE: 'Model bu anahtarla kullanılamıyor.',
  LLM_UNAVAILABLE: 'Sağlayıcıya ulaşılamıyor.',
}

/** Sahte anahtar sınaması (§6 setup-required): `bad` → geçersiz, `quota` → kota, `rate` → hız sınırı, `model` → model yok, `down` → ulaşılamıyor. */
export function mockKeyCheck(apiKey: string | undefined): ProviderTestResult {
  const key = (apiKey ?? '').toLowerCase()
  const fail = (code: ProviderErrorCode, extra: Partial<ProviderTestResult> = {}): ProviderTestResult => ({ ok: false, code, message: PROVIDER_ERROR_TEXT[code], ...extra })
  if (key.includes('bad')) return fail('LLM_KEY_INVALID')
  if (key.includes('quota')) return fail('LLM_QUOTA')
  if (key.includes('rate')) return fail('LLM_RATE_LIMITED', { retryAfterSec: 20 })
  if (key.includes('model')) return fail('LLM_MODEL_UNAVAILABLE')
  if (key.includes('down')) return fail('LLM_UNAVAILABLE')
  return { ok: true, message: 'Bağlantı başarılı.' }
}

export function createMockTransport(options: MockTransportOptions = {}): MockTransport {
  const speed = options.speed ?? 1
  const clock = options.clock ?? systemClock
  const scenarios = options.scenarios ?? SCENARIOS
  const suggestions = options.suggestions ?? DEFAULT_SUGGESTIONS
  const state: MockServerState = initialState(options.config ?? 'enabled')
  const pending = new Map<string, PendingMockAction>()
  const moreTokens = new Map<string, () => MoreResult>()
  let seq = 0
  let conversationSeq = 0

  const nextId = (prefix: string) => `${prefix}-${++seq}`

  function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError())
    if (speed <= 0 || ms <= 0) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const handle = clock.setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, ms * speed)
      const onAbort = () => {
        clock.clearTimeout(handle)
        reject(abortError())
      }
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  function setupIncomplete() {
    return !state.configured || state.consentRequired
  }

  function info(): AgentInfo {
    const reason = state.disabled ? 'DISABLED' : state.maintenance ? 'MAINTENANCE' : setupIncomplete() ? 'SETUP_REQUIRED' : undefined
    return AgentInfoSchema.parse({
      v: 1,
      enabled: !reason,
      ...(reason ? { reason } : {}),
      setup: {
        configured: state.configured,
        canConfigure: state.canConfigure,
        consentRequired: state.consentRequired,
        canConsent: state.canConsent,
        ...(state.provider ? { provider: state.provider } : {}),
        ...(state.model ? { model: state.model } : {}),
      },
      readOnly: state.readOnly,
      limits: { maxInputChars: 4000, turnsPerMinute: 10 },
      suggestions: suggestions.slice(0, 6),
    })
  }

  function status(): ProviderStatus {
    return ProviderStatusSchema.parse({
      v: 1,
      configured: state.configured,
      canConfigure: state.canConfigure,
      consentRequired: state.consentRequired,
      canConsent: state.canConsent,
      ...(state.provider ? { provider: state.provider } : {}),
      ...(state.model ? { model: state.model } : {}),
      ...(state.configured ? { apiKey: 'sensitive' } : {}),
      ...(state.lastTest ? { lastTest: state.lastTest } : {}),
      ...(state.consent ? { consent: state.consent } : {}),
      ...(state.configured
        ? { usage: { today: { requests: 14, inputTokens: 18250, outputTokens: 4120 }, month: { requests: 212, inputTokens: 288400, outputTokens: 61230 } } }
        : {}),
      catalog: MOCK_CATALOG,
      consentText: MOCK_CONSENT_TEXT,
    })
  }

  /** Olay doğrulama + iptal + "turn.end'siz kapanış → STREAM_INTERRUPTED" (sse taşıyıcısıyla aynı sözleşme). */
  async function* guard(source: AsyncGenerator<ServerEvent>, signal: AbortSignal): AsyncGenerator<ServerEvent> {
    let emitted = false
    let terminal = false
    try {
      for await (const event of source) {
        if (signal.aborted) return
        const checked = ServerEventSchema.parse(event)
        emitted = true
        yield checked
        if (checked.type === 'turn.end' || checked.type === 'error') {
          terminal = true
          return
        }
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError' || signal.aborted) return
      throw error
    }
    if (!terminal && emitted && !signal.aborted) {
      yield { type: 'error', error: { code: 'STREAM_INTERRUPTED', message: 'Yanıt yarıda kaldı — yeniden deneyin.', retryable: true, action: { kind: 'retry' } } }
    }
  }

  function context(req: TurnRequest, signal: AbortSignal, conversationId: string): ScenarioContext {
    return {
      sleep: (ms) => sleep(ms, signal),
      now: () => clock.now(),
      nextId,
      turnId: nextId('turn'),
      messageId: nextId('msg'),
      conversationId,
      registerPending: (action) => pending.set(action.pendingActionId, action),
      registerMore: (token, page) => moreTokens.set(token, page),
      suggestions,
    }
  }

  function errorOnly(code: 'SETUP_REQUIRED' | 'VALIDATION' | 'MAINTENANCE', message: string): AsyncGenerator<ServerEvent> {
    return (async function* () {
      yield { type: 'error', error: { code, message, retryable: code === 'MAINTENANCE', ...(code === 'SETUP_REQUIRED' ? { action: { kind: 'setup' as const } } : {}) } }
    })()
  }

  function sendTurn(raw: TurnRequest, signal: AbortSignal): AsyncIterable<ServerEvent> {
    const parsed = TurnRequestSchema.safeParse(raw)
    if (!parsed.success) return guard(errorOnly('VALIDATION', 'İstek geçersiz.'), signal)
    const req = parsed.data
    if (state.maintenance) return guard(errorOnly('MAINTENANCE', 'Bakım çalışması sürüyor.'), signal)
    if (state.disabled || setupIncomplete()) return guard(errorOnly('SETUP_REQUIRED', 'Kurulum tamamlanmamış.'), signal)
    const conversationId = req.conversationId ?? `conv-mock-${++conversationSeq}`
    let scenario: MockScenario | undefined
    if (req.input.kind === 'text') scenario = matchScenario(req.input.text, scenarios)
    else {
      const formId = req.input.formId
      const owner = scenarios.find((s) => s.formIds?.includes(formId))
      if (owner?.runForm) return guard(owner.runForm(context(req, signal, conversationId)), signal)
    }
    return guard((scenario ?? FALLBACK).run(context(req, signal, conversationId)), signal)
  }

  function confirm(req: ConfirmRequest, signal: AbortSignal): AsyncIterable<ServerEvent> {
    const action = pending.get(req.pendingActionId)
    const turnId = nextId('turn')
    const ctx = { sleep: (ms: number) => sleep(ms, signal), nextId, turnId }
    return guard(
      (async function* (): AsyncGenerator<ServerEvent> {
        if (!action) {
          yield { type: 'error', error: { code: 'CONFIRM_EXPIRED', message: 'Onay süresi doldu — işlemi yeniden isteyin.', retryable: false } }
          return
        }
        if (Date.parse(action.part.expiresAt) <= clock.now()) {
          pending.delete(req.pendingActionId)
          yield { type: 'part', messageId: action.messageId, part: { ...action.part, state: 'expired' } }
          yield { type: 'error', error: { code: 'CONFIRM_EXPIRED', message: 'Onay süresi doldu — işlemi yeniden isteyin.', retryable: false } }
          return
        }
        if (req.decision === 'approve' && action.part.confirmMode === 'typed' && req.typedPhrase !== action.part.typedPhrase) {
          yield { type: 'error', error: { code: 'VALIDATION', message: 'Onay ifadesi eşleşmedi.', retryable: false } }
          return
        }
        pending.delete(req.pendingActionId) // tek kullanımlık (sunucudaki GETDEL gibi)
        yield* req.decision === 'approve' ? action.approve(ctx) : action.reject(ctx)
      })(),
      signal,
    )
  }

  async function more(req: { token: string }, signal?: AbortSignal): Promise<MoreResult> {
    await sleep(300, signal)
    const page = moreTokens.get(req.token)
    if (!page) throw new ChatTransportError('VALIDATION', 'Bu liste artık kullanılamıyor — soruyu yeniden sorun.', 400)
    moreTokens.delete(req.token)
    return page()
  }

  const setup: ChatSetupApi = {
    async status(signal) {
      await sleep(200, signal)
      return status()
    },
    async test(req) {
      await sleep(500)
      const result = req.apiKey || state.configured ? mockKeyCheck(req.apiKey) : mockKeyCheck('bad')
      state.lastTest = { at: new Date(clock.now()).toISOString(), ok: result.ok, ...(result.code ? { code: result.code } : {}) }
      return result
    },
    async save(req) {
      await sleep(500)
      if (!state.canConfigure) throw new ChatTransportError('FORBIDDEN', 'Bu ayarı değiştirme yetkiniz yok.', 403)
      if (req.consent && !state.canConsent) throw new ChatTransportError('FORBIDDEN', 'Onayı yalnız hesap sahibi verebilir.', 403)
      if (!req.apiKey && !state.configured) throw new ChatTransportError('LLM_KEY_INVALID', PROVIDER_ERROR_TEXT.LLM_KEY_INVALID, 400)
      // Sunucu kaydetmeden önce yeniden sınar; başarısızsa kaydetmez.
      const check = req.apiKey ? mockKeyCheck(req.apiKey) : { ok: true, message: '' }
      state.lastTest = { at: new Date(clock.now()).toISOString(), ok: check.ok, ...(check.code ? { code: check.code } : {}) }
      if (!check.ok) throw new ChatTransportError(check.code ?? 'LLM_UNAVAILABLE', check.message, 400, undefined, check.retryAfterSec)
      state.configured = true
      state.provider = req.provider
      state.model = req.model
      if (req.consent?.accepted && req.consent.textVersion === MOCK_CONSENT_TEXT.version) {
        state.consentRequired = false
        state.consent = { at: new Date(clock.now()).toISOString(), byRole: 'owner', textVersion: req.consent.textVersion }
      }
      return status()
    },
    async remove() {
      await sleep(300)
      if (!state.canConfigure) throw new ChatTransportError('FORBIDDEN', 'Bu ayarı değiştirme yetkiniz yok.', 403)
      state.configured = false
      state.provider = undefined
      state.model = undefined
      state.lastTest = undefined
      return status()
    },
    async consent(req) {
      await sleep(300)
      if (!state.canConsent) throw new ChatTransportError('FORBIDDEN', 'Onayı yalnız hesap sahibi verebilir.', 403)
      if (req.decision === 'accept') {
        state.consentRequired = false
        state.consent = { at: new Date(clock.now()).toISOString(), byRole: 'owner', textVersion: req.textVersion }
      } else {
        state.consentRequired = true
        state.consent = undefined
      }
      return status()
    },
  }

  return {
    kind: 'mock',
    state,
    async info(signal) {
      await sleep(250, signal)
      return info()
    },
    sendTurn,
    confirm,
    more,
    async reset(conversationId) {
      void conversationId
      pending.clear()
      moreTokens.clear()
    },
    setup,
    run(scenarioId, partial = {}, signal = new AbortController().signal) {
      const scenario = scenarioId === 'fallback' ? FALLBACK : scenarios.find((s) => s.id === scenarioId)
      if (!scenario) throw new Error(`Bilinmeyen mock senaryosu: ${scenarioId}`)
      const req: TurnRequest = { v: 1, conversationId: null, clientTurnId: '00000000-0000-4000-8000-000000000000', locale: 'tr', input: { kind: 'text', text: scenarioId }, ...partial }
      return guard(scenario.run(context(req, signal, req.conversationId ?? `conv-mock-${++conversationSeq}`)), signal)
    },
  }
}

