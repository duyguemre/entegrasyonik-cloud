/**
 * Sohbet durum makinesi (CHAT_UI_CONTRACT.md §5) — SAF TS, Vue'dan bağımsız. `transition(state, event) → { state, effects }`.
 * Makine olay günlüğü tutmaz; yan etkiler (`effects`) `useChat` tarafından uygulanır. Mesaj listesi `messages.ts`'tedir.
 *
 * Tablodan sapma olmayan kurallar:
 *  - Aynı anda tek tur: `sending/streaming/awaiting-confirm`'de `SEND` reddedilir (durum değişmez, etki yok).
 *  - `RESET` ("Yeni sohbet") sohbet kullanılabilir durumlarda `idle`'a döner; `loading/setup-required/unavailable`'da
 *    listeyi temizler ama durumu KORUR (kurulum/kapalı ekranı sohbeti açmaz).
 *  - `LOAD` tur dışı her durumdan `loading`'e geçirir (panel yeniden açılışı, 5 dk önbellek süresi, "yeniden dene").
 */
import type { AgentInfo, ChatErrorCode, TurnEndStatus, TurnError, UserInput } from '../protocol/v1'

export type ChatStatus = 'loading' | 'setup-required' | 'unavailable' | 'idle' | 'sending' | 'streaming' | 'awaiting-confirm' | 'error'

export interface MachineState {
  status: ChatStatus
  /** `unavailable` nedeni; `LOAD_FAILED` = `info()` alınamadı (ağ) — "yeniden dene" gösterilir. */
  unavailableReason?: 'DISABLED' | 'MAINTENANCE' | 'LOAD_FAILED'
  /** `error` durumundaki tur hatası (retry/dismiss kararı). */
  error?: TurnError
}

export type MachineEvent =
  | { type: 'LOAD' }
  | { type: 'INFO'; info: AgentInfo }
  | { type: 'INFO_FAILED' }
  | { type: 'SETUP_SAVED' }
  | { type: 'OPEN_SETUP' }
  | { type: 'SEND'; input: UserInput }
  | { type: 'TURN_START' }
  | { type: 'PART' }
  | { type: 'DELTA' }
  | { type: 'TURN_END'; status: TurnEndStatus }
  | { type: 'STOP' }
  | { type: 'SERVER_ERROR'; error: TurnError }
  | { type: 'APPROVE' }
  | { type: 'REJECT' }
  | { type: 'EXPIRE' }
  | { type: 'RETRY' }
  | { type: 'DISMISS' }
  | { type: 'RESET' }
  | { type: 'OFFLINE' }
  | { type: 'ONLINE' }

export type MachineEffect =
  | { type: 'fetchInfo' }
  | { type: 'startTurn'; input: UserInput }
  | { type: 'retryTurn' } // son TurnRequest, YENİ clientTurnId ile
  | { type: 'confirm'; decision: 'approve' | 'reject' }
  | { type: 'abort' }
  | { type: 'resetConversation' }
  | { type: 'cancelOpenForms' }
  | { type: 'focus'; target: 'composer' | 'confirm' }
  | { type: 'announce'; kind: 'ready' | 'stopped' | 'error' }
  | { type: 'markMessage'; status: 'complete' | 'cancelled' | 'error' }
  | { type: 'expireConfirm' }

export interface TransitionResult {
  state: MachineState
  effects: MachineEffect[]
}

/** Kurulumu açtıran hata kodları (ErrorPart `action: { kind: 'setup' }`). */
export const SETUP_ERROR_CODES: ReadonlySet<ChatErrorCode> = new Set(['LLM_KEY_INVALID', 'LLM_MODEL_UNAVAILABLE', 'SETUP_REQUIRED'])

export const TURN_STATUSES: ReadonlySet<ChatStatus> = new Set(['sending', 'streaming'])
const CHAT_READY: ReadonlySet<ChatStatus> = new Set(['idle', 'sending', 'streaming', 'awaiting-confirm', 'error'])

export const initialMachineState: MachineState = { status: 'loading' }

const same = (state: MachineState): TransitionResult => ({ state, effects: [] })
const to = (state: MachineState, ...effects: MachineEffect[]): TransitionResult => ({ state, effects })

export function infoToState(info: AgentInfo): MachineState {
  if (info.enabled) return { status: 'idle' }
  if (info.reason === 'SETUP_REQUIRED') return { status: 'setup-required' }
  return { status: 'unavailable', unavailableReason: info.reason === 'MAINTENANCE' ? 'MAINTENANCE' : 'DISABLED' }
}

