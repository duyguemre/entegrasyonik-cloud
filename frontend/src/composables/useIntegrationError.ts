/**
 * frontend/src/composables/useIntegrationError.ts
 *
 * Pazaryeri/entegrasyon verisi (kategori ağacı, kategori özellikleri, özellik değerleri) alınamadığında
 * kullanıcıya gösterilecek anlaşılır hata modelini üretir: NE OLDU + OLASI NEDEN + NE YAPMALI + katlanır
 * TEKNİK AYRINTI. Saf TS (Vue bileşeni yok) — `IntegrationErrorPanel.vue`, `integrationStore.load*` ve
 * ürün varyant bileşenleri aynı modeli kullanır.
 *
 * NEDEN GEREKLİ (araştırma, 2026-09-30):
 *  - `restApi.get/post` (composables/restapi.ts) hatada FIRLATMAZ: axios hatasını `resolve(error)` ile
 *    olduğu gibi DÖNER (yani `await restApi.post(...)` bir `AxiosError` nesnesi verebilir; `undefined` yalnız
 *    boş servis adında). Çağıranlar bunu çoğunlukla `resp && resp.length > 0` ile sessizce yutuyordu.
 *  - Backend (`ApiManager.sendError`) hata gövdesini `{ error, service, operation, code?, requestId? }`
 *    döner; 5xx'te ayrıntı SIZMAZ (`error` genel ileti, `code: 'INTERNAL'`). Pazaryeri adaptörlerinin
 *    (yetki reddi, zaman aşımı, 5xx) hataları düz `Error` fırlattığı için HEPSİ istemciye `500 INTERNAL`
 *    olarak gelir → "pazaryeri kimlik bilgisi hatalı" ile "pazaryeri çöktü" AYIRT EDİLEMEZ. Bu yüzden
 *    `auth` YALNIZCA backend'in kendi 401/403'ünü (oturum/izin) temsil eder; 500 metni her iki olasılığı
 *    dürüstçe söyler.
 *  - İstemci tarafında axios zaman aşımı tanımlı DEĞİL (varsayılan 0); `timeout` yalnız şu sinyallerden
 *    türetilir: `ECONNABORTED`/`ETIMEDOUT`, "timeout" iletili axios hatası, HTTP 408/504.
 *
 * DIŞA AÇIK API
 *   type IntegrationErrorKind = 'timeout'|'auth'|'notFound'|'empty'|'server'|'network'|'unknown'
 *   type IntegrationSubject   = 'categories'|'attributes'|'attributeValues'|'generic'
 *   interface IntegrationErrorContext { service; integrationCode?; platformTitle?; subject?; now? }
 *   interface IntegrationErrorInfo { kind; title; cause; action; retryable; canOpenSettings; empty; httpStatus?;
 *                                    service; integrationCode?; requestedAt; errorCode?; requestId?; serverMessage? }
 *   type IntegrationFetchResult<T> = { ok: true; data: T } | { ok: false; error: IntegrationErrorInfo }
 *   isTransportError(resp)                         → resp bir axios hata nesnesi mi
 *   classifyIntegrationError(resp, ctx, opts?)     → sağlıklıysa null, değilse IntegrationErrorInfo
 *   technicalDetails(info)                         → [{ label, value }] (katlanır alan için, sır/PII yok)
 *   toFetchResult(resp, ctx, opts?)                → IntegrationFetchResult<T> (empty da hata sayılır: `empty:true`)
 *   useIntegrationLoad(loader)                     → { status, data, error, loading, run, retry }
 */
import { computed, ref, type Ref } from 'vue'

export type IntegrationErrorKind = 'timeout' | 'auth' | 'notFound' | 'empty' | 'server' | 'network' | 'unknown'
export type IntegrationSubject = 'categories' | 'attributes' | 'attributeValues' | 'generic'

export interface IntegrationErrorContext {
  /** İstek yapılan servis/metot, ör. `IntegrationService/retrieveCategoryAttributesFromIntegration`. */
  service: string
  /** Entegrasyon kodu (`trendyol` …); teknik ayrıntıda ve "Entegrasyon ayarına git"te kullanılır. */
  integrationCode?: string
  /** Kullanıcıya gösterilecek platform adı (`Trendyol`); yoksa "Pazaryeri". */
  platformTitle?: string
  /** Ne yüklenemedi (metinleri belirler). */
  subject?: IntegrationSubject
  /** Test için saat kaynağı. */
  now?: () => Date
}

