# CHAT_UI_CONTRACT — `@entegrasyonik/chat` önyüz sözleşmesi (bulut görevi girdisi)

Sürüm: 1.0.0 (2026-10-01). Karar: `docs/adr/0034-ortak-sohbet-arayuzu.md` (ADR-0034). Kullanıcı kararı: K21, K36, K37, K17, K03 (`docs/adr/USER_DECISIONS.md`). **K37/K38:** sohbet kullanıcının kendi sağlayıcı anahtarıyla (BYOK) çalışır; anahtar **tenant düzeyinde** (sahip/admin girer, tüm üyeler kullanır); sohbet ancak tenant sahibi veri aktarım bilgilendirmesini onayladıktan sonra açılır; konuşma kaydı saklanmaz.
Backend karşılığı: `docs/AGENT_BROKER_PLAN.md` (BR-1..BR-5). Bu belge önyüzün **backend olmadan** (mock taşıyıcıyla) bitirilebilmesi için yazıldı.

**Kapsam dışı (bu sözleşmede YOK, eklenmez):** kalıcı konuşma geçmişi/sohbet listesi, dosya eki, sesli giriş, çoklu ajan, grafik parçası, model tarafından üretilen düzen (GenUI), backoffice yazma araçları. Bunlar ADR-0034 "sonra" sepetindedir.

---

## 1. Paket yapısı

```
frontend/packages/chat/                 @entegrasyonik/chat  (private, type: module, derleme adımı YOK — kaynak olarak tüketilir)
  package.json                          exports: ".", "./protocol", "./transports/sse", "./transports/mock", "./testing"
  README.md                             kullanım: host + taşıyıcı kurulumu, parça ekleme kuralı
  src/
    index.ts                            genel API (bileşenler, useChat, provideChatHost, CHAT_PRODUCT)
    brand.ts                            CHAT_PRODUCT = { name: 'Otopilot', slug: 'otopilot' } as const   ← ürün adının TEK kaynağı (K17)
    protocol/
      v1.ts                             zod şemaları + çıkarılmış TS tipleri (§4). YALNIZ 'zod' içe aktarır. KANONİK dosya.
      index.ts
    transport/
      types.ts                          ChatTransport arayüzü (§3)
      sse.ts                            createSseTransport({ baseUrl, fetchImpl?, headers? })
      sseParser.ts                      satır tabanlı SSE ayrıştırıcı (POST yanıtı için; EventSource değil)
      mock/
        createMockTransport.ts          senaryolu, deterministik, hız çarpanlı
        scenarios.ts                    §6 senaryoları
    state/
      machine.ts                        saf TS durum makinesi (§5) — Vue'dan bağımsız, birim testli
      useChat.ts                        Vue composable: makine + taşıyıcı + mesaj listesi
    host.ts                             ChatHost arayüzü + provideChatHost/useChatHost (§2)
    markdown/
      renderMarkdown.ts                 markdown-it (html:false) TOKEN → VNode, izinli liste (§4.3)
    components/
      ChatPanel.vue                     başlık + thread + composer; yan panel/tam sayfa kipleri (prop)
      ChatThread.vue                    role="log" liste, otomatik kaydırma (kullanıcı yukarıdaysa kaydırmaz)
      ChatMessage.vue                   rol + parçalar
      ChatComposer.vue                  çok satırlı giriş, gönder/durdur düğmesi, karakter sayacı (4000)
      ChatContextChip.vue               sayfa bağlamı çipi (kaldırılabilir)
      ChatEmptyState.vue                ilk açılış: kısa tanıtım + öneri çipleri
      ChatUnavailable.vue               enabled:false durumları (§3.3)
      ChatProviderSetup.vue             BYOK kurulum formu (§3.4): sağlayıcı, model, anahtar, aktarım onayı, test — panelde ve ayarlar ekranında aynı bileşen
      parts/
        PartText.vue  PartTable.vue  PartKpi.vue  PartConfirm.vue  PartProgress.vue
        PartError.vue PartEntityLink.vue  PartForm.vue  PartUnknown.vue
    i18n/
      tr.ts  en.ts                      paket metinleri; host `t` verirse onu önceler
  tests/                                vitest (+ @vue/test-utils), §9
```

**Bağımlılıklar:** `vue`, `vuetify` (uygulamayla aynı sürüm, peer), `@entegrasyonik/ui` (workspace), `zod@3.25.76` (backend ile **aynı sürüm, tam sabit**), `markdown-it` (MIT; yalnız ayrıştırma). Başka çalışma zamanı bağımlılığı eklenmez.

**Bağımlılık yönü (statik test + eslint `no-restricted-imports`):**
- `packages/chat/**` → `@/…` (frontend/src) ve `backoffice/src/**` **içe aktaramaz**.
- `packages/ui/**` → `@entegrasyonik/chat` **içe aktaramaz**.
- Görsel dil yalnız `@entegrasyonik/ui` token/bileşenlerinden; renk/px literal yok (mandallar `packages/chat/src` kökünü de tarar — mandal betiklerine dördüncü kök eklenir, taban 0).
- `v-html` **yasak** (statik test: `packages/chat/src/**/*.vue` içinde `v-html` sayısı 0).
- "Asistan", "Assistant", "Copilot" dizgeleri `packages/chat/src` ve i18n'de **yasak** (statik test). Ürün adı yalnız `CHAT_PRODUCT.name`'den.

## 2. Host arayüzü (uygulama farkları buradan enjekte edilir)

