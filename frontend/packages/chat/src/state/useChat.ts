/**
 * `useChat` — durum makinesi + taşıyıcı + mesaj listesi (CHAT_UI_CONTRACT.md §5). Uygulama düzeyinde TEK örnek
 * (`createChatController` bir kez çağrılır, `provideChat` ile verilir); sekme/sayfa değişiminde konuşma korunur.
 * Çıkış, tenant değişimi, impersonation başlangıç/bitişinde host `dispose()` + yeni örnek (ya da `reset()`) çağırır.
 *
 * Güvenlik notu: API anahtarı bu katmandan HİÇ geçmez (kurulum formu doğrudan `transport.setup` çağırır; §3.4).
 */
import { computed, inject, provide, ref, shallowRef, type ComputedRef, type InjectionKey, type Ref, type ShallowRef } from 'vue'
import { createTranslator, turnErrorMessage, type Translate } from '../i18n'
import type {
  AgentInfo,
  ChatMessage,
  ConfirmPart,
  ConfirmRequest,
  FormPart,
  FormValue,
  PageContext,
  Part,
  ServerEvent,
  TablePart,
  TurnError,
  TurnRequest,
  UserInput,
} from '../protocol/v1'
import type { ChatHost } from '../host'
import type { ChatTransport } from '../transport/types'
import { ChatTransportError } from '../transport/types'
import { canCompose, initialMachineState, transition, type MachineEffect, type MachineEvent, type MachineState } from './machine'
import {
  addErrorPart,
  appendDelta,
  cancelOpenForms,
  ensureAssistant,
  findPendingConfirm,
  finishMessage,
  noticeMessage,
  nowIso,
  setConfirmState,
  setFormState,
  summarizeParts,
  TABLE_ROW_CAP,
  upsertPart,
  userMessage,
} from './messages'

export const INFO_TTL_MS = 5 * 60 * 1000

export interface ChatControllerOptions {
  transport: ChatTransport
  host: ChatHost
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
  newId?: () => string
}

export interface FocusRequest {
  target: 'composer' | 'confirm'
  seq: number
}

export interface ChatController {
  readonly transport: ChatTransport
  readonly host: ChatHost
  readonly t: Translate
  readonly machine: Readonly<Ref<MachineState>>
  readonly status: ComputedRef<MachineState['status']>
  readonly messages: Readonly<ShallowRef<ChatMessage[]>>
  readonly info: Readonly<ShallowRef<AgentInfo | null>>
  readonly canCompose: ComputedRef<boolean>
  readonly readOnly: ComputedRef<boolean>
  readonly maxInputChars: ComputedRef<number>
  /** Kaldırılabilir sayfa bağlamı çipi. `null` = bağlam yok ya da kullanıcı kaldırdı. */
  readonly context: Readonly<Ref<{ value: PageContext; label: string } | null>>
  /** Görünmez canlı bölge (tur sonu kısa özet; delta'lar duyurulmaz). */
  readonly liveMessage: Readonly<Ref<string>>
  readonly focusRequest: Readonly<Ref<FocusRequest | null>>
  ensureLoaded(force?: boolean): Promise<void>
  send(text: string): boolean
  submitForm(part: FormPart, values: Record<string, FormValue>, summary: string): boolean
  stop(): void
  approve(part: ConfirmPart, typedPhrase?: string): void
  reject(part: ConfirmPart): void
  retry(): void
  dismiss(): void
  reset(): Promise<void>
  openSetup(): void
  setupSaved(): void
  loadMore(messageId: string, partId: string): Promise<{ firstNewIndex: number } | null>
  setContext(value: PageContext | null, label?: string): void
  clearContext(): void
  setOnline(online: boolean): void
  dispose(): void
}

function uuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c?.randomUUID) return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

type LastOp = { kind: 'turn'; req: TurnRequest } | { kind: 'confirm'; req: ConfirmRequest; part: ConfirmPart }