export interface IntegrationErrorInfo {
  kind: IntegrationErrorKind
  /** NE OLDU (sade dil, başlık). */
  title: string
  /** OLASI NEDEN. */
  cause: string
  /** NE YAPMALI. */
  action: string
  /** "Tekrar dene" anlamlı mı (auth/notFound hariç hep evet; empty için "Yeniden kontrol et"). */
  retryable: boolean
  /** "Entegrasyon ayarına git" önerilir mi (network dışında evet). */
  canOpenSettings: boolean
  /** true → hata değil, boş liste (görsel dil nötr). */
  empty: boolean
  httpStatus?: number
  service: string
  integrationCode?: string
  /** ISO-8601, istek anı. */
  requestedAt: string
  /** Backend hata kodu (`INTERNAL` …), yalnız dize ise. */
  errorCode?: string
  requestId?: string
  /** Backend `error` iletisi (kırpılmış + gizlenmiş); yoksa tanımsız. */
  serverMessage?: string
}

export type IntegrationFetchResult<T> = { ok: true; data: T } | { ok: false; error: IntegrationErrorInfo }

export interface ClassifyOptions {
  /** Başarılı yanıtın dizi olması beklenir (kategori/özellik/değer listeleri). Varsayılan true. */
  expectArray?: boolean
}

// ---------------------------------------------------------------------------------------------
// Metin tablosu (TEK KAYNAK). `{p}` = platform adı. Backend'den gelen kod→mesaj tablosu YOK
// (5xx gövdesi genel); bu yüzden metinler burada, yalnızca ayırt edilebilen sinyale bağlı.
// ---------------------------------------------------------------------------------------------
const SUBJECT_LABEL: Record<IntegrationSubject, { what: string; emptyWhat: string }> = {
  categories: { what: 'kategori listesi', emptyWhat: 'kategori listesi' },
  attributes: { what: 'kategori özellikleri', emptyWhat: 'özellik' },
  attributeValues: { what: 'özellik değerleri', emptyWhat: 'değer' },
  generic: { what: 'bilgiler', emptyWhat: 'veri' },
}

interface Copy { title: string; cause: string; action: string }

function copyFor(kind: IntegrationErrorKind, subject: IntegrationSubject, p: string, status?: number): Copy {
  const what = SUBJECT_LABEL[subject].what
  switch (kind) {
    case 'timeout':
      return {
        title: `${p} yanıt vermedi`,
        cause: `${p} ${what} isteğine zamanında cevap vermedi. Pazaryeri o anda yoğun olabilir ya da bağlantı yavaş olabilir.`,
        action: 'Birkaç saniye bekleyip tekrar deneyin.',
      }
    case 'auth':
      return {
        title: 'Bu işlem için erişim izniniz yok',
        cause: 'Oturumunuzun süresi dolmuş olabilir ya da hesabınızın bu işlem için yetkisi yok.',
        action: 'Sayfayı yenileyip tekrar deneyin. Sürerse hesap yöneticinizden yetki isteyin ve entegrasyon ayarlarını kontrol edin.',
      }
    case 'notFound':
      return {
        title: `${p} ${what} bulunamadı`,
        cause: 'İstenen kayıt artık mevcut değil ya da bu pazaryeri bu bilgiyi sunmuyor.',
        action: 'Farklı bir kategori seçin veya listeyi yenileyin.',
      }
    case 'network':
      return {
        title: 'Sunucuya ulaşılamadı',
        cause: 'İnternet bağlantınız kesilmiş ya da Entegrasyonik sunucusuna şu an erişilemiyor olabilir.',
        action: 'Bağlantınızı kontrol edip tekrar deneyin.',
      }
    case 'server':
      return {
        title: `${p} ${what} şu an alınamadı`,
        cause:
          status === 429
            ? 'Kısa sürede çok fazla istek yapıldı; pazaryeri geçici olarak yavaşlatmış olabilir.'
            : `Sunucu ya da ${p} geçici bir hata verdi. ${p} API anahtarlarının süresi dolmuş veya hatalı olması da aynı sonucu doğurabilir.`,
        action: 'Tekrar deneyin. Sürerse API anahtarlarınızı entegrasyon ayarlarında kontrol edin.',
      }
    case 'empty':
      return {
        title: subject === 'categories' ? `${p} kategori listesi döndürmedi` : `${p} bu ${subject === 'attributeValues' ? 'özellik' : 'kategori'} için ${SUBJECT_LABEL[subject].emptyWhat} döndürmedi`,
        cause:
          subject === 'categories'
            ? `${p} boş bir kategori listesi gönderdi. Entegrasyon bağlantısı eksik olabilir ya da liste geçici olarak boş gelmiş olabilir.`
            : subject === 'attributeValues'
              ? `${p} bu özellik için seçilebilir değer tanımlamamış olabilir.`
              : `${p} bu kategoride tanımlı özellik göndermedi. Kategori özellik istemiyor olabilir ya da entegrasyon henüz veri sağlamıyor olabilir.`,
        action:
          subject === 'categories'
            ? 'Yeniden kontrol edin. Liste yine boşsa entegrasyon ayarlarınızı kontrol edin.'
            : subject === 'attributeValues'
              ? 'Yeniden kontrol edin. Liste yine boşsa bu özellik için değer eşleştirilemez; entegrasyon ayarlarınızı kontrol edin.'
              : 'Farklı bir kategori seçin ya da yeniden kontrol edin. Beklediğiniz özellikler yoksa entegrasyon ayarlarınızı kontrol edin.',
      }
    default:
      return {
        title: `${p} ${what} alınamadı`,
        cause: 'Yanıt beklenen biçimde değildi; nedeni belirlenemedi.',
        action: 'Tekrar deneyin. Sürerse teknik ayrıntıyı destek ekibiyle paylaşın.',
      }
  }
}