export function transition(state: MachineState, event: MachineEvent): TransitionResult {
  const s = state.status
  const inTurn = TURN_STATUSES.has(s)

  switch (event.type) {
    case 'LOAD':
      if (inTurn) return same(state)
      return to({ status: 'loading' }, { type: 'fetchInfo' })

    case 'INFO':
      if (s !== 'loading') return same(state)
      return to(infoToState(event.info))

    case 'INFO_FAILED':
      if (s !== 'loading') return same(state)
      return to({ status: 'unavailable', unavailableReason: 'LOAD_FAILED' })

    case 'SETUP_SAVED':
      if (s !== 'setup-required') return same(state)
      return to({ status: 'loading' }, { type: 'fetchInfo' })

    case 'OPEN_SETUP':
      // "herhangi (tur dışı)": kurulum hatasından sonra kullanıcı "Kurulumu aç" dedi; mesaj listesi korunur.
      if (inTurn || s === 'loading') return same(state)
      return to({ status: 'setup-required' })

    case 'SEND':
      if (s === 'idle') return to({ status: 'sending' }, { type: 'cancelOpenForms' }, { type: 'startTurn', input: event.input })
      if (s === 'error') return to({ status: 'sending' }, { type: 'cancelOpenForms' }, { type: 'startTurn', input: event.input })
      return same(state) // tek tur kuralı + sohbet kapalı durumlar

    case 'TURN_START':
      if (s !== 'sending') return same(state)
      return to({ status: 'streaming' })

    case 'PART':
    case 'DELTA':
      if (!inTurn) return same(state)
      return to({ status: 'streaming' })

    case 'TURN_END': {
      if (!inTurn) return same(state)
      switch (event.status) {
        case 'completed':
          return to({ status: 'idle' }, { type: 'markMessage', status: 'complete' }, { type: 'announce', kind: 'ready' }, { type: 'focus', target: 'composer' })
        case 'awaiting-input':
          return to({ status: 'idle' }, { type: 'markMessage', status: 'complete' }, { type: 'announce', kind: 'ready' })
        case 'awaiting-confirm':
          return to({ status: 'awaiting-confirm' }, { type: 'markMessage', status: 'complete' }, { type: 'announce', kind: 'ready' }, { type: 'focus', target: 'confirm' })
        case 'cancelled':
          return to({ status: 'idle' }, { type: 'markMessage', status: 'cancelled' }, { type: 'announce', kind: 'stopped' })
        case 'failed':
          return to(
            { status: 'error', error: { code: 'INTERNAL', message: '', retryable: true } },
            { type: 'markMessage', status: 'error' },
            { type: 'announce', kind: 'error' },
          )
      }
      return same(state)
    }

    case 'STOP':
      if (!inTurn) return same(state)
      return to({ status: 'idle' }, { type: 'abort' }, { type: 'markMessage', status: 'cancelled' }, { type: 'announce', kind: 'stopped' }, { type: 'focus', target: 'composer' })

    case 'SERVER_ERROR':
      if (!inTurn) return same(state)
      return to({ status: 'error', error: event.error }, { type: 'markMessage', status: 'error' }, { type: 'announce', kind: 'error' })

    case 'APPROVE':
    case 'REJECT':
      if (s !== 'awaiting-confirm') return same(state)
      return to({ status: 'sending' }, { type: 'confirm', decision: event.type === 'APPROVE' ? 'approve' : 'reject' })

    case 'EXPIRE':
      if (s !== 'awaiting-confirm') return same(state)
      return to({ status: 'idle' }, { type: 'expireConfirm' }, { type: 'focus', target: 'composer' })

    case 'RETRY':
      if (s !== 'error' || !state.error?.retryable) return same(state)
      return to({ status: 'sending' }, { type: 'retryTurn' })

    case 'DISMISS':
      if (s !== 'error') return same(state)
      return to({ status: 'idle' }, { type: 'focus', target: 'composer' })

    case 'RESET':
      if (!CHAT_READY.has(s)) return to(state, { type: 'resetConversation' })
      return to({ status: 'idle' }, ...(inTurn ? [{ type: 'abort' } as MachineEffect] : []), { type: 'resetConversation' }, { type: 'focus', target: 'composer' })

    case 'OFFLINE':
      if (!CHAT_READY.has(s)) return same(state)
      return to(
        { status: 'error', error: { code: 'OFFLINE', message: '', retryable: false } },
        ...(inTurn ? [{ type: 'abort' } as MachineEffect, { type: 'markMessage', status: 'error' } as MachineEffect] : []),
      )

    case 'ONLINE':
      if (s !== 'error' || state.error?.code !== 'OFFLINE') return same(state)
      return transition(state, { type: 'DISMISS' })
  }
}

/** Composer yazılabilir mi (UI yardımcı). */
export function canCompose(status: ChatStatus): boolean {
  return status === 'idle' || status === 'error'
}