```ts
// src/host.ts
import type { AppLink, EntityType } from './protocol/v1'

export interface ChatHost {
  /** 'app' | 'backoffice' (Electron masaüstü = 'app', K36) — yalnız görünüm/telemetri ayrımı; güvenlik kararı DEĞİL. */
  surface: 'app' | 'backoffice'
  locale(): 'tr' | 'en'
  /** Uygulama rotası üretir. Bilinmeyen ekran → null (parça düz metin olarak çizilir, tıklanamaz). */
  resolveLink(link: AppLink): { href: string; open(): void } | null
  /** İsteğe bağlı: paket metinlerini uygulama i18n'iyle ezmek için. */
  t?(key: string, params?: Record<string, unknown>): string | undefined
  /** Biçimlendirme: @entegrasyonik/ui/format kullanılır; host yalnız para birimi/saat dilimi varsayılanını verir. */
  formatDefaults(): { currency: string; timeZone: string }
  /** Telemetri kancası (ADR-0017 logger). PII/sohbet metni GÖNDERİLMEZ; yalnız olay adı + sayısal alanlar. */
  track?(event: ChatTelemetryEvent): void
  /** Yalnız Electron masaüstünde (K36, DESK-04). Web/backoffice'te undefined. v1'de paket yalnız varlığını bildirir. */
  localTools?: LocalToolBridge
}

/** Electron preload'ın açtığı dar köprü (contextIsolation). Ayrıntı DESK-01/04; v1'de yalnız tip yeri ayrılır. */
export interface LocalToolBridge {
  available(): Promise<string[]>                       // ör. ['local.files.search', 'local.files.read']
  run(capabilityId: string, input: unknown, signal: AbortSignal): Promise<unknown>  // YALNIZ kullanıcı onay kartını onayladıktan sonra çağrılır
}

export type ChatTelemetryEvent =
  | { name: 'chat.open'; via: 'button' | 'palette' | 'shortcut' | 'context' | 'route' }
  | { name: 'chat.turn'; outcome: 'completed' | 'cancelled' | 'failed' | 'awaiting-confirm'; ms: number }
  | { name: 'chat.confirm'; decision: 'approve' | 'reject' | 'expired' }
  | { name: 'chat.link'; entity: EntityType | 'screen' }

export function provideChatHost(app: import('vue').App, host: ChatHost): void
export function useChatHost(): ChatHost
```

## 3. `ChatTransport` arayüzü

```ts
// src/transport/types.ts
import type {
  TurnRequest, ConfirmRequest, MoreRequest, MoreResult, ServerEvent, AgentInfo,
} from '../protocol/v1'

export interface ChatTransport {
  readonly kind: 'sse' | 'mock'
  /** Özellik durumu + sınırlar + öneriler. Panel açılırken bir kez; 5 dk önbellek. */
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
```

### 3.1 `sse` taşıyıcısı (web ve backoffice)

| İşlem | Web (`baseUrl = <api>/api/agent`) | Backoffice (`baseUrl = <api>/admin-api/agent`) |
|---|---|---|
| `info` | `GET {baseUrl}/info` → JSON `AgentInfo` | aynı |
| `sendTurn` | `POST {baseUrl}/turns`, gövde `TurnRequest`, `Accept: text/event-stream` → SSE | aynı |
| `confirm` | `POST {baseUrl}/confirm`, gövde `ConfirmRequest` → SSE | aynı |
| `more` | `POST {baseUrl}/more`, gövde `MoreRequest` → JSON `MoreResult` | aynı |
| `reset` | `DELETE {baseUrl}/conversations/{id}` → 204 | aynı |
| `setup.status` | `GET {baseUrl}/provider` → `ProviderStatus` | aynı (platform anahtarı) |
| `setup.save` | `PUT {baseUrl}/provider`, gövde `ProviderSaveRequest` | aynı |
| `setup.test` | `POST {baseUrl}/provider/test`, gövde `ProviderTestRequest` | aynı |
| `setup.remove` | `DELETE {baseUrl}/provider` | aynı |
| `setup.consent` | `POST {baseUrl}/provider/consent`, gövde `ProviderConsentRequest` | aynı (platform yöneticisi) |

- `fetch(..., { credentials: 'include' })`. Kimlik çerezle gelir (web `JWT_TOKEN`, backoffice `EK_ADMIN`); taşıyıcı token taşımaz. Electron masaüstü aynı web derlemesini yüklediği için **aynı taşıyıcıyı** aynı çerezle kullanır (K36); ayrı masaüstü taşıyıcısı yoktur.
- SSE çerçevesi: `event: <ad>\ndata: <tek satır JSON>\n\n`. `:` ile başlayan satır nabızdır (15 sn), yok sayılır. `id:`/`retry:` kullanılmaz (tur sürdürülemez; ADR-0034 Karar 5).
- Her `data` `ServerEventSchema.safeParse` ile doğrulanır. Geçersiz olay → tur `error` (`code: 'PROTOCOL'`), ham içerik loglanmaz.
- HTTP hata yanıtı (SSE başlamadan): gövde mevcut hata zarfıdır (`{ code, message, supportCode? }`, `docs/ERROR_CODES.md`); taşıyıcı bunu tek bir `error` olayına çevirir. 401 → `UNAUTHENTICATED` (host oturum akışını tetikler), 409 → `TURN_IN_PROGRESS`, 423 → `LIVE_READONLY`, 429 → `RATE_LIMITED`/`QUOTA_EXCEEDED`, 503 `MAINTENANCE`.
- Akış `turn.end` gelmeden kapanırsa → `error` `{ code: 'STREAM_INTERRUPTED', retryable: true }`.

### 3.2 `mock` taşıyıcısı
`createMockTransport({ scenarios?, speed = 1, clock? })` — §6 senaryolarını kullanıcı metnindeki anahtar sözcükle seçer; eşleşme yoksa "bu demo şu soruları biliyor" metni + öneri çipleri döner. Zamanlama `speed` ile ölçeklenir (`speed: 0` testlerde anında). Dev'de `VITE_CHAT_TRANSPORT=mock` ile seçilir; Playwright varsayılanı mock'tur.