export function createChatController(options: ChatControllerOptions): ChatController {
  const { transport, host } = options
  const now = options.now ?? (() => Date.now())
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  const newId = options.newId ?? uuid
  const t = createTranslator(() => host.locale(), host.t?.bind(host))

  const machine = ref<MachineState>({ ...initialMachineState })
  const messages = shallowRef<ChatMessage[]>([])
  const info = shallowRef<AgentInfo | null>(null)
  const context = ref<{ value: PageContext; label: string } | null>(null)
  const liveMessage = ref('')
  const focusRequest = ref<FocusRequest | null>(null)

  let infoAt = 0
  let infoPromise: Promise<void> | null = null
  let conversationId: string | null = null
  let currentMessageId: string | null = null
  let controller: AbortController | null = null
  let lastOp: LastOp | null = null
  let turnStartedAt = 0
  let expireTimer: unknown = null
  let disposed = false
  let focusSeq = 0
  /** Kart başına BİR idempotency anahtarı (yeniden denemede aynı; §4). */
  const idempotencyKeys = new Map<string, string>()

  const status = computed(() => machine.value.status)

  function announce(text: string) {
    // Aynı metin art arda duyurulsun diye önce boşaltılır.
    liveMessage.value = ''
    queueMicrotask(() => (liveMessage.value = text))
  }

  function summary(): string {
    const msg = messages.value.find((m) => m.id === currentMessageId)
    const items = summarizeParts(msg?.parts ?? [])
    if (!items.length) return t('live.summary.text')
    return items
      .map((i) => (i.key === 'table' ? t('live.summary.table', { count: i.count }) : i.key === 'kpi' ? t('live.summary.kpi', { count: i.count }) : t(`live.summary.${i.key}`)))
      .join(', ')
  }

  function outcome(kind: 'completed' | 'cancelled' | 'failed' | 'awaiting-confirm') {
    if (turnStartedAt) host.track?.({ name: 'chat.turn', outcome: kind, ms: Math.max(0, Math.round(now() - turnStartedAt)) })
    turnStartedAt = 0
  }

  function scheduleExpiry() {
    if (expireTimer) clearTimer(expireTimer)
    expireTimer = null
    if (machine.value.status !== 'awaiting-confirm') return
    const card = findPendingConfirm(messages.value)
    if (!card) return
    const ms = Date.parse(card.expiresAt) - now()
    const fire = () => {
      expireTimer = null
      if (machine.value.status === 'awaiting-confirm' && findPendingConfirm(messages.value)?.pendingActionId === card.pendingActionId) {
        messages.value = setConfirmState(messages.value, card.pendingActionId, 'expired')
        host.track?.({ name: 'chat.confirm', decision: 'expired' })
        dispatch({ type: 'EXPIRE' })
      }
    }
    if (ms <= 0) fire()
    else expireTimer = setTimer(fire, Math.min(ms, 2 ** 31 - 1))
  }

  function dispatch(event: MachineEvent) {
    if (disposed) return
    const result = transition(machine.value, event)
    machine.value = result.state
    for (const effect of result.effects) run(effect)
    if (event.type === 'TURN_END' || event.type === 'EXPIRE' || event.type === 'RESET') scheduleExpiry()
  }

  function run(effect: MachineEffect) {
    switch (effect.type) {
      case 'fetchInfo':
        void fetchInfo()
        return
      case 'startTurn':
        startTurn(effect.input)
        return
      case 'retryTurn':
        retryLast()
        return
      case 'confirm':
        return // decide() kendi çağırır (kart + typedPhrase bağlamı gerekli)
      case 'abort':
        controller?.abort()
        controller = null
        return
      case 'resetConversation': {
        const id = conversationId
        conversationId = null
        currentMessageId = null
        lastOp = null
        idempotencyKeys.clear()
        const hadMessages = messages.value.length > 0
        messages.value = hadMessages ? [noticeMessage(newId(), t('message.newConversation'), nowIso(now()))] : []
        if (id) void transport.reset(id).catch(() => undefined)
        return
      }
      case 'cancelOpenForms':
        messages.value = cancelOpenForms(messages.value)
        return
      case 'focus':
        focusRequest.value = { target: effect.target, seq: ++focusSeq }
        return
      case 'announce':
        if (effect.kind === 'ready') announce(t('live.ready', { summary: summary() }))
        else if (effect.kind === 'stopped') announce(t('live.stopped'))
        else announce(machine.value.error?.message || t('error.title'))
        return
      case 'markMessage':
        messages.value = finishMessage(messages.value, currentMessageId, effect.status)
        if (effect.status === 'complete') outcome(machine.value.status === 'awaiting-confirm' ? 'awaiting-confirm' : 'completed')
        else outcome(effect.status === 'cancelled' ? 'cancelled' : 'failed')
        return
      case 'expireConfirm':
        return
    }
  }

  async function fetchInfo() {
    if (infoPromise) return infoPromise
    const ac = new AbortController()
    infoPromise = (async () => {
      try {
        const value = await transport.info(ac.signal)
        info.value = value
        infoAt = now()
        dispatch({ type: 'INFO', info: value })
      } catch (error) {
        if (error instanceof ChatTransportError && error.code === 'UNAUTHENTICATED') host.onUnauthenticated?.()
        dispatch({ type: 'INFO_FAILED' })
      } finally {
        infoPromise = null
      }
    })()
    return infoPromise
  }

  async function ensureLoaded(force = false) {
    const st = machine.value.status
    if (st === 'sending' || st === 'streaming') return
    const stale = !info.value || now() - infoAt > INFO_TTL_MS
    if (!force && !stale && st !== 'loading') return
    if (st === 'awaiting-confirm' && !force) return
    if (infoPromise) return infoPromise
    dispatch({ type: 'LOAD' })
    return infoPromise ?? undefined
  }

  function localTools(): string[] | undefined {
    return undefined // DESK-04: köprü listesi (async) tur başında okunur; v1'de yalnız yer ayrılır.
  }

  function buildRequest(input: UserInput): TurnRequest {
    const req: TurnRequest = { v: 1, conversationId, clientTurnId: newId(), locale: host.locale(), input }
    if (context.value) req.context = context.value.value
    if (host.localTools) {
      const tools = localTools()
      req.client = { shell: 'electron', ...(tools ? { localTools: tools } : {}) }
    }
    return req
  }

  function errorFrom(err: unknown): TurnError {
    if (err instanceof ChatTransportError) {
      return { code: err.code, message: err.message || turnErrorMessage(err.code, host.locale()), retryable: ['RATE_LIMITED', 'UNAVAILABLE', 'TIMEOUT', 'OFFLINE', 'INTERNAL', 'MAINTENANCE'].includes(err.code), ...(err.supportCode ? { supportCode: err.supportCode } : {}) }
    }
    return { code: 'INTERNAL', message: turnErrorMessage('INTERNAL', host.locale()), retryable: true, action: { kind: 'retry' } }
  }

  function handleError(error: TurnError) {
    const withMessage = { ...error, message: error.message || turnErrorMessage(error.code, host.locale()) }
    const messageId = currentMessageId ?? newId()
    currentMessageId = messageId
    messages.value = addErrorPart(messages.value, messageId, withMessage, nowIso(now()), newId())
    if (error.code === 'UNAUTHENTICATED') host.onUnauthenticated?.()
    dispatch({ type: 'SERVER_ERROR', error: withMessage })
  }

  function apply(event: ServerEvent) {
    switch (event.type) {
      case 'turn.start':
        conversationId = event.conversationId
        currentMessageId = event.messageId
        messages.value = ensureAssistant(messages.value, event.messageId, nowIso(now()))
        dispatch({ type: 'TURN_START' })
        return
      case 'part':
        currentMessageId = currentMessageId ?? event.messageId
        messages.value = upsertPart(messages.value, event.messageId, event.part, nowIso(now()))
        dispatch({ type: 'PART' })
        return
      case 'delta': {
        const result = appendDelta(messages.value, event.messageId, event.partId, event.text)
        messages.value = result.messages
        if (!result.ignored) dispatch({ type: 'DELTA' })
        return
      }
      case 'turn.end':
        if (event.status === 'failed') {
          const error: TurnError = { code: 'INTERNAL', message: turnErrorMessage('INTERNAL', host.locale()), retryable: true, action: { kind: 'retry' } }
          messages.value = addErrorPart(messages.value, currentMessageId ?? newId(), error, nowIso(now()), newId())
          dispatch({ type: 'SERVER_ERROR', error })
          return
        }
        dispatch({ type: 'TURN_END', status: event.status })
        return
      case 'error':
        handleError(event.error)
        return
    }
  }

  async function consume(stream: AsyncIterable<ServerEvent>, ac: AbortController) {
    let terminal = false
    try {
      for await (const event of stream) {
        if (ac.signal.aborted || controller !== ac) return
        apply(event)
        if (event.type === 'turn.end' || event.type === 'error') {
          terminal = true
          break
        }
      }
    } catch (error) {
      if (ac.signal.aborted || controller !== ac) return
      terminal = true
      handleError(errorFrom(error))
    }
    if (!terminal && !ac.signal.aborted && controller === ac) {
      handleError({ code: 'STREAM_INTERRUPTED', message: turnErrorMessage('STREAM_INTERRUPTED', host.locale()), retryable: true, action: { kind: 'retry' } })
    }
    if (controller === ac) controller = null
  }

  function runTurn(req: TurnRequest) {
    const ac = new AbortController()
    controller = ac
    currentMessageId = null
    lastOp = { kind: 'turn', req }
    turnStartedAt = now()
    void consume(transport.sendTurn(req, ac.signal), ac)
  }

  function startTurn(input: UserInput) {
    runTurn(buildRequest(input))
  }

  function retryLast() {
    if (!lastOp) return
    if (lastOp.kind === 'turn') runTurn({ ...lastOp.req, conversationId, clientTurnId: newId() })
    else runConfirm(lastOp.req, lastOp.part)
  }

  function runConfirm(req: ConfirmRequest, part: ConfirmPart) {
    const ac = new AbortController()
    controller = ac
    currentMessageId = messages.value.find((m) => m.parts.some((p) => p.id === part.id))?.id ?? null
    lastOp = { kind: 'confirm', req, part }
    turnStartedAt = now()
    void consume(transport.confirm(req, ac.signal), ac)
  }

  function decide(part: ConfirmPart, decision: 'approve' | 'reject', typedPhrase?: string) {
    if (machine.value.status !== 'awaiting-confirm' || !conversationId) return
    if (decision === 'approve' && part.confirmMode === 'typed' && typedPhrase !== part.typedPhrase) return
    if (Date.parse(part.expiresAt) <= now()) {
      scheduleExpiry()
      return
    }
    let key = idempotencyKeys.get(part.pendingActionId)
    if (!key) {
      key = newId()
      idempotencyKeys.set(part.pendingActionId, key)
    }
    const req: ConfirmRequest = { v: 1, conversationId, pendingActionId: part.pendingActionId, decision, idempotencyKey: key, ...(decision === 'approve' && typedPhrase ? { typedPhrase } : {}) }
    host.track?.({ name: 'chat.confirm', decision })
    if (expireTimer) clearTimer(expireTimer)
    expireTimer = null
    dispatch({ type: decision === 'approve' ? 'APPROVE' : 'REJECT' })
    if (decision === 'approve') messages.value = setConfirmState(messages.value, part.pendingActionId, 'executing')
    runConfirm(req, part)
  }

  function send(text: string): boolean {
    const value = text.trim()
    if (!value || value.length > (info.value?.limits.maxInputChars ?? 4000)) return false
    if (!canCompose(machine.value.status)) return false
    const input: UserInput = { kind: 'text', text: value }
    messages.value = [...messages.value, userMessage(newId(), input, nowIso(now()))]
    announce(t('live.sending'))
    dispatch({ type: 'SEND', input })
    return true
  }

  function submitForm(part: FormPart, values: Record<string, FormValue>, formSummary: string): boolean {
    if (!canCompose(machine.value.status) || part.state !== 'open') return false
    if (Date.parse(part.expiresAt) <= now()) {
      messages.value = setFormState(messages.value, part.formId, 'expired')
      return false
    }
    const input: UserInput = { kind: 'form', formId: part.formId, values }
    messages.value = [...setFormState(messages.value, part.formId, 'submitted'), userMessage(newId(), input, nowIso(now()), formSummary)]
    dispatch({ type: 'SEND', input })
    return true
  }

  async function loadMore(messageId: string, partId: string) {
    const msg = messages.value.find((m) => m.id === messageId)
    const part = msg?.parts.find((p) => p.id === partId) as TablePart | undefined
    if (!part || part.type !== 'table' || !part.more) return null
    const result = await transport.more({ v: 1, token: part.more.token })
    const room = Math.max(0, TABLE_ROW_CAP - part.rows.length)
    const rows = [...part.rows, ...result.rows.slice(0, room)]
    const capped = rows.length >= TABLE_ROW_CAP
    const next: TablePart = { ...part, rows, more: capped ? null : result.more, total: result.total ?? part.total }
    messages.value = upsertPart(messages.value, messageId, next as Part, msg!.createdAt)
    return { firstNewIndex: part.rows.length }
  }

  return {
    transport,
    host,
    t,
    machine,
    status,
    messages,
    info,
    canCompose: computed(() => canCompose(machine.value.status)),
    readOnly: computed(() => !!info.value?.readOnly),
    maxInputChars: computed(() => info.value?.limits.maxInputChars ?? 4000),
    context,
    liveMessage,
    focusRequest,
    ensureLoaded,
    send,
    submitForm,
    stop: () => dispatch({ type: 'STOP' }),
    approve: (part, typedPhrase) => decide(part, 'approve', typedPhrase),
    reject: (part) => decide(part, 'reject'),
    retry: () => dispatch({ type: 'RETRY' }),
    dismiss: () => dispatch({ type: 'DISMISS' }),
    async reset() {
      dispatch({ type: 'RESET' })
    },
    openSetup: () => dispatch({ type: 'OPEN_SETUP' }),
    setupSaved: () => {
      info.value = null
      dispatch({ type: 'SETUP_SAVED' })
    },
    loadMore,
    setContext(value, label) {
      context.value = value ? { value, label: label ?? value.screen } : null
    },
    clearContext() {
      context.value = null
    },
    setOnline(online) {
      dispatch({ type: online ? 'ONLINE' : 'OFFLINE' })
      if (!online) {
        const messageId = currentMessageId
        if (messageId && machine.value.status === 'error') {
          messages.value = finishMessage(messages.value, messageId, 'error')
        }
      }
    },
    dispose() {
      controller?.abort()
      controller = null
      if (expireTimer) clearTimer(expireTimer)
      disposed = true
    },
  }
}

export const CHAT_CONTROLLER_KEY: InjectionKey<ChatController> = Symbol('ek-chat-controller')

export function provideChat(controller: ChatController): ChatController {
  provide(CHAT_CONTROLLER_KEY, controller)
  return controller
}

export function useChat(): ChatController {
  const controller = inject(CHAT_CONTROLLER_KEY, null)
  if (!controller) throw new Error('useChat: ChatController sağlanmadı (provideChat / ChatPanel :controller).')
  return controller
}
