/**
 * Host arayüzü (CHAT_UI_CONTRACT.md §2): uygulama farkları (bağlantı çözümü, dil, biçim varsayılanları, telemetri, Electron
 * köprüsü) buradan enjekte edilir. Paket `@/` (frontend/src) ya da backoffice'i ASLA içe aktarmaz.
 *
 * Sözleşmeye EKLEMELİ (isteğe bağlı) alanlar — protokol değişikliği değildir, yalnız host sözleşmesi:
 *  - `status(domain, value)`: durum çipinin tonu/etiketi (ör. web `design/status-map.ts`); yoksa nötr çip + ham değer.
 *  - `linkForEntity(ref)`: tablo `entity` hücresini tıklanabilir yapar; yoksa düz metin.
 *  - `settingsLink()`: panel başlığındaki "ayarlar" girişi; yoksa gösterilmez.
 *  - `onUnauthenticated()`: 401 → host oturum akışı (§3.1 "host oturum akışını tetikler").
 */
import { inject, type App, type InjectionKey } from 'vue'
import type { StatusTone } from '@entegrasyonik/ui/components/statusTone'
import type { AppLink, EntityRef, EntityType } from './protocol/v1'

export interface ChatHost {
  /** 'app' | 'backoffice' (Electron masaüstü = 'app', K36) — yalnız görünüm/telemetri ayrımı; güvenlik kararı DEĞİL. */
  surface: 'app' | 'backoffice'
  locale(): 'tr' | 'en'
  /** Uygulama rotası üretir. Bilinmeyen ekran → null (parça düz metin olarak çizilir, tıklanamaz). */
  resolveLink(link: AppLink): { href: string; open(): void } | null
  /** İsteğe bağlı: paket metinlerini uygulama i18n'iyle ezmek için (anahtar `chat.<paket anahtarı>`). */
  t?(key: string, params?: Record<string, unknown>): string | undefined
  /** Biçimlendirme: @entegrasyonik/ui/format kullanılır; host yalnız para birimi/saat dilimi varsayılanını verir. */
  formatDefaults(): { currency: string; timeZone: string }
  /** Telemetri kancası (ADR-0017 logger). PII/sohbet metni GÖNDERİLMEZ; yalnız olay adı + sayısal alanlar. */
  track?(event: ChatTelemetryEvent): void
  /** Yalnız Electron masaüstünde (K36, DESK-04). Web/backoffice'te undefined. v1'de paket yalnız varlığını bildirir. */
  localTools?: LocalToolBridge
  // ---- eklemeli, isteğe bağlı (bkz. dosya başı) ----
  status?(domain: string, value: string): { tone: StatusTone; label: string } | null
  linkForEntity?(entity: EntityRef): AppLink | null
  settingsLink?(): AppLink | null
  onUnauthenticated?(): void
}

/** Electron preload'ın açtığı dar köprü (contextIsolation). Ayrıntı DESK-01/04; v1'de yalnız tip yeri ayrılır. */
export interface LocalToolBridge {
  available(): Promise<string[]> // ör. ['local.files.search', 'local.files.read']
  run(capabilityId: string, input: unknown, signal: AbortSignal): Promise<unknown> // YALNIZ kullanıcı onay kartını onayladıktan sonra çağrılır
}

export type ChatTelemetryEvent =
  | { name: 'chat.open'; via: 'button' | 'palette' | 'shortcut' | 'context' | 'route' }
  | { name: 'chat.turn'; outcome: 'completed' | 'cancelled' | 'failed' | 'awaiting-confirm'; ms: number }
  | { name: 'chat.confirm'; decision: 'approve' | 'reject' | 'expired' }
  | { name: 'chat.link'; entity: EntityType | 'screen' }

export const CHAT_HOST_KEY: InjectionKey<ChatHost> = Symbol('ek-chat-host')

/** Test/önizleme için güvenli varsayılan host (bağlantılar çözülmez). */
export const NULL_HOST: ChatHost = {
  surface: 'app',
  locale: () => 'tr',
  resolveLink: () => null,
  formatDefaults: () => ({ currency: 'TRY', timeZone: 'Europe/Istanbul' }),
}

export function provideChatHost(app: App, host: ChatHost): void {
  app.provide(CHAT_HOST_KEY, host)
}

export function useChatHost(): ChatHost {
  return inject(CHAT_HOST_KEY, NULL_HOST)
}