### 3.3 `AgentInfo.enabled === false` durumları
`reason`: `'DISABLED' | 'SETUP_REQUIRED' | 'MAINTENANCE'`.
- `DISABLED` (platform kill-switch) → giriş noktaları (düğme, palet satırı, bağlam girişleri) **gizlenir**; tam sayfa rotası `ChatUnavailable` gösterir.
- `SETUP_REQUIRED` (anahtar yok **ya da** sahip onayı yok) → giriş noktaları **görünür**; panel açılınca durum `setup-required` (§5):
  - anahtar yok + `canConfigure` → `ChatProviderSetup`; anahtar yok + `!canConfigure` → "Otopilot'u kullanmak için yöneticinizin bir yapay zekâ sağlayıcı anahtarı tanımlaması gerekiyor".
  - anahtar var + `consentRequired` + `canConsent` (sahip) → aktarım bilgilendirmesi + "Onaylıyorum"; `!canConsent` → "Hesap sahibinin veri aktarım onayı bekleniyor".
- `MAINTENANCE` → panel açılır, `ChatUnavailable` bakım metniyle.

### 3.4 BYOK kurulumu (K37)
- Kurulum normal bir ayar formudur, **sohbet parçası değildir** (anahtar hiçbir zaman sohbet/LLM kanalından geçmez).
- `ChatProviderSetup` alanları: sağlayıcı (`catalog`'dan: Anthropic, OpenAI, Google), model (seçilen sağlayıcının izinli listesi; `recommended` işaretli olan varsayılan), API anahtarı (`type=password`, `autocomplete=off`, `spellcheck=false`; kayıttan sonra değer **asla geri gösterilmez**, yalnız "Kayıtlı anahtar ••••" + "Değiştir"), anahtarın nereden alınacağı bağlantısı (`keyHelpUrl`, yeni sekme, `rel=noopener noreferrer`), aktarım bilgilendirmesi (`consentText.body` düz metin; herkes görür) + **yalnız sahipte** onay kutusu (admin için "Sahibin onayı gerekecek" notu), "Bağlantıyı test et" ve "Kaydet".
- Akış: test (isteğe bağlı ama önerilir) → kaydet (sunucu kaydetmeden önce yeniden test eder; başarısızsa kaydetmez ve `ProviderTestResult` döner). "Kaldır" anahtarı siler (onay diyaloğu).
- Hata sınıfları kullanıcıya güvenli iletiyle (§4 `ProviderErrorCode`): geçersiz anahtar, sağlayıcı hesabında kota/kredi bitti, sağlayıcı hız sınırı ("N sn sonra"), model yok/erişim yok, sağlayıcıya ulaşılamadı. Ham sağlayıcı yanıtı gösterilmez.
- Sahip onayı ayrı eylemdir (`setup.consent`); "Onayı geri al" sohbeti kapatır (onay diyaloğu). Metin sürümü değişirse `consentRequired` yeniden `true` olur.
- Konuşma kaydı saklanmaz (K38): panelde "Sohbetler kaydedilmez; oturum kapanınca silinir" bilgi satırı.
- Kullanım (`usage`) yalnız bilgi amaçlı gösterilir (bugün/bu ay istek ve token); maliyet hesaplanmaz, uyarı/kesme yok.
- Web'de ayrıca **Ayarlar → Otopilot** ekranı aynı bileşeni barındırır (`screens.ts` ayar girdisi; izin `settings:manage`). Backoffice'te platform ayarları altında aynı bileşen (platform anahtarı; tenant anahtarı backoffice'te hiç görünmez).

## 4. Mesaj protokolü `chat/v1` (TS tanımları — `protocol/v1.ts` bunların zod karşılığıdır)

`protocol/v1.ts` her tipi `z.object(...).strict()` ile tanımlar ve `export type X = z.infer<typeof XSchema>` verir. Aşağıdaki TS tanımları **bağlayıcıdır**; alan adı/opsiyonellik birebir aynı olmalı. Tüm dizgeler için azami uzunluklar zod'da `max()` ile verilir (parantez içinde).

```ts
export const CHAT_PROTOCOL_VERSION = 1 as const

// ---------- Ortak ----------
export type Locale = 'tr' | 'en'
export type EntityType =
  | 'product' | 'variant' | 'order' | 'claim' | 'customer' | 'invoice' | 'shipment'
  | 'integration' | 'question' | 'report'
  | 'tenant' | 'platformJob' | 'logEvent'            // yalnız backoffice
/** Uygulama içi bağlantı. screen = host'un ekran anahtarı (web: screens.ts key). params yalnız teknik kimlik/kapalı enum (PII yok). */
export interface AppLink { screen: string /*≤64*/; params?: Record<string /*≤32*/, string /*≤128*/> /* ≤8 anahtar */ }
export interface EntityRef { type: EntityType; id: string /*≤128*/; label: string /*≤200*/ }

// ---------- İstemci → sunucu ----------
export interface PageContext {
  screen: string                                  // ≤64
  entity?: { type: EntityType; id: string }       // açık kayıt
  selection?: { type: EntityType; ids: string[] } // ≤100 kimlik
  filters?: Record<string, string>                // ≤10; yalnız screens.ts urlParams'ta izinli olanlar
}
export type UserInput =
  | { kind: 'text'; text: string }                                   // 1..4000
  | { kind: 'form'; formId: string; values: Record<string, FormValue> } // form parçası yanıtı
export type FormValue = string | number | boolean | string[] | null

export interface TurnRequest {
  v: 1
  conversationId: string | null   // null = yeni; sunucu turn.start'ta atar (≤64)
  clientTurnId: string            // UUID; aynı tur yeniden gönderilirse sunucu tekrarlamaz (409 TURN_DUPLICATE)
  locale: Locale
  input: UserInput
  context?: PageContext           // kullanıcı çipi kaldırdıysa gönderilmez
  client?: { shell: 'web' | 'electron'; localTools?: string[] /*≤10*/ }  // DESK-04'e kadar sunucu localTools'u yok sayar
}
export interface ConfirmRequest {
  v: 1
  conversationId: string
  pendingActionId: string
  decision: 'approve' | 'reject'
  typedPhrase?: string            // confirmMode === 'typed' ise zorunlu
  idempotencyKey: string          // UUID; kart başına BİR kez üretilir, yeniden denemede aynı
}
export interface MoreRequest { v: 1; token: string /*≤512, opak*/ }
export interface MoreResult { rows: TableRow[]; more: { token: string } | null; total: number | null }

export interface AgentInfo {
  v: 1
  enabled: boolean
  reason?: 'DISABLED' | 'SETUP_REQUIRED' | 'MAINTENANCE'
  setup: { configured: boolean; canConfigure: boolean; consentRequired: boolean; canConsent: boolean; provider?: LlmProviderId; model?: string }
  readOnly: boolean               // LIVE_READONLY / impersonation / backoffice v1 → yazma önerilmez; UI rozet gösterir
  limits: { maxInputChars: number; turnsPerMinute: number }
  suggestions: Array<{ id: string; text: string }>  // ≤6, locale'e göre
}

// ---------- BYOK kurulum DTO'ları (K37) ----------
export type LlmProviderId = 'anthropic' | 'openai' | 'google'
export type ProviderErrorCode = 'LLM_KEY_INVALID' | 'LLM_QUOTA' | 'LLM_RATE_LIMITED' | 'LLM_MODEL_UNAVAILABLE' | 'LLM_UNAVAILABLE'
export interface ProviderCatalogEntry {
  id: LlmProviderId
  label: string                   // 'Anthropic', 'OpenAI', 'Google'
  models: Array<{ id: string; label: string; recommended?: boolean }>   // sunucudaki izinli liste
  keyHelpUrl: string              // sağlayıcının anahtar sayfası (sunucuda sabit)
}
export interface ProviderUsage { requests: number; inputTokens: number; outputTokens: number }
export interface ProviderStatus {
  v: 1
  configured: boolean
  canConfigure: boolean           // web: settings:manage (sahip/admin); backoffice: platform yöneticisi
  consentRequired: boolean        // geçerli metin sürümü için tenant sahibi onayı yok → sohbet kapalı
  canConsent: boolean             // yalnız tenant sahibi (owner); backoffice'te platform yöneticisi
  provider?: LlmProviderId
  model?: string
  apiKey?: 'sensitive'            // kayıtlıysa yalnız bu işaret; değer ASLA dönmez
  lastTest?: { at: string; ok: boolean; code?: ProviderErrorCode }
  consent?: { at: string; byRole: 'owner' | 'platformAdmin'; textVersion: string }   // kişi adı/e-posta dönmez
  usage?: { today: ProviderUsage; month: ProviderUsage }   // yalnız bilgi
  catalog: ProviderCatalogEntry[]
  consentText: { version: string; body: string }           // düz metin, H2 nihai metni gelene kadar taslak
}
export interface ProviderSaveRequest {
  v: 1
  provider: LlmProviderId
  model: string
  apiKey?: string                 // yoksa mevcut anahtar korunur (yalnız model değişimi); ≤ 512
  consent?: { textVersion: string; accepted: true }   // YALNIZ sahip gönderebilir (canConsent); admin gönderirse 403
}
export interface ProviderConsentRequest { v: 1; textVersion: string; decision: 'accept' | 'revoke' }   // sahip; ayrı uç
export interface ProviderTestRequest { v: 1; provider: LlmProviderId; model: string; apiKey?: string /* yoksa kayıtlı anahtarla */ }
export interface ProviderTestResult { ok: boolean; code?: ProviderErrorCode; message: string; retryAfterSec?: number }

// ---------- Parçalar ----------
interface PartBase { id: string /*≤64, tur içinde tekil*/ }

export interface TextPart extends PartBase {
  type: 'text'
  format: 'plain' | 'markdown'    // markdown = §4.3 güvenli alt küme
  text: string                    // ≤20000 (delta'larla büyür)
  streaming?: boolean             // true iken imleç göstergesi; turn.end'de false kabul edilir
}

export type ColumnType = 'text' | 'number' | 'money' | 'percent' | 'date' | 'datetime' | 'status' | 'channel' | 'entity' | 'boolean'
export interface TableColumn {
  key: string                     // ≤64
  label: string                   // ≤80, sunucu locale'e göre verir
  type: ColumnType
  currency?: string               // money için ISO 4217; yoksa host varsayılanı
  statusDomain?: string           // status için @entegrasyonik/ui defineStatusMap alanı ('order','claim','integration'…); bilinmeyen → nötr çip
  align?: 'start' | 'end'         // varsayılan: sayısal türlerde end
  untrusted?: boolean             // serbest metin (ürün adı, müşteri notu): düz metin, 2 satır kırpma, title ile tam metin
}
export type CellValue = string | number | boolean | null | EntityRef
export type TableRow = Record<string, CellValue>
export interface TablePart extends PartBase {
  type: 'table'
  title?: string                  // ≤120
  capabilityId: string            // kaynak yetenek (telemetri/erişilebilirlik başlığı)
  columns: TableColumn[]          // 1..12
  rowKey: string                  // columns içindeki bir key
  rows: TableRow[]                // ≤50
  total: number | null            // bilinen toplam kayıt; null = bilinmiyor
  more: { token: string } | null  // 'Daha fazla göster' → transport.more; toplam gösterim ≤500 satır
  openIn?: AppLink                // 'Ekranda aç' (ör. filtreli sipariş listesi)
}

export interface KpiItem {
  key: string; label: string
  value: number | null
  format: 'number' | 'money' | 'percent'
  currency?: string
  delta?: { value: number; direction: 'up' | 'down' | 'flat'; good: boolean }  // good: yeşil/kırmızı tonu seçer
}
export interface KpiPart extends PartBase { type: 'kpi'; title?: string; items: KpiItem[] /*1..6*/; openIn?: AppLink }

export interface ConfirmPart extends PartBase {
  type: 'confirm'
  pendingActionId: string
  capabilityId: string
  title: string                   // ≤120 "Siparişleri onayla"
  summary: string                 // ≤500 düz metin "3 sipariş Onaylandı durumuna geçecek ve Trendyol'a bildirilecek."
  effect: 'write' | 'destructive'
  risk: 'low' | 'medium' | 'high'
  external: boolean               // true → "Pazaryerine/dış sisteme gönderilir" satırı + ikon
  affected: { count: number; sample: EntityRef[] /*≤10*/ }
  changes?: Array<{ label: string; from?: string; to: string }>  // ≤20 alan farkı
  confirmMode: 'confirm' | 'typed'
  typedPhrase?: string            // typed ise kullanıcının yazacağı ifade ("SİL 12")
  expiresAt: string               // ISO; istemci geri sayım gösterir, bitince 'expired'
  state: 'pending' | 'executing' | 'done' | 'rejected' | 'expired' | 'failed'
  result?: { message: string; openIn?: AppLink }   // done/failed sonrası (deterministik sunucu metni)
}

export interface ProgressPart extends PartBase {
  type: 'progress'
  label: string                   // ≤120 "Siparişler getiriliyor"
  capabilityId?: string
  state: 'running' | 'done' | 'failed' | 'cancelled'
  detail?: string                 // ≤200 "25 kayıt"
}

export type ChatErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'PLAN_REQUIRED' | 'SUBSCRIPTION_RESTRICTED'
  | 'RATE_LIMITED' | 'QUOTA_EXCEEDED' | 'LIVE_READONLY' | 'MAINTENANCE' | 'IMPERSONATION_FORBIDDEN'
  | 'CAPABILITY_DISABLED' | 'VALIDATION' | 'CONFLICT' | 'UNAVAILABLE' | 'TIMEOUT'
  | 'CONFIRM_EXPIRED' | 'TURN_IN_PROGRESS' | 'TURN_DUPLICATE'
  | 'LLM_KEY_INVALID' | 'LLM_QUOTA' | 'LLM_RATE_LIMITED' | 'LLM_MODEL_UNAVAILABLE' | 'LLM_UNAVAILABLE' | 'SETUP_REQUIRED'
  | 'STREAM_INTERRUPTED' | 'PROTOCOL' | 'OFFLINE' | 'INTERNAL'
// LLM_KEY_INVALID / LLM_MODEL_UNAVAILABLE / SETUP_REQUIRED → action { kind:'setup' } (kurulumu aç); LLM_QUOTA → sağlayıcı hesabını kontrol et metni
export interface ErrorPart extends PartBase {
  type: 'error'
  code: ChatErrorCode
  message: string                 // ≤300, kullanıcıya güvenli, eyleme dönük; ham hata/yığın YOK
  supportCode?: string            // corrId (EkErrorState "Destek kodu")
  retryable: boolean
  action?: { kind: 'retry' } | { kind: 'open'; link: AppLink; label: string } | { kind: 'setup' }
}

export interface EntityLinkPart extends PartBase {
  type: 'entity-link'
  entity: EntityRef
  link: AppLink
  description?: string            // ≤300
  fields?: Array<{ label: string; value: string; type?: 'text' | 'money' | 'date' | 'status'; statusDomain?: string }>  // ≤8
}

export type FormField = {
  name: string; label: string; required: boolean; help?: string
} & (
  | { kind: 'text'; maxLength: number /*≤500*/; multiline?: boolean }
  | { kind: 'number'; min?: number; max?: number; step?: number }
  | { kind: 'money'; currency: string; min?: number }
  | { kind: 'select'; options: Array<{ value: string; label: string }> /*≤50*/; multiple?: boolean }
  | { kind: 'date' }
  | { kind: 'boolean' }
  | { kind: 'entity'; entityType: EntityType; multiple?: boolean }   // v1: kimlik metin girişi; seçici sonra
)   // 'password' / sır alanı YOKTUR (ADR-0019 §4.2 credential)
export interface FormPart extends PartBase {
  type: 'form'
  formId: string
  capabilityId: string
  title: string
  fields: FormField[]             // 1..8
  submitLabel: string
  state: 'open' | 'submitted' | 'cancelled' | 'expired'
  expiresAt: string
}

export type Part = TextPart | TablePart | KpiPart | ConfirmPart | ProgressPart | ErrorPart | EntityLinkPart | FormPart
// 'chart' AYRILMIŞ (v1'de yok). İstemci bilinmeyen `type`'ı PartUnknown ile çizer (ileri uyum): PartSchema = discriminatedUnion + catch-all.

// ---------- Sunucu → istemci olayları ----------
export type ServerEvent =
  | { type: 'turn.start'; turnId: string; conversationId: string; messageId: string }
  | { type: 'part'; messageId: string; part: Part }            // id'ye göre ekle/değiştir (upsert)
  | { type: 'delta'; messageId: string; partId: string; text: string }  // yalnız text parçasına ek (≤2000/olay)
  | { type: 'turn.end'; turnId: string; status: 'completed' | 'awaiting-confirm' | 'awaiting-input' | 'cancelled' | 'failed' }
  | { type: 'error'; error: Omit<ErrorPart, 'id' | 'type'> }  // tur düzeyi hata; ardından akış kapanır

// ---------- İstemci tarafı mesaj modeli (protokol değil; useChat durumu) ----------
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'notice'   // notice: "Yeni sohbet başladı", "Bağlam: Sipariş #…"
  createdAt: string
  parts: Part[]
  status: 'streaming' | 'complete' | 'cancelled' | 'error'
}
```

### 4.1 Olay sırası kuralları
- Bir tur: `turn.start` → (0..n `part`/`delta`) → `turn.end` **ya da** `error`. `turn.start` her zaman ilk olaydır.
- `delta` yalnız daha önce `part` ile açılmış `text` parçasına gelir; bilinmeyen `partId` → yok sayılır + telemetri.
- `confirm` akışı `turn.start` göndermez: yalnız ilgili `ConfirmPart`'ın güncellemeleri (`part`), isteğe bağlı bir `text` sonuç parçası ve `turn.end` gelir. `messageId` kartın bulunduğu mesajdır.
- `turn.end: awaiting-confirm` → istemci `awaiting-confirm` durumuna geçer. `awaiting-input` → form açık, durum `idle` (kullanıcı formu ya da yeni metni gönderebilir; yeni metin formu `cancelled` yapar).

### 4.2 Sürüm ve eşitlik
- `v: 1` her istek gövdesinde. Sunucu farklı ana sürümde `400 VALIDATION` + `code: 'PROTOCOL'` döner; istemci "Sayfayı yenileyin" gösterir.
- Eklemeli değişiklik aynı dosyada; kırıcı değişiklik `v2.ts`.
- **`protocol/v1.ts` bulutta değiştirilmez** (ilk yazım hariç). Backend kopyası (`backend/src/operations/agent/protocol/v1.ts`) oluştuktan sonra `tests/protocol-sync.test.ts` iki dosyayı (ilk yorum bloğu hariç) birebir karşılaştırır; bulut backend'e yazamadığı için tek taraflı değişiklik kırmızı olur. Değişiklik ihtiyacı → yerel görev.

### 4.3 Güvenli markdown alt kümesi
İzinli: paragraf, satır sonu, `**kalın**`, `*italik*`, satır içi kod, kod bloğu (dil etiketi yok sayılır, sözdizimi renklendirme yok), sırasız/sıralı liste (derinlik ≤ 2), `###`/`####` başlık (h3/h4 olarak değil, paket stilinde küçük başlık), alıntı.
Yasak (düz metin olarak gösterilir): ham HTML, görsel, bağlantı (`[a](b)` ve çıplak URL **metin** olarak çizilir, tıklanamaz), tablo sözdizimi, dipnot. Uygulama: `markdown-it({ html: false, linkify: false })` ile yalnız `parse()`; token → VNode çevirici izinli listeden; bilinmeyen token → içerik metni.

## 5. Durum makinesi (`state/machine.ts`, saf)

Durumlar: `loading`, `setup-required`, `unavailable`, `idle`, `sending`, `streaming`, `awaiting-confirm`, `error`.

| Durum | Olay | Sonraki | Yan etki |
|---|---|---|---|
| loading | `info` → `enabled` | idle | öneriler gösterilir |
| loading | `info` → `SETUP_REQUIRED` | setup-required | `ChatProviderSetup` ya da "yöneticinize başvurun" |
| loading | `info` → `DISABLED`/`MAINTENANCE` | unavailable | `ChatUnavailable` |
| setup-required | `SETUP_SAVED` (kurulum başarılı) | loading | `info` yeniden alınır |
| herhangi (tur dışı) | `error` kodu `LLM_KEY_INVALID`/`LLM_MODEL_UNAVAILABLE`/`SETUP_REQUIRED` + kullanıcı "Kurulumu aç" | setup-required | mesaj listesi korunur |
| idle | `SEND(text|form)` | sending | kullanıcı mesajı eklenir; composer temizlenir; açık form varsa `cancelled` |
| sending | `turn.start` | streaming | asistan mesajı (`streaming`) eklenir; `conversationId` saklanır |
| sending/streaming | `part` / `delta` | streaming | upsert / ek |
| streaming | `turn.end completed` | idle | mesaj `complete`; odak composer'da kalır |
| streaming | `turn.end awaiting-input` | idle | form parçası açık |
| streaming | `turn.end awaiting-confirm` | awaiting-confirm | odak onay kartının başlığına (§8) |
| streaming | `turn.end cancelled/failed` | idle / error | mesaj `cancelled` / `error` |
| sending/streaming | `STOP` (kullanıcı) | idle | `AbortController.abort()`; mesaj `cancelled`, "Durduruldu" notu |
| sending/streaming | `error` olayı / ağ hatası | error | hata parçası mesaja eklenir |
| awaiting-confirm | `APPROVE` / `REJECT` | sending | `transport.confirm`; kart `executing` (onayda) |
| awaiting-confirm | `EXPIRE` (saat) | idle | kart `expired`; "Süre doldu, yeniden isteyin" |
| error | `RETRY` (retryable) | sending | son `TurnRequest` **yeni** `clientTurnId` ile |
| error | `DISMISS` / `SEND` | idle / sending | — |
| herhangi | `RESET` ("Yeni sohbet") | idle | `transport.reset`; liste temizlenir; notice mesajı |
| herhangi | `OFFLINE` (`navigator.onLine=false`) | error | `OFFLINE`, çevrimiçi olunca `DISMISS` |

Kurallar:
- `awaiting-confirm` iken composer **devre dışı**, yer tutucu: "Devam etmek için işlemi onaylayın ya da reddedin." (ret düğmesi her zaman erişilebilir).
- `sending/streaming` iken gönder düğmesi "Durdur" olur (Esc da durdurur — composer odaktayken).
- Aynı anda tek tur; makine `sending/streaming`'de `SEND`'i reddeder (UI zaten engeller).
- Makine olay günlüğünü tutmaz; test için saf `transition(state, event) → { state, effects[] }` imzası.

## 6. Mock taşıyıcı senaryoları (`transport/mock/scenarios.ts`)

Tetik sözcükleri Türkçe ve küçük harf eşleşmesiyle; her senaryo ayrıca `id` ile doğrudan çağrılabilir (`mock.run('orders-table')` — testler için). Veriler sentetiktir (gerçek müşteri/ürün adı yok).

| id | Tetik | Akış |
|---|---|---|
| `orders-table` | "onay bekleyen", "sipariş" | progress(running "Siparişler getiriliyor") → 400 ms → progress(done "25 kayıt") → table (8 kolon: sipariş no [entity], kanal [channel], müşteri [text, untrusted, maskeli "A*** Y***"], tutar [money], durum [status/order], tarih [datetime], adet [number], kargo [text]; 25 satır, `total: 132`, `more` token'lı) → text markdown kısa özet → `turn.end completed`. `more` 2 kez 25'er satır, 3. çağrıda `more: null`. |
| `sales-kpi` | "satış", "ciro" | progress → kpi (4 öğe; biri `delta down good:false`) → text → completed |
| `approve-orders` | "onayla" | progress → text "3 sipariş için onayınız gerekiyor." → confirm (`effect: write`, `risk: medium`, `external: true`, 3 örnek kayıt, `changes` 1 satır, `expiresAt` +5 dk) → `turn.end awaiting-confirm`. `approve` → part(confirm executing) → 800 ms → part(confirm done, result + openIn) → completed. `reject` → part(confirm rejected) → text "İşlem iptal edildi." → completed. |
| `delete-typed` | "sil" | confirm `effect: destructive`, `risk: high`, `confirmMode: typed`, `typedPhrase: 'SİL 2'` → awaiting-confirm (yanlış ifade → buton pasif) |
| `confirm-expire` | "hızlı onay" | confirm `expiresAt` +10 sn → istemci saatinde `expired` |
| `price-form` | "fiyat güncelle" | text → form (ürün [entity], yeni fiyat [money], kanallar [select multiple]) → `awaiting-input`; gönderilince → confirm akışına bağlanır |
| `entity` | "ürün", "stok" | entity-link (ürün kartı, 4 alan) + text → completed |
| `denied` | "yetki" | `error` olayı `FORBIDDEN`, retryable false, action open (Yetkiler ekranı) |
| `live-readonly` | "pazaryerine gönder" | progress → part error `LIVE_READONLY` ("Salt-okuma kipinde dış sisteme yazılamaz") → completed |
| `rate` | "çok hızlı" | HTTP 429 benzetimi → `error RATE_LIMITED` retryable true |
| `interrupted` | "kopma" | turn.start → 3 delta → akış kapanır (turn.end yok) → taşıyıcı `STREAM_INTERRUPTED` üretir |
| `long-stream` | "rapor", "uzun" | turn.start → text(markdown) 2.500 karakter, ~120 delta, 40 ms aralık (≈5 sn) → completed. Durdur testi için. |
| `unknown-part` | "yeni tür" | `part` `{ type: 'chart', … }` → PartUnknown yedek görünümü |
| `unavailable` | (yapılandırma) | `info()` → `enabled:false, reason:'DISABLED'` |
| `setup-required` | (yapılandırma) | `info()` → `SETUP_REQUIRED`, `canConfigure:true`; `setup.test` anahtar `bad` içeriyorsa `LLM_KEY_INVALID`, `quota` içeriyorsa `LLM_QUOTA`, aksi `ok`; `save` sonrası `info()` `enabled` |
| `setup-no-permission` | (yapılandırma) | `SETUP_REQUIRED`, `canConfigure:false` |
| `consent-pending-owner` | (yapılandırma) | anahtar var, `consentRequired:true`, `canConsent:true` → onay sonrası `enabled` |
| `consent-pending-admin` | (yapılandırma) | anahtar var, `consentRequired:true`, `canConsent:false` → bekleme metni |
| `llm-key-invalid` | "anahtar" | turn.start → `error` `LLM_KEY_INVALID` (action setup) |
| `llm-rate` | "yoğun" | `error` `LLM_RATE_LIMITED`, retryable, "20 sn sonra tekrar deneyin" |
| `read-only` | (yapılandırma) | `info()` → `readOnly:true` (rozet) |
| `fallback` | eşleşme yok | text "Bu demo şu soruları yanıtlar:" + öneriler |

Mock, her olayı yayınlamadan önce `ServerEventSchema.parse` ile doğrular (senaryo hatası testte yakalanır).

## 7. Yerleşim gereksinimleri

### 7.1 Web uygulaması (`frontend/src`)
- **Yan panel** (`ChatPanel mode="side"`): sağda; ≥ 1280 px **push** (içerik daralır, sekme şeridi dahil), < 1280 px **overlay** (scrim yok, içerik tıklanabilir kalır; Esc kapatır). Genişlik varsayılan 400 px, sürükle-boyutlandır 360–560 px; genişlik ve açık/kapalı `localStorage` (kullanıcı+tenant anahtarı).
- **Giriş noktaları:** kabuk üst çubuğunda ürün adı + ikonlu düğme; komut paleti (`EkCommandPalette`) yazılan sorgu için en üstte "`{CHAT_PRODUCT.name}`'a sor: «…»" satırı (Enter ile panel açılır ve metin gönderilir); kısayol `shortcutCatalog.ts`'e yeni girdi (öneri Ctrl/⌘+J — çakışma testi karar verir); ekran/kayıt başlıklarında isteğe bağlı "`{name}`'a sor" (bağlam çipiyle açar).
- **Tam sayfa:** `screens.ts` girdisi (`key: 'chat'`, slug `CHAT_PRODUCT.slug`), `ChatPanel mode="page"`, okunur satır genişliği ≤ 760 px ortalanmış; yan panel açıksa tam sayfaya geçişte aynı konuşma sürer.
- **Mobil (< 768 px):** yalnız tam ekran sayfa; alt kenarda composer, klavye açılınca görünür kalır (`visualViewport`).
- Konuşma durumu uygulama düzeyinde tek örnek (Pinia/`useChat` singleton): sekme/sayfa değişiminde korunur; çıkış, tenant değişimi, impersonation başlangıç/bitişinde sıfırlanır.
- Salt-okuma rozeti: `info.readOnly` → panel başlığında "Salt okuma" çipi.

### 7.1b Kurulum yerleşimi (K37)
- Panelde `setup-required` durumunda panel gövdesi kurulum formudur (sohbet listesi yerine); kaydedince aynı panelde sohbete geçer.
- Ayarlar ekranında "Otopilot" bölümü aynı `ChatProviderSetup`'ı barındırır (durum, test, kullanım bilgisi, kaldır).

### 7.2 Backoffice (`frontend/backoffice/src`)
- Aynı `ChatPanel`, kendi taşıyıcısı (`baseUrl: /admin-api/agent`) ve host'u (backoffice rotaları). Yan panel + tam sayfa; komut paleti varsa aynı satır. Varsayılan `readOnly: true` rozeti (v1).
- Müşteri uygulamasıyla durum/depolama anahtarı paylaşılmaz (`localStorage` öneki `bo:`).

### 7.3 Masaüstü (Electron, K36)
- Ayrı yerel uygulama yok. Electron kabuğu aynı web derlemesini yükler; sohbet web ile birebir aynıdır (aynı `sse` taşıyıcı, aynı yerleşim).
- Yerel araçlar (izinli klasörde belge arama/okuma) BACKLOG DESK-04 ile gelir: host'a isteğe bağlı `localTools` köprüsü (§2) verilir, paket bu köprü varsa `TurnRequest.client.localTools` alanını doldurur. Onay kartı + denetim zorunludur. **Bu sözleşmede uygulama işi yok**; yalnız arayüz yeri ayrılmıştır.

## 8. Erişilebilirlik (C3, WCAG 2.2 AA)
- Mesaj listesi: `role="log"`, `aria-live="polite"`, `aria-relevant="additions"`. Akış sırasında asistan mesajı `aria-busy="true"`; delta'lar tek tek **duyurulmaz**; `turn.end`'de `aria-busy="false"` ve görünmez ayrı canlı bölgeye kısa özet ("Yanıt hazır: tablo, 25 satır"). Hata/durum için ayrı `role="status"` bölgesi.
- Composer: etiketli `textarea` (`aria-label` "`{name}`'a mesaj"), Enter gönderir, Shift+Enter yeni satır, IME birleştirmesi sırasında Enter göndermez (`isComposing`). Karakter sayacı `aria-describedby`.
- Durdur düğmesi akış sırasında odaklanabilir; Esc (composer odakta, metin boşken) paneli kapatır ve odağı açan düğmeye döndürür. Panel açılınca odak composer'a.
- **Onay kartı:** `role="group"` + `aria-labelledby` başlık; `awaiting-confirm`'de odak kart başlığına (programatik, `tabindex="-1"`), **onay düğmesine değil** (yanlışlıkla Enter'ı önler). Düğme metinleri eylemi söyler ("3 siparişi onayla", "Reddet"). Geri sayım görsel; ekran okuyucuya yalnız son 30 sn'de bir kez duyurulur. `typed` kipte giriş alanı etiketli, eşleşmeden onay pasif ve nedeni `aria-describedby`.
- Tablolar gerçek `<table>`: `<caption>` (başlık + kayıt sayısı), `scope="col"`; yatay taşmada kaydırma kabı `tabindex="0"` + etiket. "Daha fazla" düğmesi yeni satırları yükleyince odak ilk yeni satıra.
- Renk tek başına anlam taşımaz (durum çipi metinli, KPI yönü ok + metin). Kontrast token'lardan; dark mode iki temada da axe 0.
- `prefers-reduced-motion`: yazma imleci animasyonu ve kaydırma animasyonu kapalı.
- Tüm metinler i18n (tr/en); sayı/para/tarih `@entegrasyonik/ui/format`.

## 9. Test beklentileri (bulut görevinin çıkış kapısı)
- **Birim (vitest):**
  - `machine.ts`: §5 tablosunun her satırı + yasak geçişler.
  - `sseParser`: parça sınırında bölünmüş satırlar, `\r\n`, çok satırlı `data`, nabız yorumu, boş olay, 1 MB üstü tek olay reddi.
  - `sse` taşıyıcı: `fetch` sahtesiyle HTTP hata eşlemesi (§3.1), `turn.end`'siz kapanış → `STREAM_INTERRUPTED`, abort.
  - `protocol/v1.ts`: her mock olayının şemadan geçmesi; `.strict()` fazla alanı reddeder; bilinmeyen parça türü `PartUnknown`'a düşer; sınır uzunlukları.
  - `renderMarkdown`: `<img src=x onerror=…>`, `<script>`, `[x](javascript:…)`, çıplak URL → hepsi düz metin; izinli öğeler doğru VNode.
  - Her `Part*.vue`: sentetik veriyle render, boş/sınır durumları, `untrusted` kırpma, `resolveLink → null` durumu.
  - Statik: `v-html` = 0, yasak ad dizgeleri = 0, içe aktarma yönü, `CHAT_PRODUCT` dışında ad literal'i yok.
  - `protocol-sync.test.ts`: backend kopyası varsa birebir eşit; yoksa `skip` + açık mesaj.
  - `ChatProviderSetup`: anahtar alanı kayıttan sonra boşalır ve değer DOM'da/depoda kalmaz (`localStorage`/Pinia'ya yazılmaz — test), onay kutusu yalnız `canConsent`'te görünür, sahip değilse `consent` gönderilmez, her `ProviderErrorCode` için ileti, `canConfigure:false` görünümü.
- **Playwright (web + backoffice, mock taşıyıcı):** panel aç/kapa (düğme, kısayol, palet "sor"), `setup-required` → kurulum → test hatası → başarılı kayıt → sohbet, `setup-no-permission`, `consent-pending-owner` → onay → sohbet, `consent-pending-admin`, `llm-key-invalid` → "Kurulumu aç", `orders-table` + daha fazla, `approve-orders` onay ve ret, `delete-typed`, `confirm-expire`, `price-form`, `interrupted` + yeniden dene, `long-stream` + durdur, `unavailable` (giriş noktaları gizli), mobil tam ekran; klavye-yalnız akış (Tab/Enter/Esc); axe 0 (light + dark); görsel tabanlar `*-win32.png` (bulutta `--update-snapshots=missing`, linux tabanları commit'lenmez — kural 7).
- **Mandallar:** style/pattern/no-console/typecheck `packages/chat/src` kökünü tarar, taban 0.
- Gerçek backend'e bağlanan test **yok** (BR-1 sonrası yerelde `sse` taşıyıcı uçtan uca ayrı iş: CHAT-FE-4).

## 10. Bulut görevi sınırları (kural 7)
- Yalnız `frontend/` (ve gerekirse `site/`) yazılır; `backend/`, `docs/adr/` salt-okunur.
- `frontend/packages/ui` içinde değişiklik gerekirse (ör. eksik bir `Ek*` bileşeni) **ayrı küçük commit** ve açıklama; paralel `ui` işleriyle çakışmamak için tercihen `chat` paketinde yerel sarmalayıcı, sonra taşıma.
- `frontend/package-lock.json` değişir (`zod`, `markdown-it`); lisans kontrolü (MIT) PR açıklamasında.