// ---------------------------------------------------------------------------------------------
// Sınıflandırma
// ---------------------------------------------------------------------------------------------

/** `restApi` hatada axios hata nesnesini DÖNER; başarılı yanıt verisi ile karıştırmamak için ayırt eder. */
export function isTransportError(resp: any): boolean {
  if (!resp || typeof resp !== 'object' || Array.isArray(resp)) return false
  if (resp.isAxiosError === true) return true
  if (typeof Error !== 'undefined' && resp instanceof Error) return true
  return false
}

const TIMEOUT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ERR_TIMEOUT'])

function kindFromTransport(err: any): { kind: IntegrationErrorKind; status?: number } {
  const status: number | undefined = typeof err?.response?.status === 'number' ? err.response.status : undefined
  const code = typeof err?.code === 'string' ? err.code : ''
  const msg = typeof err?.message === 'string' ? err.message : ''
  if (status === undefined) {
    if (TIMEOUT_CODES.has(code) || /timeout|timed out/i.test(msg)) return { kind: 'timeout' }
    // Yanıt hiç gelmedi (ağ kesildi, CORS/sunucu kapalı, istek iptal): tek dürüst sınıf "ağ".
    return { kind: 'network' }
  }
  if (status === 408 || status === 504) return { kind: 'timeout', status }
  if (status === 401 || status === 403) return { kind: 'auth', status }
  if (status === 404 || status === 410) return { kind: 'notFound', status }
  if (status === 429 || status >= 500) return { kind: 'server', status }
  return { kind: 'unknown', status }
}

/** Sunucu iletisinde sır/PII izi olabilecek parçaları siler; kırpar. */
export function redactMessage(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  let s = raw.replace(/\s+/g, ' ').trim()
  if (!s) return undefined
  s = s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[e-posta]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [gizli]')
    .replace(/\b(api[-_ ]?key|apikey|secret|password|parola|sifre|şifre|token|authorization)\b\s*[:=]\s*\S+/gi, '$1=[gizli]')
    .replace(/[A-Za-z0-9_\-+/=]{28,}/g, '[gizli]')
  return s.length > 160 ? `${s.slice(0, 157)}...` : s
}

function headerOf(err: any, name: string): string | undefined {
  const headers = err?.response?.headers
  if (!headers) return undefined
  const v = headers[name] ?? headers[name.toLowerCase()] ?? (typeof headers.get === 'function' ? headers.get(name) : undefined)
  return typeof v === 'string' && v ? v : undefined
}

function build(kind: IntegrationErrorKind, ctx: IntegrationErrorContext, extra: Partial<IntegrationErrorInfo> = {}): IntegrationErrorInfo {
  const subject = ctx.subject ?? 'generic'
  const platform = ctx.platformTitle || 'Pazaryeri'
  const copy = copyFor(kind, subject, platform, extra.httpStatus)
  const now = (ctx.now ?? (() => new Date()))()
  return {
    kind,
    ...copy,
    retryable: kind !== 'notFound' && kind !== 'auth',
    // Ağ hatasında ayar ekranı çözüm değil; notFound'da da değil.
    canOpenSettings: kind !== 'network' && kind !== 'notFound',
    empty: kind === 'empty',
    service: ctx.service,
    integrationCode: ctx.integrationCode,
    requestedAt: now.toISOString(),
    ...extra,
  }
}

