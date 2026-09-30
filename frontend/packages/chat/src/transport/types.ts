/** `ChatTransport` arayüzü (CHAT_UI_CONTRACT.md §3). Uygulamalar `sse`, testler/dev `mock` kullanır. */
import type {
  AgentInfo,
  ConfirmRequest,
  MoreRequest,
  MoreResult,
  ProviderConsentRequest,
  ProviderSaveRequest,
  ProviderStatus,
  ProviderTestRequest,
  ProviderTestResult,
  ServerEvent,
  TurnRequest,
} from '../protocol/v1'

export interface ChatTransport {
  readonly kind: 'sse' | 'mock'
  /** Özellik durumu + sınırlar + öneriler. Panel açılırken bir kez; 5 dk önbellek (önbellek `useChat`'tedir). */
  info(signal?: AbortSignal): Promise<AgentInfo>
  /** Bir tur başlatır. Olaylar geldikçe yield eder; tur 'turn.end' ya da 'error' ile biter. signal.abort() = durdur. */
  sendTurn(req: TurnRequest, signal: AbortSignal): AsyncIterable<ServerEvent>
  /** Onay kartına karar. Yürütme sonucunu aynı olay biçiminde akıtır (LLM çağrılmaz). */
  confirm(req: ConfirmRequest, signal: AbortSignal): AsyncIterable<ServerEvent>
  /** Tablo 'daha fazla' — LLM'siz, doğrudan okuma. */
  more(req: MoreRequest, signal?: AbortSignal): Promise<MoreResult>
  /** Sunucudaki 60 dk çalışma belleğini siler ("yeni sohbet"). */
  reset(conversationId: string): Promise<void>
  /** BYOK kurulumu (K37). Web: tenant anahtarı; backoffice: platform anahtarı. */
  setup: ChatSetupApi
}

export interface ChatSetupApi {
  status(signal?: AbortSignal): Promise<ProviderStatus>
  save(req: ProviderSaveRequest): Promise<ProviderStatus>
  test(req: ProviderTestRequest): Promise<ProviderTestResult>
  remove(): Promise<ProviderStatus>
  consent(req: ProviderConsentRequest): Promise<ProviderStatus>
}

/** Taşıyıcının `info/more/setup` gibi JSON uçlarında fırlattığı güvenli hata (ham gövde taşımaz). */
export class ChatTransportError extends Error {
  constructor(
    readonly code: import('../protocol/v1').ChatErrorCode,
    message: string,
    readonly status?: number,
    readonly supportCode?: string,
    readonly retryAfterSec?: number,
  ) {
    super(message)
    this.name = 'ChatTransportError'
  }
}