/**
 * `restApi` çağrısının SONUCUNU sınıflandırır.
 *  - Sağlıklı (boş olmayan dizi, ya da `expectArray:false` iken herhangi bir veri) → `null`.
 *  - Boş liste / boş gövde → `kind:'empty'` (hata DEĞİL, ayrı boş durum).
 *  - Axios hata nesnesi → `timeout | auth | notFound | server | network | unknown` (yalnız gerçek sinyalle).
 *  - Beklenmeyen şekil (dizi beklenirken nesne/metin) → `unknown`.
 */
export function classifyIntegrationError(resp: unknown, ctx: IntegrationErrorContext, opts: ClassifyOptions = {}): IntegrationErrorInfo | null {
  const expectArray = opts.expectArray !== false

  if (isTransportError(resp)) {
    const err: any = resp
    const { kind, status } = kindFromTransport(err)
    const data = err?.response?.data
    const errorCode = data && typeof data === 'object' && typeof data.code === 'string' ? data.code : undefined
    const requestId =
      (data && typeof data === 'object' && typeof data.requestId === 'string' ? data.requestId : undefined) ?? headerOf(err, 'X-Request-Id')
    const serverMessage = data && typeof data === 'object' ? redactMessage(data.error) : undefined
    return build(kind, ctx, { httpStatus: status, errorCode, requestId, serverMessage })
  }

  if (resp === undefined || resp === null || resp === '') {
    // Backend, adaptör metodu yoksa `undefined` döner (gövde boş) → "veri gelmedi" (boş durum).
    return expectArray ? build('empty', ctx) : null
  }
  if (expectArray) {
    if (!Array.isArray(resp)) return build('unknown', ctx)
    if (resp.length === 0) return build('empty', ctx)
  }
  return null
}

/** Katlanır "Teknik ayrıntı" satırları. Sır/PII içermez; ham gövde yerine yalnız gizlenmiş kısa ileti. */
export function technicalDetails(info: IntegrationErrorInfo): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = []
  if (info.httpStatus !== undefined) rows.push({ label: 'HTTP durumu', value: String(info.httpStatus) })
  rows.push({ label: 'Servis', value: info.service })
  if (info.integrationCode) rows.push({ label: 'Entegrasyon', value: info.integrationCode })
  rows.push({ label: 'İstek zamanı', value: info.requestedAt })
  if (info.errorCode) rows.push({ label: 'Hata kodu', value: info.errorCode })
  if (info.requestId) rows.push({ label: 'İstek kimliği', value: info.requestId })
  if (info.serverMessage) rows.push({ label: 'Sunucu iletisi', value: info.serverMessage })
  return rows
}

/** `restApi` sonucunu `{ok,data}` / `{ok:false,error}` biçimine çevirir. Boş liste `ok:false` + `error.empty` olur. */
export function toFetchResult<T = any>(resp: unknown, ctx: IntegrationErrorContext, opts: ClassifyOptions = {}): IntegrationFetchResult<T> {
  const error = classifyIntegrationError(resp, ctx, opts)
  if (error) return { ok: false, error }
  return { ok: true, data: resp as T }
}

export type IntegrationLoadStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

/**
 * Bir yükleme fonksiyonunu (ör. `() => integrationStore.loadIntegrationCategoryChoices(code, id)`)
 * durum makinesine sarar: `run()` yükler, `retry()` aynı isteği yeniden yapar. Boş liste `status:'empty'`,
 * gerçek hata `status:'error'` olur; `error` her ikisinde de dolu (`error.empty` ayırt eder).
 */
export function useIntegrationLoad<T>(loader: () => Promise<IntegrationFetchResult<T>>) {
  const status = ref<IntegrationLoadStatus>('idle')
  const data = ref<T | undefined>(undefined) as Ref<T | undefined>
  const error = ref<IntegrationErrorInfo | undefined>(undefined)
  const loading = computed(() => status.value === 'loading')
  let seq = 0

  async function run(): Promise<IntegrationFetchResult<T>> {
    const mine = ++seq
    status.value = 'loading'
    const result = await loader()
    if (mine !== seq) return result // daha yeni bir istek başladı; eski sonuç yok sayılır
    if (result.ok) {
      data.value = result.data
      error.value = undefined
      status.value = 'ready'
    } else {
      data.value = undefined
      error.value = result.error
      status.value = result.error.empty ? 'empty' : 'error'
    }
    return result
  }

  function reset() {
    seq++
    status.value = 'idle'
    data.value = undefined
    error.value = undefined
  }

  return { status, data, error, loading, run, retry: run, reset }
}
